# A moment, built together

A person and their browser agent take a short break by building a quiet place together. The scene remains editable, and each person's choice becomes the agent's starting point.

**New v2 film:** 157 seconds, fresh Lily v3 narration and 44 aligned English captions. Native capture, final export and full audio/video decode are complete. Public upload and creator playback approval remain open.

## Story and narration

| Time | Visual beat | English voice-over |
| --- | --- | --- |
| 0:00–0:14 | A place to breathe | What if you and your agent took a little break... and built somewhere to breathe? I start with a pond. Just a quiet patch of water, and a little room to imagine. |
| 0:14–0:30 | Our starting point | A cabin goes beside it. That's our starting point. I ask for forty trees, mostly behind the house, with a few around the water, and soft lights to make it feel welcoming. |
| 0:30–0:56 | A forest around our choices | The agent reads the scene I actually made. It keeps my cabin and pond in place, then builds a layered forest behind them. Taller trees at the back, little openings around the water. Warm lights settle between the trees, reflections catch the pond, and the whole place begins to feel alive. |
| 0:56–1:17 | A path home | Now, a stone path to the front door. The agent follows the space between the cabin and the pond, laying a gentle curve of stepping stones. It's a small detail, but suddenly there's a way into this world. You can imagine walking home. |
| 1:17–1:33 | A little more us | I move a couple of stones myself. A little more space here, a softer curve there. We can keep taking turns, making small choices until the scene feels like somewhere we'd want to stay. |
| 1:33–1:52 | The agent sees my changes | WebMCP is what lets us work together. The agent can read the real objects, their positions, and my latest changes. It sees both stones where I left them, so our next step starts from our scene, as it is now. |
| 1:52–2:18 | Let the evening in | One last request: a cozy evening, my lofi music, and a slow, endless camera. We move in close enough to feel the warm windows and glowing water. The controls fade away. The work is done, and for a moment... we can simply be here. |
| 2:18–2:37 | A moment, built together | A small world. A shared little escape. Built with an agent... and made for a moment of calm. |

## Actual requests

Place the pond and cabin through the normal UI, then type into the visible request control:

> Please add forty trees, mostly as a layered forest behind my cabin, with a few around the sides. Add warm garden lights near the pond and among the trees. Keep my house and pond exactly where I placed them, with an open view and a clear entrance.

After the forest and lights appear:

> Add a gently curving stone path from the cabin's front door toward the pond. Make the stones individually editable, keep small gaps between them, and preserve everything we already built.

Move two path stones by hand. Ask the agent to read their changed positions, then type:

> Keep my stone edits. Give us a cozy evening, my lofi music, and a slow endless camera, much closer to the cabin and pond. Hide the controls so we can relax and enjoy our little world.

The agent inspects live state and uses native `add_grove`, `add_path`, scene queries, lighting, music, camera and presentation tools. The film records those actual calls and the visible human requests. The app's request area does not pretend to contain a separate built-in model.

## Continuity and visual direction

One clean page, one retained scene. The forty-tree grove is designed around the human cabin, dense behind it and lightly framing its sides. A warm, curved path leads the eye between house and pond. Two hand-adjusted stones remain in place after the agent's next actions. The final camera stays close enough to appreciate windows, lanterns and water while moving slowly through a coherent view.

Retain all scene action at original speed. The original footage is captured in segments on one native browser page; the same editable scene persists throughout. Document idle waiting and gaps between recordings. No action may be invented, reconstructed or accelerated. The narration follows the real stages, with brief natural pauses; the final approximately ten seconds are deliberately music-only. No code overlay or giant evidence card covers the ending. See [recording-plan.md](docs/recording-plan.md) and [CAPTURE-FORMAT.md](docs/CAPTURE-FORMAT.md).

## YouTube title

A Moment, Built Together — Agent-Native 3D Scene Studio | WebMCP Challenge

## YouTube description draft

Publish only after the new footage and finished film have been reviewed. Replace any link that does not serve the same submitted application build.

```text
What if you and your agent took a little break — and built somewhere to breathe?

I place a pond and cabin. My browser agent reads the real scene and adds forty trees and warm garden lights around my choices. I ask for a curved stone path, then adjust two stones myself. The agent reads my changes before creating a cozy evening with my lofi music and a close, endless camera. The controls disappear, and we take a moment to enjoy what we made.

WebMCP gives the connected browser agent access to real object identities, positions, human edits and scene actions. The human and agent work in the same editable world. This film keeps one native browser page and one scene throughout. Its original recording segments retain real actions at their original speed, with idle waiting and recording gaps documented in the manifest. Small result notices summarize recorded native tool responses. No scene action is invented or reconstructed for the edit.

English narration: ElevenLabs Lily — Velvety Actress, eleven_v3. Music: Aurora Drift, created and supplied by Thomas Werner. English subtitles use actual speech alignment.

Try it: https://agent-native-3d-studio.netlify.app
Source and MIT license: https://github.com/ThomasWerner187/agent-native-3d-studio
Testing guide: https://github.com/ThomasWerner187/agent-native-3d-studio/blob/main/docs/JUDGE-GUIDE.md

Built by Thomas Werner with TypeScript, three.js, Vite and WebMCP for The WebMCP Challenge.
```

After publication, verify the public YouTube watch page and add its link to Devpost. The green Submitted status is the final submission gate.
