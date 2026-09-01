import * as THREE from 'three';

/**
 * Tiny hand-rolled tween engine. Every tool action animates through this,
 * so tool execution is always visible in the viewport — never a hard cut.
 */

type Ease = (k: number) => number;

const linear: Ease = (k) => k;
const easeOutCubic: Ease = (k) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic: Ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** Perlin smootherstep — the "cinematic" camera feel: extra-gentle ends. */
const smootherstep: Ease = (k) => k * k * k * (k * (k * 6 - 15) + 10);
const easeOutBack: Ease = (k) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};

export const EASES: Record<string, Ease> = {
  linear,
  smooth: easeInOutCubic,
  cinematic: smootherstep,
};

export function getEase(name?: string): Ease {
  return (name && EASES[name]) || easeInOutCubic;
}

interface Tween {
  startAt: number;
  dur: number;
  ease: Ease;
  update: (k: number) => void;
  done?: () => void;
  group?: string;
}

const tweens: Tween[] = [];

type GroupWaiter = (status: { completed: boolean }) => void;
const groupWaiters = new Map<string, GroupWaiter[]>();

function flushGroup(group: string, completed: boolean): void {
  const waiters = groupWaiters.get(group);
  if (!waiters) return;
  groupWaiters.delete(group);
  for (const w of waiters) w({ completed });
}

function groupHasActiveTweens(group: string): boolean {
  return tweens.some((t) => t.group === group);
}

/**
 * Resolves when every tween in the group has finished — {completed: true} —
 * or immediately reports {completed: false} if the group is cancelled
 * (e.g. a human grabbed the camera, or a newer call superseded this one).
 * Mutating tools await this so they only report success once the visible
 * scene state has actually settled.
 */
export function awaitGroup(group: string): Promise<{ completed: boolean }> {
  if (!groupHasActiveTweens(group)) return Promise.resolve({ completed: true });
  return new Promise((resolve) => {
    const list = groupWaiters.get(group) ?? [];
    list.push(resolve);
    groupWaiters.set(group, list);
  });
}

export function tween(opts: {
  dur: number;
  delay?: number;
  ease?: Ease;
  update: (k: number) => void;
  done?: () => void;
  /** Starting a tween in a group cancels the previous one in that group. */
  group?: string;
}): void {
  if (opts.group) cancelGroup(opts.group);
  tweens.push({
    startAt: performance.now() + (opts.delay ?? 0),
    dur: opts.dur,
    ease: opts.ease ?? easeInOutCubic,
    update: opts.update,
    done: opts.done,
    group: opts.group,
  });
}

export function cancelGroup(group: string): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    if (tweens[i].group === group) tweens.splice(i, 1);
  }
  flushGroup(group, false);
}

export function updateTweens(now: number): void {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    if (now < t.startAt) continue;
    const k = Math.min(1, (now - t.startAt) / t.dur);
    t.update(t.ease(k));
    if (k >= 1) {
      const group = t.group;
      tweens.splice(i, 1);
      t.done?.();
      if (group && !groupHasActiveTweens(group)) flushGroup(group, true);
    }
  }
}

/** Pop-in spawn: scale from 0 to 1 with a little overshoot. */
export function spawnPop(obj: THREE.Object3D, delay = 0, dur = 420): void {
  const target = obj.scale.clone();
  obj.scale.setScalar(0.001);
  tween({
    delay,
    dur,
    ease: easeOutBack,
    update: (k) => {
      const s = Math.max(0.001, k);
      obj.scale.set(target.x * s, target.y * s, target.z * s);
    },
    group: `spawn:${obj.uuid}`,
  });
}

/** Shrink to nothing, then remove from parent. */
export function despawn(obj: THREE.Object3D, done: () => void, dur = 260, delay = 0): void {
  const start = obj.scale.clone();
  tween({
    delay,
    dur,
    ease: easeOutCubic,
    update: (k) => obj.scale.copy(start).multiplyScalar(Math.max(0.001, 1 - k)),
    done,
    group: `spawn:${obj.uuid}`,
  });
}

export function moveObject(obj: THREE.Object3D, to: { x?: number; y?: number; z?: number }, dur = 450): void {
  const from = obj.position.clone();
  const target = new THREE.Vector3(
    to.x ?? from.x,
    to.y ?? from.y,
    to.z ?? from.z,
  );
  tween({
    dur,
    update: (k) => obj.position.lerpVectors(from, target, k),
    group: `pos:${obj.uuid}`,
  });
}

export function rotateObject(obj: THREE.Object3D, to: { x?: number; y?: number; z?: number }, dur = 450): void {
  const from = obj.rotation.clone();
  const target = new THREE.Euler(
    to.x ?? from.x,
    to.y ?? from.y,
    to.z ?? from.z,
  );
  tween({
    dur,
    update: (k) => {
      obj.rotation.set(
        THREE.MathUtils.lerp(from.x, target.x, k),
        THREE.MathUtils.lerp(from.y, target.y, k),
        THREE.MathUtils.lerp(from.z, target.z, k),
      );
    },
    group: `rot:${obj.uuid}`,
  });
}

export function scaleObject(obj: THREE.Object3D, to: { x: number; y: number; z: number }, dur = 450): void {
  const from = obj.scale.clone();
  const target = new THREE.Vector3(to.x, to.y, to.z);
  tween({
    dur,
    ease: easeOutCubic,
    update: (k) => obj.scale.lerpVectors(from, target, k),
    group: `scale:${obj.uuid}`,
  });
}

/** Smoothly transition a material color property to a new hex value. */
export function fadeMaterialColor(
  material: THREE.MeshStandardMaterial,
  prop: 'color' | 'emissive',
  hex: string,
  dur = 350,
): void {
  const color = prop === 'color' ? material.color : material.emissive;
  const from = color.clone();
  const to = new THREE.Color(hex);
  tween({
    dur,
    update: (k) => color.copy(from).lerp(to, k),
    group: `col:${material.uuid}:${prop}`,
  });
}

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov?: number;
}

export function tweenCamera(
  camera: THREE.PerspectiveCamera,
  controls: { target: THREE.Vector3; update: () => void },
  to: CameraPose,
  dur = 900,
  ease: Ease = easeInOutCubic,
): void {
  const fromPos = camera.position.clone();
  const fromTarget = controls.target.clone();
  const fromFov = camera.fov;
  const toFov = to.fov ?? camera.fov;
  const group = 'camera';
  tween({
    dur,
    ease,
    group,
    update: (k) => {
      camera.position.lerpVectors(fromPos, to.position, k);
      controls.target.lerpVectors(fromTarget, to.target, k);
      if (fromFov !== toFov) {
        camera.fov = THREE.MathUtils.lerp(fromFov, toFov, k);
        camera.updateProjectionMatrix();
      }
      controls.update();
    },
  });
}

/**
 * A cancellable pause in the 'camera' tween group: used for holds between
 * camera_path keyframes. A human grabbing the camera resolves it early.
 */
export function holdCamera(ms: number): void {
  tween({ dur: ms, ease: linear, update: () => {}, group: 'camera' });
}

/** Any user input on the controls cancels an in-flight camera tween. */
export function cancelCameraTween(): void {
  cancelGroup('camera');
}

/** Abort propagation: cancel every in-flight tool tween (camera, moves, pops). */
export function cancelAllToolTweens(): void {
  const groups = new Set(tweens.map((t) => t.group).filter((g): g is string => !!g));
  for (const g of groups) cancelGroup(g);
}
