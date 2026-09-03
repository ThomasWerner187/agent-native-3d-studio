# Agent-Native 3D Scene Studio

**Build a little world together.** Place a pond and cabin yourself, then ask your browser agent to grow a forest around them. Ask for a stone path, then move two stones by hand. The agent reads that change, keeps your placement, and gives the same world its lighting, music and a slow cinematic camera.

[Open the studio](https://agent-native-3d-studio.netlify.app) · [Judge guide](docs/JUDGE-GUIDE.md) · [Submission story](SUBMISSION.md) · [2:37 film plan](DEMO.md) · [MIT license](LICENSE)

No application login, API key or backend is required. The connected browser agent supplies the model; this page supplies live objects and structured actions. Local editing also works without an agent. The current collaboration release and its new native demonstration are tracked in the [review record](docs/FINAL-REVIEW.md); the current native recording verifies this flow independently of the earlier gallery film.

![The shared forest, cabin, pond and path from the final native film](docs/zen-co-creation.jpg)

Actual frame from the new co-creation film. [Try the recorded review build](https://zen-review--agent-native-3d-studio.netlify.app/).

## Build with an agent

1. Click **Start empty**, then **Add cabin** and **Add pond**. Drag them where you want them, or use the position fields.
2. Type an idea in **Your next idea** and share it. Ask your connected browser agent to read the latest request and continue. Its actual native calls appear as **AGENT · WEBMCP** in Tool activity.
3. Keep shaping the same world yourself. Each object retains its identity and edit history.

> Add 40 trees, mostly as a forest behind my cabin, and beautiful warm lights around the clearing. Keep my pond and cabin where I placed them.

Then:

> Please add a curved stepping-stone path from the cabin porch to the pond.

After moving two stones:

> Keep my stone edits. Make it cozy evening, add music, and bring the camera closer for a slow endless drift. Hide the controls so we can relax.

The browser agent reads `describe_scene` and `query_scene`, then uses `add_grove` and `add_path`. These tools plan additions against the live anchors and preserve existing objects. The forest has a dense backdrop and sparse side framing; the path follows the actual porch and pond bank. `set_camera_motion` can frame the cabin and pond together with an explicit distance, height and gentle endless sweep.

The idea field shares text with the connected browser agent. It does not run a model inside the application. The agent must read the request and call the tools; every displayed agent result comes from those calls.

## What the shared state provides

Objects have stable IDs, poses and visible ownership information: `created_by`, `last_changed_by`, `revision` and `human_revision`. `describe_scene` also exposes selection, human edits, `recent_changes` and the latest `creative_requests` brief. The actor identifies the input route, not an authenticated model or account.

`scatter` adds an exact requested number around an optional live `anchor`. It plans against actual object bounds and cabin entrance space, with a default clearance of 0.4. A crowded request returns `no_space` without partial additions. Results report requested and live counts, added IDs, preserved IDs and an `undo_id`. A human interruption can change the live count; the response reports that outcome.

`undo_scatter` removes that scatter's additions while keeping objects a person changed afterward. Cooperative camp layouts have their own `undo_layout` position journal. General `undo` restores a whole-scene snapshot and has broader effects.

Mutations accept `expected_scene_version`. If a person changes the scene after the agent reads it, a stale request is rejected so the agent can inspect the new state. Read-only observations leave continuous camera motion running. Grabbing the camera pauses it; explicit resume returns control to the director.

## Atmosphere and the gallery

Lighting blends between five moods. `set_camera_motion` starts a continuous orbit, cinematic route or intimate front-facing drift around chosen live objects. Distance, height and sweep are adjustable; a short entry flight eases into the view. Sound controls distinguish requested playback from actual playback; click **Enable sound** if the browser needs a gesture. The bundled three-track playlist has volume and mute controls.

The optional gallery supplies three authored procedural recipes: **Lakeside Cabin**, **Lantern Grove** and **Island Hideaway**. `compose_lofi_scene` can build one, or cycle through them with an adjustable hold. This is a separate starting-point experience: composition replaces the existing scene. Keep the gallery outside a continuous co-creation session unless replacement is intentional. [Gallery image](docs/lofi-retreat.jpg).

Local buttons call the same handlers with human provenance. A guided tour is labeled as a local script. Neither connects to an AI model. The `?agent=1` developer harness verifies handlers; it is not evidence of native WebMCP discovery.

## Why WebMCP fits

A WebGL canvas shows pixels while object IDs, precise positions, bounds and edit history live inside the application. WebMCP publishes those capabilities to a browser agent in the same live page. The agent can read what the person built, use the page's actions, and verify the result.

The useful handoff is concrete: “Keep what I placed; build around it.” The page provides object-aware placement and undo semantics, while the agent translates the request into tool calls. The person continues to work with the mouse. A custom integration could expose similar capabilities; WebMCP provides the browser-facing discovery and execution contract.

## Tools (29)

| Purpose | Tools |
| --- | --- |
| Discover and inspect | `help`, `describe_scene`, `query_scene` |
| Add an environment | `add_grove`, `add_path`, `scatter`, `undo_scatter` |
| Build and edit | `add_object`, `transform_object`, `set_material`, `delete_objects` |
| Direct the scene | `set_lighting`, `frame_camera`, `camera_path`, `set_camera_motion`, `set_ui`, `set_music` |
| Cooperative camp layout | `arrange_scene`, `undo_layout`, `redo_layout` |
| Save and restore | `snapshot`, `undo`, `export_scene`, `import_scene` |
| Group operations | `batch` |
| Authored gallery | `compose_lofi_scene`, `control_lofi` |
| Chess geometry | `board_square`, `chess_move` |

Registration in [src/webmcp.ts](src/webmcp.ts) uses `document.modelContext.registerTool`. JSON schemas describe inputs and side-effect annotations. Results include `ok`, `operation_id`, `actor`, scene versions, `applied`, `duration_ms` and a result or error. Finite animations settle before reporting live values; background camera and gallery sessions acknowledge acceptance and expose ongoing state separately.

## Run and verify

Use Node.js 22, as in CI. The application needs no environment variables.

```bash
npm ci
npm run dev
```

For local release checks:

```bash
npm run build
npm run test:animations
npm run test:lofi
npm run smoke
```

The smoke suite starts a fresh preview port and uses system Chrome or Playwright's Chromium. If neither is installed, run `npx playwright-core install chromium`. CI installs Chromium and its dependencies. The suite exercises the labeled developer harness and checks scene semantics; native discovery and cinematic appearance need the separate [judge walkthrough](docs/JUDGE-GUIDE.md). Current results and open gates are recorded in [FINAL-REVIEW.md](docs/FINAL-REVIEW.md).

Native WebMCP needs a supporting browser and client. In Chrome 149+, enable `chrome://flags/#enable-webmcp-testing`, relaunch, and connect a compatible agent. The status chip reports actual API availability; a flag alone does not connect a model.

## Demo production

[video-narration.json](docs/video-narration.json) defines the eight shots, their narration and the **157-second** timeline. The new film follows one retained scene: human anchors, an agent-grown forest, an editable stone path, two human stone edits and an intimate evening retreat. The review record distinguishes the current capture from the earlier 161-second collaboration film and 135-second gallery film.

Local planning does not need recordings, credentials or API calls:

```bash
npm run audio:elevenlabs -- --plan
node scripts/encode-demo-capture.mjs --plan
node scripts/assemble-demo.mjs --plan
```

Approved narration uses ElevenLabs **Lily — Velvety Actress**, model `eleven_v3`. Generating missing tracks requires `ELEVENLABS_API_KEY` and makes paid API calls. Cached MP3s retain character alignment and generation provenance. Swift/AppKit, `ffmpeg` and `ffprobe` handle local captions and assembly on macOS. See the [recording plan](docs/recording-plan.md) for production commands and the required continuity evidence. The helpers do not record a browser or upload a submission.

## Implementation and limits

- Procedural geometry supplies cabins, reflective ponds, forests, rocks and lanterns. The agent arranges these editable assets; it does not generate arbitrary meshes or new music.
- The editable surface is flat at y=0. Object bounds and reserved entrance space guide placement; this is not physics or terrain simulation.
- Cinematic rendering uses reflection, ambient occlusion, bloom and shadows. Performance mode reduces effects. Frame rate depends on hardware and scene size; additional ponds require additional reflection views.
- Reduced-motion preference limits automatic camera and reveal animation. Continuous camera motion can still be explicitly requested.
- Share links preserve objects, materials, lighting and camera pose, but not playback, running timers or undo history. Keep the copied/returned link: export leaves the current URL unchanged, and opening a share clears its hash after restoration. Reloading the resulting clean base URL does not retain that restored scene.
- There is no account-based cloud save or multi-user room. Person and agent share the current page.
- Chess tools provide geometry and movement, not a chess rules engine.

Core source: [tool registration](src/webmcp.ts), [editing handlers](src/tools.ts), [object state](src/store.ts), [pointer interaction](src/interaction.ts), [layouts](src/layout.ts), [snapshots](src/snapshot.ts), [rendering](src/scene.ts), [gallery recipes](src/lofi-scenes.ts), [media plan](scripts/demo-plan.mjs).

MIT licensed. Bundled DM Sans and Manrope include SIL Open Font Licenses in [public/fonts](public/fonts). Thomas Werner supplied the three music tracks; [music credits](public/music/README.md) record their provenance. Built with TypeScript, three.js and Vite for [The WebMCP Challenge](https://webmcp.devpost.com/).
