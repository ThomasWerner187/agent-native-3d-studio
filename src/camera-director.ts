import * as THREE from 'three';
import { cancelCameraTween } from './anim';
import type { Studio } from './scene';

export type MotionMode = 'orbit' | 'cinematic';

/** A background camera, not a never-resolving tool call. Human input wins. */
export class CameraDirector {
  private status: 'stopped' | 'running' | 'paused' = 'stopped';
  private mode: MotionMode = 'cinematic';
  private period = 240;
  private elapsed = 0;
  private phase = 0;
  private radius = 26;
  private height = 16;
  private focus = new THREE.Vector3();
  private fromPosition = new THREE.Vector3();
  private fromTarget = new THREE.Vector3();
  private fromFov = 42;
  private blend = 0;
  private reason = '';

  constructor(private studio: Studio) {}

  get state() {
    return { status: this.status, mode: this.mode, loop_seconds: this.period,
      elapsed_seconds: Math.round(this.elapsed * 10) / 10, loops: Math.floor(this.elapsed / this.period),
      shot: this.mode === 'orbit' ? 'Endless orbit' : this.shot,
      infinite: this.status !== 'stopped', reason: this.reason };
  }

  private get shot(): string {
    const part = ((this.elapsed / this.period) % 1) * 4;
    return ['Lakeside approach', 'Through the treetops', 'Moonlit panorama', 'Homeward drift'][Math.floor(part)];
  }

  start(mode: MotionMode, period = 240, focus?: THREE.Vector3): void {
    cancelCameraTween();
    this.studio.noteActivity();
    this.mode = mode; this.period = period; this.elapsed = 0;
    this.focus.copy(focus ?? this.studio.controls.target);
    const offset = this.studio.camera.position.clone().sub(this.focus);
    this.phase = Math.atan2(offset.x, offset.z);
    const framing = Math.max(1, 1 / this.studio.camera.aspect);
    this.radius = Math.max(9, Math.hypot(offset.x, offset.z) / framing);
    this.height = Math.max(5, offset.y / framing);
    this.status = 'running'; this.reason = '';
    this.captureBlend();
  }

  pause(reason = 'Paused'): void {
    if (this.status !== 'running') return;
    this.status = 'paused'; this.reason = reason;
  }

  resume(): boolean {
    if (this.status !== 'paused') return false;
    cancelCameraTween();
    this.captureBlend();
    this.status = 'running'; this.reason = '';
    return true;
  }

  stop(): void { this.status = 'stopped'; this.reason = ''; }

  private captureBlend(): void {
    this.fromPosition.copy(this.studio.camera.position);
    this.fromTarget.copy(this.studio.controls.target);
    this.fromFov = this.studio.camera.fov;
    this.blend = 0;
  }

  update(dt: number): void {
    if (this.status !== 'running' || document.hidden) return;
    // Studio excludes hidden-tab time; visible elapsed time is independent of FPS.
    this.elapsed += dt; this.blend = Math.min(1, this.blend + dt / 8);
    const t = this.elapsed / this.period * Math.PI * 2;
    const a = this.phase + t;
    const cinematic = this.mode === 'cinematic';
    const scale = Math.max(1, 1 / this.studio.camera.aspect);
    const island = this.studio.terrain.radius;
    // A periodic, continuous path: no cuts, endpoint snaps or camera through trees.
    const r = cinematic ? Math.max(20, island * 1.95) * (1 - 0.16 * Math.sin(t)) : this.radius;
    const h = cinematic ? Math.max(11, island * 1.1) + 4 * (1 - Math.cos(t)) : this.height;
    const target = this.focus.clone();
    if (cinematic) target.add(new THREE.Vector3(Math.sin(t) * 0.65, 0.5 + Math.sin(t * 2) * 0.3, Math.sin(t * 2) * 0.4));
    const position = new THREE.Vector3(Math.sin(a) * r * scale, h * scale, Math.cos(a) * r * scale).add(this.focus);
    const k = this.blend ** 3 * (this.blend * (this.blend * 6 - 15) + 10);
    this.studio.camera.position.lerpVectors(this.fromPosition, position, k);
    this.studio.controls.target.lerpVectors(this.fromTarget, target, k);
    this.studio.camera.fov = THREE.MathUtils.lerp(this.fromFov, cinematic ? 42 + 2 * Math.sin(t) : this.fromFov, k);
    this.studio.camera.updateProjectionMatrix();
  }
}
