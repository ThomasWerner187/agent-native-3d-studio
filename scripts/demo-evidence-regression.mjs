// SYNTHETIC UNIT FIXTURE ONLY. No browser, API calls, capture files or media output.
// This verifies the evidence validator; it is never native proof for the demo.
import assert from 'node:assert/strict';
import { loadDemoPlan } from './demo-plan.mjs';
import { validateNativeCapture } from './demo-evidence.mjs';

const plan = loadDemoPlan();
const object = (id, type, actor, x, scale = 1) => ({ id, name: id, type, pose: { p: [x, 0, 0], ry: 0, s: scale }, created_by: actor, last_changed_by: actor, revision: 1, human_revision: actor === 'human' ? 1 : 0 });
const anchors = [object('pond', 'pond', 'human', -4), object('cabin', 'cabin', 'human', 4, [1, 1.2, 1])];
const trees = Array.from({ length: 30 }, (_, i) => object('tree_' + i, 'tree', 'agent', i + 10));
const details = [...anchors, ...trees, ...Array.from({ length: 6 }, (_, i) => object('rock_' + i, 'rock', 'agent', i - 10)), ...Array.from({ length: 4 }, (_, i) => object('lamp_' + i, 'lamp', 'agent', i - 20))];
const changed = structuredClone(details);
Object.assign(changed.find(item => item.id === 'tree_0'), { pose: { p: [12, 0, 3], ry: 0, s: 1 }, last_changed_by: 'human', revision: 2, human_revision: 1 });
const event = (clip, source_seconds, tool, args, result) => ({ clip, source_seconds, tool, args, result: { ok: true, actor: 'agent', result } });
const query = (clip, at, objects) => event(clip, at, 'query_scene', { limit: 200, include_bounds: true }, { objects: structuredClone(objects), total: objects.length, offset: 0, next_offset: null });
const fixture = {
  schema_version: 1, story_id: plan.story_id, capture_id: 'synthetic-unit-test-only', app_revision: 'abcdef0', page_url: 'https://example.test/',
  transport: 'native-webmcp', continuity: { single_page: true, scene_replacements: 0 }, anchors: { pond: 'pond', cabin: 'cabin' }, moved_object_id: 'tree_0',
  clips: plan.shots.map(shot => ({ id: shot.id, source_start_seconds: shot.start, source_end_seconds: shot.start + shot.duration, cuts: [] })),
  human_actions: [
    { clip: 'human_pond', source_seconds: 5, kind: 'place', id: 'pond' },
    { clip: 'human_cabin', source_seconds: 14, kind: 'place', id: 'cabin' },
    { clip: 'human_move', source_seconds: 78, kind: 'move', id: 'tree_0' },
  ],
  events: [
    event('human_cabin', 15, 'help', {}, { guide: 'Synthetic test guide' }), query('human_cabin', 28, anchors),
    event('agent_forest', 33, 'scatter', { type: 'tree', count: 30 }, { added: 30, live_added: 30, exact_count: true, ids: trees.map(item => item.id), preserved_ids: ['pond', 'cabin'] }),
    query('agent_forest', 50, [...anchors, ...trees]),
    event('agent_details', 58, 'scatter', { type: 'rock', count: 6 }, { added: 6 }), event('agent_details', 61, 'scatter', { type: 'lamp', count: 4 }, { added: 4 }),
    query('agent_details', 69, details), query('agent_readback', 100, changed),
    event('agent_readback', 101, 'describe_scene', {}, { selected_id: 'tree_0', human_edits: [{ id: 'tree_0' }], recent_changes: [{ id: 'tree_0', actor: 'human' }] }),
    event('atmosphere', 112, 'set_lighting', { preset: 'moonlit' }, {}), event('atmosphere', 115, 'set_camera_motion', { action: 'start' }, { camera_motion: { status: 'running' } }),
    event('atmosphere', 123, 'describe_scene', {}, { camera_motion: { status: 'running' }, music: { playing: true } }), query('atmosphere', 127, changed),
  ],
};

assert.equal(validateNativeCapture(fixture, plan).proof.scatter.value.live_added, 30);
console.log('✓ synthetic unit fixture accepts actual query scalar and non-uniform scale shapes');
let negativeCases = 0;
function reject(name, mutate) {
  const candidate = structuredClone(fixture);
  const value = mutate(candidate) ?? candidate;
  assert.throws(() => validateNativeCapture(value, plan), name);
  negativeCases++;
  console.log('✓ rejects ' + name);
}
reject('old montage arrays', () => []);
reject('harness URLs', value => { value.page_url += '?agent=1'; });
reject('changed human anchors', value => { value.events.find(item => item.clip === 'agent_forest' && item.tool === 'query_scene').result.result.objects[0].pose.p[0] += 1; });
reject('fewer than 30 live trees', value => { value.events.find(item => item.tool === 'scatter').result.result.live_added = 29; });
reject('an edit without human provenance', value => { value.events.find(item => item.clip === 'agent_readback' && item.tool === 'query_scene').result.result.objects.find(item => item.id === 'tree_0').last_changed_by = 'agent'; });
reject('zero uniform scale', value => { value.events.find(item => item.tool === 'query_scene').result.result.objects[0].pose.s = 0; });
reject('missing complete readbacks', value => { value.events = value.events.filter(item => !(item.clip === 'atmosphere' && item.tool === 'query_scene')); });
reject('local envelopes relabeled as native', value => { value.events[0].result.actor = 'demo'; });
console.log('Evidence validator: 1 positive actual-shape fixture and ' + negativeCases + ' negative cases passed. This is not a native recording.');
