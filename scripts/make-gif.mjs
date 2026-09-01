/**
 * One-shot README GIF generator: records a scripted agent run (batch-built
 * tree avenue + golden hour + cinematic camera flight) and converts it to
 * docs/demo.gif.  Usage: node scripts/make-gif.mjs   (needs ffmpeg)
 */
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { spawn } from 'node:child_process';

const PORT = 4198;
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 1600));

try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 960, height: 600 }, recordVideo: { dir: '/tmp/studio-gif', size: { width: 960, height: 600 } } });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/?agent=1`);
  await page.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: 10_000 });
  await page.waitForTimeout(2500); // let the starter scene breathe

  await page.evaluate(async () => {
    await window.__tool('batch', {
      ops: [
        { tool: 'add_object', args: { type: 'tree', position: { x: -1.2, z: -1 }, scale: 1.3, name: 'avenue 1' } },
        { tool: 'add_object', args: { type: 'tree', position: { x: 1.4, z: -1.2 }, scale: 1.1, name: 'avenue 2' } },
        { tool: 'add_object', args: { type: 'tree', position: { x: -1.6, z: -2.6 }, scale: 1.5, name: 'avenue 3' } },
        { tool: 'add_object', args: { type: 'tree', position: { x: 1.8, z: -2.8 }, scale: 1.2, name: 'avenue 4' } },
        { tool: 'add_object', args: { type: 'tree', position: { x: -2.1, z: -4.2 }, scale: 1.6, name: 'avenue 5' } },
        { tool: 'add_object', args: { type: 'tree', position: { x: 2.3, z: -4.4 }, scale: 1.4, name: 'avenue 6' } },
        { tool: 'set_lighting', args: { preset: 'golden_hour' } },
      ],
    });
  });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    await window.__tool('camera_path', {
      keyframes: [
        { target: 'scene', angle: 'front', focal_length: 40 },
        { target: 'scene', angle: 'low', focal_length: 35 },
        { target: 'scene', angle: 'three_quarter', focal_length: 45, hold_ms: 400 },
        { target: 'scene', angle: 'hero', focal_length: 55 },
      ],
    });
  });
  await page.waitForTimeout(2500);
  await context.close(); // finalize the video file
  await browser.close();

  const webm = spawnSync('ls', ['/tmp/studio-gif'], { encoding: 'utf8' }).stdout.trim().split('\n').pop();
  const vf = 'fps=12,scale=560:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4';
  const r = spawnSync('ffmpeg', ['-y', '-i', `/tmp/studio-gif/${webm}`, '-vf', vf, '-loop', 0, 'docs/demo.gif'], { stdio: 'inherit' });
  console.log(r.status === 0 ? 'docs/demo.gif written' : 'ffmpeg failed');
} finally {
  process.kill(-server.pid);
}
