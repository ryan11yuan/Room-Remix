# Plan 8 Follow-ups: Sound in the Splat Viewer

**Date:** 2026-10-07
**Plan:** `2026-10-07-room-remix-plan-8-splat-sound.md`
**Spec:** `2026-10-07-room-remix-splat-sound-design.md`
**Commits:** 1bd0d91 to 88c51c2, plus 5529077 (the speaker-stand tweak). Each task had a spec-and-quality review, then a final whole-branch review on the most capable model, one fix wave, and a scoped re-review.

## Before the demo (the user)

1. **Restart the demo server.**
   - The server on :8080 (PID 17744) started at 14:12, before Plan 8. It has no `/objects` route, so opened there the room says "Couldn't find objects".
   - Stop it with Ctrl+C in its terminal, then run `npm run demo`, which rebuilds `out/` and serves.
   - The controller's test server on :8081 (PID 33944) runs the new code. It can stay up, or be stopped with `Stop-Process -Id 33944`.
2. **Listen on headphones.** This is about two minutes, and nobody has listened yet. Open the conference room, place the speaker, then press Play.
   - Stand near the speaker, then walk to the far wall. It should go from dry and present to roomy.
   - Turn about 90°. The sound should swing to one ear.
   - Then try standing behind the whiteboard. The final review estimates this effect is subtle in a 36 m³ room: the cut applies only to the direct sound, which is about 5% of the energy at 3 m. Only claim it in the demo if you can hear it.
3. **Demo script.** The order that shows best:
   1. Objects appear with their chips (instant: the detections are cached).
   2. Find the best spot.
   3. Move speaker here.
   4. Play.
   5. Walk near and far, and turn your head.

## Verified (controller)

**Headless Chrome run on job 1c59fe0f**
- Driven by puppeteer-core against the installed Chrome, from `scratchpad/browse/check.mjs`. The DevTools MCP profile was in use by the other session's Chrome.
- Room fit: about 4.6 × 3.3 × 2.4 m, echo time 0.32 s.
- Objects:
  - absorbs: Chair ×10
  - reflects: Table ×3 (the room has three tables), Whiteboard ×2 (one is the TV, see below), TV
- Chips sit on the right objects.
- Place speaker, then a floor click, places it.
- Find the best spot gives the heat map and marker. The best spot is about 90/100, between the oval table's end and the chairs: not in a corner, not behind the whiteboard.
- Move speaker here, Play, W/S walking and Back all work.
- The console shows no errors, only one existing three.js shader-compiler warning.

**Server**
- `GET /api/splat/jobs/:id/objects` answers in 0.2 s from the cached `detections.json`.
- A fresh detection takes about 8 s on the CPU and downloads nothing; the model is cached in `%LOCALAPPDATA%\RoomRemix\models`.

**Tests:** 767 pass. tsc and ESLint are clean (2 existing warnings in test files). `next build` succeeds.

## Rulings made during execution

Each ruling gives what was decided, why, and what it costs if wrong.

- **R1.** Waves ran in parallel, with one implementer per task on disjoint files and commits by path.
  - Why: the plan, approved for tonight.
  - Cost if wrong: an index.lock retry (none happened).
- **R2/R3.** Task 3 waited for Task 2's types. Other tasks' mid-flight tsc errors were noted and not fixed.
  - Cost if wrong: idle minutes.
- **R4/R4b.** Each task was reviewed as soon as it finished, limited to its own files.
  - Cost if wrong: none.
- **R5/R8.** Tasks 5, 7 and 8 started while their dependencies were in review.
  - Cost if wrong: a follow-up commit (none needed).
- **R6.** Fixed the plan's own defect: a failed model load was cached forever.
  - Why: spec §3.1 says to retry.
- **R7.** The controller does the browser checks.
- **R9.** Chairs, plants and rugs don't exclude floor cells from the speaker map or the listeners.
  - Why: people sit in chairs, and chairs move.
  - Cost if wrong: the map can suggest a spot where a chair stands.
- **R10/R11.** The fix wave covered labels under the chrome, the speaker on a stand, chairs and the heat map, the echo-time line, a failed `create()` not blanking the room, `play()` rejections being caught, a stale map guard, and same-group containment suppression.
  - Skipped: Esc to cancel placement, and heat-map edge filtering.
- **R12.** Kept per-IR loudness normalisation. It removes only about 1.6 dB between 1 m and 4 m here.
  - Cost if wrong: walking away isn't heard as "quieter", only as roomier.
- **R13.** Left the TV labelled "Whiteboard". OWL-ViT confuses the tilted TV.
  - Cost if wrong: one wrong chip in the top-left corner of the start view.

## Known limits and deferred work

**Detection**
- The TV shows a "Whiteboard · reflects" chip as well as its "TV" chip.
- Some frames keep overlapping boxes of the same label; the 3D merge folds most of them.

**Visual**
- The heat map and the speaker ring draw over the splat (x-ray style). The splat writes no depth.
- The speaker's box and its cream stand respect depth. When the speaker stands among chairs or behind the table's end (where the best spot is), the furniture correctly hides the stand, so only the ring and the box show.
- Placement can't be cancelled: it needs a floor click.

**Model limits**
- The model is a box room with materials plus object absorption and direct-path blocking. Furniture doesn't shape the reflections.
- The best-spot score biases are constant across spots.

**Tests not written**
- Deferred test gaps are listed in the SDD ledger, for example `metresPerUnit ≠ 1` in `placeObjects`, the worker crash path, and a timing assertion.
- None of them blocks the demo, per the final review's triage.

**Cut by spec §9**
- Correcting detections or editing the fit.
- Uploading a song.
- Saving the speaker position.
- Rays.
- Phones.
- Playwright tests.
