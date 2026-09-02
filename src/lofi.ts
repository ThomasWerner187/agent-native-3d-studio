import * as THREE from 'three';
import type { Studio, LightingPreset } from './scene';
import type { SceneEntry, SceneStore } from './store';
import { disposeObject, type ObjectType } from './factory';
import { cancelAllToolTweens } from './anim';
import { random } from './art';
import { setMusic, fadeMusic, isMusicOn, musicState } from './ambience';
import type { MotionMode } from './camera-director';

type Placement = { type: ObjectType; name: string; x: number; z: number; scale: number | { x: number; y: number; z: number }; turn: number; at: number };
type Reveal = { entry: SceneEntry; at: number; scale: THREE.Vector3; lights: { light: THREE.PointLight; intensity: number }[]; glow: { mat: THREE.MeshStandardMaterial; intensity: number }[] };

/** Finite, incremental construction followed by an unbounded ambience session. */
export class LofiSession {
  private id = '';
  private status: 'idle' | 'building' | 'playing' | 'paused' | 'stopped' = 'idle';
  private previous: 'building' | 'playing' = 'building';
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

  constructor(private store: SceneStore, private studio: Studio, private select: (id: string | null) => void) {
    const onClear = store.onClear;
    store.onClear = () => { this.stop(); onClear?.(); };
    const onHumanEdit = store.onHumanEdit;
    store.onHumanEdit = id => { this.humanTakeover(); onHumanEdit?.(id); };
    studio.onFrame(dt => this.update(dt));
  }

  preferMotion(mode: MotionMode) { this.motion = mode; }

  get building() { return this.status === 'building' || (this.status === 'paused' && this.previous === 'building'); }
  get state() {
    const p = Math.min(1, this.elapsed / this.duration);
    return { session_id: this.id || null, status: this.status, mood: this.mood, seed: this.seed,
      progress: Math.round(p * 100), elapsed_seconds: Math.round(this.elapsed * 10) / 10, build_seconds: this.duration,
      phase: this.status === 'idle' ? 'Ready when you are' : this.status === 'stopped' ? 'Session stopped' :
        p < 0.12 ? 'A quiet place by the water' : p < 0.25 ? 'A cabin to come home to' : p < 0.62 ? 'Let the forest grow' : p < 0.8 ? 'Follow the lanterns' : p < 1 ? 'Let the music in' : 'Stay a little longer',
      objects_created: this.added, objects_planned: this.planned.length,
      reduced_motion: this.reduced, camera: this.studio.director.state, music: musicState() };
  }

