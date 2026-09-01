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

  await browser.close();
  console.log(`\n${names.length - failures}/${names.length} tools verified`);
  writeFileSync('scripts/smoke-result.json', JSON.stringify({ at: new Date().toISOString(), verified: names.length - failures, total: names.length }, null, 2));
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
