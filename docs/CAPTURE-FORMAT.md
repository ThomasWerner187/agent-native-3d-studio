# Native recording evidence format

This contract is for the new 145-second collaboration film. It stores facts observed during the actual browser recording. Do not generate a manifest from a local harness, substitute old gallery events, or fill absent evidence with expected results.

The file `scratch-submission-media/native-capture.json` is a JSON object with these fields:

| Field | Required contents |
| --- | --- |
| `schema_version` | `1` |
| `story_id` | `collaborative-world-v1` |
| `capture_id` | A nonempty identifier for the one source recording/session |
| `app_revision` | The 7–40 hexadecimal character revision actually loaded |
| `page_url` | The clean native page URL; no `agent` harness parameter or shared-scene hash |
| `transport` | `native-webmcp`, backed by the retained original requests/responses and footage |
| `continuity` | `{ "single_page": true, "scene_replacements": 0 }`, confirmed from the source recording |
| `anchors` | `{ "pond": "actual pond ID", "cabin": "actual cabin ID" }` |
| `moved_object_id` | The actual agent-created tree dragged by the person |
| `clips` | The eight chronological source ranges described below |
| `events` | Actual native calls with original `args` and `result`, in source order |
| `human_actions` | Observed pointer-action markers, described below |

These labels are provenance records, not cryptographic authentication. The source footage must still be reviewed.

## Source time and cuts

Use one elapsed-seconds clock for the entire source recording. Each `clips` entry contains `id`, `source_start_seconds`, `source_end_seconds` and `cuts`. IDs and order come from [video-narration.json](video-narration.json): `human_pond`, `human_cabin`, `agent_forest`, `agent_details`, `human_move`, `agent_readback`, `atmosphere`, `closing`.

A clip's end equals the next clip's start. Its source duration minus declared cuts must equal its planned duration. A cut is `{ "start": number, "end": number, "reason": "agent_wait" }`; times use the same original source clock. Cuts must not overlap. Only waiting intervals can be removed. Record the complete retained scene and its actual actions at original speed.

Put each shot's raw frame images and `frames.json` in its named subdirectory. A frame entry contains `file` and `time`; `time` uses the same original source clock, not an independently reset clip clock. The encoder removes declared waiting intervals and preserves the timing of everything retained. It rejects incomplete frame coverage. Keep the original unedited source recording too.

## Native events and human actions

A native event contains `clip`, `source_seconds`, `tool`, `args` and `result`. `source_seconds` is when the result became observable, not merely when the request was sent. Keep the complete original tool response, including its `actor:"agent"` envelope. Nested JSON/MCP text wrappers are supported. Required results cannot be hidden inside waiting-time cuts.

A human action contains `clip`, `source_seconds`, `kind` and, for object actions, `id`. Supported kinds are `place`, `move`, `camera` and `sound`. Required markers are pond placement in `human_pond`, cabin placement in `human_cabin`, and the same agent-created tree's drag in `human_move`. Record what the pointer actually did.

## Required readbacks

Record successful, unfiltered `query_scene` results with every object's full pose and provenance in `human_cabin`, `agent_forest`, `agent_details`, `agent_readback` and `atmosphere`. Use a limit of 200 for this small scene, no filters and offset zero. All objects must fit in that result; `total` equals the returned count and `next_offset` is null. Include bounds for placement planning.

The native event sequence must also include:

- `help` in `human_cabin`;
- `scatter` for 30 trees in `agent_forest`, returning 30 unique IDs, `exact_count:true` and both anchors in `preserved_ids`;
- actual rock and lantern additions in `agent_details` (at least two of each);
- fresh `describe_scene` in `agent_readback`, reporting the selected tree, its human edit and matching `recent_changes`;
- moonlit `set_lighting`, starting `set_camera_motion`, and `describe_scene` with a running camera and `music.playing:true` in `atmosphere`.

The validator compares the same anchor IDs and poses across the readbacks, verifies that the moved tree was agent-created and then changed by a person, and checks that the atmosphere stage retained every object pose. Successful scene replacement, import, general undo or gallery-next calls invalidate this story's continuity.

Leave readable time after results: the assembler never displays a response before its recorded result timestamp, and each selected evidence card needs at least one second. The native forest operation and following readback have separate cards. No final film is produced if required evidence is missing.
