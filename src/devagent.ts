import { TOOL_DEFS, dispatchTool, type ToolLogger } from './webmcp';
import type { ToolContext } from './tools';

/**
 * Local dev harness (?agent=1): a minimal in-page agent stand-in that calls
 * the exact same tool implementations the WebMCP registration exposes.
 * This exists ONLY for developing without a WebMCP-enabled browser; it is
 * not part of the product and never auto-activates.
 */

export function initDevAgent(ctx: ToolContext, log: ToolLogger): void {
  const params = new URLSearchParams(location.search);
  if (!params.has('agent')) return;

  const panel = document.createElement('div');
  panel.id = 'dev-agent';
  panel.style.cssText = [
    'position:absolute', 'left:18px', 'top:110px', 'width:340px', 'z-index:30',
    'background:rgba(24,18,13,0.8)', 'border:1px solid rgba(255,140,80,0.45)',
    'border-radius:14px', 'padding:12px', 'backdrop-filter:blur(14px)',
    'font-family:ui-monospace,Menlo,monospace', 'font-size:12px', 'color:#f5ecdf',
  ].join(';');

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;font-weight:700;margin-bottom:6px;color:#ffb36b">DEV HARNESS · tool caller<button id="dev-close" aria-label="Close local tool inspector" style="border:0;background:transparent;color:inherit;padding:6px;cursor:pointer">✕</button></div>
    <div style="margin-bottom:6px;color:rgba(245,236,223,0.6)">Calls the same handlers WebMCP exposes. Add ?agent=1.</div>
    <select id="dev-tool" style="width:100%;margin-bottom:6px;padding:5px;border-radius:8px;background:#2a211a;color:inherit;border:1px solid rgba(255,214,170,0.2)">
      ${TOOL_DEFS.map((t) => `<option>${t.name}</option>`).join('')}
    </select>
    <textarea id="dev-args" rows="6" style="width:100%;padding:6px;border-radius:8px;background:#2a211a;color:inherit;border:1px solid rgba(255,214,170,0.2);font:inherit"></textarea>
    <div style="display:flex;gap:6px;margin-top:6px">
      <button id="dev-run" style="flex:1;padding:6px;border-radius:8px;border:none;background:#ffb36b;color:#241a12;font-weight:700;cursor:pointer">Run</button>
      <button id="dev-help" style="padding:6px 10px;border-radius:8px;border:1px solid rgba(255,214,170,0.25);background:transparent;color:inherit;cursor:pointer">Schema</button>
    </div>
    <pre id="dev-out" style="margin:8px 0 0;white-space:pre-wrap;word-break:break-all;color:#e8d9c2;max-height:180px;overflow:auto"></pre>
  `;
  document.body.appendChild(panel);

  const $ = <T extends HTMLElement>(id: string) => panel.querySelector(id) as T;
  const toolSel = $<HTMLSelectElement>('#dev-tool');
  const argsBox = $<HTMLTextAreaElement>('#dev-args');
  const out = $<HTMLElement>('#dev-out');
  $<HTMLButtonElement>('#dev-close').addEventListener('click', () => { panel.hidden = true; });

  const EXAMPLES: Record<string, string> = {
    describe_scene: '{}',
    add_object: '{ "type": "tree", "position": { "x": -2, "z": 1 }, "name": "pine" }',
    transform_object: '{ "targets": ["obj_1"], "op": "move", "mode": "relative", "x": 2 }',
    set_material: '{ "targets": ["obj_1"], "color": "#c97b6d", "roughness": 0.6 }',
    set_lighting: '{ "preset": "night_neon", "intensity": 1.2 }',
    frame_camera: '{ "target": "scene", "angle": "hero", "focal_length": 50 }',
    scatter: '{ "type": "tree", "count": 40, "area": { "center_x": -12, "center_z": 0, "width": 14, "depth": 20 }, "exclusion_zones": [{ "x": -3, "z": 0, "width": 4, "depth": 30 }] }',
  };

  const setExample = () => { argsBox.value = EXAMPLES[toolSel.value] ?? '{}'; };
  toolSel.addEventListener('change', setExample);
  setExample();

  $<HTMLButtonElement>('#dev-run').addEventListener('click', () => {
    let args: Record<string, unknown> = {};
    try {
      args = argsBox.value.trim() ? JSON.parse(argsBox.value) : {};
    } catch (e) {
      out.textContent = `Invalid JSON: ${e instanceof Error ? e.message : e}`;
      return;
    }
    const t0 = performance.now();
    out.textContent = '…';
    void dispatchTool(ctx, toolSel.value, args, log, 'demo').then((result) => {
      const ms = (performance.now() - t0).toFixed(1);
      out.textContent = `← ${ms} ms\n` + (() => { try { return JSON.stringify(JSON.parse(result), null, 1); } catch { return result; } })();
    });
  });

  $<HTMLButtonElement>('#dev-help').addEventListener('click', () => {
    const def = TOOL_DEFS.find((t) => t.name === toolSel.value);
    out.textContent = JSON.stringify(def?.inputSchema ?? {}, null, 1);
  });

  // console access: __tool('add_object', {...})
  (window as unknown as Record<string, unknown>).__devtool = async (name: string, args: Record<string, unknown>) =>
    dispatchTool(ctx, name, args, log, 'demo');
}
