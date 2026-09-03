// Validate recorded continuity. These checks do not manufacture native evidence;
// the original browser footage and tool responses must still be reviewed.
export function decodeToolResult(value) {
  for (let i = 0; i < 7; i++) {
    if (typeof value === 'string') { value = JSON.parse(value); continue; }
    const text = value?.content?.find(item => item.type === 'text');
    if (text) { value = text.text; continue; }
    if (value && value.ok === undefined && value.result) { value = value.result; continue; }
    if (value && typeof value === 'object') return value;
    break;
  }
  throw new Error('Cannot decode the recorded native tool result.');
}

export function clipTime(clip, sourceSeconds) {
  const removed = clip.cuts.reduce((sum, cut) => sum + Math.max(0, Math.min(sourceSeconds, cut.end) - cut.start), 0);
  return sourceSeconds - clip.source_start_seconds - removed;
}

export function validateCaptureTimeline(capture, plan) {
  if (capture?.schema_version !== 1 || capture.story_id !== plan.story_id || typeof capture.capture_id !== 'string' || !capture.capture_id.trim() ||
    !/^[a-f0-9]{7,40}$/.test(capture.app_revision || '') || capture.transport !== 'native-webmcp' ||
    capture.continuity?.single_page !== true || capture.continuity?.scene_replacements !== 0) {
    throw new Error('Capture must identify this story, one native page session, its application revision and zero scene replacements. Old montage evidence is not accepted.');
  }
  let url;
  try { url = new URL(capture.page_url); } catch { throw new Error('Capture needs its actual page URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.searchParams.has('agent') || url.hash) {
    throw new Error('Capture must use the clean native page URL, without a developer harness or imported scene hash.');
  }
  if (!Array.isArray(capture.clips) || capture.clips.length !== plan.shots.length) throw new Error('Every planned shot needs its recorded source range.');
  let previousEnd;
  return capture.clips.map((clip, i) => {
    const shot = plan.shots[i];
    if (clip.id !== shot.id || !Number.isFinite(clip.source_start_seconds) || !Number.isFinite(clip.source_end_seconds) || clip.source_start_seconds < 0 ||
      clip.source_end_seconds <= clip.source_start_seconds || (previousEnd !== undefined && Math.abs(clip.source_start_seconds - previousEnd) > 0.05)) {
      throw new Error(`Invalid or discontinuous source range for ${shot.id}. Record all omitted waiting time as cuts.`);
    }
    const cuts = clip.cuts ?? [];
    if (!Array.isArray(cuts)) throw new Error(`Invalid cuts for ${shot.id}.`);
    let cutEnd = clip.source_start_seconds;
    for (const cut of cuts) {
      if (cut.reason !== 'agent_wait' || !Number.isFinite(cut.start) || !Number.isFinite(cut.end) || cut.start < cutEnd || cut.end <= cut.start || cut.end > clip.source_end_seconds) {
        throw new Error(`Invalid waiting-time cut for ${shot.id}.`);
      }
      cutEnd = cut.end;
    }
    const normalized = { ...clip, cuts };
    if (Math.abs(clipTime(normalized, clip.source_end_seconds) - shot.duration) > 0.05) throw new Error(`Recorded source minus waiting cuts must equal ${shot.duration}s for ${shot.id}.`);
    previousEnd = clip.source_end_seconds;
    return normalized;
  });
}

const objectPose = object => {
  if (!object) return null;
  const pose = object.pose || object;
  return { p: pose.p, ry: pose.ry, s: Array.isArray(pose.s) ? pose.s : [pose.s, pose.s, pose.s] };
};
const samePose = (a, b) => !!a && !!b && JSON.stringify(objectPose(a)) === JSON.stringify(objectPose(b));

export function validateNativeCapture(capture, plan) {
  const clips = validateCaptureTimeline(capture, plan);
  const byClip = new Map(clips.map(clip => [clip.id, clip]));
  const check = (condition, message) => { if (!condition) throw new Error(`Native continuity evidence: ${message}`); };
  const inClip = (record) => {
    const clip = byClip.get(record.clip);
    check(clip && Number.isFinite(record.source_seconds) && record.source_seconds >= clip.source_start_seconds && record.source_seconds <= clip.source_end_seconds,
      `invalid source timestamp in ${record.clip}`);
    check(!clip.cuts.some(cut => record.source_seconds >= cut.start && record.source_seconds < cut.end), 'a required action/result cannot be hidden inside a waiting-time cut');
    return { ...record, t: clipTime(clip, record.source_seconds) };
  };
  check(Array.isArray(capture.events) && capture.events.length > 0, 'record the original native requests and responses');
  let previous = -1;
  const records = capture.events.map(event => {
    const envelope = decodeToolResult(event.result);
    check(envelope.actor === 'agent' && typeof envelope.ok === 'boolean', 'tool responses must retain their native agent envelope');
    check(event.source_seconds >= previous, 'events must retain source chronology');
    previous = event.source_seconds;
    const replacesScene = tool => ['compose_lofi_scene', 'import_scene', 'undo'].includes(tool);
    check(!(envelope.ok && (replacesScene(event.tool) || (event.tool === 'control_lofi' && event.args?.action === 'next') ||
      (event.tool === 'batch' && event.args?.ops?.some(op => replacesScene(op.tool))))), 'a scene replacement interrupts this story');
    return { ...inClip(event), envelope, value: envelope.result || {} };
  });
  const successful = records.filter(event => event.envelope.ok);
  const find = (clip, tool, predicate = () => true) => successful.find(event => event.clip === clip && event.tool === tool && predicate(event));
  const readback = clip => {
    const event = successful.findLast(event => event.clip === clip && event.tool === 'query_scene' && Array.isArray(event.value.objects));
    check(event, `${clip} needs a native query_scene containing full object poses and provenance`);
    check(!event.args?.type && !event.args?.name_contains && !event.args?.id_or_name && !(event.args?.offset > 0) &&
      event.value.total === event.value.objects.length && event.value.next_offset == null, `${clip} needs a complete, unfiltered object readback`);
    check(event.value.objects.every(object => {
      const pose = objectPose(object);
      return typeof object.id === 'string' && pose?.p?.length === 3 && pose.p.every(Number.isFinite) &&
        pose.s?.length === 3 && pose.s.every(value => Number.isFinite(value) && value > 0) && Number.isFinite(pose.ry) && Number.isInteger(object.human_revision);
    }), `${clip} needs actual poses and human revisions, not a summary`);
    return event;
  };
  const objects = event => new Map(event.value.objects.map(object => [object.id, object]));
  const initial = readback('human_cabin'), forest = readback('agent_forest'), details = readback('agent_details'), changed = readback('agent_readback'), final = readback('atmosphere');
  const maps = [initial, forest, details, changed, final].map(objects);
  const { pond, cabin } = capture.anchors || {};
  check(typeof pond === 'string' && typeof cabin === 'string' && pond !== cabin, 'record distinct pond and cabin IDs');
  for (const [id, type] of [[pond, 'pond'], [cabin, 'cabin']]) {
    const original = maps[0].get(id);
    check(original?.type === type && original.created_by === 'human', `${type} must be the human-created anchor`);
    check(maps.every(map => samePose(original, map.get(id))), `${type} must retain its exact pose and ID throughout the film`);
  }
  const help = find('human_cabin', 'help');
  const scatter = find('agent_forest', 'scatter', event => event.args?.type === 'tree' && event.args?.count === 30 && event.value.added === 30 && event.value.live_added === 30 && event.value.exact_count === true);
  check(help && scatter && scatter.value.ids?.length === 30 && new Set(scatter.value.ids).size === 30, 'record discovery and a successful exact 30-tree scatter');
  check([pond, cabin].every(id => scatter.value.preserved_ids?.includes(id)), 'scatter must report both anchors as preserved');
  check(scatter.value.ids.every(id => maps[1].get(id)?.type === 'tree' && maps[1].get(id)?.created_by === 'agent'), 'all 30 reported trees must exist in the native readback');
  for (const type of ['rock', 'lamp']) {
    const additions = successful.filter(event => event.clip === 'agent_details' && event.args?.type === type)
      .reduce((sum, event) => sum + (event.tool === 'scatter' ? event.value.added || 0 : event.tool === 'add_object' && event.value.id ? 1 : 0), 0);
    check(additions >= 2, `record the actual ${type} additions`);
  }
  check(Array.isArray(capture.human_actions), 'record the visible human placement and drag markers');
  const humanActions = capture.human_actions.map(inClip);
  check(humanActions.every(action => ['place', 'move', 'camera', 'sound'].includes(action.kind)), 'human actions cannot reset or replace the scene');
  check(humanActions.some(action => action.kind === 'place' && action.id === pond && action.clip === 'human_pond') &&
    humanActions.some(action => action.kind === 'place' && action.id === cabin && action.clip === 'human_cabin'), 'both placements need their actual pointer-action markers');
  const movedId = capture.moved_object_id;
  const beforeMove = maps[2].get(movedId), afterMove = maps[3].get(movedId);
  check(scatter.value.ids.includes(movedId) && beforeMove?.created_by === 'agent' && afterMove?.last_changed_by === 'human' &&
    Number.isInteger(afterMove.human_revision) && afterMove.human_revision > beforeMove.human_revision && !samePose(beforeMove, afterMove), 'the human must move one of the agent-created trees');
  check(humanActions.some(action => action.kind === 'move' && action.id === movedId && action.clip === 'human_move'), 'the moved tree needs a visible drag marker');
  const editReadback = find('agent_readback', 'describe_scene', event => event.value.selected_id === movedId &&
    event.value.human_edits?.some(edit => edit.id === movedId) && event.value.recent_changes?.some(edit => edit.id === movedId && edit.actor === 'human'));
  check(editReadback, 'a fresh native description must identify the selected tree and human edit');
  check(maps[3].size === maps[4].size && [...maps[3]].every(([id, object]) => samePose(object, maps[4].get(id))), 'lighting and camera must preserve every existing object pose');
  const lighting = find('atmosphere', 'set_lighting', event => event.args?.preset === 'moonlit');
  const camera = find('atmosphere', 'set_camera_motion', event => event.args?.action === 'start');
  const atmosphere = find('atmosphere', 'describe_scene', event => event.value.camera_motion?.status === 'running' && event.value.music?.playing === true);
  check(lighting && camera && atmosphere, 'record moonlit lighting, continuous camera and actual audio playback');
  check(initial.source_seconds < scatter.source_seconds && scatter.source_seconds < forest.source_seconds && details.source_seconds < changed.source_seconds &&
    changed.source_seconds < lighting.source_seconds && lighting.source_seconds < final.source_seconds && camera.source_seconds < atmosphere.source_seconds,
  'readbacks must follow the actions they verify');
  return { ...capture, clips, events: records, human_actions: humanActions, proof: { help, initial, scatter, forest, details, editReadback, changed, lighting, camera, atmosphere, final } };
}
