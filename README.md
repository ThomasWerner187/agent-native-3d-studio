# Agent-Native 3D Scene Studio

**A little world. To slow down in.** Ask your browser agent for an endless lofi retreat. A cabin, pond, pines and lanterns appear gradually; music fades in and a cinematic camera keeps drifting. Three authored scenes can linger and change in a continuous sequence. Everything stays editable in the shared three.js scene.

[Open the studio](https://agent-native-3d-studio.netlify.app) · [Judge guide](docs/JUDGE-GUIDE.md) · [Submission story](SUBMISSION.md) · [2:15 film script](DEMO.md) · [MIT license](LICENSE)

![The live lofi cabin, pond and cinematic director](docs/lofi-retreat.jpg)

No application login, API key or backend is required. A connected browser agent supplies the model; the page supplies the scene and tools. The local preview works without an agent. For the native experience, use a WebMCP-capable browser and follow the [judge walkthrough](docs/JUDGE-GUIDE.md).

## Create a lofi scene

Click **Create a lofi scene** for the local experience, or give a WebMCP browser agent this prompt:

> Create an endless moonlit lofi retreat. Use compose_lofi_scene with scene lakeside_cabin, cycle true, hold_seconds 180, a cinematic camera and music. Let each world unfold gradually, then use describe_scene to check progress, the next scene and sound status.

`compose_lofi_scene` accepts `scene` (`lakeside_cabin`, `lantern_grove` or `island_hideaway`), `cycle` (default false), `hold_seconds` (120–1800, default 180), `mood` (moonlit or golden_hour), `seed`, `build_seconds` (12–90, default 32), `camera` (cinematic or orbit), and `music`. It starts a background session and returns a `session_id` immediately. The agent configures authored procedural recipes through a semantic tool; it does not generate arbitrary meshes.

- **The scene unfolds:** water, a cedar A-frame cabin, forest, paths and lanterns build gradually. Each recipe has its own arrangement. The progress and actual playback state are visible and available through `describe_scene`.
- **Worlds keep changing:** with `cycle:true`, each completed scene holds for the chosen duration, then a gentle dark dip leads into the next procedural build. The three recipes repeat. `control_lofi{action:"next"}` advances on request; `describe_scene` exposes the current scene, next scene and remaining hold time.
- **An endless camera:** `set_camera_motion` starts continuous orbit or a smooth periodic route with changing height, distance and focus. No endpoint cut; no maximum loop count. A circuit defaults to four minutes. Observation tools do not interrupt it.
- **Human control:** grabbing the canvas pauses the complete lofi session, including construction, camera and automatic scene changes. `control_lofi` resumes it or stops it while retaining its objects. The `undo` tool restores the pre-composition scene across the sequence.
- **Sound:** the local three-track playlist fades in softly. The UI and tools distinguish requested playback from actual playback. If the browser blocks audio, click **Enable sound**. Volume and mute remain available.
- **Clean view:** hides the interface for enjoying the scene. H or the unobtrusive **Controls** button brings it back. Scene export is available as a share link; video recording and upload are external production steps.

The local Create button calls the same handler with `actor: human`; it does not contact an AI model. A connected browser agent calls the registered WebMCP tool with `actor: agent`. **Tool activity** exposes the original arguments and response. The background session state is observable in both cases.

## Try the collaboration

1. Drag the wooden camp to another spot. Its blue outline and the **YOU** activity entry identify the human edit.
2. Give a connected browser agent the prompt below. It discovers the page tools, reads the actual selection and human edits, then adjusts the environment.
3. Click **Undo layout**. Only the layout's positions revert. The camp, later edits and material changes remain.

> Read the live scene, including my selection and human edits. Keep my camp exactly where I placed it. Use arrange_scene to adapt the path, trees and lanterns around it, keeping access clear. Then frame a beautiful shot.

**Try layout** calls the same handler locally, with `actor: human`. **Guided tour** is an explicitly labeled local script, with `actor: demo`. Neither button invokes an AI model. A connected agent's WebMCP calls appear as **AGENT · WEBMCP**, with the full request and result available in the activity log.

## Why WebMCP matters here

The WebGL canvas doesn't expose the scene graph through the DOM. A screenshot contains visible objects, but not their stable ids, exact positions, human-edit history or undo semantics. WebMCP lets this page publish those capabilities as discoverable, structured tools in the same live browser session. The agent can observe, act and verify while the person keeps the mouse.

The immediate use is making small ambient scenes together. The wider development question is how visual editors can expose intent, ownership and reversible edits to browser agents. The camp interaction makes that question concrete: a person chooses a placement, and the agent adapts the surroundings without taking that choice away.

A custom API or other automation integration could provide similar capabilities. The contribution here is the **standard browser-facing contract**, shared live state and reversible collaboration—not a claim that 3D automation is otherwise impossible. See the [Chrome WebMCP documentation](https://developer.chrome.com/docs/ai/webmcp).

## What is implemented

- Procedural A-frame cabin with a furnished interior, glazed front, reading porch and softly dissipating GPU chimney smoke. A stone-lined pond reflects the actual scene, with layered wave normals, Fresnel reflection and a shallow shoreline.
- Procedural forest diorama: fine evergreen needle silhouettes, wood grain, beveled terrace furniture, glass lanterns, layered rock, instanced grass, reflection lighting, ambient occlusion and restrained bloom. No external model or texture downloads.
- `describe_scene` exposes `selected_id`, `human_edits`, scene version and layout history. `query_scene` adds pagination and real world-space bounds.
- `arrange_scene` plans around the live camp and fixed objects before changing anything. Existing human edits and untagged objects stay fixed. Blocked arrangements fail without partial placement.
- `undo_layout` and `redo_layout` use a position journal. Objects moved later or rebuilt by import/reset are skipped. Human takeover during a layout interrupts affected movement; grabbing its camp stops the arrangement.
- Real provenance: WebMCP, local buttons and the guided tour are labeled separately. The actor label identifies the invocation path; it is not authentication of a remote model.
- Human camera takeover, reduced-motion handling, optional performance mode, five lighting moods, scene share links, general building tools and chess geometry.

## Rendering work and CPU use

The full cinematic image retains its resolution, ambient occlusion, bloom and shadow detail. A 60 FPS ceiling avoids unnecessary rendering on high-refresh displays. Static geometry is batched by material without removing triangles; only changed object transforms are recomputed. Sun shadows are cached until an object or light changes. Smoke is evaluated in one GPU particle draw, and lighting updates sky uniforms instead of uploading a repainted texture. Hidden tabs skip rendering.

`describe_scene.rendering` exposes actual frame rate, CPU submission time, draw calls, triangles and shadow updates. CPU submission time covers application work and graphics submission; it is not whole-machine CPU usage or GPU time. Real water reflection adds one view of the scene per visible pond; multiple ponds and large shared scenes can still be expensive.

## Tools (26)

| Purpose | Tools |
| --- | --- |
| Lofi session | `compose_lofi_scene`, `control_lofi`, `set_camera_motion` |
| Discover and inspect | `help`, `describe_scene`, `query_scene` |
| Cooperate around human placement | `arrange_scene`, `undo_layout`, `redo_layout` |
| Build and edit | `add_object`, `transform_object`, `set_material`, `scatter`, `delete_objects` |
| Direct the scene | `set_lighting`, `frame_camera`, `camera_path`, `set_ui`, `set_music` |
| Save and restore | `snapshot`, `undo`, `export_scene`, `import_scene` |
| Group operations | `batch` |
| Chess geometry | `board_square`, `chess_move` |

Registration in [src/webmcp.ts](src/webmcp.ts) uses `document.modelContext.registerTool({ name, description, inputSchema, annotations, execute }, { signal })`. Tools return an operation envelope containing `ok`, `operation_id`, `actor`, before/after scene versions, `applied`, `duration_ms` and a `result` or error. Mutating tools can reject stale observations through `expected_scene_version`. Animations settle before the call reports live values, except explicit bulk `add_object{animate:false}` and the background lofi/camera tools, which report acceptance immediately and expose ongoing state.

General edits use whole-scene snapshots. Cooperative arrangements have their own position journal; use **layout undo** to preserve later human work. Layout tools and background lofi/camera controls cannot be nested inside `batch`. Stop a lofi sequence before making ordinary scene edits; observation, undo and session controls remain available during construction. A running layout rejects competing tool mutations while still allowing mouse interaction and read-only queries.

## Run and verify

Use Node.js 22, as in CI. No environment variables or secrets are needed.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To check the production build and tool behavior:

```bash
npm run build
npm run test:animations
npm run test:lofi
npm run smoke
```

The smoke suite uses system Chrome if available, otherwise Playwright's Chromium. If neither is installed, run `npx playwright-core install chromium` first. CI installs Chromium and its system dependencies explicitly.

The suite starts its own free preview port and exercises every listed tool, including pointer placement, preserved camp coordinates, selective undo/redo, later edits, invalid calls, import validation, ordinary undo and stale versions. Results are written to `scripts/smoke-result.json`. It tests handlers through the labeled developer harness in Performance mode with software OpenGL. Native browser discovery and the cinematic view require the separate live checks in the [judge guide](docs/JUDGE-GUIDE.md).

The September 3 reviewed application revision `9bda5c3` passed the production build and **26/26 tool invocations and 58/58 semantic checks**, including compact-share navigation and import protections. Animation regressions and the deterministic lofi suite passed on the unchanged animation/sequence core, including 12 automatic cycles with bounded object disposal. Earlier native in-app-browser checks confirmed composition, state readback, next-scene control, human pause/resume and actual sound playback. The final native share round trip remains unverified because browser-tool access is blocked by admin-policy verification. These are separate evidence sources; see [the final review](docs/FINAL-REVIEW.md) for deployment, film and submission gates.

Native WebMCP requires a supporting browser/client. In Chrome 149+, enable `chrome://flags/#enable-webmcp-testing`, relaunch Chrome and connect a compatible agent. The status chip reports actual API availability. The scene and local controls also work without WebMCP. `?agent=1` exposes a clearly labeled developer harness for handler tests; it does not add a model connection.

## Demo production on macOS

The optional media helpers use ElevenLabs for narration, plus Swift/AppKit, `ffmpeg` and `ffprobe` for local production. After capturing real native-browser footage and its tool evidence as described in the [recording plan](docs/recording-plan.md), run these from the repository root:

```bash
npm run audio:elevenlabs -- --plan
npm run audio:elevenlabs
node scripts/encode-demo-capture.mjs
node scripts/assemble-demo.mjs
```

The narration uses **Lily — Velvety Actress** with ElevenLabs `eleven_v3`. `--plan` checks the script and cache without API calls or credentials. Generating missing tracks requires `ELEVENLABS_API_KEY` in the environment and makes paid API calls; matching cached takes are reused. The eight MP3 tracks retain character alignment and generation provenance for caption timing. The remaining commands encode existing timestamped frames and assemble a 135-second MP4 with captions and a poster in `scratch-submission-media`. Raw browser captures and `native-capture.json` are required inputs, kept outside the repository. These helpers do not automate browser capture, YouTube upload or Devpost submission. The exported candidate still needs the creator's complete watch-through and voice approval before publication.

## Code map

| Area | Source |
| --- | --- |
| Native registration, schemas and invocation contract | [src/webmcp.ts](src/webmcp.ts) |
| Scene queries and editing handlers | [src/tools.ts](src/tools.ts) |
| Human-preserving layouts and position journal | [src/layout.ts](src/layout.ts) |
| Background composition, scene recipes and camera direction | [src/lofi.ts](src/lofi.ts), [src/lofi-scenes.ts](src/lofi-scenes.ts), [src/camera-director.ts](src/camera-director.ts) |
| Pointer interaction and edit ownership | [src/interaction.ts](src/interaction.ts), [src/store.ts](src/store.ts) |
| Snapshots, import and share state | [src/snapshot.ts](src/snapshot.ts) |
| Procedural assets and rendering | [src/factory.ts](src/factory.ts), [src/lofi-assets.ts](src/lofi-assets.ts), [src/scene.ts](src/scene.ts) |
| Semantic smoke checks, timing regressions and CI | [scripts/smoke.mjs](scripts/smoke.mjs), [scripts/animation-regression.mjs](scripts/animation-regression.mjs), [scripts/lofi-regression.mjs](scripts/lofi-regression.mjs), [.github/workflows/ci.yml](.github/workflows/ci.yml) |

For changes, keep the local and WebMCP invocation paths consistent, preserve human edits during cooperative layouts, and update the tool table and judge instructions when behavior changes. Build and run the smoke suite before reviewing a release. The [submission checklist](docs/SUBMISSION-CHECKLIST.md) tracks the final revision, external video and release freeze.

## Limits

- The editable surface is flat at y=0; the layered island is art direction, without physics or terrain simulation.
- Layout adaptation applies to the starter scene's tagged paths, grove and lanterns around a camp. It is not a general-purpose layout solver. Fixed obstacles can make a request infeasible.
- A one-second scene operation does not imply a one-second model response. Agent discovery and reasoning time depend on the client; the film script distinguishes scene timing from edited agent waiting time.
- General snapshot undo replaces the whole scene. Only layout undo preserves unrelated later edits.
- Reduced-motion preference keeps the lofi camera still, removes growing-object animation and skips the scene-transition fade. Continuous motion can still be explicitly requested.
- Share links preserve cabin/pond geometry and materials, but not session timers, camera routes or audio playback.
- Materials are edited per object. Share links carry scene state, not the live undo journal or accounts, and can become long.
- Scene state lives in the current page. Keep the link copied by **Share** or returned by `export_scene`; exporting does not change the current URL. Opening that link restores the scene and then cleans the address bar before native tool registration. Bookmarking or reloading the resulting clean base URL does not retain the restored scene. There is no account-based cloud save or multi-user room.
- Chess tools provide geometry and animation, not a chess rules engine.
- Cinematic rendering costs more than performance mode; frame rate depends on hardware, viewport and scene size.

MIT licensed. Bundled DM Sans and Manrope fonts use their respective SIL Open Font Licenses in [public/fonts](public/fonts). The three music tracks were supplied by their creator, Thomas Werner; see [music credits](public/music/README.md). Built with TypeScript, three.js and Vite for [The WebMCP Challenge](https://webmcp.devpost.com/).
