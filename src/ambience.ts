/**
 * Lofi ambience for the studio: three self-made Suno tracks shipped from
 * /public/music (owner's own generations — license-safe). Plain HTMLAudio
 * playlist: loads lazily on first play, loops the list, never touches the
 * scene graph. Browser autoplay policy: audio becomes audible after the
 * first user gesture on the page; set_music reports that in its note.
 */

const PLAYLIST = [
  { src: 'music/aurora-drift.mp3', title: 'Aurora Drift' },
  { src: 'music/mirror-lake.mp3', title: 'Mirror Lake' },
  { src: 'music/dusk-tide-drift.mp3', title: 'Dusk Tide Drift' },
];

let audio: HTMLAudioElement | null = null;
let trackIndex = 0;
let playing = false;
let volume = 0.5;

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.loop = false;
  audio.volume = volume * 0.9;
  audio.addEventListener('ended', () => {
    if (!playing) return;
    trackIndex = (trackIndex + 1) % PLAYLIST.length;
    playTrack();
  });
  return audio;
}

function playTrack(): void {
  if (!audio) return;
  const track = PLAYLIST[trackIndex];
  if (!audio.src.includes(track.src)) audio.src = track.src;
  audio.volume = volume * 0.9;
  void audio.play().catch(() => {
    /* autoplay hold — retried on the next user gesture (installAudioUnlock) */
  });
}

export function setMusic(on: boolean, newVolume?: number): { playing: boolean; volume: number; track: string; note: string } {
  if (newVolume != null) volume = Math.max(0, Math.min(1, newVolume));
  playing = on;
  const el = ensureAudio();
  if (playing) {
    playTrack();
  } else {
    el.pause();
  }
  const blocked = playing && el.paused;
  return {
    playing,
    volume,
    track: PLAYLIST[trackIndex].title,
    note: blocked
      ? 'Track queued — the browser starts it after the first user gesture on the page (any click).'
      : `Now ${playing ? 'playing' : 'stopped'}: ${PLAYLIST[trackIndex].title} (self-made Suno track).`,
  };
}

export function isMusicOn(): boolean {
  return playing;
}

export function currentTrack(): string {
  return PLAYLIST[trackIndex].title;
}

/** First user gesture unlocks/starts the audio (autoplay policy). */
export function installAudioUnlock(): void {
  window.addEventListener(
    'pointerdown',
    () => {
      if (playing && audio && audio.paused) playTrack();
    },
    { capture: true },
  );
}
