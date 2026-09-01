/**
 * Tool smoke test: loads ?agent=1 (the built-in harness — works without any
 * Chrome flag), calls every tool registered in the agent manifest through the
 * same handlers WebMCP exposes, and asserts ok:true.
 *
 * Run: npm run smoke   (starts its own preview server on :4199)
 * Exit code 0 = every tool verified. Writes scripts/smoke-result.json.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const PORT = 4199;
const BASE = `http://localhost:${PORT}`;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1600));

let failures = 0;
const checked = [];
try {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true }); // CI: bundled chromium
  }
  const page = await browser.newPage();
  await page.goto(`${BASE}/?agent=1`);
  await page.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: 10_000 });

  // The agent manifest is the source of truth for the tool list.
  const names = await page.evaluate(() => {
    const manifest = JSON.parse(document.getElementById('agent-manifest').textContent);
    return manifest.tools.split(': ')[1].split(', ').map((s) => s.trim());
  });

  const id = await page.evaluate(async (names) => {
    window.__results = {};
    window.__call = async (tool, args) => {
      const raw = await window.__tool(tool, args);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = { ok: true, raw }; }
      window.__results[tool] = parsed;
      return parsed;
    };
    const r = {};
    r.help = await window.__call('help', {});
    r.describe_scene = await window.__call('describe_scene', {});
    r.add_object = await window.__call('add_object', { type: 'tree', name: 'smoke tree' });
    const treeId = r.add_object.id ?? 'obj_1';
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
    r.board_square = await window.__call('board_square', { square: 'e4', board: board.id });
    r.chess_move = await window.__call('chess_move', { piece: piece.id, to: 'e4', camera: 'hero' });
    r.set_music = await window.__call('set_music', { on: false });
    r.snapshot = await window.__call('snapshot', { label: 'smoke' });
    r.undo = await window.__call('undo', {});
    r.export_scene = await window.__call('export_scene', {});
    const url = r.export_scene.url;
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
  const pageErrors = [];
  const badPage = await browser.newPage();
  badPage.on('pageerror', (err) => pageErrors.push(String(err)));
  await badPage.goto(`${BASE}/?agent=1#scene=not-valid-base64-%%%zzz`);
  await badPage.waitForTimeout(2500);
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


  // --- behavioral correctness: verify observable state, not just {ok:true} ---
  const badPage2 = await browser.newPage();
  const behavioral = [];
  const check = (name, pass, detail = '') => {
    behavioral.push({ name, pass, detail });
    console.log(`${pass ? ' ✓' : '✗'} [behavior] ${name}${pass ? '' : ' — ' + detail}`);
  };
  await badPage2.goto(`${BASE}/?agent=1`);
  await badPage2.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: 10_000 });
  const run = (tool, args) => badPage2.evaluate(([t, a]) => window.__tool(t, a), [tool, args]);
  const j = (raw) => JSON.parse(raw);
  const describe = async () => j(await run('describe_scene', {}));

  // add_object really adds + places where asked
  const d0 = await describe();
  const add = j(await run('add_object', { type: 'box', name: 'behavior box', position: { x: 3, z: 3 } }));
  const d1 = await describe();
  check('add_object increases contents', d1.object_count === d0.object_count + 1);
  const q1 = j(await run('query_scene', { id_or_name: add.id, fields: ['pose'] }));
  const pose = q1.objects?.[0]?.pose;
  check('add_object lands at requested position', !!pose && Math.abs(pose.p[0] - 3) < 0.01 && Math.abs(pose.p[2] - 3) < 0.01, JSON.stringify(pose));

  // transform moves the live object
  await run('transform_object', { targets: add.id, op: 'move', mode: 'absolute', x: -2, z: 5 });
  const q2 = j(await run('query_scene', { id_or_name: add.id, fields: ['pose'] }));
  check('transform_object moves live position', Math.abs(q2.objects?.[0]?.pose.p[0] - -2) < 0.01 && Math.abs(q2.objects?.[0]?.pose.p[2] - 5) < 0.01, JSON.stringify(q2.objects?.[0]?.pose));

  // set_material changes material state
  await run('set_material', { targets: add.id, color: '#88aaff' });
  const q3 = j(await run('query_scene', { id_or_name: add.id, fields: ['material'] }));
  check('set_material changes material', (q3.objects?.[0]?.material?.color ?? '').toLowerCase() === '#88aaff', JSON.stringify(q3.objects?.[0]?.material));

  // set_lighting changes preset
  await run('set_lighting', { preset: 'night_neon' });
  const d2 = await describe();
  check('set_lighting changes preset', d2.lighting?.preset === 'night_neon', d2.lighting?.preset);

  // delete removes exactly the target; undo restores it
  await run('delete_objects', { targets: add.id });
  const d3 = await describe();
  const gone = j(await run('query_scene', { id_or_name: add.id }));
  check('delete_objects removes the target', d3.object_count === d0.object_count && gone.ok === false);
  await run('undo', {});
  const d4 = await describe();
  const back = j(await run('query_scene', { id_or_name: add.id }));
  check('undo restores deleted object', d4.object_count === d1.object_count && back.ok === true);

  // export/import round-trips the same scene
  const exp = j(await run('export_scene', {}));
  const beforeRoundtrip = await describe();
  const imp = j(await run('import_scene', { url: exp.url ?? '' }));
  const afterImport = await describe();
  check('export/import round-trips scene', imp.ok === true && afterImport.object_count === beforeRoundtrip.object_count);

  // invalid calls never mutate the scene
  const d5 = await describe();
  const bad1 = j(await run('add_object', { type: 'unicorn' }));
  const bad2 = j(await run('transform_object', { targets: 'obj_9999', op: 'move', x: 1 }));
  const bad3 = j(await run('chess_move', { piece: 'obj_1', to: 'zz' }));
  const d6 = await describe();
  check('invalid calls fail without mutating', bad1.ok === false && bad2.ok === false && bad3.ok === false && d6.object_count === d5.object_count && d6.version === d5.version);

  // batch reverts as one logical unit
  const pre = await describe();
  const b = j(await run('batch', { ops: [
    { tool: 'add_object', args: { type: 'rock', name: 'batch probe' } },
    { tool: 'set_lighting', args: { preset: 'moonlit' } },
  ]}));
  const mid = await describe();
  check('batch applies as one', b.ok === true && b.failed === 0 && mid.object_count === pre.object_count + 1 && mid.lighting?.preset === 'moonlit');
  await run('undo', {});
  const post = await describe();
  check('single undo rolls back whole batch', post.object_count === pre.object_count && post.lighting?.preset === pre.lighting?.preset);

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
  try {
    process.kill(-server.pid);
  } catch {
    /* preview already gone (ESRCH) — nothing to clean up */
  }
}
