# Recording and export plan

Produce the [2:15 English film](../DEMO.md) from the same revision that will be submitted. The script covers the product, an actual WebMCP invocation and human control. Recording and editing are production steps outside the app; the studio does not include a built-in video recorder.

## Current candidate

The browser footage was captured against application revision `3487e00`; the reviewed application is `9bda5c3`, which adds the compact-share update. Its production build and smoke suite passed **26/26 tools and 58/58 semantic checks**; animation and lofi regressions passed on the unchanged core, including 12 bounded automatic cycles. Build and smoke also passed again in the narration-polish worktree, whose 3D application source is unchanged. Preview deploy `6a990cece684e99516a09013` matches the reviewed application build. The later share behavior still needs a native-browser round trip: browser-tool access is blocked by admin-policy verification, and the earlier film does not establish that later check.

The replacement narration uses **Lily — Velvety Actress** (`pFZP5JQG7iQjIQuC4Bku`), generated through ElevenLabs with model `eleven_v3`, stability `0.5`, similarity boost `0.75` and style `0`. Eight source MP3s at **44.1 kHz / 128 kbps** total **103.04 seconds** within the fixed 135-second film slots. They retain character alignment and generation provenance. The previous narration was rejected; Lily is the voice in the current exported master.

The revised master is **1280 × 720, 30 FPS, H.264/AAC**, with video and audio streams of exactly **135.000 seconds** and a size of **43,349,714 bytes**. Its **32 valid caption cues** use character alignment and last at least **0.8 seconds** each. The source footage retains **17 recorded native events**. The master, English SRT, poster, contact sheet and export metadata are in `scratch-submission-media`.

The film pairs the narration with the owner-provided Aurora Drift music track. Narration plays at its original speed. The music bed targets **−24.5 LUFS** with sidechain ducking at **700 ms attack / 1000 ms release**. The final mix measures **−17.4 LUFS integrated**, **−2.87 dBTP true peak**, **−20.0 dBFS mean** and **−2.9 dBFS sample peak**. Format and level checks passed; a complete watch/listen and creator approval of the replacement voice remain pending.

The film is an **edited demo assembled from multiple live WebMCP sessions**; the opening and evidence cards disclose that provenance rather than presenting one uninterrupted session. Native-agent waiting-time cuts are labeled; the complete 20-second build is shown at its recorded timing. The 30 FPS export does not imply that the browser source captured every displayed frame. Public YouTube upload and the Devpost Submitted status are not complete.

Master SHA-256: `f7f7eadb8048e5e42d3e3e7559b2dfc6aec14435b3fb10f062d9dceb0914f692`.

## Rebuild the media on macOS

Prerequisites: the installed project dependencies, Swift with AppKit, and `ffmpeg`/`ffprobe` on `PATH`. Generating missing narration tracks uses paid ElevenLabs API calls and requires `ELEVENLABS_API_KEY` in the environment. Run from the repository root:

```bash
npm run audio:elevenlabs -- --plan
npm run audio:elevenlabs
```

`--plan` reads the script and cache without credentials, API calls or file writes. Generation prepares eight MP3 tracks, character-alignment JSON and provenance JSON under `scratch-submission-media/elevenlabs`, then writes `scratch-submission-media/timeline.json` when every matching take is ready. Cached takes are checked and reused. The default is Lily with `eleven_v3`; optional `ELEVENLABS_VOICE_ID` and `ELEVENLABS_MODEL_ID` select another voice/model. Use `npm run audio:elevenlabs -- --only opening` to prepare one named segment. The helper keeps original audio speed and rejects a take that does not fit its slot; it does not retry failed API calls automatically.

Browser capture is a separate step: retain genuine timestamped frame images and `frames.json` manifests in the `opening`, `composition`, `state`, `next`, `endless`, `human` and `closing` subdirectories, plus the actual native requests/results in `native-capture.json`. These raw inputs are intentionally not committed. A fresh clone cannot produce the film from the narration command alone.

Once those captures are present, encode and assemble them:

```bash
node scripts/encode-demo-capture.mjs
node scripts/assemble-demo.mjs
```

