import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Authored procedural assets: no external models, textures or network dependency.
export function random(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const textures = new Map<string, THREE.CanvasTexture>();
export function surfaceTexture(
  kind: "wood" | "stone" | "earth",
): THREE.CanvasTexture {
  const cached = textures.get(kind);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const r = random(kind === "wood" ? 18 : kind === "stone" ? 41 : 27);
  g.fillStyle = kind === "wood" ? "#b2a18d" : kind === "earth" ? "#cad0b9" : "#929998";
  g.fillRect(0, 0, 512, 512);
  if (kind === "wood") {
    for (let i = 0; i < 1400; i++) {
      const x = r() * 512;
      g.strokeStyle = `rgba(${r() > 0.4 ? "39,27,18" : "231,218,179"},${0.04 + r() * 0.15})`;
      g.lineWidth = 0.3 + r() * 1.7;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + r() * 20, 180, x - r() * 20, 380, x, 512);
      g.stroke();
    }
  } else if (kind === "earth") {
    // Broad mossy washes read as a soft clearing, not a tiled gravel texture.
    for (let i = 0; i < 110; i++) {
      const x = r() * 512, y = r() * 512, radius = 35 + r() * 125;
      const wash = g.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 3 ? "rgba(63,91,53,.075)" : "rgba(240,221,163,.12)");
      wash.addColorStop(1, "transparent");
      g.fillStyle = wash;
      g.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 6000; i++) {
      g.fillStyle = r() > 0.5 ? "rgba(38,62,34,.018)" : "rgba(249,244,207,.025)";
      g.fillRect(r() * 512, r() * 512, 1, 1);
    }
  } else {
    for (let i = 0; i < 16000; i++) {
      const v = Math.floor(40 + r() * 185);
      g.fillStyle = `rgba(${v},${v},${v},${0.05 + r() * 0.25})`;
      g.fillRect(r() * 512, r() * 512, 1 + r() * 7, 1 + r() * 5);
    }
    for (let i = 0; i < 80; i++) {
      const x = r() * 512,
        y = r() * 512,
        s = 12 + r() * 40;
      const gradient = g.createRadialGradient(x, y, 0, x, y, s);
      gradient.addColorStop(
        0,
        "rgba(32,39,43,.16)",
      );
      gradient.addColorStop(1, "transparent");
      g.fillStyle = gradient;
      g.fillRect(x - s, y - s, s * 2, s * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  textures.set(kind, tex);
  return tex;
}

export function material(
  color: string,
  kind?: "wood" | "stone" | "earth",
  roughness = 0.85,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color, roughness });
  if (kind) {
    mat.map = surfaceTexture(kind);
    mat.bumpMap = mat.map;
    mat.bumpScale = kind === "wood" ? 0.025 : kind === "earth" ? 0.018 : 0.07;
  }
  return mat;
}

function put(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function beam(
  group: THREE.Group,
  mat: THREE.Material,
  size: number[],
  pos: number[],
  radius = 0.025,
): THREE.Mesh {
  return put(
    group,
    new RoundedBoxGeometry(size[0], size[1], size[2], 2, radius),
    mat,
    pos[0],
    pos[1],
    pos[2],
  );
}

/** Dense, layered boughs: a legible evergreen silhouette even in a forty-tree forest. */
export function pine(seed: number): THREE.Group {
  const g = new THREE.Group(), r = random(123 + seed * 773);
  const h = 3.5 + r() * 1.6;
  const width = 1.0 + r() * 0.35;
  const foliage = material("#aac7ac", undefined, 0.96);
  foliage.vertexColors = true;
  const bark = material("#67513b", "wood");
  put(g, new THREE.CylinderGeometry(0.035, 0.14, h, 8), bark, 0, h / 2, 0);
  const boughs: THREE.BufferGeometry[] = [];
  const tierCount = 8;
  const hue = 0.405 + r() * 0.035;
  for (let tier = 0; tier < tierCount; tier++) {
    const f = tier / (tierCount - 1);
    const y = 0.68 + f * (h - 1.04);
    const radius = Math.pow(1 - f * 0.91, 0.88) * width;
    const rise = 0.82 - f * 0.26;
    const sections = 18;
    const positions: number[] = [], colors: number[] = [];
    const tips: THREE.Vector3[] = [], shoulders: THREE.Vector3[] = [];
    const shift = tier * 2.399 + r() * 0.4;
    // Alternating long and short branch tips avoid a stack of geometric cones.
    for (let j = 0; j < sections; j++) {
      const angle = j / sections * Math.PI * 2 + shift;
      const reach = radius * (j % 2 ? 0.77 + r() * 0.1 : 0.94 + r() * 0.12);
      tips.push(new THREE.Vector3(Math.cos(angle) * reach, y - 0.07 - r() * 0.1, Math.sin(angle) * reach));
      shoulders.push(new THREE.Vector3(Math.cos(angle) * reach * 0.48, y + rise * (0.32 + r() * 0.14), Math.sin(angle) * reach * 0.48));
    }
    const peak = new THREE.Vector3(0, y + rise, 0);
    const underside = new THREE.Vector3(0, y - 0.17, 0);
    const color = new THREE.Color();
    const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, light: number) => {
      // Art colors are chosen in display space. Linear HSL here turns a dark
      // green swatch into pale mint after lighting, ACES and the output pass.
      color.setHSL(hue + (r() - 0.5) * 0.025, 0.39 + r() * 0.11, light, THREE.SRGBColorSpace);
      for (const v of [a, b, c]) {
        positions.push(v.x, v.y, v.z);
        colors.push(color.r, color.g, color.b);
      }
    };
    for (let j = 0; j < sections; j++) {
      const k = (j + 1) % sections;
      const light = 0.255 + f * 0.075 + r() * 0.03;
      face(peak, shoulders[k], shoulders[j], light + 0.035);
      face(shoulders[j], shoulders[k], tips[j], light);
      face(shoulders[k], tips[k], tips[j], light);
      face(tips[j], tips[k], underside, light - 0.045);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    boughs.push(geo);
  }
  const crown = mergeGeometries(boughs)!;
  boughs.forEach(bough => bough.dispose());
  put(g, crown, foliage);
  return g;
}

export function stone(seed: number): THREE.Group {
  const g = new THREE.Group(),
    r = random(seed * 139 + 4);
  const geo = new THREE.IcosahedronGeometry(0.6, 2);
  const p = geo.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const f = 1 + 0.15 * Math.sin(x * 8 + z * 5 + seed) * Math.cos(y * 7);
    p.setXYZ(i, x * f, Math.max(-0.28, y * 0.65 * f), z * f * 0.85);
  }
  geo.computeVertexNormals();
  const mat = material(
    new THREE.Color("#859591").offsetHSL(0, 0, (r() - 0.5) * 0.2).getStyle(),
    "stone",
  );
  put(g, geo, mat, 0, 0.28, 0);
  return g;
}

