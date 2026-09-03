import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'releases/netcup');
const site = resolve(output, 'site');
const archive = 'studio-zen-final.zip';
const sourceRef = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const publicEntry = (name) => !name.startsWith('.') && name !== '_headers' && name !== '_redirects';

if (!existsSync(resolve(root, 'dist/index.html'))) throw new Error('Run npm run build first.');
mkdirSync(output, { recursive: true });
rmSync(site, { recursive: true, force: true });
mkdirSync(site);

// Copy public runtime files only. The live Plesk protection and server headers
// belong to the existing .htaccess and must survive every application upload.
for (const entry of readdirSync(resolve(root, 'dist'))) {
  if (!publicEntry(entry)) continue;
  cpSync(resolve(root, 'dist', entry), resolve(site, entry), {
    recursive: true,
    filter: (file) => relative(resolve(root, 'dist'), file).split('/').every(publicEntry),
  });
}

function inventory(directory) {
  return readdirSync(directory).sort().flatMap((name) => {
    const file = resolve(directory, name);
    if (statSync(file).isDirectory()) return inventory(file);
    return [{ path: relative(site, file), bytes: statSync(file).size, sha256: digest(file) }];
  });
}

const files = inventory(site);
if (files.some(({ path }) => path.split('/').some((part) => !publicEntry(part)))) {
  throw new Error('The archive contains a hidden or host-specific configuration file.');
}
const zip = resolve(output, archive);
rmSync(zip, { force: true });
execFileSync('/usr/bin/zip', ['-Xq', zip, ...files.map(({ path }) => path)], { cwd: site });
const sha256 = digest(zip);
const manifest = {
  sourceRef,
  target: 'https://studio.wernerverse.de/',
  documentRoot: 'studio.wernerverse.de/httpdocs',
  archive,
  sha256,
  preservesExistingServerConfiguration: true,
  excluded: ['.htaccess', 'all hidden files', '_headers', '_redirects'],
  files,
};
writeFileSync(resolve(output, 'studio-zen-final.sha256'), `${sha256}  ${archive}\n`);
writeFileSync(resolve(output, 'build.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ site, zip, sourceRef, sha256, files: files.length }, null, 2));
