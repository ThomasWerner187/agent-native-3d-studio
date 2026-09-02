# The 30-second lofi moment

Record an actual connected-agent WebMCP session. Edit waiting time out and label the clip as edited. Keep the original recording and tool log as evidence. The local Guided tour is useful for product orientation, but is not an agent-run recording.

| Time | Picture | Voiceover |
| --- | --- | --- |
| 0–3 s | A live browser agent receives “Create a calming lofi scene.” | “Give this little world an intention.” |
| 3–8 s | Show the actual `compose_lofi_scene` request, then the pond and cabin appearing. | “Through WebMCP, the agent discovers how this scene works.” |
| 8–17 s | Pines grow, lanterns brighten, water ripples. | “One scene recipe coordinates the environment, lighting and sound.” |
| 17–23 s | Music fades in; the camera begins drifting. Briefly show the live session progress and camera state. | “Then the camera keeps wandering. There is no ending.” |
| 23–27 s | Drag the camera, see it pause; explicitly Resume. | “And I can take over at any moment.” |
| 27–30 s | Clean view, cabin glow and slow orbit. | “An agent and a person, in the same living canvas.” |

For a concise take, request `build_seconds: 20`. This shortens the authored reveal, not model latency. Leave the camera running after the clip: its default circuit is four minutes and repeats indefinitely.

## Exact agent prompt

> Create a calming moonlit lofi scene. Build it gradually over 20 seconds, with a cozy cabin, pond, forest, warm lanterns and soft music. Use an infinite cinematic camera. Read the session state afterward and tell me if sound needs a click.

Expected semantic flow: `compose_lofi_scene{mood:"moonlit",build_seconds:20,camera:"cinematic",music:true}` → `describe_scene`. The response acknowledges a background session, not completed construction. To demonstrate takeover, drag the canvas and then use `set_camera_motion{action:"resume"}`.

The agent configures a procedural scene recipe. It does not generate arbitrary meshes or compose new music. The supplied local playlist is used.

## Rehearsal

- Use the new review deployment or the current branch's dev server; confirm **WebMCP live · 26 tools**.
- Reset, choose Blue hour, enable Cinematic on capable desktop hardware. Leave music off until requested; narration must stay clear.
- For the separate cooperative-layout demo, reset to the starter camp and move it somewhere different on each take. Confirm `selected_id` and `human_edits` reflect the actual move.
- After arrangement, move a visible lantern yourself. Undo layout should skip it and retain the camp. The result lists `moved_ids` and `skipped_ids`.
- The lofi player offers Cinematic drift, Endless orbit, Pause and sound controls. For the separate camp demo, frame the camp at distance 18; Overview returns to the whole diorama. H hides/restores the HUD. Mouse input pauses continuous motion and cancels finite camera moves. Confirm resumed motion and real playback before filming.
- Preserve a share link and the original recording. A share link stores the scene, not its edit journal.

## What to say about WebMCP

The canvas alone does not reveal object ids, exact coordinates or operation semantics. WebMCP makes the application's actions and current state discoverable through a standard browser interface. A custom API could offer similar control; this demo shows why publishing the contract directly in the shared page is useful.

Do not claim the Guided tour is an AI session, all work always completes in 30 seconds, or this capability is technically impossible without WebMCP. The local scene animation is fast; model latency is a separate measurement.

## Submission package

Public repository with MIT license, working hosted build, narrated demo under the event's video limit, and the description in SUBMISSION.md. Final recording, submission form and production release still need to refer to the same reviewed revision.
