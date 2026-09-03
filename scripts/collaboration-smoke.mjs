/** Engineering QA through the local harness; this is not native WebMCP evidence. */
export async function collaborationChecks({ page, run, describe, check, decodeScene }) {
  await page.getByRole('button', { name: 'Close local tool inspector', exact: true }).click();
  const call = async (tool, args = {}) => JSON.parse(await run(tool, args));
  const query = async args => (await call('query_scene', { limit: 200, ...args })).result.objects;
  const edit = async (label, value) => {
    const field = page.getByRole('spinbutton', { name: label, exact: true });
    await field.fill(String(value));
    await field.press('Tab');
    await page.waitForFunction(() => !document.getElementById('selection-x').disabled);
  };
  await page.getByRole('button', { name: 'Start empty', exact: true }).click();
  await page.waitForFunction(() => !document.getElementById('scene-empty').disabled);
  check('human can begin an empty, undoable scene', (await describe()).object_count === 0);

  await page.getByRole('button', { name: 'Add pond', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-add-object="pond"]').disabled);
  await edit('Object position X', 11);
  await edit('Object position Z', -6);
  await page.getByRole('button', { name: 'Add cabin', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-add-object="cabin"]').disabled);
  await edit('Object position X', 19);
  await edit('Object position Z', -5);
  await edit('Object rotation in degrees', 25);
  const authored = await query({ include_bounds: true });
  const pond = authored.find(object => object.type === 'pond');
  const cabin = authored.find(object => object.type === 'cabin');
  check('palette and inspector publish real human provenance', authored.length === 2 && authored.every(object =>
    object.created_by === 'human' && object.last_changed_by === 'human' && object.human_revision > 0)
    && pond.pose.p[0] === 11 && cabin.pose.ry === 25, JSON.stringify(authored));
  await call('frame_camera', { target: 'scene', angle: 'three_quarter', select: false });
  await page.screenshot({ path: 'docs/collaboration-controls-qa.png' });

  const initial = await describe();
  const forest = await call('scatter', { type: 'tree', count: 30, anchor: pond.id, clearance: 0.5,
    seed: 24680, expected_scene_version: initial.scene_version });
  check('anchored scatter adds exactly 30 trees to a human world', forest.ok && forest.result.added === 30
    && forest.result.ids.length === 30 && forest.result.anchor_id === pond.id
    && forest.result.preserved_ids.includes(cabin.id), JSON.stringify(forest));
  if (!forest.ok) return;
  const grown = await query({ include_bounds: true });
  const trees = grown.filter(object => object.type === 'tree');
  check('bulk decoration preserves human pond and rotated cabin poses', authored.every(object =>
    JSON.stringify(grown.find(after => after.id === object.id)?.pose) === JSON.stringify(object.pose)));
  // Independently inspect rendered bounds rather than trusting planner counters.
  const overlap = (a, b) => a[0] < b[3] - 0.025 && a[3] > b[0] + 0.025
    && a[2] < b[5] - 0.025 && a[5] > b[2] + 0.025;
  check('all tree footprints avoid human objects and each other', trees.length === 30
    && trees.every((tree, index) => authored.every(object => !overlap(tree.bounds, object.bounds))
      && trees.slice(index + 1).every(other => !overlap(tree.bounds, other.bounds))));

  const beforeImpossible = await describe();
  const impossible = await call('scatter', { type: 'tree', count: 30, anchor: pond.id,
    area: { center_x: 11, center_z: -6, width: 1, depth: 1 } });
  const afterImpossible = await describe();
  check('impossible decoration fails atomically without undo noise', !impossible.ok && impossible.code === 'no_space'
    && afterImpossible.scene_version === beforeImpossible.scene_version
    && JSON.stringify(afterImpossible.scatter_history) === JSON.stringify(beforeImpossible.scatter_history));

  const rocks = await call('scatter', { type: 'rock', count: 6, anchor: pond.id, seed: 73 });
  const lamps = await call('scatter', { type: 'lamp', count: 4, anchor: cabin.id, seed: 74 });
  check('agent can add rocks and lamps without replacing the world', rocks.ok && lamps.ok
    && (await describe()).object_count === 42, JSON.stringify({ rocks, lamps }));
  await call('frame_camera', { target: 'scene', angle: 'three_quarter', select: false });
  await page.screenshot({ path: 'docs/collaborative-world-qa.png' });
  await call('set_lighting', { preset: 'golden_hour' });
  await page.screenshot({ path: 'docs/collaborative-world-golden-qa.png' });

  const adoptedId = forest.result.ids[0];
  await call('frame_camera', { target: adoptedId, angle: 'top', distance: 18, select: true });
  const beforeMove = (await query({ id_or_name: adoptedId }))[0];
  const observedBeforeMove = await describe();
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await page.mouse.down();
  await page.mouse.move(viewport.width / 2 + 55, viewport.height / 2 + 12, { steps: 12 });
  await page.mouse.up();
  const human = await describe();
  const adopted = (await query({ id_or_name: adoptedId }))[0];
  check('real human drag is visible to the next agent observation', human.selected_id === adoptedId
    && adopted.created_by === 'demo' && adopted.last_changed_by === 'human'
    && adopted.human_revision > 0 && JSON.stringify(adopted.pose.p) !== JSON.stringify(beforeMove.pose.p)
    && human.recent_changes.some(change => change.id === adoptedId && change.actor === 'human'), JSON.stringify({ human: human.human_edits, adopted }));

  const stale = await call('set_lighting', { preset: 'golden_hour', expected_scene_version: observedBeforeMove.scene_version });
  check('human edit invalidates an earlier agent plan', !stale.ok && stale.code === 'stale_scene'
    && (await describe()).scene_version === human.scene_version, JSON.stringify(stale));
  const posesBeforeAtmosphere = (await query({})).map(object => ({ id: object.id, pose: object.pose }));
  await call('set_lighting', { preset: 'moonlit', expected_scene_version: human.scene_version });
  const motion = await call('set_camera_motion', { action: 'start', mode: 'cinematic', loop_seconds: 60 });
  const cameraBefore = (await describe()).camera.p;
  await page.waitForTimeout(1400);
  const moving = await describe();
  const posesAfterAtmosphere = (await query({})).map(object => ({ id: object.id, pose: object.pose }));
  check('endless camera frames the current off-center world and survives readbacks', motion.ok
    && moving.camera_motion.status === 'running' && moving.camera_motion.infinite
    && moving.camera_motion.focus[0] > 5 && JSON.stringify(cameraBefore) !== JSON.stringify(moving.camera.p), JSON.stringify(moving.camera_motion));
  check('lighting and camera preserve every shared object pose', JSON.stringify(posesBeforeAtmosphere) === JSON.stringify(posesAfterAtmosphere));
  await page.mouse.move(800, 330);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(815, 335, { steps: 3 });
  await page.mouse.up({ button: 'right' });
  check('human camera takeover pauses custom-world motion', (await describe()).camera_motion.status === 'paused');
  await call('set_camera_motion', { action: 'resume' });
  check('agent can explicitly resume custom-world motion', (await describe()).camera_motion.status === 'running');
  await call('set_camera_motion', { action: 'stop' });

  await page.evaluate(() => {
    window.__overviewProbe = window.__tool('camera_path', { segment_ms: 4000,
      keyframes: [{ target: 'scene', angle: 'front' }, { target: 'scene', angle: 'top' }] });
  });
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const overview = await page.evaluate(async () => JSON.parse(await window.__overviewProbe));
  check('human Overview interrupts an agent camera path immediately', overview.applied === false, JSON.stringify(overview));
  await page.waitForTimeout(1100);

  const exported = await call('export_scene');
  await call('import_scene', { url: exported.result.url });
  const imported = (await query({ id_or_name: adoptedId }))[0];
  check('share round-trip retains object authorship and human adoption', imported.created_by === 'demo'
    && imported.last_changed_by === 'human' && imported.human_revision === adopted.human_revision
    && JSON.stringify(imported.pose) === JSON.stringify(adopted.pose));
  check('scene replacement invalidates old selective undo records', !(await call('undo_scatter', { undo_id: forest.result.undo_id })).ok);

  const legacy = decodeScene(exported.result.url);
  for (const object of legacy.objects) {
    delete object.createdBy; delete object.lastChangedBy; delete object.revision; delete object.humanRevision;
  }
  await call('import_scene', { json: JSON.stringify(legacy) });
  const legacyObjects = await query({});
  check('older scene imports keep unknown authorship instead of inventing a creator', legacyObjects.every(object => object.created_by === 'unknown')
    && legacyObjects.find(object => object.id === adoptedId).human_edited);

  // A new addition journal must selectively keep both a human transform and a
  // later material change, while actually removing its untouched additions.
  const extras = await call('scatter', { type: 'rock', count: 4,
    area: { center_x: -30, center_z: -25, width: 10, depth: 10 }, seed: 82 });
  if (extras.ok) {
    const [humanId, coloredId] = extras.result.ids;
    await call('frame_camera', { target: humanId, angle: 'top', distance: 18, select: true });
    await edit('Object position X', -28);
    await call('set_material', { targets: coloredId, color: '#668baa' });
    const undo = await call('undo_scatter', { undo_id: extras.result.undo_id });
    const remaining = await query({});
    check('selective addition undo keeps subsequent human and material edits', undo.ok
      && undo.result.removed_ids.length === 2 && undo.result.skipped_ids.includes(humanId)
      && undo.result.skipped_ids.includes(coloredId)
      && remaining.find(object => object.id === humanId)?.pose.p[0] === -28
      && remaining.find(object => object.id === coloredId)?.material.color === '#668baa', JSON.stringify(undo));
  } else check('selective addition undo keeps subsequent human and material edits', false, JSON.stringify(extras));
}
