import type { ToolContext } from './tools';
import { addCreativeRequest, getCreativeRequests } from './creative-requests';
import { pushLog } from './ui';

interface ToolReceipt {
  tool: string;
  args?: Record<string, unknown>;
  result: unknown;
  actor?: string;
}
interface Message {
  id: string;
  role: 'user' | 'agent';
  text: string;
  error?: boolean;
}

const MUTATIONS = new Set([
  'add_grove', 'add_path', 'add_object', 'transform_object', 'set_material', 'set_lighting',
  'frame_camera', 'camera_path', 'scatter', 'undo_scatter', 'undo', 'set_ui', 'delete_objects',
  'set_music', 'import_scene', 'batch', 'set_camera_motion', 'arrange_scene', 'undo_layout',
  'redo_layout', 'compose_lofi_scene', 'control_lofi', 'chess_move', 'snapshot',
  'describe_scene',
]);

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** A labeled demo browser surface. It stores human briefs and displays real tool receipts;
 * it never generates replies, calls a model, or substitutes for the connected agent. */
export function initDemoBrowser(ctx: ToolContext): void {
  if (new URL(location.href).searchParams.get('demo') !== '1') return;
  const el = <T extends HTMLElement>(id: string): T => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing demo browser element #${id}`);
    return node as T;
  };
  const bar = el('demo-browser-bar');
  const toggle = el<HTMLButtonElement>('demo-agent-toggle');
  const panel = el('demo-agent-panel');
  const close = el<HTMLButtonElement>('demo-agent-close');
  const form = el<HTMLFormElement>('demo-agent-form');
  const input = el<HTMLTextAreaElement>('demo-agent-input');
  const messageList = el('demo-agent-messages');
  const status = el('demo-agent-status');
  const canvas = ctx.studio.renderer.domElement;
  const emptyState = messageList.querySelector('.demo-agent-empty')?.cloneNode(true);
  const messages: Message[] = getCreativeRequests().map(request => ({ id: request.id, role: 'user', text: request.text }));
  const seenOperations = new Set<string>();
  let receiptSequence = 0;
  let open = false;
  let resizeFrame = 0;
  let lastWidth = 0, lastHeight = 0;

  document.body.classList.add('demo-browser-active');
  bar.hidden = false;
  panel.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', panel.id);
  toggle.setAttribute('aria-label', 'Open agent panel');
  input.maxLength = 1200;
  status.textContent = 'Ready for your agent';

  function messageElement(message: Message): HTMLElement {
    const row = document.createElement('div');
    row.className = 'demo-message' + (message.error ? ' is-error' : '');
    row.dataset.role = message.role;
    row.dataset.messageId = message.id;
    const label = document.createElement('div');
    label.className = 'demo-message-label';
    label.textContent = message.role === 'user' ? 'You' : 'Agent · WebMCP result';
    const text = document.createElement('p');
    text.className = 'demo-message-text';
    text.textContent = message.text;
    row.append(label, text);
    return row;
  }
  function renderMessages(): void {
    messageList.replaceChildren(...messages.map(messageElement));
    if (!messages.length && emptyState) messageList.append(emptyState.cloneNode(true));
    messageList.scrollTop = messageList.scrollHeight;
  }
  function append(message: Message): void {
    messages.push(message);
    while (messages.filter(item => item.role === 'user').length > 12) {
      const firstUser = messages.findIndex(item => item.role === 'user');
      const nextUser = messages.findIndex((item, index) => index > firstUser && item.role === 'user');
      messages.splice(0, nextUser);
    }
    // Also bound receipts when an agent works without a new request for a while.
    if (messages.length > 48) messages.splice(0, messages.length - 48);
    messageList.querySelector('.demo-agent-empty')?.remove();
    messageList.append(messageElement(message));
    const retained = new Set(messages.map(item => item.id));
    messageList.querySelectorAll<HTMLElement>('.demo-message').forEach(row => {
      if (!retained.has(row.dataset.messageId ?? '')) row.remove();
    });
    // Append just the new row so the live region does not announce old messages again.
    messageList.scrollTop = messageList.scrollHeight;
  }

  function resizeViewport(): void {
    resizeFrame = 0;
    const rect = canvas.getBoundingClientRect();
    const width = Math.round(rect.width), height = Math.round(rect.height);
    if (width < 1 || height < 1 || (width === lastWidth && height === lastHeight)) return;
    lastWidth = width; lastHeight = height;
    ctx.studio.resizeViewport(width, height);
  }
  function requestResize(): void {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(resizeViewport);
  }
  function setOpen(next: boolean, restoreFocus = true): void {
    open = next;
    panel.hidden = !open;
    document.body.classList.toggle('demo-agent-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close agent panel' : 'Open agent panel');
    if (open) {
      input.focus({ preventScroll: true });
      messageList.scrollTop = messageList.scrollHeight;
    } else if (restoreFocus) toggle.focus({ preventScroll: true });
    requestResize();
  }
  toggle.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault(); event.stopPropagation();
    setOpen(false);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) { input.focus(); return; }
    const request = addCreativeRequest(text, ctx.store.version, ctx.store.selectedId);
    append({ id: request.id, role: 'user', text: request.text });
    pushLog({ tool: 'creative_request', args: { text: request.text }, ok: true, actor: 'human', time: new Date() });
    input.value = '';
    status.textContent = 'Shared with the scene · waiting for your agent';
    input.focus({ preventScroll: true });
  });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    form.requestSubmit();
  });

  function receiveToolResult(event: Event): void {
    const detail = (event as CustomEvent<ToolReceipt>).detail;
    if (!detail || detail.actor !== 'agent' || !MUTATIONS.has(detail.tool)) return;
    let raw = detail.result;
    if (typeof raw === 'string') {
      try { raw = JSON.parse(raw); } catch { return; }
    }
    const envelope = object(raw);
    if (!envelope || (envelope.actor != null && envelope.actor !== 'agent')) return;
    const result = object(envelope.result) ?? envelope;
    const operationId = typeof envelope.operation_id === 'string' ? envelope.operation_id : null;
    if (operationId && seenOperations.has(operationId)) return;
    let text: string | null = null;
    const failed = envelope.ok === false || result.ok === false;
    const interrupted = envelope.applied === false || result.applied === false;
    if (failed) {
      const error = typeof envelope.error === 'string' ? envelope.error : result.error;
      if (typeof error !== 'string') return;
      text = error.slice(0, 500);
    } else if (envelope.ok === true) {
      if (detail.tool === 'add_grove') {
        const trees = count(result.live_added), lights = count(result.live_lights_added);
        if (trees === null || lights === null) return;
        text = `${interrupted || result.exact_count === false ? 'Current result:' : 'Added'} ${trees} trees and ${lights} lights.`;
      } else if (detail.tool === 'add_path') {
        const stones = count(result.live_added);
        if (stones === null) return;
        text = `${interrupted || result.exact_count === false ? 'Current result:' : 'Added'} ${stones} stepping stones.`;
      } else if (detail.tool === 'describe_scene') {
        const edits = Array.isArray(result.human_edits) ? result.human_edits.map(object).filter(Boolean) : [];
        const stones = edits.filter(edit => edit?.last_changed_by === 'human' && /stepping stone/i.test(String(edit.name ?? '')));
        if (stones.length) text = stones.length === 1
          ? 'I can see your stepping-stone edit.'
          : `I can see all ${stones.length} of your stepping-stone edits.`;
      } else if (detail.tool === 'set_lighting' && typeof result.preset === 'string' && !interrupted) {
        text = result.preset === 'golden_hour' ? 'Cozy evening light is settling in.' : 'The new light is set.';
      } else if (detail.tool === 'set_music' && result.playing === true) {
        text = typeof result.track === 'string' ? `${result.track} is playing.` : 'The lofi music is playing.';
      } else if (detail.tool === 'set_camera_motion') {
        const motion = object(result.camera_motion);
        if (motion?.status === 'running') text = motion.mode === 'orbit'
          ? 'An endless orbit is running from this view.'
          : 'The endless camera journey is running.';
      } else if (detail.tool === 'set_ui' && detail.args?.visible === false && result.ui_visible === false && !interrupted) {
        text = 'Scene controls hidden.';
      }
    }
    if (!text) return;
    if (operationId) {
      seenOperations.add(operationId);
      if (seenOperations.size > 100) seenOperations.delete(seenOperations.values().next().value!);
    }
    append({ id: operationId ?? `receipt_${++receiptSequence}`, role: 'agent', text, error: failed });
    status.textContent = failed ? 'The tool reported an error' : interrupted ? 'The operation was interrupted' : 'Updated through WebMCP';
    if (detail.tool === 'set_ui' && detail.args?.visible === false && result.ui_visible === false && !failed && !interrupted) {
      setOpen(false, false);
      document.getElementById('return-controls')?.focus({ preventScroll: true });
    }
  }
  window.addEventListener('studio:tool-result', receiveToolResult);
  const resizeObserver = new ResizeObserver(requestResize);
  resizeObserver.observe(canvas);
  window.addEventListener('resize', requestResize);
  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    resizeObserver.disconnect();
    window.removeEventListener('resize', requestResize);
    window.removeEventListener('studio:tool-result', receiveToolResult);
    if (resizeFrame) cancelAnimationFrame(resizeFrame);
  }, { once: true });
  renderMessages();
  requestResize();
}
