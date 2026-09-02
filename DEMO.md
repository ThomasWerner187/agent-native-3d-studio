# The 30-second moment

Record an actual connected-agent WebMCP session. Edit waiting time out and label the clip as edited. Keep the original recording and tool log as evidence. The local Guided tour is useful for product orientation, but is not an agent-run recording.

| Time | Picture | Voiceover |
| --- | --- | --- |
| 0–4 s | Beautiful blue-hour diorama. Drag the camp to an arbitrary spot; blue outline appears. | “I choose where the camp goes.” |
| 4–8 s | Show the one-sentence instruction and the real `describe_scene` call. | “My agent reads the live scene—including what I just changed.” |
| 8–17 s | Actual `arrange_scene` result: path, pines and lanterns move; camp stays still. Keep the AGENT · WEBMCP entry visible. | “It rebuilds the surroundings without moving my decision.” |
| 17–23 s | Make another small human edit, then press Undo layout. Show the preserved edit. | “Undo its work. Keep mine.” |
| 23–30 s | Redo, then a clean camp camera shot. | “WebMCP gives the agent the scene's tools. We share the world—and I keep the mouse.” |

## Exact agent prompt

> Read the live scene, including my current selection and human edits. Keep my camp exactly where I placed it. Use arrange_scene to adapt the path, trees and lanterns around it, keeping access clear. Use the observed scene version to avoid stale edits. Then frame a beautiful three-quarter shot of the camp, without changing my selection.

Expected semantic flow: `describe_scene` → `arrange_scene{anchor:<live camp id>, expected_scene_version:<observed version>}` → `frame_camera{target:<camp id>, angle:"three_quarter", distance:18, select:false}`. These are discovered page tools, not shell commands or a prerecorded macro.

## Rehearsal

- Use the new review deployment or the current branch's dev server; confirm **WebMCP live · 23 tools**.
- Reset, choose Blue hour, enable Cinematic on capable desktop hardware. Leave music off until requested; narration must stay clear.
- Move the camp somewhere different on each take. Confirm `selected_id` and `human_edits` reflect the actual move.
- After arrangement, move a visible lantern yourself. Undo layout should skip it and retain the camp. The result lists `moved_ids` and `skipped_ids`.
- Frame the camp at distance 18 for details; Overview returns to the whole diorama. H hides/restores the HUD. Mouse input cancels agent camera motion.
- Preserve a share link and the original recording. A share link stores the scene, not its edit journal.

## What to say about WebMCP

The canvas alone does not reveal object ids, exact coordinates or operation semantics. WebMCP makes the application's actions and current state discoverable through a standard browser interface. A custom API could offer similar control; this demo shows why publishing the contract directly in the shared page is useful.

Do not claim the Guided tour is an AI session, all work always completes in 30 seconds, or this capability is technically impossible without WebMCP. The local scene animation is fast; model latency is a separate measurement.

## Submission package

Public repository with MIT license, working hosted build, narrated demo under the event's video limit, and the description in SUBMISSION.md. Final recording, submission form and production release still need to refer to the same reviewed revision.
