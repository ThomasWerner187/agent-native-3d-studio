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
  return page;
}
async function testQuality(page) {
  // Same scene and tool contract; CI has no hardware GPU for post-processing.
  if (process.env.CI) await page.getByRole('button', { name: 'Cinematic', exact: true }).click();
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
    r.scatter = await window.__call('scatter', { type: 'rock', count: 2, area: { center_x: 4, center_z: 4, width: 4, depth: 4 }, seed: 42 });
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

  // --- corrupted share link must never take the page down (boot path) -------
  await page.close(); // Release this renderer before allocating another one.
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
  const behavioral = [];
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
  const decodeScene = url => JSON.parse(Buffer.from(url.split('#scene=')[1], 'base64url').toString('utf8'));
  check('scene links preserve every material and lantern light', JSON.stringify(decodeScene(shareUrl).objects) === JSON.stringify(decodeScene(exportedAgain.result.url).objects));

  // invalid calls never mutate the scene
  const d5 = await describe();
  const bad1 = j(await run('add_object', { type: 'unicorn' }));
  const bad2 = j(await run('transform_object', { targets: 'obj_9999', op: 'move', x: 1 }));
  const bad3 = j(await run('chess_move', { piece: 'obj_1', to: 'zz' }));
  const d6 = await describe();
  check('invalid calls fail without mutating', bad1.ok === false && bad2.ok === false && bad3.ok === false && d6.object_count === d5.object_count && d6.scene_version === d5.scene_version);

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
  await badPage2.mouse.move(695, 370, { steps: 12 });
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

  await badPage2.setViewportSize({ width: 390, height: 844 });
  await badPage2.goto(BASE);
  await badPage2.waitForFunction(() => !document.querySelector('#webmcp-status').classList.contains('status-checking'));
  const phone = await badPage2.evaluate(() => {
    const intro = document.querySelector('.scene-intro').getBoundingClientRect();
    const rail = document.querySelector('#tool-log').getBoundingClientRect();
    return { fits: document.documentElement.scrollWidth <= innerWidth, separated: intro.bottom <= rail.top };
  });
  check('mobile controls fit without intro overlap', phone.fits && phone.separated, JSON.stringify(phone));
  await badPage2.screenshot({ path: 'docs/diorama-mobile.png' });

  const passCount = behavioral.filter((b2) => b2.pass).length;
  console.log(`\n[behavior] ${passCount}/${behavioral.length} semantic checks passed`);
  await badPage2.close();

  await browser.close();
  console.log(`\n${names.length - failures}/${names.length} tools verified`);
  writeFileSync('scripts/smoke-result.json', JSON.stringify({
    at: new Date().toISOString(),
    invocation: { verified: names.length - failures, total: names.length },
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
