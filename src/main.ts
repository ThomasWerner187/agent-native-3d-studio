import './style.css';
import { Studio } from './scene';
import { SceneStore } from './store';
import { Interaction } from './interaction';
import { registerTools, dispatchTool } from './webmcp';
import type { ToolContext } from './tools';
import { initChrome, logToolCall, logInfo, setStatus } from './ui';
import { initDevAgent } from './devagent';

/**
 * Boot: scene, mouse interaction, curated starter scene, then WebMCP tools.
 * The starter scene is small but already pretty — the "good empty state".
 */

const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const studio = new Studio(canvas);
const store = new SceneStore();

const ctx: ToolContext = {
  studio,
  store,
  select: (id) => interaction.select(id),
};

const interaction = new Interaction(studio, store, canvas);

function place(
  type: Parameters<SceneStore['spawn']>[0],
  x: number, z: number,
  opts: { scale?: number; rotY?: number; name?: string } = {},
): void {
  const entry = store.spawn(type, { scale: opts.scale, rotationYDeg: opts.rotY, name: opts.name });
  entry.group.position.set(x, 0, z);
  studio.scene.add(entry.group);
}

// --- curated starter scene: a tiny lofi camp at golden hour -----------------
studio.applyLighting('golden_hour', 1);

place('plane', -2.5, 0.4, { scale: 3.4, rotY: 12, name: 'stone path' });
place('table', 2.6, 0.6, { rotY: -18 });
place('chair', 2.1, 1.6, { rotY: 150 });
place('lamp', 3.4, -0.6);
place('window', -3.6, -2.2, { rotY: 28 });
place('tree', -4.8, -1.6, { scale: 1.15 });
place('tree', -3.4, -3.4, { scale: 1.35, rotY: 40 });
place('tree', -6.2, -0.2, { scale: 0.95, rotY: 75 });
place('rock', 4.6, -2.8, { scale: 1.25, rotY: 20 });
place('rock', -1.4, 3.1, { scale: 0.7, rotY: 160 });

// --- HUD --------------------------------------------------------------------
initChrome();

// --- WebMCP -----------------------------------------------------------------
const devAgentActive = new URLSearchParams(location.search).has('agent');
void (async () => {
  const count = await registerTools(ctx, logToolCall);
  if (count > 0) {
    setStatus('live', count);
    logInfo(`Registered ${count} WebMCP tools. This scene is now agent-addressable.`);
  } else {
    setStatus('none');
    logInfo(
      'document.modelContext is not available in this browser. ' +
      'Needs Chrome 149+ with chrome://flags/#enable-webmcp-testing. ' +
      'Mouse interaction works everywhere; local tool testing via ?agent=1.',
    );
  }
  initDevAgent(ctx, logToolCall);
  void devAgentActive;
})();

// console hook for quick checks (also handy on stage)
(window as unknown as Record<string, unknown>).__tool = (name: string, args: Record<string, unknown>) =>
  dispatchTool(ctx, name, args, logToolCall);
(window as unknown as Record<string, unknown>).__scene = () => JSON.parse(dispatchTool(ctx, 'describe_scene', {}, () => {}));
