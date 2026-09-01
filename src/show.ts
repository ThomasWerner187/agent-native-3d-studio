/**
 * "Watch the agent build" — a curated ~25 s sequence that runs through the
 * EXACT same handlers WebMCP exposes (dispatchTool), so the tool log fills
 * with real calls while the scene transforms: empty meadow → tree avenue →
 * golden hour → lofi → cinematic camera flight. Any pointer input on the
 * canvas pauses the show: the human takes control, visibly.
 */

export interface ShowDeps {
  call: (tool: string, args: Record<string, unknown>) => Promise<void>;
  clearToMeadow: () => void;
  onDone: () => void;
  onPause: () => void;
}

export class AgentShow {
  private cancelled = false;
  private running = false;

  constructor(private deps: ShowDeps) {}

  stop(reason = 'Human took control — show paused. Your turn.'): void {
    if (!this.running) return;
    this.cancelled = true;
    this.deps.onPause();
    console.info(reason);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private step(tool: string, args: Record<string, unknown>): Promise<void> {
    if (this.cancelled) return Promise.resolve();
    return this.deps.call(tool, args);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    try {
      this.deps.clearToMeadow();
      await this.sleep(700);
      if (this.cancelled) return;

      // One batch plants the whole avenue — visibly, staggered, in one turn.
      await this.step('batch', {
        ops: [
          { tool: 'add_object', args: { type: 'tree', position: { x: -1.3, z: -1.2 }, scale: 1.35, name: 'avenue 1' } },
          { tool: 'add_object', args: { type: 'tree', position: { x: 1.5, z: -1.4 }, scale: 1.1, name: 'avenue 2' } },
          { tool: 'add_object', args: { type: 'tree', position: { x: -1.7, z: -2.9 }, scale: 1.55, name: 'avenue 3' } },
          { tool: 'add_object', args: { type: 'tree', position: { x: 1.9, z: -3.1 }, scale: 1.2, name: 'avenue 4' } },
          { tool: 'add_object', args: { type: 'tree', position: { x: -2.2, z: -4.6 }, scale: 1.65, name: 'avenue 5' } },
          { tool: 'add_object', args: { type: 'tree', position: { x: 2.4, z: -4.8 }, scale: 1.4, name: 'avenue 6' } },
          { tool: 'add_object', args: { type: 'rock', position: { x: 0.7, z: 0.4 }, scale: 0.9, name: 'path boulder' } },
          { tool: 'add_object', args: { type: 'lamp', position: { x: -0.9, z: 0.6 }, name: 'path lamp' } },
        ],
      });
      await this.sleep(1200);
      if (this.cancelled) return;

      await this.step('set_lighting', { preset: 'golden_hour' });
      await this.sleep(1100);
      if (this.cancelled) return;

      await this.step('set_music', { on: true, volume: 0.45 });
      await this.sleep(900);
      if (this.cancelled) return;

      await this.step('camera_path', {
        keyframes: [
          { target: 'scene', angle: 'front', focal_length: 40 },
          { target: 'scene', angle: 'low', focal_length: 35 },
          { target: 'scene', angle: 'three_quarter', focal_length: 45, hold_ms: 500 },
          { target: 'scene', angle: 'hero', focal_length: 55 },
        ],
      });
      if (this.cancelled) return;
      await this.sleep(600);
    } finally {
      this.running = false;
      if (!this.cancelled) this.deps.onDone();
    }
  }
}
