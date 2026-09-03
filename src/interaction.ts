import * as THREE from 'three';
import type { Studio } from './scene';
import type { SceneStore } from './store';
import type { SnapshotManager } from './snapshot';
import { despawn, cancelGroup } from './anim';
import { disposeObject } from './factory';
import { logToolCall } from './ui';

/**
 * Mouse interaction: orbit (OrbitControls), click-to-select, drag-to-move.
 * This runs independently of any tool execution — the human keeps the mouse
 * at all times, even while an agent is mid-call.
 */

export class Interaction {
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private selected: string | null = null;
  private boxHelper: THREE.BoxHelper | null = null;

  private downAt: { x: number; y: number } | null = null;
  private downHitId: string | null = null;
  private dragging = false;
  private dragGlowDone = false;
  private dragOffset = new THREE.Vector3();
  private activePointer: number | null = null;

  constructor(
    private studio: Studio,
    private store: SceneStore,
    canvas: HTMLCanvasElement,
    private snapshots: SnapshotManager,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    canvas.addEventListener('lostpointercapture', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    studio.onFrame(() => {
      if (this.selected && !store.get(this.selected)) this.select(null);
      this.boxHelper?.update();
      const card = document.getElementById('selection-card');
      const entry = this.selected ? store.get(this.selected) : undefined;
      if (card) card.hidden = !entry;
      if (entry) {
        document.getElementById('selection-name')!.textContent = entry.name;
        const label = document.getElementById('selection-position')!;
        const text = `x ${entry.group.position.x.toFixed(1)} · z ${entry.group.position.z.toFixed(1)} · drag to move`;
        if (label.textContent !== text) label.textContent = text;
      }
    });
  }

  private pick(ev: PointerEvent): string | null {
    const rect = this.studio.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      -((ev.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.studio.camera);
    const groups = this.store.all().map((e) => e.group);
    const hits = this.raycaster.intersectObjects(groups, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      while (o && o.userData.entryId == null) o = o.parent;
      if (o?.userData.entryId) return o.userData.entryId as string;
    }
    return null;
  }

  private onDown(ev: PointerEvent): void {
    if (!ev.isPrimary) {
      // A second finger hands the gesture back to camera controls. Never let
      // its coordinates move an object grabbed by the first pointer.
      this.finishDrag();
      return;
    }
    if (ev.button !== 0) return;
    this.activePointer = ev.pointerId;
    (ev.currentTarget as HTMLCanvasElement).focus({ preventScroll: true });
    this.downAt = { x: ev.clientX, y: ev.clientY };
    this.downHitId = this.pick(ev);
    this.dragging = false;
    if (this.downHitId) {
      // Disable orbit before its pointer handler sees a grab on an object.
      this.studio.controls.enabled = false;
      (ev.currentTarget as HTMLCanvasElement).setPointerCapture(ev.pointerId);
      const hit = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3());
      this.dragOffset.copy(this.store.get(this.downHitId)!.group.position);
      if (hit) this.dragOffset.sub(hit);
      this.select(this.downHitId);
    }
  }

  private onMove(ev: PointerEvent): void {
    if (!this.downAt || ev.pointerId !== this.activePointer) return;
    const dist = Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y);
    if (!this.dragging && dist > 5 && this.downHitId) {
      this.dragging = true;
      this.snapshots.capture('before human move');
      this.store.markHumanEdit(this.downHitId);
      this.studio.controls.enabled = false;
      this.select(this.downHitId);
    }
    if (this.dragging && this.downHitId) {
      const entry = this.store.get(this.downHitId);
      if (!entry) return;
      // human takeover: cancel any in-flight agent tween for THIS object
      cancelGroup(`pos:${entry.group.uuid}`);
      cancelGroup(`rot:${entry.group.uuid}`);
      cancelGroup(`scale:${entry.group.uuid}`);
      if (!this.dragGlowDone) {
        this.dragGlowDone = true;
        this.studio.highlightObjects([entry.id], '#3ca8ff'); // human edits glow blue
      }
      const rect = this.studio.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.studio.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
        hit.add(this.dragOffset);
        const r = Math.hypot(hit.x, hit.z);
        const max = 38;
        if (r > max) hit.multiplyScalar(max / r);
        entry.group.position.x = hit.x;
        entry.group.position.z = hit.z;
        this.studio.invalidateShadows();
      }
    }
  }

  private onUp(ev: PointerEvent): void {
    if (ev.pointerId !== this.activePointer) return;
    if (this.downAt) {
      this.studio.controls.enabled = true;
      if (this.dragging) {
        this.dragging = false;
        this.store.bump(); // human moved an object — let agents detect the change
        const entry = this.downHitId ? this.store.get(this.downHitId) : undefined;
        if (entry) logToolCall('human_move', { name: entry.name }, JSON.stringify({
          ok: true, actor: 'human', result: { id: entry.id, position: entry.group.position.toArray(), preserved_by_layout: true },
        }));
      } else {
        const hitId = this.pick(ev);
        if (hitId) this.select(hitId);
        else this.select(null);
      }
    }
    this.activePointer = null;
    this.dragGlowDone = false;
    this.downAt = null;
    this.downHitId = null;
  }

  private finishDrag(): void {
    if (this.dragging) {
      this.store.bump();
      const entry = this.downHitId ? this.store.get(this.downHitId) : undefined;
      if (entry) logToolCall('human_move', { name: entry.name }, JSON.stringify({
        ok: true, actor: 'human', result: { id: entry.id, position: entry.group.position.toArray(), preserved_by_layout: true },
      }));
    }
    this.studio.controls.enabled = true;
    this.dragging = false;
    this.dragGlowDone = false;
    this.downAt = null;
    this.downHitId = null;
    this.activePointer = null;
  }

  private onKey(ev: KeyboardEvent): void {
    const target = ev.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.selected) {
      ev.preventDefault();
      this.deleteSelected();
    }
    if (ev.key === 'Escape') this.select(null);
    if (ev.key === 'h' || ev.key === 'H') {
      document.body.classList.toggle('ui-hidden');
    }
  }

  select(id: string | null): void {
    this.selected = id;
    this.store.selectedId = id;
    if (this.boxHelper) {
      this.studio.scene.remove(this.boxHelper);
      this.boxHelper.geometry.dispose();
      (this.boxHelper.material as THREE.Material).dispose();
      this.boxHelper = null;
    }
    if (id) {
      const entry = this.store.get(id);
      if (entry) {
        this.boxHelper = new THREE.BoxHelper(entry.group, 0x67b7ff);
        (this.boxHelper.material as THREE.LineBasicMaterial).transparent = true;
        (this.boxHelper.material as THREE.LineBasicMaterial).opacity = 0.85;
        this.studio.scene.add(this.boxHelper);
      }
    }
  }

  deleteSelected(): void {
    const id = this.selected;
    if (!id) return;
    const entry = this.store.get(id);
    if (!entry) return;
    this.select(null);
    this.snapshots.capture('before human delete');
    this.store.markHumanEdit(id);
    this.store.remove(id);
    this.store.bump();
    despawn(entry.group, () => {
      this.studio.scene.remove(entry.group);
      disposeObject(entry.group);
    });
  }
}
