import type { LofiSession } from './lofi';
import { getCreativeRequests } from './creative-requests';
import { musicState } from './ambience';
import { decodeSceneLink, encodeSceneHash } from './share-codec';
import * as THREE from 'three';
import type { Studio } from './scene';
import { LIGHTING_PRESETS, type LightingPreset } from './scene';
import { MAX_SCENE_OBJECTS, SceneStore, round2, type SceneActor, type SceneEntry } from './store';
import { OBJECT_TYPES, CHESS_PIECES, CHESS_SIDES, isObjectType, buildObject, disposeObject } from './factory';
import { planScatter, seededRandom, type Footprint, type ScatterShape } from './scatter-planner';
import { scatterHistory } from './scatter-history';
import { inCabinFrame, planGrove, planStonePath, placedBounds, intersects, type ZenShape, type ZenPlacement, type CabinFrame } from './zen-planner';
import type { SnapshotManager } from './snapshot';
import type { LayoutManager } from './layout';
import { AGENT_PLAYBOOK } from './agent-guide';
import { setMusic, isMusicOn } from './ambience';
import {
  spawnPop, moveObject, rotateObject, scaleObject, fadeMaterialColor, awaitGroup,
  holdCamera, despawn, tween, EASES,
  getCanonicalScale,
} from './anim';

/**
 * Tool implementations — pure scene-graph operations shared by the real
 * WebMCP registration (webmcp.ts) and the local dev harness (?agent=1).
 *
 * Reliability contract (learned from live agent testing):
 * - every mutating tool AWAITS its animation and only then reports success
 * - reported values are the live rendered scene state, not intent
 * - if a human (or a newer command) interrupted the transition, that is
 *   stated explicitly via `applied: false` + `note`, with live values
 * - every result carries `scene_version` + `operation_id` so agents can
 *   detect staleness; describe_scene exposes the same version
 * - failures carry a machine-readable `code` plus a human `error`
 */

export interface ToolContext {
  studio: Studio;
  store: SceneStore;
  snapshots: SnapshotManager;
  layout: LayoutManager;
  lofi: LofiSession;
  select: (id: string | null) => void;
  /** Native invocation cancellation; each call receives its own context copy. */
  signal?: AbortSignal;
  /** Origin of the invocation, carried into semantic object mutations. */
  actor?: SceneActor;
  /** Batch-local accounting distinguishes its own human edits from takeover. */
  humanChanges?: { count: number };
}

type Args = Record<string, unknown>;

const MAX_OUTPUT_OBJECTS = 40;
const MAX_SCATTER = 200;

export function fail(error: string, code = 'invalid_request'): string {
  return JSON.stringify({ ok: false, code, error });
}

function newOpId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function ok(ctx: ToolContext, result: Record<string, unknown>): string {
  return JSON.stringify({
    ok: true,
    operation_id: result.operation_id,
    scene_version: ctx.store.version,
    ...result,
  });
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** Validate hex color like #rrggbb. */
function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function recordMutation<T>(ctx: ToolContext, mutate: () => T): T {
  const before = ctx.store.humanRevision;
  const result = mutate();
  if (ctx.humanChanges) ctx.humanChanges.count += ctx.store.humanRevision - before;
  return result;
}

/** Synchronous bounds observation includes the intended size of a revealing object. */
export function fullSizeBounds(group: THREE.Group): THREE.Box3 {
  const visibleScale = group.scale.clone();
  try {
    group.scale.copy(getCanonicalScale(group));
    group.updateMatrix();
    return new THREE.Box3().setFromObject(group);
  } finally {
    group.scale.copy(visibleScale);
    group.updateMatrix();
    group.updateMatrixWorld(true);
  }
}

/** A cabin's front steps need a usable approach beyond its visible geometry. */
export function semanticClearances(entry: SceneEntry): Array<Zone & { object_id: string; reason: string }> {
  if (entry.type !== 'cabin') return [];
  const group = entry.group;
  const matrix = new THREE.Matrix4().compose(group.position, group.quaternion, getCanonicalScale(group));
  if (group.parent) { group.parent.updateWorldMatrix(true, false); matrix.premultiply(group.parent.matrixWorld); }
  const box = new THREE.Box3(new THREE.Vector3(-0.4, 0, 3.8), new THREE.Vector3(1.8, 0, 7)).applyMatrix4(matrix);
  return [{ object_id: entry.id, reason: 'cabin_entrance', x: (box.min.x + box.max.x) / 2,
    z: (box.min.z + box.max.z) / 2, width: box.max.x - box.min.x, depth: box.max.z - box.min.z }];
}

function resolveTargets(ctx: ToolContext, raw: unknown): { ids: string[]; names: string[] } | string {
  const list = Array.isArray(raw) ? raw : [raw];
  if (list.length === 0) return 'Missing required parameter: targets (an id like "obj_3", a name, or an array of those).';
  const ids: string[] = [];
  const names: string[] = [];
  for (const q of list) {
    const r = ctx.store.resolve(String(q));
    if (!r.ok) return r.error;
    if (!ids.includes(r.entry.id)) {
      ids.push(r.entry.id);
      names.push(r.entry.name);
    }
  }
  return { ids, names };
}

function interruptedNote(completed: boolean): Record<string, unknown> {
  return completed
    ? {}
    : {
        applied: false,
        note: 'The transition was interrupted before it finished (user took over, or a newer command superseded it). All values reported are the current live scene state.',
      };
}

/* ------------------------------------------------------------------ */
/* describe_scene                                                      */
/* ------------------------------------------------------------------ */

export function describeScene(ctx: ToolContext, args: Args): string {
  let entries = ctx.store.all();

  const filter = args.filter as { type?: string; id_or_name?: string } | undefined;
  if (filter?.type) {
    if (!isObjectType(filter.type)) {
      return fail(`Unknown type filter "${filter.type}". Allowed: ${OBJECT_TYPES.join(', ')}.`);
    }
    entries = entries.filter((e) => e.type === filter.type);
  }
  if (filter?.id_or_name) {
    const r = ctx.store.resolve(String(filter.id_or_name));
    if (!r.ok) return fail(r.error);
    entries = [r.entry];
  }

  const counts: Record<string, number> = {};
  for (const e of entries) counts[e.type] = (counts[e.type] ?? 0) + 1;

  const compact = entries.slice(0, MAX_OUTPUT_OBJECTS).map((e) => {
    const g = e.group;
    const mat = e.materials[0];
    const uniform =
      Math.abs(g.scale.x - g.scale.y) < 0.01 && Math.abs(g.scale.y - g.scale.z) < 0.01
        ? round2(g.scale.x)
        : [round2(g.scale.x), round2(g.scale.y), round2(g.scale.z)];
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      layout_role: e.layoutRole,
      human_edited: e.humanRevision > 0,
      created_by: e.createdBy,
      last_changed_by: e.lastChangedBy,
      revision: e.revision,
      human_revision: e.humanRevision,
      p: [round2(g.position.x), round2(g.position.y), round2(g.position.z)],
      ry: round2(THREE.MathUtils.radToDeg(g.rotation.y)),
      s: uniform,
      c: mat ? `#${mat.color.getHexString()}` : undefined,
      lamp_glow: g.userData.light ? round2((g.userData.light as THREE.PointLight).intensity / 6) : undefined,
    };
  });

  const cam = ctx.studio.camera;
  const body: Record<string, unknown> = {
    ok: true,
    scene_version: ctx.store.version,
    selected_id: ctx.store.selectedId,
    creative_requests: { latest: getCreativeRequests().at(-1) ?? null, history: getCreativeRequests() },
    human_revision: ctx.store.humanRevision,
    human_edits: ctx.store.all().filter(e => e.humanRevision > 0).map(e => ({
      id: e.id, name: e.name, position: e.group.position.toArray(), revision: e.humanRevision,
      human_revision: e.humanRevision, created_by: e.createdBy, last_changed_by: e.lastChangedBy,
    })),
    recent_changes: ctx.store.recentChanges,
    scatter_history: scatterHistory(ctx.store).state,
    keep_clear_zones: ctx.store.all().flatMap(semanticClearances),
    layout: ctx.layout.state,
    lofi: ctx.lofi.state,
    camera_motion: ctx.studio.director.state,
    music: musicState(),
    rendering: ctx.studio.frameStats,
    object_count: entries.length,
    counts,
    objects: compact,
    camera: {
      p: [round2(cam.position.x), round2(cam.position.y), round2(cam.position.z)],
      target: [
        round2(ctx.studio.controls.target.x),
        round2(ctx.studio.controls.target.y),
        round2(ctx.studio.controls.target.z),
      ],
      fov: round2(cam.fov),
    },
    lighting: { preset: ctx.studio.currentPreset, intensity: ctx.studio.currentIntensity },
    ground_radius: ctx.studio.terrain.radius,
    note: entries.length > MAX_OUTPUT_OBJECTS
      ? `Showing first ${MAX_OUTPUT_OBJECTS} of ${entries.length}. Use query_scene (limit/offset/filter) for the full, paginated list.`
      : 'All values are the live rendered scene state. Use query_scene for pagination and per-object bounds.',
  };
  return JSON.stringify(body);
}

