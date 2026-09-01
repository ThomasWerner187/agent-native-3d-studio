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
  await page.waitForTimeout(15000);
  await page.screenshot({ path: '/tmp/show-act2-forest.png' }).catch(() => {});
  await page.waitForTimeout(20000); // t=35s
  await page.screenshot({ path: '/tmp/show-act4-dusk.png' }).catch(() => {});
  await page.waitForTimeout(20000); // t=55s
  await page.screenshot({ path: '/tmp/show-act5-signature.png' }).catch(() => {});
  for (const [i, t] of [[1, 61000], [2, 64000], [3, 67000], [4, 71000]]) {
    const wait = t - (61000 - 6000);
    await page.waitForTimeout(i === 1 ? 6000 : (t - (i === 2 ? 61000 : i === 3 ? 64000 : 67000)));
    await page.screenshot({ path: `/tmp/show-top-${i}.png` }).catch(() => {});
  }
  const stories = await page.evaluate(() => [...document.querySelectorAll('#tool-log-entries .story')].slice(0, 14).map(e => e.textContent));
  console.log('pageerrors:', errors.length);
  console.log(JSON.stringify(stories, null, 1));
  await context.close();
  await browser.close();
} finally {
  try { process.kill(-server.pid); } catch {}
}
