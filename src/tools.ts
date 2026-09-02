import * as THREE from 'three';
import type { Studio } from './scene';
import { LIGHTING_PRESETS, type LightingPreset } from './scene';
import { SceneStore, round2 } from './store';
import { OBJECT_TYPES, CHESS_PIECES, CHESS_SIDES, isObjectType, disposeObject } from './factory';
import type { SnapshotManager } from './snapshot';
import type { LayoutManager } from './layout';
import { AGENT_PLAYBOOK } from './agent-guide';
import { setMusic, isMusicOn } from './ambience';
import {
  spawnPop, moveObject, rotateObject, scaleObject, fadeMaterialColor, awaitGroup,
  holdCamera, despawn, tween, EASES,
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
  select: (id: string | null) => void;
}

type Args = Record<string, unknown>;

const MAX_OUTPUT_OBJECTS = 40;
const MAX_SCATTER = 200;

/** Deterministic PRNG (mulberry32) so seeded scatter runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
    human_revision: ctx.store.humanRevision,
    human_edits: ctx.store.all().filter(e => e.humanRevision > 0).map(e => ({
      id: e.id, name: e.name, position: e.group.position.toArray(), revision: e.humanRevision,
    })),
    layout: ctx.layout.state,
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
    const o: Record<string, unknown> = { id: e.id, name: e.name, type: e.type, layout_role: e.layoutRole, human_edited: e.humanRevision > 0 };
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
  const entry = ctx.store.spawn(type, {
    name: typeof args.name === 'string' ? args.name : undefined,
    scale,
    rotationYDeg: num(args.rotation_y),
    variant: piece,
  });
  if (side) entry.materials[0]?.color.set(CHESS_SIDES[side as 'white' | 'black']);
  entry.group.position.set(x, 0, z);
  ctx.studio.scene.add(entry.group);
  const lazy = args.animate === false;
  if (lazy) {
    // Bulk placement: still pops in (staggered), but the call returns at once.
    const requestedDelay = num(args.delay_ms);
    const delay = requestedDelay == null ? Math.random() * 1400 : clamp(requestedDelay, 0, 2000);
    spawnPop(entry.group, delay);
  } else {
    spawnPop(entry.group);
    await awaitGroup(`spawn:${entry.group.uuid}`);
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
  if (op !== 'scale' && x == null && y == null && z == null && uniform == null) {
    return fail(`Provide at least one of x, y, z${op === 'scale' ? ' or uniform' : ''}.`);
  }

  const opId = newOpId();
  const groups: string[] = [];
  for (const id of targets.ids) {
    const g = ctx.store.get(id)!.group;
    if (op === 'move') {
      const to = {
        x: mode === 'absolute' ? (x != null ? clamp(x, -58, 58) : undefined) : (x ?? 0) + g.position.x,
        z: mode === 'absolute' ? (z != null ? clamp(z, -58, 58) : undefined) : (z ?? 0) + g.position.z,
        y: mode === 'relative' ? Math.max(0, (y ?? 0) + g.position.y) : y != null ? Math.max(0, y) : undefined,
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

  const updated = targets.ids.map((id) => {
    const entry = ctx.store.get(id)!;
    const g = entry.group;
    return {
      id,
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
    ...interruptedNote(allCompleted),
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
    // keep a lamp's actual light in sync with its glow
    const light = entry.group.userData.light as THREE.PointLight | undefined;
    if (light) {
      const headMat = entry.materials[2] ?? entry.materials[0];
      const k = headMat.emissiveIntensity / 0.85;
      light.intensity = 6 * clamp(k, 0, 4);
      light.color.copy(headMat.emissive);
    }
  }
  ctx.store.bump();

  const results = await Promise.all(groups.map(awaitGroup));
  const allCompleted = results.every((r) => r.completed);

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
  const count = Math.round(num(args.count) ?? 10);
  if (count < 1 || count > MAX_SCATTER) return fail(`count must be between 1 and ${MAX_SCATTER}.`);

  const areaRaw = (args.area ?? {}) as Record<string, unknown>;
  const centerX = clamp(num(areaRaw.center_x) ?? 0, -58, 58);
  const centerZ = clamp(num(areaRaw.center_z) ?? 0, -58, 58);
  const width = clamp(num(areaRaw.width) ?? 10, 0.5, 110);
  const depth = clamp(num(areaRaw.depth) ?? 10, 0.5, 110);

  const jitter = clamp(num(args.jitter) ?? 0.75, 0, 1);
  const scaleVariance = clamp(num(args.scale_variance) ?? 0.2, 0, 1);
  const rotationVariance = clamp(num(args.rotation_variance) ?? 1, 0, 1);

  const zonesRaw = Array.isArray(args.exclusion_zones) ? args.exclusion_zones : [];
  const zones: Zone[] = [];
  for (const raw of zonesRaw) {
    const z = parseZone(raw);
    if (!z) {
      return fail('Each exclusion zone must be {x, z, width, depth} — a rectangle centered at x/z.', 'bad_request');
    }
    zones.push(z);
  }

  // optional seeded RNG: same seed ⇒ identical layout (reproducible scenes/demos)
  const seed = Math.round(num(args.seed) ?? Math.floor(Math.random() * 0xffffffff));
  const rng = mulberry32(seed);

  // optional object avoidance; footprint 'actual_bounds' uses the 2D projection
  // of each object's real bounding box instead of a fixed pad around its origin
  const avoidRaw = Array.isArray(args.avoid_object_ids) ? args.avoid_object_ids.map(String) : [];
  const actualBounds = args.footprint === 'actual_bounds';
  const avoids: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [];
  for (const q of avoidRaw) {
    const r = ctx.store.resolve(q);
    if (!r.ok) return fail(`avoid_object_ids: ${r.error}`, 'unknown_target');
    if (actualBounds) {
      const box = new THREE.Box3().setFromObject(r.entry.group);
      avoids.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
    } else {
      const p = r.entry.group.position;
      avoids.push({ minX: p.x - 0.6, maxX: p.x + 0.6, minZ: p.z - 0.6, maxZ: p.z + 0.6 });
    }
  }
  const boundPad = 0.25;

  const inZone = (x: number, z: number, posPad: number): boolean =>
    zones.some((zo) => Math.abs(x - zo.x) < zo.width / 2 + posPad && Math.abs(z - zo.z) < zo.depth / 2 + posPad) ||
    avoids.some((b) => x > b.minX - boundPad && x < b.maxX + boundPad && z > b.minZ - boundPad && z < b.maxZ + boundPad);

  const opId = newOpId();

  // jittered grid keeps even coverage; exclusions fall back to random retry spots
  const cols = Math.ceil(Math.sqrt((count * width) / Math.max(depth, 0.001)));
  const rows = Math.ceil(count / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const posPad = actualBounds ? 0.25 : 0.5;

  const ids: string[] = [];
  const spawnGroups: string[] = [];
  let skipped = 0;
  let placed = 0;
  let delayIndex = 0;
  const stagger = Math.min(600 / count, 45);

  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < cols && placed < count; c++) {
      let x = centerX - width / 2 + cellW * (c + 0.5) + (rng() - 0.5) * cellW * jitter;
      let z = centerZ - depth / 2 + cellD * (r + 0.5) + (rng() - 0.5) * cellD * jitter;
      if (inZone(x, z, posPad)) {
        let found = false;
        for (let t = 0; t < 6; t++) {
          x = centerX + (rng() - 0.5) * width;
          z = centerZ + (rng() - 0.5) * depth;
          if (!inZone(x, z, posPad)) { found = true; break; }
        }
        if (!found) { skipped++; continue; }
      }
      const s = Math.max(0.35, 1 + (rng() * 2 - 1) * scaleVariance);
      const rot = rng() * 360 * rotationVariance;
      const entry = ctx.store.spawn(type, { scale: s, rotationYDeg: rot });
      entry.group.position.set(round2(x), 0, round2(z));
      ctx.studio.scene.add(entry.group);
      spawnPop(entry.group, delayIndex * stagger);
      spawnGroups.push(`spawn:${entry.group.uuid}`);
      ids.push(entry.id);
      placed++;
      delayIndex++;
    }
  }
  ctx.store.bump();

  await Promise.all(spawnGroups.map(awaitGroup));

  return ok(ctx, {
    operation_id: opId,
    added: placed,
    skipped_excluded: skipped,
    type,
    seed,
    footprint: actualBounds ? 'actual_bounds' : 'pad',
    area: { center_x: centerX, center_z: centerZ, width, depth },
    ids: ids.slice(0, 60),
    ...(ids.length > 60 ? { note: `Showing first 60 of ${ids.length} ids.` } : {}),
  });
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
    ctx.store.remove(e.id);
  }
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
  const local = new THREE.Vector3(-half + (file + 0.5) * cell, 0, -half + (rank + 0.5) * cell);
  const world = board.group.localToWorld(local.clone());
  const from = piece.group.position.clone();
  const to = new THREE.Vector3(world.x, BOARD_SURFACE_Y, world.z);

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

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function exportScene(ctx: ToolContext, _args: Args): string {
  const json = ctx.snapshots.exportJson();
  const hash = `#scene=${b64urlEncode(json)}`;
  const url = `${location.origin}${location.pathname}${hash}`;
  if (location.hash !== hash) history.replaceState(null, '', hash);
  return ok(ctx, {
    bytes: json.length,
    objects: ctx.store.size,
    url,
    note:
      url.length > 30_000
        ? 'Share link created, but it is very long (large scene). Anyone can open it — no WebMCP needed.'
        : 'Share link created (also set as this page URL). Anyone can open it — no WebMCP needed. import_scene restores the JSON.',
  });
}

export async function importScene(ctx: ToolContext, args: Args): Promise<string> {
  let json = args.json != null ? String(args.json) : '';
  if (!json && args.url != null) {
    const m = String(args.url).match(/#scene=([A-Za-z0-9\-_]+)/);
    if (!m) return fail('url contains no #scene= fragment.', 'bad_request');
    json = b64urlDecode(m[1]);
  }
  if (!json) return fail('Provide the exported json or a share url (with #scene=...).', 'bad_request');
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
