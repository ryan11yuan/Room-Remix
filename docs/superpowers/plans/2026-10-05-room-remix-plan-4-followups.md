# Room Remix Plan 4: follow-ups for Plans 4b–5

Plan 4 (the splat room scan) is on `master` (414edf5..7c3ff25). It passed:
- per-task reviews;
- a final whole-branch review, then one final fix wave and its re-review;
- a Chrome walk-through with a public sample scan (`butterfly.spz`, 177,132 splats, kept outside the repo);
- a Strict Mode check in `next dev`.

308 tests pass. This file keeps what is still open.

## What the browser walk-through confirmed
- **Loading:** a scan loads and shows its splat count. It appears in its own coordinates, inside the tinted box.
- **Unreadable files:** a non-splat file gives "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export." and the plain box view stays.
- **Aligning:**
  - Step 1 (floor taps) hides the box and room items, frames the scan, shows the banner and disables Place panel, Load and the camera presets.
  - Step 2 (corner taps) refuses the wrong wall or the wrong order with a hint and restarts the corner taps. The right order goes on to step 3.
  - Step 3 applies the alignment live, with the outline box, the room items and the Corner view. The nudges work.
  - Done crops splats outside the room (+0.3 m) and keeps the outline box. Cancel returns to the Corner view.
- **Keeping:**
  - A reload restores the scan and its alignment exactly, including a record written by an earlier build.
  - Remove empties IndexedDB.
  - A changed room size moves the crop with it.
- **Rays and panels:** the rays stay drawn over the scan, including in a Listener's view facing the back wall. Place panel works with the walls in outline.
- **Other:**
  - Hide/Show switches the box back to tinted.
  - No horizontal overflow at phone width.
  - The paused render loop resumes after scrolling back.
  - Strict Mode's double mount leaves one scan and a clean console.
- **Console noise:** the only remaining messages are Spark's own "Worker error: Invalid PLY file" warning on a bad file, and an ANGLE shader-compiler warning (X3203, at the driver level).

## Not checked by machine; please check on your phone with your real scan
- **Alignment on a real room:** whether the floor and the right wall's corners are easy to reach.
  - Step 1 frames the scan from outside, so the ceiling of a closed scan may hide the floor.
- **Phone performance and memory:**
  - frame rate with 0.5–1.5M splats on an iPhone 13;
  - whether `antialias: true` (Spark advises false) costs too much;
  - memory while replacing a scan, when two scans are briefly in memory.
- **iOS Safari:** whether the file picker offers `.spz`/`.ply`, and how IndexedDB handles 10–100 MB scans.
- **The view with a real scan:** whether the speaker, listener and outline stay readable with real walls close to the camera.

## For Plan 4b (walk mode)
- **RoomScene API at 7c3ff25:**
  - `TapMode 'none' | 'panel' | 'scan'` with `setTapMode`.
  - `onScanTap(point)`.
  - `setShellStyle('tinted' | 'outline' | 'hidden')`.
  - `setRoomItemsVisible`; rays show only when both the rays toggle and the room-items toggle are on.
  - `frameBox(min, max)`. It ignores non-finite bounds, and it marks the camera as user-moved, so a dims edit doesn't snap back to a preset.
  - `addLayer`/`removeLayer`, and the `renderer` getter.
  - The render loop pauses while off-screen.
- **Draw order:** the splat layer's group has `renderOrder = -1`, so every transparent object draws over the scan. Walk-mode visuals inherit this.
- **Walking during alignment:** walking must be off while the alignment wizard is taking floor or corner taps (tap mode `'scan'`). RoomView already disables the camera presets then.

## Fix with Plan 5
- **Must fix: rooms and scans belong together (Ruling 10).**
  - Today the room isn't saved, but the scan is. After a reload, an aligned scan sits in the default 4 × 3.5 × 2.6 m room: the crop and outline don't match, and re-aligning computes the scale from the default length.
  - A share link also shows your own scan inside someone else's room.
  - "My rooms" must save the room and key its scan by room id (spec §8), so restoring pairs them.
