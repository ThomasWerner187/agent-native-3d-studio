/**
 * "Watch the agent write the scene" — a ~60 s curated run through the real WebMCP
 * handlers (dispatchTool), paced so a human can interact while it plays:
 *
 *   act 1  a bright meadow; the agent reads the playbook and starts planting
 *   act 2  hundreds of trees + rocks grow in (staggered scatter, seeded)
 *   act 3  a camp appears; the agent sets up a board and plays its opening
 *   act 4  dusk falls — moonlit forest, sparse warm glow stones
 *   act 5  the signature: OPENAI + WEBMCP are written pixel by pixel in the
 *          scene, then the camera lands on the finished artifact — no cloud
 *          screensaver, no mystery cutaway.
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
  onDone: () => void;
  onPause: () => void;
  onBeat?: (beat: { kicker: string; title: string; detail: string }) => void;
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

  private beat(kicker: string, title: string, detail: string): void {
    this.deps.onBeat?.({ kicker, title, detail });
  }

  /** Write a word into the scene in small, inspectable tool batches. */
  private async writeWord(word: string, z: number, color: string, emissive: string): Promise<boolean> {
    const pixels = wordPixels(word, z);
    this.beat(
      `${word} // LIVE WRITE`,
      word === 'OPENAI' ? 'The model has entered the canvas.' : 'The canvas has entered the chat.',
      'One pixel, one real add_object call. No fake overlay. No DOM trickery.',
    );

    const chunkSize = 6;
    for (let i = 0; i < pixels.length; i += chunkSize) {
      const chunk = pixels.slice(i, i + chunkSize);
      const result = await this.step('batch', {
        ops: chunk.map((p, j) => ({
          tool: 'add_object',
          args: {
            type: 'box',
            position: { x: p.x, z: p.z },
            scale: PX,
            name: `${word} px ${i + j}`,
            animate: false,
            delay_ms: j * 70,
          },
        })),
      });
      if (this.cancelled || result === null) return false;
      await this.sleep(260);
    }

    const materialResult = await this.step('set_material', {
      targets: pixels.map((_, i) => `${word} px ${i}`),
      color,
      emissive,
      emissive_intensity: 2.4,
    });
    if (this.cancelled || materialResult === null) return false;
    await this.sleep(1000);
    return true;
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
      this.beat('WEBMCP // FIELD TEST 01', 'A blank canvas. An unfair advantage.', 'No DOM. No drag-and-guess. Watch the scene answer.');
      await this.step('help', {});
      await this.step('describe_scene', {});
      await this.step('set_lighting', { preset: 'golden_hour' });
      await this.sleep(1000);
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
      this.beat('PHASE 01 // WORLD BUILDING', 'Planting the impossible shortcut.', 'One sentence in. A forest out. The path stays clear.');
      await this.sleep(1200);
      if (this.cancelled) return;
      await this.step('scatter', {
        type: 'tree', count: 55, seed: 12,
        area: { center_x: 10, center_z: -2, width: 14, depth: 26 },
        exclusion_zones: pathClear, scale_variance: 0.35, rotation_variance: 1,
      });
      await this.sleep(1200);
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
      await this.sleep(900);
      if (this.cancelled) return;

      // ---- act 3: the camp (and a quick opening move) ----------------------
      this.beat('PHASE 02 // SHARED CONTROL', 'Two users. One scene. Zero tug-of-war.', 'The agent builds; your mouse still wins.');
      await this.step('batch', {
        ops: [
          { tool: 'add_object', args: { type: 'table', position: { x: 0.2, z: 0.2 }, name: 'camp table' } },
          { tool: 'add_object', args: { type: 'chair', position: { x: -0.9, z: 0.5 }, rotation_y: 35, name: 'camp chair' } },
          { tool: 'add_object', args: { type: 'lamp', position: { x: 1.4, z: 0.7 }, name: 'camp lamp' } },
          { tool: 'add_object', args: { type: 'chessboard', position: { x: 2.6, z: 0.0 }, rotation_y: 20, name: 'forest board' } },
        ],
      });
      await this.step('add_object', { type: 'chess_piece', piece: 'pawn', side: 'white', position: { x: 2.25, z: -0.35 }, name: 'white pawn e2' });
      await this.step('board_square', { board: 'forest board', square: 'e4' });
      await this.step('chess_move', { piece: 'white pawn e2', to: 'e4' });
      await this.step('transform_object', { targets: 'camp chair', op: 'rotate', mode: 'relative', y: 15 });
      await this.sleep(900);
      if (this.cancelled) return;

      // ---- act 4: dusk, sparse warm light ----------------------------------
      this.beat('PHASE 03 // MOOD IS AN API', 'Now make it cinematic.', 'A preset, a glow, and a little suspiciously good lighting.');
      await this.step('set_material', { targets: ['camp table'], color: '#ff5fa2' });
      await this.sleep(700);
      await this.step('undo', {});
      await this.step('snapshot', { label: 'before dusk' });
      await this.step('set_lighting', { preset: 'moonlit' });
      await this.sleep(1100);
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
      await this.sleep(1000);
      if (this.cancelled) return;

      // ---- act 5: the signature --------------------------------------------
      this.beat('THE REVEAL // NO CLOUDS REQUIRED', 'Let the interface write its own credits.', 'The proof is in the pixels — and in the Tool Log.');
      await this.step('set_ui', { visible: false });
      await this.step('camera_path', {
        keyframes: [
          { target: 'camp table', angle: 'three_quarter', focal_length: 40, duration_ms: 1600, hold_ms: 350 },
          { target: 'camp table', angle: 'low', focal_length: 34, duration_ms: 1500, hold_ms: 350 },
          { target: 'camp table', angle: 'top', distance: 20, focal_length: 42, duration_ms: 2200, hold_ms: 850 },
        ],
      });
      if (this.cancelled) return;

      // Bring the HUD back exactly when the writing starts: the audience sees
      // both the scene being written and the real batches in the Tool Log.
      await this.step('set_ui', { visible: true });
      await this.step('frame_camera', { target: 'camp table', angle: 'top', distance: 20, focal_length: 42, select: false });
      if (!(await this.writeWord('OPENAI', -3.8, '#ffd9a8', '#ff6b4a'))) return;
      await this.sleep(500);
      if (!(await this.writeWord('WEBMCP', 3.8, '#a7e8ff', '#4de3ff'))) return;
      if (this.cancelled) return;

      // ---- finale: a readable artifact, then a human-scale hero shot --------
      this.beat('ARTIFACT // SHAREABLE MOMENT', 'Twenty tools. Zero cloud drama.', 'Export the scene, keep the proof, then take the camera back.');
      await this.step('set_ui', { visible: false });
      await this.step('camera_path', {
        keyframes: [
          { target: 'camp table', angle: 'top', distance: 20, focal_length: 42, duration_ms: 900, hold_ms: 2600 },
          { target: 'camp table', angle: 'three_quarter', distance: 12, focal_length: 52, duration_ms: 2200, hold_ms: 3200 },
        ],
      });
      if (this.cancelled) return;
      const exported = await this.step('export_scene', {});
      if (this.cancelled) return;
      try {
        const url = exported ? ((JSON.parse(exported) as { result?: { url?: string } }).result?.url ?? null) : null;
        if (url) await this.step('import_scene', { url });
      } catch { /* signature stays as-is if the roundtrip fails */ }
      this.beat('TAKEOVER // HUMAN MODE', 'Your move.', 'Grab the camera. The agent is done — politely, permanently, and without clouds.');
    } finally {
      this.running = false;
      if (!this.cancelled) this.deps.onDone();
    }
  }
}
