# Recording and export plan

Produce the [2:15 English film](../DEMO.md) from the same revision that will be submitted. The script covers the product, an actual WebMCP invocation and human control. Recording and editing are production steps outside the app; the studio does not include a built-in video recorder.

## Current candidate

The rerendered local export was captured against application revision `3487e00`; the final reviewed application is `9bda5c3`, which adds the compact-share update. Its production build and smoke suite passed **26/26 tools and 58/58 semantic checks**; animation and lofi regressions passed on the unchanged core, including 12 bounded automatic cycles. Preview deploy `6a990cece684e99516a09013` matches that final build. The later share behavior still needs a native-browser round trip: browser-tool access is blocked by admin-policy verification, and the earlier film does not establish that later check.

The local film is **135 seconds, 1280 × 720, 30 FPS, H.264 video and AAC audio**. Its **42 caption cues** and **17 recorded native events** accompany English SRT captions, a poster, a contact sheet and export metadata in `scratch-submission-media`. The film uses eight locally synthesized macOS Samantha narration segments and the owner-provided Aurora Drift music track. It is an **edited demo assembled from multiple live WebMCP sessions**; the opening and evidence cards disclose that provenance rather than presenting one uninterrupted session. Native-agent waiting-time cuts are labeled; the complete 20-second build is shown at its recorded timing. The 30 FPS export does not imply that the browser source captured every displayed frame.

The exported mix measured **−19.2 dBFS mean** and **−3.7 dBFS peak**. Format checks and level measurements passed; a complete listen-through and creator approval of the synthesized voice are still required. Public YouTube upload and the Devpost Submitted status are not complete.

## Rebuild the media on macOS

Prerequisites: the installed project dependencies, macOS `say`, Swift with AppKit, and `ffmpeg`/`ffprobe` on `PATH`. Run from the repository root:

```bash
npm run demo:audio
```

This prepares the eight AIFF narration segments and `scratch-submission-media/timeline.json`; the default voice is Samantha. Browser capture is a separate step: retain genuine timestamped frame images and `frames.json` manifests in the `opening`, `composition`, `state`, `next`, `endless`, `human` and `closing` subdirectories, plus the actual native requests/results in `native-capture.json`. These raw inputs are intentionally not committed. A fresh clone cannot produce the film from the narration command alone.

Once those captures are present, encode and assemble them:

```bash
node scripts/encode-demo-capture.mjs
node scripts/assemble-demo.mjs
```

The encoder preserves source timestamps; the assembler validates the required clips and native evidence, renders title/caption overlays with AppKit, mixes narration and music, and writes `submission-demo.mp4`, `submission-demo.srt`, `submission-poster.jpg`, `submission-contact-sheet.jpg` and `export-metadata.json` under `scratch-submission-media`. Neither command records browser actions or uploads anything. Rebuilding after changing the narration or captures requires another full review.

## Capture

1. Open the final candidate in a WebMCP-capable desktop browser at 1920 × 1080, with no private tabs or account details in view. Start from the base URL with no shared-scene hash. Confirm **WebMCP live · 26 tools**.
2. Use **Cinematic** on hardware that renders it smoothly. Record a short sample first: water, smoke and camera motion must remain continuous in the export. Capture at 30 FPS where the recording tool supports it; do not duplicate a low-frame-rate source and describe that as a 30 FPS capture.
3. Record a connected browser agent discovering and calling `compose_lofi_scene` with `cycle:true`, followed by `describe_scene`. Preserve the full requests, results and raw recording. A local tool inspector or the Create button is useful for rehearsal, but does not establish native WebMCP discovery.
4. Record a native `control_lofi` call with `action:"next"`, the transition and the next procedural build. Then record human camera takeover pausing the complete sequence and an explicit resume. The starter-camp collaboration can be captured separately as supplementary material; it is not needed to interrupt the lofi story in the main film.
5. Capture a clean moving cabin shot for the opening and closing. **H** or **Clean view** hides the HUD; **H** or **Controls** restores it. Keep some footage with the HUD visible so provenance and controls can be assessed.

The exact prompts and narration are in [DEMO.md](../DEMO.md), with matching machine-readable shots in [video-narration.json](video-narration.json). The 20-second builds can play at their real pace underneath the explanation. Use cuts to remove model waiting time and label those cuts. Keep the browser tab visible during construction because hidden tabs pause scene work.

## Voice and edit

- Record the English script as one natural performance, then align the footage to it. Use the exact feature names when the relevant tool is on screen. A guide voice is acceptable for reviewing the cut; record which voice the final film actually uses.
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
