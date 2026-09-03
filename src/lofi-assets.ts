import * as THREE from 'three';
import { material, random, lantern } from './art';
import { chimneySmoke, reflectingWater } from './lofi-effects';

function mesh(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
function box(g: THREE.Group, mat: THREE.Material, s: number[], p: number[]) {
  return mesh(g, new THREE.BoxGeometry(...s as [number, number, number]), mat, ...p as [number, number, number]);
}
function rod(g: THREE.Group, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const m = mesh(g, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
}

export function cabin(): THREE.Group {
  const g = new THREE.Group();
  const cedar = material('#af8055', 'wood', 0.65);
  const end = material('#574331', 'wood');
  const roof = material('#294340', undefined, 0.57); roof.metalness = 0.22;
  const seams = material('#49605a', undefined, 0.56);
  const window = new THREE.MeshPhysicalMaterial({ color: '#efd8a4', emissive: '#ffac56', emissiveIntensity: 0.32, roughness: 0.14, metalness: 0.12, transparent: true, opacity: 0.34, depthWrite: false });
  window.side = THREE.DoubleSide;
  for (let i = 0; i < 29; i++) box(g, cedar, [5.4, 0.11, 0.185], [0, 0.4, -1.8 + i * 0.195]);
  for (const x of [-2.4, 2.4]) for (const z of [-1.7, 1, 3.45]) box(g, end, [0.2, 0.4, 0.2], [x, 0.2, z]);
  for (let i = 0; i < 3; i++) box(g, cedar, [1.8, 0.1, 0.3], [0.7, 0.32 - i * 0.1, 3.95 + i * 0.27]);
  for (const side of [-1, 1]) {
    box(g, roof, [0.16, 4.96, 4.5], [side * 1.17, 2.6, 0]).rotation.z = side * 0.49;
    for (let i = 0; i < 23; i++) box(g, seams, [0.06, 5.05, 0.025], [side * 1.23, 2.63, -2.18 + i * 0.198]).rotation.z = side * 0.49;
  }
  const face = new THREE.Shape(); face.moveTo(-2.12, 0.5); face.lineTo(2.12, 0.5); face.lineTo(0, 4.48); face.closePath();
  mesh(g, new THREE.ShapeGeometry(face), window, 0, 0, 2.06).castShadow = false;
  const backWall = material('#af8055', 'wood', 0.65); backWall.side = THREE.DoubleSide;
  mesh(g, new THREE.ShapeGeometry(face), backWall, 0, 0, -2.08);
  for (const z of [-2.14, 2.15]) {
    rod(g, end, new THREE.Vector3(-2.2, 0.5, z), new THREE.Vector3(0, 4.65, z), 0.1);
    rod(g, end, new THREE.Vector3(2.2, 0.5, z), new THREE.Vector3(0, 4.65, z), 0.1);
    box(g, end, [0.095, 4.05, 0.12], [0, 2.5, z]);
    box(g, end, [3.05, 0.09, 0.12], [0, 1.6, z]);
    box(g, end, [1.65, 0.09, 0.12], [0, 2.9, z]);
  }
  // A furnished interior gives the glazing depth from every front camera angle.
  const linen = material('#d6be96', undefined, 0.95);
  const pillow = material('#668b80', undefined, 0.94);
  const books = material('#a77955');
  box(g, end, [1.35, 0.3, 2.5], [-0.95, 0.63, -0.45]);
  box(g, linen, [1.28, 0.22, 2.38], [-0.95, 0.88, -0.45]);
  box(g, pillow, [1.25, 0.05, 0.9], [-0.95, 1.02, 0.2]);
  box(g, linen, [0.8, 0.14, 0.45], [-0.95, 1.03, -1.28]);
  for (const y of [0.68, 1.2, 1.75]) box(g, cedar, [0.95, 0.06, 0.42], [0.72, y, -1.65]);
  for (let i = 0; i < 6; i++) box(g, i % 2 ? pillow : books, [0.09, 0.23 + (i % 3) * 0.045, 0.25], [0.39 + i * 0.12, 1.38, -1.62]);
  const interior = new THREE.PointLight('#ffbd6b', 17, 6, 2); interior.position.set(0.3, 1.65, 0.35); g.add(interior);
  const reading = lantern(); reading.scale.setScalar(0.55); reading.position.set(0.75, 0.47, 0.5); g.add(reading);
  const loft = new THREE.MeshStandardMaterial({ color: '#d3a46c', emissive: '#ffbd65', emissiveIntensity: 1.6 }); loft.side = THREE.DoubleSide;
  mesh(g, new THREE.CircleGeometry(0.42, 40), loft, 0, 2.45, -2.12);
  mesh(g, new THREE.TorusGeometry(0.46, 0.05, 8, 40), end, 0, 2.45, -2.14);
  box(g, end, [0.06, 0.87, 0.06], [0, 2.45, -2.2]);
  box(g, end, [0.87, 0.06, 0.06], [0, 2.45, -2.2]);

  // Door, reading bench, small table, coffee cup and a planter on the veranda.
  box(g, end, [0.72, 1.65, 0.07], [0.62, 1.33, 2.16]);
  box(g, window, [0.53, 1.3, 0.075], [0.62, 1.45, 2.2]);
  box(g, cedar, [1.65, 0.12, 0.55], [-1.27, 0.87, 2.75]);
  box(g, cedar, [1.65, 0.7, 0.1], [-1.27, 1.17, 2.49]);
  for (const x of [-1.9, -0.65]) box(g, end, [0.12, 0.45, 0.45], [x, 0.65, 2.75]);
  box(g, cedar, [0.55, 0.07, 0.55], [1.8, 0.98, 2.9]);
  box(g, end, [0.13, 0.58, 0.13], [1.8, 0.68, 2.9]);
  const ceramic = material('#e6cfb2');
  mesh(g, new THREE.CylinderGeometry(0.09, 0.07, 0.14, 16), ceramic, 1.8, 1.09, 2.9);
  const lamp = lantern(); lamp.scale.setScalar(0.7); lamp.position.set(-2.1, 0.46, 3.3); g.add(lamp);
  const lamp2 = lantern(); lamp2.scale.setScalar(0.65); lamp2.position.set(2.1, 0.46, 3.3); g.add(lamp2);
  const warm = new THREE.PointLight('#ffc477', 8, 8, 2); warm.position.set(0, 1.8, 2.55); g.add(warm);
  // One quiet strand over the veranda gives the human-placed cabin a warm focal point.
  const wire = material('#4c4b37', undefined, 0.82);
  const bulb = new THREE.MeshStandardMaterial({ color: '#ffe6af', emissive: '#ffc477', emissiveIntensity: 4.5, roughness: 0.3 });
  for (const x of [-2.4, 2.4]) box(g, end, [0.07, 1.85, 0.07], [x, 1.38, 3.38]);
  const strandPoint = (t: number) => new THREE.Vector3(-2.4 + t * 4.8, 2.3 - Math.sin(t * Math.PI) * 0.35, 3.38);
  for (let i = 0; i < 16; i++) rod(g, wire, strandPoint(i / 16), strandPoint((i + 1) / 16), 0.009);
  for (let i = 0; i < 13; i++) {
    const point = strandPoint((i + 0.5) / 13);
    const light = mesh(g, new THREE.SphereGeometry(0.038, 8, 6), bulb, point.x, point.y - 0.06, point.z);
    light.castShadow = false;
  }
  const chimney = material('#45504a', 'stone');
  box(g, chimney, [0.55, 2.2, 0.6], [-0.8, 3.65, -0.9]);
  box(g, roof, [0.72, 0.1, 0.77], [-0.8, 4.8, -0.9]);
  const smoke = chimneySmoke();
  g.add(smoke.points); g.userData.tick = smoke.tick;
  return g;
}

export function pond(seed: number): THREE.Group {
  const g = new THREE.Group(), r = random(seed + 438);
  const bed = material('#6d7e6b', 'stone');
  const base = mesh(g, new THREE.CylinderGeometry(3.2, 3.35, 0.24, 64), bed, 0, 0.1, 0); base.scale.z = 0.7;
  const water = reflectingWater();
  g.add(water.surface);
  for (let i = 0; i < 42; i++) {
    const a = i / 42 * Math.PI * 2;
    const m = mesh(g, new THREE.IcosahedronGeometry(0.18 + r() * 0.16, 1), bed, Math.cos(a) * 3.2, 0.18, Math.sin(a) * 2.25);
    m.scale.set(1.2, 0.65, 0.9); m.rotation.set(r(), r(), r());
  }
  const leaf = material('#69835d'); leaf.side = THREE.DoubleSide;
  for (let i = 0; i < 8; i++) {
    const a = r() * Math.PI * 2, radius = 1.6 + r() * 0.8;
    const pad = mesh(g, new THREE.CircleGeometry(0.13 + r() * 0.09, 20, 0.12, 5.98), leaf, Math.cos(a) * radius, 0.27, Math.sin(a) * radius * 0.7);
    pad.rotation.x = -Math.PI / 2;
  }
  const petal = material('#f0c5b6', undefined, 0.78);
  const center = new THREE.MeshStandardMaterial({ color: '#edbf70', emissive: '#d69439', emissiveIntensity: 0.08, roughness: 0.85 });
  for (const [x, z] of [[-1.85, 0.65], [1.6, -0.6]]) {
    for (let i = 0; i < 7; i++) {
      const angle = i / 7 * Math.PI * 2;
      const flower = mesh(g, new THREE.SphereGeometry(0.075, 8, 5), petal, x + Math.cos(angle) * 0.065, 0.3, z + Math.sin(angle) * 0.065);
      flower.scale.set(1, 0.28, 0.52); flower.rotation.y = -angle;
    }
    mesh(g, new THREE.SphereGeometry(0.035, 8, 5), center, x, 0.31, z);
  }
  g.userData.tick = water.tick;
  return g;
}
