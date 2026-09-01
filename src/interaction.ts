import * as THREE from 'three';
import type { Studio } from './scene';
import type { SceneStore } from './store';
import { despawn } from './anim';

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

  constructor(
    private studio: Studio,
    private store: SceneStore,
    canvas: HTMLCanvasElement,
  ) {
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('keydown', (e) => this.onKey(e));
    studio.onFrame(() => this.boxHelper?.update());
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
    if (ev.button !== 0) return;
    this.downAt = { x: ev.clientX, y: ev.clientY };
    this.downHitId = this.pick(ev);
    this.dragging = false;
  }

  private onMove(ev: PointerEvent): void {
    if (!this.downAt) return;
    const dist = Math.hypot(ev.clientX - this.downAt.x, ev.clientY - this.downAt.y);
    if (!this.dragging && dist > 5 && this.downHitId) {
      this.dragging = true;
      this.studio.controls.enabled = false;
      this.select(this.downHitId);
    }
    if (this.dragging && this.downHitId) {
      const entry = this.store.get(this.downHitId);
      if (!entry) return;
      const rect = this.studio.renderer.domElement.getBoundingClientRect();
      this.pointer.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(this.pointer, this.studio.camera);
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, hit)) {
        const r = Math.hypot(hit.x, hit.z);
        const max = 38;
        if (r > max) hit.multiplyScalar(max / r);
        entry.group.position.x = hit.x;
        entry.group.position.z = hit.z;
      }
    }
  }

  private onUp(ev: PointerEvent): void {
    if (this.downAt) {
      this.studio.controls.enabled = true;
      if (this.dragging) {
        this.dragging = false;
        this.store.bump(); // human moved an object — let agents detect the change
      } else {
        const hitId = this.pick(ev);
        if (hitId) this.select(hitId);
        else this.select(null);
      }
    }
    this.downAt = null;
    this.downHitId = null;
  }

  private onKey(ev: KeyboardEvent): void {
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && this.selected) {
      ev.preventDefault();
      this.deleteSelected();
    }
    if (ev.key === 'Escape') this.select(null);
  }

  select(id: string | null): void {
    this.selected = id;
    if (this.boxHelper) {
      this.studio.scene.remove(this.boxHelper);
      this.boxHelper = null;
    }
    if (id) {
      const entry = this.store.get(id);
      if (entry) {
        this.boxHelper = new THREE.BoxHelper(entry.group, 0xffb36b);
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
    this.store.remove(id);
    this.store.bump();
    despawn(entry.group, () => this.studio.scene.remove(entry.group));
  }
}
