import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Exercise real geometry, store, native dispatch, planning and addition history.
// Only canvas drawing is inert: no browser or GPU is needed for geometry bounds.
const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'scratch-scatter-regression-'));
const previousDocument = globalThis.document;
try {
  const output = join(scratch, 'scatter.mjs');
  await build({ stdin: { contents: `
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
  const { SceneStore, dispatchTool, fullSizeBounds, semanticClearances, scatterHistory, updateTweens, cancelAllToolTweens, disposeObject, THREE } = await import(pathToFileURL(output).href);

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

  const h = harness();
  const pondResult = await call(h, 'add_object', { type: 'pond', position: { x: -4, z: 3 }, scale: 1.25, rotation_y: 25 }, 'human');
  const cabinResult = await call(h, 'add_object', { type: 'cabin', position: { x: 4, z: -3 }, scale: 0.85, rotation_y: -30 }, 'human');
  assert(pondResult.ok && cabinResult.ok);
  const pond = h.store.get(pondResult.result.id), cabin = h.store.get(cabinResult.result.id);
  assert.equal(pond.createdBy, 'human'); assert(pond.humanRevision > 0);
  const anchorPoses = [pose(pond), pose(cabin)], selected = h.store.selectedId = cabin.id;
  const growth = await call(h, 'scatter', { type: 'tree', count: 30, anchor: pond.id, clearance: 0.4, seed: 42 });
  assert(growth.ok, JSON.stringify(growth));
  assert.equal(growth.result.added, 30); assert.equal(growth.result.ids.length, 30);
  assert.deepEqual([pose(pond), pose(cabin)], anchorPoses); assert.equal(h.store.selectedId, selected);
  assert(growth.result.preserved_ids.includes(pond.id) && growth.result.preserved_ids.includes(cabin.id));
  const trees = growth.result.ids.map(id => h.store.get(id));
  const fixed = [fullSizeBounds(pond.group), fullSizeBounds(cabin.group)];
  const entrance = semanticClearances(cabin)[0];
  assert(entrance && entrance.width > 0 && entrance.depth > 0);
  fixed.push(new THREE.Box3(new THREE.Vector3(entrance.x - entrance.width / 2, 0, entrance.z - entrance.depth / 2),
    new THREE.Vector3(entrance.x + entrance.width / 2, 0, entrance.z + entrance.depth / 2)));
  const boxes = trees.map(entry => fullSizeBounds(entry.group));
  const area = growth.result.area;
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    assert(box.min.x >= area.center_x - area.width / 2 - 1e-7 && box.max.x <= area.center_x + area.width / 2 + 1e-7);
    assert(box.min.z >= area.center_z - area.depth / 2 - 1e-7 && box.max.z <= area.center_z + area.depth / 2 + 1e-7);
    for (const obstacle of [...fixed, ...boxes.slice(0, i)]) assert(separated(box, obstacle, 0.4), `Tree ${i} intersects an occupied footprint`);
    assert.equal(trees[i].createdBy, 'agent');
  }

  const beforeFailure = { size: h.store.size, version: h.store.version, counter: h.store.idCount,
    snapshots: h.captures.length, history: scatterHistory(h.store).state, changes: h.store.recentChanges };
  const impossible = await call(h, 'scatter', { type: 'tree', count: 30, area: { width: 0.5, depth: 0.5 }, seed: 1 });
  assert.equal(impossible.code, 'no_space');
  assert.deepEqual({ size: h.store.size, version: h.store.version, counter: h.store.idCount,
    snapshots: h.captures.length, history: scatterHistory(h.store).state, changes: h.store.recentChanges }, beforeFailure, 'Failed scatter must leave scene, history, counters and snapshots untouched');

  assert((await call(h, 'transform_object', { targets: trees[0].id, op: 'move', x: 25 }, 'human')).ok);
  assert((await call(h, 'set_material', { targets: trees[1].id, color: '#3377cc' }, 'human')).ok);
  assert((await call(h, 'delete_objects', { targets: trees[2].id }, 'human')).ok);
  assert((await call(h, 'transform_object', { targets: trees[3].id, op: 'rotate', y: 40 })).ok);
  assert.equal(trees[0].lastChangedBy, 'human'); assert(trees[0].humanRevision > 0);
  assert.equal(trees[1].lastChangedBy, 'human');
  assert(h.store.recentChanges.some(change => change.id === trees[2].id && change.actor === 'human' && change.action === 'deleted'));
  const undo = await call(h, 'undo_scatter', { undo_id: growth.result.undo_id });
  assert(undo.ok); assert.equal(undo.result.removed_ids.length, 26);
  assert.deepEqual(new Set(undo.result.skipped_ids), new Set(trees.slice(0, 4).map(entry => entry.id)));
  assert(Math.abs(h.store.get(trees[0].id).group.position.x - 25) < 1e-8);
  assert.equal(h.store.get(trees[1].id).materials[0].color.getHexString(), '3377cc');
  assert.equal(h.store.get(trees[2].id), undefined);
  assert.deepEqual([pose(pond), pose(cabin)], anchorPoses);

  // Same seed and same starting registry reproduce positions and geometry.
  const repeat = harness();
  await call(repeat, 'add_object', { type: 'pond', position: { x: -4, z: 3 }, scale: 1.25, rotation_y: 25 }, 'human');
  await call(repeat, 'add_object', { type: 'cabin', position: { x: 4, z: -3 }, scale: 0.85, rotation_y: -30 }, 'human');
  const again = await call(repeat, 'scatter', { type: 'tree', count: 30, anchor: 'obj_1', clearance: 0.4, seed: 42 });
  assert(again.ok);
  // Direct planner geometry bounds are the stable evidence, including the edited originals.
  assert.deepEqual(again.result.ids.map(id => { const b = fullSizeBounds(repeat.store.get(id).group); return [b.min.toArray(), b.max.toArray()]; }),
    boxes.map(box => [box.min.toArray(), box.max.toArray()]));
  repeat.dispose();
  assert.equal(scatterHistory(repeat.store).state.can_undo, false);
  const replacement = repeat.store.spawn('box', { actor: 'human' });
  assert.equal(scatterHistory(repeat.store).take(again.result.undo_id), null, 'Scene replacement invalidates addition history even if ids repeat');
  disposeObject(replacement.group); repeat.store.clear(); h.dispose();
  const compactRegions = [];
  for (const fixture of [
    { name: 'off-center QA', pond: [11, -6], cabin: [19, -5], rotation: 25 },
    { name: 'origin', pond: [0, 0], cabin: [5.35, 4.51], rotation: 0 },
  ]) {
    const compact = harness();
    const pond = compact.store.spawn('pond', { forceId: 'obj_47', actor: 'human' });
    const cabin = compact.store.spawn('cabin', { forceId: 'obj_48', actor: 'human', rotationYDeg: fixture.rotation });
    pond.group.position.set(fixture.pond[0], 0, fixture.pond[1]);
    cabin.group.position.set(fixture.cabin[0], 0, fixture.cabin[1]);
    compact.ctx.studio.scene.add(pond.group, cabin.group);
    const before = [pose(pond), pose(cabin)];
    const forest = await call(compact, 'scatter', { type: 'tree', count: 30, anchor: pond.id, seed: 24680, clearance: 0.5 });
    assert(forest.ok, `${fixture.name}: ${JSON.stringify(forest)}`);
    assert.equal(forest.result.added, 30);
    assert(forest.result.area.width <= 40 && forest.result.area.depth <= 40,
      `${fixture.name}: a cozy 30-tree grove must not need a sparse field larger than 40 by 40`);
    assert.deepEqual([pose(pond), pose(cabin)], before);
    const fixed = [fullSizeBounds(pond.group), fullSizeBounds(cabin.group)];
    for (const zone of semanticClearances(cabin)) fixed.push(new THREE.Box3(
      new THREE.Vector3(zone.x - zone.width / 2, 0, zone.z - zone.depth / 2),
      new THREE.Vector3(zone.x + zone.width / 2, 0, zone.z + zone.depth / 2)));
    for (const id of forest.result.ids) {
      const bounds = fullSizeBounds(compact.store.get(id).group);
      for (const previous of fixed) assert(separated(bounds, previous, 0.5), `${fixture.name}: compact packing must retain full footprint and entrance clearance`);
      fixed.push(bounds);
    }
    compactRegions.push(`${fixture.name} ${forest.result.area.width.toFixed(2)}m`);
    compact.dispose();
  }
  const humanBatch = harness();
  const batch = await call(humanBatch, 'batch', { ops: [
    { tool: 'add_object', args: { type: 'box', position: { x: -2, z: 0 } } },
    { tool: 'add_object', args: { type: 'box', position: { x: 2, z: 0 } } },
  ] }, 'human');
  assert(batch.ok, 'A human batch must not mistake its own provenance stamps for another human taking over');
  assert.equal(humanBatch.store.size, 2);
  assert(humanBatch.store.all().every(entry => entry.createdBy === 'human'));
  const changedOutsideBatch = humanBatch.store.all()[0];
  const interruptedBatch = await call(humanBatch, 'batch', { ops: [
    { tool: 'add_object', args: { type: 'box', position: { x: 0, z: 3 } } },
    { tool: 'missing_tool', args: {} },
  ] }, 'human', () => {
    changedOutsideBatch.group.position.x = -7;
    humanBatch.store.markHumanEdit(changedOutsideBatch.id);
  });
  assert.equal(interruptedBatch.code, 'batch_interrupted');
  assert.equal(changedOutsideBatch.group.position.x, -7, 'External human input must still interrupt a human batch without snapshot rollback');
  assert.equal(humanBatch.store.size, 3);
  humanBatch.dispose();
  console.log(' ✓ scatter exact counts, full footprints, atomic failure, actor provenance, selective undo and replacement boundaries');
  console.log(` ✓ compact anchored groves: ${compactRegions.join(', ')}`);
} finally {
  globalThis.document = previousDocument;
  await rm(scratch, { recursive: true, force: true });
}