export function lantern(): THREE.Group {
  const g = new THREE.Group(),
    metal = material("#25312e", undefined, 0.38);
  metal.metalness = 0.7;
  const glow = new THREE.MeshStandardMaterial({
    color: "#ffd89b",
    emissive: "#ffba59",
    emissiveIntensity: 5,
    roughness: 0.3,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#f1dbb4",
    transparent: true,
    opacity: 0.15,
    roughness: 0.12,
    metalness: 0.1,
    depthWrite: false,
  });
  beam(g, metal, [0.3, 0.065, 0.3], [0, 0.04, 0]);
  beam(g, metal, [0.32, 0.065, 0.32], [0, 0.5, 0]);
  put(g, new THREE.ConeGeometry(0.25, 0.14, 4), metal, 0, 0.6, 0).rotation.y =
    Math.PI / 4;
  put(g, new THREE.CylinderGeometry(0.085, 0.1, 0.29, 12), glow, 0, 0.24, 0);
  const pane = put(
    g,
    new THREE.BoxGeometry(0.24, 0.4, 0.24),
    glass,
    0,
    0.29,
    0,
  );
  pane.castShadow = false;
  for (const x of [-0.125, 0.125])
    for (const z of [-0.125, 0.125])
      beam(g, metal, [0.025, 0.45, 0.025], [x, 0.27, z], 0.007);
  const light = new THREE.PointLight("#ffb65e", 8.75, 5.5, 2);
  light.position.y = 0.35;
  g.add(light);
  g.userData.light = light;
  g.userData.emissiveMaterial = glow;
  g.userData.lightBaseIntensity = 8.75;
  g.userData.emissiveBaseIntensity = 5;
  return g;
}

export function picnic(): THREE.Group {
  const g = new THREE.Group(),
    wood = material("#bfa17d", "wood", 0.65),
    edge = material("#806a53", "wood");
  for (let i = 0; i < 5; i++)
    beam(g, wood, [1.8, 0.075, 0.16], [0, 0.88, (i - 2) * 0.17]);
  for (const x of [-0.6, 0.6]) {
    for (const s of [-1, 1])
      beam(g, edge, [0.1, 0.84, 0.1], [x, 0.43, s * 0.24]).rotation.x =
        s * 0.28;
    beam(g, edge, [0.13, 0.1, 1.7], [x, 0.4, 0]);
  }
  for (const s of [-1, 1])
    for (let i = 0; i < 2; i++)
      beam(
        g,
        wood,
        [1.95, 0.075, 0.13],
        [0, 0.46, s * 0.68 + (i - 0.5) * 0.14],
      );
  return g;
}

export function camp(): THREE.Group {
  const g = new THREE.Group(),
    wood = material("#998669", "wood", 0.75),
    frame = material("#6c5945", "wood");
  for (let i = 0; i < 17; i++)
    beam(g, wood, [4.4, 0.1, 0.19], [0, 0.32, (i - 8) * 0.2]);
  for (const x of [-2, 2]) beam(g, frame, [0.14, 0.3, 3.5], [x, 0.15, 0]);
  for (let i = 0; i < 3; i++)
    beam(g, wood, [1.65, 0.1, 0.28], [0, 0.25 - i * 0.09, 1.8 + i * 0.23]);
  for (const x of [-2.1, 0, 2.1])
    beam(g, frame, [0.12, 0.95, 0.12], [x, 0.82, -1.55]);
  for (const y of [0.85, 1.18]) beam(g, wood, [4.3, 0.09, 0.09], [0, y, -1.55]);
  for (const x of [-2.1, 2.1]) {
    beam(g, frame, [0.12, 0.95, 0.12], [x, 0.82, 1.5]);
    for (const y of [0.85, 1.18]) beam(g, wood, [0.09, 0.09, 3.1], [x, y, 0]);
    const light = lantern();
    light.position.set(x, 1.32, -1.55);
    light.scale.setScalar(0.7);
    g.add(light);
  }
  const table = picnic();
  table.position.y = 0.38;
  g.add(table);
  const light = lantern();
  light.scale.setScalar(0.5);
  light.position.set(0.55, 1.3, 0);
  g.add(light);
  return g;
}

export function asset(type: string, seed = 0): THREE.Group | null {
  switch (type) {
    case "tree":
      return pine(seed);
    case "rock":
      return stone(seed);
    case "lamp":
      return lantern();
    case "table":
      return picnic();
    case "camp":
      return camp();
    default:
      return null;
  }
}
