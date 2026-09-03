import { seededRandom, type Footprint } from './scatter-planner';

export interface GroundPoint { x: number; z: number }
export interface CabinFrame extends GroundPoint { rotation: number; scaleX: number; scaleZ: number }
export interface ZenShape { bounds: Footprint; scale: number; rotation: number }
export interface ZenPlacement extends ZenShape, GroundPoint { region?: 'rear' | 'side' }

export function inCabinFrame(frame: CabinFrame, x: number, z: number): GroundPoint {
  const c = Math.cos(frame.rotation), s = Math.sin(frame.rotation);
  return { x: frame.x + c * x * frame.scaleX + s * z * frame.scaleZ,
    z: frame.z - s * x * frame.scaleX + c * z * frame.scaleZ };
}
export function placedBounds(shape: ZenShape, point: GroundPoint): Footprint {
  return { minX: shape.bounds.minX + point.x, maxX: shape.bounds.maxX + point.x,
    minZ: shape.bounds.minZ + point.z, maxZ: shape.bounds.maxZ + point.z };
}
export function intersects(a: Footprint, b: Footprint, gap = 0): boolean {
  return a.minX < b.maxX + gap && a.maxX > b.minX - gap
    && a.minZ < b.maxZ + gap && a.maxZ > b.minZ - gap;
}
function permitted(shape: ZenShape, point: GroundPoint, obstacles: Footprint[], gap: number): boolean {
  const bounds = placedBounds(shape, point);
  return bounds.minX >= -58 && bounds.maxX <= 58 && bounds.minZ >= -58 && bounds.maxZ <= 58
    && !obstacles.some(obstacle => intersects(bounds, obstacle, gap));
}

/** Plan every tree before mutation. Canopies may interleave; trunks never collide.
 * Existing objects and the human's anchors retain their complete visible footprint. */
export function planGrove(frame: CabinFrame, shapes: ZenShape[], obstacles: Footprint[], seed: number): ZenPlacement[] | null {
  const rearCount = Math.ceil(shapes.length * 0.8);
  for (const spread of [1, 1.12, 1.26, 1.4]) {
    const rng = seededRandom(seed), result: ZenPlacement[] = [];
    for (let index = 0; index < shapes.length; index++) {
      const shape = shapes[index], rear = index < rearCount;
      let chosen: GroundPoint | undefined;
      for (let attempt = 0; attempt < 650; attempt++) {
        let x: number, z: number;
        if (rear) {
          // An irregular layered backdrop, denser than an evenly scattered field.
          x = (rng() * 2 - 1) * 9.4 * spread;
          z = -4.8 - rng() * 9.4 * spread;
        } else {
          const side = (index - rearCount) % 2 === 0 ? -1 : 1;
          x = side * (5.4 + rng() * 4.5 * spread);
          z = -3.5 + rng() * 8.7;
        }
        const point = inCabinFrame(frame, x, z);
        point.x = Math.round(point.x * 100) / 100; point.z = Math.round(point.z * 100) / 100;
        if (!permitted(shape, point, obstacles, 0.3)) continue;
        if (result.some(other => Math.hypot(point.x - other.x, point.z - other.z) < 1.1 * (shape.scale + other.scale))) continue;
        chosen = point; break;
      }
      if (!chosen) break;
      result.push({ ...shape, ...chosen, region: rear ? 'rear' : 'side' });
    }
    if (result.length === shapes.length) return result;
  }
  return null;
}

/** Find a smooth bank-to-porch curve, trying both bends around existing objects.
 * Samples are equally spaced by arc length, so curves never bunch up stones. */
export function planStonePath(start: GroundPoint, end: GroundPoint, count: number,
  shapes: ZenShape[], obstacles: Footprint[], bend = 2.2): ZenPlacement[] | null {
  const dx = end.x - start.x, dz = end.z - start.z, distance = Math.hypot(dx, dz);
  if (distance < 1.8) return null;
  const nx = -dz / distance, nz = dx / distance;
  for (const curvature of [bend, -bend, bend * 1.5, -bend * 1.5, 0]) {
    const control = { x: (start.x + end.x) / 2 + nx * curvature, z: (start.z + end.z) / 2 + nz * curvature };
    const samples: Array<GroundPoint & { length: number }> = [{ ...start, length: 0 }];
    for (let i = 1; i <= 120; i++) {
      const t = i / 120, u = 1 - t;
      const point = { x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        z: u * u * start.z + 2 * u * t * control.z + t * t * end.z };
      const previous = samples[i - 1];
      samples.push({ ...point, length: previous.length + Math.hypot(point.x - previous.x, point.z - previous.z) });
    }
    const length = samples.at(-1)!.length, result: ZenPlacement[] = [];
    for (let i = 0; i < count; i++) {
      const wanted = i === count - 1 ? length : length * i / (count - 1);
      const found = samples.findIndex(sample => sample.length >= wanted);
      const right = found < 0 ? samples.length - 1 : Math.max(1, found);
      const a = samples[right - 1], b = samples[right];
      const t = Math.max(0, Math.min(1, (wanted - a.length) / Math.max(0.0001, b.length - a.length)));
      const point = { x: Math.round((a.x + (b.x - a.x) * t) * 100) / 100,
        z: Math.round((a.z + (b.z - a.z) * t) * 100) / 100 };
      if (!permitted(shapes[i], point, obstacles, 0.06)) break;
      if (result.some(other => intersects(placedBounds(shapes[i], point), placedBounds(other, other), 0.06))) break;
      result.push({ ...shapes[i], ...point });
    }
    if (result.length === count) return result;
  }
  return null;
}
