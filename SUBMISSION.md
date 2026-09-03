# Agent-Native 3D Scene Studio

Copy-ready English fields for Devpost. Release verification and the remaining submission steps are in [the submission checklist](docs/SUBMISSION-CHECKLIST.md).

## Project name

Agent-Native 3D Scene Studio

## Elevator pitch

An endless lofi retreat, directed by your browser agent. Watch little worlds grow, linger and change through WebMCP, while you keep the mouse and the final say.

## Inspiration

I wanted a little world that could keep unfolding while I work or unwind: warm lanterns, quiet water, slow camera movement and music. Asking an agent to direct it should feel like handing it the other end of the canvas. I could explore or place something by hand; it could understand that choice and work around it.

A 3D scene is a useful place to try this. Its objects, positions and edit history live behind a WebGL canvas. An agent looking at the page does not automatically know which object I selected, what I just moved, or how to undo its own work without erasing mine.

I built a small scene studio around that problem, with a quiet forest as the place to experiment.

## What it does

Ask a connected browser agent for an endless moonlit retreat. A cabin, pond, pines and lanterns appear gradually, the local music fades in, and a cinematic camera keeps drifting. Enable cycling and the world lingers before the next scene grows into place. Three authored recipes—Lakeside Cabin, Lantern Grove and Island Hideaway—repeat through the session.

The agent can choose a scene, mood, seed, build pace and hold duration, or ask for the next scene immediately. I can grab the camera at any time to pause the whole sequence, resume when ready, stop it to edit, or undo the session.

There is a second, more practical interaction in the starter scene. I drag the wooden camp somewhere new, then ask the agent to arrange the surroundings. It reads the actual camp position and adapts the tagged path, grove and lanterns around it. My placement stays put. If I move a lantern afterward, layout undo restores the agent's positions while keeping my later edit.

The intended audience is people making small ambient scenes and developers exploring agent support in visual editors. This is a working example of shared creative control, rather than a replacement for a full 3D modeling package.

## Why WebMCP fits

WebMCP makes the page's own operations discoverable in the same browser session. The agent can read stable object ids, exact positions, selection and human-edit history; call a semantic action; and check the resulting state. That is much more direct than trying to infer scene structure and edit intent from pixels.

The useful part is the handoff: “Keep what I placed; change the things around it.” The application knows how to protect those choices and exposes that behavior to the agent. A custom integration could offer similar control. WebMCP supplies a shared browser interface for discovering and using it.

## How I built it

The app uses TypeScript, three.js and Vite. It runs entirely in the browser, with no application login, server or API key. Geometry and surface textures are procedural; fonts and three music tracks are bundled locally. The browser agent supplies the model connection.

Twenty-six tools register through `document.modelContext.registerTool` with JSON input schemas, side-effect annotations and executable handlers. They cover scene queries, object editing, lighting, camera direction, composition, layout, export/import and undo.

The lofi tool returns a session id immediately. Build progress, the next scene, remaining hold time, camera motion and actual audio playback remain observable through `describe_scene`. `control_lofi` pauses, resumes, stops or advances the sequence. Finite edits report their resulting state. Operation ids, scene versions and stale-state checks help the agent detect when a human has changed something since its last observation.

The activity log separates WebMCP calls, local human actions and the scripted guided tour, with expandable arguments and results. Layout undo has its own position journal; ordinary undo restores a whole-scene snapshot.

## Challenges and what I learned

Making objects move was the easy part. Making tool results truthful during animation, interruption and later human edits took more care. I had to treat cancellation, stale observations and undo as part of the interaction design.

I also separated a long-running atmosphere from a tool call. A camera that keeps moving should not keep the agent waiting forever. The background session now exposes progress and controls instead.

## Scope

The lofi worlds are three authored procedural recipes configured by mood, seed and timing. They do not generate arbitrary meshes or new music. Layout adaptation works on the starter diorama's tagged objects; it can reject a blocked arrangement. Scene links preserve the objects and appearance, while session timers, audio playback and undo history stay local to the current page.

## Built with

WebMCP, TypeScript, three.js, Vite, WebGL, Netlify, Playwright.

## Links

- Live app: [agent-native-3d-studio.netlify.app](https://agent-native-3d-studio.netlify.app)
- Public source: [ThomasWerner187/agent-native-3d-studio](https://github.com/ThomasWerner187/agent-native-3d-studio)
- License: [MIT](LICENSE)
- Demo video: `[PUBLIC_YOUTUBE_URL]`

## Testing instructions

No credentials or API key are required. Open the live URL in the ChatGPT desktop app's WebMCP-capable in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled and a compatible browser agent. In Chrome, relaunch after changing the flag. The app's status should show **WebMCP live · 26 tools**.

Ask your connected agent:

> Read the scene tools, then create an endless moonlit lofi retreat. Use compose_lofi_scene with scene lakeside_cabin, cycle true, hold_seconds 180, build_seconds 20, seed 42, a cinematic camera and music. Read describe_scene afterward and report the real progress, next scene and whether sound needs a click.

The call starts a background build. Leave the page visible; a cabin, pond, forest and lanterns appear. At completion, the camera keeps moving and the hold countdown begins. Ask the agent to use `control_lofi` with `action:"next"` to see a scene change without waiting three minutes. If audio needs a gesture, click **Enable sound**. Drag the empty canvas to pause the sequence, then click **Resume**.

For the cooperation test, click **Reset**, drag the wooden camp, and ask:

> Read my selection and human edits. Keep the camp where I placed it. Use arrange_scene around that camp with the current expected_scene_version, then read the scene again to verify its position.

After arrangement, move a lantern yourself and click **Undo layout**. The layout positions revert while the camp and your later lantern edit remain. Full instructions and expected results: [Judge guide](docs/JUDGE-GUIDE.md).

**Create a lofi scene**, **Try layout** and **Guided tour** also provide local previews. They do not invoke an AI model. A browser that reports WebMCP unavailable can preview the scene, but it cannot demonstrate native agent tool discovery there.

## Development during the challenge

The repository's application history begins on **September 1, 2026**, within the August 25–September 3 submission period. Dated commits record the initial WebMCP studio (`6ea0c7c`), the operation contract and transactional tools (`00cc089`), cooperative diorama layouts (`4729a8c`) and lofi sessions with continuous camera direction (`0ed6909`). The final reviewed revision is recorded in the [submission checklist](docs/SUBMISSION-CHECKLIST.md).
