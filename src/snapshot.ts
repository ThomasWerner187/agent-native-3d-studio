import * as THREE from 'three';
import type { SceneStore } from './store';
import type { Studio } from './scene';
import { isObjectType, disposeObject } from './factory';
import { LIGHTING_PRESETS } from './scene';

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
  schema_version?: number;
  scene_version?: number;
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

/** Portable export schema. schema_version 2 is the current one. */
const MAX_EXPORT_OBJECTS = 600;

function migrateExport(raw: Record<string, unknown>): { ok: boolean; data?: SnapshotData; error?: string } {
  const schema = raw.schema_version ?? (raw.v === 1 ? 1 : null);
  if (schema === 1) {
    // v1: { v:1, idCounter, version, lighting, camera, objects }
    return { ok: true, data: { ...raw, v: 2, schema_version: 2 } as SnapshotData };
  }
  if (schema === 2 && Array.isArray(raw.objects)) {
    return { ok: true, data: raw as unknown as SnapshotData };
  }
  return { ok: false, error: 'unsupported schema_version (expected 1 or 2)' };
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

  /** Remove a snapshot without restoring it (failed/no-op transactions). */
  discard(id: string): void {
    this.ring = this.ring.filter((s) => s.id !== id);
  }

  /** Restore the newest snapshot WITHOUT popping it (atomic batch rollback). */
  restoreLast(): boolean {
    const snap = this.ring[this.ring.length - 1];
    if (!snap) return false;
    restore(this.store, this.studio, snap.data);
    this.store.bump();
    return true;
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

  /** Full scene as portable JSON (objects + camera + lighting + versions). */
  exportJson(): string {
    const snap = serialize(this.store, this.studio);
    return JSON.stringify({
      schema_version: 2,
      scene_version: snap.version,
      id_counter: snap.idCounter,
      lighting: snap.lighting,
      camera: snap.camera,
      objects: snap.objects,
    });
  }

  /**
   * Replace the scene with an exported JSON. The payload is fully validated
   * BEFORE the current scene is touched. Snapshot ownership: call with
   * captureUndo=true only when no central invoke() layer already captured.
   */
  importJson(json: string, opts: { captureUndo?: boolean } = {}): { ok: boolean; restored?: number; error?: string } {
    if (json.length > 4_000_000) return { ok: false, error: 'payload too large (max 4 MB)' };
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(json) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'not valid JSON' };
    }
    const migrated = migrateExport(raw);
    if (!migrated.ok) return { ok: false, error: migrated.error };
    const data = migrated.data as SnapshotData;

    // validate everything before destroying the live scene
    if (!Array.isArray(data.objects) || data.objects.length > MAX_EXPORT_OBJECTS) {
      return { ok: false, error: `objects must be an array with at most 600 entries` };
    }
    const presets = LIGHTING_PRESETS as readonly string[];
    if (data.lighting && !presets.includes(data.lighting.preset)) {
      return { ok: false, error: `unknown lighting preset "${data.lighting.preset}"` };
    }
    if (data.camera) {
      const c = data.camera;
      if (![c.p, c.t].every((v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n))) || !Number.isFinite(c.fov)) {
        return { ok: false, error: 'camera must be {p:[x,y,z], t:[x,y,z], fov:number}' };
      }
    }
    for (const o of data.objects) {
      if (!isObjectType(o.type)) return { ok: false, error: `unknown object type "${o.type}"` };
      if (![o.p, o.s].every((v) => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n)))) {
        return { ok: false, error: `object "${o.id}" has a malformed pose/scale` };
      }
      if (o.p.some((n) => Math.abs(n) > 60) || o.s.some((n) => n < 0.01 || n > 10)) {
        return { ok: false, error: `object "${o.id}" out of bounds` };
      }
    }

    if (opts.captureUndo) this.capture('before import');
    restore(this.store, this.studio, data);
    this.store.bump();
    return { ok: true, restored: data.objects.length };
  }

  count(): number {
    return this.ring.length;
  }
}
