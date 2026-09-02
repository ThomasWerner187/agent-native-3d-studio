import * as THREE from "three";
import type { SceneEntry, SceneStore } from "./store";
import type { Studio } from "./scene";
import { random } from "./art";
import { moveObject, awaitGroup, cancelGroup } from "./anim";

interface Patch {
  entry: SceneEntry;
  before: THREE.Vector3;
  after: THREE.Vector3;
  humanRevision: number;
}
interface LayoutEdit {
  id: string;
  anchor: string;
  patches: Patch[];
}

/** A position-only journal. Undo never restores a whole scene over human work. */
export class LayoutManager {
  private past: LayoutEdit[] = [];
  private future: LayoutEdit[] = [];
  private active: LayoutEdit | null = null;
  private counter = 0;
  onChange?: () => void;

  constructor(
    private store: SceneStore,
    private studio: Studio,
  ) {
    store.onClear = () => this.clear();
    store.onHumanEdit = (id) => {
      if (this.active?.anchor === id) this.stop();
    };
  }

  get busy(): boolean {
    return this.active !== null;
  }
  get state(): { can_undo: boolean; can_redo: boolean; busy: boolean } {
    return {
      can_undo: this.past.length > 0,
      can_redo: this.future.length > 0,
      busy: this.busy,
    };
  }

  stop(): void {
    for (const p of this.active?.patches ?? [])
      cancelGroup(`pos:${p.entry.group.uuid}`);
  }

  clear(): void {
    this.stop();
    this.past = [];
    this.future = [];
    this.onChange?.();
  }

