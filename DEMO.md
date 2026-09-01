# Demo & Video Kit

Material for the 3-minute submission video and live demos. Beat sheet per submission requirements (< 3 min, with audio).

## Video beat sheet

| Time | Shot | Action / narration |
|------|------|--------------------|
| 0:00–0:15 | **The hook.** Press **“▶ Watch the agent build”**. | “This is an agent building a world — through 20 structured tools, while I keep the mouse.” Tool log fills with real calls: batch-planted avenue, golden hour, lofi, cinematic camera flight. Grab the camera mid-show: “Human took control” — that's the collaboration. |
| 0:15–0:30 | **The problem.** Open DevTools → Elements. Hover the canvas. | “This is what an agent sees when it opens a 3D tool: one empty `<canvas>`. No DOM, no buttons, nothing to scrape. Every object, every light lives in the scene graph — invisible. Without WebMCP this app isn't slow for an agent — it's closed.” |
| 0:20–1:20 | **The collaboration.** Inspector open next to the studio. Prompt: *“Build a cozy camp spot: a table with a chair, a lamp next to it, and a window facing the seating area. Make it evening.”* | Objects pop in while you talk. Then — while the agent is still calling tools — **grab the camera and drag an object with the mouse.** Say: “The agent works through WebMCP tools on the live scene. My mouse never stops working. We're two users on one state.” |
| 1:20–2:10 | **The proof.** Prompt: *“Scatter 40 trees across the left half of the meadow, but keep the stepping stones and the seating area completely clear.”* Orbit the camera during the staggered spawn. | “Forty trees, exclusion zones respected. This takes twenty minutes by hand — and by hand is the ONLY other way, because a canvas is unreachable for agents.” |
| 2:10–2:40 | **Trust & transparency.** Show the Tool Log panel, then `chrome://webmcp-internals` or the Inspector's tool list. Call `describe_scene` and point at the JSON. Click ↺ (reset) after an agent mistake — or `undo`. | “Every call is visible to the user. Every mutation is reversible. Agents report only after the scene actually settled — scene_version and operation_id included.” |
| 2:40–3:00 | **The reveal.** Agent: *“Hide the UI, then fly a cinematic tour: window → lamp → hero shot of the table.”* HUD fades, camera glides, hold on the final shot. | “The agent isn't clicking — it's directing. WebMCP turns the open web into an agent platform: today it made a canvas collaborative, tomorrow every site gets an agent interface designed by the people who know it best.” |

## Recording checklist

- [ ] Chrome profile with `chrome://flags/#enable-webmcp-testing` enabled (relaunch first!)
- [ ] Model Context Tool Inspector extension installed
- [ ] Window ~1600×900, browser zoom 100%, DevTools theme dark
- [ ] Fresh load before each take (the ↺ reset button also restores the starter scene)
- [ ] Mic level check; say the tool names out loud — they match the Tool Log entries on screen
- [ ] Screen capture at 30 fps minimum (spawn animations + camera flies are the product)

## Reproducible demo prompts (from boot state)

1. `Set the mood to golden hour, then frame the scene like a movie still.`
2. `Make it night and let the lamp glow warm, then put some lofi on.`
3. `Build a cozy camp spot: a table with a chair, a lamp next to it, and a window facing the seating area.`
4. `Scatter 40 trees across the left half of the meadow, but keep the stepping stones and the seating area completely clear.`
5. `What's in the scene right now? Then move the table two meters toward the window and give me a hero shot of it.`
6. `Hide the UI, then fly a cinematic tour: start on the window, sweep past the lamp, and end on a hero shot of the table.`
7. `Scatter 50 trees on the right side using seed 42 — I want to be able to recreate this exact forest.`
8. `Build the whole camp in one go — table, chair, lamp, warm light — and end on a hero shot.`  (exercises `batch`)
9. `Package this scene as a share link I can send to a friend.`  (exercises `export_scene`; the ⧉ button copies the same link)

(For prompt 1 after boot the scene already *is* golden hour — the agent should just frame; if you want visible change use: `Set the mood to moonlit, then back to golden hour, then frame the scene like a movie still.`)

## ✅ Verified chess sequence (tested end-to-end, 2026-09-01)

These are the exact tool calls the chess prompts produce — all verified working:

```
1. add_object    { type: "chessboard", position: {x:0.5, z:2.5}, rotation_y: 15, name: "chessboard" }
2. board_square  { board: "chessboard", square: "e2" }              → world position of e2
3. add_object    { type: "chess_piece", piece: "pawn", side: "white", position: <e2>, name: "white pawn e2" }   // piece: pawn|rook|knight|bishop|queen|king, side: white|black
4. set_material  { targets: ["black pawn a7", …], color: "#3a3632" } (black set)
5. board_square  { square: "e4" }                                    → world position of e4
6. transform_object { targets: ["white pawn e2"], op: "move", mode: "absolute", x: <e4.x>, z: <e4.z> }
7. camera_path   { keyframes: [ {target:"chessboard", angle:"front"}, {target:"chessboard", angle:"side"} ] }
8. delete_objects { name_contains: "pawn" }                          → removes every pawn, undoable
9. undo          {}                                                  → pawns are back
```

