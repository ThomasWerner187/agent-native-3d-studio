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
    void run('compose_lofi_scene', {
      mood: (el('lofi-mood') as HTMLSelectElement).value,
      scene: (el('lofi-scene') as HTMLSelectElement).value,
      cycle: (el('lofi-cycle') as HTMLInputElement).checked,
      hold_seconds: 180,
    });
  });
  el('lofi-next').addEventListener('click', () => void run('control_lofi', { action: 'next' }));
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
    const action = state.status === 'running' ? 'pause' : state.status === 'paused' ? 'resume' : 'start';
    void run('set_camera_motion', { action, mode: 'orbit',
      ...(action === 'start' || state.mode === 'orbit' ? { from_current_view: true } : {}) });
  });
  el('lofi-sound').addEventListener('click', () => {
    const music = musicState();
    setMusic(!music.playing, music.volume || 0.38); update();
  });
  el('lofi-volume').addEventListener('input', () => {
    setMusic(true, Number((el('lofi-volume') as HTMLInputElement).value) / 100); update();
  });
  let tick = 0, lastUpdate = 0;
  function update() {
    const now = performance.now();
    if (now - lastUpdate < 200) return;
    lastUpdate = now;
    const state = ctx.lofi.state, camera = ctx.studio.director.state, music = musicState();
    const active = ['building', 'playing', 'paused', 'transitioning'].includes(state.status);
    document.body.classList.toggle('lofi-active', active);
    el('lofi-player').hidden = !active;
    const phase = state.status === 'paused' ? 'Take your time. We’re paused.' : state.status === 'playing' ? state.scene_title : state.phase;
    if (el('lofi-phase').textContent !== phase) el('lofi-phase').textContent = phase;
    el('lofi-progress-label').textContent = state.progress < 100 ? `${state.progress}% · Growing your world` : 'Your world is ready';
    (el('lofi-progress') as HTMLProgressElement).value = state.progress;
    el('lofi-shot').textContent = camera.status === 'running' ? camera.shot : camera.status === 'paused' ? 'Camera is yours · resume when ready' : state.reduced_motion ? 'Still frame · reduced motion' : 'Settling into the scene';
    const paused = state.status === 'paused' || camera.status === 'paused';
    el('lofi-pause').textContent = paused ? 'Resume' : 'Pause';
    el('lofi-pause').setAttribute('aria-pressed', String(paused));
    el('lofi-sound').textContent = music.playing ? 'Mute sound' : 'Enable sound';
    el('lofi-sound').setAttribute('aria-pressed', String(music.playing));
    const volume = el('lofi-volume') as HTMLInputElement;
    if (document.activeElement !== volume) volume.value = String(Math.round(music.volume * 100));
    const motion = el('lofi-motion') as HTMLSelectElement;
    if (document.activeElement !== motion) motion.value = camera.mode;
    el('lofi-track').textContent = music.status === 'error' ? music.note : music.playing ? music.track : music.requested ? 'A click may be needed for sound' : 'Quiet for now';
    el('music-toggle').classList.toggle('active', isMusicOn());
    el('music-toggle').setAttribute('aria-pressed', String(isMusicOn()));
    el('music-toggle').title = music.note;
    el('camera-orbit').textContent = camera.status === 'running' ? 'Pause camera' : camera.status === 'paused' ? 'Resume camera' : 'Orbit';
    el('camera-orbit').setAttribute('aria-pressed', String(camera.status === 'running'));
    document.body.dataset.lighting = ctx.studio.currentPreset;
    document.querySelectorAll<HTMLElement>('[data-mood]').forEach(button => {
      const selected = button.dataset.mood === ctx.studio.currentPreset;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    (el('lofi-create') as HTMLButtonElement).disabled = ctx.layout.busy;
    const hasCamp = ctx.store.all().some(entry => entry.type === 'camp');
    el('starter-layout').hidden = !hasCamp;
    const layoutButton = el('layout-try') as HTMLButtonElement;
    layoutButton.disabled = ctx.layout.busy || !hasCamp;
    layoutButton.title = hasCamp ? 'Adapt the surroundings to your camp' : 'Reset the scene to try the camp layout';
    layoutButton.hidden = !hasCamp;
    el('layout-undo').hidden = !hasCamp;
    el('layout-redo').hidden = !hasCamp;
    const tourButton = el('show-agent') as HTMLButtonElement;
    tourButton.disabled = !hasCamp;
    tourButton.title = hasCamp ? 'A local walkthrough of shared scene editing' : 'Reset the scene to start the guided tour';
    (el('lofi-next') as HTMLButtonElement).disabled = state.status === 'transitioning';
    el('scene-transition').style.opacity = String(state.sequence.transition_opacity);
    const sequence = state.sequence;
    const seconds = Math.max(0, Math.ceil(sequence.remaining_seconds));
    const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    el('lofi-sequence').textContent = state.status === 'transitioning' ? `${state.phase}…` :
      sequence.enabled ? `${state.scene_title} · Next: ${sequence.next_title} ${state.status === 'playing' ? `in ${countdown}` : 'when you’re ready'}` :
      `${state.scene_title} · An endless moment. Next world whenever you like.`;
  }
  window.addEventListener('music-state', update);
  ctx.studio.onFrame(dt => { tick += dt; if (tick > 0.25) { tick = 0; update(); } });
  update();
}
