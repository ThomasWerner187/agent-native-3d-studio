import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'releases/netcup');
const site = resolve(output, 'site');
if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('Run npm run build first.');
mkdirSync(output, { recursive: true });
rmSync(site, { recursive: true, force: true });
mkdirSync(site);

// Copy only public runtime files. Netlify configuration is not interpreted by Plesk.
for (const entry of readdirSync(resolve(root, 'dist'))) {
  if (entry.startsWith('.') || entry === '_headers' || entry === '_redirects') continue;
  cpSync(resolve(root, 'dist', entry), resolve(site, entry), { recursive: true });
}
cpSync(resolve(root, 'deploy/netcup/.htaccess'), resolve(site, '.htaccess'));
const sourceRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const zip = resolve(output, 'studio-netcup-test.zip');
rmSync(zip, { force: true });
execFileSync('/usr/bin/zip', ['-qr', zip, '.'], { cwd: site });
const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
writeFileSync(resolve(output, 'studio-netcup-test.sha256'), `${digest}  studio-netcup-test.zip\n`);
writeFileSync(resolve(output, 'build.json'), `${JSON.stringify({ sourceRef, target: 'https://studio.wernerverse.de/', archive: 'studio-netcup-test.zip', sha256: digest }, null, 2)}\n`);
console.log(JSON.stringify({ site, zip, sourceRef, sha256: digest }, null, 2));
