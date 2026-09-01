import * as THREE from 'three';

/**
 * Object factory for primitives + furniture presets.
 * Every object is a THREE.Group whose origin sits on the ground (y = 0),
 * so positioning objects "on the floor" is just position.y = 0.
 */

export const OBJECT_TYPES = [
  'box', 'sphere', 'cylinder', 'plane',
  'tree', 'rock', 'lamp', 'window', 'chair', 'table',
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

export function buildObject(type: ObjectType): BuiltObject {
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
    case 'tree': {
      const trunk = stdMat('#8a6a4f', 0.9);
      const foliage = stdMat(def.color, def.roughness);
      const t = mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.7, 10), trunk);
      t.position.y = 0.35;
      const c1 = mesh(new THREE.ConeGeometry(0.58, 1.15, 10), foliage);
      c1.position.y = 1.12;
      const c2 = mesh(new THREE.ConeGeometry(0.42, 0.95, 10), foliage);
      c2.position.y = 1.72;
      add(t); add(c1); add(c2);
      break;
    }
    case 'rock': {
      const m = stdMat(def.color, def.roughness);
      const r = mesh(new THREE.IcosahedronGeometry(0.5, 0), m);
      r.position.y = 0.3;
      r.scale.set(1, 0.72, 0.9);
      r.rotation.y = Math.PI / 5;
      add(r);
      break;
    }
    case 'lamp': {
      const poleMat = stdMat('#4f4a45', 0.7, 0.3);
      const headMat = stdMat(def.color, def.roughness);
      headMat.emissive = new THREE.Color('#ffb45e');
      headMat.emissiveIntensity = 0.85;
      const base = mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.08, 16), poleMat);
      base.position.y = 0.04;
      const pole = mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.6, 10), poleMat);
      pole.position.y = 0.85;
      const head = mesh(new THREE.SphereGeometry(0.22, 20, 14), headMat, false);
      head.position.y = 1.72;
      add(base); add(pole); add(head);
      const light = new THREE.PointLight(0xffb45e, 6, 9, 2);
      light.position.y = 1.72;
      group.add(light);
      group.userData.light = light;
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
    case 'table': {
      const mat = stdMat(def.color, def.roughness);
      const top = mesh(new THREE.BoxGeometry(0.95, 0.06, 0.65), mat); top.position.y = 0.72;
      add(top);
      for (const [lx, lz] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) {
        const leg = mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), mat);
        leg.position.set(lx, 0.36, lz);
        add(leg);
      }
      break;
    }
  }

  group.traverse((o) => {
    o.userData.rootRef = group;
  });

  return { group, materials };
}
