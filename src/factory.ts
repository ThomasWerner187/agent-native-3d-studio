import * as THREE from 'three';
import { asset } from './art';
import { cabin, pond } from './lofi-assets';
import { batchStaticMeshes } from './geometry';

/**
 * Object factory for primitives + furniture presets.
 * Every object is a THREE.Group whose origin sits on the ground (y = 0),
 * so positioning objects "on the floor" is just position.y = 0.
 */

export const OBJECT_TYPES = [
  'box', 'sphere', 'cylinder', 'plane',
  'tree', 'rock', 'lamp', 'window', 'chair', 'table',
  'chessboard', 'chess_piece', 'camp', 'cabin', 'pond',
] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export function isObjectType(t: string): t is ObjectType {
  return (OBJECT_TYPES as readonly string[]).includes(t);
}

/** Muted, warm lofi palette. */
export const DEFAULT_COLORS: Record<ObjectType, { color: string; roughness: number; metalness: number }> = {
  box:      { color: '#c9b8a3', roughness: 0.85, metalness: 0.0 },
  sphere:   { color: '#c97b6d', roughness: 0.7,  metalness: 0.0 },
  cylinder: { color: '#7f96a3', roughness: 0.75, metalness: 0.05 },
  plane:    { color: '#d8c7a8', roughness: 0.95, metalness: 0.0 },
  tree:     { color: '#5d7c5a', roughness: 0.9,  metalness: 0.0 },
  rock:     { color: '#9a938c', roughness: 0.95, metalness: 0.0 },
  lamp:     { color: '#ffd9a0', roughness: 0.6,  metalness: 0.0 },
  window:   { color: '#a8c8d8', roughness: 0.15, metalness: 0.1 },
  chair:    { color: '#b08968', roughness: 0.8,  metalness: 0.0 },
  table:    { color: '#9c7a5b', roughness: 0.8,  metalness: 0.0 },
  chessboard:  { color: '#ffffff', roughness: 0.75, metalness: 0.0 },
  chess_piece: { color: '#e8dcc8', roughness: 0.55, metalness: 0.05 },
  cabin: { color: '#af8055', roughness: 0.65, metalness: 0 },
  pond: { color: '#2b777a', roughness: 0.19, metalness: 0.58 },
  camp: { color: '#998669', roughness: 0.75, metalness: 0 },
};

export interface BuiltObject {
  group: THREE.Group;
  /** All mesh materials in the group (for set_material). */
  materials: THREE.MeshStandardMaterial[];
}

