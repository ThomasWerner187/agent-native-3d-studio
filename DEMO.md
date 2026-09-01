# Demo & Video Kit

Material for the 3-minute submission video and live demos. Beat sheet per submission requirements (< 3 min, with audio).

## Video beat sheet

| Time | Shot | Action / narration |
|------|------|--------------------|
| 0:00–0:20 | **The problem.** Open DevTools → Elements. Hover the canvas. | “This is what an agent sees when it opens a 3D tool: one empty `<canvas>`. No DOM, no buttons, nothing to scrape. Every object, every light lives in the scene graph — invisible.” |
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

## The five reproducible demo prompts (from boot state)

1. `Set the mood to golden hour, then frame the scene like a movie still.`
2. `Make it night and let the lamp glow warm.`
3. `Build a cozy camp spot: a table with a chair, a lamp next to it, and a window facing the seating area.`
4. `Scatter 40 trees across the left half of the meadow, but keep the stepping stones and the seating area completely clear.`
5. `What's in the scene right now? Then move the table two meters toward the window and give me a hero shot of it.`
6. `Hide the UI, then fly a cinematic tour: start on the window, sweep past the lamp, and end on a hero shot of the table.`
7. `Scatter 50 trees on the right side using seed 42 — I want to be able to recreate this exact forest.`

(For prompt 1 after boot the scene already *is* golden hour — the agent should just frame; if you want visible change use: `Set the mood to moonlit, then back to golden hour, then frame the scene like a movie still.`)

## ✅ Verified chess sequence (tested end-to-end, 2026-09-01)

These are the exact tool calls the chess prompts produce — all verified working:

```
1. add_object    { type: "chessboard", position: {x:0.5, z:2.5}, rotation_y: 15, name: "chessboard" }
2. board_square  { board: "chessboard", square: "e2" }              → world position of e2
3. add_object    { type: "chess_piece", position: <e2>, name: "white pawn e2" }
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
