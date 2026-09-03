import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { material, random, surfaceTexture } from "./art";

/** A bounded, layered landscape. Expands for old shared scenes and larger builds. */
export class Diorama {
  readonly group = new THREE.Group();
  readonly ground: THREE.Mesh;
  radius = 11;
  private grass: THREE.InstancedMesh;
  private grassMatrices: Float32Array;

  constructor() {
    const r = random(4801);
    const top = new THREE.CircleGeometry(11, 96);
    top.rotateX(-Math.PI / 2);
    const topMat = material("#718263", "earth", 0.98);
    const map = surfaceTexture("earth").clone();
    // This hand-painted wash is not tileable. A single clamped copy avoids
    // wrap seams through the middle of the meadow, amplified by its bump map.
    map.repeat.set(1, 1);
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
    topMat.map = topMat.bumpMap = map;
    this.ground = new THREE.Mesh(top, topMat);
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    // Six irregular strata give the island a tactile cutaway silhouette.
    for (let layer = 0; layer < 6; layer++) {
      const radius = 10.98 - Math.max(0, layer - 1) * 0.16;
      const geo = new THREE.CylinderGeometry(
        radius,
        radius - 0.06,
        0.34,
        96,
        2,
      );
      const p = geo.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          z = p.getZ(i),
          a = Math.atan2(z, x);
        const f =
          1 + 0.015 * Math.sin(a * 13 + layer * 0.7) + 0.008 * Math.cos(a * 31);
        p.setXYZ(i, x * f, p.getY(i) + 0.05 * Math.sin(a * 18 + layer), z * f);
      }
      geo.computeVertexNormals();
      const slab = new THREE.Mesh(
        geo,
        material(
          ["#586360", "#434e4e", "#65706b", "#3d494c", "#56605b", "#354248"][
            layer
          ],
          "stone",
        ),
      );
      // The uneven cap rises by up to 5 cm. Keep all of it below the separate
      // y=0 meadow disk, or its triangle fan cuts visible radial wedges into it.
      slab.position.y = -0.25 - layer * 0.31;
      // Below-ground caps must not cast onto the meadow: shadow normal bias
      // can lift their uneven triangle fans above its surface.
      slab.castShadow = false;
      slab.receiveShadow = true;
      this.group.add(slab);
    }

    const pebble = new THREE.IcosahedronGeometry(1, 1);
    const pebbles = new THREE.InstancedMesh(
      pebble,
      material("#788575", "stone"),
      380,
    );
    pebbles.castShadow = pebbles.receiveShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 380; i++) {
      const a = r() * Math.PI * 2,
        radius = i < 170 ? 10.55 + r() * 0.3 : Math.sqrt(r()) * 10.2;
      dummy.position.set(Math.cos(a) * radius, -0.06, Math.sin(a) * radius);
      dummy.rotation.set(r(), r() * 6, r());
      const s = i < 170 ? 0.16 + r() * 0.3 : 0.025 + r() * 0.055;
      dummy.scale.set(s, s * 0.65, s * 0.85);
      dummy.updateMatrix();
      pebbles.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(pebbles);

    const blades: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.PlaneGeometry(0.025, 0.14 + i * 0.025, 1, 3);
      blade.translate(((i % 2) - 0.5) * 0.025, 0.075, 0);
      const p = blade.getAttribute("position");
      for (let j = 0; j < p.count; j++) {
        const t = Math.min(1, Math.max(0, p.getY(j)) / 0.2);
        p.setX(j, p.getX(j) * (1 - t * 0.75) + t * t * 0.035);
      }
      blade.rotateY(i * 2.3);
      blades.push(blade);
    }
    const grassGeo = mergeGeometries(blades)!;
    blades.forEach((b) => b.dispose());
    const grassMat = material("#a3b68a");
    grassMat.side = THREE.DoubleSide;
    const grass = new THREE.InstancedMesh(grassGeo, grassMat, 6500);
    grass.receiveShadow = true;
    const color = new THREE.Color();
    for (let i = 0; i < 6500; i++) {
      const a = r() * Math.PI * 2,
        radius = Math.sqrt(r()) * 10.75;
      const x = Math.cos(a) * radius,
        z = Math.sin(a) * radius;
      const clear =
        (Math.abs(x - 1.2) < 2.7 && Math.abs(z + 1.2) < 2.2) ||
        (z > 0 && Math.abs(x - Math.sin(z * 0.45)) < 0.8);
      dummy.position.set(x, 0.015, z);
      dummy.rotation.set(0, r() * 6.28, 0);
      dummy.scale.setScalar(clear ? 0.12 : 0.35 + r() * 0.75);
      dummy.updateMatrix();
      grass.setMatrixAt(i, dummy.matrix);
      color.setHSL(0.27 + r() * 0.06, 0.24 + r() * 0.09, 0.38 + r() * 0.1, THREE.SRGBColorSpace);
      grass.setColorAt(i, color);
    }
    this.group.add(grass);
    this.grass = grass;
    this.grassMatrices = new Float32Array(grass.instanceMatrix.array);
    this.group.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  }

  /** Keep vegetation out of real pond footprints, including moved/imported ponds. */
  clearWater(ponds: THREE.Group[]): void {
    this.group.updateMatrixWorld(true);
    const inverses = ponds.map(pond => { pond.updateMatrixWorld(true); return pond.matrixWorld.clone().invert(); });
    const matrix = new THREE.Matrix4(), local = new THREE.Vector3(), world = new THREE.Vector3();
    for (let i = 0; i < this.grass.count; i++) {
      matrix.fromArray(this.grassMatrices, i * 16);
      world.setFromMatrixPosition(matrix).applyMatrix4(this.group.matrixWorld);
      if (inverses.some(inverse => {
        local.copy(world).applyMatrix4(inverse);
        return (local.x / 3.4) ** 2 + (local.z / 2.45) ** 2 < 1;
      })) matrix.scale(new THREE.Vector3(0, 0, 0));
      this.grass.setMatrixAt(i, matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
  }

  fit(extent: number): void {
    const radius = Math.max(11, Math.min(83, extent + 1));
    if (Math.abs(radius - this.radius) < 0.1) return;
    this.radius = radius;
    this.group.scale.set(radius / 11, 1, radius / 11);
    this.group.updateMatrix();
  }
}
