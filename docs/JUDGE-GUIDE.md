# Judge guide

Open [Agent-Native 3D Scene Studio](https://agent-native-3d-studio.netlify.app). No application account, credentials, API key or installation is required. A desktop browser with WebGL is recommended for the cinematic view. The browser agent supplies its own model connection.

## 1. Connect a browser agent

Use the ChatGPT desktop app's WebMCP-capable in-app browser, or **Chrome 149+** with `chrome://flags/#enable-webmcp-testing` set to **Enabled**, then relaunch Chrome. In Chrome, also connect a compatible WebMCP agent/client; enabling the flag exposes the page API but does not itself add an agent. These are the paths described in the [challenge rules](https://webmcp.devpost.com/rules) and [Chrome documentation](https://developer.chrome.com/docs/ai/webmcp).

Open the app directly as a top-level page. The status should show **WebMCP live · 26 tools**. Ask:

> Discover this page's WebMCP tools. Call help, then describe_scene, and tell me what is in the scene.

The result includes objects, `scene_version`, `selected_id`, `human_edits`, lofi session state, camera motion and music playback. Actual native calls appear as **AGENT · WEBMCP** in the activity log. Expand an entry to inspect its arguments and result. The label identifies the invocation path; it does not authenticate a particular model or provider.

## 2. Create an endless lofi sequence

Send this to the connected browser agent:

> Use compose_lofi_scene to create an endless moonlit retreat. Start with scene lakeside_cabin, cycle true, hold_seconds 180, build_seconds 20, seed 42, a cinematic camera and music. Then use describe_scene to report real build progress, the next scene, camera state and sound status.

The corresponding tool input is:

```json
{"scene":"lakeside_cabin","cycle":true,"hold_seconds":180,"mood":"moonlit","build_seconds":20,"seed":42,"camera":"cinematic","music":true}
```

Expected behavior:

- The tool acknowledges a background session with a `session_id`. A pond, cabin, pines, path and lanterns appear while the progress indicator advances.
- Leave the page visible. When construction finishes, `lofi.status` becomes `playing`, progress reaches 100, and the camera continues moving. The sequence holds for 180 seconds before the next scene. A reduced-motion preference keeps the default camera still.
- `describe_scene` can inspect progress without interrupting construction or the camera. Tool values are inside the response's `result` object.
- If audio is requested but blocked, the player offers **Enable sound**. Click it; `music.playing` reports actual playback. The three tracks are bundled recordings, not newly generated music.
- Drag an empty part of the canvas to take the camera. The complete sequence pauses, including construction and automatic transitions. **Resume** continues it when you are ready.

To demonstrate the transition without waiting for the hold countdown, ask:

> Use control_lofi with action next, then describe_scene to tell me which scene is now building and what follows it.

The image dips gently for about three seconds, then the next recipe builds. Reduced-motion preference skips the dip. The authored order is **Lakeside Cabin → Lantern Grove → Island Hideaway**, repeated while cycling is enabled. `describe_scene.result.lofi` reports `scene`, `scene_title` and `sequence`, including the next scene and remaining hold time. A transition reports `status:"transitioning"`.

`control_lofi` accepts `pause`, `resume`, `stop` and `next`. Stop retains the built objects for editing and prevents further transitions. `undo` restores the scene from before the sequence; it is a whole-scene restore. `cycle` defaults to false when omitted. `hold_seconds` accepts 120–1800; its default is 180 after each build completes.

## 3. Let the agent work around a human placement

1. Click **Reset** to return to the starter camp. Use the base URL without `#scene=…`; a shared link intentionally has its own reset baseline.
2. Drag the wooden camp a short distance across the island. Its selection outline and **YOU** activity entry identify the human edit. The selection card shows its position.
3. Send this prompt:

   > Read the scene, my selection and human edits. Keep the camp exactly where I placed it. Call arrange_scene around this camp with the current expected_scene_version, then describe_scene again to confirm the camp position stayed the same. Leave the camera still.

4. Watch the tagged path, grove and lanterns rearrange. The response lists preserved and moved ids. The camp position remains unchanged. If the requested placement is blocked, the tool returns an error before moving the layout; try a small camp move nearer the island center.
5. After the arrangement completes, drag a lantern that the arrangement moved. Click **Undo layout**. Layout positions revert, while your camp and the later lantern edit stay in place. The result lists `moved_ids` and `skipped_ids`.

Use **Undo layout** for this check. General `undo` restores an entire scene snapshot and has different semantics. The layout tool operates on the starter diorama's tagged objects, not arbitrary objects in the lofi recipe.

## 4. Save and inspect

Use the **Share** arrow or ask for `export_scene`. Open the returned URL in another tab to restore the objects, materials, lighting and camera. The viewer does not need WebMCP. Session timers, audio playback and undo history are not serialized into the link. A reload without a saved link starts a fresh scene.

For a larger scene, `query_scene` supports filters, pagination and actual world-space bounds. The [README tool table](../README.md#tools-26) lists all 26 operations and links to their implementation.

## If something looks different

| What you see | What to do |
| --- | --- |
| **WebMCP unavailable here** | Use the supported browser setup above and reload. Local preview controls still work; they are not proof of native WebMCP discovery. |
| Only 20 tools, or no lofi control | Check that you opened the submitted URL and reload the page. The final candidate described here has 26 tools. |
| Slow cinematic rendering | Click **Cinematic** to switch to **Performance**. This reduces visual effects; the scene tools and collaboration behavior stay available. |
| Sound is requested but silent | Click **Enable sound**, check the volume, and inspect `music.playing`. |
| Build is paused | Keep the tab visible, then click **Resume** or call `control_lofi` with `{"action":"resume"}`. |
| A tool reports `lofi_busy` | Wait for construction or the transition, or call `control_lofi` with `{"action":"stop"}` before an ordinary scene edit. |
| A tool reports `stale_scene` | Read `describe_scene` again and use its current `scene_version` for the next edit. |
| Interface is hidden | Press **H** or click **Controls**. |

**Create a lofi scene** and **Try layout** call the handlers locally as human actions. **Guided tour** is a labeled local script. The `?agent=1` inspector is a developer harness for handler testing. None of these local routes connects to an AI model or substitutes for the native WebMCP test in step 1.
