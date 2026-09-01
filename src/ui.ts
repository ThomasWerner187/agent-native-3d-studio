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
  const head = document.createElement('div');
  head.className = 'log-head';
  head.innerHTML = `<span class="dot"></span><span class="t">${fmtTime(entry.time)}</span><span>${entry.tool}()</span>`;
  div.appendChild(head);
  if (entry.args && Object.keys(entry.args).length > 0) {
    const args = document.createElement('div');
    args.className = 'log-args';
    args.textContent = compactJson(entry.args);
    div.appendChild(args);
  }
  if (entry.result != null) {
    const res = document.createElement('div');
    res.className = 'log-result';
    res.textContent = firstLine(entry.result);
    div.appendChild(res);
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

export function initChrome(): void {
  // collapse toggle
  const panel = el('tool-log');
  el('tool-log-toggle').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    el('tool-log-toggle').textContent = panel.classList.contains('collapsed') ? '+' : '–';
  });

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