Verified results: move lands exactly on the square coordinate (±0.01), `delete_objects` removed 9/9 pawns, `undo` restored all 9, camera path completed 2/2 shots.

## Manual tool check (Inspector → manual execute, no LLM needed)

```json
{ "tool": "add_object", "input": { "type": "tree", "position": { "x": -2, "z": 1 }, "name": "pine" } }
{ "tool": "set_lighting", "input": { "preset": "night_neon", "intensity": 1.2 } }
{ "tool": "scatter", "input": { "type": "rock", "count": 30, "area": { "center_x": -12, "center_z": 6, "width": 14, "depth": 10 }, "exclusion_zones": [{ "x": -12, "z": 6, "width": 5, "depth": 5 }] } }
{ "tool": "frame_camera", "input": { "target": "scene", "angle": "hero", "focal_length": 50 } }
{ "tool": "describe_scene", "input": {} }
{ "tool": "undo", "input": {} }
```


## Agent speed test (Codex / CDP-only harness)

Baseline (2026-09-01, before the description-recipe fix): **3m 12s** end-to-end for
"night_neon + chessboard + white king + black queen + hero shot" — 8 successful tool
calls, zero scene errors. The wall-clock went into model turns, not the scene
(scene animations total <3s). Wasted turns observed:
1. Tab resolution (ChatGPT-internal, not page-fixable).
2. Failed first `executeTool()` — passed the tool *name*; the API needs the
   registered tool *object* from `getTools()`. Cost: fail + recovery turn.
3. One turn reading tool schemas.
The agent never looked at the console recipe, the DOM manifest or `help` —
it read the `getTools()` listing. Fix shipped: every tool description now ends
with the exact invocation recipe (all within the 500-char budget).

**How to re-run the timed test (~30 s of setup):**
1. Reload https://agent-native-3d-studio.netlify.app (green chip "WebMCP live · 20 tools").
2. Open the ChatGPT sidebar → New chat.
3. Paste and send:
   > Drive the 3D scene in the current browser tab using its WebMCP tools. Steps:
   > (1) Switch the lighting to the night_neon preset. (2) Add a chessboard, then
   > place a white king and a black queen on two of its squares. (3) Frame the
   > chessboard for a hero shot. Report each tool call and its JSON result.
4. Measure: sidebar "You said" timestamp → first `ok:true` in the page Tool Log.
   Compare against 3m 12s; check the sidebar transcript for a failed-call turn
   (there should be none now).

**Retro questions for Codex** (paste into the same chat after the run):
> Answer briefly, don't touch the scene: (1) What cost you the most turns in that
> run? (2) The tool descriptions each end with a call recipe now — did you see and
> use it? (3) What single page change would cut your time-to-first-successful-call
> the most?

## Current feature showcase (20 tools — smoke-verified 20/20 via `npm run smoke`)

- **Watch the agent build** (button): the curated 25 s show — best first beat, zero setup.
- **batch**: whole setups in one call — "the measured lesson: turns are the bottleneck, not the scene".
- **export_scene / ⧉ button**: scene becomes a share link that opens for anyone, no WebMCP — persistence without a backend.
- **chess_move + board_square**: agent-vs-itself chess with follow/hero cameras — the most surprising beat.
- **set_music**: three self-made Suno tracks; "…and put some lofi on" lands every time.
- Full tool smoke test: `npm run smoke` → `20/20 tools verified` (`scripts/smoke-result.json`, CI runs it on every push).

## Driving Codex/ChatGPT when the harness cannot inject WebMCP tools

There are two different Codex surfaces, and they behave differently:

- **The ChatGPT sidebar inside Chrome** — has the "Chrome control skill" and can evaluate JS in the page. It finds the tools itself (`getTools()` + `executeTool()`); a plain prompt like *"Drive the 3D scene using its WebMCP tools…"* works (verified: 8-call neon-chess run, 3m12s baseline).
- **Desktop/Codex sessions without injection** — they read the page (they quote the green "WebMCP live · 20 tools" chip) but have no injected tool surface, and some will *refuse* instead of using the in-page path (observed: "this session exposes none of those tools for invocation"). The page now carries the recipe as readable text — the **agent bridge** in the tool-log panel and the status chip tooltip — so point the agent at it explicitly.

**Prompt that works for the refusing surfaces** (say "evaluate JavaScript in the page", never just "use the webmcp tool"):

> Using only this page's WebMCP tools — callable from the page's JS context:
> `const mc = document.modelContext; const tools = await mc.getTools(); const call = (name, args) => mc.executeTool(tools.find(t => t.name === name), JSON.stringify(args));`
> First run `await call("help", {})` and read the playbook. Then, still without any DOM clicks:
> 1. Delete the pixel word "OPENAI" (`delete_objects { name_contains: "OPENAI px" }`) and build the word "THOMAS" the same way (boxes named "THOMAS px N", `animate: false`, same warm glow via one `set_material` over the new names).
> 2. Place 2 more chess pieces on the forest board (`add_object type:"chess_piece"` with `piece` and `side`), and play 2 real moves with `board_square` + `chess_move`.
> 3. Finish on a top hero shot of the board.

Never write "use the webmcp tool" (singular) — agents look for a literal tool named "webmcp", find none, and refuse.
