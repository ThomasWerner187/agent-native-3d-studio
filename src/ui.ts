/**
 * HUD wiring: tool log, WebMCP status chip, prompt card, toast.
 * The tool log makes agent activity visible to humans — no DevTools needed.
 */

export type LogKind = 'call' | 'info' | 'error';

interface LogEntry {
  tool: string;
  args?: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  time: Date;
}

const MAX_ENTRIES = 100;
const entries: LogEntry[] = [];

/** Visual effects the log can trigger (wired in main.ts): object glows. */
export interface ActivityFx {
  highlight(ids: string[], color: string): void;
}
let activityFx: ActivityFx | null = null;
export function registerActivityFx(fx: ActivityFx): void {
  activityFx = fx;
}

/** Human-readable story line for a tool call — the raw JSON stays expandable. */
function activityLine(tool: string, args: Record<string, unknown>, result?: string): string {
  const targets = typeof args.targets === 'string' ? args.targets : Array.isArray(args.targets) ? `${args.targets.length} objects` : 'objects';
  switch (tool) {
    case 'help': return '📖 Reading the studio playbook';
    case 'describe_scene': return '👀 Inspecting the scene';
    case 'query_scene': return '🔍 Looking closer at the objects';
    case 'add_object': return `➕ Placing ${args.name ? `“${args.name}”` : `a ${args.type}`}`;
    case 'transform_object': return `↔️ Moving ${targets}`;
    case 'set_material': return `🎨 Recoloring ${targets}`;
    case 'set_lighting': return `🌇 Setting the mood: ${args.preset ?? 'custom'}`;
    case 'frame_camera': return `🎬 Framing ${args.target ?? 'scene'} (${args.angle ?? 'default'})`;
    case 'camera_path': return `🎥 Directing a camera flight`;
    case 'scatter': return `🌿 Planting ${args.count} ${args.type}s`;
    case 'set_ui': return args.visible === false ? '🎞 Hiding the HUD for a clean shot' : '🎞 Bringing the HUD back';
    case 'delete_objects': return '🗑 Clearing objects away';
    case 'board_square': return `♟ Asking the board where ${String(args.square ?? '').toUpperCase()} is`;
    case 'chess_move': return `♟ Playing ${args.piece ?? 'piece'} → ${String(args.to ?? '').toUpperCase()}`;
    case 'set_music': return args.on === false ? '🎵 Turning the lofi off' : '🎵 Putting lofi on';
    case 'snapshot': return '💾 Saving a restore point';
    case 'undo': return '⏪ Stepping one move back';
    case 'export_scene': return '🔗 Packaging the scene as a share link';
    case 'import_scene': return '📥 Restoring a shared scene';
    case 'batch': return `⚡ Running ${Array.isArray(args.ops) ? args.ops.length : '?'} steps as one`;
    case 'reset': return '↺ Restoring the original scene';
    default: return `⚙ ${tool}`;
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
  if (entry.tool === '__info') {
    div.innerHTML = `<div class="log-result">${firstLine(entry.result ?? '', 300)}</div>`;
    return div;
  }
  // Story line first; raw args/result stay expandable for debugging.
  const head = document.createElement('div');
  head.className = 'log-head';
  head.innerHTML = `<span class="dot"></span><span class="t">${fmtTime(entry.time)}</span>`;
  const story = document.createElement('span');
  story.className = 'story';
  story.textContent = activityLine(entry.tool, entry.args ?? {}, entry.result);
  head.appendChild(story);
  div.appendChild(head);

  const raw = document.createElement('details');
  raw.className = 'log-raw';
  const summary = document.createElement('summary');
  summary.textContent = `${entry.tool}()`;
  raw.appendChild(summary);
  if (entry.args && Object.keys(entry.args).length > 0) {
    const args = document.createElement('div');
    args.className = 'log-args';
    // No truncation here: the details view exists to hold the full payload.
    try {
      args.textContent = JSON.stringify(entry.args);
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
        if (parsed.id) ids.push(parsed.id);
        if (parsed.piece) ids.push(parsed.piece);
        if (Array.isArray(parsed.results)) for (const sub of parsed.results) if (sub?.id) ids.push(sub.id);
      } catch { /* non-JSON */ }
    }
    if (ids.length) activityFx.highlight(ids, '#ff9a3c');
  }
  return div;
}

export function pushLog(entry: LogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();
  const body = el('tool-log-entries');
  const empty = body.querySelector('.log-empty');
  if (empty) empty.remove();
  body.prepend(renderEntry(entry));
  while (body.children.length > MAX_ENTRIES) body.lastChild?.remove();
}

export function logToolCall(tool: string, args: Record<string, unknown>, result: string): void {
  let ok = true;
  try {
    ok = JSON.parse(result).ok === true;
  } catch { /* non-JSON result counts as ok */ }
  pushLog({ tool, args, result, ok, time: new Date() });
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
    chip.title = 'This page has registered its tools via document.modelContext. Open an agent to drive the scene.';
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
  // collapse toggle
  const panel = el('tool-log');
  el('tool-log-toggle').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    el('tool-log-toggle').textContent = panel.classList.contains('collapsed') ? '+' : '–';
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
