import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Exercise the actual sequence and authored plans with a deterministic clock.
// Browser/GPU/native-tool behavior is covered by the separate smoke suite.
const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'scratch-lofi-regression-'));
try {
  const output = join(scratch, 'sequence.mjs');
  await build({
    stdin: { contents: "export { LofiSession } from './src/lofi.ts'; export * as THREE from 'three';", resolveDir: root },
    bundle: true, platform: 'node', format: 'esm', outfile: output,
    plugins: [{ name: 'silent-audio', setup(api) {
      api.onResolve({ filter: /^\.\/ambience$/ }, () => ({ path: 'audio', namespace: 'test' }));
      api.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: `
        let requested = false, volume = 0;
        export const musicState = () => ({ requested, playing: requested, volume, status: requested ? 'playing' : 'off' });
        export const isMusicOn = () => requested;
        export const setMusic = (on, value) => { requested = on; if (value != null) volume = value; return musicState(); };
        export const fadeMusic = value => { if (requested) volume = value; };
      ` }));
    } }],
  });
  globalThis.document = { hidden: false };
  let reduced = false;
  globalThis.matchMedia = () => ({ matches: reduced });
  const { LofiSession, THREE } = await import(pathToFileURL(output).href);

  function harness() {
    const entries = new Map(), callbacks = [];
    let id = 0, created = 0, disposed = 0;
    const store = {
      version: 0, humanRevision: 0, onClear: undefined, onHumanEdit: undefined,
      all: () => [...entries.values()], get: key => entries.get(key),
      bump() { return ++this.version; },
      clear() { this.onClear?.(); entries.clear(); id = 0; },
      spawn(type, opts) {
        const group = new THREE.Group(), material = new THREE.MeshStandardMaterial();
        material.addEventListener('dispose', () => disposed++);
        group.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), material));
        if (typeof opts.scale === 'number') group.scale.setScalar(opts.scale);
        else group.scale.set(opts.scale.x, opts.scale.y, opts.scale.z);
        const entry = { id: `obj_${++id}`, name: opts.name, type, humanRevision: 0, group, materials: [material] };
        entries.set(entry.id, entry); created++; return entry;
      },
    };
    const director = {
      status: 'stopped',
      get state() { return { status: this.status, mode: 'cinematic' }; },
      start() { this.status = 'running'; },
      pause() { if (this.status === 'running') this.status = 'paused'; },
      resume() { if (this.status !== 'paused') return false; this.status = 'running'; return true; },
      stop() { this.status = 'stopped'; },
    };
    const studio = {
      scene: new THREE.Scene(), camera: { aspect: 1.6 }, director,
      onFrame: callback => callbacks.push(callback), applyLighting() {}, flyTo() {}, invalidateShadows() {},
    };
    const session = new LofiSession(store, studio, () => {});
    return {
      session, store, studio, frame: seconds => callbacks.forEach(callback => callback(seconds)),
      get resources() { return { created, disposed, live: entries.size }; },
    };
  }
  const start = (h, args = {}) => {
    assert.equal(h.session.start({ build_seconds: 12, music: false, cycle: true, hold_seconds: 120, ...args }).ok, true);
  };

  const h = harness();
  start(h);
  h.frame(12);
  assert.equal(h.session.state.scene, 'lakeside_cabin');
  assert.equal(h.session.state.status, 'playing');
  assert.equal(h.session.state.sequence.completed, 1);
  const original = h.store.all()[0];
  h.frame(119.9);
  assert.equal(h.session.state.status, 'playing');
  h.frame(0.1);
  assert.equal(h.session.state.status, 'transitioning');
  h.frame(1.49);
  assert.equal(h.store.all()[0], original, 'Do not replace before the dark midpoint');
  h.frame(0.02);
  assert.equal(h.session.state.scene, 'lantern_grove');
  assert.equal(h.store.all()[0].type, 'camp');
  assert.ok(h.session.state.sequence.transition_opacity > 0.98);
  h.frame(1.49); h.frame(12);
  assert.equal(h.session.state.status, 'playing');
  assert.equal(h.session.state.sequence.completed, 2);
  h.session.humanTakeover();
  const paused = h.session.state;
  h.frame(1000);
  assert.equal(h.session.state.status, 'paused');
  assert.equal(h.session.state.sequence.remaining_seconds, paused.sequence.remaining_seconds);
  assert.equal(h.studio.director.state.status, 'paused');
  assert.equal(h.session.resume(), true);
  h.frame(120);
  assert.equal(h.session.state.status, 'transitioning');
  h.session.stop();
  const stopped = h.store.all()[0];
  h.frame(1000);
  assert.equal(h.session.state.status, 'stopped');
  assert.equal(h.session.state.sequence.transition_opacity, 0);
  assert.equal(h.store.all()[0], stopped, 'Stop must cancel a pending replacement');

  const hidden = harness();
  start(hidden, { scene: 'island_hideaway' });
  document.hidden = true; hidden.frame(1000);
  assert.equal(hidden.session.state.elapsed_seconds, 0);
  document.hidden = false; hidden.frame(12);
  document.hidden = true; hidden.frame(1000);
  assert.equal(hidden.session.state.sequence.remaining_seconds, 120);
  document.hidden = false; hidden.frame(120);
  document.hidden = true; hidden.frame(1000);
  assert.equal(hidden.session.state.sequence.transition_opacity, 0);
  document.hidden = false; hidden.frame(1);
  const transitionBefore = hidden.session.state.sequence.transition_opacity;
  assert.ok(transitionBefore > 0, 'The running transition must be visible');
  hidden.session.pause();
  assert.equal(hidden.session.state.sequence.transition_opacity, 0, 'Pause must reveal the editable scene');
  hidden.frame(1000);
  assert.equal(hidden.session.state.scene, 'island_hideaway');
  assert.equal(hidden.session.state.sequence.transition_opacity, 0);
  hidden.session.resume();
  assert.equal(hidden.session.state.sequence.transition_opacity, transitionBefore);
  hidden.frame(2);
  assert.equal(hidden.session.state.scene, 'lakeside_cabin');

  const edited = harness();
  start(edited); edited.frame(12);
  const preserved = edited.store.all()[0];
  edited.store.bump(); edited.frame(0.1); edited.frame(1000);
  assert.equal(edited.session.state.status, 'paused');
  assert.equal(edited.store.all()[0], preserved, 'Unrelated edits must prevent automatic scene replacement');
  assert.equal(edited.session.next(), true, 'Explicit next authorizes replacement after an edit');
  edited.frame(3); edited.frame(12);
  assert.equal(edited.session.state.scene, 'lantern_grove');

  const bounded = harness();
  start(bounded); bounded.frame(12);
  for (let cycle = 0; cycle < 12; cycle++) {
    bounded.frame(120); bounded.frame(3); bounded.frame(12);
    const resources = bounded.resources;
    assert.ok(resources.live <= 48);
    assert.equal(resources.created - resources.disposed, resources.live, 'Every replaced object must be disposed');
    assert.equal(bounded.studio.scene.children.length, resources.live, 'No abandoned groups may remain in the scene');
  }
  assert.equal(bounded.session.state.sequence.completed, 13);

  reduced = true;
  const still = harness();
  start(still); still.frame(12);
  assert.equal(still.studio.director.state.status, 'stopped');
  assert.equal(still.session.next(), true);
  assert.equal(still.session.state.scene, 'lantern_grove');
  assert.equal(still.session.state.status, 'building');
  assert.equal(still.session.state.sequence.transition_opacity, 0);
  still.frame(12);
  assert.equal(still.studio.director.state.status, 'stopped');

  const invalid = harness();
  for (const args of [{ scene: 'missing' }, { hold_seconds: 119 }, { hold_seconds: 1801 }, { cycle: 'yes' }]) {
    assert.equal(invalid.session.start(args).ok, false);
    assert.equal(invalid.resources.created, 0);
  }
  console.log('Lofi sequence regression passed: authored scenes, hold boundary, pause/hidden/stop, edit preservation, 12 bounded cycles, reduced motion, input validation.');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