/* ------------------------------------------------------------------ */
/* query_scene                                                         */
/* ------------------------------------------------------------------ */

export function queryScene(ctx: ToolContext, args: Args): string {
  let entries = ctx.store.all();

  const type = args.type;
  if (type != null) {
    if (!isObjectType(String(type))) {
      return fail(`Unknown type filter "${type}". Allowed: ${OBJECT_TYPES.join(', ')}.`, 'unknown_type');
    }
    entries = entries.filter((e) => e.type === type);
  }
  const nameContains = typeof args.name_contains === 'string' ? args.name_contains.toLowerCase() : null;
  if (nameContains) entries = entries.filter((e) => e.name.toLowerCase().includes(nameContains));
  if (args.id_or_name != null) {
    const r = ctx.store.resolve(String(args.id_or_name));
    if (!r.ok) return fail(r.error, 'unknown_target');
    entries = [r.entry];
  }

  // natural sort by numeric id suffix (obj_2 before obj_10)
  entries.sort((a, b) => {
    const na = Number(a.id.replace('obj_', '')) || 0;
    const nb = Number(b.id.replace('obj_', '')) || 0;
    return na - nb;
  });

  const total = entries.length;
  const limit = clamp(Math.round(num(args.limit) ?? 40), 1, 200);
  const offset = Math.max(0, Math.round(num(args.offset) ?? 0));
  const page = entries.slice(offset, offset + limit);

  const fields = Array.isArray(args.fields) ? args.fields.map(String) : null;
  const want = (f: string) => !fields || fields.includes(f);

  const includeBounds = args.include_bounds === true;
  const box = includeBounds ? new THREE.Box3() : null;

  const objects = page.map((e) => {
    const g = e.group;
    const mat = e.materials[0];
    const o: Record<string, unknown> = { id: e.id, name: e.name, type: e.type, layout_role: e.layoutRole,
      human_edited: e.humanRevision > 0, created_by: e.createdBy, last_changed_by: e.lastChangedBy,
      revision: e.revision, human_revision: e.humanRevision, keep_clear_zones: semanticClearances(e) };
    if (e.type === 'chess_piece' && e.variant) o.piece = e.variant;
    if (want('pose')) {
      const uniform =
        Math.abs(g.scale.x - g.scale.y) < 0.01 && Math.abs(g.scale.y - g.scale.z) < 0.01
          ? round2(g.scale.x)
          : [round2(g.scale.x), round2(g.scale.y), round2(g.scale.z)];
      o.pose = {
        p: [round2(g.position.x), round2(g.position.y), round2(g.position.z)],
        ry: round2(THREE.MathUtils.radToDeg(g.rotation.y)),
        s: uniform,
      };
    }
    if (want('material')) {
      o.material = mat
        ? {
            color: `#${mat.color.getHexString()}`,
            roughness: round2(mat.roughness),
            metalness: round2(mat.metalness),
          }
        : null;
    }
    if (box) {
      box.setFromObject(g);
      o.bounds = [
        round2(box.min.x), round2(box.min.y), round2(box.min.z),
        round2(box.max.x), round2(box.max.y), round2(box.max.z),
      ];
    }
    return o;
  });

  return ok(ctx, {
    total,
    count: objects.length,
    offset,
    limit,
    objects,
    ...(offset + objects.length < total
      ? { next_offset: offset + objects.length, note: `More results — call again with offset=${offset + objects.length}.` }
      : {}),
  });
}

/* ------------------------------------------------------------------ */
/* add_object                                                          */
/* ------------------------------------------------------------------ */

export async function addObject(ctx: ToolContext, args: Args): Promise<string> {
  const type = String(args.type ?? '');
  if (!isObjectType(type)) {
    return fail(`Unknown type "${type}". Allowed types: ${OBJECT_TYPES.join(', ')}.`);
  }
  if (ctx.store.size >= MAX_SCENE_OBJECTS) return fail(`Scene limit reached (${MAX_SCENE_OBJECTS} objects). Delete objects before adding more.`, 'scene_full');

  // Chess piece preset params — validated strictly so agents self-correct.
  let piece: string | undefined;
  let side: string | undefined;
  if (args.piece != null || args.side != null) {
    if (type !== 'chess_piece') {
      return fail('piece/side only apply to type "chess_piece".');
    }
    piece = args.piece != null ? String(args.piece) : undefined;
    if (piece != null && !(CHESS_PIECES as readonly string[]).includes(piece)) {
      return fail(`Unknown piece "${piece}". Allowed pieces: ${CHESS_PIECES.join(', ')}.`);
    }
    side = args.side != null ? String(args.side) : undefined;
    if (side != null && side !== 'white' && side !== 'black') {
      return fail(`side must be "white" or "black".`);
    }
  }

  const pos = (args.position ?? {}) as { x?: unknown; y?: unknown; z?: unknown };
  let x = num(pos.x);
  let z = num(pos.z);
  if (x == null || z == null) {
    const spot = ctx.store.freeSpot();
    x = spot.x;
    z = spot.z;
  }
  x = clamp(x, -58, 58);
  z = clamp(z, -58, 58);

  let scale: number | { x: number; y: number; z: number } | undefined;
  if (typeof args.scale === 'number') {
    scale = clamp(args.scale, 0.1, 8);
  } else if (args.scale && typeof args.scale === 'object') {
    const s = args.scale as { x?: unknown; y?: unknown; z?: unknown };
    scale = {
      x: clamp(num(s.x) ?? 1, 0.1, 8),
      y: clamp(num(s.y) ?? 1, 0.1, 8),
      z: clamp(num(s.z) ?? 1, 0.1, 8),
    };
  }

  const opId = newOpId();
  const entry = recordMutation(ctx, () => ctx.store.spawn(type, {
    name: typeof args.name === 'string' ? args.name : undefined,
    scale,
    rotationYDeg: num(args.rotation_y),
    variant: piece,
    actor: ctx.actor ?? 'agent',
  }));
  if (side) entry.materials[0]?.color.set(CHESS_SIDES[side as 'white' | 'black']);
  entry.group.position.set(x, 0, z);
  ctx.studio.scene.add(entry.group);
  const lazy = args.animate === false;
  let completed = true;
  if (lazy) {
    // Bulk placement: still pops in (staggered), but the call returns at once.
    const requestedDelay = num(args.delay_ms);
    const delay = requestedDelay == null ? Math.random() * 1400 : clamp(requestedDelay, 0, 2000);
    spawnPop(entry.group, delay);
  } else {
    spawnPop(entry.group);
    completed = (await awaitGroup(`spawn:${entry.group.uuid}`)).completed;
  }
  ctx.store.bump();

  return ok(ctx, {
    operation_id: opId,
    id: entry.id,
    name: entry.name,
    type: entry.type,
    ...(piece || side ? { piece: piece ?? 'pawn', side: side ?? 'white' } : {}),
    position: { x: round2(entry.group.position.x), y: 0, z: round2(entry.group.position.z) },
    scale: round2(entry.group.scale.x),
    ...interruptedNote(completed),
  });
}

/* ------------------------------------------------------------------ */
/* transform_object                                                    */
/* ------------------------------------------------------------------ */

