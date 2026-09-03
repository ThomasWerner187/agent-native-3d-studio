/**
 * HUD wiring: tool log, WebMCP status chip, prompt card, toast.
 * The tool log makes agent activity visible to humans — no DevTools needed.
 */

import { icon } from './icons';

interface LogEntry {
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  time: Date;
  actor?: string;
}

const MAX_ENTRIES = 100;

/** Visual effects the log can trigger (wired in main.ts): object glows. */
export interface ActivityFx {
  highlight(ids: string[], color: string): void;
}
let activityFx: ActivityFx | null = null;
export function registerActivityFx(fx: ActivityFx): void {
  activityFx = fx;
}

/** Human-readable story line for a tool call — the raw JSON stays expandable. */
function activityLine(tool: string, args: Record<string, unknown>): string {
  const targets = typeof args.targets === 'string' ? args.targets : Array.isArray(args.targets) ? `${args.targets.length} objects` : 'objects';
  switch (tool) {
    case 'creative_request': return `“${String(args.text ?? '')}”`;
    case 'add_grove': return `Growing ${args.count ?? 40} trees around your cabin`;
    case 'add_path': return 'Laying a stone path from porch to pond';
    case 'compose_lofi_scene': return 'Started a lofi world';
    case 'control_lofi': return args.action === 'pause' ? 'Paused the lofi session' : args.action === 'resume' ? 'Resumed the lofi session' : args.action === 'next' ? 'Visiting the next lofi world' : 'Stopped the session · kept the scene';
    case 'set_camera_motion': return args.action === 'start' ? 'Started a continuous camera journey' : `${args.action === 'pause' ? 'Paused' : args.action === 'resume' ? 'Resumed' : 'Stopped'} the camera`;
    case 'human_move': return `Placed ${args.name ?? 'object'} · position preserved`;
    case 'arrange_scene': return 'Adapted the grove, path & lanterns';
    case 'undo_layout': return 'Undid layout · kept your edits';
    case 'redo_layout': return 'Reapplied the layout';
    case 'help': return 'Reading the studio playbook';
    case 'describe_scene': return 'Inspecting the scene';
    case 'query_scene': return 'Looking closer at the objects';
    case 'add_object': return `Placing ${args.name ? `“${args.name}”` : `a ${args.type}`}`;
    case 'transform_object': return `Moving ${targets}`;
    case 'set_material': return `Recoloring ${targets}`;
    case 'set_lighting': return `Setting the mood: ${args.preset ?? 'custom'}`;
    case 'frame_camera': return `Framing ${args.target ?? 'scene'} (${args.angle ?? 'default'})`;
    case 'camera_path': return `Directing a camera flight`;
    case 'scatter': return `Planting ${args.count} ${args.type}s`;
    case 'undo_scatter': return 'Undid additions · kept later edits';
    case 'set_ui': return args.visible === false ? 'Hiding the HUD for a clean shot' : 'Bringing the HUD back';
    case 'delete_objects': return 'Clearing objects away';
    case 'board_square': return `Asking the board where ${String(args.square ?? '').toUpperCase()} is`;
    case 'chess_move': return `Playing ${args.piece ?? 'piece'} → ${String(args.to ?? '').toUpperCase()}`;
    case 'set_music': return args.on === false ? 'Turning the lofi off' : 'Putting lofi on';
    case 'snapshot': return 'Saving a restore point';
    case 'undo': return 'Stepping one move back';
    case 'export_scene': return 'Packaging the scene as a share link';
    case 'import_scene': return 'Restoring a shared scene';
    case 'batch': return `Running ${Array.isArray(args.ops) ? args.ops.length : '?'} steps as one`;
    case 'reset': return 'Restored the original scene';
    case 'start_empty': return 'Started an empty world';
    default: return `${tool}`;
  }
}

function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e as T;
}

function fmtTime(d: Date): string {
  return d.toTimeString().slice(0, 8);
}

function compactJson(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s.length > 220 ? s.slice(0, 217) + '…' : s;
  } catch {
    return String(v);
  }
}

