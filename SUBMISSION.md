# Agent-Native 3D Scene Studio

Copy-ready English Devpost fields. The final application, native evidence and video are complete; publication and the final Devpost checks remain tracked in the [submission checklist](docs/SUBMISSION-CHECKLIST.md).

## Project name

Agent-Native 3D Scene Studio

## Elevator pitch

Take a little break with your browser agent. Place a cabin and pond, grow a forest together, shape a path, then settle into warm light, lofi music and an endless camera. One scene, shared creative control through WebMCP.

## Inspiration

I wanted to give myself and my agent a short break from getting things done. What if we built somewhere to breathe?

I could choose where a cabin and pond belong. The agent could do the patient work of planting forty trees and placing small lights. Then I could move a couple of stones, change my mind, and ask it to help again. That simple back-and-forth became the project: a quiet place we make together, where the person keeps the mouse and the agent understands what changed.

## What it does

A person places a cabin and pond in a live 3D canvas, then writes an idea into the shared request panel. The connected browser agent reads that request alongside the actual objects, positions and edit history. It can grow a layered forty-tree forest behind the cabin and add warm lights while preserving the human's placements.

A follow-up request adds a gently curving stepping-stone path from the porch toward the pond. Every stone remains individually editable. When the person moves two of them, the agent reads those changes before continuing from the same scene.

The last request creates a cozy evening: warm windows and lanterns, the creator's lofi music, and a close, slow camera that moves continuously around the cabin and water. The interface fades away, leaving a small moment to enjoy what we built.

Selective undo removes unchanged agent additions while preserving later human edits. An optional gallery offers three authored starting worlds; the main experience grows around choices made in the current canvas.

## Why WebMCP fits

A 3D canvas shows pixels. Its object identities, bounds, positions and edit history live inside the page. WebMCP exposes that meaningful state and the page's own actions to the connected browser agent.

The agent can read a request, inspect the live scene, make a change and verify the result. “Keep my cabin here” refers to the same object the person just moved. “Keep my stone edits” can be checked against actual positions and human revisions. Shared control matters more than generating a complete scene in one turn: each participant can respond to what the other just did.

The approach applies beyond a little forest. Any rich canvas with domain objects can expose useful actions and current state without asking the agent to reconstruct everything from pixels.

## How I built it

The application uses TypeScript, three.js and Vite. It runs in the browser without an application account, backend or application API key. The connected browser agent supplies the model. Geometry and surface textures are procedural; fonts and creator-supplied music are bundled locally.

Twenty-nine tools register through `document.modelContext.registerTool` with schemas, annotations and executable handlers. They cover scene queries, object editing, grove and path construction, lighting, music, camera movement, presentation, undo and sharing. Objects expose creator, last editor, revision and human revision. Scene versions reject a plan made before a person changed the page.

The grove and path tools work from the current cabin and pond geometry. They plan against real bounds, preserve existing objects and leave the cabin approach open. The grove favors depth behind the cabin and sparse framing at the sides. The path creates separate stones that remain editable after the operation. If an arrangement cannot fit, it reports the problem without partially adding the planned objects.

The camera can focus on the cabin and pond rather than the entire outer forest. A gentle repeating drift keeps the scene's strongest view in frame. Its state remains observable while motion runs in the background, and human camera interaction pauses it.

The activity log distinguishes actual native WebMCP calls, human input and local previews. The shared request panel records the person's idea for the connected agent to read; it does not impersonate an additional model inside the application.

## Challenges and what I learned

A correct object count does not make a good scene. Forty trees need depth and variation, an open foreground, a clear entrance and somewhere for the eye to rest. The camera has to frame the home and water closely enough to feel inviting.

Shared editing also needs dependable behavior. A human's small adjustment must survive the next agent action. Animations, cancellation, stale observations and undo all need to respect that. I learned to make ownership and current state part of the creative experience, alongside light, composition and timing.

## Scope

The library supplies procedural assets; the agent arranges and edits them. The project does not generate arbitrary meshes or new music. Placement uses object bounds on a flat ground plane. The optional gallery contains three authored recipes. Share links preserve scene objects and appearance; running playback and undo history belong to the current page.

## Built with

WebMCP, TypeScript, three.js, Vite, WebGL, Netcup, Playwright. The demonstration uses ElevenLabs Lily v3 narration, creator-supplied Suno music and aligned English subtitles. Film production is separate from the application.

## Links

- Live app: [studio.wernerverse.de](https://studio.wernerverse.de/)
- Public source: [ThomasWerner187/agent-native-3d-studio](https://github.com/ThomasWerner187/agent-native-3d-studio)
- License: [MIT](LICENSE)
- Demo video: `[PUBLIC_YOUTUBE_URL]`

## Testing instructions

The hosted release currently requires HTTP Basic authentication; testing credentials are supplied separately and must be included in the private judge instructions before submission. The application itself needs no account or API key. Open [the studio](https://studio.wernerverse.de/) in a WebMCP-capable browser with a connected agent. In Chrome 149+, enable `chrome://flags/#enable-webmcp-testing`, relaunch and connect a compatible client. Confirm **WebMCP live · 29 tools**.

Click **Start empty**, then **Add pond** and **Add cabin**. Place them beside one another with room between the porch and water. In **Your next idea**, write and share:

> Add forty trees, mostly as a forest behind my cabin, and warm garden lights around the clearing. Keep my cabin and pond where I placed them, with an open view and a clear entrance.

Ask the connected agent to read the shared request and live scene, then act on it. Follow with a request for a curved stepping-stone path from porch to pond. Move two stones yourself and ask the agent to read your latest changes before setting a cozy evening, music and a close endless camera. Ask it to hide the controls when finished.

Click **Enable sound** if the browser requires a gesture. Inspect actual calls and responses in Tool activity. The [judge guide](docs/JUDGE-GUIDE.md) gives exact checks for object preservation, both human edits, playback, camera control and selective undo.

Local controls and the developer harness exercise page handlers without invoking an AI model. A browser reporting WebMCP unavailable cannot demonstrate native discovery there. Check [FINAL-REVIEW.md](docs/FINAL-REVIEW.md) for the verified native capture, film export and release evidence.

## Development during the challenge

Application history begins on September 1, 2026, within the submission period. Dated commits record the original studio (`6ea0c7c`), operation contract (`00cc089`), cooperative layouts (`4729a8c`), and lofi/camera work (`0ed6909`). The current zen co-creation work adds the designed grove, editable path, shared requests, close camera and revised visual presentation. Final commit and release evidence belong in the [submission checklist](docs/SUBMISSION-CHECKLIST.md).
