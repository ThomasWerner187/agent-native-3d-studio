# Judge guide

Open [Agent-Native 3D Scene Studio](https://agent-native-3d-studio.netlify.app). No application account, credentials or API key are required. A desktop WebGL browser is recommended; a connected browser agent supplies the model.

## Connect

Use a WebMCP-capable in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. Relaunch Chrome after changing the flag and connect a compatible agent/client. The flag exposes the API but does not itself add an agent.

The application status should show **WebMCP live · 27 tools**. Ask:

> Discover the page's tools. Call help and describe_scene, then tell me what is in the scene.

Native calls appear as **AGENT · WEBMCP**. Expand Tool activity to inspect the real arguments and response. A local preview or `?agent=1` developer harness is useful for testing handlers but does not establish native discovery.

## Place something yourself

Click **Start empty**, then **Add pond** and **Add cabin**. Drag them into position. The selected-object inspector provides **X**, **Z**, **Turn °** and **Size** for precise edits. These controls make human changes.

Ask the agent to read the live scene, using `query_scene` with `include_bounds:true` where needed. It can see stable object IDs, positions, actual bounds, reserved cabin entrance space and ownership fields: `created_by`, `last_changed_by`, `revision` and `human_revision`. `describe_scene` also includes `selected_id`, `human_edits` and `recent_changes`.

## Let the agent add the environment

The **Build around my scene** button copies a prompt; it does not invoke a model. Paste it into the connected browser agent, or use:

> Read my pond and cabin, their current positions, bounds and human edits. Keep both exactly where I placed them. Add thirty pine trees around them. Keep the water, shoreline and cabin entrance clear. Verify the actual count and my unchanged placements.

Expected behavior:

- The agent reads the current objects and uses `scatter` with an appropriate area, anchor and clearances.
- A successful operation adds exactly 30 trees. `added`, `live_added`, `exact_count`, `ids` and `preserved_ids` describe the actual outcome.
- The pond and cabin retain their IDs and poses. Placement respects existing bounds and entrance space.
- If the available area cannot fit the request, `no_space` leaves the scene unchanged. Let the agent widen the area or request fewer objects; do not treat an error as a successful forest.

Then ask for six shoreline rocks and four warm lanterns, preserving existing objects and the cabin approach. Keep the tool results so the additions can be inspected and undone.

## Make another human decision

Drag one of the agent-created trees to a noticeably different position. Ask:

> I moved one tree. Read my current selection and recent human edits. Identify the tree and its new position, and keep it there. Give the scene soft moonlit lighting and start a slow continuous cinematic camera around it. Keep all object placements unchanged. Verify camera motion and actual music playback.

The same tree ID should now report `last_changed_by:"human"` and an increased `human_revision`. The lighting and camera change while object poses stay fixed. `set_camera_motion` accepts the scene or a specific object as its target. Read-only state checks leave that motion running. Grabbing the camera pauses it; an explicit resume returns control.

Click **Enable sound** if the browser requires a gesture. Verify `music.playing`, not only a request to play. The tracks are bundled recordings supplied by the creator.

## Check selective undo

For a separate optional check, call `undo_scatter` with the tree scatter's `undo_id`. The untouched additions disappear, while the tree you moved remains. The result lists `removed_ids` and `skipped_ids`. **Undo additions** applies this behavior to the most recent scatter; specify the tree operation's ID if rocks or lanterns were added afterward.

General `undo` restores a whole scene and has different effects. The older `undo_layout` journal applies to position changes in the starter camp example.

## Save and explore

Use **Share** or `export_scene`, then reopen the returned link. It restores objects, materials, light and camera pose. Export does not change the current address. Restoration clears the hash before native tool registration, so reloading or bookmarking that resulting clean URL does not retain the scene: keep the copied share link.

The optional **Watch a lofi world** section contains the three authored gallery scenes and **Create a lofi scene**. Gallery composition intentionally replaces the scene, so test it after the collaboration walkthrough. The starter camp layout and its local controls are also secondary examples.

## When a check cannot run

| Observed state | Next step |
| --- | --- |
| WebMCP unavailable | Use a supporting browser and connected client. A local preview is not a native substitute. |
| Tool count differs from 27 | Check the reviewed release URL and reload; older deployments have fewer tools. |
| Browser access denied by admin-policy verification | Restore authorized browser access. Keep native verification open; do not bypass the policy. |
| `stale_scene` | Read the latest scene and use its version for the next mutation. |
| `no_space` | Increase the placement area or reduce the requested count. The failed scatter leaves the scene unchanged. |
| `lofi_busy` | Stop the gallery session before ordinary editing. |
| Cinematic view is slow | Switch to Performance mode; the scene semantics stay available. |
| UI is hidden | Press H or click Controls. |

Release evidence is in [FINAL-REVIEW.md](FINAL-REVIEW.md). A native result from an earlier build does not verify a newly added collaboration feature.
