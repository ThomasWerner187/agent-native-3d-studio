# Scene Studio — narrated hackathon film

Target: **90 seconds**, English narration, 1080p landscape, 30 FPS. First 30 seconds also work as a separate teaser. This is a production plan; no film has been recorded or uploaded yet.

## Entry requirements

The [official rules](https://webmcp.devpost.com/rules), checked 2 September 2026, require a video shorter than three minutes, a functioning demo with audio explaining the project and WebMCP use, and a publicly visible YouTube upload. English or an English translation is required. The submission deadline is 3 September 2026 at 13:00 PDT (22:00 Berlin).

## Reuse the As I Am recorder

The existing `tools/clickthru` toolkit in As I Am already supports capture from the selected Codex Browser tab, real cursor interactions, MP4 packaging, narration and timed captions. Its preferred voice workflow uses one continuous performance. Keep that structure.

Adapt before recording:

- Its live capture currently saves at most 12 FPS and caps frames at 1440 px. Use a verified 30 FPS capture path for our slowly moving 3D camera; test a short take before a full capture. Keep the scene at full cinematic quality.
- Its voice-led editor extends static screen holds. Our background is always moving: preserve continuous footage and edit only intentional gaps. Do not freeze the water, smoke or camera under narration.
- Capture actual `compose_lofi_scene` and `describe_scene` calls through the page's native WebMCP capability. A recording of the local Create button must be labeled as a local tool demonstration.
- Replace all As I Am titles, URLs, chapter names and provenance labels in a copied adapter. Do not modify that project's recorder or existing takes.
- Use a new ignored output directory per take. Keep the original footage, event timings and tool results. Avoid simultaneous duplicate browser captures.
- Lower the lofi music under narration, retain captions, and visually verify the result. A music request alone does not prove audible playback; check the actual playback state and listen to the export.

A local guide voice can be used for an initial cut. No new paid speech request, YouTube upload or Devpost submission has been made for this project.

## Story

| Time | Show | Explain |
| --- | --- | --- |
| 0–8 s | One prompt over the live scene | “What if a website could understand the kind of place you want to be in?” |
| 8–30 s | Actual WebMCP call, gradual cabin/pond/forest reveal, lanterns and music | “I ask my browser agent for a calming lofi world. Through WebMCP, it discovers the scene's tools and starts a complete composition.” |
| 30–43 s | Camera drift, real reflection, close cabin detail | “Light, sound and movement unfold together. The camera continues for as long as I want.” |
| 43–58 s | Tool activity and live progress/state | “The agent works with objects, camera states and a controllable session. It can verify what happened instead of guessing from pixels.” |
| 58–73 s | Human takes the camera; pause/resume; one reversible edit | “And I keep control. I can interrupt the camera, edit the world, resume the atmosphere or undo the composition.” |
| 73–90 s | Clean, uninterrupted beauty shot and project link | “A small environment for focus and relaxation, with a path toward ambient films. One shared canvas for people and agents.” |

The built-in composition is an authored, parameterized procedural recipe. It is not arbitrary text-to-mesh generation. The music is an existing local playlist. State this naturally in the implementation segment or captions. A custom API could implement similar operations; WebMCP makes the contract discoverable in the live shared page.
