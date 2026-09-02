/** A local, scripted product walkthrough. It is never presented as an AI run. */
interface TourDependencies {
  call(tool: string, args: Record<string, unknown>): Promise<string>;
  cancel(): void;
  onDone(): void;
  onPause(): void;
  onBeat(beat: { kicker: string; title: string; detail: string }): void;
}
export class GuidedTour {
  private running = false;
  private cancelled = false;
  constructor(private deps: TourDependencies) {}
  get isRunning(): boolean {
    return this.running;
  }
  stop(): void {
    if (!this.running) return;
    this.cancelled = true;
    this.deps.cancel();
    this.cleanup();
    this.deps.onPause();
  }
  private cleanup(): void {
    document.body.classList.remove("guided", "ui-hidden");
    document.getElementById("show-cue")?.classList.remove("show-cue-visible");
  }
  private beat(title: string, detail: string): void {
    this.deps.onBeat({
      kicker: "GUIDED TOUR · LOCAL SCRIPT · NO AI",
      title,
      detail,
    });
  }
  private async step(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    if (this.cancelled) throw new Error("stopped");
    const result = JSON.parse(await this.deps.call(tool, args));
    if (!result.ok) throw new Error(result.error ?? "Tour step failed");
    if (this.cancelled) throw new Error("stopped");
  }
  private async hold(ms: number): Promise<void> {
    await new Promise((resolve) => window.setTimeout(resolve, ms));
    if (this.cancelled) throw new Error("stopped");
  }
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.cancelled = false;
    document.body.classList.add("guided");
    try {
      this.beat(
        "A place for your ideas.",
        "Drag this wooden camp anywhere. The scene belongs to you.",
      );
      await this.step("frame_camera", {
        target: "camp",
        angle: "three_quarter",
        distance: 17,
        select: false,
      });
      await this.hold(2500);
      this.beat(
        "Your position stays.",
        "This local walkthrough calls the same layout handler exposed through WebMCP.",
      );
      await this.step("describe_scene", {});
      await this.step("arrange_scene", {});
      await this.hold(2500);
      this.beat(
        "Keep the good. Undo the rest.",
        "Layout undo restores only its own positions. Later human edits stay.",
      );
      await this.step("undo_layout", {});
      await this.hold(1300);
      await this.step("redo_layout", {});
      this.beat(
        "Now give your agent the tools.",
        "A connected browser agent discovers and calls these actions through WebMCP.",
      );
      await this.step("camera_path", {
        keyframes: [
          {
            target: "camp",
            angle: "front",
            distance: 12,
            duration_ms: 2200,
            hold_ms: 1800,
          },
          {
            target: "camp",
            angle: "three_quarter",
            distance: 28,
            duration_ms: 2500,
            hold_ms: 2000,
          },
        ],
      });
    } catch (error) {
      if (!this.cancelled) {
        this.beat(
          "Your scene needs a different layout.",
          error instanceof Error ? error.message : "Tour stopped.",
        );
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    } finally {
      this.running = false;
      this.cleanup();
      if (!this.cancelled) this.deps.onDone();
    }
  }
}
