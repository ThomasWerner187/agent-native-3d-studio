import './style.css';
import { Studio } from './scene';
import { SceneStore } from './store';
import { Interaction } from './interaction';
import { SnapshotManager } from './snapshot';
import { registerTools, dispatchTool } from './webmcp';
import type { ToolContext } from './tools';
import { initChrome, logToolCall, logInfo, setStatus, toast, registerActivityFx } from './ui';
import { initDevAgent } from './devagent';
import { setMusic, isMusicOn, installAudioUnlock } from './ambience';
import { exportScene } from './tools';
import { disposeObject } from './factory';
import { AgentShow } from './show';
import { AGENT_PLAYBOOK, NO_CLIENT_RECIPE } from './agent-guide';

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

// --- activity storytelling ---------------------------------------------------
// The tool log tells the story in words; the scene glows where it happens.
registerActivityFx({ highlight: (ids, color) => studio.highlightObjects(ids, color) });
studio.highlightFind = (id) => store.get(id) ?? null;
studio.onHumanGrab = () => {
  toast('Human took control — the agent steps back.');
};

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

// --- shared-scene links: #scene=... restores an exported scene on load ------
{
  // A truncated/edited link must never take the page down — fall back to
  // the default scene instead.
  if (location.hash.startsWith('#scene=')) {
    try {
      const m = location.hash.match(/#scene=([A-Za-z0-9\-_]+)/);
      if (!m) throw new Error('no usable scene payload in link');
      const r = snapshots.importJson(atobUrlSafe(m[1]), { captureUndo: true });
      if (r.ok) {
        logInfo(`Scene restored from share link (${r.restored} objects). Modify anything — undo returns to this state.`);
        snapshots.captureBoot(); // the shared state becomes the new reset baseline
      } else {
        logInfo(`Share link could not be restored: ${r.error}`);
      }
    } catch {
      logInfo('Share link damaged — starting from the default scene.');
    }
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function atobUrlSafe(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- agent discoverability --------------------------------------------------
// Agents without a WebMCP-capable harness read the console / DOM manifest.
console.info(
  '%c🤖 AGENTS — this page is WebMCP-addressable%c\n' +
  AGENT_PLAYBOOK + '\n\n' + NO_CLIENT_RECIPE,
  'font-weight:bold; color:#ffb36b;',
  'font-weight:normal;',
);

// --- HUD --------------------------------------------------------------------
initChrome(() => {
  if (snapshots.resetToBoot()) {
    store.bump();
    logToolCall('reset', {}, JSON.stringify({ ok: true, note: 'Scene restored to boot state.' }));
    logInfo('Scene reset to its original state.');
  }
});

// --- Lofi toggle (same tracks the set_music tool plays) ----------------------
const musicBtn = document.getElementById('music-toggle');
musicBtn?.addEventListener('click', () => {
  const r = setMusic(!isMusicOn());
  musicBtn.classList.toggle('active', r.playing);
  musicBtn.title = r.playing ? `Lofi on — ${r.track}` : 'Lofi on/off — self-made Suno tracks';
  logToolCall('set_music', { on: r.playing }, JSON.stringify({ ok: true, playing: r.playing, track: r.track }));
});
installAudioUnlock();

// --- Share button: scene link (works without WebMCP on the visitor side) -----
document.getElementById('scene-share')?.addEventListener('click', () => {
  const res = JSON.parse(exportScene(ctx, {}) as string) as { result?: { url?: string } };
  if (res.result?.url) void navigator.clipboard?.writeText(res.result.url).catch(() => {});
  logInfo('Scene link copied to the clipboard — anyone can open it.');
});

// --- "Watch the agent build" — curated run through the real tool handlers ----
const show = new AgentShow({
  call: (tool, args) => dispatchTool(ctx, tool, args, logToolCall),
  armOrbit: () => studio.armIdleOrbit(),
  clearToMeadow: () => {
    snapshots.resetToBoot();
    for (const e of store.all()) {
      studio.scene.remove(e.group);
      disposeObject(e.group);
    }
    store.clear();
    store.bump();
    logInfo('AGENT: “Describe a world — a tree avenue along the path, warm light, music.”');
  },
  onDone: () => {
    toast('The agent is done — your turn. Grab the camera anytime.');
    const btn = document.getElementById('show-agent');
    if (btn) btn.textContent = '▶ Watch the agent build';
  },
  onPause: () => {
    toast('Human took control — show paused. Your turn.');
    const btn = document.getElementById('show-agent');
    if (btn) btn.textContent = '▶ Watch the agent build';
  },
});
document.getElementById('show-agent')?.addEventListener('click', () => {
  if (show.isRunning) return;
  const btn = document.getElementById('show-agent');
  if (btn) btn.textContent = '… agent building — grab the camera anytime';
  void show.run();
});
canvas.addEventListener('pointerdown', () => {
  if (show.isRunning) show.stop();
}, { capture: true });

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
