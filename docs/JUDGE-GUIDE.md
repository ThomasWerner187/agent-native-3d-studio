# Judge guide

Open [Agent-Native 3D Scene Studio](https://agent-native-3d-studio.netlify.app). No application account, credentials or API key are required. A connected browser agent supplies the model. Confirm that this URL serves the reviewed **29-tool zen co-creation release** before evaluating it; release status is in [FINAL-REVIEW.md](FINAL-REVIEW.md).

## Connect and begin

Use a WebMCP-capable in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. Relaunch after changing the flag and connect a compatible agent/client. The flag exposes the API; it does not provide an agent itself.

The status should read **WebMCP live · 29 tools**. Ask the agent:

> Discover this page's tools. Read help and describe_scene, including the shared creative requests and human edits.

Native calls appear as **AGENT · WEBMCP**. Tool activity shows their real arguments and responses. A local preview or `?agent=1` harness tests handlers but is not evidence of native discovery.

## Make the first choices

Click **Start empty**, then **Add pond** and **Add cabin**. Drag them into position beside one another, leaving room between the porch and water. The selected-object inspector offers **X**, **Z**, **Turn °** and **Size** for precise human edits.

`query_scene` with `include_bounds:true` exposes stable IDs, full poses, actual bounds, reserved cabin entrance space and ownership: `created_by`, `last_changed_by`, `revision`, `human_revision`. `describe_scene` includes the current selection, human edits, recent changes and shared requests.

## Grow the forest together

In **Your next idea**, type the following and press **Share with agent**:

> Add forty trees, mostly as a forest behind my cabin, and beautiful warm lights around the clearing. Keep my pond and cabin where I placed them. Leave an open foreground and a clear entrance.

The request becomes visible in the page for your connected agent to read. Ask it to inspect the current request and scene, then carry it out. The request panel does not launch a hidden built-in model.

Expected behavior:

- The agent uses `add_grove` with both actual anchor IDs, `count:40`, and typically `lights:8`.
- The result reports `added:40`, `live_added:40`, `exact_count:true`, forty tree `ids`, eight `light_ids`, and the preserved anchor IDs.
- The designed arrangement places thirty-two trees behind the cabin and eight around the sides. The cabin, water and approach remain readable.
- A fresh unfiltered `query_scene` confirms the trees and lamps exist with agent provenance. Both human anchors retain their exact IDs and poses.
- If there is insufficient space, `no_space` leaves the planned additions unapplied. Adjust the anchors or request and try again; an error is not a successful forest.

## Add a way home

Share another request:

> Please add a gently curving stepping-stone path from the cabin porch toward the pond. Make each stone editable and keep everything we already built in place.

The agent uses `add_path` with the live cabin and pond IDs. It plans a path around existing bounds and returns individual stone IDs, `editable:true`, exact count and an undo ID. A new query should show the previous scene unchanged plus the stones. The path belongs to this actual arrangement rather than an imported preset.

## Keep shaping it yourself

Move two path stones through the UI. Give each a small, visible adjustment that leaves a walkable curve. Keep one selected and ask:

> Read the current scene and my latest edits. Identify both stones I moved and keep their new positions.

Both IDs should retain `created_by:"agent"`, report `last_changed_by:"human"`, and have increased human revisions. `describe_scene` should identify the selected stone and both human changes. All other objects stay in place.

## Enjoy the moment

Share the final request:

> Keep my stone edits. Give us a cozy evening, my lofi music, and a slow endless camera much closer to the cabin and pond. Hide the controls so we can relax.

The agent can apply `set_lighting` with `preset:"golden_hour"`, which creates the warm dusk treatment. It starts music and a `set_camera_motion` drift focused on the cabin and pond. A suitable starting direction uses both anchor IDs in `targets`, distance 18–22m, height 7–8m, azimuth 18 degrees, sweep 50 degrees, loop 240 seconds, and blend five seconds. Adapt the frame to the actual scene.

The drift moves slowly across the front view and repeats continuously. Read `camera_motion.status` to verify it is running. Read `music.playing` to verify real playback, not just a queued request. Click **Enable sound** if a user gesture is required. The music is bundled and supplied by the creator.

`set_ui({visible:false})` hides the interface; **H** or **Controls** brings it back. A final query should preserve every object pose, including both human stone edits. Human camera interaction pauses the camera; resuming is explicit.

## Optional undo and sharing checks

Use `undo_scatter` with the path operation's `undo_id`. Unchanged path stones disappear while the two human-edited stones remain. Its result lists removed and skipped IDs. This same additions journal serves grove and scatter operations. The UI's **Undo additions** targets the latest addition operation.

General `undo` restores a whole scene and has different behavior. Test it separately from the continuity walkthrough.

**Share** or `export_scene` produces a link restoring objects, appearance and camera pose. Export does not change the current address. Restoration clears the hash before native registration, so keep the copied share link to revisit that scene. Playback, active timers and undo history are local to the page.

The optional lofi gallery has three authored worlds and intentionally replaces the current scene. Explore it after the shared-world walkthrough.

## If a check cannot run

| Observed state | Next step |
| --- | --- |
| WebMCP unavailable | Use a supporting browser with a connected client. |
| Tool count differs from 29 | Confirm the reviewed release URL; older deployments have fewer tools. |
| Browser policy verification denied | Restore authorized browser access; do not bypass the policy. |
| `stale_scene` | Read current state and use its scene version for the next mutation. |
| `no_space` | Adjust the anchors or reduce the requested additions, then retry from current state. |
| `lofi_busy` | Stop the optional gallery session before ordinary editing. |
| Low frame rate | Switch to Performance mode; scene tools remain available. |
| Hidden interface | Press H or click Controls. |

The [review record](FINAL-REVIEW.md) separates local checks, actual native capture and release publication. An older film does not verify these new operations.
