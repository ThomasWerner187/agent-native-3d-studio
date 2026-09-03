// SYNTHETIC UNIT FIXTURE ONLY. No browser, API calls, capture files or media output.
// These tests protect proof integrity; their output is never native demo evidence.
import assert from 'node:assert/strict';
import { loadDemoPlan } from './demo-plan.mjs';
import { validateNativeCapture } from './demo-evidence.mjs';

const plan = loadDemoPlan();
const at = (clip, seconds) => plan.shots.find(shot => shot.id === clip).start + seconds;
const object = (id, type, actor, x, scale = 1) => ({ id, name: id, type, pose: { p: [x, 0, 0], ry: 0, s: scale }, created_by: actor, last_changed_by: actor, revision: 1, human_revision: actor === 'human' ? 1 : 0 });
const anchors = [object('pond', 'pond', 'human', -4), object('cabin', 'cabin', 'human', 4, [1, 1.2, 1])];
const trees = Array.from({ length: 40 }, (_, i) => object('tree_' + i, 'tree', 'agent', i + 10));
const lights = Array.from({ length: 8 }, (_, i) => object('lamp_' + i, 'lamp', 'agent', i - 20));
const stones = Array.from({ length: 7 }, (_, i) => object('rock_' + i, 'rock', 'agent', i - 10));
const forest = [...anchors, ...trees, ...lights], details = [...forest, ...stones];
const changed = structuredClone(details);
for (const id of ['rock_0', 'rock_1']) {
  const stone = changed.find(item => item.id === id);
  Object.assign(stone, { pose: { ...stone.pose, p: [stone.pose.p[0], 0, 1.2] }, last_changed_by: 'human', revision: 2, human_revision: 1 });
}
const event = (clip, seconds, tool, args, result) => ({ clip, source_seconds: at(clip, seconds), tool, args, result: { ok: true, actor: 'agent', result } });
const query = (clip, at, objects) => event(clip, at, 'query_scene', { limit: 200, include_bounds: true }, { objects: structuredClone(objects), total: objects.length, offset: 0, next_offset: null });
const action = (clip, seconds, kind, extra) => ({ clip, source_seconds: at(clip, seconds), kind, ...extra });
const fixture = {
  schema_version: 1, story_id: plan.story_id, capture_id: 'synthetic-unit-test-only', app_revision: 'abcdef0', page_url: 'https://example.test/',
  transport: 'native-webmcp', continuity: { single_page: true, scene_replacements: 0 }, anchors: { pond: 'pond', cabin: 'cabin' },
  path_object_ids: stones.map(item => item.id), moved_object_ids: ['rock_0', 'rock_1'],
  clips: plan.shots.map(shot => ({ id: shot.id, source_start_seconds: shot.start, source_end_seconds: shot.start + shot.duration, cuts: [] })),
  human_actions: [
    action('human_pond', 5, 'place', { id: 'pond' }), action('human_cabin', 2, 'place', { id: 'cabin' }),
    action('human_cabin', 5, 'request', { intent: 'forest', text: 'Add forty trees behind my cabin and warm garden lights.' }),
    action('agent_details', 1, 'request', { intent: 'path', text: 'Please add a curved stone path from our cabin to the pond.' }),
    action('human_move', 5, 'move', { id: 'rock_0' }), action('human_move', 10, 'move', { id: 'rock_1' }),
    action('atmosphere', 1, 'request', { intent: 'atmosphere', text: 'Cozy evening, music and an endless camera; hide the controls.' }),
  ],
  events: [
    event('human_cabin', 8, 'help', {}, { guide: 'Synthetic test guide' }), query('human_cabin', 12, anchors),
    event('agent_forest', 8, 'add_grove', { count: 40, lights: 8 }, { added: 40, live_added: 40, exact_count: true, ids: trees.map(item => item.id), light_ids: lights.map(item => item.id), rear_count: 32, side_count: 8, preserved_ids: ['pond', 'cabin'] }),
    query('agent_forest', 20, forest),
    event('agent_details', 6, 'add_path', {}, { added: 7, live_added: 7, exact_count: true, editable: true, ids: stones.map(item => item.id) }), query('agent_details', 14, details),
    query('agent_readback', 10, changed), event('agent_readback', 14, 'describe_scene', {}, { selected_id: 'rock_1', human_edits: [{ id: 'rock_0' }, { id: 'rock_1' }], recent_changes: [{ id: 'rock_0', actor: 'human' }, { id: 'rock_1', actor: 'human' }] }),
    event('atmosphere', 3, 'set_lighting', { preset: 'golden_hour' }, {}),
    event('atmosphere', 7, 'set_camera_motion', { action: 'start', mode: 'drift', targets: ['cabin', 'pond'], distance: 18, height: 7, loop_seconds: 240 }, { camera_motion: { status: 'running' } }),
    event('atmosphere', 11, 'set_ui', { visible: false }, { ui_visible: false }),
    event('atmosphere', 15, 'describe_scene', {}, { camera_motion: { status: 'running' }, music: { playing: true } }), query('atmosphere', 20, changed),
  ],
};
assert.equal(validateNativeCapture(fixture, plan).proof.grove.value.live_added, 40);
console.log('✓ synthetic fixture accepts the complete forty-tree, path and two-human-edit story');
let negativeCases = 0;
function reject(name, mutate) {
  const candidate = structuredClone(fixture), value = mutate(candidate) ?? candidate;
  assert.throws(() => validateNativeCapture(value, plan), name);
  negativeCases++;
  console.log('✓ rejects ' + name);
}
const find = (value, clip, tool = 'query_scene') => value.events.find(item => item.clip === clip && item.tool === tool);
reject('old montage arrays', () => []);
reject('harness URLs', value => { value.page_url += '?agent=1'; });
reject('changed human anchors', value => { find(value, 'agent_forest').result.result.objects[0].pose.p[0] += 1; });
reject('fewer than forty live trees', value => { find(value, 'agent_forest', 'add_grove').result.result.live_added = 39; });
reject('trees without a forest behind the cabin', value => { find(value, 'agent_forest', 'add_grove').result.result.rear_count = 10; });
reject('missing actual typed path request', value => { value.human_actions = value.human_actions.filter(action => action.intent !== 'path'); });
reject('only one edited stone', value => { value.moved_object_ids.pop(); });
reject('an edit without human provenance', value => { find(value, 'agent_readback').result.result.objects.find(item => item.id === 'rock_1').last_changed_by = 'agent'; });
reject('missing second human edit in agent readback', value => { find(value, 'agent_readback', 'describe_scene').result.result.human_edits.pop(); });
reject('a path that changes a previous object', value => { find(value, 'agent_details').result.result.objects.find(item => item.id === 'tree_0').pose.p[0] += 1; });
reject('zero uniform scale', value => { find(value, 'human_cabin').result.result.objects[0].pose.s = 0; });
reject('missing final object readback', value => { value.events = value.events.filter(item => !(item.clip === 'atmosphere' && item.tool === 'query_scene')); });
reject('local envelopes relabeled as native', value => { value.events[0].result.actor = 'demo'; });
reject('UI left visible', value => { find(value, 'atmosphere', 'set_ui').result.result.ui_visible = true; });
reject('music that is only queued', value => { find(value, 'atmosphere', 'describe_scene').result.result.music.playing = false; });
reject('wide camera that loses the intimate composition', value => { find(value, 'atmosphere', 'set_camera_motion').args.distance = 60; });
console.log(`Evidence validator: 1 positive fixture and ${negativeCases} negative cases passed. This is not a native recording.`);