function stdMat(color: string, roughness: number, metalness = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Free GPU resources of a removed object (call AFTER unlinking from the scene). */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    o.userData.dispose?.();
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

export function buildObject(type: ObjectType, variant?: string, seed?: number): BuiltObject {
  const detailed = type === 'cabin' ? cabin() : type === 'pond' ? pond(seed ?? 0) : asset(type, seed);
  if (detailed) {
    batchStaticMeshes(detailed);
    const materials: THREE.MeshStandardMaterial[] = [];
    detailed.traverse((o) => {
      o.userData.rootRef = detailed;
      const mat = (o as THREE.Mesh).material;
      if (mat instanceof THREE.MeshStandardMaterial && !materials.includes(mat)) materials.push(mat);
    });
    return { group: detailed, materials };
  }
  const group = new THREE.Group();
  const materials: THREE.MeshStandardMaterial[] = [];
  const def = DEFAULT_COLORS[type];

  const add = (m: THREE.Mesh) => {
    group.add(m);
    if (m.material instanceof THREE.MeshStandardMaterial) materials.push(m.material);
  };

  switch (type) {
    case 'box': {
      add(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), stdMat(def.color, def.roughness)));
      group.children[0].position.y = 0.4;
      break;
    }
    case 'sphere': {
      add(mesh(new THREE.SphereGeometry(0.5, 28, 20), stdMat(def.color, def.roughness)));
      group.children[0].position.y = 0.5;
      break;
    }
    case 'cylinder': {
      add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 28), stdMat(def.color, def.roughness)));
      group.children[0].position.y = 0.4;
      break;
    }
    case 'plane': {
      // a flat pad / rug
      add(mesh(new THREE.BoxGeometry(1.8, 0.04, 1.2), stdMat(def.color, def.roughness)));
      group.children[0].position.y = 0.02;
      break;
    }
    case 'window': {
      const frameMat = stdMat('#7a6a58', 0.8);
      const glassMat = stdMat(def.color, def.roughness, def.metalness);
      glassMat.transparent = true;
      glassMat.opacity = 0.38;
      glassMat.emissive = new THREE.Color('#9fc8e8');
      glassMat.emissiveIntensity = 0.18;
      const w = 1.3, h = 1.7, th = 0.08;
      const l = mesh(new THREE.BoxGeometry(th, h, th), frameMat); l.position.set(-w / 2, h / 2, 0);
      const r = mesh(new THREE.BoxGeometry(th, h, th), frameMat); r.position.set(w / 2, h / 2, 0);
      const top = mesh(new THREE.BoxGeometry(w + th, th, th), frameMat); top.position.set(0, h, 0);
      const bot = mesh(new THREE.BoxGeometry(w + th, 0.12, 0.14), frameMat); bot.position.set(0, 0.06, 0);
      const mv = mesh(new THREE.BoxGeometry(0.045, h, 0.05), frameMat); mv.position.set(0, h / 2, 0);
      const mh = mesh(new THREE.BoxGeometry(w, 0.045, 0.05), frameMat); mh.position.set(0, h / 2, 0);
      const glass = mesh(new THREE.PlaneGeometry(w - 0.08, h - 0.1), glassMat, false);
      glass.position.set(0, h / 2, 0);
      // add glass material first so set_material hits it (it is the "identity" of a window)
      add(glass); add(l); add(r); add(top); add(bot); add(mv); add(mh);
      break;
    }
    case 'chair': {
      const mat = stdMat(def.color, def.roughness);
      const seat = mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), mat); seat.position.y = 0.45;
      const back = mesh(new THREE.BoxGeometry(0.5, 0.55, 0.06), mat); back.position.set(0, 0.75, -0.22);
      add(seat); add(back);
      for (const [lx, lz] of [[-0.21, -0.21], [0.21, -0.21], [-0.21, 0.21], [0.21, 0.21]]) {
        const leg = mesh(new THREE.BoxGeometry(0.05, 0.45, 0.05), mat);
        leg.position.set(lx, 0.225, lz);
        add(leg);
      }
      break;
    }
    case 'chessboard': {
      const boardMat = stdMat(def.color, def.roughness);
      boardMat.map = makeCheckerTexture();
      const rimMat = stdMat('#6b5140', 0.8);
      const boardTop = mesh(new THREE.BoxGeometry(1.8, 0.062, 1.8), boardMat);
      boardTop.position.y = 0.05;
      const rim = mesh(new THREE.BoxGeometry(1.92, 0.05, 1.92), rimMat);
      rim.position.y = 0.025;
      add(boardTop); add(rim);
      break;
    }
    case 'chess_piece': {
      const mat = stdMat(def.color, def.roughness, def.metalness);
      group.add(buildChessPiece(variant ?? 'pawn', mat));
      materials.push(mat);
      break;
    }
  }

  group.traverse((o) => {
    o.userData.rootRef = group;
  });

  return { group, materials };
}

/** Turned-chess-piece silhouettes, one lathe profile per piece (radius, height in meters). */
export const CHESS_PIECES = ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'] as const;
export type ChessPiece = (typeof CHESS_PIECES)[number];

/** Colorways for the chess_piece `side` param (warm dark instead of pure black to fit the palette). */
export const CHESS_SIDES: Record<'white' | 'black', string> = { white: '#e8dcc8', black: '#3a332d' };