function firstLine(s: string, max = 160): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function renderEntry(entry: LogEntry): HTMLElement {
  const div = document.createElement('div');
  div.className = 'log-entry' + (entry.ok === false ? ' err' : '');
  div.dataset.actor = entry.actor ?? 'system';
  if (entry.tool === '__info') {
    const info = document.createElement('div');
    info.className = 'log-result';
    info.textContent = firstLine(entry.result ?? '', 300);
    div.appendChild(info);
    return div;
  }
  // Story line first; raw args/result stay expandable for debugging.
  const head = document.createElement('div');
  head.className = 'log-head';
  head.innerHTML = `<span class="dot"></span><span class="t">${fmtTime(entry.time)}</span>`;
  const story = document.createElement('span');
  story.className = 'story';
  story.textContent = activityLine(entry.tool, entry.args ?? {});
  head.appendChild(story);
  const actor = document.createElement('div');
  actor.className = 'log-actor';
  actor.textContent = entry.actor === 'agent' ? 'AGENT · WEBMCP' : entry.actor === 'human' ? entry.tool === 'creative_request' ? 'YOU ASKED' : 'YOU' : 'LOCAL DEMO';
  div.appendChild(actor);
  if (entry.ok === false) story.textContent = 'Action could not be applied';
  div.appendChild(head);

  if (entry.tool === 'creative_request') return div;
  const raw = document.createElement('details');
  raw.className = 'log-raw';
  const summary = document.createElement('summary');
  summary.textContent = `${entry.tool}()`;
  raw.appendChild(summary);
  if (entry.args && Object.keys(entry.args).length > 0) {
    const args = document.createElement('div');
    args.className = 'log-args';
    // No truncation here: the details view exists to hold the full payload,
    // pretty-printed so an 8-op batch is actually readable.
    try {
      args.textContent = JSON.stringify(entry.args, null, 2);
    } catch {
      args.textContent = compactJson(entry.args);
    }
    raw.appendChild(args);
  }
  if (entry.result != null) {
    const res = document.createElement('div');
    res.className = 'log-result';
    res.textContent = entry.result;
    raw.appendChild(res);
  }
  div.appendChild(raw);

  // Orange glow on the objects this call created/moved (agent = orange).
  if (activityFx && entry.ok !== false) {
    const ids: string[] = [];
    const r = entry.result;
    if (r) {
      try {
        const parsed = JSON.parse(r);
        const inner = (parsed.result ?? parsed) as Record<string, unknown>;
        if (inner.id) ids.push(inner.id as string);
        if (Array.isArray(inner.ids)) ids.push(...inner.ids as string[]);
        if (Array.isArray(inner.moved_ids)) ids.push(...inner.moved_ids as string[]);
        if (inner.piece) ids.push(inner.piece as string);
        if (Array.isArray(inner.results)) for (const sub of inner.results as Record<string, unknown>[]) if (sub?.id) ids.push(sub.id as string);
      } catch { /* non-JSON */ }
    }
    if (ids.length) activityFx.highlight(ids, entry.actor === 'human' ? '#67b7ff' : '#e9b56b');
  }
  return div;
}

export function pushLog(entry: LogEntry): void {
  const body = el('tool-log-entries');
  const empty = body.querySelector('.log-empty');
  if (empty) empty.remove();
  body.prepend(renderEntry(entry));
  while (body.children.length > MAX_ENTRIES) body.lastChild?.remove();
}

export function logToolCall(tool: string, args: Record<string, unknown>, result: string): void {
  let ok = true;
  let actor = 'human';
  try {
    const parsed = JSON.parse(result);
    ok = parsed.ok === true;
    actor = parsed.actor ?? 'human';
  } catch { /* non-JSON result counts as ok */ }
  pushLog({ tool, args, result, ok, actor, time: new Date() });
}

export function logInfo(text: string): void {
  pushLog({ tool: '__info', result: text, time: new Date() });
}

export function setStatus(kind: 'live' | 'none' | 'checking', toolCount?: number): void {
  const chip = el('webmcp-status');
  chip.classList.remove('status-live', 'status-none', 'status-checking');
  chip.classList.add(`status-${kind}`);
  const text = chip.querySelector('.status-text')!;
  if (kind === 'live') {
    text.textContent = `WebMCP live · ${toolCount} tools`;
    chip.title =
      'This page has registered its tools via document.modelContext. Open an agent to drive the scene. ' +
      'If your harness cannot inject these tools, evaluate JavaScript in this page: ' +
      'const mc = document.modelContext; await mc.executeTool((await mc.getTools()).find(t => t.name === "help"), "{}"); ' +
      '— the full recipe is printed in the tool log panel.';
  } else if (kind === 'none') {
    text.textContent = 'WebMCP unavailable here';
    chip.title =
      'This browser does not expose document.modelContext. Needs Chrome 149+ with chrome://flags/#enable-webmcp-testing. ' +
      'The scene still works with the mouse, and tools can be tested via ?agent=1.';
  } else {
    text.textContent = 'checking WebMCP…';
  }
}

export function initChrome(onReset?: () => void): void {
  document.querySelectorAll<HTMLElement>('[data-icon]').forEach(node => {
    node.innerHTML = icon(node.dataset.icon ?? '');
  });
  // Opacity alone leaves invisible controls in the keyboard focus order.
  const syncVisibility = () => {
    const hidden = document.body.classList.contains('ui-hidden');
    document.querySelectorAll<HTMLElement>('.hud').forEach(node => { node.inert = hidden; });
    if (hidden && document.activeElement?.closest('.hud')) {
      document.getElementById('return-controls')?.focus({ preventScroll: true });
    }
  };
  new MutationObserver(syncVisibility).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  syncVisibility();
  // collapse toggle
  const panel = el('tool-log');
  const toggle = el('tool-log-toggle');
  const syncToggle = () => {
    const collapsed = panel.classList.contains('collapsed');
    toggle.innerHTML = icon(collapsed ? 'plus' : 'minus');
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Expand tool activity' : 'Collapse tool activity');
  };
  if (window.matchMedia('(max-width: 700px)').matches) panel.classList.add('collapsed');
  syncToggle();
  el('tool-log-toggle').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    syncToggle();
  });

  // reset to boot state
  el('scene-reset').addEventListener('click', () => onReset?.());

  // prompt card
  const card = el('prompt-card');
  el('prompt-card-close').addEventListener('click', () => card.remove());
  card.querySelectorAll<HTMLButtonElement>('.prompt').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy ?? '';
      try {
        await navigator.clipboard.writeText(text);
        toast('Prompt copied — paste it into your agent.');
      } catch {
        toast('Copy failed — select the text manually.');
      }
    });
  });
}

let toastTimer: number | undefined;
export function toast(text: string): void {
  const t = el('toast');
  t.textContent = text;
  t.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2600);
}