export async function transformObject(ctx: ToolContext, args: Args): Promise<string> {
  const targets = resolveTargets(ctx, args.targets);
  if (typeof targets === 'string') return fail(targets);

  const op = String(args.op ?? '');
  if (!['move', 'rotate', 'scale'].includes(op)) {
    return fail(`op must be "move", "rotate" or "scale".`);
  }
  const mode = String(args.mode ?? 'absolute');
  if (!['absolute', 'relative'].includes(mode)) {
    return fail(`mode must be "absolute" or "relative".`);
  }

  const x = num(args.x);
  const y = num(args.y);
  const z = num(args.z);
  const uniform = num(args.uniform);
  if (x == null && y == null && z == null && (op !== 'scale' || uniform == null)) {
    return fail(`Provide at least one of x, y, z${op === 'scale' ? ' or uniform' : ''}.`);
  }
  if (op !== 'scale' && uniform != null) return fail('uniform only applies to scale operations.');

  const opId = newOpId();
  const groups: string[] = [];
  const entries = targets.ids.map(id => ctx.store.get(id)!);
  for (const entry of entries) {
    recordMutation(ctx, () => ctx.store.markChanged(entry.id, ctx.actor ?? 'agent', 'transform'));
    const g = entry.group;
    if (op === 'move') {
      const to = {
        x: x == null ? undefined : clamp(mode === 'relative' ? x + g.position.x : x, -58, 58),
        z: z == null ? undefined : clamp(mode === 'relative' ? z + g.position.z : z, -58, 58),
        y: y == null ? undefined : clamp(mode === 'relative' ? y + g.position.y : y, 0, 58),
      };
      moveObject(g, to);
      groups.push(`pos:${g.uuid}`);
    } else if (op === 'rotate') {
      const dx = x ?? 0, dy = y ?? 0, dz = z ?? 0;
      if (mode === 'relative') {
        rotateObject(g, {
          x: g.rotation.x + THREE.MathUtils.degToRad(dx),
          y: g.rotation.y + THREE.MathUtils.degToRad(dy),
          z: g.rotation.z + THREE.MathUtils.degToRad(dz),
        });
      } else {
        rotateObject(g, {
          x: x != null ? THREE.MathUtils.degToRad(x) : undefined,
          y: y != null ? THREE.MathUtils.degToRad(y) : undefined,
          z: z != null ? THREE.MathUtils.degToRad(z) : undefined,
        });
      }
      groups.push(`rot:${g.uuid}`);
    } else {
      const factor = mode === 'relative'
        ? { x: uniform ?? (x ?? 1), y: uniform ?? (y ?? 1), z: uniform ?? (z ?? 1) }
        : { x: uniform ?? (x ?? g.scale.x), y: uniform ?? (y ?? g.scale.y), z: uniform ?? (z ?? g.scale.z) };
      const nx = clamp(mode === 'relative' ? g.scale.x * factor.x : factor.x, 0.1, 8);
      const ny = clamp(mode === 'relative' ? g.scale.y * factor.y : factor.y, 0.1, 8);
      const nz = clamp(mode === 'relative' ? g.scale.z * factor.z : factor.z, 0.1, 8);
      scaleObject(g, { x: nx, y: ny, z: nz });
      groups.push(`scale:${g.uuid}`);
    }
  }
  ctx.store.bump();

  const results = await Promise.all(groups.map(awaitGroup));
  const allCompleted = results.every((r) => r.completed);
  // An observation made during the transition must be stale after it settles.
  ctx.store.bump();

  const surviving = entries.filter(entry => ctx.store.get(entry.id) === entry);
  const updated = surviving.map((entry) => {
    const g = entry.group;
    return {
      id: entry.id,
      name: entry.name,
      p: [round2(g.position.x), round2(g.position.y), round2(g.position.z)],
      ry: round2(THREE.MathUtils.radToDeg(g.rotation.y)),
      s: round2(g.scale.x),
    };
  });

  return ok(ctx, {
    operation_id: opId,
    op,
    mode,
    count: updated.length,
    updated: updated.slice(0, 25),
    ...interruptedNote(allCompleted && surviving.length === entries.length),
    ...(surviving.length < entries.length ? { removed_ids: entries.filter(entry => !surviving.includes(entry)).map(entry => entry.id) } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* set_material                                                        */
/* ------------------------------------------------------------------ */

export async function setMaterial(ctx: ToolContext, args: Args): Promise<string> {
  const targets = resolveTargets(ctx, args.targets);
  if (typeof targets === 'string') return fail(targets);

  const color = args.color;
  if (color != null && !isHex(color)) {
    return fail(`color must be a hex string like "#5d7c5a", got "${color}".`);
  }
  const emissive = args.emissive;
  if (emissive != null && !isHex(emissive)) {
    return fail(`emissive must be a hex string like "#ffb45e", got "${emissive}".`);
  }
  const roughness = num(args.roughness);
  const metalness = num(args.metalness);
  const emissiveIntensity = num(args.emissive_intensity);
  const opacity = num(args.opacity);
  if (roughness != null && (roughness < 0 || roughness > 1)) return fail('roughness must be between 0 and 1.');
  if (metalness != null && (metalness < 0 || metalness > 1)) return fail('metalness must be between 0 and 1.');
  if (opacity != null && (opacity < 0 || opacity > 1)) return fail('opacity must be between 0 and 1.');
  if (emissiveIntensity != null && (emissiveIntensity < 0 || emissiveIntensity > 5)) {
    return fail('emissive_intensity must be between 0 and 5.');
  }
  if (color == null && emissive == null && roughness == null && metalness == null && opacity == null && emissiveIntensity == null) {
    return fail('Provide at least one of: color, roughness, metalness, emissive, emissive_intensity, opacity.');
  }

  const opId = newOpId();
  const groups: string[] = [];
  for (const id of targets.ids) {
    const entry = ctx.store.get(id)!;
    recordMutation(ctx, () => ctx.store.markChanged(id, ctx.actor ?? 'agent', 'material'));
    for (const mat of entry.materials) {
      if (isHex(color)) {
        fadeMaterialColor(mat, 'color', color);
        groups.push(`col:${mat.uuid}:color`);
      }
      if (roughness != null) mat.roughness = roughness;
      if (metalness != null) mat.metalness = metalness;
      if (emissive != null) {
        fadeMaterialColor(mat, 'emissive', emissive);
        groups.push(`col:${mat.uuid}:emissive`);
      }
      if (emissiveIntensity != null) mat.emissiveIntensity = emissiveIntensity;
      if (opacity != null) {
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
        mat.needsUpdate = true;
      }
    }
  }
  ctx.store.bump();

  const results = await Promise.all(groups.map(awaitGroup));
  const allCompleted = results.every((r) => r.completed);
  if (groups.length) ctx.store.bump();

  // Read the emissive color after its tween has settled, so the emitted
  // light matches the final visible glow rather than its previous color.
  for (const id of targets.ids) {
    const entry = ctx.store.get(id);
    if (!entry) continue;
    const light = entry.group.userData.light as THREE.PointLight | undefined;
    if (light && (emissive != null || emissiveIntensity != null)) {
      const headMat = (entry.group.userData.emissiveMaterial as THREE.MeshStandardMaterial | undefined)
        ?? entry.materials.reduce((best, mat) => mat.emissiveIntensity > best.emissiveIntensity ? mat : best);
      if (emissive != null) light.color.copy(headMat.emissive);
      if (emissiveIntensity != null) {
        const baseLight = Number(entry.group.userData.lightBaseIntensity ?? 6);
        const baseGlow = Number(entry.group.userData.emissiveBaseIntensity ?? 0.85);
        light.intensity = baseLight * clamp(headMat.emissiveIntensity / baseGlow, 0, 4);
      }
    }
  }

  return ok(ctx, {
    operation_id: opId,
    count: targets.ids.length,
    updated: targets.ids,
    names: targets.names,
    ...interruptedNote(allCompleted),
  });
}

/* ------------------------------------------------------------------ */
/* set_lighting                                                        */
/* ------------------------------------------------------------------ */

export async function setLighting(ctx: ToolContext, args: Args): Promise<string> {
  const preset = String(args.preset ?? '');
  if (!(LIGHTING_PRESETS as readonly string[]).includes(preset)) {
    return fail(`Unknown preset "${preset}". Allowed: ${LIGHTING_PRESETS.join(', ')}.`);
  }
  const intensity = num(args.intensity) ?? 1;
  if (intensity < 0 || intensity > 2) return fail('intensity must be between 0 and 2.');
  const azimuth = num(args.azimuth);
  if (azimuth != null && (azimuth < -360 || azimuth > 360)) return fail('azimuth must be between -360 and 360 degrees.');

  const opId = newOpId();
  ctx.studio.applyLighting(preset as LightingPreset, intensity, azimuth);
  ctx.store.bump();

  const { completed } = await awaitGroup('lighting');
  ctx.store.bump();

  return ok(ctx, {
    operation_id: opId,
    preset,
    intensity,
    azimuth: azimuth ?? 'unchanged',
    ...interruptedNote(completed),
  });
}

/* ------------------------------------------------------------------ */
/* frame_camera / camera_path                                          */
/* ------------------------------------------------------------------ */

const ANGLES = ['front', 'side', 'top', 'three_quarter', 'low', 'hero'] as const;

interface FramingPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

/** Shared framing math for frame_camera and camera_path keyframes. */
function framingPose(
  ctx: ToolContext,
  targetArg: string,
  angle: string,
  distance: number | undefined,
  focal: number | undefined,
): { pose: FramingPose; dist: number; fov: number | undefined; entryId: string | null } | string {
  let center = new THREE.Vector3(0, 0.6, 0);
  let radius = 6;
  let entryId: string | null = null;
  if (targetArg === 'scene') {
    const box = new THREE.Box3();
    for (const e of ctx.store.all()) box.expandByObject(e.group);
    if (!box.isEmpty()) {
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      center = sphere.center;
      radius = Math.max(sphere.radius, 4);
    }
  } else {
    const r = ctx.store.resolve(targetArg);
    if (!r.ok) return r.error;
    const box = new THREE.Box3().setFromObject(r.entry.group);
    box.getBoundingSphere(new THREE.Sphere(center));
    radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.6);
    entryId = r.entry.id;
  }

  const d = distance ?? Math.max(radius * 2.4, 4);
  const dirs: Record<(typeof ANGLES)[number], THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.22, 1),
    side: new THREE.Vector3(1, 0.22, 0),
    // Keep a tiny +z component to define a stable roll when looking straight
    // down: world +x stays screen-right and -z stays screen-up.
    top: new THREE.Vector3(0, 1, 0.001),
    three_quarter: new THREE.Vector3(0.8, 0.55, 0.8),
    low: new THREE.Vector3(0.7, 0.08, 0.7),
    hero: new THREE.Vector3(0.75, 0.2, 0.75),
  };
  const dir = dirs[angle as (typeof ANGLES)[number]].normalize();
  const dist = angle === 'hero' ? d * 0.85 : d;
  const position = center.clone().addScaledVector(dir, dist);
  position.y = Math.max(position.y, 0.35);

  const fov = focal != null ? clamp(THREE.MathUtils.radToDeg(2 * Math.atan(12 / focal)), 15, 90) : undefined;
  return { pose: { position, target: center, fov }, dist, fov, entryId };
}

export async function frameCamera(ctx: ToolContext, args: Args): Promise<string> {
  const angle = String(args.angle ?? 'three_quarter');
  if (!(ANGLES as readonly string[]).includes(angle)) {
    return fail(`Unknown angle "${angle}". Allowed: ${ANGLES.join(', ')}.`, 'out_of_range');
  }
  const distance = num(args.distance);
  const focal = num(args.focal_length);
  if (distance != null && (distance < 1 || distance > 90)) return fail('distance must be between 1 and 90.', 'out_of_range');
  if (focal != null && (focal < 14 || focal > 200)) return fail('focal_length must be between 14 and 200 (35mm-equivalent mm).', 'out_of_range');
  const select = args.select !== false;

  const targetArg = String(args.target ?? 'scene');
  const framed = framingPose(ctx, targetArg, angle, distance, focal);
  if (typeof framed === 'string') return fail(framed, 'unknown_target');
  if (select && framed.entryId) ctx.select(framed.entryId);

  const opId = newOpId();
  ctx.studio.flyTo(framed.pose, 950, typeof args.easing === 'string' ? args.easing : undefined);
  ctx.store.bump();

  const { completed } = await awaitGroup('camera');
  ctx.store.bump();
  const cam = ctx.studio.camera;

  return ok(ctx, {
    operation_id: opId,
    framing: { target: targetArg, angle, distance: round2(framed.dist), fov: framed.fov ? round2(framed.fov) : 'unchanged', selected: select && framed.entryId != null },
    camera_position: [round2(cam.position.x), round2(cam.position.y), round2(cam.position.z)],
    camera_target: [
      round2(ctx.studio.controls.target.x),
      round2(ctx.studio.controls.target.y),
      round2(ctx.studio.controls.target.z),
    ],
    ...interruptedNote(completed),
  });
}

/* ------------------------------------------------------------------ */
/* camera_path — actual direction: a sequence of keyframed shots        */
/* ------------------------------------------------------------------ */

interface PathKeyframe {
  label: string;
  pose: FramingPose;
  angle: string;
  dist: number;
  fov: number | undefined;
  holdMs: number;
  durationMs: number;
}

export async function cameraPath(ctx: ToolContext, args: Args): Promise<string> {
  const raw = Array.isArray(args.keyframes) ? args.keyframes : [];
  if (raw.length < 2) return fail('camera_path needs at least 2 keyframes (e.g. two shots to fly between).', 'bad_request');
  if (raw.length > 12) return fail('At most 12 keyframes per path.', 'out_of_range');
  const easing = typeof args.easing === 'string' && EASES[args.easing] ? args.easing : 'cinematic';
  const loop = args.loop === true;
  const defaultDuration = clamp(Math.round(num(args.segment_ms) ?? 950), 300, 4000);

  // parse and resolve every keyframe up front — fail fast, before moving
  const frames: PathKeyframe[] = [];
  for (const [i, item] of raw.entries()) {
    if (!item || typeof item !== 'object') return fail(`Keyframe ${i} must be an object.`, 'bad_request');
    const kf = item as Record<string, unknown>;
    const targetArg = String(kf.target ?? 'scene');
    const angle = String(kf.angle ?? 'three_quarter');
    if (!(ANGLES as readonly string[]).includes(angle)) {
      return fail(`Keyframe ${i}: unknown angle "${angle}". Allowed: ${ANGLES.join(', ')}.`, 'out_of_range');
    }
    const distance = num(kf.distance);
    if (distance != null && (distance < 1 || distance > 90)) return fail(`Keyframe ${i}: distance must be 1..90.`, 'out_of_range');
    const focal = num(kf.focal_length);
    if (focal != null && (focal < 14 || focal > 200)) return fail(`Keyframe ${i}: focal_length must be 14..200.`, 'out_of_range');
    const framed = framingPose(ctx, targetArg, angle, distance, focal);
    if (typeof framed === 'string') return fail(`Keyframe ${i}: ${framed}`, 'unknown_target');
    frames.push({
      label: targetArg,
      pose: framed.pose,
      angle,
      dist: framed.dist,
      fov: framed.fov,
      holdMs: clamp(Math.round(num(kf.hold_ms) ?? 800), 0, 5000),
      durationMs: clamp(Math.round(num(kf.duration_ms) ?? defaultDuration), 300, 4000),
    });
  }

  const opId = newOpId();
  ctx.store.bump();

  const deadline = performance.now() + 90_000; // hard safety cap for loop:true
  const maxLoops = loop ? 3 : 1;
  const shots: Array<Record<string, unknown>> = [];
  let interrupted = false;
  let loopsRun = 0;

  loop1: for (let l = 0; l < maxLoops; l++) {
    loopsRun = l + 1;
    for (let i = 0; i < frames.length; i++) {
      const kf = frames[i];
      ctx.studio.flyTo(kf.pose, kf.durationMs, easing);
      const flight = await awaitGroup('camera');
      if (!flight.completed) { interrupted = true; break loop1; }
      shots.push({
        index: i,
        target: kf.label,
        angle: kf.angle,
        distance: round2(kf.dist),
        fov: kf.fov ? round2(kf.fov) : 'unchanged',
        hold_ms: kf.holdMs,
      });
      if (kf.holdMs > 0) {
        holdCamera(kf.holdMs);
        const held = await awaitGroup('camera');
        if (!held.completed) { interrupted = true; break loop1; }
      }
      if (performance.now() > deadline) { interrupted = true; break loop1; }
    }
  }

  const cam = ctx.studio.camera;
  ctx.store.bump();
  return ok(ctx, {
    operation_id: opId,
    keyframes_total: frames.length,
    shots_completed: shots.length,
    loops: maxLoops > 1 ? `${loopsRun} (capped)` : 1,
    easing,
    shots: shots.slice(0, 12),
    camera_position: [round2(cam.position.x), round2(cam.position.y), round2(cam.position.z)],
    ...interruptedNote(!interrupted),
  });
}

/* ------------------------------------------------------------------ */
/* set_ui — cinematic mode                                             */
/* ------------------------------------------------------------------ */

export function setUi(_ctx: ToolContext, args: Args): string {
  const visible = args.visible;
  if (typeof visible !== 'boolean') return fail('Parameter visible (boolean) is required — true shows the HUD, false hides it for a clean shot.', 'bad_request');
  document.body.classList.toggle('ui-hidden', !visible);
  return JSON.stringify({
    ok: true,
    operation_id: newOpId(),
    ui_visible: visible,
    note: visible ? 'HUD visible.' : 'HUD hidden (cinematic). The user can press H to bring it back; mouse controls stay active.',
  });
}

/* ------------------------------------------------------------------ */
/* scatter                                                             */
/* ------------------------------------------------------------------ */

interface Zone { x: number; z: number; width: number; depth: number }

function parseZone(raw: unknown): Zone | null {
  if (!raw || typeof raw !== 'object') return null;
  const z = raw as Record<string, unknown>;
  const x = num(z.x);
  const zz = num(z.z);
  const w = num(z.width);
  const d = num(z.depth);
  if (x == null || zz == null || w == null || d == null) return null;
  return { x, z: zz, width: Math.abs(w), depth: Math.abs(d) };
}

export async function scatter(ctx: ToolContext, args: Args): Promise<string> {
  const type = String(args.type ?? '');
  if (!isObjectType(type)) {
    return fail(`Unknown type "${type}". Allowed types: ${OBJECT_TYPES.join(', ')}.`);
  }
  const count = num(args.count) ?? 10;
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_SCATTER) return fail(`count must be an integer between 1 and ${MAX_SCATTER}.`);
  if (ctx.store.size + count > MAX_SCENE_OBJECTS) return fail(`This scatter exceeds the ${MAX_SCENE_OBJECTS}-object scene limit. Delete objects or reduce count.`, 'scene_full');
  const clearance = num(args.clearance) ?? 0.4;
  if (clearance < 0 || clearance > 5) return fail('clearance must be between 0 and 5.');
  const jitter = clamp(num(args.jitter) ?? 0.75, 0, 1);
  const scaleVariance = clamp(num(args.scale_variance) ?? 0.2, 0, 1);
  const rotationVariance = clamp(num(args.rotation_variance) ?? 1, 0, 1);
  const seed = num(args.seed) ?? Math.floor(Math.random() * 0xffffffff);
  if (!Number.isSafeInteger(seed)) return fail('seed must be an integer.');
  const rng = seededRandom(seed);
  let anchor;
  if (args.anchor != null) {
    const resolved = ctx.store.resolve(String(args.anchor));
    if (!resolved.ok) return fail(resolved.error, 'unknown_anchor');
    anchor = resolved.entry;
  }
  const zonesRaw = Array.isArray(args.exclusion_zones) ? args.exclusion_zones : [];
  const obstacles: Footprint[] = [];
  for (const raw of zonesRaw) {
    const z = parseZone(raw);
    if (!z) return fail('Each exclusion zone must be {x, z, width, depth} — a rectangle centered at x/z.', 'bad_request');
    obstacles.push({ minX: z.x - z.width / 2, maxX: z.x + z.width / 2, minZ: z.z - z.depth / 2, maxZ: z.z + z.depth / 2 });
  }
  const avoidRaw = Array.isArray(args.avoid_object_ids) ? args.avoid_object_ids.map(String) : [];
  for (const q of avoidRaw) {
    const r = ctx.store.resolve(q);
    if (!r.ok) return fail(`avoid_object_ids: ${r.error}`, 'unknown_target');
  }
  ctx.store.syncMatrices();
  const preserved = ctx.store.all();
  const footprint = (box: THREE.Box3): Footprint => ({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  for (const entry of preserved) {
    obstacles.push(footprint(fullSizeBounds(entry.group)));
    for (const zone of semanticClearances(entry)) obstacles.push({ minX: zone.x - zone.width / 2,
      maxX: zone.x + zone.width / 2, minZ: zone.z - zone.depth / 2, maxZ: zone.z + zone.depth / 2 });
  }
  const anchorBounds = anchor ? fullSizeBounds(anchor.group) : null;

  // Measure the exact procedural variants that spawn() will create. Temporary
  // geometry is never registered and is always disposed, including failures.
  const shapes: ScatterShape[] = [];
  for (let index = 0; index < count; index++) {
    const scale = Math.max(0.35, 1 + (rng() * 2 - 1) * scaleVariance);
    const rotation = rng() * 360 * rotationVariance;
    const built = buildObject(type, undefined, ctx.store.idCount + index + 1);
    try {
      built.group.scale.setScalar(scale);
      built.group.rotation.y = THREE.MathUtils.degToRad(rotation);
      shapes.push({ scale, rotation, bounds: footprint(new THREE.Box3().setFromObject(built.group)) });
    } finally { disposeObject(built.group); }
  }
  const widest = Math.max(...shapes.map(shape => Math.max(shape.bounds.maxX - shape.bounds.minX, shape.bounds.maxZ - shape.bounds.minZ)));
  const anchorSize = anchorBounds?.getSize(new THREE.Vector3());
  const anchorCenter = anchorBounds?.getCenter(new THREE.Vector3());
  const roomyWidth = anchorBounds
    ? Math.max(12, Math.max(anchorSize!.x, anchorSize!.z) + Math.sqrt(count) * (widest + clearance) * 1.65)
    : 10;
  const expandedArea = shapes.reduce((sum, shape) => sum
    + (shape.bounds.maxX - shape.bounds.minX + clearance) * (shape.bounds.maxZ - shape.bounds.minZ + clearance), 0);
  const anchorArea = anchorSize ? anchorSize.x * anchorSize.z : 0;
  // Begin with a grove, not a sparse field. The extra room handles irregular
  // footprints; bounded retries account for the other preserved human objects.
  const compactWidth = Math.max(12, Math.ceil(Math.sqrt(expandedArea * 2 + anchorArea)));
  const areaRaw = (args.area ?? {}) as Record<string, unknown>;
  const centerX = clamp(num(areaRaw.center_x) ?? anchorCenter?.x ?? 0, -58, 58);
  const centerZ = clamp(num(areaRaw.center_z) ?? anchorCenter?.z ?? 0, -58, 58);
  const automaticArea = anchorBounds !== null && args.area == null;
  const requestedWidth = clamp(num(areaRaw.width) ?? roomyWidth, 0.5, 110);
  const requestedDepth = clamp(num(areaRaw.depth) ?? roomyWidth, 0.5, 110);
  const widths = automaticArea
    ? [...new Set([compactWidth, compactWidth * 1.08, compactWidth * 1.18, compactWidth * 1.35, roomyWidth]
      .map(width => clamp(Math.min(width, roomyWidth), 0.5, 110)))].sort((a, b) => a - b)
    : [requestedWidth];
  let area: Footprint = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  let plan: ReturnType<typeof planScatter> = null;
  for (const width of widths) {
    const depth = automaticArea ? width : requestedDepth;
    area = { minX: Math.max(-58, centerX - width / 2), maxX: Math.min(58, centerX + width / 2),
      minZ: Math.max(-58, centerZ - depth / 2), maxZ: Math.min(58, centerZ + depth / 2) };
    plan = planScatter(shapes, area, obstacles, clearance, jitter, rng);
    if (plan) break;
  }
  if (!plan) return fail(`Could not safely place all ${count} objects. Nothing changed. Enlarge area, reduce count, or reduce clearance.`, 'no_space');
  if (ctx.signal?.aborted) return fail('Scatter cancelled before any objects were added.', 'cancelled');

  const opId = newOpId(), actor = ctx.actor ?? 'agent';
  const entries = plan.map(item => {
    const entry = recordMutation(ctx, () => ctx.store.spawn(type, { scale: item.scale, rotationYDeg: item.rotation, actor }));
    entry.group.position.set(item.x, 0, item.z);
    ctx.studio.scene.add(entry.group);
    return entry;
  });
  const undoId = scatterHistory(ctx.store).record(entries);
  const revisions = entries.map(entry => entry.revision);
  const humanRevision = ctx.store.humanRevision;
  const stagger = Math.min(600 / count, 45);
  const results = await Promise.all(entries.map((entry, index) => {
    spawnPop(entry.group, index * stagger);
    return awaitGroup(`spawn:${entry.group.uuid}`);
  }));
  // Cancellation hands complete, editable assets back to the human. Never
  // overwrite an entry whose semantic revision changed during its reveal.
  entries.forEach((entry, index) => {
    if (ctx.store.get(entry.id) === entry && entry.revision === revisions[index]) {
      entry.group.scale.setScalar(plan[index].scale);
    }
  });
  ctx.store.bump();
  const completed = results.every(result => result.completed) && ctx.store.humanRevision === humanRevision;
  const liveEntries = entries.filter(entry => ctx.store.get(entry.id) === entry);
  return ok(ctx, {
    operation_id: opId,
    added: entries.length, live_added: liveEntries.length, requested_count: count,
    exact_count: liveEntries.length === count, skipped_excluded: 0,
    type, seed, clearance, footprint: 'actual_bounds',
    anchor_id: anchor?.id ?? null, anchor_position: anchor?.group.position.toArray() ?? null,
    preserved_ids: preserved.map(entry => entry.id), undo_id: undoId,
    area: { center_x: (area.minX + area.maxX) / 2, center_z: (area.minZ + area.maxZ) / 2,
      width: area.maxX - area.minX, depth: area.maxZ - area.minZ },
    ids: entries.map(entry => entry.id),
    ...(liveEntries.length < count ? { removed_ids: entries.filter(entry => !liveEntries.includes(entry)).map(entry => entry.id) } : {}),
    ...interruptedNote(completed),
  });
}

/** Compositional tools operate on live anchors, never replace a shared world. */
function groundBounds(box: THREE.Box3): Footprint {
  return { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
}
function cabinFrame(entry: SceneEntry): CabinFrame {
  const scale = getCanonicalScale(entry.group);
  return { x: entry.group.position.x, z: entry.group.position.z, rotation: entry.group.rotation.y,
    scaleX: scale.x, scaleZ: scale.z };
}
function livePathEndpoints(cabin: SceneEntry, pond: SceneEntry) {
  const frame = cabinFrame(cabin), cabinBox = fullSizeBounds(cabin.group);
  let start = inCabinFrame(frame, 0.7, 5.4);
  // A rotated porch may still lie inside its conservative world AABB. Begin
  // just beyond that footprint instead of putting the first stone in timber.
  for (let step = 0; step < 20 && start.x > cabinBox.min.x - 0.65 && start.x < cabinBox.max.x + 0.65
    && start.z > cabinBox.min.z - 0.65 && start.z < cabinBox.max.z + 0.65; step++) {
    start = inCabinFrame(frame, 0.7, 5.65 + step * 0.25);
  }
  const box = fullSizeBounds(pond.group), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const dx = start.x - center.x, dz = start.z - center.z, distance = Math.hypot(dx, dz);
  if (distance < 0.01) return null;
  const nx = dx / distance, nz = dz / distance;
  const bank = 1 / Math.max(Math.abs(nx) / (size.x / 2), Math.abs(nz) / (size.z / 2));
  const end = { x: center.x + nx * (bank + 0.9), z: center.z + nz * (bank + 0.9) };
  return { start, end, length: Math.hypot(end.x - start.x, end.z - start.z) };
}
function measuredZenShape(ctx: ToolContext, type: 'tree' | 'lamp' | 'rock', offset: number,
  scale: number, rotation: number, flattened = false): ZenShape {
  const built = buildObject(type, undefined, ctx.store.idCount + offset + 1);
  try {
    built.group.scale.set(scale, flattened ? scale * 0.38 : scale, flattened ? scale * 0.82 : scale);
    built.group.rotation.y = THREE.MathUtils.degToRad(rotation);
    return { scale, rotation, bounds: groundBounds(new THREE.Box3().setFromObject(built.group)) };
  } finally { disposeObject(built.group); }
}
async function revealZen(ctx: ToolContext, items: Array<ZenPlacement & { type: 'tree' | 'lamp' | 'rock'; name: string; role: 'forest' | 'lantern' | 'path' }>, seconds: number) {
  const entries = items.map(item => {
    const scale = item.role === 'path' ? { x: item.scale, y: item.scale * 0.38, z: item.scale * 0.82 } : item.scale;
    const entry = recordMutation(ctx, () => ctx.store.spawn(item.type, { name: item.name, scale, rotationYDeg: item.rotation, actor: ctx.actor ?? 'agent' }));
    entry.layoutRole = item.role;
    entry.group.position.set(item.x, 0, item.z);
    ctx.studio.scene.add(entry.group);
    return entry;
  });
  const undoId = scatterHistory(ctx.store).record(entries), revisions = entries.map(entry => entry.revision);
  const humanRevision = ctx.store.humanRevision;
  const scales = entries.map(entry => entry.group.scale.clone());
  const results = await Promise.all(entries.map((entry, index) => {
    spawnPop(entry.group, index / Math.max(1, entries.length - 1) * seconds * 1000);
    return awaitGroup(`spawn:${entry.group.uuid}`);
  }));
  entries.forEach((entry, index) => {
    if (ctx.store.get(entry.id) === entry && entry.revision === revisions[index]) entry.group.scale.copy(scales[index]);
  });
  ctx.store.bump();
  const live = entries.filter(entry => ctx.store.get(entry.id) === entry);
  return { entries, undoId, live, completed: results.every(result => result.completed) && ctx.store.humanRevision === humanRevision };
}

export async function addGrove(ctx: ToolContext, args: Args): Promise<string> {
  const anchor = ctx.store.resolve(String(args.cabin ?? 'cabin'));
  if (!anchor.ok || anchor.entry.type !== 'cabin') return fail(anchor.ok ? 'cabin must identify a cabin.' : anchor.error, 'unknown_anchor');
  const pond = args.pond != null ? ctx.store.resolve(String(args.pond)) : null;
  if (pond && (!pond.ok || pond.entry.type !== 'pond')) return fail(pond.ok ? 'pond must identify a pond.' : pond.error, 'unknown_anchor');
  const count = num(args.count) ?? 40, lightCount = num(args.lights) ?? 8, seed = num(args.seed) ?? 42;
  const revealSeconds = num(args.reveal_seconds) ?? 6;
  if (!Number.isSafeInteger(count) || count < 1 || count > 100 || !Number.isSafeInteger(lightCount) || lightCount < 0 || lightCount > 12
    || !Number.isSafeInteger(seed) || revealSeconds < 0 || revealSeconds > 15) return fail('count must be 1–100, lights 0–12, seed an integer, and reveal_seconds 0–15.');
  if (ctx.store.size + count + lightCount > MAX_SCENE_OBJECTS) return fail('The grove exceeds the scene object limit.', 'scene_full');
  ctx.store.syncMatrices();
  const preserved = ctx.store.all(), frame = cabinFrame(anchor.entry), rng = seededRandom(seed);
  const obstacles = preserved.map(entry => groundBounds(fullSizeBounds(entry.group)));
  for (const entry of preserved) for (const zone of semanticClearances(entry)) obstacles.push({ minX: zone.x - zone.width / 2,
    maxX: zone.x + zone.width / 2, minZ: zone.z - zone.depth / 2, maxZ: zone.z + zone.depth / 2 });
  if (pond?.ok) {
    const connection = livePathEndpoints(anchor.entry, pond.entry);
    if (connection && connection.length >= 1.8) {
      const count = Math.max(4, Math.min(24, Math.floor(connection.length / 0.9) + 1));
      const corridorShape: ZenShape = { bounds: { minX: -0.28, maxX: 0.28, minZ: -0.28, maxZ: 0.28 }, scale: 1, rotation: 0 };
      const route = planStonePath(connection.start, connection.end, count, Array.from({ length: count }, () => corridorShape), obstacles, 2);
      if (route) for (const point of route) obstacles.push({ minX: point.x - 0.85, maxX: point.x + 0.85, minZ: point.z - 0.85, maxZ: point.z + 0.85 });
    }
  }
  const shapes = Array.from({ length: count }, (_, index) => measuredZenShape(ctx, 'tree', index,
    0.8 + rng() * 0.3, rng() * 360));
  let plan = planGrove(frame, shapes, obstacles, seed);
  if (!plan) return fail('No safe space for the entire grove. Nothing changed. Move the anchors away from existing objects or the world edge.', 'no_space');
  const items: Parameters<typeof revealZen>[1] = plan.map((item, index) => ({ ...item, type: 'tree', role: 'forest', name: `${item.region === 'rear' ? 'Forest' : 'Framing'} pine ${index + 1}` }));
  // Reserve the warm accents first, then let new trees grow around them.
  const occupied = [...obstacles];
  const candidates = [[-3.8, 3.2], [3.8, 3.2], [-4.8, -0.8], [4.8, -0.8], [-4.5, 6.8], [4.5, 6.8], [-3.5, -4], [3.5, -4]]
    .map(([x, z]) => inCabinFrame(frame, x, z));
  if (pond?.ok) {
    const box = fullSizeBounds(pond.entry.group), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
    for (const side of [-1, 1]) for (const front of [-1, 1]) candidates.unshift({ x: center.x + side * (size.x / 2 + 0.85), z: center.z + front * (size.z / 2 + 0.65) });
  }
  for (let index = 0; index < lightCount; index++) {
    const shape = measuredZenShape(ctx, 'lamp', count + index, 1.35 + rng() * 0.2, rng() * 360);
    let chosen;
    for (const base of candidates) {
      for (const spread of [0, 0.6, 1.2, 1.8, 2.4]) {
        const point = { x: round2(base.x + (rng() - 0.5) * spread), z: round2(base.z + (rng() - 0.5) * spread) };
        const box = placedBounds(shape, point);
        if (box.minX < -58 || box.maxX > 58 || box.minZ < -58 || box.maxZ > 58 || occupied.some(obstacle => intersects(box, obstacle, 0.32))) continue;
        chosen = point; break;
      }
      if (chosen) break;
    }
    if (!chosen) return fail('No safe space for all the requested lanterns. Nothing changed. Retry with fewer lights.', 'no_space');
    items.push({ ...shape, ...chosen, type: 'lamp', role: 'lantern', name: `Warm garden lantern ${index + 1}` });
    // Lamps need breathing room so the whole count cannot pile up in one corner.
    occupied.push({ minX: chosen.x - 1.35, maxX: chosen.x + 1.35, minZ: chosen.z - 1.35, maxZ: chosen.z + 1.35 });
  }
  const lightItems = items.filter(item => item.type === 'lamp');
  plan = planGrove(frame, shapes, [...obstacles, ...lightItems.map(item => placedBounds(item, item))], seed);
  if (!plan) return fail('No safe space for the complete forest around the lanterns. Nothing changed.', 'no_space');
  items.splice(0, count, ...plan.map((item, index) => ({ ...item, type: 'tree' as const, role: 'forest' as const, name: `${item.region === 'rear' ? 'Forest' : 'Framing'} pine ${index + 1}` })));
  if (ctx.signal?.aborted) return fail('Cancelled before adding the grove.', 'cancelled');
  const result = await revealZen(ctx, items, revealSeconds);
  const liveTrees = result.live.filter(entry => entry.type === 'tree').length;
  const liveLights = result.live.filter(entry => entry.type === 'lamp').length;
  return ok(ctx, { operation_id: newOpId(), type: 'tree', requested_count: count, added: count,
    live_added: liveTrees, live_lights_added: liveLights,
    exact_count: liveTrees === count && liveLights === lightCount,
    lights_added: lightCount, ids: result.entries.filter(entry => entry.type === 'tree').map(entry => entry.id),
    light_ids: result.entries.filter(entry => entry.type === 'lamp').map(entry => entry.id),
    rear_count: plan.filter(item => item.region === 'rear').length, side_count: plan.filter(item => item.region === 'side').length,
    anchor_id: anchor.entry.id, pond_id: pond?.ok ? pond.entry.id : null, preserved_ids: preserved.map(entry => entry.id),
    undo_id: result.undoId, seed, arrangement: 'Layered forest behind the live cabin, sparse side framing, open porch and pond.',
    ...interruptedNote(result.completed) });
}

export async function addPath(ctx: ToolContext, args: Args): Promise<string> {
  const cabin = ctx.store.resolve(String(args.cabin ?? 'cabin')), pond = ctx.store.resolve(String(args.pond ?? 'pond'));
  if (!cabin.ok || cabin.entry.type !== 'cabin') return fail(cabin.ok ? 'cabin must identify a cabin.' : cabin.error, 'unknown_anchor');
  if (!pond.ok || pond.entry.type !== 'pond') return fail(pond.ok ? 'pond must identify a pond.' : pond.error, 'unknown_anchor');
  const seed = num(args.seed) ?? 24, bend = num(args.bend) ?? 2, revealSeconds = num(args.reveal_seconds) ?? 3;
  if (!Number.isSafeInteger(seed) || Math.abs(bend) > 8 || revealSeconds < 0 || revealSeconds > 15) return fail('seed must be an integer, bend between -8 and 8, reveal_seconds 0–15.');
  ctx.store.syncMatrices();
  const connection = livePathEndpoints(cabin.entry, pond.entry);
  if (!connection) return fail('The pond and porch overlap. Move one anchor first.', 'no_space');
  const { start, end, length } = connection;
  const count = num(args.count) ?? Math.max(4, Math.min(24, Math.floor(length / 0.9) + 1));
  if (!Number.isSafeInteger(count) || count < 3 || count > 40) return fail('count must be an integer between 3 and 40.');
  if (ctx.store.size + count > MAX_SCENE_OBJECTS) return fail('The path exceeds the scene object limit.', 'scene_full');
  const preserved = ctx.store.all(), obstacles = preserved.map(entry => groundBounds(fullSizeBounds(entry.group))), rng = seededRandom(seed);
  // Fit each stepping stone to the actual gap, leaving visible grass between them.
  const scale = Math.max(0.35, Math.min(0.85, length / (count - 1) * 0.48));
  const shapes = Array.from({ length: count }, (_, index) => measuredZenShape(ctx, 'rock', index, scale * (0.94 + rng() * 0.12), rng() * 360, true));
  const plan = planStonePath(start, end, count, shapes, obstacles, bend);
  if (!plan) return fail('The live anchors do not leave a safe, continuous stone path. Nothing changed. Move an obstacle, separate the anchors, or try fewer stones.', 'no_space');
  if (ctx.signal?.aborted) return fail('Cancelled before adding the path.', 'cancelled');
  const result = await revealZen(ctx, plan.map((item, index) => ({ ...item, type: 'rock', role: 'path', name: `Stepping stone ${index + 1}` })), revealSeconds);
  return ok(ctx, { operation_id: newOpId(), added: result.entries.length, live_added: result.live.length,
    exact_count: result.live.length === count, ids: result.entries.map(entry => entry.id), undo_id: result.undoId,
    cabin_id: cabin.entry.id, pond_id: pond.entry.id, start, end, preserved_ids: preserved.map(entry => entry.id),
    editable: true, arrangement: 'Curved, individually editable stepping stones from the live porch to the pond bank.',
    ...interruptedNote(result.completed) });
}

/** Remove only unchanged additions; never restore a snapshot over human work. */
export async function undoScatter(ctx: ToolContext, args: Args): Promise<string> {
  const edit = scatterHistory(ctx.store).take(typeof args.undo_id === 'string' ? args.undo_id : undefined);
  if (!edit) return fail('No matching scatter addition to undo.', 'nothing_to_undo');
  const ids = edit.removable.map(entry => entry.id);
  if (ids.length) await deleteObjects(ctx, { targets: ids });
  return ok(ctx, { undo_id: edit.id, removed_ids: ids, skipped_ids: edit.skipped,
    note: 'Only unchanged additions removed. Later edits and the existing world are preserved.' });
}

/* ------------------------------------------------------------------ */
/* snapshot / undo                                                     */
/* ------------------------------------------------------------------ */

export function snapshotTool(ctx: ToolContext, args: Args): string {
  const label = typeof args.label === 'string' && args.label.trim() ? args.label.trim().slice(0, 40) : 'manual';
  const id = ctx.snapshots.capture(label);
  return ok(ctx, {
    operation_id: newOpId(),
    snapshot_id: id,
    label,
    objects: ctx.store.size,
    note: 'Scene captured. Use undo to return to it.',
  });
}

export async function undoTool(ctx: ToolContext, _args: Args): Promise<string> {
  const result = ctx.snapshots.undo();
  if (!result.ok) return fail(result.error ?? 'undo failed');
  await awaitGroup('lighting');
  return ok(ctx, {
    operation_id: newOpId(),
    restored_snapshot_id: result.snapshot_id,
    from_operation: result.label,
    objects: ctx.store.size,
  });
}

/* ------------------------------------------------------------------ */
/* delete_objects — batch removal ("clear the board")                   */
/* ------------------------------------------------------------------ */

export async function deleteObjects(ctx: ToolContext, args: Args): Promise<string> {
  let entries;
  if (args.targets != null) {
    const resolved = resolveTargets(ctx, args.targets);
    if (typeof resolved === 'string') return fail(resolved, 'unknown_target');
    entries = resolved.ids.map((id) => ctx.store.get(id)!);
  } else {
    entries = ctx.store.all();
    if (args.type != null) {
      const type = String(args.type);
      if (!isObjectType(type)) return fail(`Unknown type "${type}". Allowed: ${OBJECT_TYPES.join(', ')}. Use type + name_contains, or explicit targets.`, 'unknown_type');
      entries = entries.filter((e) => e.type === type);
    }
    if (typeof args.name_contains === 'string') {
      const q = args.name_contains.toLowerCase();
      entries = entries.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (args.type == null && typeof args.name_contains !== 'string') {
      return fail('Provide targets (ids/names), or a type, or name_contains — e.g. {name_contains: "pawn"} clears every pawn.', 'bad_request');
    }
  }

  if (entries.length === 0) {
    return fail('Nothing matches this filter — describe_scene or query_scene shows what exists.', 'unknown_target');
  }

  const opId = newOpId();
  const ids = entries.map((e) => e.id);
  const names = entries.map((e) => e.name);
  for (const e of entries) {
    recordMutation(ctx, () => ctx.store.remove(e.id, ctx.actor ?? 'agent'));
  }
  if (ctx.store.selectedId && ids.includes(ctx.store.selectedId)) ctx.select(null);
  ctx.store.bump();

  // staggered shrink-out, mirroring scatter's spawn rhythm
  const stagger = Math.min(500 / entries.length, 40);
  const results = await Promise.all(entries.map((e, i) => {
    const g = e.group;
    despawn(g, () => {
      ctx.studio.scene.remove(g);
      disposeObject(g);
    }, 280, i * stagger);
    return awaitGroup(`spawn:${g.uuid}`);
  }));
  const allCompleted = results.every((r) => r.completed);

  return ok(ctx, {
    operation_id: opId,
    deleted: ids.length,
    ids: ids.slice(0, 60),
    names: names.slice(0, 20),
    ...interruptedNote(allCompleted),
  });
}

/* ------------------------------------------------------------------ */
/* board_square — ask the board where a chess square is                 */
/* ------------------------------------------------------------------ */

export function boardSquare(ctx: ToolContext, args: Args): string {
  const boardArg = String(args.board ?? 'chessboard');
  const r = ctx.store.resolve(boardArg);
  if (!r.ok) return fail(r.error, 'unknown_target');
  if (r.entry.type !== 'chessboard') {
    return fail(`"${r.entry.name}" is a ${r.entry.type}, not a chessboard.`, 'unknown_target');
  }
  const square = String(args.square ?? '').trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(square)) {
    return fail(`square must be algebraic like "e4" (files a-h, ranks 1-8), got "${args.square}".`, 'bad_request');
  }
  const file = square.charCodeAt(0) - 97; // a..h → 0..7
  const rank = Number(square[1]) - 1;     // 1..8 → 0..7

  const board = r.entry.group;
  const size = 1.8;
  const cell = size / 8;
  const half = size / 2;
  // file a starts at local -x; rank 1 at local -z (rotate the board to face White)
  const lx = -half + (file + 0.5) * cell;
  const lz = -half + (rank + 0.5) * cell;
  const world = new THREE.Vector3(lx, 0.09, lz);
  board.localToWorld(world);

  return ok(ctx, {
    board: r.entry.id,
    board_name: r.entry.name,
    square,
    position: [round2(world.x), round2(world.y), round2(world.z)],
    square_size: round2(cell),
    note: 'Center of the square on the board surface (rank 1 at the board\'s local -z edge). transform_object a piece here with mode absolute.',
  });
}

/* ------------------------------------------------------------------ */
/* chess_move — perform a move the agent decided                       */
/* ------------------------------------------------------------------ */

/** Board-top surface height (boardTop box: center y 0.05 + half 0.031). */
const BOARD_SURFACE_Y = 0.081;

export async function chessMove(ctx: ToolContext, args: Args): Promise<string> {
  const pieceArg = String(args.piece ?? '');
  const r = ctx.store.resolve(pieceArg);
  if (!r.ok) return fail(r.error, 'unknown_target');
  const piece = r.entry;
  if (piece.type !== 'chess_piece') {
    return fail(`"${piece.name}" is a ${piece.type}, not a chess_piece.`, 'unknown_target');
  }

  const square = String(args.to ?? '').trim().toLowerCase();
  if (!/^[a-h][1-8]$/.test(square)) {
    return fail(`to must be algebraic like "e4" (files a-h, ranks 1-8), got "${args.to}".`, 'bad_request');
  }

  // Board: explicit target, else the nearest chessboard to the piece.
  let board;
  if (args.board != null) {
    const r = ctx.store.resolve(String(args.board));
    if (!r.ok) return fail(r.error, 'unknown_target');
    if (r.entry.type !== 'chessboard') {
      return fail(`"${r.entry.name}" is a ${r.entry.type}, not a chessboard.`, 'unknown_target');
    }
    board = r.entry;
  } else {
    const boards = ctx.store.all().filter((e) => e.type === 'chessboard');
    if (boards.length === 0) {
      return fail('No chessboard in the scene — add one with add_object{type:"chessboard"} first.', 'unknown_target');
    }
    const p = piece.group.position;
    board = boards.reduce((best, b) =>
      (b.group.position.distanceToSquared(p) < best.group.position.distanceToSquared(p) ? b : best));
  }

  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const size = 1.8;
  const cell = size / 8;
  const half = size / 2;
  const local = new THREE.Vector3(-half + (file + 0.5) * cell, BOARD_SURFACE_Y, -half + (rank + 0.5) * cell);
  const world = board.group.localToWorld(local.clone());
  const from = piece.group.position.clone();
  const to = world;

  // Animated move with a small lift — visible, never a hard cut.
  const lift = 0.16;
  tween({
    dur: 520,
    group: `pos:${piece.group.uuid}`,
    update: (k) => {
      piece.group.position.x = from.x + (to.x - from.x) * k;
      piece.group.position.z = from.z + (to.z - from.z) * k;
      piece.group.position.y = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * lift;
    },
  });
  ctx.store.bump();
  const completed = (await awaitGroup(`pos:${piece.group.uuid}`)).completed;

  let camera: string = 'none';
  const cam = String(args.camera ?? 'none');
  if (completed && (cam === 'follow' || cam === 'hero')) {
    camera = cam;
    if (cam === 'follow') {
      const dir = new THREE.Vector3(to.x - from.x, 0, to.z - from.z);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      ctx.studio.flyTo(
        { position: new THREE.Vector3(to.x - dir.x * 1.2, 0.9, to.z - dir.z * 1.2), target: new THREE.Vector3(to.x, 0.16, to.z), fov: 42 },
        750,
      );
      await awaitGroup('camera');
    } else {
      await frameCamera(ctx, { target: board.id, angle: 'hero', select: false });
    }
  }

  return ok(ctx, {
    piece: piece.id,
    name: piece.name,
    from: [round2(from.x), round2(from.y), round2(from.z)],
    to: square,
    board: board.id,
    camera,
    ...(completed ? {} : { applied: false, note: 'Move was interrupted mid-animation; the piece rests where it stopped.' }),
    position: [round2(piece.group.position.x), round2(piece.group.position.y), round2(piece.group.position.z)],
  });
}

/* ------------------------------------------------------------------ */
/* set_music — the agent puts on lofi                                  */
/* ------------------------------------------------------------------ */

export function setMusicTool(_ctx: ToolContext, args: Args): string {
  const on = args.on == null ? !isMusicOn() : Boolean(args.on);
  const vol = args.volume == null ? undefined : Math.max(0, Math.min(1, Number(args.volume)));
  const r = setMusic(on, vol);
  return JSON.stringify({ ok: true, playing: r.playing, track: r.track, volume: r.volume, note: r.note });
}

/* ------------------------------------------------------------------ */
/* export_scene / import_scene — scenes become shareable artifacts     */
/* ------------------------------------------------------------------ */

export async function exportScene(ctx: ToolContext, _args: Args): Promise<string> {
  const json = ctx.snapshots.exportJson();
  const objects = ctx.store.size, snapshotVersion = ctx.store.version;
  let hash: string;
  try { hash = await encodeSceneHash(json); }
  catch (error) { return fail(error instanceof Error ? error.message : 'Scene compression failed.', 'export_failed'); }
  const url = `${location.origin}${location.pathname}${hash}`;
  return ok(ctx, {
    bytes: new TextEncoder().encode(json).byteLength,
    encoding: 'gzip-v1',
    snapshot_scene_version: snapshotVersion,
    objects,
    url,
    note:
      url.length > 30_000
        ? 'Compressed share link created, but this large scene may still exceed browser-agent URL limits. Copy or save it before reloading. The active page URL stays unchanged.'
        : 'Compressed share link created. Copy or save it before reloading; the active page URL stays unchanged. Anyone can open it, and import_scene restores it.',
  });
}

export async function importScene(ctx: ToolContext, args: Args): Promise<string> {
  const versionBeforeDecode = ctx.store.version;
  let json = args.json != null ? String(args.json) : '';
  if (!json && args.url != null) {
    try { json = await decodeSceneLink(String(args.url)); }
    catch (error) { return fail(error instanceof Error ? error.message : 'Invalid scene link.', 'bad_request'); }
  }
  if (!json) return fail('Provide the exported json or a share url (with #scene=...).', 'bad_request');
  if (ctx.signal?.aborted) return fail('Scene import was cancelled before applying it.', 'cancelled');
  if (ctx.store.version !== versionBeforeDecode) return fail('The scene changed while decoding the link. Your current work was preserved; observe the scene and retry.', 'scene_changed_during_import');
  // invoke() already captured the pre-import snapshot — no nested capture here
  const r = ctx.snapshots.importJson(json);
  if (!r.ok) return fail(r.error ?? 'import failed', 'bad_request');
  return ok(ctx, {
    restored: r.restored,
    note: 'Scene replaced. undo returns to the previous state — modify freely from here.',
  });
}

/* ------------------------------------------------------------------ */
/* help — the agent playbook                                           */
/* ------------------------------------------------------------------ */

export function helpTool(_ctx: ToolContext, _args: Args): string {
  return JSON.stringify({ ok: true, guide: AGENT_PLAYBOOK });
}