function lathe(pts: [number, number][], mat: THREE.MeshStandardMaterial): THREE.Mesh {
  const profile = pts.map(([x, y]) => new THREE.Vector2(x, y));
  return mesh(new THREE.LatheGeometry(profile, 28), mat);
}

function buildChessPiece(piece: string, mat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const put = (m: THREE.Mesh) => g.add(m);
  // Shared turned base so the set reads as one family.
  const base: [number, number][] = [[0.0, 0.0], [0.095, 0.0], [0.095, 0.02], [0.065, 0.05]];

  switch (piece) {
    case 'pawn': {
      put(lathe([...base, [0.05, 0.1], [0.038, 0.17], [0.03, 0.2], [0.065, 0.22], [0.065, 0.245], [0.03, 0.26]], mat));
      const head = mesh(new THREE.SphereGeometry(0.05, 20, 14), mat);
      head.position.y = 0.3;
      put(head);
      break;
    }
    case 'rook': {
      // Cup-shaped top suggests crenellations without extra geometry.
      put(lathe([...base, [0.052, 0.12], [0.05, 0.24], [0.085, 0.28], [0.085, 0.35], [0.052, 0.35], [0.052, 0.305], [0.0, 0.305]], mat));
      break;
    }
    case 'knight': {
      put(lathe([...base, [0.055, 0.1], [0.05, 0.15], [0.065, 0.18], [0.0, 0.2]], mat));
      // Stylized head: slanted capsule neck + snout box + ears.
      const neck = mesh(new THREE.CapsuleGeometry(0.035, 0.14, 6, 14), mat);
      neck.position.set(0.0, 0.24, 0.0);
      neck.rotation.z = 0.45;
      put(neck);
      const snout = mesh(new THREE.BoxGeometry(0.05, 0.05, 0.09), mat);
      snout.position.set(-0.045, 0.31, 0.0);
      snout.rotation.z = 0.5;
      put(snout);
      for (const ex of [-0.015, 0.02]) {
        const ear = mesh(new THREE.ConeGeometry(0.016, 0.05, 8), mat);
        ear.position.set(ex + 0.01, 0.38, 0.0);
        ear.rotation.z = -0.25;
        put(ear);
      }
      break;
    }
    case 'bishop': {
      put(lathe([...base, [0.048, 0.12], [0.04, 0.24], [0.055, 0.3], [0.028, 0.36]], mat));
      const mitre = mesh(new THREE.SphereGeometry(0.03, 16, 12), mat);
      mitre.position.y = 0.385;
      put(mitre);
      break;
    }
    case 'queen': {
      put(lathe([...base, [0.052, 0.14], [0.042, 0.28], [0.038, 0.34], [0.075, 0.37], [0.08, 0.395], [0.04, 0.4]], mat));
      for (const [cx, cz] of [[0.055, 0], [-0.055, 0], [0, 0.055], [0, -0.055], [0.04, 0.04], [-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04]]) {
        const pearl = mesh(new THREE.SphereGeometry(0.013, 10, 8), mat);
        pearl.position.set(cx, 0.415, cz);
        put(pearl);
      }
      break;
    }
    case 'king': {
      put(lathe([...base, [0.052, 0.14], [0.045, 0.3], [0.038, 0.36], [0.075, 0.39], [0.08, 0.415], [0.035, 0.42], [0.035, 0.44]], mat));
      const v = mesh(new THREE.BoxGeometry(0.022, 0.095, 0.022), mat);
      v.position.y = 0.49;
      put(v);
      const h = mesh(new THREE.BoxGeometry(0.065, 0.022, 0.022), mat);
      h.position.y = 0.495;
      put(h);
      break;
    }
    default:
      return buildChessPiece('pawn', mat);
  }
  return g;
}

/** 8x8 checkerboard in warm cream/walnut, drawn once to a canvas. */
function makeCheckerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const light = '#e8d7b8';
  const dark = '#7c6248';
  const sq = 64;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? light : dark;
      g.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
