# Recording and export plan

The current story is a **161-second, eight-shot collaboration film**. It follows one retained scene from human pond/cabin placement through agent additions, a human tree move, and the agent's lighting/camera response. [DEMO.md](../DEMO.md) contains the prompts and English script. [video-narration.json](video-narration.json) is the shared source for shot IDs, durations and narration.

## Current production status

The eight new narration tracks were generated through ElevenLabs using **Lily — Velvety Actress** (`pFZP5JQG7iQjIQuC4Bku`), model `eleven_v3`, stability `0.5`, similarity boost `0.75` and style `0`. The original-speed MP3s use 44.1 kHz / 128 kbps and total **83.04 seconds** across the 161-second story. Character alignment and generation provenance are retained locally.

| Shot | Slot | Source voice |
| --- | ---: | ---: |
| `human_pond` | 12 s | 5.36 s |
| `human_cabin` | 18 s | 10.96 s |
| `agent_forest` | 29 s | 11.04 s |
| `agent_details` | 23 s | 11.44 s |
| `human_move` | 15 s | 8.16 s |
| `agent_readback` | 23 s | 9.76 s |
| `atmosphere` | 26 s | 12.40 s |
| `closing` | 15 s | 13.92 s |

The **audio rehearsal** is `scratch-submission-media/audio-rehearsal.wav`: **161.000 seconds**, 48 kHz stereo PCM, with the owner-provided Aurora Drift music and **31 character-aligned captions** in `submission-demo.srt`. Measurements for the revised 161-second mix are recorded in its generated metadata and the final review. Its metadata explicitly records `native_capture:false`.

Narration stays at original speed. The music bed targets −24.5 LUFS and ducks gently under the voice with 700 ms attack / 1000 ms release. Only music fades at the end; the closing voice is not attenuated by a global fade. Sample-derived voice-bus timestamps prevent delayed MP3 segments from producing a shortened mix.

**The complete native take and 161-second H.264/AAC film are produced.** It contains 4,378 original browser frames and 15 successful native events, with one retained scene and the same pond, cabin and edited tree IDs. The browser recording must stay inside active tool calls; pauses between recording blocks are explicitly marked as agent waiting time. Human-side actions are demonstrated using the real pointer controls. Public YouTube and Devpost Submitted status remain open; final media measurements are in the review record.

The older 135-second, multi-session gallery film remains a historical artifact in the previous voice-polish worktree. Its 32 captions, media measurements and checksum do not describe this new story. Do not reuse its scene takes as evidence for the new continuous collaboration.

## Plan without capture or API access

Prerequisites for production: project dependencies, Swift/AppKit, and `ffmpeg`/`ffprobe` on PATH. Run from the repository root:

```bash
npm run audio:elevenlabs -- --plan
node scripts/encode-demo-capture.mjs --plan
node scripts/assemble-demo.mjs --plan
```

These planning commands do not make API calls. The assembler validates the script without narration files; when prepared audio exists, it additionally validates slot lengths and character alignment. Native capture is a separate gate.

## Prepare the approved narration

Generating missing tracks requires `ELEVENLABS_API_KEY` in the environment and makes paid ElevenLabs calls. The existing complete cache can be reused without an API key:

```bash
npm run audio:elevenlabs
node scripts/assemble-demo.mjs --captions
node scripts/assemble-demo.mjs --audio-only
```

The generator writes MP3, alignment JSON and provenance JSON into `scratch-submission-media/elevenlabs`, then builds `timeline.json`. `--only human_pond` prepares one named segment. Matching caches are checksum-verified and reused; the helper does not automatically retry a failed API request or change playback speed. Optional voice/model overrides are `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID`.

Timeline entries contain absolute paths. After copying a complete cache into another checkout, rerun `npm run audio:elevenlabs` there to write the current local paths; a matching complete cache needs no API call. Do not render directly from a copied timeline containing another worktree's paths.

The caption-only command writes aligned SRT without images or video. The audio-only command mixes a clearly labeled WAV rehearsal and metadata; it requires no native recording. `npm run demo:audio` remains an optional macOS rehearsal helper and does not produce the approved Lily voice.

## Capture the actual shared scene

1. Once authorized native browser access works, open the reviewed build as a top-level page without a shared-scene hash or developer-harness parameter. Confirm the connected agent and **WebMCP live · 27 tools**.
2. Start recording before clicking **Add pond**. Keep one page and one scene for all eight shots. Capture real pointer input, native requests, returned results and the retained object IDs.
3. Use the native prompts in DEMO.md. Collect complete `query_scene` readbacks before and after additions, after the human move, and after lighting/camera. Leave readable time after tool results.
4. Do not reset, import, start a gallery recipe or substitute another take after the initial placement. If a take needs restarting, record the complete story again.
5. Keep the page visible. If agent waiting time must be removed, record those exact source intervals and label the cuts. Retained actions stay at original speed.
6. Record actual music playback or the **Enable sound** click. A request to play is not proof of playback.

Raw frame files and the native event manifest are not committed. Their required format, source-clock convention, waiting-time edits and continuity checks are specified in [CAPTURE-FORMAT.md](CAPTURE-FORMAT.md). The exporter rejects old montage evidence, harness provenance, missing readbacks and changed anchor poses. These checks support a review of the actual recording; they do not authenticate fabricated input.

## Encode and export

After the real source frames and complete native evidence exist:

```bash
node scripts/encode-demo-capture.mjs
node scripts/assemble-demo.mjs
```

The encoder uses the shared eight-shot plan and removes only declared waiting-time cuts. The assembler requires valid native continuity evidence, uses character alignment for captions, renders readable overlays with AppKit and exports H.264/AAC at 1280 × 720 and 30 FPS. It checks video/audio duration, measures the final mix, and writes the MP4, SRT, poster, contact sheet and export metadata in `scratch-submission-media`.

A 30 FPS export does not establish that every original browser frame was captured. Inspect the real recording for smooth motion, readable controls and unintended freezes. Do not extend a stale frame to imitate a live scene.

## Final viewing gate

Watch and listen to the complete exported film. Confirm the voice is comfortable, captions are readable, human actions and native calls are represented accurately, the same objects persist, and the actual public application reproduces the shown behavior. Check for private tabs or notifications in the footage.

Only then upload as **Public** on YouTube, wait for processing and verify logged-out playback. Save its link in Devpost and verify the green **Submitted** label. The [submission checklist](SUBMISSION-CHECKLIST.md) records the final revision and release freeze; the [official rules](https://webmcp.devpost.com/rules) require explanatory audio and allow judges to stop after three minutes.