The encoder preserves source timestamps; the assembler validates the required clips and native evidence, uses the ElevenLabs character alignment for caption timing, renders title/caption overlays with AppKit, mixes narration and music, and writes `submission-demo.mp4`, `submission-demo.srt`, `submission-poster.jpg`, `submission-contact-sheet.jpg` and `export-metadata.json` under `scratch-submission-media`. Neither command records browser actions or uploads anything. Rebuilding after changing the narration or captures requires another full review.

## Capture

1. Open the final candidate in a WebMCP-capable desktop browser at 1920 × 1080, with no private tabs or account details in view. Start from the base URL with no shared-scene hash. Confirm **WebMCP live · 26 tools**.
2. Use **Cinematic** on hardware that renders it smoothly. Record a short sample first: water, smoke and camera motion must remain continuous in the export. Capture at 30 FPS where the recording tool supports it; do not duplicate a low-frame-rate source and describe that as a 30 FPS capture.
3. Record a connected browser agent discovering and calling `compose_lofi_scene` with `cycle:true`, followed by `describe_scene`. Preserve the full requests, results and raw recording. A local tool inspector or the Create button is useful for rehearsal, but does not establish native WebMCP discovery.
4. Record a native `control_lofi` call with `action:"next"`, the transition and the next procedural build. Then record human camera takeover pausing the complete sequence and an explicit resume. The starter-camp collaboration can be captured separately as supplementary material; it is not needed to interrupt the lofi story in the main film.
5. Capture a clean moving cabin shot for the opening and closing. **H** or **Clean view** hides the HUD; **H** or **Controls** restores it. Keep some footage with the HUD visible so provenance and controls can be assessed.

The exact prompts and narration are in [DEMO.md](../DEMO.md), with matching machine-readable shots in [video-narration.json](video-narration.json). The 20-second builds can play at their real pace underneath the explanation. Use cuts to remove model waiting time and label those cuts. Keep the browser tab visible during construction because hidden tabs pause scene work.

## Voice and edit

- Keep the English delivery relaxed, with natural pauses between ideas. Use the exact feature names when the relevant tool is on screen. Keep each generated segment within its shot; shorten and regenerate an overlong take instead of speeding it up. Record the actual voice and model used for the exported film.
- Keep narration prominent and music quiet underneath. Check actual sound playback before capture, not just a successful music request. A silent browser recording may need the separately captured audio mixed in.
- Keep camera, water and smoke footage moving under the voice. Avoid extending a still frame to cover a long sentence.
- Add readable English captions. Use short labels such as **Native WebMCP call**, **Human placement** and **Layout undo** only when the footage supports them.
- Show the project title and live URL at the end. Do not spend the first seconds on a logo sequence.

## Export and review

Export an MP4 with H.264 video and AAC audio for upload. Retain the raw take and a separate final master. For every candidate export, check:

| Check | Pass condition |
| --- | --- |
| Duration | Under 3:00 including title and credits; target 2:15 |
| Narration | Audible, in English, explains both the product and WebMCP |
| Motion | No unintended frozen frames, cursor resets or abrupt camera jumps |
| Provenance | Native requests/results are readable; editing across multiple live sessions is disclosed; local actions are represented accurately |
| Claims | Scene actions shown match the candidate build; no generated-mesh or generated-music claim |
| Display | Text stays readable at ordinary YouTube player size; captions stay in frame |
| Audio | Listen through the exported file on speakers or headphones; no clipping or missing voice |
| Privacy | No credentials, unrelated tabs, notifications or personal account screens |

Watch the whole exported film, then upload it as **Public** on YouTube. Wait for processing and verify the watch page while logged out, with sound. Copy the final public link into the submission, save it, and verify the green **Submitted** status on [Devpost My projects](https://devpost.com/submit-to/31011-the-webmcp-challenge/manage/submissions).

The [official rules](https://webmcp.devpost.com/rules), checked September 3, 2026, require a public YouTube demonstration with explanatory audio and permit judges to stop watching at three minutes. Follow the [submission checklist](SUBMISSION-CHECKLIST.md) for the release freeze and judging window.
