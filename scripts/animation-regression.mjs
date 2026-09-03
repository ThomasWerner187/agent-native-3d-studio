import assert from 'node:assert/strict';
import * as THREE from 'three';
import { awaitGroup, cancelGroup, despawn, getCanonicalScale, settleSpawn, spawnPop, tween, updateTweens } from '../src/anim.ts';

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

// A human grabbing a delayed reveal receives the full object, and owns its
// later scale. No remaining animation may overwrite that human edit.
const appearing = new THREE.Group();
appearing.scale.set(1.2, 2, 0.8);
spawnPop(appearing, 2000, 1000);
const reveal = awaitGroup(`spawn:${appearing.uuid}`);
assert.deepEqual(getCanonicalScale(appearing).toArray(), [1.2, 2, 0.8]);
assert(appearing.scale.x < 0.01);
settleSpawn(appearing);
assert.equal((await reveal).completed, false);
assert.deepEqual(appearing.scale.toArray(), [1.2, 2, 0.8]);
appearing.scale.setScalar(1.7);
updateTweens(performance.now() + 5000);
assert.deepEqual(appearing.scale.toArray(), [1.7, 1.7, 1.7], 'A completed handoff must not overwrite the human scale');
console.log(' ✓ animation cancellation, cleanup, reveal handoff and zero-duration effects');
