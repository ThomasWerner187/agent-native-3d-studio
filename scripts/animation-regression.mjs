import assert from 'node:assert/strict';
import * as THREE from 'three';
import { awaitGroup, cancelGroup, despawn, tween, updateTweens } from '../src/anim.ts';

// A removed editable root no longer participates in SceneStore.syncMatrices.
// Its exit animation must update its own matrix and always finish cleanup.
const object = new THREE.Group();
object.matrixAutoUpdate = false;
object.scale.setScalar(2);
object.updateMatrix();
let disposed = 0;
despawn(object, () => disposed++, 1000);
const group = `spawn:${object.uuid}`;
const settled = awaitGroup(group);
updateTweens(performance.now() + 500);
assert(object.matrix.elements[0] < 2, 'Removed objects must visibly shrink');
cancelGroup(group);
assert.equal((await settled).completed, false);
assert.equal(disposed, 1, 'Cancelled deletion must still dispose the object');
cancelGroup(group);
updateTweens(performance.now() + 2000);
assert.equal(disposed, 1, 'Deletion cleanup must only run once');

// Immediate effects are used by reduced motion and exact snapshot restoration.
let position = NaN;
tween({ dur: 0, group: 'instant-regression', update: k => { position = k; } });
assert.equal(position, 1, 'Zero-duration effects must settle without a NaN frame');
assert.equal((await awaitGroup('instant-regression')).completed, true);
console.log(' ✓ animation cancellation, cleanup and zero-duration effects');
