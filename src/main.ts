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
import { GuidedTour } from './show';
import { LayoutManager } from './layout';
import { cancelAllToolTweens } from './anim';
import * as THREE from 'three';
import { AGENT_PLAYBOOK, NO_CLIENT_RECIPE } from './agent-guide';

/**
 * Boot: scene, mouse interaction, curated starter scene, then WebMCP tools.
 * The starter scene is small but already pretty — the "good empty state".
 */

const canvas = document.getElementById('viewport') as HTMLCanvasElement;
const studio = new Studio(canvas);
const store = new SceneStore();
const snapshots = new SnapshotManager(store, studio);
const layout = new LayoutManager(store, studio);

const ctx: ToolContext = {
  studio,
  store,
  snapshots,
  layout,
  select: (id) => interaction.select(id),
};

const interaction = new Interaction(studio, store, canvas, snapshots);

// --- activity storytelling ---------------------------------------------------
// The tool log tells the story in words; the scene glows where it happens.
registerActivityFx({ highlight: (ids, color) => studio.highlightObjects(ids, color) });
studio.highlightFind = (id) => store.get(id) ?? null;

function place(
  type: Parameters<SceneStore['spawn']>[0],
  x: number, z: number,
  opts: { scale?: number | { x: number; y: number; z: number }; rotY?: number; name?: string; role?: 'path' | 'forest' | 'lantern' } = {},
): void {
  const entry = store.spawn(type, { scale: opts.scale, rotationYDeg: opts.rotY, name: opts.name });
  entry.group.position.set(x, 0, z);
  entry.layoutRole = opts.role;
  studio.scene.add(entry.group);
}

// --- curated starter scene: a tiny lofi park at golden hour -----------------
studio.applyLighting('moonlit', 1);

// stepping-stone path leading from the foreground to the picnic spot
for (let i = 0; i < 10; i++) {
  const t = i / 9;
  place('rock', Math.sin(t * 3.1) * 1.1 + t * 1.1, 8 - t * 7, {
    scale: { x: 1.15, y: 0.25, z: 0.85 }, rotY: 30 + t * 25,
    name: `stepping stone ${i + 1}`, role: 'path',
  });
}
place('camp', 1.2, -1.2, { name: 'camp' });
for (let i = 0; i < 28; i++) {
  const a = (i / 28) * 4 + 2;
  const radius = 5.4 + (i % 3) * 1.6;
  place('tree', Math.cos(a) * radius, Math.sin(a) * radius, { scale: 0.75 + (i % 5) * 0.1, rotY: i * 137, name: `grove pine ${i + 1}`, role: 'forest' });
}
for (let i = 0; i < 5; i++) {
  const z = 6.5 - i * 1.9;
  place('lamp', Math.sin((8 - z) / 9 * 3.1) * 1.1 + (i % 2 ? -1.25 : 1.5), z, { scale: 1.2, name: `path lantern ${i + 1}`, role: 'lantern' });
}
place('rock', -4.2, 1.8, { scale: 1.8, name: 'mossy boulder' });
place('rock', 4.7, -3.8, { scale: 1.5, name: 'ridge stone' });
let terrainVersion = -1;
studio.onFrame(() => {
  if (terrainVersion === store.version) return;
  terrainVersion = store.version;
  studio.terrain.fit(Math.max(0, ...store.all().map(e => Math.hypot(e.group.position.x, e.group.position.z) + e.group.scale.x)));
});

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
  show.stop();
  layout.clear();
  interaction.select(null);
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
document.getElementById('scene-share')?.addEventListener('click', async () => {
  const res = JSON.parse(exportScene(ctx, {}) as string) as { url?: string };
  try {
    if (!res.url) throw new Error('No scene link');
    await navigator.clipboard.writeText(res.url);
    toast('Scene link copied — anyone can open it.');
  } catch { toast('Could not copy the link. Use export_scene to get the URL.'); }
});

const localCall = (tool: string, args: Record<string, unknown> = {}) => dispatchTool(ctx, tool, args, logToolCall, 'human');
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-mood]')) {
  button.addEventListener('click', () => {
    void localCall('set_lighting', { preset: button.dataset.mood });
    document.querySelectorAll('[data-mood]').forEach(el => {
      el.classList.toggle('active', el === button);
      el.setAttribute('aria-pressed', String(el === button));
    });
  });
}
let cinematic = window.innerWidth > 760;
const quality = document.getElementById('quality-toggle')!;
quality.textContent = cinematic ? 'Cinematic' : 'Performance';
quality.setAttribute('aria-pressed', String(cinematic));
quality.addEventListener('click', () => {
  cinematic = !cinematic; studio.setQuality(cinematic);
  quality.textContent = cinematic ? 'Cinematic' : 'Performance';
  quality.setAttribute('aria-pressed', String(cinematic));
});
document.getElementById('camera-home')?.addEventListener('click', () => {
  studio.noteActivity();
  studio.flyTo({ position: new THREE.Vector3(16.2, 16.5, 22).multiplyScalar(Math.max(1, 1 / studio.camera.aspect)), target: new THREE.Vector3(0, 0.3, 0), fov: 42 }, 950, 'cinematic');
});
layout.onChange = () => {
  const state = layout.state;
  (document.getElementById('layout-try') as HTMLButtonElement).disabled = state.busy;
  (document.getElementById('layout-undo') as HTMLButtonElement).disabled = state.busy || !state.can_undo;
  (document.getElementById('layout-redo') as HTMLButtonElement).disabled = state.busy || !state.can_redo;
};
for (const [button, tool] of [['layout-try', 'arrange_scene'], ['layout-undo', 'undo_layout'], ['layout-redo', 'redo_layout']]) {
  document.getElementById(button)?.addEventListener('click', async () => {
    const result = JSON.parse(await localCall(tool));
    if (!result.ok) toast(result.error ?? 'Layout could not be applied.');
  });
}

function setShowCue(kicker: string, title: string, detail: string): void {
  const cue = document.getElementById('show-cue');
  const kickerEl = document.getElementById('show-cue-kicker');
  const titleEl = document.getElementById('show-cue-title');
  const detailEl = document.getElementById('show-cue-detail');
  if (!cue || !kickerEl || !titleEl || !detailEl) return;
  kickerEl.textContent = kicker;
  titleEl.textContent = title;
  detailEl.textContent = detail;
  cue.classList.remove('show-cue-pop');
  void cue.offsetWidth;
  cue.classList.add('show-cue-visible', 'show-cue-pop');
}

// Local guided tour is explicitly identified; actual agent calls use WebMCP.
const show = new GuidedTour({
  call: (tool, args) => dispatchTool(ctx, tool, args, logToolCall, 'demo'),
  cancel: () => { layout.stop(); cancelAllToolTweens(); },
  onDone: () => {
    toast('Your turn: move the camp, then connect your browser agent.');
    const btn = document.getElementById('show-agent');
    if (btn) btn.textContent = '▷ Guided tour';
  },
  onPause: () => {
    toast('Tour stopped. You have control.');
    const btn = document.getElementById('show-agent');
    if (btn) btn.textContent = '▷ Guided tour';
  },
  onBeat: ({ kicker, title, detail }) => setShowCue(kicker, title, detail),
});
document.getElementById('show-agent')?.addEventListener('click', () => {
  if (show.isRunning) { show.stop(); return; }
  const btn = document.getElementById('show-agent');
  if (btn) btn.textContent = '■ Stop guided tour';
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
