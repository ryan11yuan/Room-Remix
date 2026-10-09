# Plan 9 Follow-ups: Rehearse a Place by Sound

**Date:** 2026-10-09
**Plan:** `2026-10-09-room-remix-plan-9-sound-rehearsal.md`
**Spec:** `2026-10-08-room-remix-sound-rehearsal-design.md`
**Commits:** f74ba97 to 41490fb.
- Each task had a spec-and-quality review.
- Then came a final whole-branch review on the most capable model, one fix wave (73c6f7a, 9d77312, 41490fb) and a scoped re-review.

## Before the demo (the user)

1. **Decide the body margin (recommended: change it).** This is the one open issue that can break the demo.
   - **The problem.** Walking treats every blocking object as 0.25 m bigger on every side (`BODY_M` in `src/lib/explore/walk.ts`). In the conference room that leaves only 23% of the floor walkable, split into three areas that don't connect.
   - **What the live check saw.** The explorer couldn't reach a door placed 2 m ahead of the start: every step bumped a chair.
   - **Measured options** (0.1 m grid, conference room):

     | Body margin | Chairs | Walkable | Areas |
     |---|---|---|---|
     | 0.25 m (now) | block | 23% | 3 |
     | 0.15 m | block | 37% | 2 |
     | 0.10 m | block | 44% | 1 |
     | 0.25 m | don't block | 46% | 1 |

   - **Recommendation:** `BODY_M = 0.1`. Chairs still stop you and say "chair", and the room stays one connected space. Update the walk and session tests that assume 0.25 m.
2. **Restart the demo server with `npm run demo`, not `demo:serve`.** The server on :8080 predates this plan, so it has no `/checked` route. `npm run demo` also rebuilds `out/`, which now holds the voice clips.
3. **Plug the headphones in before the first Start exploring.** One audio context lasts as long as the viewer is open.
4. **Listen on headphones.** About five minutes; nobody has heard it yet.
   1. Start exploring and press Space. Do the names come from the right directions?
   2. Turn 90° with D three times. Do they swing to the left ear?
   3. Then blindfold yourself and use Tab to the door, Enter, and W.
   4. If voices are too quiet at a distance, or the echo is too strong or weak, change `ROLLOFF` (0.6) and `ECHO_SEND_DB` (−10) in `src/lib/audio/spatial.ts`.
5. **The voice clips** were recorded with Kokoro (`kokoro-js`, voice `af_heart`). To re-record: `npm run voices`, or `npm run voices -- --sapi` for Windows' built-in voice.
6. **Add the door by hand.** The object finder found no door in the conference room or the classroom (see "Known limits"), so adding it is part of the demo.
   1. Open the room.
   2. Press Add an object.
   3. Click the floor just inside the doorway, not the door itself, which lands beyond the wall.
   4. Check that Tab says "Door, … about N metres" with a sensible distance before blindfolding anyone.
7. **Demo script:**
   1. Open the room built beforehand.
   2. Fix the list: rename a wrong label, add the door.
   3. Start exploring.
   4. Blindfold the judge and give them the headphones.
   5. Space to hear the room, then Tab to the door, Enter, and walk with W and the turns.
   6. "You're at the door." Take the blindfold off and point at the real door.

## Verified (controller)

**Object finder**, on the real rooms: 24 frames in about 13 s each, no download.
- Conference room `1c59fe0f`: chairs, tables, a whiteboard and a TV.
- Classroom `df65bc4f`: chairs, tables and whiteboards (the projector screens read as whiteboards).
- Room `5ed189d6`: also found a door.

**Live in Chrome**, against a test server on :8081.

*Conference room* (about 4.6 × 3.3 × 2.4 m):
- **Check mode:**
  - Rename, remove and add all work, save and survive a reload.
  - After the fix, Add lands inside the room even when clicked far beyond a wall.
- **Start exploring:**
  - Fetches the 32 clips once; a second start doesn't fetch them again.
  - Speaks and captions the intro, and moves focus off the button.
  - Hides the key hints.
