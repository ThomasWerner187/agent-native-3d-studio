import type { ToolContext } from './tools';
import type { SceneActor } from './store';
import { scatterHistory } from './scatter-history';
import { toast, pushLog } from './ui';
import { addCreativeRequest, clearCreativeRequests } from './creative-requests';

type Call = (tool: string, args?: Record<string, unknown>) => Promise<string>;
interface Actions {
  startEmpty(): Promise<void>;
  stopTour(): void;
}
interface Result { ok: boolean; error?: string; applied?: boolean; result?: { id?: string } }

const actorLabel = (actor: SceneActor) => ({ human: 'You', agent: 'Agent', demo: 'Local demo', unknown: 'Existing scene' })[actor];

/** Human controls and agent handoff read the same live registry as WebMCP. */
export function initCollaborationUI(ctx: ToolContext, call: Call, actions: Actions): void {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const fields = ['selection-x', 'selection-z', 'selection-rotation', 'selection-scale'];
  const controls = document.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
    '[data-add-object], #scene-empty, .selection-fields input, #selection-delete',
  );
  let pending = false;

  async function takeOver(): Promise<void> {
    actions.stopTour();
    ctx.lofi.humanTakeover();
    // A paused preset may still own unfinished construction. Keep its live
    // objects, but release that background session before editing them.
    if (ctx.lofi.building) await call('control_lofi', { action: 'stop' });
  }

  async function edit(work: () => Promise<void>): Promise<void> {
    if (pending) return;
    pending = true;
    update();
    try {
      await takeOver();
      await work();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'That change could not be applied. Try again.');
    } finally {
      pending = false;
      update();
    }
  }

  async function run(tool: string, args: Record<string, unknown> = {}): Promise<Result> {
    const result = JSON.parse(await call(tool, { ...args, expected_scene_version: ctx.store.version })) as Result;
    if (!result.ok) throw new Error(result.error ?? 'That change could not be applied. Try again.');
    if (result.applied === false) toast('You took over before the change finished. The live position was kept.');
    return result;
  }

  el<HTMLButtonElement>('scene-empty').addEventListener('click', () => void edit(async () => {
    await actions.startEmpty();
    clearCreativeRequests();
  }));

  const requestForm = el<HTMLFormElement>('creative-request-form');
  const requestInput = el<HTMLTextAreaElement>('creative-request');
  const requestStatus = el('request-status');
  requestForm.addEventListener('submit', event => {
    event.preventDefault();
    if (!requestInput.value.trim()) { requestInput.focus(); return; }
    const request = addCreativeRequest(requestInput.value, ctx.store.version, ctx.store.selectedId);
    pushLog({ tool: 'creative_request', args: { text: request.text }, ok: true, actor: 'human', time: new Date() });
    requestStatus.textContent = 'Idea ready. Ask your connected browser agent to continue with it.';
    requestInput.value = '';
    requestInput.placeholder = 'What would you like to shape next?';
  });
  requestInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault(); requestForm.requestSubmit();
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-request]').forEach(button => {
    button.addEventListener('click', () => {
      requestInput.value = button.dataset.request ?? '';
      requestInput.focus();
      requestStatus.textContent = 'Make it yours, then share it and ask your browser agent to continue.';
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-add-object]').forEach(button => {
    button.addEventListener('click', () => void edit(async () => {
      const previousSelection = ctx.store.selectedId;
      const result = await run('add_object', {
        type: button.dataset.addObject,
        position: ctx.store.freeSpot(7),
      });
      if (result.result?.id && ctx.store.selectedId === previousSelection) ctx.select(result.result.id);
    }));
  });

  for (const id of fields) {
    const input = el<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      const target = ctx.store.selectedId;
      if (!target || !ctx.store.get(target)) return;
      const value = input.valueAsNumber;
      if (!Number.isFinite(value) || !input.checkValidity()) {
        input.reportValidity();
        update();
        return;
      }
      const args: Record<string, unknown> = { targets: target, mode: 'absolute' };
      if (id === 'selection-x' || id === 'selection-z') {
        args.op = 'move';
        args[id === 'selection-x' ? 'x' : 'z'] = value;
      } else if (id === 'selection-rotation') {
        args.op = 'rotate'; args.y = value;
      } else {
        args.op = 'scale'; args.uniform = value;
      }
      void edit(async () => { await run('transform_object', args); });
    });
  }
  el<HTMLButtonElement>('selection-clear').addEventListener('click', () => ctx.select(null));
  el<HTMLButtonElement>('selection-delete').addEventListener('click', () => {
    const id = ctx.store.selectedId;
    if (id) void edit(async () => { await run('delete_objects', { targets: id }); });
  });
  el<HTMLButtonElement>('scatter-undo').addEventListener('click', () => void edit(async () => {
    await run('undo_scatter');
  }));

  function update(): void {
    const all = ctx.store.all();
    const selected = ctx.store.selectedId ? ctx.store.get(ctx.store.selectedId) : undefined;
    const pond = all.find(entry => entry.type === 'pond');
    const cabin = all.find(entry => entry.type === 'cabin');
    document.body.classList.toggle('has-selection', Boolean(selected));
    controls.forEach(control => { control.disabled = pending; });
    el<HTMLButtonElement>('scatter-undo').disabled = pending || !scatterHistory(ctx.store).state.can_undo;
    el('world-count').textContent = `${all.length} ${all.length === 1 ? 'object' : 'objects'}`;
    el('build-hint').textContent = !all.length ? 'Place a pond and cabin to begin.'
      : pond && cabin ? 'Drag either one. Your agent sees where it lands.'
      : pond ? 'Add a cabin, then place it beside the water.'
      : cabin ? 'Add a pond, then find its place beside your cabin.'
      : 'Add your pond and cabin, or begin with Start empty.';

    if (selected) {
      const group = selected.group;
      const values = [group.position.x, group.position.z, group.rotation.y * 180 / Math.PI, group.scale.x];
      fields.forEach((id, index) => {
        const input = el<HTMLInputElement>(id);
        if (document.activeElement !== input) input.value = String(Math.round(values[index] * 100) / 100);
      });
      const provenance = el('selection-provenance');
      provenance.dataset.actor = selected.lastChangedBy;
      provenance.textContent = selected.createdBy === 'unknown' && selected.lastChangedBy === 'unknown' ? 'From existing scene'
        : selected.createdBy === selected.lastChangedBy
        ? `${actorLabel(selected.createdBy)} placed this`
        : `${actorLabel(selected.createdBy)} placed · ${actorLabel(selected.lastChangedBy)} edited`;
      provenance.title = `Created by ${actorLabel(selected.createdBy)}. Last changed by ${actorLabel(selected.lastChangedBy)}. Revision ${selected.revision}.`;
      el('selection-edit-note').textContent = pending ? 'Applying your change…'
        : selected.humanRevision > 0 ? 'Your edit is visible to the agent.' : 'Drag to move, or adjust a value.';
    }

  }

  let elapsed = 0;
  ctx.studio.onFrame(dt => {
    elapsed += dt;
    if (elapsed >= 0.2) { elapsed = 0; update(); }
  });
  update();
}
