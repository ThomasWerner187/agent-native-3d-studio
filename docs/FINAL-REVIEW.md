# Final submission review

Reviewed September 3, 2026. The new human–agent collaboration is implemented and recorded through native WebMCP in the Codex browser. **The new film is 2:41, with Lily narration, the creator's Aurora Drift track and 31 burned-in English subtitle cues.** Public video upload, production release and the Devpost Submitted check remain open.

## Verified collaboration

The final take starts with a pond and cabin placed through the real UI. Native calls add exactly 30 trees, six rocks and four lamps. A real pointer drag moves an agent-created tree, and fresh native readbacks identify its human edit. Lighting and an infinite camera continue on the same 42-object world.

| Check | Observed result |
| --- | --- |
| Native discovery | **27 WebMCP tools** registered on the clean collaborative-review page. All **15 recorded native calls succeeded**. |
| Human anchors | Pond `obj_47` at `[0,0,0]` and cabin `obj_48` at `[5.35,0,4.51]` retain their exact IDs and poses in every required readback. |
| Agent additions | Exactly **30 trees + 6 rocks + 4 lamps**. The native scatter result reports both human anchors preserved. |
| Human edit | Tree `obj_69` stays agent-created and changes to human-edited, revision 2. Its recorded pose changes from `[11.52,0,17.01]` to `[16.25,0,18.84]`. |
| Atmosphere | Native readback reports moonlit lighting, an **infinite cinematic camera running**, and **Aurora Drift actually playing**. All object poses remain unchanged by this stage. |
| Share restoration | A 3,518-character exported link was opened in a fresh tab. Native query succeeded; **42/42 objects matched the original poses and materials**. |
| Capture integrity | One retained page/scene, zero scene replacements; **4,378 original frames**. The complete native evidence validator passed. Retained shot density is about 26–28 fps; maximum retained inter-frame gap is 0.143 s. |
| Demonstration method | Codex operated both the real pointer/UI surface and the connected native WebMCP surface for this demonstration. UI actions retain human provenance; native tools retain agent envelopes. |

The machine-readable [capture summary](native-capture-summary.json) records IDs, poses and the capture-manifest checksum. Original frames, requests, responses and the timestamped source reference remain in the local media directory. Between active recording blocks the agent paused frame capture while preparing its next action. Those intervals are explicitly removed as waiting time from the film; the uncut VFR reference holds the last observed frame and is not visual evidence of those uncaptured idle intervals.

## Film and audio

| Material | Verified result |
| --- | --- |
| Master | `scratch-submission-media/submission-demo.mp4`, **161.000 seconds**, H.264/AAC, 1280 × 720, 30 fps, 20,382,325 bytes. |
| Master SHA-256 | `55cdccccc5ba8ee784322a84a34ba70c2861cf0976dc119bf4034f1d602227cc` |
| Narration | Eight existing ElevenLabs **Lily — Velvety Actress** / `eleven_v3` takes, 83.04 seconds of original-speed speech. No new paid generation was needed for this run. |
| Subtitles | **31 character-aligned English cues**, burned in and also supplied as SRT. |
| Final audio | **−18.83 LUFS integrated / −3.58 dBTP**, mean −21.1 dBFS, sample peak −3.6 dBFS. Music ducks under narration; the closing voice is not faded out. |
| Media QA | Full decode succeeded. Representative human-edit, native-result, atmosphere and closing frames were inspected; overlay text fits. Creator listening/playback approval remains open. |
| Source reference | `source-recording-original-vfr.mp4`, approximately 299.735 seconds, with original timestamp gaps and the recording-cadence note. |

## Application and release status

| Check | Observed result |
| --- | --- |
| Application | `194e932c8daec5857952b5a33169229507b193dd` at [collaborative-review](https://collaborative-review--agent-native-3d-studio.netlify.app), deploy `6a99310308d1752d54879bee`. The loaded bundle `index-Dt4eNSSi.js` matches this candidate. |
| Local gate | Build and smoke passed **27/27 tools, 76/76 behavior checks**; animation and 12-cycle lofi regression passed on the application candidate. |
| CI gate | [Run 33736101125](https://github.com/ThomasWerner187/agent-native-3d-studio/actions/runs/33736101125) passed at `40db1bfcbb8ee74baed2fa03d56fdaf2dbb6a844`, including 27/27 tools and 76/76 behavior checks. Subsequent film work changes documentation and media tooling, not the deployed application. |
| Media regression | The updated duration/fixture checks pass: one positive native-shape fixture and eight rejection cases. The actual recording independently passes the native continuity validator. |
| Browser access | The earlier policy-verification failure cleared after the app restart. The recorder performs and awaits its work inside active browser tool calls. |
| Public source/license | Previously verified public repository and GitHub MIT detection; final outgoing revision still needs publication verification. |
| Production | The final collaboration candidate is on the review URL. Production publication is still pending. |
| YouTube | No public URL verified for the new film. |
| Devpost | Draft `1168246`, [project preview](https://devpost.com/software/agent-native-3d-scene-studio), was previously observed at 2/5 steps and not Submitted. Replace the story with current SUBMISSION.md, enter final links, save and verify the green Submitted label. This run did not edit Devpost. |

## Earlier review evidence

| Earlier artifact or check | What it establishes |
| --- | --- |
| Repository lineage | The 17 legacy dirty files matched the preserved `b6e0521` work included in the integrated ancestry. |
| Application `9bda5c3` | Build and 26/26 tools, 58/58 semantic checks passed for the previous feature set. Animation and lofi regressions included 12 bounded automatic cycles. |
| CI `3b643d5` | [Run 33721502832](https://github.com/ThomasWerner187/agent-native-3d-studio/actions/runs/33721502832) passed before the collaboration feature update. |
| Dependency and secret checks | Earlier `npm ci` audit: 0 vulnerabilities. Earlier full secret scan: 158.65 MB, 0 findings; staged share update: 33.47 KB, 0 findings. The final outgoing release still needs its own check. |
| Native lofi/camp checks | Real composition, state, next, human pause/resume, collaboration and Aurora Drift playback were observed on earlier builds. They do not prove the new continuous world-building flow. |
| Compact share | Local prior checks reduced the tested URL from 31,386 to 3,318 characters, restored 46 objects exactly, and covered legacy links, inflate limits and import races. The final native share round trip remained blocked. |
| Public repository/license | Anonymous access, Public visibility, LICENSE visibility and GitHub MIT detection were verified previously. Recheck the actual final release after publication. |
| Accessibility/style | The Impeccable detector ran a degraded regex path because parser dependencies were missing. A width-animation warning was fixed. This was not a complete accessibility audit. |
| Previous film | The 135-second Lily gallery montage, 32 captions and master SHA-256 `f7f7eadb8048e5e42d3e3e7559b2dfc6aec14435b3fb10f062d9dceb0914f692` remain historical artifacts in the prior voice-polish worktree. |

The current story, capture contract and remaining gates are in [recording-plan.md](recording-plan.md), [CAPTURE-FORMAT.md](CAPTURE-FORMAT.md) and [SUBMISSION-CHECKLIST.md](SUBMISSION-CHECKLIST.md). The submitted source, live application and video must describe the same behavior.