- **Keys:**
  - Space captions the names clockwise, with plurals.
  - Tab says "Door, 12 o'clock, about 2 metres." and turns its chip teal.
  - W steps (2 → 1.5 m), and bumps stop you at furniture.
  - Three D presses put the door at 9 o'clock, so turning goes the right way.
  - H says the help line, and Esc says "Stopped."
- **Stop exploring** returns to check mode.
- **Arrival:** Tab to the table, then Enter, says "You're at the table."
- No console errors or warnings, and every request returned 200.

*Classroom* (about 12 × 11 × 3.1 m): 96 chairs, 19 tables and 8 whiteboards; the intro and a 15-group scan work.

**Not checked live:** Ctrl+Tab (it would switch the test browser's tab; the key tests cover it) and how anything sounds (step 4 above).

**Tests:** 281 pass. tsc and ESLint are clean (1 existing warning in `server.test.ts`). `next build` succeeds.

**Cleanup:**
- The test's `checked-objects.json` was deleted.
- The `detections-v2.json` caches for the three rooms were kept, so opening them is instant.

## Rulings made during execution

Each gives what was decided, why, and the cost if wrong.

1. **`demoRoom.ts` stayed one task longer** (deleted in Task 2, not Task 1).
   - Why: `demoClips.test.ts`, deleted in Task 2, imported it.
   - Cost if wrong: none.
2. **One audio context for the viewer's lifetime**, as spec §8.1 says, instead of the plan's new one on every Start exploring.
   - Why: rebuilding it re-fetched all 32 clips and risked "Couldn't load the voices." mid-demo.
   - Cost if wrong: one audio context stays open while the viewer is.
3. **Door threshold kept at 0.3**, rather than the plan's 0.2/0.15 fallback.
   - Why: OWL-ViT base scores the classroom's real doors at 0.13 or less, so 0.2 and 0.15 find nothing, and about 0.1 would also admit false doors. A false door misleads a blind explorer more than a missing one, and Add covers a missing one.
   - Cost if wrong: the helper adds the door by hand in each room.
4. **What the fix wave covered:** the Critical, both Importants, placement left armed, the name-select typing, the DESIGN.md leftovers, the dead `pose()`, and a server test.
   - Cost if wrong: a larger fix diff.
5. **Deferred: caption live region and `role="status"`.**
   - Why: the demo has no screen reader, and aria-live captions plus the narrator would make a screen-reader user hear every line twice. That needs a product decision first.
   - Cost if wrong: a screen-reader user isn't told when finding finishes or a save fails.
6. **Deferred: cancelling Add,** arrival for found wall objects beyond the fitted box, and minor test and dead-code gaps.
   - Cost if wrong: backing out of Add takes a place-then-Remove.

## Known limits

**The object finder**
- OWL-ViT base misses small or distant doors; the helper's Add is the safety net.
- Projector screens are found as whiteboards.

**Walking**
- The body margin issue above.
- No route-finding: the pulse points straight at the target, and a table in the way has to be walked around by feel.

**Rooms**
- **Crowded rooms:** a dense room like the classroom lists over 100 objects for the helper, and its chairs merge into a few "chairs" groups when scanned.
- **Approximate distances:** the scale assumes the phone was held 1.5 m up.
- **A simple echo:** it only gives the room's size.

**Accessibility**
- The captions' live region and the panel's status lines aren't announced by screen readers (ruling 5).
- A running scan is now cut off by Tab, Enter, H and Esc. Moving doesn't cut it off.

**Not yet tried by a blind user.** Don't claim it helps blind people until one has.

**Deferred minor findings,** from the per-task reviews:
- **Untested edges:** a few untested cases in walk, scan and words.
- **Small hardening:** the `bandNoise` cache grows by a few MB per room size; `NumpadEnter` is untested; the `--only` flag of `npm run voices` silently ignores a mistyped clip name.
- **Dead code:** `sabine`, `mapBands` and `NAME_IDS` are used only in their own files or tests.
- **Repeated values:** 1.5 m is defined twice (`EYE_HEIGHT` and `EAR_HEIGHT_M`).
- **Panel focus:** focus drops after Remove.
