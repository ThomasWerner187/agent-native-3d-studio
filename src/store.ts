import * as THREE from 'three';
import { buildObject, type ObjectType } from './factory';

/**
 * The scene registry — the single source of truth both the mouse (selection,
 * dragging) and the agent (WebMCP tools) read from and write to.
 */

export interface SceneEntry {
  id: string;
  name: string;
  type: ObjectType;
  /** Preset variant, e.g. the chess piece kind ('queen'); survives snapshots. */
  variant?: string;
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
}

export interface ResolveOk { ok: true; entry: SceneEntry }
export interface ResolveErr { ok: false; error: string }

export class SceneStore {
  private objects = new Map<string, SceneEntry>();
  private idCounter = 0;
  private typeCounters = new Map<ObjectType, number>();
  /** Increments on every content mutation; returned by tools and describe_scene. */
  version = 0;

  /** Highest id handed out (read for snapshot serialization). */
  get idCount(): number {
    return this.idCounter;
  }

  get size(): number {
    return this.objects.size;
  }

  bump(): number {
    return ++this.version;
  }

  /** Restore serialized counters without exposing the registry map itself. */
  restoreCounters(idCounter: number, version: number): void {
    this.idCounter = idCounter;
    this.version = version;
  }

  all(): SceneEntry[] {
    return [...this.objects.values()];
  }

  get(id: string): SceneEntry | undefined {
    return this.objects.get(id);
  }

  /** Find an entry by the group object. */
  byGroup(group: THREE.Object3D): SceneEntry | undefined {
    return this.all().find((e) => e.group === group);
  }

  spawn(
    type: ObjectType,
    opts: {
      name?: string;
      scale?: number | { x: number; y: number; z: number };
      rotationYDeg?: number;
      /** Preset variant (chess piece kind); rebuilt identically by snapshots. */
      variant?: string;
      /** Used when restoring snapshots so object ids stay stable. */
      forceId?: string;
    } = {},
  ): SceneEntry {
    const built = buildObject(type, opts.variant, (this.typeCounters.get(type) ?? 0) + 1);
    if (typeof opts.scale === 'number') built.group.scale.setScalar(opts.scale);
    else if (opts.scale) built.group.scale.set(opts.scale.x, opts.scale.y, opts.scale.z);
    if (opts.rotationYDeg) built.group.rotation.y = THREE.MathUtils.degToRad(opts.rotationYDeg);

    if (opts.forceId != null) {
      const n = Number(opts.forceId.replace('obj_', ''));
      if (Number.isFinite(n)) this.idCounter = Math.max(this.idCounter, n);
    }
    const id = opts.forceId ?? `obj_${++this.idCounter}`;
    const n2 = (this.typeCounters.get(type) ?? 0) + 1;
    this.typeCounters.set(type, n2);
    const entry: SceneEntry = {
      id,
      name: opts.name?.trim() || `${type} ${n2}`,
      type,
      variant: opts.variant,
      group: built.group,
      materials: built.materials,
    };
    built.group.userData.entryId = id;
    this.objects.set(id, entry);
    return entry;
  }

  remove(id: string): boolean {
    return this.objects.delete(id);
  }

  clear(): void {
    this.objects.clear();
    this.typeCounters.clear();
    this.idCounter = 0;
    this.version = 0;
  }

  /**
   * Resolve a target by id ("obj_3") or by name (case-insensitive, unique
   * substring match). Returns a descriptive error the agent can act on.
   */
  resolve(query: string): ResolveOk | ResolveErr {
    const q = String(query ?? '').trim();
    if (!q) return { ok: false, error: 'Missing target: pass an object id (e.g. "obj_3") or an object name.' };
    const byId = this.objects.get(q);
    if (byId) return { ok: true, entry: byId };
    const byName = this.all().filter((e) => e.name.toLowerCase() === q.toLowerCase());
    if (byName.length === 1) return { ok: true, entry: byName[0] };
    const partial = this.all().filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
    if (partial.length === 1) return { ok: true, entry: partial[0] };
    if (partial.length > 1) {
      return {
        ok: false,
        error: `Ambiguous target "${q}" matches ${partial.length} objects: ${partial.map((e) => `${e.name} (${e.id})`).join(', ')}. Use an id.`,
      };
    }
    const names = this.all().slice(0, 8).map((e) => `${e.name} (${e.id})`);
    return {
      ok: false,
      error: `No object named "${q}". Known objects: ${names.join(', ')}${this.size > 8 ? ` … (${this.size} total, use describe_scene)` : ''}`,
    };
  }

  /** Find a free spot near the origin for objects added without a position. */
  freeSpot(minDist = 1.4): { x: number; z: number } {
    const taken = this.all().map((e) => ({ x: e.group.position.x, z: e.group.position.z }));
    if (taken.length === 0) return { x: 0, z: 0 };
    for (let ring = 1; ring <= 8; ring++) {
      const radius = minDist * ring;
      const steps = 6 + ring * 4;
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2 + ring * 0.7;
        const x = Math.cos(a) * radius;
        const z = Math.sin(a) * radius;
        if (taken.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > minDist ** 2)) return { x: round2(x), z: round2(z) };
      }
    }
    return { x: round2((Math.random() - 0.5) * 16), z: round2((Math.random() - 0.5) * 16) };
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
