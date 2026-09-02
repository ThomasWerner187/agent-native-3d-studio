import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Retains every triangle and each material/shadow boundary, but batches its draws. */
export function batchStaticMeshes(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; cast: boolean; receive: boolean; geos: THREE.BufferGeometry[] }>();
  const sources: THREE.Mesh[] = [];
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || Array.isArray(o.material) || o.userData.dynamic) return;
    const transformed = o.geometry.clone().applyMatrix4(inverse.clone().multiply(o.matrixWorld));
    const geo = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geo !== transformed) transformed.dispose();
    const key = `${o.material.uuid}:${o.castShadow}:${o.receiveShadow}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = { material: o.material, cast: o.castShadow, receive: o.receiveShadow, geos: [] }; buckets.set(key, bucket); }
    bucket.geos.push(geo); sources.push(o);
  });
  for (const source of sources) { source.removeFromParent(); source.geometry.dispose(); }
  for (const bucket of buckets.values()) {
    const geometry = mergeGeometries(bucket.geos); bucket.geos.forEach(g => g.dispose());
    if (!geometry) throw new Error('Incompatible static geometry.');
    const mesh = new THREE.Mesh(geometry, bucket.material);
    mesh.castShadow = bucket.cast; mesh.receiveShadow = bucket.receive;
    root.add(mesh);
  }
  // Local transforms of asset parts never change. The editable root still updates normally.
  root.traverse(o => { if (o !== root && !o.userData.dynamic) { o.updateMatrix(); o.matrixAutoUpdate = false; } });
}
