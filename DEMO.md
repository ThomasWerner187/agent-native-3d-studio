# A little world, built together

**Target film: 2 minutes 25 seconds.** This production plan follows one retained scene: the person places a pond and cabin, the agent adds the environment, the person moves a tree, and the agent reads that edit before changing the atmosphere. New native footage and the final export remain pending.

The eight shots and narration come from [video-narration.json](docs/video-narration.json). Production uses ElevenLabs **Lily — Velvety Actress**, model `eleven_v3`, at original speed with character-aligned captions. The old 135-second gallery film is a separate historical artifact.

## Narration and picture

| Time | Picture | English narration |
| --- | --- | --- |
| 0:00–0:12 | Begin with the human choosing Pond and placing it in the scene. Keep the pointer action and selected pond visible. No earlier beauty-shot insert. | “I start with a pond, right here. A little world I can build in together with my browser agent.” |
| 0:12–0:30 | Place the cabin by hand. Record native help and describe_scene, then query_scene with the pond and cabin poses, bounds and ownership. Preserve their actual IDs. | “I place a cabin beside the water. Now I ask the agent to read what I made. WebMCP gives it the objects, their positions, and my edits.” |
| 0:30–0:55 | Show the natural-language request and actual native scatter call. Keep the real tree reveal at original speed. Read back the added count and both unchanged anchor poses. | “Add thirty pines around my pond and cabin. Keep the water and the entrance clear. The agent builds around my choices, keeping both exactly where I placed them.” |
| 0:55–1:12 | Record native additions of shoreline rocks and lanterns around the existing world. Show the actual results and a query of the decorated scene, including tree ownership. | “A few stones shape the shoreline. Warm lanterns lead back to the cabin. Every object stays selectable and editable as the little world grows.” |
| 1:12–1:27 | Drag a visible agent-created tree to a distinct new position. Keep the selection and human activity entry visible; capture the real pointer movement. | “This tree feels too close. I move it myself. My edit becomes part of the shared state the agent sees.” |
| 1:27–1:50 | Record fresh native describe_scene and query_scene calls. Show the same tree ID, changed position, human edit and revision. Pond and cabin remain unchanged. | “I ask it to read the scene again and keep my new placement. It can see which tree moved, where it is now, and who made that change.” |
| 1:50–2:10 | Use native set_lighting and set_camera_motion on the same scene. Enable sound through an actual click if required. Read back running camera motion and real playback, then query unchanged object poses. | “The light settles into moonlit blue, the lanterns glow, and the camera begins a slow, endless journey. My own lofi music gives everything room to breathe.” |
| 2:10–2:25 | End on a moving view of the same retained scene. Briefly show the actual registration source, then the project title and live URL. No replacement scene or earlier take. | “One person. One browser agent. The same living scene. WebMCP connects real objects and actions with shared creative control. A little world, built together.” |

## Native prompts

After clicking **Start empty**, **Add pond** and **Add cabin**, arrange the two objects yourself. Then ask:

> Read the scene I have built. Identify my pond and cabin, their current positions, bounds and human edits. Keep both exactly where I placed them. Add thirty pine trees around them, keeping the water, shoreline and cabin entrance clear. Verify the added count and my unchanged placements.

Follow with:

> Add six shoreline rocks and four warm lanterns around our existing scene. Keep its objects in place and leave a clear approach to the cabin. Read back what changed.

Move one of the new trees by hand, then ask:

> I moved one tree. Read the current selection and human edits, identify its new position, and keep it there. Give our scene soft moonlit lighting and start a slow continuous cinematic camera. Keep every object's placement unchanged. Verify the camera and actual music playback state.

The agent must inspect live state and choose valid inputs. Record its actual requests and results. Use unfiltered `query_scene` readbacks with full poses and ownership before/after the additions and after the human edit; a page size of 200 covers this small scene. Leave time for readable results in the recorded shots.

## Continuity and pacing

Keep the same page and scene from the first placement through the closing shot. Preserve the pond, cabin and moved tree IDs across all readbacks. No reset, import, gallery composition or substitute take belongs inside that sequence. Capture an entire successful take; if it must be restarted, record the entire story again.

Agent waiting time may be removed while preserving chronology. Declare each removed interval in the capture manifest and show **Agent waiting time removed · same scene**. Retained human input and scene actions run at their original speed. The closing view comes from this same world, not an earlier beauty shot. A source-code overlay may show the actual registration while the current scene continues behind it.

The browser's current admin-policy verification block prevents the new native recording. A local harness rehearsal must remain labeled as a local demonstration and cannot supply the native evidence for this film. See the [recording plan](docs/recording-plan.md).

## YouTube title

Agent-Native 3D Scene Studio — A Little World, Built Together | WebMCP Challenge

## YouTube description

The following copy is for the planned film. Use it only after the recorded evidence and final cut match these claims.

```text
A person and a browser agent build inside the same living 3D scene.

I place a pond and cabin. The agent reads my choices and adds a forest, stones and lanterns around them. I move one of its trees; it reads the change before setting the light and a slow continuous camera. The same scene remains editable throughout.

WebMCP exposes the page's real objects, positions, edit history and actions. Native agent calls and local human actions are labeled separately. The optional lofi gallery offers authored starting points; this demonstration builds around human placements.

The film retains one browser scene. Any cuts remove agent waiting time and are labeled; retained scene actions run at real speed. On-screen tool excerpts come from the recorded native calls.

English narration synthesized with ElevenLabs: Lily — Velvety Actress, model eleven_v3. Music: Aurora Drift, created and supplied by Thomas Werner.

Try it: https://agent-native-3d-studio.netlify.app
Source and MIT license: https://github.com/ThomasWerner187/agent-native-3d-studio
Testing guide: https://github.com/ThomasWerner187/agent-native-3d-studio/blob/main/docs/JUDGE-GUIDE.md

Built by Thomas Werner with TypeScript, three.js, Vite and WebMCP for The WebMCP Challenge.
```

Watch and listen to the complete final export before publication. Verify the public YouTube watch page and save the link in Devpost; only the green Submitted status completes submission.
