# A little world, built together

**Target film: 2 minutes 15 seconds.** English narration, visible product use and at least one real native WebMCP request and response. This document is a recording script; it is not evidence that a film has been recorded or uploaded. Capture and export checks are in [the recording plan](docs/recording-plan.md).

## Narration and picture

The same shot-by-shot script is available as [video-narration.json](docs/video-narration.json) for narration and caption production.

The production narration uses **Lily — Velvety Actress**, synthesized with ElevenLabs `eleven_v3`. Eight generated segments leave room for pauses and music in the fixed 135-second edit. Character alignment from the generated takes supplies caption timing; the audio keeps its original speed.

| Time | Picture | English narration |
| --- | --- | --- |
| 0:00–0:12 | Open on a moving moonlit cabin beauty shot. Show the project title briefly, then the real browser-agent prompt. | “A quiet cabin, warm lanterns, soft music. A little world to unwind in — built together with a browser agent.” |
| 0:12–0:30 | Show native discovery and compose_lofi_scene with scene lakeside_cabin, mood moonlit, build_seconds 20, seed 42, cycle true, hold_seconds 180, camera cinematic and music true. Keep the genuine result readable. | “I ask my agent for an endless moonlit retreat. Through WebMCP, it discovers the studio's tools and chooses the scene, mood, build pace, camera, and music.” |
| 0:30–0:48 | Play the real gradual pond, cabin, forest and lantern build without speed changes. Show actual audio playback or the sound-unlock click. Finish with a continuous moving camera shot. | “Water appears. A cabin arrives. Pines grow, and lanterns glow. These are live, editable three-dimensional objects. The camera drifts while my own lofi music plays.” |
| 0:48–1:04 | Show the real describe_scene result alongside the visible scene and sequence progress. Keep scene, sequence, camera_motion and music state readable. | “The agent gets a session ID straight away. It can read build progress, the next scene, camera motion, and real audio playback — while the world keeps moving.” |
| 1:04–1:28 | Show a genuine control_lofi call with action next. Record the transition and the next recipe's build. Use the initial 20-second build setting and allow the resulting construction to remain visible. | “Now I ask for the next scene. One WebMCP call starts a gentle transition, and a new world grows. Lakeside Cabin, Lantern Grove, and Island Hideaway can keep cycling, with time to linger in each.” |
| 1:28–1:42 | Show the named scene, next-scene countdown and continuous camera. Briefly reveal the editable objects and tool activity without suggesting arbitrary text-to-mesh generation. | “The agent can change the pace, advance the scene, or pause and stop. When it stops, every built object stays here, ready to edit.” |
| 1:42–1:56 | Show a manual canvas drag, paused full-session state and a real resume. If showing undo, preserve its actual response and return to a previously captured live beauty shot with an explicit cut. | “I still have the mouse. Grabbing the canvas pauses the whole sequence. I can explore, resume when I'm ready, or undo the session.” |
| 1:56–2:15 | Show the real registration source briefly, then finish on a moving clean scene with the project title and https://agent-native-3d-studio.netlify.app. | “TypeScript, three.js, and twenty-six WebMCP tools. Real scene state, beyond the pixels. No app login — just shared creative control, and a little world to slow down in.” |

Allow natural pauses and room to hear the ambience. Keep the final film below three minutes, including titles and credits. If cuts remove agent waiting time, display **Edited for length; scene actions shown live**. The 20-second setting controls the scene reveal, not model response time.

The film is a montage of multiple real WebMCP sessions, including a separately recorded build with the same scene parameters. Show **Edited demo · multiple live WebMCP sessions** clearly at the opening and on the native evidence cards. Keep the original arguments and results for each take. The scene-transition section shows a real `next` operation continuing its own session; the montage does not claim one uninterrupted recording.

## Prompts for the recorded agent

### Build the world

> Discover this page's WebMCP tools. Create an endless moonlit lofi retreat. Use compose_lofi_scene with scene lakeside_cabin, cycle true, hold_seconds 180, build_seconds 20, seed 42, a cinematic camera and music. Then use describe_scene to report actual progress, the next scene and sound status. Keep the page visible while it builds.

Expected request:

```json
{"scene":"lakeside_cabin","cycle":true,"hold_seconds":180,"mood":"moonlit","build_seconds":20,"seed":42,"camera":"cinematic","music":true}
```

Expected sequence: native tool discovery → `compose_lofi_scene` → `describe_scene`; read the scene again when the build finishes. The first result acknowledges a background session. It does not claim construction is complete.

### Move to the next world

Once the first scene has finished building, send:

> Use control_lofi with action next. Read describe_scene and report the current scene, transition state and what will follow it.

Expected request: `{"action":"next"}`. Keep recording through the gentle dark dip and the next construction. `cycle:true` also advances automatically after each scene's hold time; using `next` demonstrates the same transition on request without waiting for the full countdown.

### Optional follow-up: work around my placement

On the starter scene after **Reset**, drag the camp yourself before sending:

> Read the scene, my selection and human edits. Keep my camp exactly where I placed it. Use arrange_scene around the camp with the current expected_scene_version. Read the scene again and confirm the camp coordinates did not change. Keep the camera still so I can inspect the result.

Then drag one of the moved lanterns and click **Undo layout**. Show the result's `moved_ids` and `skipped_ids`, alongside the retained camp and lantern.

## YouTube title

Agent-Native 3D Scene Studio — A Little World, Built Together | WebMCP Challenge

## YouTube description

```text
A browser agent and a person build inside the same living 3D scene.

Edited demonstration assembled from multiple live WebMCP sessions. Agent waiting time is removed; the procedural builds are shown at real speed. The on-screen tool excerpts come from the corresponding recorded calls.

English narration synthesized with ElevenLabs: Lily — Velvety Actress, model eleven_v3.

Agent-Native 3D Scene Studio uses 26 WebMCP tools to build, inspect and direct an endless lofi retreat. A browser agent can choose the scene, mood, build pace and camera, then advance, pause or resume the sequence. The human keeps the mouse.

Three authored procedural scenes—Lakeside Cabin, Lantern Grove and Island Hideaway—grow, linger and change. Music comes from a bundled playlist. Local preview buttons and the scripted guided tour are labeled separately from WebMCP agent calls.

Try it: https://agent-native-3d-studio.netlify.app
Source and MIT license: https://github.com/ThomasWerner187/agent-native-3d-studio
Testing guide: https://github.com/ThomasWerner187/agent-native-3d-studio/blob/main/docs/JUDGE-GUIDE.md

Built by Thomas Werner with TypeScript, three.js, Vite and WebMCP for The WebMCP Challenge.
```

Add the editing disclosure if used in the final film. Add chapters only after checking the exported timing. Set visibility to **Public**, wait for processing, and open the watch page while logged out before using the URL in Devpost.
