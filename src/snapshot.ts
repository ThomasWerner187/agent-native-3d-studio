import * as THREE from 'three';
import type { SceneStore } from './store';
import type { Studio } from './scene';
import { isObjectType, disposeObject } from './factory';

/**
 * Reversibility: every mutating tool auto-captures a snapshot beforehand,
 * `undo` steps back, and the boot snapshot powers the one-click Reset.
 * Chrome's WebMCP guidance asks for reversibility as a trust primitive —
 * this is that, wired through the same WebMCP tool surface.
 */

interface SerializedObject {
  id: string;
  name: string;
  type: string;
  /** Preset variant (chess piece kind) so undo rebuilds the same shape. */
  variant?: string;
  p: [number, number, number];
  r: [number, number, number];
  s: [number, number, number];
  color?: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
}

interface SnapshotData {
  /** Export format version (present on imported/exported JSON). */
  v?: number;
  idCounter: number;
  version: number;
  lighting: { preset: string; intensity: number };
  camera: { p: [number, number, number]; t: [number, number, number]; fov: number };
  objects: SerializedObject[];
}

export interface Snapshot {
  id: string;
  label: string;
  at: number;
  data: SnapshotData;
}

let snapCounter = 0;

function serialize(store: SceneStore, studio: Studio): SnapshotData {
  return {
    idCounter: store.idCount,
    version: store.version,
    lighting: { preset: studio.currentPreset, intensity: studio.currentIntensity },
    camera: {
      p: [studio.camera.position.x, studio.camera.position.y, studio.camera.position.z],
      t: [studio.controls.target.x, studio.controls.target.y, studio.controls.target.z],
      fov: studio.camera.fov,
    },
    objects: store.all().map((e) => {
      const g = e.group;
      const m = e.materials[0];
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        variant: e.variant,
        p: [g.position.x, g.position.y, g.position.z],
        r: [g.rotation.x, g.rotation.y, g.rotation.z],
        s: [g.scale.x, g.scale.y, g.scale.z],
        color: m ? `#${m.color.getHexString()}` : undefined,
        roughness: m?.roughness,
        metalness: m?.metalness,
        emissive: m && m.emissive.getHex() !== 0 ? `#${m.emissive.getHexString()}` : undefined,
        emissiveIntensity: m?.emissiveIntensity,
        opacity: m && m.transparent ? m.opacity : undefined,
      };
    }),
  };
}

function restore(store: SceneStore, studio: Studio, data: SnapshotData): void {
  for (const e of store.all()) {
    studio.scene.remove(e.group);
    disposeObject(e.group);
  }
  store.clear();

  for (const o of data.objects) {
    if (!isObjectType(o.type)) continue;
    const entry = store.spawn(o.type, {
      forceId: o.id,
      name: o.name,
      variant: o.variant,
      scale: { x: o.s[0], y: o.s[1], z: o.s[2] },
    });
    entry.group.position.set(o.p[0], o.p[1], o.p[2]);
    entry.group.rotation.set(o.r[0], o.r[1], o.r[2]);
    studio.scene.add(entry.group);
    const m = entry.materials[0];
    if (m) {
      if (o.color) m.color.set(o.color);
      if (o.roughness != null) m.roughness = o.roughness;
      if (o.metalness != null) m.metalness = o.metalness;
      if (o.emissive) m.emissive.set(o.emissive);
      if (o.emissiveIntensity != null) m.emissiveIntensity = o.emissiveIntensity;
      if (o.opacity != null) {
        m.transparent = o.opacity < 1;
        m.opacity = o.opacity;
      }
    }
    const light = entry.group.userData.light as THREE.PointLight | undefined;
    if (light && m) {
      light.intensity = 6 * Math.min(4, Math.max(0, m.emissiveIntensity));
      light.color.copy(m.emissive);
    }
  }
  store.version = data.version;

  studio.applyLighting(data.lighting.preset as never, data.lighting.intensity);
  studio.camera.position.set(...data.camera.p);
  studio.controls.target.set(...data.camera.t);
  studio.camera.fov = data.camera.fov;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
}

export class SnapshotManager {
  private boot: Snapshot | null = null;
  private ring: Snapshot[] = [];
  private static readonly MAX = 12;

  constructor(
    private store: SceneStore,
    private studio: Studio,
  ) {}

  /** Capture and remember a snapshot. Returns its id. */
  capture(label: string): string {
    const snap: Snapshot = {
      id: `snap_${++snapCounter}`,
      label,
      at: Date.now(),
      data: serialize(this.store, this.studio),
    };
    this.ring.push(snap);
    if (this.ring.length > SnapshotManager.MAX) this.ring.shift();
    return snap.id;
  }

  /** Pin the pristine state once, right after the starter scene is built. */
  captureBoot(): void {
    this.boot = {
      id: 'snap_boot',
      label: 'boot',
      at: Date.now(),
      data: serialize(this.store, this.studio),
    };
  }

  /** Undo: restore and drop the most recent snapshot. */
  undo(): { ok: boolean; snapshot_id?: string; label?: string; error?: string } {
    const snap = this.ring.pop();
    if (!snap) return { ok: false, error: 'Nothing to undo — no earlier snapshot exists.' };
    restore(this.store, this.studio, snap.data);
    this.store.bump();
    return { ok: true, snapshot_id: snap.id, label: snap.label };
  }

  /** Restore the pinned boot snapshot without touching the ring. */
  resetToBoot(): boolean {
    if (!this.boot) return false;
    restore(this.store, this.studio, this.boot.data);
    this.store.bump();
    return true;
  }

  /** Full scene as portable JSON (objects + camera + lighting + id counter). */
  exportJson(): string {
    const snap = serialize(this.store, this.studio);
    return JSON.stringify({ v: 1, idCounter: snap.idCounter, lighting: snap.lighting, camera: snap.camera, objects: snap.objects });
  }

  /**
   * Replace the scene with an exported JSON. Captures an undo snapshot
   * first, so imports are as reversible as every other mutation.
   */
  importJson(json: string): { ok: boolean; restored?: number; error?: string } {
    let data: SnapshotData;
    try {
      data = JSON.parse(json) as SnapshotData;
    } catch {
      return { ok: false, error: 'not valid JSON' };
    }
    if (!data || data.v !== 1 || !Array.isArray(data.objects)) {
      return { ok: false, error: 'expected export format {"v":1,"objects":[...]}' };
    }
    this.capture('before import');
    restore(this.store, this.studio, data);
    this.store.bump();
    return { ok: true, restored: data.objects.length };
  }

  count(): number {
    return this.ring.length;
  }
}
