/**
 * Tool smoke test: loads ?agent=1 (the built-in harness — works without any
 * Chrome flag), calls every tool registered in the agent manifest through the
 * same handlers WebMCP exposes, and asserts ok:true.
 *
 * Run: npm run smoke   (starts its own preview server on a free port)
 * Exit code 0 = every tool verified. Writes scripts/smoke-result.json.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { gunzipSync, gzipSync } from 'node:zlib';
import './animation-regression.mjs';
import './share-regression.mjs';
import './scatter-regression.mjs';
import './zen-regression.mjs';
import { collaborationChecks } from './collaboration-smoke.mjs';

function decodeScene(url) {
  const payload = new URL(url).hash.slice('#scene='.length);
  const compressed = payload.startsWith('gz1.');
  const bytes = Buffer.from(compressed ? payload.slice(4) : payload, 'base64url');
  return JSON.parse((compressed ? gunzipSync(bytes, { maxOutputLength: 4_000_000 }) : bytes).toString('utf8'));
}

// Use a free port so an older developer preview can never mask this build.
const reservation = createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const PORT = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const BASE = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1600));

let failures = 0;
const checked = [];
const renderErrors = [];
let browser;
const launchOptions = {
  headless: true,
  // Explicit software OpenGL on GPU-less CI; no automatic WebGL fallback.
  // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
  args: process.env.CI ? ['--use-gl=angle', '--use-angle=swiftshader'] : [],
};
const bootTimeout = process.env.CI ? 60_000 : 10_000;
async function newTestPage() {
  // Keep the CSS viewport and pointer geometry; lower only CI's raster cost.
  const page = await browser.newPage({ deviceScaleFactor: process.env.CI ? 0.5 : 1 });
  page.setDefaultNavigationTimeout(90_000);
  page.on('pageerror', error => renderErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /WebGLProgram|mergeGeometries|GL_INVALID/.test(message.text())) renderErrors.push(message.text()); });
  return page;
}
async function testQuality(page) {
  // Same scene and tool contract; CI has no hardware GPU for post-processing.
  if (process.env.CI) {
    const studioTools = page.getByRole('button', { name: 'Studio tools', exact: true });
    if (await studioTools.getAttribute('aria-expanded') === 'false') await studioTools.click();
    await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
  }
}
try {
  try {
    browser = await chromium.launch({ channel: 'chrome', ...launchOptions });
  } catch {
    browser = await chromium.launch(launchOptions); // CI: bundled chromium
  }
  const page = await newTestPage();
  page.setDefaultNavigationTimeout(90_000);
  page.on('pageerror', error => console.error('PAGE ERROR:', error.message));
  page.on('console', message => {
    if (message.type() === 'error') console.error('BROWSER ERROR:', message.text());
    else if (message.text().startsWith('SMOKE ')) console.log(message.text());
  });
  await page.goto(`${BASE}/?agent=1`);
  await page.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  await testQuality(page);

  // The agent manifest is the source of truth for the tool list.
  const names = await page.evaluate(() => {
    const manifest = JSON.parse(document.getElementById('agent-manifest').textContent);
    return manifest.tools.split(': ')[1].split(', ').map((s) => s.trim());
  });

  const id = await page.evaluate(async (names) => {
    window.__results = {};
    window.__call = async (tool, args) => {
      console.info('SMOKE running ' + tool);
      let timeout;
      const raw = await Promise.race([
        window.__tool(tool, args),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Tool timed out: ' + tool)), 90_000); }),
      ]).finally(() => clearTimeout(timeout));
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { ok: true, raw }; }
      window.__results[tool] = parsed;
      return parsed;
    };
    const r = {};
    r.help = await window.__call('help', {});
    r.describe_scene = await window.__call('describe_scene', {});
    r.arrange_scene = await window.__call('arrange_scene', { anchor: 'camp' });
    r.undo_layout = await window.__call('undo_layout', {});
    r.redo_layout = await window.__call('redo_layout', {});
    r.add_object = await window.__call('add_object', { type: 'tree', name: 'smoke tree' });
    const treeId = r.add_object.result?.id ?? 'obj_1';
    r.query_scene = await window.__call('query_scene', { limit: 5 });
    r.transform_object = await window.__call('transform_object', { targets: treeId, op: 'move', z: 2 });
    r.set_material = await window.__call('set_material', { targets: treeId, color: '#88aaff' });
    r.set_lighting = await window.__call('set_lighting', { preset: 'night_neon' });
    r.frame_camera = await window.__call('frame_camera', { target: 'scene', angle: 'hero' });
    r.camera_path = await window.__call('camera_path', {
      keyframes: [{ target: 'scene', angle: 'three_quarter' }, { target: 'scene', angle: 'front', hold_ms: 120 }],
    });
    r.set_ui = await window.__call('set_ui', { visible: true });
    r.scatter = await window.__call('scatter', { type: 'rock', count: 2, area: { center_x: 18, center_z: 18, width: 6, depth: 6 }, seed: 42 });
    r.undo_scatter = await window.__call('undo_scatter', { undo_id: r.scatter.result?.undo_id });
    r.delete_objects = await window.__call('delete_objects', { name_contains: 'smoke tree' });
    const board = await window.__call('add_object', { type: 'chessboard', name: 'smoke board' });
    const piece = await window.__call('add_object', { type: 'chess_piece', piece: 'king', side: 'white', name: 'smoke king' });
    r.board_square = await window.__call('board_square', { square: 'e4', board: board.result.id });
    r.chess_move = await window.__call('chess_move', { piece: piece.result.id, to: 'e4', camera: 'hero' });
    r.set_music = await window.__call('set_music', { on: false });
    r.snapshot = await window.__call('snapshot', { label: 'smoke' });
    r.undo = await window.__call('undo', {});
    r.export_scene = await window.__call('export_scene', {});
    const url = r.export_scene.result?.url ?? '';
    r.import_scene = await window.__call('import_scene', { url });
    r.batch = await window.__call('batch', {
      ops: [
        { tool: 'add_object', args: { type: 'box', name: 'smoke box' } },
        { tool: 'set_lighting', args: { preset: 'golden_hour' } },
      ],
    });
    r.set_camera_motion = await window.__call('set_camera_motion', { action: 'start', mode: 'orbit', loop_seconds: 60 });
    r.compose_lofi_scene = await window.__call('compose_lofi_scene', { music: false, build_seconds: 12 });
    r.control_lofi = await window.__call('control_lofi', { action: 'stop' });
    const beforeZen = await window.__call('describe_scene', {});
    if (beforeZen.result?.object_count) await window.__call('delete_objects', { name_contains: '' });
    const zenCabin = await window.__call('add_object', { type: 'cabin', position: { x: 3, z: -3 } });
    const zenPond = await window.__call('add_object', { type: 'pond', position: { x: -5, z: 6 } });
    r.add_grove = await window.__call('add_grove', { cabin: zenCabin.result.id, pond: zenPond.result.id, count: 40, lights: 8, seed: 42, reveal_seconds: 0 });
    r.add_path = await window.__call('add_path', { cabin: zenCabin.result.id, pond: zenPond.result.id, reveal_seconds: 0 });
    return r;
  }, names);

  for (const name of names) {
    const r = checked.find((c) => c.name === name)?.r ?? id[name];
    const ok = r && r.ok === true;
    checked.push({ name, ok: !!ok, note: ok ? '' : 'missing or not ok' });
    if (!ok) failures++;
    console.log(`${ok ? ' ✓' : '✗'} ${name}${r?.error ? ` — ${r.error}` : ''}`);
  }

  // Cross-check: every manifest tool was actually exercised.
  for (const name of names) {
    if (!id[name]) {
      failures++;
      console.log(`✗ ${name} — not covered by the smoke sequence`);
    }
  }

  // --- valid portable scenes leave the active tool page URL short ----------
  await page.close(); // Release this renderer before allocating another one.
  const validSharePage = await newTestPage();
  const sharedUrl = new URL(id.export_scene.result.url);
  const expectedSharedScene = decodeScene(sharedUrl.href);
  sharedUrl.search = '?agent=1';
  await validSharePage.goto(sharedUrl.href);
  // __tool is exposed only after registerTools has completed.
  await validSharePage.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  const sharedResult = await validSharePage.evaluate(async () => {
    const current = JSON.parse(await window.__tool('describe_scene', {}));
    const urlBefore = location.href;
    const exported = JSON.parse(await window.__tool('export_scene', {}));
    const after = JSON.parse(await window.__tool('describe_scene', {}));
    return { current, exported, after, urlBefore, urlAfter: location.href };
  });
  const validSharedObjects = decodeScene(sharedResult.exported.result.url).objects;
  const validShareOk = sharedResult.current.ok && sharedResult.after.ok
    && sharedResult.current.result.object_count === expectedSharedScene.objects.length
    && JSON.stringify(validSharedObjects) === JSON.stringify(expectedSharedScene.objects)
    && sharedUrl.hash.startsWith('#scene=gz1.') && sharedUrl.href.length < 6000
    && !new URL(sharedResult.urlBefore).hash && sharedResult.urlAfter === sharedResult.urlBefore;
  if (validShareOk) console.log(' ✓ shared scene restores before tools; export keeps the active URL short');
  else { failures++; console.log(`✗ shared scene tool continuation: ${JSON.stringify({ count: sharedResult.current.result?.object_count, expected: expectedSharedScene.objects.length, urlBefore: sharedResult.urlBefore, urlAfter: sharedResult.urlAfter })}`); }
  const legacyUrl = `${BASE}/?agent=1#scene=${Buffer.from(JSON.stringify(expectedSharedScene)).toString('base64url')}`;
  await validSharePage.goto(legacyUrl);
  await validSharePage.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  const legacyShared = await validSharePage.evaluate(() => window.__scene());
  const oversizedUrl = `${BASE}/#scene=gz1.${gzipSync(Buffer.alloc(4_000_001, 32)).toString('base64url')}`;
  const oversizedImport = await validSharePage.evaluate(async url => JSON.parse(await window.__tool('import_scene', { url })), oversizedUrl);
  const afterOversized = await validSharePage.evaluate(() => window.__scene());
  const legacyShareOk = legacyShared.ok && legacyShared.result.object_count === expectedSharedScene.objects.length;
  const boundedShareOk = !oversizedImport.ok && oversizedImport.code === 'bad_request'
    && afterOversized.result.scene_version === legacyShared.result.scene_version
    && afterOversized.result.object_count === legacyShared.result.object_count;
  if (!legacyShareOk) failures++;
  if (!boundedShareOk) failures++;
  await validSharePage.close();

  // --- corrupted share link must never take the page down (boot path) -------
  const pageErrors = [];
  const badPage = await newTestPage();
  badPage.on('pageerror', (err) => pageErrors.push(String(err)));
  await badPage.goto(`${BASE}/?agent=1#scene=not-valid-base64-%%%zzz`);
  await badPage.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  const chipText = await badPage.evaluate(() => document.querySelector('#webmcp-status .status-text')?.textContent ?? '');
  const logEntries = await badPage.evaluate(() => document.querySelector('#tool-log-entries')?.children.length ?? 0);
  const chipOk = chipText.length > 0 && !chipText.includes('checking');
  if (pageErrors.length === 0 && chipOk && logEntries > 0) {
    console.log(' ✓ corrupted-share-link boot (no pageerror, chip live, scene booted)');
  } else {
    failures++;
    console.log(`✗ corrupted-share-link boot — pageerrors: ${pageErrors.length}, chip: "${chipText}", log entries: ${logEntries}`);
  }
  await badPage.close();

  // --- structurally invalid links must preserve the starter scene ----------
  const encodeShare = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  const malformedShare = encodeShare({
    schema_version: 2,
    scene_version: 0,
    id_counter: 0,
    lighting: { preset: 'golden_hour', intensity: 1 },
    objects: [],
    // camera intentionally missing: boundary validation must reject it
  });
  const malformedPage = await newTestPage();
  const malformedErrors = [];
  malformedPage.on('pageerror', (err) => malformedErrors.push(String(err)));
  await malformedPage.goto(`${BASE}/?agent=1#scene=${malformedShare}`);
  await malformedPage.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  const malformedScene = await malformedPage.evaluate(() => window.__scene());
  const malformedChip = await malformedPage.evaluate(() => document.querySelector('#webmcp-status .status-text')?.textContent ?? '');
  const malformedOk = malformedErrors.length === 0 && malformedChip.length > 0 && malformedScene.result?.object_count === id.describe_scene.result.object_count;
  if (malformedOk) {
    console.log(' ✓ malformed-share-link preserves starter scene');
  } else {
    failures++;
    console.log(`✗ malformed-share-link boot — pageerrors: ${malformedErrors.length}, chip: "${malformedChip}", scene: ${JSON.stringify(malformedScene)}`);
  }
  await malformedPage.close();

  // --- imported error text is rendered as text, never executable HTML -------
  const xssShare = encodeShare({
    schema_version: 2,
    scene_version: 0,
    id_counter: 0,
    lighting: { preset: 'golden_hour', intensity: 1 },
    camera: { p: [6.4, 3, 7.6], t: [0, 0.8, 0], fov: 42 },
    objects: [{
      id: 'obj_1',
      name: 'probe',
      type: '<img id="xss-probe" src=x onerror="document.body.dataset.xss=1">',
      p: [0, 0, 0], r: [0, 0, 0], s: [1, 1, 1],
    }],
  });
  const xssPage = await newTestPage();
  const xssErrors = [];
  xssPage.on('pageerror', (err) => xssErrors.push(String(err)));
  await xssPage.goto(`${BASE}/?agent=1#scene=${xssShare}`);
  await xssPage.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  const xssState = await xssPage.evaluate(() => ({
    probe: !!document.querySelector('#xss-probe'),
    executed: document.body.dataset.xss === '1',
  }));
  if (xssErrors.length === 0 && !xssState.probe && !xssState.executed) {
    console.log(' ✓ imported error text cannot inject markup');
  } else {
    failures++;
    console.log(`✗ imported error text injection — pageerrors: ${xssErrors.length}, state: ${JSON.stringify(xssState)}`);
  }
  await xssPage.close();


  // --- behavioral correctness: verify observable state, not just {ok:true} ---
  const badPage2 = await newTestPage();
  const behavioral = [{
    name: 'shared scene restores before tools and keeps its active URL short',
    pass: validShareOk,
    detail: JSON.stringify({ objects: sharedResult.current.result?.object_count, expected: expectedSharedScene.objects.length, activeUrl: sharedResult.urlAfter }),
  }, { name: 'legacy scene links remain readable', pass: legacyShareOk, detail: '' },
  { name: 'oversized compressed imports preserve the live scene', pass: boundedShareOk, detail: oversizedImport.error ?? '' }];
  const check = (name, pass, detail = '') => {
    behavioral.push({ name, pass, detail });
    if (!pass) failures++;
    console.log(`${pass ? ' ✓' : '✗'} [behavior] ${name}${pass ? '' : ' — ' + detail}`);
  };
  await badPage2.goto(`${BASE}/?agent=1`);
  await badPage2.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: bootTimeout });
  await testQuality(badPage2);
  const run = (tool, args) => badPage2.evaluate(([t, a]) => window.__tool(t, a), [tool, args]);
  const j = (raw) => JSON.parse(raw);
  const describe = async () => (j(await run('describe_scene', {})).result ?? {});

  // add_object really adds + places where asked
  const d0 = await describe();
  const add = j(await run('add_object', { type: 'box', name: 'behavior box', position: { x: 3, z: 3 } }));
  const addId = add.result?.id;
  const d1 = await describe();
  check('add_object increases contents', d1.object_count === d0.object_count + 1);
  const q1 = (j(await run('query_scene', { id_or_name: addId, fields: ['pose'] })).result ?? {});
  const pose = q1.objects?.[0]?.pose;
  check('add_object lands at requested position', !!pose && Math.abs(pose.p[0] - 3) < 0.01 && Math.abs(pose.p[2] - 3) < 0.01, JSON.stringify(pose));

  // transform moves the live object
  await run('transform_object', { targets: addId, op: 'move', mode: 'absolute', x: -2, z: 5 });
  const q2 = (j(await run('query_scene', { id_or_name: addId, fields: ['pose'] })).result ?? {});
  check('transform_object moves live position', Math.abs(q2.objects?.[0]?.pose.p[0] - -2) < 0.01 && Math.abs(q2.objects?.[0]?.pose.p[2] - 5) < 0.01, JSON.stringify(q2.objects?.[0]?.pose));

  // set_material changes material state
  await run('set_material', { targets: addId, color: '#88aaff' });
  const q3 = (j(await run('query_scene', { id_or_name: addId, fields: ['material'] })).result ?? {});
  check('set_material changes material', (q3.objects?.[0]?.material?.color ?? '').toLowerCase() === '#88aaff', JSON.stringify(q3.objects?.[0]?.material));

  // set_lighting changes preset
  await run('set_lighting', { preset: 'night_neon' });
  const d2 = await describe();
  check('set_lighting changes preset', d2.lighting?.preset === 'night_neon', d2.lighting?.preset);

  // delete removes exactly the target; undo restores it
  await run('delete_objects', { targets: addId });
  const d3 = await describe();
  const gone = j(await run('query_scene', { id_or_name: addId }));
  check('delete_objects removes the target', d3.object_count === d0.object_count && gone.ok === false);
  await run('undo', {});
  const d4 = await describe();
  const back = j(await run('query_scene', { id_or_name: addId }));
  check('undo restores deleted object', d4.object_count === d1.object_count && back.ok === true);
  check('undo advances the observation version', d4.scene_version > d3.scene_version);
  const staleUndo = j(await run('transform_object', { targets: addId, op: 'move', x: 12, expected_scene_version: d3.scene_version }));
  check('undo never revalidates a stale plan', !staleUndo.ok && staleUndo.code === 'stale_scene');

  // export/import round-trips the same scene
  const exp = j(await run('export_scene', {}));
  const shareUrl = exp.result?.url;
  const beforeRoundtrip = await describe();
  const imp = j(await run('import_scene', { url: shareUrl ?? '' }));
  const afterImport = await describe();
  check(
    'export/import round-trips scene and preserves versions',
    imp.ok === true && afterImport.object_count === beforeRoundtrip.object_count &&
      Number.isInteger(beforeRoundtrip.scene_version) && Number.isInteger(afterImport.scene_version) &&
      afterImport.scene_version === beforeRoundtrip.scene_version + 1,
    JSON.stringify({ before: beforeRoundtrip.scene_version, after: afterImport.scene_version }),
  );
  const exportedAgain = j(await run('export_scene', {}));
  check('scene links preserve every material and lantern light', JSON.stringify(decodeScene(shareUrl).objects) === JSON.stringify(decodeScene(exportedAgain.result.url).objects));
  await run('set_material', { targets: addId, roughness: 0.42 });
  const beforeOldImport = await describe();
  await run('import_scene', { url: shareUrl });
  check('older imports never rewind the local version', (await describe()).scene_version === beforeOldImport.scene_version + 1);

  await run('set_lighting', { preset: 'moonlit', azimuth: 137 });
  const aimed = decodeScene(j(await run('export_scene', {})).result.url);
  await run('set_lighting', { preset: 'studio', azimuth: -32 });
  await run('undo', {});
  const restoredLight = decodeScene(j(await run('export_scene', {})).result.url);
  check('undo preserves the authored light direction', Math.abs(restoredLight.lighting.azimuth - aimed.lighting.azimuth) < 0.001);

  const lampId = aimed.objects.find(object => object.type === 'lamp').id;
  const beforeLamp = decodeScene(j(await run('export_scene', {})).result.url).objects.find(object => object.id === lampId);
  await run('set_material', { targets: lampId, roughness: 0.7 });
  const roughLamp = decodeScene(j(await run('export_scene', {})).result.url).objects.find(object => object.id === lampId);
  check('surface edits preserve lantern illumination', JSON.stringify(beforeLamp.lights) === JSON.stringify(roughLamp.lights));
  await run('set_material', { targets: lampId, emissive: '#2299ff', emissive_intensity: 2 });
  const blueLamp = decodeScene(j(await run('export_scene', {})).result.url).objects.find(object => object.id === lampId);
  check('lantern illumination follows its emissive material', blueLamp.lights[0].color === '#2299ff' && Math.abs(blueLamp.lights[0].intensity - 3.5) < 0.001, JSON.stringify(blueLamp.lights));

  // invalid calls never mutate the scene
  const d5 = await describe();
  const bad1 = j(await run('add_object', { type: 'unicorn' }));
  const bad2 = j(await run('transform_object', { targets: 'obj_9999', op: 'move', x: 1 }));
  const bad3 = j(await run('chess_move', { piece: 'obj_1', to: 'zz' }));
  const d6 = await describe();
  check('invalid calls fail without mutating', bad1.ok === false && bad2.ok === false && bad3.ok === false && d6.object_count === d5.object_count && d6.scene_version === d5.scene_version);
  const malformed = [];
  for (const [tool, args] of [
    ['add_object', { type: 'box', scale: NaN }],
    ['add_object', { type: 'box', name: 'x'.repeat(121) }],
    ['add_object', { type: 'box', position: null }],
    ['set_material', { targets: addId, roughness: '0.5' }],
    ['set_music', { on: 'false' }],
    ['transform_object', { targets: addId, op: 'scale' }],
    ['transform_object', { targets: addId, op: 'move', uniform: 2 }],
  ]) malformed.push(j(await run(tool, args)));
  const afterMalformed = await describe();
  check('malformed typed input is rejected before mutation', malformed.every(result => !result.ok) && afterMalformed.scene_version === d6.scene_version && afterMalformed.object_count === d6.object_count, JSON.stringify(malformed));

  await run('transform_object', { targets: addId, op: 'move', mode: 'relative', x: 10000, y: 10000, z: -10000 });
  await run('scatter', { type: 'rock', count: 3, area: { center_x: 58, center_z: 58, width: 110, depth: 110 }, seed: 12 });
  const bounded = j(await run('export_scene', {}));
  const bounds = decodeScene(bounded.result.url).objects;
  const boundedImport = j(await run('import_scene', { url: bounded.result.url }));
  check('edge placement stays inside the portable scene bounds', boundedImport.ok && bounds.every(object => object.p.every(n => Math.abs(n) <= 60)));

  // batch reverts as one logical unit
  const pre = await describe();
  const b = j(await run('batch', { ops: [
    { tool: 'add_object', args: { type: 'rock', name: 'batch probe' } },
    { tool: 'set_lighting', args: { preset: 'moonlit' } },
  ]}));
  const mid = await describe();
  check('batch applies as one', b.ok === true && b.result?.failed === 0 && mid.object_count === pre.object_count + 1 && mid.lighting?.preset === 'moonlit');
  await run('undo', {});
  const post = await describe();
  check('single undo rolls back whole batch', post.object_count === pre.object_count && post.lighting?.preset === pre.lighting?.preset);

  const rollbackBefore = decodeScene(j(await run('export_scene', {})).result.url);
  const rolledBack = j(await run('batch', { ops: [
    { tool: 'add_object', args: { type: 'rock', name: 'rollback probe' } },
    { tool: 'transform_object', args: { targets: 'missing rollback target', op: 'move', x: 2 } },
    { tool: 'add_object', args: { type: 'box', name: 'must never execute' } },
  ] }));
  const rollbackAfter = decodeScene(j(await run('export_scene', {})).result.url);
  check('failed batch rolls back completely and reports the failed step', !rolledBack.ok && rolledBack.code === 'batch_rolled_back'
    && rolledBack.result.transaction_status === 'rolled_back' && rolledBack.result.results.length === 2
    && JSON.stringify(rollbackBefore.objects) === JSON.stringify(rollbackAfter.objects), JSON.stringify(rolledBack));

  const concurrentBefore = await describe();
  const overlapping = await badPage2.evaluate(async () => {
    const results = await Promise.all([
      window.__tool('add_object', { type: 'box', name: 'concurrent first' }),
      window.__tool('add_object', { type: 'rock', name: 'concurrent rejected' }),
      window.__tool('describe_scene', {}),
    ]);
    return results.map(JSON.parse);
  });
  check('overlapping edits are rejected while scene observation stays available', overlapping[0].ok && !overlapping[1].ok && overlapping[1].code === 'scene_busy'
    && overlapping[2].ok && (await describe()).object_count === concurrentBefore.object_count + 1, JSON.stringify(overlapping));
  const transitionalRead = await badPage2.evaluate(async id => {
    const moving = window.__tool('transform_object', { targets: id, op: 'move', x: 10 });
    const observed = JSON.parse(await window.__tool('describe_scene', {}));
    await moving;
    return JSON.parse(await window.__tool('transform_object', { targets: id, op: 'move', x: 11, expected_scene_version: observed.result.scene_version }));
  }, addId);
  check('observations during an animation become stale when it settles', !transitionalRead.ok && transitionalRead.code === 'stale_scene', JSON.stringify(transitionalRead));

  const revealing = j(await run('add_object', { type: 'box', name: 'slow reveal export', scale: 0.1, animate: false, delay_ms: 2000 }));
  const revealUrl = j(await run('export_scene', {})).result.url;
  const revealImport = j(await run('import_scene', { url: revealUrl }));
  check('share links captured during a reveal remain importable', revealing.ok && revealImport.ok, JSON.stringify(revealImport));

  const elevatedBoard = j(await run('add_object', { type: 'chessboard', name: 'elevated board', scale: 2 }));
  await run('transform_object', { targets: elevatedBoard.result.id, op: 'move', y: 3 });
  const elevatedPiece = j(await run('add_object', { type: 'chess_piece', name: 'elevated pawn' }));
  const elevatedMove = j(await run('chess_move', { piece: elevatedPiece.result.id, board: elevatedBoard.result.id, to: 'e4' }));
  check('chess pieces land on elevated scaled boards', elevatedMove.ok && Math.abs(elevatedMove.result.position[1] - 3.16) < 0.01, JSON.stringify(elevatedMove));

  const takeoverObject = j(await run('add_object', { type: 'box', name: 'human takeover probe' })).result.id;
  await run('frame_camera', { target: takeoverObject, select: true });
  const beforeTakeover = await describe();
  await badPage2.evaluate(id => {
    window.__takeoverBatch = window.__tool('batch', { ops: [
      { tool: 'transform_object', args: { targets: id, op: 'move', x: 1 } },
      { tool: 'add_object', args: { type: 'box', name: 'must not replace human work' } },
    ] });
  }, takeoverObject);
  await badPage2.keyboard.press('Delete');
  const takeoverResult = await badPage2.evaluate(async () => JSON.parse(await window.__takeoverBatch));
  check('human deletion interrupts a batch without restoring over the human', takeoverResult.code === 'batch_interrupted'
    && takeoverResult.result.results[0].ok && takeoverResult.result.results[0].applied === false
    && (await describe()).object_count === beforeTakeover.object_count - 1, JSON.stringify(takeoverResult));

  // optimistic concurrency: stale expected version is rejected, scene untouched
  const cur = await describe();
  const stale = j(await run('transform_object', { targets: cur.objects?.[0]?.id, op: 'move', x: 1, expected_scene_version: cur.scene_version + 5 }));
  const afterStale = await describe();
  check('stale expected_scene_version rejected', stale.ok === false && stale.code === 'stale_scene' && afterStale.scene_version === cur.scene_version, JSON.stringify(stale.error ?? ''));

  // Real pointer placement -> semantic layout -> selective undo -> redo.
  await badPage2.reload();
  await badPage2.waitForFunction(() => typeof window.__tool === 'function');
  await testQuality(badPage2);
  await run('frame_camera', { target: 'camp', angle: 'top', distance: 18, select: false });
  await badPage2.mouse.move(640, 360);
  await badPage2.mouse.down();
  // Keep a real multi-event drag without paying for twelve software-GPU frames.
  await badPage2.mouse.move(695, 370, { steps: process.env.CI ? 4 : 12 });
  await badPage2.mouse.up();
  const human = await describe();
  const camp = (j(await run('query_scene', { type: 'camp' })).result.objects)[0];
  check('mouse drag exposes selected camp and human edit', human.selected_id === camp.id && human.human_edits.some(e => e.id === camp.id), JSON.stringify(human.human_edits));
  const beforeLayout = (j(await run('query_scene', { limit: 200 })).result.objects);
  const layout = j(await run('arrange_scene', { anchor: camp.id, expected_scene_version: human.scene_version }));
  const afterLayout = (j(await run('query_scene', { limit: 200 })).result.objects);
  check('layout adapts scenery and preserves live human camp', layout.ok && layout.result.moved_ids.length > 5 && JSON.stringify(afterLayout.find(e => e.id === camp.id).pose) === JSON.stringify(camp.pose), JSON.stringify(layout));
  const changed = layout.result?.moved_ids ?? [];
  const laterId = changed[0];
  if (laterId) {
    await run('transform_object', { targets: laterId, op: 'move', x: 0.4, mode: 'relative' });
    const later = (j(await run('query_scene', { id_or_name: laterId })).result.objects)[0];
    await run('set_material', { targets: changed[1], color: '#774499' });
    const undoLayout = j(await run('undo_layout', {}));
    const undone = (j(await run('query_scene', { limit: 200 })).result.objects);
    check('selective undo keeps later edits and human camp', undoLayout.ok && undoLayout.result.skipped_ids.includes(laterId)
      && JSON.stringify(undone.find(e => e.id === laterId).pose) === JSON.stringify(later.pose)
      && JSON.stringify(undone.find(e => e.id === camp.id).pose) === JSON.stringify(camp.pose));
    check('selective undo restores layout positions but keeps materials',
      undone.filter(e => changed.includes(e.id) && e.id !== laterId).every(e => JSON.stringify(e.pose.p) === JSON.stringify(beforeLayout.find(b => b.id === e.id).pose.p))
      && undone.find(e => e.id === changed[1]).material.color === '#774499');
    const redoLayout = j(await run('redo_layout', {}));
    const redone = (j(await run('query_scene', { limit: 200 })).result.objects);
    check('redo reapplies only the reverted layout positions', redoLayout.ok
      && redone.filter(e => redoLayout.result.moved_ids.includes(e.id)).every(e => JSON.stringify(e.pose.p) === JSON.stringify(afterLayout.find(a => a.id === e.id).pose.p))
      && JSON.stringify(redone.find(e => e.id === laterId).pose) === JSON.stringify(later.pose));
  }
  const beforeInvalid = await describe();
  const invalidLayout = j(await run('arrange_scene', { clearance: -2 }));
  const afterInvalid = await describe();
  check('invalid layout is side-effect free', !invalidLayout.ok && beforeInvalid.scene_version === afterInvalid.scene_version && JSON.stringify(beforeInvalid.layout) === JSON.stringify(afterInvalid.layout));
  check('local harness reports demo provenance', layout.actor === 'demo');

  await collaborationChecks({ page: badPage2, run, describe, check, decodeScene });

  // Lofi is a cancellable background job; observing it must not steal its camera.
  const beforeLofi = await describe();
  const invalidLofi = j(await run('compose_lofi_scene', { build_seconds: -1 }));
  check('invalid lofi composition preserves the scene', !invalidLofi.ok && (await describe()).scene_version === beforeLofi.scene_version);
  const composition = j(await run('compose_lofi_scene', { build_seconds: 12, music: false, seed: 47 }));
  check('lofi starts as an observable background session', composition.ok && composition.result.status === 'building' && !!composition.result.session_id && composition.duration_ms < 4000);
  const competing = j(await run('add_object', { type: 'box' }));
  check('building rejects competing scene mutations', !competing.ok && competing.code === 'lofi_busy');
  await run('control_lofi', { action: 'pause' });
  const pausedLofi = await describe();
  await badPage2.waitForTimeout(250);
  const stillPaused = await describe();
  check('pause freezes the build and music', pausedLofi.lofi.status === 'paused' && stillPaused.lofi.elapsed_seconds === pausedLofi.lofi.elapsed_seconds && !stillPaused.music.requested);
  await run('control_lofi', { action: 'resume' });
  await badPage2.waitForFunction(() => document.getElementById('lofi-progress').value === 100, null, { timeout: process.env.CI ? 120_000 : 30_000, polling: 1000 });
  const builtLofi = await describe();
  check('lofi completes cabin pond forest light and continuous camera', builtLofi.counts.cabin === 1 && builtLofi.counts.pond === 1 && builtLofi.counts.tree === 26 && builtLofi.lofi.progress === 100 && builtLofi.camera_motion.status === 'running' && !builtLofi.music.requested, JSON.stringify(builtLofi.lofi));
  const motionBefore = await describe();
  // A software GPU can take seconds per frame. Observe real camera movement,
  // rather than assuming another frame has rendered after a fixed 400 ms.
  const motionDeadline = Date.now() + (process.env.CI ? 60_000 : 10_000);
  let motionAfter = motionBefore;
  const hasMoved = () => motionAfter.camera_motion.elapsed_seconds > motionBefore.camera_motion.elapsed_seconds
    && JSON.stringify(motionAfter.camera.p) !== JSON.stringify(motionBefore.camera.p);
  while (!hasMoved() && motionAfter.camera_motion.status === 'running' && Date.now() < motionDeadline) {
    await badPage2.waitForTimeout(500);
    motionAfter = await describe();
  }
  check('read-only observations leave continuous camera running', motionAfter.camera_motion.status === 'running' && hasMoved(), JSON.stringify({ before: motionBefore.camera_motion, after: motionAfter.camera_motion }));
  // Right-drag always controls the camera. Left-drag may hit a moving object's
  // silhouette and correctly add a human edit to the undo stack instead.
  await badPage2.mouse.move(800, 330); await badPage2.mouse.down({ button: 'right' }); await badPage2.mouse.move(815, 332, { steps: 3 }); await badPage2.mouse.up({ button: 'right' });
  const humanCamera = await describe();
  check('human pointer input pauses continuous camera', humanCamera.camera_motion.status === 'paused' && humanCamera.scene_version === motionAfter.scene_version, JSON.stringify({ camera: humanCamera.camera_motion, versionBefore: motionAfter.scene_version, versionAfter: humanCamera.scene_version }));
  await run('set_camera_motion', { action: 'resume' });
  check('camera can explicitly resume after human takeover', (await describe()).camera_motion.status === 'running');
  await run('control_lofi', { action: 'stop' });
  const stoppedLofi = await describe();
  await badPage2.waitForTimeout(200);
  const afterStop = await describe();
  check('stop cancels background construction camera and music', afterStop.lofi.status === 'stopped' && afterStop.camera_motion.status === 'stopped' && !afterStop.music.requested && afterStop.scene_version === stoppedLofi.scene_version);
  await run('undo', {});
  const restoredLofi = await describe();
  check('one undo restores the scene before lofi construction', restoredLofi.object_count === beforeLofi.object_count, JSON.stringify({ expected: beforeLofi.object_count, actual: restoredLofi.object_count }));
  const toCancel = j(await run('compose_lofi_scene', { build_seconds: 12, music: false }));
  await run('undo', {});
  await badPage2.waitForTimeout(300);
  const cancelledLofi = await describe();
  check('undo during construction prevents later object spawns', toCancel.ok && cancelledLofi.object_count === beforeLofi.object_count && cancelledLofi.lofi.status === 'stopped', JSON.stringify({ expected: beforeLofi.object_count, actual: cancelledLofi.object_count, lofi: cancelledLofi.lofi }));

  const grove = j(await run('compose_lofi_scene', { scene: 'lantern_grove', cycle: true, hold_seconds: 120, build_seconds: 12, music: false }));
  check('agents can choose an authored world and enable its sequence', grove.ok && grove.result.scene === 'lantern_grove'
    && grove.result.sequence.enabled && grove.result.sequence.length === 3 && grove.result.sequence.hold_seconds === 120);
  await badPage2.waitForFunction(() => document.getElementById('lofi-progress').value === 100, null, { timeout: process.env.CI ? 120_000 : 30_000, polling: 1000 });
  const completedGrove = await describe();
  check('lantern grove builds its distinct terrace and forest', completedGrove.counts.camp === 1 && completedGrove.counts.tree === 24
    && !completedGrove.counts.cabin && !completedGrove.counts.pond && completedGrove.lofi.status === 'playing', JSON.stringify(completedGrove.counts));
  await run('control_lofi', { action: 'next' });
  await run('control_lofi', { action: 'pause' });
  const pausedTransition = await describe();
  await badPage2.waitForTimeout(350);
  const stillTransition = await describe();
  check('pausing freezes an in-progress scene transition', pausedTransition.lofi.status === 'paused'
    && stillTransition.lofi.sequence.transition_opacity === pausedTransition.lofi.sequence.transition_opacity
    && stillTransition.object_count === pausedTransition.object_count);
  await run('control_lofi', { action: 'stop' });
  await badPage2.waitForTimeout(1800);
  const cancelledTransition = await describe();
  check('stopping cancels a queued world replacement', cancelledTransition.lofi.status === 'stopped'
    && cancelledTransition.lofi.scene === 'lantern_grove' && cancelledTransition.object_count === completedGrove.object_count);
  await run('undo', {});
  check('one undo restores the original scene after sequence controls', (await describe()).object_count === beforeLofi.object_count);

  await run('compose_lofi_scene', { scene: 'island_hideaway', build_seconds: 12, music: false });
  const nextIsland = j(await run('control_lofi', { action: 'next' }));
  check('next returns immediately with an observable transition', nextIsland.ok && nextIsland.result.lofi.status === 'transitioning');
  // This Playwright poll treats an async predicate's Promise as truthy. Await
  // tool observations in Node so Stop cannot race ahead of the actual change.
  const transitionDeadline = Date.now() + (process.env.CI ? 60_000 : 20_000);
  let nextArrival = await describe();
  const hasArrived = () => nextArrival.lofi.scene === 'lakeside_cabin' && nextArrival.lofi.status === 'building' && nextArrival.object_count > 0;
  while (!hasArrived() && Date.now() < transitionDeadline) {
    await badPage2.waitForTimeout(250);
    nextArrival = await describe();
  }
  const nextStopResult = j(await run('control_lofi', { action: 'stop' }));
  const nextStopped = await describe();
  await badPage2.waitForTimeout(250);
  const nextFrozen = await describe();
  check('next builds the following world and stop freezes it', hasArrived() && nextStopResult.ok && nextStopped.lofi.scene === 'lakeside_cabin'
    && nextFrozen.lofi.status === 'stopped' && nextFrozen.object_count === nextStopped.object_count,
    JSON.stringify({ arrived: nextArrival.lofi, stopped: nextStopped.lofi, countAtStop: nextStopped.object_count, countAfterStop: nextFrozen.object_count }));
  await run('undo', {});
  check('world transitions do not add extra undo captures', (await describe()).object_count === beforeLofi.object_count);

  await badPage2.setViewportSize({ width: 390, height: 844 });
  await badPage2.goto(BASE);
  await badPage2.waitForFunction(() => !document.querySelector('#webmcp-status').classList.contains('status-checking'));
  const phone = await badPage2.evaluate(() => {
    const controls = document.querySelector('#quiet-controls').getBoundingClientRect();
    const rail = document.querySelector('#tool-log').getBoundingClientRect();
    return {
      fits: document.documentElement.scrollWidth <= innerWidth && controls.left >= 0 && controls.right <= innerWidth && controls.bottom <= innerHeight,
      separated: controls.height > 0 && rail.height > 0 && rail.bottom < controls.top,
    };
  });
  check('mobile palette fits without activity overlap', phone.fits && phone.separated, JSON.stringify(phone));
  await badPage2.screenshot({ path: 'docs/diorama-mobile.png' });

  check('no shader compilation or asset errors', renderErrors.length === 0, renderErrors.join('\n'));
  const passCount = behavioral.filter((b2) => b2.pass).length;
  console.log(`\n[behavior] ${passCount}/${behavioral.length} semantic checks passed`);
  await badPage2.close();

  await browser.close();
  console.log(`\n${checked.filter(c => c.ok).length}/${names.length} tools verified`);
  writeFileSync('scripts/smoke-result.json', JSON.stringify({
    at: new Date().toISOString(),
    invocation: { verified: checked.filter(c => c.ok).length, total: names.length },
    behavior: { passed: passCount, total: behavioral.length, checks: behavioral },
  }, null, 2));
  process.exitCode = failures ? 1 : 0;
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  try {
    process.kill(-server.pid);
  } catch {
    /* preview already gone (ESRCH) — nothing to clean up */
  }
}
