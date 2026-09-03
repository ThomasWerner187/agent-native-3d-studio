import type { SceneEntry, SceneStore } from './store';

interface Addition {
  entry: SceneEntry;
  revision: number;
  humanRevision: number;
  fingerprint: string;
}
interface ScatterEdit { id: string; additions: Addition[] }

/** Includes direct edits from legacy callers that do not stamp semantic revisions. */
function fingerprint(entry: SceneEntry): string {
  const group = entry.group;
  return JSON.stringify([entry.name, entry.layoutRole, group.position.toArray(), group.quaternion.toArray(),
    group.scale.toArray(), entry.materials.map(mat => [mat.color.getHex(), mat.emissive.getHex(),
      mat.roughness, mat.metalness, mat.emissiveIntensity, mat.opacity, mat.transparent])]);
}

class ScatterHistory {
  private edits: ScatterEdit[] = [];
  private generation: number;
  private counter = 0;
  constructor(private store: SceneStore) { this.generation = store.generation; }

  private sync(): void {
    if (this.generation === this.store.generation) return;
    this.generation = this.store.generation; this.edits = [];
  }

  get state() {
    this.sync();
    return { can_undo: this.edits.length > 0, latest_undo_id: this.edits.at(-1)?.id ?? null, operations: this.edits.length };
  }

  /** Capture before reveal animation, while the complete intended scale is present. */
  record(entries: SceneEntry[]): string {
    this.sync();
    const id = `scatter_${++this.counter}`;
    this.edits.push({ id, additions: entries.map(entry => ({ entry, revision: entry.revision,
      humanRevision: entry.humanRevision, fingerprint: fingerprint(entry) })) });
    this.edits = this.edits.slice(-12);
    return id;
  }

  take(id?: string): { id: string; removable: SceneEntry[]; skipped: string[] } | null {
    this.sync();
    const index = id ? this.edits.findIndex(edit => edit.id === id) : this.edits.length - 1;
    if (index < 0) return null;
    const [edit] = this.edits.splice(index, 1);
    const removable: SceneEntry[] = [], skipped: string[] = [];
    for (const addition of edit.additions) {
      const entry = this.store.get(addition.entry.id);
      if (entry === addition.entry && entry.revision === addition.revision
        && entry.humanRevision === addition.humanRevision && fingerprint(entry) === addition.fingerprint) removable.push(entry);
      else skipped.push(addition.entry.id);
    }
    return { id: edit.id, removable, skipped };
  }
}

const histories = new WeakMap<SceneStore, ScatterHistory>();
export function scatterHistory(store: SceneStore): ScatterHistory {
  let history = histories.get(store);
  if (!history) { history = new ScatterHistory(store); histories.set(store, history); }
  return history;
}
