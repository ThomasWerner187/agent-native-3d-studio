# Zen co-creation recording plan

**Status:** the new 157-second native film is exported with fresh Lily v3 narration and 44 English captions; full audio/video decode passed. Original footage, native evidence and the final scene export are saved. All local render/test/preview processes are stopped. Optional ZIP packaging is deferred after the creator reported machine load.

The film begins with a small emotional invitation: a person and their agent take a break by making somewhere peaceful together. The visual proof is one evolving scene: human pond and cabin, forty trees and warm lights, a curved path, two human stone edits, and a close endless evening camera.

## Capture

The final take follows [DEMO.md](../DEMO.md) and the exact [capture contract](CAPTURE-FORMAT.md). Recording starts before the first visible human placement and keeps the same loaded native browser page and object identities through the closing. Eight shot folders cover exact contiguous ranges on one shared elapsed-time clock, with no cuts or omitted gaps. Every actual action finishes inside its slot at original speed; no action is invented, reconstructed or accelerated.

Real requests must be typed into the app's visible request control. They must be read and acted on through the connected native WebMCP agent. Never render a fictitious conversation or relabel local demo calls as agent interaction.

Suggested native flow, using actual returned IDs and fresh scene versions:

- Discover tools; human places pond and cabin; query their poses and bounds.
- Read the person's forest request. `add_grove` uses `count:40`, `lights:8`, both live anchor IDs, `seed:42`, `reveal_seconds:6`. Query the result.
- Read the path request. `add_path` uses both live anchor IDs and a gentle bend. Query every individually editable stone.
- Human moves two path stones. Fresh query and description identify both changes. Keep one selected.
- Read the evening request. Warm `golden_hour`, gentle music, close `drift` camera around cabin and pond, then `set_ui({visible:false})`. Verify actual playback and running camera, then query all retained geometry.
- Let the camera continue on the same world. Keep the full 19-second closing capture; its final approximately ten seconds are intentional music-only rest.

## Narration and pacing

Eight new ElevenLabs Lily v3 takes total **131.68 seconds**, including natural pauses. The edit lasts **157 seconds**. All voice recordings retain their original speed. Non-closing shot tails are approximately one to two seconds; only the ending has a longer pause for enjoyment.

Voice ID: `pFZP5JQG7iQjIQuC4Bku`; model `eleven_v3`; stability `0.5`. Audio direction uses gentle inline tags and punctuation; v3 does not support SSML break tags. The plain English narration stays separate from TTS directions, and the 44 subtitles use actual provider character timestamps. [ElevenLabs prompting documentation](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#prompting-eleven-v3).

Source takes, checksums, alignment and request provenance are ignored production assets under `scratch-submission-media/elevenlabs/`. Do not commit credentials or media caches. Re-running generation reuses matching verified takes. Changed slot durations need no new paid generation.

## Build the artifacts

```sh
node scripts/prepare-elevenlabs-audio.mjs --plan
node scripts/prepare-elevenlabs-audio.mjs
node scripts/assemble-demo.mjs --captions
node scripts/assemble-demo.mjs --audio-only
node scripts/encode-demo-capture.mjs --plan
# After actual native frames and the manifest have been recorded:
node scripts/encode-demo-capture.mjs
node scripts/assemble-demo.mjs
```

`--plan` never calls ElevenLabs. Generation requires the existing `ELEVENLABS_API_KEY` environment variable. The current eight matching takes are already generated; do not regenerate them unnecessarily. Full assembly refuses missing or invalid native evidence.

## Review before publication

Watch the actual forest arrangement, path, both stone edits, and the close evening ending. A proof validator cannot score art direction. Check that the cabin and pond remain the focus, tree crowns are recognizably green, lights have a warm restrained glow, and no bright card covers the finished scene.

Listen to all narration at normal speed. The audio rehearsal measures approximately -17.4 LUFS integrated and -3.1 dBTP, with narration-responsive music ducking. Check that the performance sounds natural and no direction tag is spoken. Confirm all 44 captions, actual video duration under 180 seconds, complete H.264/AAC decode, and an uninterrupted moving closing. Public upload and Devpost submission remain separate publication actions.