- **Demo room:** the author's bedroom scan, pre-aligned. Call `setCameraPreset` explicitly when loading it.
- **Camera with real scans:**
  - Consider cutting away the ceiling, or drawing the outline edges with `depthTest: false`, so the floor and room items stay visible.
  - The far plane is 200 m, and framing uses the bounding box, so floater-heavy scans are framed too wide. Frame on the mean centre or on percentile bounds.
- **Storage:**
  - `updateScanAlignment` rewrites the whole 10–100 MB record on every Done. Store the alignment as its own record.
  - Opening IndexedDB has no `onblocked` or timeout (an iOS hang risk at page start).
  - A missing `indexedDB` gives a cryptic TypeError.
  - The save's failure cause isn't logged. A failed `remove()` is silent, and the scan comes back on reload.
  - With two tabs, a compare-and-set skip should report `stored: false`, not "alignment only kept". This is a one-line change.
  - An alignment finished while the first save is pending is dropped if the page unmounts before the save lands.
- **Crash-loop marker:** it is cleared when the scan has parsed, before the first frame draws it. GPU or first-render crashes aren't covered. If you clear it later, mind the render loop pausing while off-screen.
- **Performance:** the measuring pass runs over every splat on the main thread. Expect jank near 1.5M splats; consider a worker.
- **Alignment UX:**
  - A tap that misses the scan gives no feedback.
  - The step 2 banner wraps over the canvas on phones.
  - The scan isn't visibly levelled after the floor taps; that only shows at step 3.
  - Done with an invalid room size is silent.
  - Cancel while a size field is empty leaves the camera on the scan.
- **Smaller gaps:**
  - A tap-mode or visibility change mid-drag doesn't cancel the drag.
  - Tapping the left wall back-to-front gives a 180°-turned alignment that the side check can't detect; the user sees it and re-aligns.
  - `alignFromCorners` has an absolute 1e-9 span check, and nudges don't guard against scale ≤ 0.
  - The "finite and positive dims" check exists three times (`placement.ts`, `RoomScene.ts`, `ScanController.ts`).
  - No test pins `boxView`'s distance or its 0.5 m floor, or the near-collinear factor in `levelFromFloor`.

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history and the ledger.
1. **Sample scan:** the browser checks used a public sample kept outside the repo. Your real scan comes with Plan 5.
2. **Which way is up, and which side is in:**
   - Alignment uses a point inside the room instead of the camera position, so scans stored upside down level correctly.
   - The final wave refined this. The side check now uses the centre of the three floor taps, and "up" uses the mean of the splat centres. The scan's bounding box is no longer used, because windows and floaters pushed its centre outside the room.
3. **Storage errors** always reject with the real error, never `null`.
4. **The scan tap** reports only the hit point.
5. **Controller rules:**
   - empty or broken scans count as unreadable;
   - one load at a time;
   - aligning shows the scan and ends panel placement;
   - the crop changes only on real size changes;
   - scan framing doesn't snap back on a size edit;
   - a startup restore yields to a file the user opened;
   - a superseded load is silent.
6. **Walk mode** stays out of Plan 4. Another session wrote it into the spec as Plan 4b, to follow this plan.
7. **The splat layer:**
   - it swaps scans only on success;
   - it ignores stale and empty loads;
   - it remembers the alignment;
   - it waits for Spark's in-flight sort before disposing, which removed an "Uncaught (in promise)" seen in Chrome.
8. **Storage follows the scan on screen:**
   - alignment writes are compare-and-set on `savedAt`;
   - a failed save on Replace deletes the old record and retries once;
   - a save that was overtaken (by Remove or Replace) stops before touching storage;
   - "scan not kept" and "alignment not kept" are separate amber warnings.
9. **Draw order:** the scan draws first, so the rays and room objects draw over it.
10. **Recovering from a bad saved scan:**
    - Remove is offered while a scan is loading and after an error.
    - A saved scan that never finished opening isn't auto-restored on the next visit; the user gets "Your saved scan didn't open last time."
11. **Bundle guard:** a lint rule keeps Spark reachable only through the dynamic import.
