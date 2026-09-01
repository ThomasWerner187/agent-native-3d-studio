import * as THREE from 'three';
import type { Studio } from './scene';
import { LIGHTING_PRESETS, type LightingPreset } from './scene';
import { SceneStore, round2 } from './store';
import { OBJECT_TYPES, isObjectType } from './factory';
import type { SnapshotManager } from './snapshot';
import {
  spawnPop, moveObject, rotateObject, scaleObject, fadeMaterialColor, awaitGroup,
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
 */

export interface ToolContext {
  studio: Studio;
  store: SceneStore;
  snapshots: SnapshotManager;
  select: (id: string | null) => void;
}

type Args = Record<string, unknown>;

const MAX_OUTPUT_OBJECTS = 40;
const MAX_SCATTER = 200;

function fail(error: string): string {
  return JSON.stringify({ ok: false, error });
}

function newOpId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function ok(ctx: ToolContext, result: Record<string, unknown>): string {
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
    ground_radius: 60,
    note: entries.length > MAX_OUTPUT_OBJECTS
      ? `Showing first ${MAX_OUTPUT_OBJECTS} of ${entries.length}. Use filter.type to narrow down.`
      : 'All values are the live rendered scene state.',
  };
  return JSON.stringify(body);
}

/* ------------------------------------------------------------------ */
/* add_object                                                          */
/* ------------------------------------------------------------------ */

export async function addObject(ctx: ToolContext, args: Args): Promise<string> {
  const type = String(args.type ?? '');
  if (!isObjectType(type)) {
    return fail(`Unknown type "${type}". Allowed types: ${OBJECT_TYPES.join(', ')}.`);
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
  });
  entry.group.position.set(x, 0, z);
  ctx.studio.scene.add(entry.group);
  spawnPop(entry.group);
  ctx.store.bump();

  await awaitGroup(`spawn:${entry.group.uuid}`);

  return ok(ctx, {
    operation_id: opId,
    id: entry.id,
    name: entry.name,
    type: entry.type,
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
/* frame_camera                                                        */
/* ------------------------------------------------------------------ */

const ANGLES = ['front', 'side', 'top', 'three_quarter', 'low', 'hero'] as const;

export async function frameCamera(ctx: ToolContext, args: Args): Promise<string> {
  const angle = String(args.angle ?? 'three_quarter');
  if (!(ANGLES as readonly string[]).includes(angle)) {
    return fail(`Unknown angle "${angle}". Allowed: ${ANGLES.join(', ')}.`);
  }
  const distance = num(args.distance);
  const focal = num(args.focal_length);
  if (distance != null && (distance < 1 || distance > 90)) return fail('distance must be between 1 and 90.');
  if (focal != null && (focal < 14 || focal > 200)) return fail('focal_length must be between 14 and 200 (35mm-equivalent mm).');

  let center = new THREE.Vector3(0, 0.6, 0);
  let radius = 6;
  const targetArg = String(args.target ?? 'scene');
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
    if (!r.ok) return fail(r.error);
    const box = new THREE.Box3().setFromObject(r.entry.group);
    box.getBoundingSphere(new THREE.Sphere(center));
    radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.6);
    ctx.select(r.entry.id);
  }

  const d = distance ?? Math.max(radius * 2.4, 4);
  const dirs: Record<(typeof ANGLES)[number], THREE.Vector3> = {
    front: new THREE.Vector3(0, 0.22, 1),
    side: new THREE.Vector3(1, 0.22, 0),
    top: new THREE.Vector3(0.001, 1, 0.001),
    three_quarter: new THREE.Vector3(0.8, 0.55, 0.8),
    low: new THREE.Vector3(0.7, 0.08, 0.7),
    hero: new THREE.Vector3(0.75, 0.2, 0.75),
  };
  const dir = dirs[angle as (typeof ANGLES)[number]].normalize();
  const dist = angle === 'hero' ? d * 0.85 : d;
  const position = center.clone().addScaledVector(dir, dist);
  position.y = Math.max(position.y, 0.35);

  let fov: number | undefined;
  if (focal != null) {
    fov = clamp(THREE.MathUtils.radToDeg(2 * Math.atan(12 / focal)), 15, 90);
  }

  const opId = newOpId();
  ctx.studio.flyTo({ position, target: center, fov });

  const { completed } = await awaitGroup('camera');
  const cam = ctx.studio.camera;

  return ok(ctx, {
    operation_id: opId,
    framing: { target: targetArg, angle, distance: round2(dist), fov: fov ? round2(fov) : 'unchanged' },
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
      return fail('Each exclusion zone must be {x, z, width, depth} — a rectangle centered at x/z.');
    }
    zones.push(z);
  }

  const inZone = (x: number, z: number, pad: number): boolean =>
    zones.some((zo) =>
      Math.abs(x - zo.x) < zo.width / 2 + pad && Math.abs(z - zo.z) < zo.depth / 2 + pad,
    );

  const opId = newOpId();

  // jittered grid keeps even coverage; exclusions fall back to random retry spots
  const cols = Math.ceil(Math.sqrt((count * width) / Math.max(depth, 0.001)));
  const rows = Math.ceil(count / cols);
  const cellW = width / cols;
  const cellD = depth / rows;
  const pad = 0.5;

  const ids: string[] = [];
  const spawnGroups: string[] = [];
  let skipped = 0;
  let placed = 0;
  let delayIndex = 0;
  const stagger = Math.min(600 / count, 45);

  for (let r = 0; r < rows && placed < count; r++) {
    for (let c = 0; c < cols && placed < count; c++) {
      let x = centerX - width / 2 + cellW * (c + 0.5) + (Math.random() - 0.5) * cellW * jitter;
      let z = centerZ - depth / 2 + cellD * (r + 0.5) + (Math.random() - 0.5) * cellD * jitter;
      if (inZone(x, z, pad)) {
        let found = false;
        for (let t = 0; t < 6; t++) {
          x = centerX + (Math.random() - 0.5) * width;
          z = centerZ + (Math.random() - 0.5) * depth;
          if (!inZone(x, z, pad)) { found = true; break; }
        }
        if (!found) { skipped++; continue; }
      }
      const s = Math.max(0.35, 1 + (Math.random() * 2 - 1) * scaleVariance);
      const rot = Math.random() * 360 * rotationVariance;
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
