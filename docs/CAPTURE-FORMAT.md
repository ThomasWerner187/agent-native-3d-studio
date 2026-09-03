# Native recording contract — Zen co-creation

This contract describes the **new 157-second `zen-co-creation-v2` film**. The 161-second v1 film is a separate historical take. Record actual native browser footage, requests and responses; never fill absent evidence with a local harness or expected values.

The manifest is `scratch-submission-media/native-capture.json`:

| Field | Actual recorded value |
| --- | --- |
| `schema_version` | `1` |
| `story_id` | `zen-co-creation-v2` |
| `capture_id` | Identifier for this one retained scene and its original recording segments |
| `app_revision` | The loaded application's 7–40 character hexadecimal Git revision |
| `page_url` | Actual clean native page URL, without an `agent` query or scene hash |
| `transport` | `native-webmcp` |
| `continuity` | `{ "single_page": true, "scene_replacements": 0 }` |
| `anchors` | `{ "pond": "actual ID", "cabin": "actual ID" }` |
| `path_object_ids` | Every ID returned by the successful `add_path`, in returned order |
| `moved_object_ids` | Two distinct path-stone IDs subsequently moved through the UI |
| `clips` | The eight chronological source ranges below |
| `events` | Original native calls, arguments, complete responses and observation times |
| `human_actions` | Real placements, typed requests, stone movements and any playback click |

## Timing and source footage

Use one elapsed-seconds source clock throughout. Clip IDs/order/durations come from [video-narration.json](video-narration.json): `human_pond` 14s, `human_cabin` 16s, `agent_forest` 26s, `agent_details` 21s, `human_move` 16s, `agent_readback` 19s, `atmosphere` 26s, `closing` 19s.

Each clip has `id`, `source_start_seconds`, `source_end_seconds`, and `cuts`. Its end equals the next clip's start. Source duration minus cuts must equal the planned duration. A cut is `{ "start": number, "end": number, "reason": "agent_wait" }`, on the original source clock. This records omitted idle time, including pauses between recording segments when capture was stopped. It does not imply that frames exist for those gaps. Retain actual typing, pointer movement and scene reveals at original speed. Required actions or results must not fall inside cuts. No scene reset, import, composition or replacement take is allowed during the story.

Keep every original recording segment unchanged. The capture runs segment by segment on one native browser page, with the same editable scene throughout; it is not an uninterrupted video stream. Each shot's folder contains actual screencast images and `frames.json` entries `{ "file": "frame.jpg", "time": number }` using the shared elapsed-time clock. Document all waiting and recording gaps in the manifest. Frames must cover the retained shot at a minimum average of ten genuine frames per second, first frame within 0.12s and last within 0.2s of the shot boundaries. No missing action may be invented, reconstructed or sped up; duplicating old frames does not count as new capture.

## Events and human actions

A native event has `clip`, `source_seconds`, `tool`, `args`, `result`. The timestamp is when the result became observable. Retain the complete `actor:"agent"` response envelope and original argument values.

A human action has `clip`, `source_seconds`, `kind`, and `id` for object actions. Kinds: `place`, `move`, `camera`, `sound`, `request`. A `request` also includes `intent` (`forest`, `path`, or `atmosphere`) and `text`, copied from the actual page input. Editorial intent labels describe the recorded action; they do not stand in for footage of the request.

Required action markers:

- Pond placement in `human_pond`; cabin placement and forest request in `human_cabin`.
- Path request in `agent_details`.
- Two distinct path-stone movements in `human_move`.
- Cozy evening/music/camera request in `atmosphere`.

## Native proof

Keep complete unfiltered `query_scene` results in `human_cabin`, `agent_forest`, `agent_details`, `agent_readback`, and `atmosphere`. Use `limit:200`, `include_bounds:true`, no type/name/ID filter and offset zero. Every object needs its full pose, actor provenance and human revision. Returned length must equal `total`; `next_offset` must be null.

The native sequence also includes:

1. `help` during either opening shot.
2. `add_grove` with `count:40`. Its result includes forty unique tree IDs, exact live count, at least four actual light IDs, at least twenty-four trees behind the cabin, and both anchors preserved. The intended arrangement uses thirty-two rear trees, eight side trees and eight lights.
3. `add_path`: at least three individually editable stone IDs, `exact_count:true`, and matching live count. Existing objects retain their poses.
4. `describe_scene` after both human moves: one moved stone remains selected, and both IDs occur in `human_edits` and human `recent_changes`.
5. `set_lighting` using the warm `golden_hour` preset; `set_camera_motion` starts `mode:"drift"`, focuses both anchor IDs, uses distance at most 30m, height at most 12m and a circuit of at least 120s.
6. `set_ui` with `visible:false`, returning `ui_visible:false`; subsequent `describe_scene` verifies running camera and `music.playing:true`. A final query verifies every pose remains unchanged.

The actual framing is chosen from the rendered scene. Recommended starting point: distance 18–22m, height 7–8m, azimuth 18 degrees, sweep 50 degrees, 240-second loop and five-second blend. The validator rejects an obviously distant camera; visual review must still judge the composition.

Three compact editorial notices derive from real forest/path/changed readbacks. Leave at least 1.15 seconds after each of those results. The closing has no code cards or title overlays: after Lily's final line, approximately ten seconds of music accompany the same slowly moving scene.

These records are provenance, not cryptographic authentication. Review the source footage and finished video; automated validation cannot establish that an attractive scene actually appeared on screen.
