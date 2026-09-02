/** Owner-provided Suno tracks, loaded locally. Reports actual playback separately from intent. */
const PLAYLIST = [
  { src: 'music/aurora-drift.mp3', title: 'Aurora Drift' },
  { src: 'music/mirror-lake.mp3', title: 'Mirror Lake' },
  { src: 'music/dusk-tide-drift.mp3', title: 'Dusk Tide Drift' },
];
let audio: HTMLAudioElement | null = null;
let trackIndex = 0, volume = 0.5, fadeFrame = 0;
let requested = false, error = '';
const changed = () => window.dispatchEvent(new Event('music-state'));
function ensureAudio() {
  if (audio) return audio;
  audio = new Audio(); audio.preload = 'none';
  for (const event of ['playing', 'pause', 'waiting', 'volumechange']) audio.addEventListener(event, changed);
  audio.addEventListener('error', () => { error = 'The music file could not be loaded.'; changed(); });
  audio.addEventListener('ended', () => {
    if (!requested) return;
    trackIndex = (trackIndex + 1) % PLAYLIST.length; playTrack();
  });
  return audio;
}
function playTrack() {
  const el = ensureAudio(), track = PLAYLIST[trackIndex];
  if (!el.src.endsWith(track.src)) el.src = track.src;
  el.volume = volume * 0.9;
  void el.play().then(() => { error = ''; changed(); }).catch(e => {
    error = e.name === 'NotAllowedError' ? '' : 'Audio could not start.'; changed();
  });
}
export function musicState() {
  const playing = requested && !!audio && !audio.paused && !audio.ended && audio.readyState >= 2;
  return { requested, playing, volume, track: PLAYLIST[trackIndex].title,
    status: error ? 'error' : !requested ? 'off' : playing ? 'playing' : 'awaiting_playback',
    note: error || (!requested ? 'Music off.' : playing ? `Playing: ${PLAYLIST[trackIndex].title}.` : 'Music queued. Click Enable sound if the browser requires a gesture.') };
}
export function setMusic(on: boolean, newVolume?: number) {
  cancelAnimationFrame(fadeFrame);
  if (newVolume != null) volume = Math.max(0, Math.min(1, newVolume));
  requested = on; error = '';
  if (on) playTrack(); else audio?.pause();
  if (audio) audio.volume = volume * 0.9;
  changed(); return musicState();
}
export function fadeMusic(target: number, seconds = 6) {
  cancelAnimationFrame(fadeFrame);
  if (!requested) return; // A human muting during construction always wins.
  const from = volume, start = performance.now();
  const frame = () => {
    if (!requested) return;
    const p = Math.min(1, (performance.now() - start) / (seconds * 1000));
    volume = from + (target - from) * (p * p * (3 - 2 * p));
    if (audio) audio.volume = volume * 0.9;
    if (p < 1) fadeFrame = requestAnimationFrame(frame); else changed();
  };
  fadeFrame = requestAnimationFrame(frame);
}
export function isMusicOn() { return requested; }
export function currentTrack() { return PLAYLIST[trackIndex].title; }
export function installAudioUnlock() {
  const unlock = () => { if (requested && audio?.paused) playTrack(); };
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
}
