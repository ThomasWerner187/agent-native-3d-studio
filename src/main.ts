import './style.css';
import { Studio } from './scene';
import { SceneStore } from './store';
import { Interaction } from './interaction';
import { SnapshotManager } from './snapshot';
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
const snapshots = new SnapshotManager(store, studio);

const ctx: ToolContext = {
  studio,
  store,
  snapshots,
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

// --- curated starter scene: a tiny lofi park at golden hour -----------------
studio.applyLighting('golden_hour', 1);

// stepping-stone path leading from the foreground to the picnic spot
for (let i = 0; i < 5; i++) {
  const t = i / 4;
  place('plane', -1.2 - t * 3.2, -0.6 + t * 2.6, {
    scale: 0.42 - Math.abs(t - 0.5) * 0.1,
    rotY: 30 + t * 25,
    name: `stepping stone ${i + 1}`,
  });
}
place('table', 2.6, 0.6, { rotY: -18, name: 'picnic table' });
place('chair', 2.05, 1.62, { rotY: 148, name: 'camp chair' });
place('lamp', 3.5, -0.5, { name: 'street lamp' });
place('box', 4.0, 2.2, { scale: 0.7, rotY: 30, name: 'crate' });
// a small grove framing the scene
place('tree', -5.2, -1.4, { scale: 1.15, name: 'old oak' });
place('tree', -3.6, -3.6, { scale: 1.4, rotY: 40, name: 'tall pine' });
place('tree', -6.6, 0.1, { scale: 0.92, rotY: 75, name: 'young oak' });
place('rock', 4.7, -2.9, { scale: 1.3, rotY: 20, name: 'mossy boulder' });
place('rock', -2.2, 3.4, { scale: 0.65, rotY: 160, name: 'flat rock' });

// pin the pristine state for the Reset button (and agents' worst days)
snapshots.captureBoot();

// --- HUD --------------------------------------------------------------------
initChrome(() => {
  if (snapshots.resetToBoot()) {
    store.bump();
    logToolCall('reset', {}, JSON.stringify({ ok: true, note: 'Scene restored to boot state.' }));
    logInfo('Scene reset to its original state.');
  }
});

// --- WebMCP -----------------------------------------------------------------
const devMode = new URLSearchParams(location.search).has('agent') || import.meta.env.DEV;

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
  // dev-only bridges: never exposed in production builds
  if (devMode) {
    (window as unknown as Record<string, unknown>).__tool = async (name: string, args: Record<string, unknown>) =>
      dispatchTool(ctx, name, args, logToolCall);
    (window as unknown as Record<string, unknown>).__scene = async () =>
      JSON.parse(await dispatchTool(ctx, 'describe_scene', {}, () => {}));
    initDevAgent(ctx, logToolCall);
  }
})();