  async arrange(
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (this.busy)
      return {
        ok: false,
        code: "layout_busy",
        error: "A layout is already running.",
      };
    const selected =
      this.store.selectedId && this.store.get(this.store.selectedId);
    const resolved = this.store.resolve(
      String(
        args.anchor ??
          (selected && selected.type === "camp" ? selected.id : "camp"),
      ),
    );
    if (!resolved.ok)
      return { ok: false, code: "unknown_anchor", error: resolved.error };
    const anchor = resolved.entry;
    if (anchor.type !== "camp")
      return {
        ok: false,
        code: "invalid_anchor",
        error: "The anchor must be a camp terrace.",
      };
    const seed = args.seed ?? 42,
      clearance = args.clearance ?? 0.6;
    if (
      typeof seed !== "number" ||
      !Number.isSafeInteger(seed) ||
      typeof clearance !== "number" ||
      !Number.isFinite(clearance) ||
      clearance < 0.3 ||
      clearance > 2
    ) {
      return {
        ok: false,
        code: "invalid_request",
        error: "seed must be an integer; clearance must be between 0.3 and 2.",
      };
    }
    const all = this.store.all();
    const protectedEntries = all.filter(
      (e) =>
        e === anchor ||
        e.humanRevision > 0 ||
        e.id === this.store.selectedId ||
        !e.layoutRole,
    );
    const protectedIds = new Set(protectedEntries.map((e) => e.id));
    const managed = all.filter((e) => e.layoutRole && !protectedIds.has(e.id));
    if (!managed.length)
      return {
        ok: false,
        code: "no_layout_objects",
        error:
          "No movable layout objects remain. Starter paths, pines and lanterns carry layout roles; human edits stay fixed.",
      };
    const obstacles = protectedEntries
      .filter((e) => e !== anchor)
      .map((e) => new THREE.Box3().setFromObject(e.group));
    const campBounds = new THREE.Box3().setFromObject(anchor.group);
    const blocked = (p: THREE.Vector3, pad: number, boxes: THREE.Box3[]) =>
      boxes.some(
        (b) =>
          p.x > b.min.x - pad &&
          p.x < b.max.x + pad &&
          p.z > b.min.z - pad &&
          p.z < b.max.z + pad,
      );

    anchor.group.updateMatrixWorld(true);
    const end = anchor.group.localToWorld(new THREE.Vector3(0, 0, 2.65));
    end.y = 0;
    const start = new THREE.Vector3(0, 0, Math.max(8.5, campBounds.max.z + 5));
    const direction = end.clone().sub(start);
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const pathEntries = managed.filter((e) => e.layoutRole === "path");
    let path: THREE.Vector3[] = [];
    // Search several curves around immutable human objects before changing anything.
    for (const bend of [1.1, -1.1, 2.5, -2.5, 4, -4, 6, -6, 0]) {
      const control = start.clone().lerp(end, 0.5).addScaledVector(side, bend);
      const curve = new THREE.QuadraticBezierCurve3(start, control, end);
      const samples = curve.getPoints(80);
      if (samples.some((point) => blocked(point, 0.48, obstacles))) continue;
      path = curve.getSpacedPoints(Math.max(9, pathEntries.length - 1));
      break;
    }
    if (!path.length)
      return {
        ok: false,
        code: "path_blocked",
        error:
          "Fixed objects block the entrance path. Move the obstacle or camp and retry; nothing changed.",
      };
    const planned = new Map<string, THREE.Vector3>();
    pathEntries.forEach((e, i) =>
      planned.set(
        e.id,
        path[
          Math.round(
            (i / Math.max(1, pathEntries.length - 1)) * (path.length - 1),
          )
        ]
          .clone()
          .setY(e.group.position.y),
      ),
    );
    const rng = random(seed);
    const forest = managed.filter((e) => e.layoutRole === "forest");
    const used: THREE.Vector3[] = [];
    const radius = Math.max(
      11,
      Math.hypot(anchor.group.position.x, anchor.group.position.z) + 7,
    );
    for (let i = 0; i < forest.length; i++) {
      const e = forest[i],
        footprint = 1.4 * Math.max(e.group.scale.x, e.group.scale.z);
      let chosen: THREE.Vector3 | null = null;
      for (let attempt = 0; attempt < 240; attempt++) {
        // A horseshoe grove leaves the foreground open for the human and camera.
        const a =
          attempt === 0 ? 2 + (i / forest.length) * 4 : 1.85 + rng() * 4.4;
        const r =
          attempt === 0
            ? 5.4 + (i % 3) * 1.6
            : 4.5 + rng() * Math.max(4, radius - 5.7);
        const p = new THREE.Vector3(
          Math.cos(a) * r,
          e.group.position.y,
          Math.sin(a) * r,
        );
        if (
          Math.hypot(p.x, p.z) > radius - 1.4 ||
          blocked(p, footprint + clearance, [campBounds, ...obstacles])
        )
          continue;
        if (
          path.some(
            (q) =>
              Math.hypot(q.x - p.x, q.z - p.z) < footprint + clearance + 0.45,
          )
        )
          continue;
        if (used.some((q) => q.distanceTo(p) < 1.35)) continue;
        chosen = p;
        break;
      }
      if (!chosen)
        return {
          ok: false,
          code: "no_space",
          error:
            "The preserved objects leave too little room for this grove. Reduce clearance or move the camp; nothing changed.",
        };
      planned.set(e.id, chosen);
      used.push(chosen);
    }
    const lamps = managed.filter((e) => e.layoutRole === "lantern");
    for (let i = 0; i < lamps.length; i++) {
      const index = Math.round(((i + 0.5) / lamps.length) * (path.length - 1));
      const at = path[index],
        tangent = path[Math.min(path.length - 1, index + 1)]
          .clone()
          .sub(path[Math.max(0, index - 1)])
          .normalize();
      let chosen: THREE.Vector3 | null = null;
      for (const sign of [i % 2 ? -1 : 1, i % 2 ? 1 : -1]) {
        const p = at
          .clone()
          .add(
            new THREE.Vector3(-tangent.z, 0, tangent.x).multiplyScalar(
              sign * 1.1,
            ),
          )
          .setY(lamps[i].group.position.y);
        if (!blocked(p, 0.2, [campBounds, ...obstacles])) {
          chosen = p;
          break;
        }
      }
      if (!chosen)
        return {
          ok: false,
          code: "no_space",
          error: "A fixed object blocks a lantern position; nothing changed.",
        };
      planned.set(lamps[i].id, chosen);
    }
    const patches: Patch[] = managed.flatMap((e) => {
      const after = planned.get(e.id);
      return after && after.distanceTo(e.group.position) > 0.001
        ? [
            {
              entry: e,
              before: e.group.position.clone(),
              after,
              humanRevision: e.humanRevision,
            },
          ]
        : [];
    });
    const edit: LayoutEdit = {
      id: `layout_${++this.counter}`,
      anchor: anchor.id,
      patches,
    };
    this.active = edit;
    this.onChange?.();
    this.studio.highlightObjects(
      patches.map((p) => p.entry.id),
      "#e9b56b",
    );
    const anchorPose = anchor.group.position.clone();
    const completed = await this.animate(patches, "after");
    // Journal only still-live objects untouched by a human during the animation.
    edit.patches = patches
      .filter(
        (p) =>
          this.store.get(p.entry.id) === p.entry &&
          p.entry.humanRevision === p.humanRevision,
      )
      .map((p) => ({ ...p, after: p.entry.group.position.clone() }))
      .filter((p) => p.before.distanceTo(p.after) > 0.001);
    if (edit.patches.length) {
      this.past.push(edit);
      this.past = this.past.slice(-12);
      this.future = [];
      this.store.bump();
    }
    this.active = null;
    this.onChange?.();
    return {
      ok: true,
      applied: completed && anchorPose.equals(anchor.group.position),
      layout_id: edit.id,
      anchor_id: anchor.id,
      anchor_position: anchor.group.position.toArray(),
      preserved_ids: [...protectedIds],
      moved_ids: edit.patches.map((p) => p.entry.id),
      scene_version: this.store.version,
      note: completed
        ? "Live camp placement and human edits preserved. undo_layout reverts only these positions."
        : "Human takeover interrupted the layout. Live partial changes can be reverted with undo_layout.",
    };
  }

