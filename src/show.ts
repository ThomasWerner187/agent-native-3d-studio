/**
 * "Watch the agent build" — a ~75 s curated run through the real WebMCP
 * handlers (dispatchTool), paced so a human can interact while it plays:
 *
 *   act 1  a bright meadow; the agent reads the playbook and starts planting
 *   act 2  hundreds of trees + rocks grow in (staggered scatter, seeded)
 *   act 3  a camp appears; the agent sets up a board and plays its opening
 *   act 4  dusk falls — moonlit forest, sparse warm glow stones
 *   act 5  the signature: OPENAI + WEBMCP appear as pixel objects, the
 *          camera climbs to a slow top view, then hands over to the
 *          always-on idle orbit with the music playing.
 *
 * Any pointer input on the canvas pauses the show: the human takes control.
 */

const G: Record<string, string[]> = {
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['###', '#.#', '###', '#..', '#..'],
  E: ['####', '#...', '###.', '#...', '####'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  A: ['###', '#.#', '###', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  B: ['###.', '#..#', '###.', '#..#', '###.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  C: ['.###', '#...', '#...', '#...', '.###'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
};

const CELL = 0.42;
const PX = 0.3; // box scale → ~24 cm pixels

function wordPixels(word: string, z: number): Array<{ x: number; z: number }> {
  const glyphs = word.split('').map((ch) => G[ch]);
  const cols = glyphs.reduce((a, g) => a + g[0].length, 0) + (glyphs.length - 1);
  const startX = -(cols * CELL) / 2;
  const pixels: Array<{ x: number; z: number }> = [];
  let cx = startX;
  for (const g of glyphs) {
    for (let row = 0; row < g.length; row++) {
      for (let col = 0; col < g[row].length; col++) {
        if (g[row][col] === '#') pixels.push({ x: cx + col * CELL, z: z - row * CELL + (g.length - 1) * CELL / 2 });
      }
    }
    cx += (g[0].length + 1) * CELL;
  }
    // the top-view camera reads +x right / -z up — rotate the word 180° so it
  // reads correctly in the finale frame
  return pixels.map((p) => ({ x: p.x, z: 2 * z - p.z }));
}

const LOGO_ZONES = [
  { x: 0, z: -4.0, width: 14.5, depth: 3.4 },
  { x: 0, z: 4.0, width: 16.5, depth: 3.4 },
  { x: 0, z: 0.6, width: 7, depth: 6 },
];

export interface ShowDeps {
  call: (tool: string, args: Record<string, unknown>) => Promise<string>;
  clearToMeadow: () => void;
  armOrbit: () => void;
  onDone: () => void;
  onPause: () => void;
}

export class AgentShow {
  private cancelled = false;
  private running = false;

  constructor(private deps: ShowDeps) {}

  stop(): void {
    if (!this.running) return;
    this.cancelled = true;
    this.deps.onPause();
  }

  get isRunning(): boolean {
    return this.running;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private step(tool: string, args: Record<string, unknown>): Promise<string | null> {
    if (this.cancelled) return Promise.resolve(null);
    return this.deps.call(tool, args).catch(() => null);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    try {
      // ---- act 1: a bright meadow -----------------------------------------
      this.deps.clearToMeadow();
      await this.step('help', {});
      await this.step('describe_scene', {});
      await this.step('set_lighting', { preset: 'golden_hour' });
      await this.sleep(1600);
      if (this.cancelled) return;

      // ---- act 2: the forest grows ----------------------------------------
      const pathClear = [
        { x: 0, z: -1.5, width: 2.6, depth: 6 },
        ...LOGO_ZONES,
      ];
      await this.step('scatter', {
        type: 'tree', count: 70, seed: 11,
        area: { center_x: -10, center_z: -2, width: 14, depth: 26 },
        exclusion_zones: pathClear, scale_variance: 0.35, rotation_variance: 1,
      });
      await this.sleep(2500);
      if (this.cancelled) return;
      await this.step('scatter', {
        type: 'tree', count: 55, seed: 12,
        area: { center_x: 10, center_z: -2, width: 14, depth: 26 },
        exclusion_zones: pathClear, scale_variance: 0.35, rotation_variance: 1,
      });
      await this.sleep(2200);
      if (this.cancelled) return;
      await this.step('scatter', {
        type: 'rock', count: 26, seed: 13,
        area: { center_x: 0, center_z: -4, width: 26, depth: 22 },
        exclusion_zones: LOGO_ZONES, scale_variance: 0.5,
      });
      await this.step('query_scene', { type: 'tree', limit: 1 });
      // small self-correction beat: try a marker, decide against it, remove it
      await this.step('add_object', { type: 'sphere', position: { x: 0.4, z: 3.4 }, scale: 0.6, name: 'trial marker' });
      await this.step('delete_objects', { name_contains: 'trial marker' });
      await this.sleep(1500);
      if (this.cancelled) return;

      // ---- act 3: the camp (and a quick opening move) ----------------------
      await this.step('batch', {
        ops: [
          { tool: 'add_object', args: { type: 'table', position: { x: 0.2, z: 1.6 }, name: 'camp table' } },
          { tool: 'add_object', args: { type: 'chair', position: { x: -0.9, z: 1.9 }, rotation_y: 35, name: 'camp chair' } },
          { tool: 'add_object', args: { type: 'lamp', position: { x: 1.4, z: 2.1 }, name: 'camp lamp' } },
          { tool: 'add_object', args: { type: 'chessboard', position: { x: 2.6, z: 1.4 }, rotation_y: 20, name: 'forest board' } },
        ],
      });
      await this.step('add_object', { type: 'chess_piece', piece: 'pawn', side: 'white', position: { x: 2.25, z: 1.05 }, name: 'white pawn e2' });
      await this.step('board_square', { board: 'forest board', square: 'e4' });
      await this.step('chess_move', { piece: 'white pawn e2', to: 'e4' });
      await this.step('transform_object', { targets: 'camp chair', op: 'rotate', mode: 'relative', y: 15 });
      await this.sleep(1400);
      if (this.cancelled) return;

      // ---- act 4: dusk, sparse warm light ----------------------------------
      await this.step('set_material', { targets: ['camp table'], color: '#ff5fa2' });
      await this.sleep(700);
      await this.step('undo', {});
      await this.step('snapshot', { label: 'before dusk' });
      await this.step('set_lighting', { preset: 'moonlit' });
      await this.sleep(1600);
      if (this.cancelled) return;
      await this.step('scatter', {
        type: 'rock', count: 22, seed: 77,
        area: { center_x: -2, center_z: -3, width: 20, depth: 18 },
        exclusion_zones: LOGO_ZONES, scale_variance: 0.6,
      });
      await this.step('batch', {
        ops: Array.from({ length: 22 }, (_, i) => ({
          tool: 'add_object',
          args: { type: 'rock', name: `glow stone ${i + 1}`, animate: false, scale: 0.5 + (i % 3) * 0.2, position: { x: -6 + (i % 11) * 1.15, z: -8 + Math.floor(i / 11) * 2.4 } },
        })),
      });
      await this.step('set_material', {
        targets: Array.from({ length: 22 }, (_, i) => `glow stone ${i + 1}`),
        emissive: '#ffb36b', emissive_intensity: 1.8, color: '#33281d',
      });
      await this.step('frame_camera', { target: 'camp table', angle: 'three_quarter', focal_length: 38, select: false });
      await this.step('set_music', { on: true, volume: 0.5 });
      await this.sleep(2000);
      if (this.cancelled) return;

      // ---- act 5: the signature --------------------------------------------
      await this.step('set_ui', { visible: false });
      await this.step('camera_path', {
        keyframes: [
          { target: 'camp table', angle: 'three_quarter', focal_length: 40, duration_ms: 2600 },
          { target: 'camp table', angle: 'low', focal_length: 34, duration_ms: 2200 },
          { target: 'scene', angle: 'top', focal_length: 44, duration_ms: 3800, hold_ms: 600 },
        ],
      });
      if (this.cancelled) return;

      const openai = wordPixels('OPENAI', -3.8);
      const webmcp = wordPixels('WEBMCP', 3.8);
      for (const [word, pixels] of [['OPENAI', openai], ['WEBMCP', webmcp]] as const) {
        if (this.cancelled) return;
        await this.step('batch', {
          ops: pixels.map((p, i) => ({
            tool: 'add_object',
            args: { type: 'box', position: { x: p.x, z: p.z }, scale: PX, name: `${word} px ${i}`, animate: false },
          })),
        });
        // glow the whole word in one call — but wait out the 900 ms
        // highlight pulse first, otherwise the pulse's reset kills the glow
        await this.sleep(1000);
        await this.step('set_material', {
          targets: Array.from({ length: pixels.length }, (_, i) => `${word} px ${i}`),
          color: '#ffd9a8', emissive: '#ff9a4d', emissive_intensity: 2.4,
        });
        await this.sleep(2200);
      }
      if (this.cancelled) return;

      // ---- finale: slow top view, then the orbit takes over ----------------
      // Top view centered on the camp at a fixed distance: both words fill the
      // frame and stay well inside the night fog.
      await this.step('frame_camera', { target: 'camp table', angle: 'top', distance: 22, focal_length: 32, select: false });
      await this.sleep(1500);
      const exported = await this.step('export_scene', {});
      if (this.cancelled) return;
      try {
        const url = exported ? ((JSON.parse(exported) as { result?: { url?: string } }).result?.url ?? null) : null;
        if (url) await this.step('import_scene', { url });
      } catch { /* signature stays as-is if the roundtrip fails */ }
      this.deps.armOrbit();
    } finally {
      this.running = false;
      if (!this.cancelled) this.deps.onDone();
    }
  }
}
