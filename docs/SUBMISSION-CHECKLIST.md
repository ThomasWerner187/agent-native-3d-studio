# Submission release checklist

This is a working release checklist, not a claim that Devpost submission is complete. Check external outcomes only after observing them. The documentation describes the final 26-tool candidate; production and the video must be checked against that candidate before submission.

## Materials

| Item | Source |
| --- | --- |
| Project name, pitch, story and testing instructions | [SUBMISSION.md](../SUBMISSION.md) |
| Judge walkthrough and expected results | [JUDGE-GUIDE.md](JUDGE-GUIDE.md) |
| English film script, prompts, YouTube title and description | [DEMO.md](../DEMO.md) |
| Machine-readable narration and shot directions | [video-narration.json](video-narration.json) |
| Capture, audio and export checks | [recording-plan.md](recording-plan.md) |
| Review findings and release evidence | [FINAL-REVIEW.md](FINAL-REVIEW.md) |
| Live submission URL | [agent-native-3d-studio.netlify.app](https://agent-native-3d-studio.netlify.app) |
| Public repository | [ThomasWerner187/agent-native-3d-studio](https://github.com/ThomasWerner187/agent-native-3d-studio) |
| Review build | [final-review preview](https://final-review--agent-native-3d-studio.netlify.app) — deployed; final native share verification blocked by browser-policy verification |
| Reviewed application revision | `9bda5c3` — includes the earlier review and the compact-share update |
| Current preview deploy | `6a990cece684e99516a09013` — matches the build of reviewed application `9bda5c3` |
| Final submitted revision | `[FINAL_SUBMISSION_COMMIT]` — pending creator approval of publication and final submission |
| Public demo video | `[PUBLIC_YOUTUBE_URL]` |
| Devpost draft | [Agent-Native 3D Scene Studio](https://devpost.com/software/agent-native-3d-scene-studio), submission `1168246` — Overview saved, 2/5 steps; not Submitted |
| Local exported candidate | `scratch-submission-media/submission-demo.mp4` — ElevenLabs Lily narration; video and audio each 135.000 seconds; 32 caption cues; final watch/voice approval pending |

## Before submitting

- [x] Review and commit the application candidate as `9bda5c3`. The earlier full secret scan covered **158.65 MB** with **0 findings**; the staged share update scan covered **33.47 KB** with **0 findings**. Final publication/submission approval remains a separate gate.
- [x] Run the consolidated candidate checks: `npm ci` (audit **0 vulnerabilities**), `npm run build` and `npm run smoke`. The final build passed with **26/26 tools, 58/58 semantic checks**, including compact-share navigation, legacy links, decompression limits and asynchronous import protections. `npm run test:animations` and `npm run test:lofi` previously passed on the unchanged animation/sequence core, including 12 bounded automatic lofi cycles. The reviewed code release is recorded above.
- [x] Check the candidate through native WebMCP: composition, live state, next scene, full-session pause by human pointer input and resume. Verify actual Aurora Drift playback after **Enable sound**. Confirm the **390 × 844** mobile layout fits without introductory-panel overlap.
- [ ] Deploy the same revision to the live submission URL and check it in a fresh browser session, without a login or a cached shared scene.
- [ ] Verify the final share fix through a native-browser open/restore/tool-call round trip. This remains unverified because browser-tool navigation to the review deployment is denied by admin-policy verification. Earlier native lofi/collaboration results do not complete this later check.
- [x] Run local compact-share checks: **46 objects restored exactly**, further tools work, legacy links remain supported, and decompression limits/import races/cancellation/human-edit preservation pass. The tested link shrank from **31,386 to 3,318 characters**; native deployment verification remains separate.
- [ ] Discover all 26 tools and call `help`, `compose_lofi_scene`, `describe_scene` and `arrange_scene` through native WebMCP on the deployed build. Preserve the requests and results.
- [ ] Complete the judge walkthrough: lofi progress, native next-scene transition, cycling state, sound unlock, full-session human takeover, human camp placement, selective layout undo and a reopened share link.
- [x] Verify basic repository access and licensing anonymously. GitHub showed **Public**, its signed-out interface, an accessible `LICENSE` and detected **MIT license**. The About description no longer contains an obsolete tool count.
- [ ] After pushing/merging the reviewed release, verify its actual registration source, run instructions and assets while logged out. The current public `main` README still describes the earlier 20-tool version; the basic access check does not complete final source verification.
- [x] Verify bundled font notices and record music provenance. DM Sans and Manrope include their OFL notices; Thomas confirmed the three Suno tracks are his. [Music credits](../public/music/README.md) record that owner-provided statement without asserting subscription terms.
- [x] Generate the eight replacement English narration tracks with ElevenLabs **Lily — Velvety Actress**, model `eleven_v3`. Source audio totals **103.04 seconds** in the fixed 135-second edit; MP3s, character alignment and generation provenance are retained locally.
- [x] Verify the revised **135-second, 720p, 30 FPS H.264/AAC** film, SRT captions and poster after replacing the rejected narration. Both media streams are **135.000 seconds**; all **32 captions** are valid and at least **0.8 seconds** long. The mix measures **−17.4 LUFS integrated / −2.87 dBTP true peak** (**−20.0 dBFS mean / −2.9 dBFS sample peak**). The opening and evidence cards disclose multiple live WebMCP sessions, native waiting-time cuts remain labeled, and the full 20-second build retains its real timing. The [recording plan](recording-plan.md) records the exact master checksum.
- [ ] Have the creator watch and listen to the complete exported English film, approve the synthesized Lily narration, and confirm that it matches this release and explains WebMCP. Automated audio measurements do not complete this review.
- [ ] Upload the film to YouTube as **Public**, wait for processing, and verify its watch page while logged out. Replace the public-video marker above and in `SUBMISSION.md`.
- [x] Complete the Devpost CAPTCHA and create the project draft. Submission `1168246` has its Overview saved; **2/5 steps** are completed.
- [ ] Clean the unsaved Details draft: replace the entire About editor contents with `scratch-submission-media/submission-kit/fields/project-story.md` or the story in `SUBMISSION.md`. The last visible editor contained the empty template plus appended text. Confirm Built-with entries as actual tags; WebMCP was only unconfirmed input. The local kit's `fields` directory contains the prepared copy/paste fields.
- [ ] Fill the Devpost fields using `SUBMISSION.md`, including live URL, public repository, video and testing instructions. Add teammates and confirm accepted invitations if applicable.
- [ ] Save the Details step. Its current edits are unsaved, and the required public YouTube link is still missing. Browser-tool access to Devpost is currently denied because admin-policy verification failed; use an authorized browser session to finish. The CAPTCHA has already been completed.
- [ ] Submit and save. Verify the green **Submitted** label on [My projects](https://devpost.com/submit-to/31011-the-webmcp-challenge/manage/submissions). A draft or saved portfolio entry does not complete this check.

## Timing and freeze

The deadline is **September 3, 2026, 13:00 PDT / 22:00 CEST**. Judging ends **September 21, 2026, 17:00 PDT / September 22, 02:00 CEST**. The [official rules](https://webmcp.devpost.com/rules), checked September 3, prohibit changes to the submission after the deadline and require the project to remain freely available for evaluation through judging. The organizer's final reminder also explicitly includes the repository, video and live site in the freeze.

- [ ] Save the final commit, deployed URL, video URL and a screenshot of the green Submitted status before the deadline.
- [ ] Ensure future development cannot automatically replace the submitted deployment. Keep the submitted repository, video and site unchanged throughout judging.
- [ ] Keep the live site and public repository available. Do not delete the deployment, replace the video or remove access during the judging period.

## Development record

The repository history begins during the submission period. These dated commits make the major additions easy to inspect:

| Date (CEST) | Commit | Added |
| --- | --- | --- |
| September 1, 08:55 | [`6ea0c7c`](https://github.com/ThomasWerner187/agent-native-3d-studio/commit/6ea0c7c) | Initial three.js studio and seven native WebMCP tools |
| September 1, 22:19 | [`00cc089`](https://github.com/ThomasWerner187/agent-native-3d-studio/commit/00cc089) | Operation contract, cancellation, concurrency and atomic batches |
| September 2, 21:11 | [`4729a8c`](https://github.com/ThomasWerner187/agent-native-3d-studio/commit/4729a8c) | Forest diorama and human-preserving layouts |
| September 2, 23:03 | [`0ed6909`](https://github.com/ThomasWerner187/agent-native-3d-studio/commit/0ed6909) | Lofi composition, continuous camera and rendering work |

The timestamps document application development in this repository. Third-party libraries, fonts and bundled music have separate provenance and licenses.
