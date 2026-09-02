# Agent-Native 3D Scene Studio — Devpost description

Live: https://agent-native-3d-studio.netlify.app · Code: https://github.com/ThomasWerner187/agent-native-3d-studio

A live three.js scene studio where an AI agent and a human work the same scene at the same time — the agent through 20 WebMCP tools (building, scattering, lighting, music, cinematic camera direction), the human through the mouse, neither ever blocking the other. Every agent action is a real, inspectable WebMCP tool call; every mutation is reversible.

## Why this use case is a strong fit for WebMCP

Canvas applications expose almost no reliable semantic structure to DOM- and accessibility-tree-based agents: a WebGL canvas is a single empty `<canvas>` element — no ids, no queries, no reversible actions. Vision-driven agents can drag pixels, but they cannot verify what they changed. All state (objects, transforms, materials, camera, light) lives invisibly in the scene graph. That makes this project the sharpest possible test of what WebMCP actually is: most demos put agent tools on top of pages an agent could already drive through the DOM, so WebMCP is an accelerant there. Here it is the **prerequisite**. Without WebMCP, this studio is not slow for an agent — it does not exist for the agent. And the pattern is not specific to 3D: CAD, GIS and mapping, medical imaging, DAWs, video editors, data-visualization dashboards, game engines and canvas-based design tools are all agent-inoperable today for exactly the same reason. This studio proves the smallest end-to-end path from "closed canvas" to "agent-native application", with the same properties those tools will need: precise structured operations, live state feedback, and human-safe reversibility.

## How it creates a better experience

For the human: the agent is not a pointer-bot fighting you for the mouse. It works through structured calls while you keep dragging, clicking and orbiting — "Human took control" appears the moment you grab the camera mid-flight, and the agent reports `applied: false` instead of pretending. Every call appears in an on-page tool log told in plain language ("Planting 40 trees", "Setting the mood: golden_hour"), with the full JSON one click away. Every mutation auto-saves a restore point: `undo` steps back, ↺ resets, `export_scene` turns the scene into a share link anyone can open — no backend, no setup.

For the agent: 20 tools with typed schemas, enums instead of free text (`piece: pawn|rook|knight|bishop|queen|king`), descriptive self-correcting errors, `scene_version` + `operation_id` on every mutation, side-effect annotations, and a `help` tool that returns the full playbook in one call. Tool descriptions carry the exact in-page invocation recipe, so even harnesses that drive Chrome without a WebMCP client succeed on their first call.

## What people and agents can now do together that was difficult or impossible before

- **Simultaneous, conflicting collaboration on one live 3D scene.** The agent directs a 4-shot cinematic camera flight while you drag an object through frame; your grab wins, visibly, and the tool says so. Two users, one state, no lock dialog.
- **One-sentence world building with guardrails.** "Scatter 40 trees on the left half but keep the path and seating clear" is ~20 minutes of manual click-place-adjust work — and literally impossible for an agent without WebMCP (there is nothing to click). With `scatter` + `exclusion_zones` it is seconds, seeded and reproducible.
- **Agent chess with directed cinematography.** `board_square` gives the geometry, the agent supplies the rules, `chess_move` performs the move with a small lift and flies a follow camera to the mover's side. The agent plays against itself while switching perspectives — as a live scene, not a log.
- **Scenes as artifacts.** `export_scene` packs the entire state into a URL; anyone — judge, friend, another agent — opens it and sees the exact scene, then modifies it with their own agent.
- **Mood, not just geometry.** The agent sets lighting presets, turns on lofi (`set_music`, self-made Suno tracks), hides the HUD and hands you a finished cinematic shot.

## How WebMCP was implemented

- **Registration:** `document.modelContext.registerTool({name, description, inputSchema, execute, annotations}, {signal})` — 20 tools registered at boot behind a feature check; the page shows a live status chip and an on-page tool log of every call.
- **Schema design:** enums wherever hallucination is possible (object types, chess pieces, lighting presets, camera angles); ids *and* human-readable names as targets; strict validation in code with descriptive, self-correcting errors ("Ambiguous target "tree" matches 3 objects — use an id").
- **The reliability contract:** a uniform envelope on every invocation — `{ok, operation_id, actor, scene_version_before, scene_version_after, applied, duration_ms, result|code+error}` — generated centrally. Mutating tools `await` their animation and report the *live rendered* values, so an agent's follow-up read always matches its last write. Human interruption is reported as `applied: false` with live state — never as a fake success.
- **Concurrency & cancellation:** mutating tools accept `expected_scene_version`; a stale call is rejected with a typed `stale_scene` error instead of overwriting the human's work. Cancellation signals propagate through the invocation layer into running animations, and `batch` is atomic: any failed operation rolls the whole batch back to one snapshot.
- **Annotations & reversibility:** `readOnlyHint` on query tools, `idempotentHint` on state-setting tools, `destructiveHint` on destructive ones; every mutation auto-captures a restore point (`undo`, `snapshot`, ↺ reset).
- **`batch` — built from measurement:** live testing showed agent wall-clock is dominated by model turns, not the scene: 8 tool calls took 3 min 12 s while scene animation totaled under 3 s. `batch` runs 1–200 operations in one call with one snapshot and whole-batch undo — the biggest agent-speed lever we found, expressed as tool design.
- **Discovery for every harness:** `help` returns the playbook in one call; a `<script id="agent-manifest">` in the DOM lists all tools for DOM-scraping agents; the console carries the standard `getTools()` + `executeTool()` recipe; and every tool description ends with that exact recipe, because live testing showed agents read the `getTools()` listing first.

Stack: TypeScript + three.js + Vite, no backend. `npm run smoke` drives all 20 tools in real headless Chrome (20/20 verified, also run in CI); `export_scene`/`import_scene` links let anyone open a scene without installing anything. MIT licensed.
