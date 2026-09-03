import * as THREE from 'three';
import type { Studio, LightingPreset } from './scene';
import type { SceneEntry, SceneStore } from './store';
import { disposeObject } from './factory';
import { cancelAllToolTweens } from './anim';
import { setMusic, fadeMusic, isMusicOn, musicState } from './ambience';
import type { MotionMode } from './camera-director';
import { LOFI_SCENES, isLofiScene, planLofiScene, type LofiScene, type Placement } from './lofi-scenes';

type Reveal = { entry: SceneEntry; at: number; scale: THREE.Vector3; lights: { light: THREE.PointLight; intensity: number }[]; glow: { mat: THREE.MeshStandardMaterial; intensity: number }[] };
type RunningStatus = 'building' | 'playing' | 'transitioning';
const TRANSITION_SECONDS = 3;

/** Authored worlds share one undo point; each replacement disposes the previous world. */
export class LofiSession {
  private id = '';
  private status: 'idle' | RunningStatus | 'paused' | 'stopped' = 'idle';
  private previous: RunningStatus = 'building';
  private elapsed = 0;
  private duration = 32;
  private mood: LightingPreset = 'moonlit';
  private seed = 42;
  private planned: Placement[] = [];
  private reveals: Reveal[] = [];
  private added = 0;
  private fading = false;
  private resumeMusic = false;
  private pausedVolume = 0.38;
  private motion: MotionMode = 'cinematic';
  private time = 0;
  private animationVersion = -1;
  private animated: SceneEntry[] = [];
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scene: LofiScene = 'lakeside_cabin';
  private cycle = false;
  private holdSeconds = 180;
  private holdElapsed = 0;
  private completed = 0;
  private transition: { target: LofiScene; elapsed: number; replaced: boolean } | null = null;
  private replacing = false;
  private ownedVersion = 0;
  private initialMusicFade = true;
  private pauseReason = '';

  constructor(private store: SceneStore, private studio: Studio, private select: (id: string | null) => void) {
    const onClear = store.onClear;
    store.onClear = () => { if (!this.replacing) this.stop(); onClear?.(); };
    const onHumanEdit = store.onHumanEdit;
    store.onHumanEdit = id => { this.humanTakeover(); onHumanEdit?.(id); };
    studio.onFrame(dt => this.update(dt));
  }

  preferMotion(mode: MotionMode) { this.motion = mode; }

  get building() {
    const active = this.status === 'paused' ? this.previous : this.status;
    return active === 'building' || active === 'transitioning';
  }
  get state() {
    const p = Math.min(1, this.elapsed / this.duration);
    const index = LOFI_SCENES.findIndex(scene => scene.id === this.scene);
    const current = LOFI_SCENES[index], next = LOFI_SCENES[(index + 1) % LOFI_SCENES.length];
    const transitionProgress = this.transition ? this.transition.elapsed / TRANSITION_SECONDS : 0;
    const opacity = this.reduced || this.status === 'paused' || !this.transition ? 0 : 1 - Math.abs(2 * transitionProgress - 1);
    return { session_id: this.id || null, status: this.status, mood: this.mood, seed: this.seed,
      scene: this.scene, scene_title: current.title,
      progress: Math.round(p * 100), elapsed_seconds: Math.round(this.elapsed * 10) / 10, build_seconds: this.duration,
      phase: this.status === 'idle' ? 'Ready when you are' : this.status === 'stopped' ? 'Session stopped' :
        this.transition ? `Drifting into ${LOFI_SCENES.find(scene => scene.id === this.transition!.target)!.title.toLowerCase()}` :
        p < 0.12 ? current.welcome : p < 0.25 ? current.home : p < 0.62 ? 'Let the forest grow' : p < 0.8 ? 'Follow the lanterns' : p < 1 ? 'Let the music in' : 'Stay a little longer',
      objects_created: this.added, objects_planned: this.planned.length,
      pause_reason: this.pauseReason,
      sequence: { enabled: this.cycle, index, length: LOFI_SCENES.length,
        next_scene: this.transition && !this.transition.replaced ? this.transition.target : next.id,
        next_title: this.transition && !this.transition.replaced ? LOFI_SCENES.find(scene => scene.id === this.transition!.target)!.title : next.title,
        hold_seconds: this.holdSeconds, remaining_seconds: Math.max(0, Math.ceil(this.holdSeconds - this.holdElapsed)),
        completed: this.completed, transition_opacity: Math.max(0, Math.min(1, opacity)) },
      reduced_motion: this.reduced, camera: this.studio.director.state, music: musicState() };
  }