  async undo(redo = false): Promise<Record<string, unknown>> {
    if (this.busy)
      return {
        ok: false,
        code: "layout_busy",
        error: "Wait for the current layout to finish.",
      };
    const source = redo ? this.future : this.past,
      destination = redo ? this.past : this.future;
    const edit = source.pop();
    if (!edit)
      return {
        ok: false,
        code: "nothing_to_undo",
        error: redo ? "No layout to redo." : "No layout to undo.",
      };
    const from = redo ? "before" : "after",
      to = redo ? "after" : "before";
    const eligible = edit.patches.filter(
      (p) =>
        this.store.get(p.entry.id) === p.entry &&
        p.entry.humanRevision === p.humanRevision &&
        p.entry.group.position.distanceTo(p[from]) < 0.001,
    );
    this.active = { ...edit, patches: eligible };
    this.onChange?.();
    await this.animate(eligible, to);
    const restored = eligible.filter(
      (p) =>
        this.store.get(p.entry.id) === p.entry &&
        p.entry.humanRevision === p.humanRevision &&
        p.entry.group.position.distanceTo(p[to]) < 0.001,
    );
    if (restored.length) {
      destination.push({ ...edit, patches: restored });
      this.store.bump();
    }
    this.active = null;
    this.onChange?.();
    return {
      ok: true,
      layout_id: edit.id,
      moved_ids: restored.map((p) => p.entry.id),
      skipped_ids: edit.patches
        .filter((p) => !restored.includes(p))
        .map((p) => p.entry.id),
      scene_version: this.store.version,
      note: "Only layout positions restored. Newer edits, materials and the camp remain untouched.",
    };
  }

  private async animate(
    patches: Patch[],
    to: "before" | "after",
  ): Promise<boolean> {
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 950;
    const results = await Promise.all(
      patches.map((p) => {
        moveObject(p.entry.group, p[to], duration);
        return awaitGroup(`pos:${p.entry.group.uuid}`);
      }),
    );
    return results.every((r) => r.completed);
  }
}
