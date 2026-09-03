import { random } from './art';
import type { ObjectType } from './factory';

export const LOFI_SCENES = [
  { id: 'lakeside_cabin', title: 'Lakeside cabin', welcome: 'A quiet place by the water', home: 'A cabin to come home to', camera: [17, 16, 25] },
  { id: 'lantern_grove', title: 'Lantern grove', welcome: 'A clearing beneath the pines', home: 'A terrace for a slower evening', camera: [-19, 16, 23] },
  { id: 'island_hideaway', title: 'Island hideaway', welcome: 'A little island of your own', home: 'A warm window across the water', camera: [22, 18, 16] },
] as const;

export type LofiScene = typeof LOFI_SCENES[number]['id'];
export type Placement = {
  type: ObjectType; name: string; x: number; z: number;
  scale: number | { x: number; y: number; z: number }; turn: number; at: number;
};

export function isLofiScene(value: unknown): value is LofiScene {
  return LOFI_SCENES.some(scene => scene.id === value);
}

/** Three authored compositions; a seed changes small forest details, never the layout's identity. */
export function planLofiScene(scene: LofiScene, seed: number): Placement[] {
  const r = random(seed), out: Placement[] = [];
  const add = (type: ObjectType, name: string, x: number, z: number, at: number, scale: Placement['scale'] = 1, turn = 0) => {
    out.push({ type, name, x, z, at, scale, turn });
  };
  if (scene === 'lakeside_cabin') {
    add('pond', 'Mirror pond', -4.2, 3, 0.01);
    add('cabin', 'Lantern cabin', 1.8, -1.8, 0.12);
    for (let i = 0; i < 26; i++) {
      const a = 2.6 + (i / 26) * 4.55, radius = 7.4 + r() * 1.6;
      add('tree', `Quiet pine ${i + 1}`, Math.cos(a) * radius, Math.sin(a) * radius, 0.23 + i / 26 * 0.36, 0.68 + r() * 0.43, r() * 360);
    }
    for (let i = 0; i < 8; i++) {
      const t = i / 7;
      add('rock', `Moonstone path ${i + 1}`, 2.5 + Math.sin(t * 3.2) * 0.65, 3 + t * 5.2, 0.56 + i * 0.013, { x: 0.9, y: 0.22, z: 0.65 }, t * 90);
    }
    for (let i = 0; i < 5; i++) add('lamp', `Evening lantern ${i + 1}`, i < 3 ? 4.1 : -7.3 + (i - 3) * 1.8, i < 3 ? 3.6 + i * 1.6 : 4.6, 0.67 + i * 0.02, 1.25);
    add('rock', 'Shore stone', -6.8, 0.9, 0.52, 1.3);
    add('rock', 'Old mossy stone', 6.1, -2, 0.54, 1.7);
  } else if (scene === 'lantern_grove') {
    add('camp', 'Lantern terrace', -0.7, -1.3, 0.01, 1.2, -12);
    add('rock', 'Grove hearth stone', 3.4, 0.7, 0.12, 1.7, 32);
    // Two irregular banks frame an open, pond-free picnic clearing.
    for (let i = 0; i < 24; i++) {
      const a = 2.85 + (i / 23) * 3.82, radius = 6.2 + r() * 2.2;
      add('tree', `Grove pine ${i + 1}`, Math.cos(a) * radius, Math.sin(a) * radius - 0.5, 0.2 + i / 24 * 0.39, 0.82 + r() * 0.43, r() * 360);
    }
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      add('rock', `Grove stepping stone ${i + 1}`, -0.1 + Math.sin(t * Math.PI) * 2, 1.7 + t * 6.8, 0.52 + i * 0.013, { x: 0.82, y: 0.22, z: 0.72 }, 35 + t * 80);
    }
    for (let i = 0; i < 9; i++) {
      const a = 0.05 + i / 8 * Math.PI * 1.15;
      add('lamp', `Grove lantern ${i + 1}`, Math.cos(a) * 4.8, Math.sin(a) * 4.8 - 0.4, 0.64 + i * 0.013, 1.15);
    }
    add('rock', 'Fern-side boulder', -4.2, 1.5, 0.48, 1.6);
  } else {
    add('pond', 'Hideaway lagoon', 3.6, 2.5, 0.01, 1.08, -24);
    add('cabin', 'Hideaway cabin', -3.4, -2.8, 0.12, 0.88, 22);
    for (let i = 0; i < 23; i++) {
      const a = 3.05 + i / 22 * 3.13, radius = 7.4 + r() * 1.55;
      add('tree', `Island pine ${i + 1}`, Math.cos(a) * radius, Math.sin(a) * radius, 0.22 + i / 23 * 0.38, 0.72 + r() * 0.38, r() * 360);
    }
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      add('rock', `Hideaway shore path ${i + 1}`, -3 + t * 4.2, 1 + Math.sin(t * Math.PI * 0.65) * 6.8, 0.54 + i * 0.012, { x: 0.85, y: 0.2, z: 0.65 }, t * 110);
    }
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      add('lamp', `Island lantern ${i + 1}`, -4.6 + t * 5.8, 1.7 + Math.sin(t * Math.PI * 0.7) * 4.5, 0.66 + i * 0.016, 1.1);
    }
    add('rock', 'Lagoon overlook', 6.6, -0.9, 0.47, 2.1, 38);
    add('rock', 'Quiet shore', -1.4, 7.7, 0.5, 1.6, -22);
  }
  return out.sort((a, b) => a.at - b.at);
}