  start(args: Record<string, unknown>) {
    const mood = args.mood ?? 'moonlit', seconds = args.build_seconds ?? 32, seed = args.seed ?? 42;
    const motion = args.camera ?? 'cinematic', music = args.music ?? true;
    if (!['moonlit', 'golden_hour'].includes(String(mood))) return { ok: false, code: 'invalid_request', error: 'mood must be moonlit or golden_hour.' };
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 12 || seconds > 90) return { ok: false, code: 'invalid_request', error: 'build_seconds must be 12–90.' };
    if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) return { ok: false, code: 'invalid_request', error: 'seed must be an integer.' };
    if (!['orbit', 'cinematic'].includes(String(motion)) || typeof music !== 'boolean') return { ok: false, code: 'invalid_request', error: 'camera must be orbit or cinematic; music must be boolean.' };
    this.stop(); cancelAllToolTweens(); this.select(null);
    const version = this.store.version;
    for (const entry of this.store.all()) { entry.group.removeFromParent(); disposeObject(entry.group); }
    this.store.clear(); this.store.restoreCounters(0, version + 1);
    this.id = `lofi_${Date.now().toString(36)}`;
    this.status = 'building'; this.elapsed = 0; this.added = 0; this.fading = false;
    this.mood = mood as LightingPreset; this.seed = seed; this.duration = seconds; this.motion = motion as MotionMode;
    this.planned = this.plan(seed); this.reveals = [];
    this.studio.applyLighting(this.mood, 0.8, undefined, this.reduced ? 1 : 7000);
    this.studio.flyTo({ position: new THREE.Vector3(17, 16, 25).multiplyScalar(Math.max(1, 1 / this.studio.camera.aspect)), target: new THREE.Vector3(0, 1, 0), fov: 42 }, this.reduced ? 1 : 7000, 'cinematic');
    setMusic(music, 0);
    return { ok: true, ...this.state, accepted: true, note: 'Construction started in the background. Read describe_scene for actual progress. control_lofi pauses, resumes or stops it; undo restores the previous scene. Music can require a user gesture.' };
  }

  pause() {
    if (this.status !== 'building' && this.status !== 'playing') return;
    this.previous = this.status; this.status = 'paused';
    this.studio.director.pause('Lofi session paused');
    cancelAllToolTweens();
    this.resumeMusic = isMusicOn(); this.pausedVolume = musicState().volume;
    setMusic(false);
  }
  resume() {
    if (this.status !== 'paused') return false;
    this.status = this.previous;
    if (this.resumeMusic) { setMusic(true, 0); fadeMusic(this.fading ? 0.38 : this.pausedVolume, 5); }
    if (!this.reduced && this.studio.director.state.status === 'paused') this.studio.director.resume();
    return true;
  }
  humanTakeover() {
    this.studio.director.pause('You took the camera');
    if (this.status === 'building') this.pause();
  }
  stop() {
    this.animationVersion = -1; this.animated = [];
    if (this.status !== 'idle' && this.status !== 'stopped') cancelAllToolTweens();
    if (this.status !== 'idle') this.status = 'stopped';
    this.studio.director.stop();
    // Freeze at full size before handing partially built objects to normal editing.
    this.reveals.forEach(r => this.reveal(r, 1)); this.reveals = [];
    setMusic(false);
  }

  private plan(seed: number): Placement[] {
    const r = random(seed), out: Placement[] = [];
    const add = (type: ObjectType, name: string, x: number, z: number, at: number, scale: Placement['scale'] = 1, turn = 0) => out.push({ type, name, x, z, at, scale, turn });
    add('pond', 'Mirror pond', -4.2, 3, 0.01);
    add('cabin', 'Lantern cabin', 1.8, -1.8, 0.12);
    for (let i = 0; i < 26; i++) {
      const a = 2.6 + (i / 26) * 4.55;
      const radius = 7.4 + r() * 1.6;
      add('tree', `Quiet pine ${i + 1}`, Math.cos(a) * radius, Math.sin(a) * radius, 0.23 + i / 26 * 0.36, 0.68 + r() * 0.43, r() * 360);
    }
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      add('rock', `Moonstone path ${i + 1}`, 2.5 + Math.sin(t * 3.2) * 0.65, 3 + t * 5.2, 0.56 + i * 0.013, { x: 0.9, y: 0.22, z: 0.65 }, t * 90);
    }
    for (let i = 0; i < 5; i++) add('lamp', `Evening lantern ${i + 1}`, i < 3 ? 4.1 : -7.3 + (i - 3) * 1.8, i < 3 ? 3.6 + i * 1.6 : 4.6, 0.67 + i * 0.02, 1.25);
    add('rock', 'Shore stone', -6.8, 0.9, 0.52, 1.3);
    add('rock', 'Old mossy stone', 6.1, -2, 0.54, 1.7);
    return out.sort((a, b) => a.at - b.at);
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
    dt = Math.min(dt, 0.1);
    if (!this.reduced && this.status !== 'paused') this.time += dt;
    if (this.animationVersion !== this.store.version) {
      this.animationVersion = this.store.version;
      this.animated = this.store.all().filter(e => typeof e.group.userData.tick === 'function');
    }
    for (const e of this.animated) e.group.userData.tick(this.time);
    if (this.status !== 'building') return;
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
      this.fading = true; fadeMusic(0.38, Math.max(3, this.duration * 0.2));
      this.studio.applyLighting(this.mood, 1, undefined, this.reduced ? 1 : 5000);
      if (!this.reduced) this.studio.director.start(this.motion, 240, new THREE.Vector3(0, 0.9, 0));
    }
    if (p >= 1) { this.reveals.forEach(r => this.reveal(r, 1)); this.reveals = []; this.status = 'playing'; this.store.bump(); }
  }
}
