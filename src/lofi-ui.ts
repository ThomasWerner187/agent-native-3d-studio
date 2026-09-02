import type { ToolContext } from './tools';
import { musicState, setMusic, isMusicOn } from './ambience';
import { toast } from './ui';

type Call = (tool: string, args?: Record<string, unknown>) => Promise<string>;
export function initLofiUI(ctx: ToolContext, call: Call, stopTour: () => void) {
  const el = (id: string) => document.getElementById(id)!;
  const run = async (name: string, args: Record<string, unknown> = {}) => {
    const result = JSON.parse(await call(name, args));
    if (!result.ok) toast(result.error); update();
  };
  el('lofi-create').addEventListener('click', () => {
    stopTour();
    void run('compose_lofi_scene', { mood: (el('lofi-mood') as HTMLSelectElement).value });
  });
  el('lofi-pause').addEventListener('click', () => {
    const state = ctx.lofi.state;
    if (state.status === 'paused') void run('control_lofi', { action: 'resume' });
    else if (state.camera.status === 'paused' && state.status === 'playing') void run('set_camera_motion', { action: 'resume' });
    else void run('control_lofi', { action: 'pause' });
  });
  el('lofi-exit').addEventListener('click', () => { document.body.classList.remove('ui-hidden'); void run('control_lofi', { action: 'stop' }); });
  el('lofi-view').addEventListener('click', () => document.body.classList.add('ui-hidden'));
  el('return-controls').addEventListener('click', () => document.body.classList.remove('ui-hidden'));
  el('lofi-proof').addEventListener('click', () => {
    const on = document.body.classList.toggle('lofi-proof'); el('lofi-proof').setAttribute('aria-pressed', String(on));
  });
  el('lofi-motion').addEventListener('change', () => void run('set_camera_motion', { action: 'start', mode: (el('lofi-motion') as HTMLSelectElement).value }));
  el('camera-orbit').addEventListener('click', () => {
    const state = ctx.studio.director.state;
    void run('set_camera_motion', { action: state.status === 'running' ? 'pause' : state.status === 'paused' ? 'resume' : 'start', mode: 'orbit' });
  });
  el('lofi-sound').addEventListener('click', () => { setMusic(!musicState().playing, 0.38); update(); });
  el('lofi-volume').addEventListener('input', () => {
    setMusic(true, Number((el('lofi-volume') as HTMLInputElement).value) / 100); update();
  });
  let tick = 0, lastUpdate = 0;
  function update() {
    const now = performance.now();
    if (now - lastUpdate < 200) return;
    lastUpdate = now;
    const state = ctx.lofi.state, camera = ctx.studio.director.state, music = musicState();
    const active = ['building', 'playing', 'paused'].includes(state.status);
    document.body.classList.toggle('lofi-active', active);
    el('lofi-player').hidden = !active;
    const phase = state.status === 'paused' ? 'Take your time. We’re paused.' : state.phase;
    if (el('lofi-phase').textContent !== phase) el('lofi-phase').textContent = phase;
    el('lofi-progress-label').textContent = state.progress < 100 ? `${state.progress}% · GROWING YOUR WORLD` : '∞ · NO ENDING, NO HURRY';
    (el('lofi-progress') as HTMLProgressElement).value = state.progress;
    el('lofi-shot').textContent = camera.status === 'running' ? camera.shot : camera.status === 'paused' ? 'Camera is yours · resume when ready' : state.reduced_motion ? 'Still frame · reduced motion' : 'Settling into the scene';
    el('lofi-pause').textContent = state.status === 'paused' || camera.status === 'paused' ? '▷ Resume' : 'Ⅱ Pause';
    el('lofi-sound').textContent = music.playing ? '♫ Sound on' : music.requested ? '♫ Enable sound' : '♫ Sound off';
    el('lofi-track').textContent = music.status === 'error' ? music.note : music.playing ? music.track : music.requested ? 'A click may be needed for sound' : 'Quiet for now';
    el('music-toggle').classList.toggle('active', isMusicOn());
    el('music-toggle').setAttribute('aria-pressed', String(isMusicOn()));
    el('camera-orbit').textContent = camera.status === 'running' ? 'Ⅱ Orbit' : camera.status === 'paused' ? '▷ Resume camera' : '↻ Orbit';
    (el('lofi-create') as HTMLButtonElement).disabled = ctx.layout.busy;
  }
  window.addEventListener('music-state', update);
  ctx.studio.onFrame(dt => { tick += dt; if (tick > 0.25) { tick = 0; update(); } });
  update();
}
