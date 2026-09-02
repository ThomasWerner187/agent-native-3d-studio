import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
const server = spawn('npx', ['vite', 'preview', '--port', '4196', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise(r => setTimeout(r, 1600));
try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: '/tmp/studio-show', size: { width: 1280, height: 800 } } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:4196/?agent=1');
  await page.waitForFunction(() => typeof window.__tool === 'function', null, { timeout: 10000 });
  await page.click('#show-agent');
  const captureCue = async (title, path, extraMs = 0) => {
    await page.waitForFunction((expected) => document.querySelector('#show-cue-title')?.textContent === expected, title, { timeout: 90000 });
    if (extraMs) await page.waitForTimeout(extraMs);
    await page.screenshot({ path }).catch(() => {});
  };
  await captureCue('Planting the impossible shortcut.', '/tmp/show-act2-forest.png');
  await captureCue('Now make it cinematic.', '/tmp/show-act4-dusk.png');
  await captureCue('The canvas has entered the chat.', '/tmp/show-act5-signature.png', 4500);
  await captureCue('Twenty tools. Zero cloud drama.', '/tmp/show-finale-top.png', 800);
  await captureCue('Your move.', '/tmp/show-human-handoff.png', 500);
  const signature = await page.evaluate(async () => {
    const [openai, webmcp] = await Promise.all([
      window.__tool('query_scene', { name_contains: 'OPENAI px', limit: 200 }),
      window.__tool('query_scene', { name_contains: 'WEBMCP px', limit: 200 }),
    ]);
    return { openai: JSON.parse(openai), webmcp: JSON.parse(webmcp) };
  });
  const stories = await page.evaluate(() => [...document.querySelectorAll('#tool-log-entries .story')].slice(0, 14).map(e => e.textContent));
  console.log('pageerrors:', errors.length);
  console.log('signature:', JSON.stringify({
    openai: signature.openai.result?.total,
    webmcp: signature.webmcp.result?.total,
    final_cue: await page.locator('#show-cue-title').textContent(),
  }));
  console.log(JSON.stringify(stories, null, 1));
  await context.close();
  await browser.close();
} finally {
  try { process.kill(-server.pid); } catch {}
}
