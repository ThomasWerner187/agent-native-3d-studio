# Final submission review

Review date: **September 3, 2026**. The current release focuses on additive human-agent world building: a person places pond/cabin anchors, an agent decorates the existing scene, the person changes one of its objects, and the agent reads that edit before continuing.

The previous gallery-led demonstration is historical evidence. It does not verify the new 27-tool collaboration release or its planned continuous-scene film.

## Current implementation

| Area | Review result |
| --- | --- |
| Human editing | A visible placement palette, Start empty, draggable objects and a numeric inspector keep the person's choices in the shared scene. Local controls use human provenance. |
| Agent additions | Scatter supports a live anchor, actual object bounds, clearance and reserved cabin entrance space. It plans exact additions before mutation and rejects crowded requests with `no_space`. |
| Object ownership | Readbacks expose creator, last editor, revision, human revision and recent changes. A human move remains associated with the same object ID. |
| Selective scatter undo | `undo_scatter` removes untouched additions while preserving objects changed later by a person. Requested counts and live counts distinguish creation from later interruption. |
| Atmosphere | Continuous camera motion can target the current scene or an object without replacing the scene. Lighting and audio remain separately controllable. |
| Product presentation | The gallery and camp-layout example are secondary. Copy-prompt buttons prepare instructions; they do not contact a model. Native calls and local previews remain distinct. |
| Documentation | README, submission story, judge guide and 145-second script describe the same additive collaboration. The tool table lists 27 tools. |

## Current evidence and open gates

| Check | Observed status |
| --- | --- |
| Local application gate | Integrated build and smoke passed **27/27 tools and 76/76 behavioral checks** after the placement-region and fog adjustments. The lofi regression also passed 12 bounded automatic cycles. Local harness results are not native discovery proof; any later changes still require the commit gate. |
| CI reproducibility | The [first collaborative run](https://github.com/ThomasWerner187/agent-native-3d-studio/actions/runs/33734185100) completed 27/27 tools and 75/76 behavioral checks. Its fixed 1.4-second camera wait was too short for the software renderer and rounded scene readback. Motion verification now waits for observable progress, and CI mouse drags retain multiple real pointer events with fewer interpolation steps. The exact current-head CI result is attached to [PR #7](https://github.com/ThomasWerner187/agent-native-3d-studio/pull/7/checks) and recorded in the review-kit manifest. The deployed application is unchanged by this test correction. |
| Visual QA | New collaboration screenshots and mobile review are local QA. Any images labeled as local harness evidence must retain that label; they do not replace the native recording. |
| Native browser access | Browser-tool access remains blocked because admin-enforced policy could not be verified. No workaround is being used. New native co-creation, final share reopening and final deployment walkthrough remain unverified. |
| Audio production | Eight actual ElevenLabs Lily / `eleven_v3` tracks total **83.04 seconds** and fit the shared **145-second** plan at original speed. MP3s, alignment and provenance are cached in the current worktree. |
| Audio rehearsal | A **145.000-second WAV** and **31 aligned captions** are produced. The rehearsal mix measures **−18.58 LUFS / −3.66 dBTP**, mean **−21.0 dBFS**, sample peak **−3.7 dBFS**. Its metadata says `native_capture:false`. A full listening review remains open. |
| New film | Script and media pipeline are prepared. No new native footage or final MP4 exists. The assembler requires one recorded page/scene, unchanged anchors, exact tree additions and a real human edit before it will render the final film. |
| Review deployment | Application `194e932c8daec5857952b5a33169229507b193dd` is deployed at [collaborative-review](https://collaborative-review--agent-native-3d-studio.netlify.app), Netlify deploy `6a99310308d1752d54879bee`. Deployment completed; fresh native browser verification remains blocked. |
| Source scan | 86 tracked files / 26,086,802 bytes scanned with no credential-pattern, environment-file or work-context findings before the application commit. |
| Publication | Production publication, final source verification and submission remain pending. The review deployment is a separate candidate. |
| YouTube | No verified public URL for the new film. |
| Devpost | Draft `1168246`, [Agent-Native 3D Scene Studio](https://devpost.com/software/agent-native-3d-scene-studio), has Overview saved and was last observed at 2/5 steps. It is not Submitted. Details were unsaved; the story editor contained the empty template plus appended text, and Built-with input was unconfirmed. Replace the whole story with the current SUBMISSION.md, confirm tags, enter final links and save. Browser-policy verification currently blocks completion through the tool. The earlier CAPTCHA is resolved. |

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
