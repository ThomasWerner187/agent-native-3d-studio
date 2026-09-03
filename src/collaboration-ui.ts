import type { ToolContext } from './tools';
import type { SceneActor } from './store';
import { scatterHistory } from './scatter-history';
import { toast } from './ui';

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
  }));

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
    const anchor = cabin ?? pond ?? selected ?? all[0];
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

    const buildPrompt = el<HTMLButtonElement>('prompt-build');
    const atmospherePrompt = el<HTMLButtonElement>('prompt-atmosphere');
    // The prompt card is dismissible. It may no longer be in the document.
    if (!buildPrompt || !atmospherePrompt) return;
    buildPrompt.disabled = !anchor;
    atmospherePrompt.disabled = !all.length;
    const anchorInstruction = anchor ? `Use ${JSON.stringify(anchor.id)} as the live anchor, after verifying it still exists. ` : '';
    buildPrompt.dataset.copy = 'Continue this existing world with me. First call describe_scene, then query_scene with include_bounds: true for the live pond and cabin bounds, selection, provenance and recent human edits. '
      + anchorInstruction + 'Add exactly 30 trees, 8 rocks and 6 lamps around my current placements using separate scatter calls with anchor, clearance: 0.6 and a fixed seed. '
      + 'Preserve every existing object, keep clear of the pond and cabin, and use the latest scene_version for each mutation. If there is not enough room, expand the scatter area and retry the failed group. '
      + 'Do not rebuild the scene or use compose_lofi_scene. Read describe_scene after adding, verify the added counts and preserved objects, and report the undo_scatter IDs.';
    atmospherePrompt.dataset.copy = 'Continue this same world after my latest edit. First call describe_scene and query_scene; inspect selected_id, human_edits and recent_changes. '
      + 'Preserve all current object positions, rotations, scales and materials. Use set_lighting with preset: "golden_hour" and intensity: 0.9 for warm light. '
      + 'Start set_camera_motion with action: "start", mode: "cinematic", target: "scene", loop_seconds: 240 for an endless gentle camera. '
      + 'Keep controls visible and let human input pause the camera. Do not compose or cycle to a new world. Read describe_scene again to verify the lighting, running camera and preserved edits.';
    el('prompt-context').textContent = !all.length ? 'Place your first objects, then copy a prompt to your WebMCP browser agent.'
      : selected?.humanRevision ? 'Your edit is in the live scene. Copy a prompt to continue with your browser agent.'
      : 'Copy a prompt to your WebMCP browser agent. It works on this live world.';
  }

  let elapsed = 0;
  ctx.studio.onFrame(dt => {
    elapsed += dt;
    if (elapsed >= 0.2) { elapsed = 0; update(); }
  });
  update();
}