  start(args: Record<string, unknown>) {
    const mood = args.mood ?? 'moonlit', seconds = args.build_seconds ?? 32, seed = args.seed ?? 42;
    const motion = args.camera ?? 'cinematic', music = args.music ?? true;
    const scene = args.scene ?? 'lakeside_cabin', cycle = args.cycle ?? false, hold = args.hold_seconds ?? 180;
    if (!['moonlit', 'golden_hour'].includes(String(mood))) return { ok: false, code: 'invalid_request', error: 'mood must be moonlit or golden_hour.' };
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 12 || seconds > 90) return { ok: false, code: 'invalid_request', error: 'build_seconds must be 12–90.' };
    if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) return { ok: false, code: 'invalid_request', error: 'seed must be an integer.' };
    if (!['orbit', 'cinematic'].includes(String(motion)) || typeof music !== 'boolean') return { ok: false, code: 'invalid_request', error: 'camera must be orbit or cinematic; music must be boolean.' };
    if (!isLofiScene(scene) || typeof cycle !== 'boolean') return { ok: false, code: 'invalid_request', error: 'scene must be lakeside_cabin, lantern_grove or island_hideaway; cycle must be boolean.' };
    if (typeof hold !== 'number' || !Number.isFinite(hold) || hold < 120 || hold > 1800) return { ok: false, code: 'invalid_request', error: 'hold_seconds must be 120–1800.' };
    this.stop();
    this.id = `lofi_${Date.now().toString(36)}`;
    this.mood = mood as LightingPreset; this.seed = seed; this.duration = seconds; this.motion = motion as MotionMode;
    this.cycle = cycle; this.holdSeconds = hold; this.completed = 0; this.initialMusicFade = true;
    this.beginBuild(scene);
    setMusic(music, 0);
    return { ok: true, ...this.state, accepted: true, note: 'Construction started. cycle advances through three authored worlds after each hold; control_lofi next advances intentionally. Human takeover pauses the entire sequence. Pause/resume/stop remain available, and undo restores the scene before this composition. Music can require a click.' };
  }

  pause(reason = 'Lofi session paused') {
    if (this.status !== 'building' && this.status !== 'playing' && this.status !== 'transitioning') return;
    this.previous = this.status; this.status = 'paused';
    this.pauseReason = reason;
    this.studio.director.pause(reason);
    cancelAllToolTweens();
    this.resumeMusic = isMusicOn(); this.pausedVolume = musicState().volume;
    setMusic(false);
  }
  resume() {
    if (this.status !== 'paused') return false;
    this.status = this.previous;
    this.pauseReason = ''; this.ownedVersion = this.store.version;
    if (this.resumeMusic) {
      setMusic(true, this.pausedVolume);
      if (this.initialMusicFade && this.fading) fadeMusic(0.38, 5);
    }
    if (!this.reduced && this.studio.director.state.status === 'paused') this.studio.director.resume();
    return true;
  }
  humanTakeover() {
    this.studio.director.pause('You took the camera');
    this.pause('You have control. The scene sequence is paused.');
  }
  next(): boolean {
    if (this.status === 'idle' || this.status === 'stopped' || this.transition) return false;
    if (this.status === 'paused' && this.resumeMusic) setMusic(true, this.pausedVolume);
    const index = LOFI_SCENES.findIndex(scene => scene.id === this.scene);
    this.beginTransition(LOFI_SCENES[(index + 1) % LOFI_SCENES.length].id);
    return true;
  }
  stop() {
    this.animationVersion = -1; this.animated = [];
    if (this.status !== 'idle' && this.status !== 'stopped') cancelAllToolTweens();
    if (this.status !== 'idle') this.status = 'stopped';
    this.transition = null; this.pauseReason = '';
    this.studio.director.stop();
    // Freeze at full size before handing partially built objects to normal editing.
    this.reveals.forEach(r => this.reveal(r, 1)); this.reveals = [];
    setMusic(false);
  }

  private beginBuild(scene: LofiScene): void {
    cancelAllToolTweens(); this.studio.director.stop(); this.select(null);
    for (const entry of this.store.all()) { entry.group.removeFromParent(); disposeObject(entry.group); }
    this.replacing = true;
    try { this.store.clear(); } finally { this.replacing = false; }
    this.store.bump();
    this.scene = scene; this.status = 'building'; this.pauseReason = '';
    this.elapsed = 0; this.added = 0; this.fading = false; this.holdElapsed = 0;
    this.planned = planLofiScene(scene, this.seed); this.reveals = [];
    this.animationVersion = -1; this.animated = [];
    const camera = LOFI_SCENES.find(def => def.id === scene)!.camera;
    this.studio.applyLighting(this.mood, 0.8, undefined, this.reduced ? 0 : 7000);
    this.studio.flyTo({ position: new THREE.Vector3(...camera).multiplyScalar(Math.max(1, 1 / this.studio.camera.aspect)), target: new THREE.Vector3(0, 1, 0), fov: 42 }, this.reduced ? 0 : 7000, 'cinematic');
    this.ownedVersion = this.store.version;
  }

  private beginTransition(target: LofiScene): void {
    cancelAllToolTweens(); this.studio.director.pause('Changing scenes');
    this.pauseReason = ''; this.ownedVersion = this.store.version;
    if (this.reduced) { this.beginBuild(target); return; }
    this.transition = { target, elapsed: 0, replaced: false };
    this.status = 'transitioning';
  }

  private reveal(r: Reveal, k: number) {
    if (this.store.get(r.entry.id) !== r.entry || r.entry.humanRevision > 0) return;
    const p = k * k * (3 - 2 * k);
    r.entry.group.scale.copy(r.scale).multiplyScalar(Math.max(0.001, p));
    r.lights.forEach(l => { l.light.intensity = l.intensity * p; });
    r.glow.forEach(l => { l.mat.emissiveIntensity = l.intensity * p; });
  }

  private update(dt: number) {
    if (document.hidden) return;
    if (!this.reduced && this.status !== 'paused') this.time += dt;
    if (this.animationVersion !== this.store.version) {
      this.animationVersion = this.store.version;
      this.animated = this.store.all().filter(e => typeof e.group.userData.tick === 'function');
    }
    for (const e of this.animated) e.group.userData.tick(this.time);
    if ((this.status === 'building' || this.status === 'playing' || this.status === 'transitioning') && this.store.version !== this.ownedVersion) {
      this.pause('The scene changed. Resume when you want the sequence to continue.');
      return;
    }
    if (this.status === 'transitioning' && this.transition) {
      const transition = this.transition;
      transition.elapsed = Math.min(TRANSITION_SECONDS, transition.elapsed + dt);
      if (!transition.replaced && transition.elapsed >= TRANSITION_SECONDS / 2) {
        this.beginBuild(transition.target);
        transition.replaced = true;
        // Seed the first object while the overlay is dark; stopping here still
        // hands back an editable scene rather than an empty canvas.
        this.advanceBuild(this.duration * 0.015);
        this.status = 'transitioning';
      }
      if (transition.elapsed >= TRANSITION_SECONDS) {
        this.transition = null;
        this.status = 'building';
      }
      return;
    }
    if (this.status === 'playing') {
      if (this.cycle) {
        this.holdElapsed = Math.min(this.holdSeconds, this.holdElapsed + dt);
        if (this.holdElapsed >= this.holdSeconds) this.next();
      }
      return;
    }
    if (this.status !== 'building') return;
    this.advanceBuild(dt);
  }

  private advanceBuild(dt: number): void {
    this.studio.invalidateShadows();
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const p = this.elapsed / this.duration;
    while (this.added < this.planned.length && this.planned[this.added].at <= p) {
      const plan = this.planned[this.added++];
      const entry = this.store.spawn(plan.type, { name: plan.name, scale: plan.scale, rotationYDeg: plan.turn });
      entry.group.position.set(plan.x, 0, plan.z); this.studio.scene.add(entry.group);
      const lights: Reveal['lights'] = [];
      entry.group.traverse(o => { if (o instanceof THREE.PointLight) lights.push({ light: o, intensity: o.intensity }); });
      const reveal = { entry, at: this.elapsed, scale: entry.group.scale.clone(), lights, glow: entry.materials.filter(m => m.emissiveIntensity > 0).map(mat => ({ mat, intensity: mat.emissiveIntensity })) };
      this.reveals.push(reveal); this.reveal(reveal, this.reduced ? 1 : 0); this.store.bump();
    }
    for (const reveal of this.reveals) this.reveal(reveal, this.reduced ? 1 : Math.min(1, (this.elapsed - reveal.at) / 2.4));
    if (p >= 0.8 && !this.fading) {
      this.fading = true;
      if (this.initialMusicFade) fadeMusic(0.38, Math.max(3, this.duration * 0.2));
      this.studio.applyLighting(this.mood, 1, undefined, this.reduced ? 0 : 5000);
      if (!this.reduced) this.studio.director.start(this.motion, 240, new THREE.Vector3(0, 0.9, 0));
    }
    if (p >= 1) {
      this.reveals.forEach(r => this.reveal(r, 1)); this.reveals = [];
      this.status = 'playing'; this.completed++; this.initialMusicFade = false; this.holdElapsed = 0;
      this.store.bump();
    }
    this.ownedVersion = this.store.version;
  }
}
