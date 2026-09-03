/** Ground-plane bounds. Candidate bounds already include their final scale and rotation. */
export interface Footprint { minX: number; maxX: number; minZ: number; maxZ: number }
export interface ScatterShape { scale: number; rotation: number; bounds: Footprint }
export interface ScatterPlacement extends ScatterShape { x: number; z: number }

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function overlaps(a: Footprint, b: Footprint, clearance: number): boolean {
  return a.minX < b.maxX + clearance && a.maxX > b.minX - clearance
    && a.minZ < b.maxZ + clearance && a.maxZ > b.minZ - clearance;
}

/** Bounded deterministic planning; no caller-owned scene state is modified. */
export function planScatter(
  shapes: ScatterShape[], area: Footprint, obstacles: Footprint[],
  clearance: number, jitter: number, rng: () => number,
): ScatterPlacement[] | null {
  const count = shapes.length;
  const width = area.maxX - area.minX, depth = area.maxZ - area.minZ;
  const cols = Math.ceil(Math.sqrt(count * width / Math.max(depth, 0.001)));
  const rows = Math.ceil(count / cols);
  // Retry whole plans because a greedy early placement can block the final object.
  for (let pass = 0; pass < 5; pass++) {
    const placements: ScatterPlacement[] = [], occupied = [...obstacles];
    for (let index = 0; index < count; index++) {
      const shape = shapes[index], b = shape.bounds;
      const minX = area.minX - b.minX, maxX = area.maxX - b.maxX;
      const minZ = area.minZ - b.minZ, maxZ = area.maxZ - b.maxZ;
      if (minX > maxX || minZ > maxZ) return null;
      let found = false;
      for (let attempt = 0; attempt < 320; attempt++) {
        // Start with even coverage, then fill gaps left by preserved objects.
        const grid = pass === 0 && attempt === 0;
        const xRaw = grid
          ? area.minX + width / cols * (index % cols + 0.5 + (rng() - 0.5) * jitter)
          : minX + rng() * (maxX - minX);
        const zRaw = grid
          ? area.minZ + depth / rows * (Math.floor(index / cols) + 0.5 + (rng() - 0.5) * jitter)
          : minZ + rng() * (maxZ - minZ);
        const x = Math.round(xRaw * 100) / 100, z = Math.round(zRaw * 100) / 100;
        if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
        const candidate = { minX: b.minX + x, maxX: b.maxX + x, minZ: b.minZ + z, maxZ: b.maxZ + z };
        if (occupied.some(obstacle => overlaps(candidate, obstacle, clearance))) continue;
        placements.push({ ...shape, x, z }); occupied.push(candidate); found = true;
        break;
      }
      if (!found) break;
    }
    if (placements.length === count) return placements;
  }
  return null;
}
