# Agent-Native 3D Scene Studio

**You move it. The agent adapts.**

A person drags a wooden camp to a new location in a detailed forest diorama. A browser agent reads that live placement through WebMCP and rearranges the path, pines and lanterns around it. The person's decision stays exactly where they left it. Undo the arrangement, and later human edits still remain.

Live: https://agent-native-3d-studio.netlify.app · Source: https://github.com/ThomasWerner187/agent-native-3d-studio

## Why WebMCP fits

The application state lives in a three.js scene graph. The canvas does not expose stable object ids, exact transforms or human-edit history through the DOM. WebMCP lets the page publish a structured state-and-action contract directly in the shared browser session: observe the scene, perform an operation, inspect its result.

Other custom APIs could offer similar control. Our contribution is an implementation of that shared contract through the browser's WebMCP interface, with visible provenance and cooperative undo.

## The experience

The diorama uses authored procedural assets: detailed pines, wood-grain terrace planks, beveled furniture, glass lanterns, instanced grass and a layered rock island. Reflection lighting, ambient occlusion and bloom provide a cinematic desktop view; performance and reduced-motion modes support lighter interaction.

The human keeps the mouse while an agent works. The activity rail distinguishes actual WebMCP invocations, local human actions and the scripted guided tour. Expanding an entry reveals the original tool arguments and result. Local preview controls do not pretend to be an AI.

## Implementation

Twenty-three tools register through `document.modelContext.registerTool`, including queries, construction, material and lighting edits, camera direction, scene export/import and cooperative arrangement.

- `describe_scene` reports selection, human edits, scene version and layout history; `query_scene` provides pagination and real bounds.
- `arrange_scene` reads the current camp pose, searches around fixed obstacles and preserves human-edited objects. Infeasible plans return an error before placement.
- `undo_layout` and `redo_layout` journal positions separately from whole-scene snapshots. They skip objects edited later, preserving materials and unrelated work.
- Results include invocation provenance, operation id, before/after versions, applied status and execution time. Stale-version checks reject outdated plans. Human takeover interrupts movement.
- General editing tools support snapshots and batch operations. Share links serialize the scene for viewers without WebMCP.

TypeScript + three.js + Vite; no application backend. Geometry and surface textures are generated locally. MIT license. The smoke suite exercises every tool and verifies live behavior, including actual pointer placement and selective undo.

## Scope and presentation

The headline clip is an edited real agent session. Agent discovery/reasoning latency is separate from scene animation. The guided tour is labeled as a local script. Layout adaptation operates on the diorama's tagged objects around a camp; it is not a general solver, physics engine or claim that other automation approaches cannot work.
