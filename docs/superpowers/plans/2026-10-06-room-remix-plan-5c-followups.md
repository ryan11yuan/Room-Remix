# Room Remix Plan 5c: follow-ups for Plan 5d and later

Plan 5c (setup wizard, player layout, top view, accessibility) is on `main` (dc84c29..eb71d51). It passed:
- per-task reviews of all seven tasks, with no fix rounds needed;
- the controller's Chrome checks after every task, at 375 × 812 and 1280 × 800;
- a final whole-branch review, then one fix wave, its re-review, and a small residual patch, checked again;
- an end-to-end walk-through on fresh phone-sized profiles.

621 tests pass. This file keeps what is still open.

## What the browser checks confirmed
- **First visit:**
  - `/room` with no saved rooms goes to `/setup` without writing anything.
  - A shared link on a fresh browser goes straight to the room and makes one room.
  - With storage blocked, the visitor stays on `/room` and sees the "isn't keeping your rooms" notice. The unit switch still works.
- **Setup wizard:**
  - Size works in metres or feet. Feet are the default for `en-US`, and the limits are rounded inward ("Length must be between 5.0 and 98.4 ft.").
  - The surface diagram works by tapping, and the material choices sit directly under it.
  - Placement uses the top view, by drag or arrow keys. The scan is optional.
  - Back and Next keep every edit, and focus moves to each step's heading.
  - "Open my room" makes exactly one room. A second run makes "My room 2".
  - Back from the new room doesn't reopen an empty wizard.
- **Scans from setup:**
  - The scan arrives in the new room, ready to align, and comes back after a reload.
  - It never lands in the room that was open before.
  - A run without a scan, or with the scan removed, gives a room without one.
  - Without WebGL, the Scan step says why a scan can't be used.
- **No `CompressionStream`** (iOS 15 Safari and older browsers):
  - Setup and "Explore it in 3D" still open rooms: they are saved directly and opened through the tab's remembered room.
  - Share link says sharing isn't supported.
- **Top view:**
  - Without WebGL, the room page shows an editable top view, oriented like the 3D Top view.
  - A drag that leaves the drawing stops 0.3 m from the walls.
  - Arrow keys move items 0.1 m without scrolling; Alt+Arrow is left to the browser.
- **Player:**
  - **Control bar:** on phones it is fixed to the bottom, with Play, Dry ↔ In your room, Now ↔ With fixes and a summary. Keyboard focus scrolls clear of the bar.
  - **Play:**
    - With nothing loaded, Play starts the drum loop.
    - While a song is still loading, Play waits and the bar says "Loading <file>…". Checked with a 16 MB file at 6× CPU slowdown.
  - **Room card:** shows the reverb time now and with fixes, against the 0.3–0.5 s target.
  - **Errors:**
    - Rug and panel errors show under What if….
    - Edit room opens itself on a new error of its own.
    - The bar says where to fix the room.
  - **"With fixes":** plays as loud as Now and Dry, and never goes silent when a fix is ticked back on (measured against a steady baseline).
  - **Desktop:** the controls sit in a side column beside the 3D view.
- **Accessibility:**
  - **Touch targets:** no control is smaller than 44 × 44 px on any page or setup step, the dialog included.
  - **My rooms:** focus moves sensibly and the buttons name the room ("Delete for good: …"). A backdrop click closes the dialog; a drag that ends on the backdrop doesn't.
  - **Share link:** it announces "isn't supported", and focuses the copy-by-hand field with the link selected.
  - **Also:**
    - there is a visible focus ring;
    - rays start hidden for visitors who ask for reduced motion;
    - pages have titles.

## Not checked by machine
- **Screen readers:**
  - the wizard's live regions and heading focus;
  - Edit room's prompt while it's folded (once it's open, the prompt and the list inside may both be announced);
  - the h2 inside Edit room's `<summary>`;
  - the top view's buttons in browse mode.
- **iOS Safari:**
  - the fixed bar and its safe-area padding;
  - the `<details>` marker;
  - the first tap's audio unlock with Play-for-drums;
  - a real touch drag on the top view;
  - the no-`CompressionStream` path on a real iOS 15 device.
- **A 44.1 kHz device:** Play with nothing loaded should wait for the room to re-simulate at the device's rate, then play without a second tap.
- **Listening:** whether the rug and panels are clearly audible on headphones (spec §12).

## For Plan 5d
- **End-to-end tests (Playwright, Chromium and WebKit):**
  - first visit → setup → room, and setup with a scan;
  - no `CompressionStream`;
  - a share link in a fresh profile;
  - focus against the fixed bar;
  - re-ticking a fix in With fixes, checked with analyser levels;
  - Play while a song loads;
  - My rooms' focus moves.
- **Prefetch 404s:** the segment-prefetch requests (`/<route>/__next.<route>.__PAGE__.txt`) now 404 for `/setup` as well. Navigation still works. Fix them with the Cloudflare Pages rules from the 5b follow-ups.
- **A repeatable loudness check** with `OfflineAudioContext` (from 5b).

## Smaller open items
- **A doubled line:** a position error and a fix error together show "Changes to this room aren't saved until this is fixed." twice.
- **Screen readers on the Placement step:** it has no number fields for screen-reader users, and the top view doesn't announce the new position after a nudge.
- **The Scan step** is an extra screen for most visitors. It could become an optional part of Placement.
- **Returning visitors:** "Try your room" on the landing page always starts setup. Returning visitors may pile up rooms towards the cap of 50, so "My rooms" could be their main action.
- **First visit with an unreadable link:** it makes a default room. Spec §11 says to open setup with a notice.
- **Units:** a room of 1.5–1.52 m shows "4.9 ft" under a "5.0–98.4 ft" limit, and retyping the displayed value fails.
- **Top view:**
  - an oversized rug's drag snaps its centre to a wall;
  - a second finger replaces the drag.
- **The surface picker** draws very deep rooms alike (the depth clamp).
- **The contrast guard** only matches `text-neutral-500/600/700`.
- **The bar's scroll padding** applies on every page below `lg`. This is harmless.
- **The direct-open path:** if sessionStorage alone is blocked and a room is already open, the new room is saved but not opened. There is a comment in `openRoomDirectly.ts`.
- **Error placement:** the wizard's `STEP_FIELDS` is a separate table from `errorPlace`.

## Deliberate decisions made during execution
These went beyond or against the plan's literal text, or the design rulings. The reasons are in the commit history and the plan's "Decided here".
1. **The surface picker faces the front wall** from behind the back wall, instead of an oblique view, so no surface becomes a sliver.
2. **Setup hands the room over through the share-link import.**
   - It names the room uniquely first, so the room never merges into an existing one; an untitled room counts too.
   - The scan travels in memory, bound to the link and then to the room `start()` reports.
3. **Without `CompressionStream`, setup saves the room directly** and opens it through the tab's remembered room. `start()` now follows the tab's room when it points at a different saved room.
4. **Bad links keep 5a's behaviour:** a notice, and the visitor's room opens. Spec §11 says to open setup.
5. **Leaving the Size step pulls the speaker and listener inside the new size.**
6. **Lengths are text fields** with a decimal keypad, so a comma works and typing isn't reformatted.
7. **The engine never warms a new IR up behind a silent pair,** so "With fixes" is never silent.
8. **Play with nothing loaded plays the drum loop, and waits for a song that is still loading.** This shortens a phone visitor's path to the first sound (spec §1).
9. **The material choices sit directly under the diagram,** in two columns on phones.
10. **Errors are placed where they're fixed:** rug and panel errors under What if…, the rest under Edit room. The bar says which.
11. **The clap step waits for Plan 2.**
