import * as THREE from 'three';
import { MAX_SCENE_OBJECTS, type SceneStore } from './store';
import type { Studio } from './scene';
import { isObjectType, disposeObject } from './factory';
import { LIGHTING_PRESETS } from './scene';
import { cancelAllToolTweens } from './anim';

/**
 * Reversibility: every mutating tool auto-captures a snapshot beforehand,
 * `undo` steps back, and the boot snapshot powers the one-click Reset.
 * Chrome's WebMCP guidance asks for reversibility as a trust primitive —
 * this is that, wired through the same WebMCP tool surface.
 */

interface MaterialState {
  color: string; roughness: number; metalness: number;
  emissive: string; emissiveIntensity: number; opacity: number;
}

function materialState(m: THREE.MeshStandardMaterial): MaterialState {
  return { color: `#${m.color.getHexString()}`, roughness: m.roughness, metalness: m.metalness,
    emissive: `#${m.emissive.getHexString()}`, emissiveIntensity: m.emissiveIntensity, opacity: m.opacity };
}

interface SerializedObject {
  id: string;
  name: string;
  type: string;
  /** Preset variant (chess piece kind) so undo rebuilds the same shape. */
  variant?: string;
  layoutRole?: 'path' | 'forest' | 'lantern';
  humanEdited?: boolean;
  materials?: MaterialState[];
  lights?: Array<{ color: string; intensity: number }>;
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
  lighting: { preset: string; intensity: number; azimuth?: number };
  camera: { p: [number, number, number]; t: [number, number, number]; fov: number };
  objects: SerializedObject[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteTuple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}

function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
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
    lighting: { preset: studio.currentPreset, intensity: studio.currentIntensity,
      azimuth: studio.currentAzimuth },
    camera: {
      p: [studio.camera.position.x, studio.camera.position.y, studio.camera.position.z],
      t: [studio.controls.target.x, studio.controls.target.y, studio.controls.target.z],
      fov: studio.camera.fov,
    },
    objects: store.all().map((e) => {
      const g = e.group;
      const m = e.materials[0];
      const lights: Array<{ color: string; intensity: number }> = [];
      g.traverse(o => { if (o instanceof THREE.PointLight) lights.push({ color: `#${o.color.getHexString()}`, intensity: o.intensity }); });
      return {
        id: e.id,
        name: e.name,
        type: e.type,
        variant: e.variant,
        layoutRole: e.layoutRole,
        humanEdited: e.humanRevision > 0,
        materials: e.materials.map(materialState),
        lights,
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
  const versionBefore = store.version;
  cancelAllToolTweens();
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
    entry.layoutRole = o.layoutRole;
    if (o.humanEdited) entry.humanRevision = ++store.humanRevision;
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
    o.materials?.forEach((state, index) => {
      const mat = entry.materials[index];
      if (!mat) return;
      mat.color.set(state.color); mat.roughness = state.roughness; mat.metalness = state.metalness;
      mat.emissive.set(state.emissive); mat.emissiveIntensity = state.emissiveIntensity;
      mat.opacity = state.opacity; mat.transparent = state.opacity < 1; mat.needsUpdate = true;
    });
    let lightIndex = 0;
    entry.group.traverse(object => {
      if (!(object instanceof THREE.PointLight)) return;
      const state = o.lights?.[lightIndex++];
      if (state) { object.color.set(state.color); object.intensity = state.intensity; }
    });
  }
  // A saved version is metadata from a past observation, never the current
  // concurrency token. The caller bumps this version after restoration.
  store.restoreCounters(data.idCounter, versionBefore);

  studio.applyLighting(data.lighting.preset as never, data.lighting.intensity, data.lighting.azimuth, 0);
  studio.camera.position.set(...data.camera.p);
  studio.controls.target.set(...data.camera.t);
  studio.camera.fov = data.camera.fov;
  studio.camera.updateProjectionMatrix();
  studio.controls.update();
}

/** Portable export schema. schema_version 2 is the current one. */
const MAX_EXPORT_OBJECTS = MAX_SCENE_OBJECTS;

function migrateExport(raw: Record<string, unknown>): { ok: boolean; data?: SnapshotData; error?: string } {
  const schema = raw.schema_version ?? (raw.v === 1 ? 1 : null);
  if (schema === 1) {
    // v1: { v:1, idCounter, version, lighting, camera, objects }
    return { ok: true, data: { ...raw, v: 2, schema_version: 2 } as SnapshotData };
  }
  if (schema === 2 && Array.isArray(raw.objects)) {
    // Public v2 uses snake_case; the in-memory snapshot format uses camelCase.
    // Normalize once at the boundary so share links and undo use one contract.
    return {
      ok: true,
      data: {
        v: 2,
        schema_version: 2,
        version: raw.scene_version,
        idCounter: raw.id_counter,
        lighting: raw.lighting,
        camera: raw.camera,
        objects: raw.objects,
      } as SnapshotData,
    };
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
    return this.restoreSnapshot(snap.id);
  }

  /** Restore the transaction's own capture, even if a human saved another one. */
  restoreSnapshot(id: string): boolean {
    const snap = this.ring.find(s => s.id === id);
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
    if (!isRecord(raw)) return { ok: false, error: 'payload must be a JSON object' };
    const migrated = migrateExport(raw);
    if (!migrated.ok) return { ok: false, error: migrated.error };
    const data = migrated.data as SnapshotData;

    // Validate everything before destroying the live scene. Imported links are
    // user-controlled input, not trusted internal snapshots.
    if (!Array.isArray(data.objects) || data.objects.length > MAX_EXPORT_OBJECTS) {
      return { ok: false, error: `objects must be an array with at most 600 entries` };
    }
    if (!Number.isSafeInteger(data.version) || data.version < 0) {
      return { ok: false, error: 'scene_version must be a non-negative integer' };
    }
    if (!Number.isSafeInteger(data.idCounter) || data.idCounter < 0 || data.idCounter > Number.MAX_SAFE_INTEGER - MAX_SCENE_OBJECTS) {
      return { ok: false, error: 'id_counter must be a non-negative integer' };
    }
    const presets = LIGHTING_PRESETS as readonly string[];
    if (!isRecord(data.lighting) || typeof data.lighting.preset !== 'string' || !presets.includes(data.lighting.preset)) {
      return { ok: false, error: `unknown or missing lighting preset` };
    }
    if (typeof data.lighting.intensity !== 'number' || !Number.isFinite(data.lighting.intensity) || data.lighting.intensity < 0 || data.lighting.intensity > 2) {
      return { ok: false, error: 'lighting.intensity must be a number between 0 and 2' };
    }
    if (data.lighting.azimuth != null && (typeof data.lighting.azimuth !== 'number' || !Number.isFinite(data.lighting.azimuth) || Math.abs(data.lighting.azimuth) > 360)) {
      return { ok: false, error: 'lighting.azimuth must be a number between -360 and 360' };
    }
    if (!isRecord(data.camera)) return { ok: false, error: 'camera is required' };
    {
      const c = data.camera;
      if (!isFiniteTuple(c.p) || !isFiniteTuple(c.t) || c.p.some(n => Math.abs(n) > 10_000) || c.t.some(n => Math.abs(n) > 10_000) || typeof c.fov !== 'number' || !Number.isFinite(c.fov) || c.fov < 10 || c.fov > 120) {
        return { ok: false, error: 'camera must be {p:[x,y,z], t:[x,y,z], fov:number}' };
      }
    }
    const ids = new Set<string>();
    let highestId = 0;
    for (const rawObject of data.objects) {
      if (!isRecord(rawObject)) return { ok: false, error: 'every object must be a JSON object' };
      const o = rawObject as unknown as SerializedObject;
      if (typeof o.id !== 'string' || !/^obj_\d+$/.test(o.id) || ids.has(o.id)) {
        return { ok: false, error: `object ids must be unique and match obj_N (got "${String(o.id)}")` };
      }
      ids.add(o.id);
      highestId = Math.max(highestId, Number(o.id.slice(4)));
      if (typeof o.name !== 'string' || o.name.length > 120) return { ok: false, error: `object "${o.id}" has an invalid name` };
      if (!isObjectType(o.type)) return { ok: false, error: `unknown object type "${String(o.type)}"` };
      if (o.layoutRole != null && !['path', 'forest', 'lantern'].includes(o.layoutRole)) return { ok: false, error: 'invalid layoutRole' };
      if (o.humanEdited != null && typeof o.humanEdited !== 'boolean') return { ok: false, error: 'invalid humanEdited' };
      if (o.materials != null && (!Array.isArray(o.materials) || o.materials.length > 64 || o.materials.some(m =>
        !isRecord(m) || !isHex(m.color) || !isHex(m.emissive) ||
        !['roughness', 'metalness', 'opacity'].every(k => typeof m[k] === 'number' && Number.isFinite(m[k]) && m[k] >= 0 && m[k] <= 1) ||
        typeof m.emissiveIntensity !== 'number' || !Number.isFinite(m.emissiveIntensity) || m.emissiveIntensity < 0 || m.emissiveIntensity > 5
      ))) return { ok: false, error: 'invalid material states' };
      if (o.lights != null && (!Array.isArray(o.lights) || o.lights.length > 32 || o.lights.some(l =>
        !isRecord(l) || !isHex(l.color) || typeof l.intensity !== 'number' || !Number.isFinite(l.intensity) || l.intensity < 0 || l.intensity > 100
      ))) return { ok: false, error: 'invalid light states' };
      if (!isFiniteTuple(o.p) || !isFiniteTuple(o.s)) {
        return { ok: false, error: `object "${o.id}" has a malformed pose/scale` };
      }
      // Slow reveals legitimately export tiny, nonzero scales while building.
      if (o.p.some((n) => Math.abs(n) > 60) || o.s.some((n) => n < 0.00001 || n > 10)) {
        return { ok: false, error: `object "${o.id}" out of bounds` };
      }
      if (!isFiniteTuple(o.r)) return { ok: false, error: `object "${o.id}" has a malformed rotation` };
      if (o.color != null && !isHex(o.color)) return { ok: false, error: `object "${o.id}" has an invalid color` };
      if (o.emissive != null && !isHex(o.emissive)) return { ok: false, error: `object "${o.id}" has an invalid emissive color` };
      if (o.roughness != null && (typeof o.roughness !== 'number' || !Number.isFinite(o.roughness) || o.roughness < 0 || o.roughness > 1)) return { ok: false, error: `object "${o.id}" has invalid roughness` };
      if (o.metalness != null && (typeof o.metalness !== 'number' || !Number.isFinite(o.metalness) || o.metalness < 0 || o.metalness > 1)) return { ok: false, error: `object "${o.id}" has invalid metalness` };
      if (o.emissiveIntensity != null && (typeof o.emissiveIntensity !== 'number' || !Number.isFinite(o.emissiveIntensity) || o.emissiveIntensity < 0 || o.emissiveIntensity > 5)) return { ok: false, error: `object "${o.id}" has invalid emissiveIntensity` };
      if (o.opacity != null && (typeof o.opacity !== 'number' || !Number.isFinite(o.opacity) || o.opacity < 0 || o.opacity > 1)) return { ok: false, error: `object "${o.id}" has invalid opacity` };
      if (o.type === 'chess_piece' && o.variant != null && !['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'].includes(o.variant)) return { ok: false, error: `object "${o.id}" has an invalid chess piece` };
    }
    if (data.idCounter < highestId) {
      return { ok: false, error: 'id_counter is lower than the highest object id' };
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
