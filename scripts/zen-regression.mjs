import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Exercise real geometry, store, native dispatch, planning and addition history.
// Only canvas drawing is inert: no browser or GPU is needed for geometry bounds.
const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'scratch-zen-regression-'));
const previousDocument = globalThis.document;
try {
  const output = join(scratch, 'scatter.mjs');
  await build({ stdin: { contents: `
    export { CameraDirector } from './src/camera-director.ts';
    export { SceneStore } from './src/store.ts';
    export { dispatchTool } from './src/webmcp.ts';
    export { fullSizeBounds, semanticClearances } from './src/tools.ts';
    export { scatterHistory } from './src/scatter-history.ts';
    export { updateTweens, cancelAllToolTweens } from './src/anim.ts';
    export { disposeObject } from './src/factory.ts';
    export * as THREE from 'three';
  `, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', outfile: output });
  const drawing = { fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, bezierCurveTo() {}, stroke() {},
    createRadialGradient() { return { addColorStop() {} }; } };
  globalThis.document = { createElement: () => ({ getContext: () => drawing }) };
  const { CameraDirector, SceneStore, dispatchTool, fullSizeBounds, semanticClearances, scatterHistory, updateTweens, cancelAllToolTweens, disposeObject, THREE } = await import(pathToFileURL(output).href);

  function harness() {
    const store = new SceneStore(), captures = [], scene = new THREE.Scene();
    const ctx = { store, studio: { scene, noteActivity() {} },
      snapshots: { capture(label) { const id = `${captures.length}:${label}`; captures.push(id); return id; },
        discard(id) { const i = captures.indexOf(id); if (i >= 0) captures.splice(i, 1); } },
      lofi: { building: false }, layout: { busy: false }, select: id => { store.selectedId = id; } };
    return { store, captures, ctx, dispose() { cancelAllToolTweens(); for (const entry of store.all()) disposeObject(entry.group); scene.clear(); store.clear(); } };
  }
  async function call(h, tool, args, actor = 'agent', during) {
    let result, error, done = false;
    const pending = dispatchTool(h.ctx, tool, args, () => {}, actor).then(raw => { result = JSON.parse(raw); done = true; }, e => { error = e; done = true; });
    during?.();
    for (let i = 0; i < 30 && !done; i++) { updateTweens(performance.now() + 100_000 + i * 100_000); await Promise.resolve(); }
    assert(done, `${tool} did not settle`);
    await pending;
    if (error) throw error;
    return result;
  }
  const pose = entry => [entry.group.position.toArray(), entry.group.quaternion.toArray(), entry.group.scale.toArray()];
  const separated = (a, b, gap) => a.max.x + gap <= b.min.x + 1e-7 || b.max.x + gap <= a.min.x + 1e-7
    || a.max.z + gap <= b.min.z + 1e-7 || b.max.z + gap <= a.min.z + 1e-7;


  for (const fixture of [
    { cabin: [3, -3], pond: [-5, 6], rotation: 0 },
    { cabin: [11, -6], pond: [15, 7], rotation: 25 },
  ]) {
    const h = harness();
    const cabin = await call(h, 'add_object', { type: 'cabin', position: { x: fixture.cabin[0], z: fixture.cabin[1] }, rotation_y: fixture.rotation }, 'human');
    const pond = await call(h, 'add_object', { type: 'pond', position: { x: fixture.pond[0], z: fixture.pond[1] } }, 'human');
    assert(cabin.ok && pond.ok);
    const anchors = [h.store.get(cabin.result.id), h.store.get(pond.result.id)], anchorPoses = anchors.map(pose);
    const grove = await call(h, 'add_grove', { cabin: cabin.result.id, pond: pond.result.id, count: 40, lights: 8, seed: 42, expected_scene_version: h.store.version });
    assert(grove.ok, JSON.stringify(grove));
    assert.equal(grove.result.ids.length, 40); assert.equal(grove.result.light_ids.length, 8);
    assert.equal(grove.result.live_lights_added, 8);
    assert.equal(grove.result.rear_count, 32); assert.equal(grove.result.exact_count, true);
    assert.deepEqual(anchors.map(pose), anchorPoses);
    assert(grove.result.ids.every(id => h.store.get(id).createdBy === 'agent'));
    const rearTrees = grove.result.ids.slice(0, 32).map(id => h.store.get(id));
    const sideTrees = grove.result.ids.slice(32).map(id => h.store.get(id));
    assert(rearTrees.every(entry => entry.group.scale.x >= 1.05 && entry.group.scale.x <= 1.35));
    assert(sideTrees.every(entry => entry.group.scale.x >= 0.8 && entry.group.scale.x <= 1.0));
    const rotation = fixture.rotation * Math.PI / 180;
    const depth = entry => Math.sin(rotation) * (entry.group.position.x - fixture.cabin[0])
      + Math.cos(rotation) * (entry.group.position.z - fixture.cabin[1]);
    const byDepth = [...rearTrees].sort((a, b) => depth(a) - depth(b));
    const averageScale = entries => entries.reduce((sum, entry) => sum + entry.group.scale.x, 0) / entries.length;
    assert(averageScale(byDepth.slice(0, 16)) > averageScale(byDepth.slice(16)), 'Deeper forest layers should be taller than the front layer');

    const fixed = anchors.map(entry => fullSizeBounds(entry.group));
    for (const id of grove.result.ids) for (const bounds of fixed) assert(separated(fullSizeBounds(h.store.get(id).group), bounds, 0.3));
    const beforePath = h.store.all().map(entry => [entry.id, pose(entry)]);
    const path = await call(h, 'add_path', { cabin: cabin.result.id, pond: pond.result.id, expected_scene_version: h.store.version });
    assert(path.ok, JSON.stringify(path)); assert(path.result.ids.length >= 3);
    assert.deepEqual(h.store.all().slice(0, beforePath.length).map(entry => [entry.id, pose(entry)]), beforePath);
    const stones = path.result.ids.map(id => h.store.get(id));
    assert(stones.every(entry => entry.layoutRole === 'path' && entry.group.scale.y < entry.group.scale.x * 0.4));
    const version = h.store.version;
    const stale = await call(h, 'add_grove', { cabin: cabin.result.id, pond: pond.result.id, expected_scene_version: version - 1 });
    assert.equal(stale.code, 'stale_scene'); assert.equal(h.store.version, version);
    await call(h, 'transform_object', { targets: stones[0].id, op: 'move', x: stones[0].group.position.x + 0.25 }, 'human');
    await call(h, 'transform_object', { targets: stones[1].id, op: 'move', z: stones[1].group.position.z + 0.25 }, 'human');
    const kept = stones.slice(0, 2).map(pose);
    const undo = await call(h, 'undo_scatter', { undo_id: path.result.undo_id });
    assert(undo.ok); assert.equal(undo.result.skipped_ids.length, 2); assert.deepEqual(stones.slice(0, 2).map(pose), kept);
    console.log(` ✓ zen forest40 + lanterns8, live curved path${stones.length}, human edits preserved, rotation${fixture.rotation}`);
    h.dispose();
  }
  const interrupted = harness();
  const interruptedCabin = await call(interrupted, 'add_object', { type: 'cabin', position: { x: 3, z: -3 } }, 'human');
  const interruptedPond = await call(interrupted, 'add_object', { type: 'pond', position: { x: -5, z: 6 } }, 'human');
  let removedLantern;
  const partialGrove = await call(interrupted, 'add_grove', {
    cabin: interruptedCabin.result.id, pond: interruptedPond.result.id, count: 40, lights: 8, reveal_seconds: 6,
  }, 'agent', () => {
    // A real human deletion changes provenance while the tool's reveal is awaiting completion.
    removedLantern = interrupted.store.all().find(entry => entry.type === 'lamp');
    assert(removedLantern, 'The lantern must exist before the human deletes it during reveal');
    interrupted.store.remove(removedLantern.id, 'human');
    interrupted.ctx.studio.scene.remove(removedLantern.group);
  });
  assert(partialGrove.ok); assert.equal(partialGrove.applied, false);
  assert.equal(partialGrove.result.live_added, 40);
  assert.equal(partialGrove.result.lights_added, 8, 'Attempted additions retain the existing tool convention');
  assert.equal(partialGrove.result.light_ids.length, 8);
  assert(partialGrove.result.light_ids.includes(removedLantern.id));
  assert.equal(partialGrove.result.live_lights_added, 7);
  assert.equal(partialGrove.result.exact_count, false, 'Exact success includes requested lanterns, not only trees');
  assert.equal(interrupted.store.all().filter(entry => entry.type === 'lamp').length, 7);
  assert.equal(interrupted.store.get(removedLantern.id), undefined, 'The human deletion must not be restored');
  disposeObject(removedLantern.group); interrupted.dispose();
  console.log(' ✓ human lantern deletion during reveal reports seven live lights and incomplete exact count');
  const edge = harness();
  const cabin = await call(edge, 'add_object', { type: 'cabin', position: { x: 58, z: -58 } }, 'human');
  const before = { size: edge.store.size, version: edge.store.version, ids: edge.store.idCount, snapshots: edge.captures.length };
  const impossible = await call(edge, 'add_grove', { cabin: cabin.result.id, count: 100, lights: 12 });
  assert.equal(impossible.code, 'no_space');
  assert.deepEqual({ size: edge.store.size, version: edge.store.version, ids: edge.store.idCount, snapshots: edge.captures.length }, before);
  edge.dispose();
  globalThis.document.hidden = false;
  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 1000); camera.position.set(30, 30, 30);
  const studio = { camera, controls: { target: new THREE.Vector3() }, terrain: { radius: 200 }, noteActivity() {} };
  const director = new CameraDirector(studio), focus = new THREE.Vector3(1, 1, 2);
  director.start('drift', 240, focus, 80, { distance: 22, height: 8, azimuthDegrees: 18, sweepDegrees: 50, blendSeconds: 1 });
  const samples = [];
  for (let i = 0; i < 241; i++) { director.update(1); samples.push(camera.position.clone()); }
  for (const point of samples.slice(1)) {
    const offset = point.clone().sub(focus);
    assert(Math.hypot(offset.x, offset.z) < 23 && Math.hypot(offset.x, offset.z) > 21, 'Explicit distance must not grow to full world bounds');
    assert(offset.y > 7.5 && offset.y < 8.5);
    assert(offset.z > 0, 'The cozy drift must never go behind the forest');
  }
  assert(samples[0].distanceTo(samples[240]) < 1e-7, 'The infinite drift closes seamlessly');
  director.pause('human input'); const paused = camera.position.clone(); director.update(10); assert(camera.position.equals(paused));
  assert(director.resume()); director.update(1); assert(!camera.position.equals(paused));
  console.log(' ✓ atomic no-space failure, intimate periodic camera, human pause/resume');
} finally {
  globalThis.document = previousDocument;
  await rm(scratch, { recursive: true, force: true });
}
