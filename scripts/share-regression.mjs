import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { decodeSceneLink, encodeSceneHash } from '../src/share-codec.ts';

const json = JSON.stringify({ schema_version: 2, name: 'Quiet forest — 夜の森', objects: Array.from({ length: 60 }, (_, i) => ({ id: `obj_${i}`, color: '#88aaff', p: [i, 0, 2] })) });
const hash = await encodeSceneHash(json);
assert(hash.startsWith('#scene=gz1.'));
assert.equal(await decodeSceneLink(`https://example.com/${hash}`), json);
assert(hash.length < Buffer.byteLength(json), 'Compression should reduce a normal scene link');
assert.equal(await decodeSceneLink(`#scene=${Buffer.from(json).toString('base64url')}`), json);
await assert.rejects(decodeSceneLink('#scene=gz2.abcd'), /unsupported/);
await assert.rejects(decodeSceneLink('#scene=gz1.YQ'));
const oversized = gzipSync(Buffer.alloc(4_000_001, 32)).toString('base64url');
await assert.rejects(decodeSceneLink(`#scene=gz1.${oversized}`), /4 MB size limit/);

// Execute the real asynchronous import handler. A version change or native
// cancellation during decoding must prevent its destructive restore step.
const bundled = await build({ entryPoints: [fileURLToPath(new URL('../src/tools.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false });
const { importScene } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
let restores = 0;
const context = { store: { version: 7 }, snapshots: { importJson() { restores++; return { ok: true, restored: 0 }; } } };
const pendingEdit = importScene(context, { url: hash });
context.store.version++;
assert.equal(JSON.parse(await pendingEdit).code, 'scene_changed_during_import');
assert.equal(restores, 0);
const controller = new AbortController();
const pendingAbort = importScene({ ...context, signal: controller.signal }, { url: hash });
controller.abort();
assert.equal(JSON.parse(await pendingAbort).code, 'cancelled');
assert.equal(restores, 0);
console.log(` ✓ versioned compressed shares, legacy links and bounded inflate (${json.length} → ${hash.length} characters)`);
console.log(' ✓ asynchronous imports preserve intervening edits and honor cancellation');
