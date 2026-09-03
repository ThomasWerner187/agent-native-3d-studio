# Agent-Native 3D Scene Studio

Copy-ready English Devpost fields. Publication and proof status are tracked separately in the [submission checklist](docs/SUBMISSION-CHECKLIST.md).

## Project name

Agent-Native 3D Scene Studio

## Elevator pitch

Build a little world with your browser agent. Place a pond and cabin yourself; let the agent grow a forest around your choices. Keep editing the same live scene together through WebMCP.

## Inspiration

I wanted an agent to take the other end of the canvas. I could place a pond, move a cabin or decide that one tree belongs somewhere else. The agent should understand those choices and help me build around them.

A quiet forest made that interaction tangible. Water, warm lanterns, slow camera movement and my own lofi music turn a technical experiment into a little place to spend time. The challenge is making the creative control shared: the person keeps the mouse, and the agent needs to know what changed.

## What it does

I place a pond and cabin in a live 3D scene. Then I ask a connected browser agent to add thirty pines around them while keeping the water and entrance clear. It reads the actual objects and uses semantic tools to add the environment around my placements. Stones and lanterns can follow in another instruction.

Every object remains editable. When I move one of the agent's trees, its identity stays the same and the scene records my change. The agent can read that new state before continuing. It can then adjust the light and start an endless cinematic camera around the world we made, without replacing the scene.

Scatter undo removes an agent's additions while preserving objects a person subsequently changed. An optional gallery also provides three authored lofi starting points. The central interaction is building together in the current scene.

## Why WebMCP fits

The canvas displays pixels, while object identities, positions, bounds and edit history live inside the page. WebMCP makes that state and the page's own actions discoverable to a browser agent in the same session.

The agent can observe, act and verify. A request such as “Keep my cabin here and build around it” maps to live object-aware operations. This lets the person keep working directly instead of handing the whole task away. A custom integration could expose similar capabilities; WebMCP provides the browser-facing discovery and execution contract.

## How I built it

The application uses TypeScript, three.js and Vite. It runs in the browser without an application account, backend or API key. The browser agent supplies the model connection. Geometry and surface textures are procedural, with fonts and music bundled locally.

Twenty-seven tools register through `document.modelContext.registerTool` with JSON schemas, annotations and executable handlers. They cover queries, object editing, scatter, lighting, camera movement, undo and sharing. Objects expose their creator, last editor, revision and human revision. Scene versions let the agent reject a plan made before a human changed the page.

Scatter plans against actual bounds and cabin entrance space before adding anything. It either places the requested count or reports that the available area is too crowded. Its journal supports selective undo. Separate camp-layout undo preserves later changes to positions; general undo restores a whole-scene snapshot.

The activity log distinguishes native WebMCP calls, local human actions and scripted previews. Tool results report what actually happened, including interruption. Camera motion runs in the background and remains observable without keeping a tool call open.

## Challenges and what I learned

Moving objects was the easy part. Preserving the meaning of a human edit during animations, cancellation and undo needed more care. “Thirty trees” must mean thirty live additions, and an undo should not silently discard an object I chose to move myself.

I learned to treat ownership, bounds, stale observations and truthful results as part of the product experience. A shared scene works when each participant can see what the other did and continue from there.

## Scope

The object library supplies procedural assets; the agent places and edits them. This is not arbitrary mesh or music generation. The ground is flat, and object bounds guide placement rather than a physics engine. The optional gallery consists of three authored recipes. Share links preserve the scene's objects and appearance, while playback, running timers and undo history remain local to the current page.

## Built with

WebMCP, TypeScript, three.js, Vite, WebGL, Netlify, Playwright. The demonstration narration uses ElevenLabs Lily; audio production is separate from the application.

## Links

- Live app: [agent-native-3d-studio.netlify.app](https://agent-native-3d-studio.netlify.app)
- Public source: [ThomasWerner187/agent-native-3d-studio](https://github.com/ThomasWerner187/agent-native-3d-studio)
- License: [MIT](LICENSE)
- Demo video: `[PUBLIC_YOUTUBE_URL]`

## Testing instructions

No application credentials or API key are required. Open the live app in a WebMCP-capable browser with a connected agent. In Chrome 149+, enable `chrome://flags/#enable-webmcp-testing`, relaunch and connect a compatible client. Confirm **WebMCP live · 27 tools**.

Click **Start empty**, then **Add pond** and **Add cabin**. Drag them into position yourself. Ask the connected agent:

> Read my scene, including the pond and cabin positions, bounds and human edits. Keep them exactly where I put them. Add thirty pine trees around them, keeping the water and cabin entrance clear. Verify the added count and my unchanged placements.

Add rocks and lanterns in a follow-up. Then move one of the agent-created trees by hand and ask:

> Read my selection and recent human changes. Keep the tree's new position. Give our scene soft moonlit lighting and start a slow continuous cinematic camera. Keep all object placements unchanged, and verify actual music playback.

Click **Enable sound** if the browser requires a gesture. Inspect actual requests and responses in Tool activity. For the optional undo test, use `undo_scatter` on the tree operation: untouched additions disappear while the tree you moved remains. The [judge guide](docs/JUDGE-GUIDE.md) provides the detailed checks.

Local controls and the developer harness exercise the page handlers but do not invoke an AI model. A browser reporting WebMCP unavailable cannot demonstrate native discovery there. The [review record](docs/FINAL-REVIEW.md) identifies verification still required for the final release.

## Development during the challenge

Application history begins on September 1, 2026, within the submission period. Dated commits record the original studio (`6ea0c7c`), operation contract (`00cc089`), cooperative layouts (`4729a8c`), and lofi/camera work (`0ed6909`). The final collaboration revision and release evidence belong in the [submission checklist](docs/SUBMISSION-CHECKLIST.md).
