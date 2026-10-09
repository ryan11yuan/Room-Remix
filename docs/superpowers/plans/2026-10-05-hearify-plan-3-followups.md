# Hearify Plan 3: follow-ups for Plans 4–5

Plan 3 (3D scene and sound rays) is implemented on `master` (4d7eb92..1e849f5). It passed per-task reviews, a final whole-branch review and one final fix wave, and was walked through in Chrome. 146 tests pass. This file keeps what is still open.

## What the browser walk-through confirmed
- **Rendering:** the 3D view renders a translucent box tinted by material, plus the speaker, listener and rays, with no console errors or warnings.
- **Dragging:** dragging moves the speaker. It keeps its grab point, so it no longer jumps 10–20 cm when grabbed.
- **Panel placement:** "Place panel" followed by a wall tap adds a panel. A tap on an occupied spot is refused with "Panels can't overlap."
- **Camera:**
  - Listener's view shows the speaker straight ahead.
  - A camera preset lands exactly even right after an orbit.
  - A resized room is re-framed.
  - Clearing a size field keeps the last room on screen and leaves the console clean.
- **Loudness (loud pink noise at 48 kHz):** Room plays at −15.0 dBFS RMS and Dry at −14.9, against roughly 8 dB apart before. Peaks reach −2.5 dBFS.

## Not checked by machine; please check on a phone and with headphones
- **Drag feel:** the speaker, listener and rug under a real finger. They now have invisible 0.25 m grab spheres.
- **Pinch and orbit:** pinch and orbit while nothing is being dragged.
- **Ray look:**
  - Brightness of the resting rays and the moving pulse on a high-DPI phone. They are 1-pixel lines.
  - Whether the rays visibly dim on a rug or panel in "With fixes".
- **What fixes sound like:** whether adding a rug or panels in a bare tile room is clearly audible.

## Fix before or with Plan 4 (splat layer)
- **Prepare `RoomScene` for a splat:**
  - A way to add and remove a layer, or a getter for the scene.
  - A general tap mode (`panel | splatPoint | none`) instead of the `placingPanel` boolean. The 3-tap alignment needs it.
  - A shell style switch (tinted or outline-only). Translucent walls that don't write depth will tint or hide a splat.
  - Pause the render loop when the view is off-screen (IntersectionObserver). It currently renders at 60 fps all the time, which matters with 0.5–1M splats on a phone.
  - Handle WebGL context loss and restore.
  - Decide antialiasing and pixel ratio for splats on phones.
- **When Plan 4 loads the demo room,** call `setCameraPreset` explicitly. Automatic re-framing stops once the user has touched the canvas, and any tap counts as touching.
- **NaN positions from dragging:** dragging while a size field is empty writes NaN into the speaker, listener or rug position, and the user then has to retype it. Guard in `applyDrag`: return the room unchanged when any dimension isn't finite and positive.

## Fix with Plan 5 (presets, wizard, E2E, deploy)
- **Contract:** `AudioEngine.setIrs` now expects IRs that are already 40 Hz high-passed (`highPass`, `SPEAKER_LOW_CUT_HZ`) and loudness-normalised (`normalizeLoudness`). Recorded preset IRs must go through both, ideally in the worker. Otherwise Dry and the presets won't share one speaker and loudness.
- **Loudness test:** assert on K-weighted level, and add a heavily damped room to the test. The current broadband test only holds for the default room. Do **not** lower `LOW_HZ` to 40 Hz: damped rooms are already 0.7–0.8 dB quieter than Dry under K-weighting.
- **Worker work:**
  - When no fix is on, reuse `now` for `withFixes` (copy the arrays, since both are transferred).
  - Stop sending the ~400 unused order-10 `paths`.
  - Optionally halve the loudness FFTs with one complex FFT per IR.
- **Panel-placement rules** live in `RoomView`: the 8-panel cap and the overlap refusal. Move them to a tested `placePanel()` in `placement.ts`.
- **Positions:** round to 0.01 m after drags, so form fields and share links don't show 17 digits.
- **Camera limits:** set orbit and zoom limits (`maxDistance`, no orbiting under the floor).
- **Accessibility:**
  - Toggles change their label *and* set `aria-pressed`; use one or the other.
  - The canvas needs `role="img"`.
  - Keep the `role="status"` element mounted at all times.
  - Wall taps that miss in Top view give no feedback.
- **Help text** is wrong in Dry mode, where it says "Rays show the room as you're hearing it".
- **Disposal:** `RoomScene.dispose()` leaves the WebGL context alive until garbage collection. Revisit together with context loss.
- **Grazing presses:** a press whose ray grazes the drag plane (rare; Listener's view) can store a large grab offset. Ignore grazing presses.
- **Momentum:** orbit momentum keeps the view turning for about 1 s if you grab an item right after a fling.
- **Smaller test gaps:**
  - nothing pins that path energy is scaled exactly once;
  - no test where a calibration factor below 1 exercises the `Math.min` clamp;
  - no `disposeTree` test;
  - no dispose-on-replace test for `RaysObject`;
  - no hook tests (they need a DOM test setup).

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history.
1. **Interactive checks:** the controller did the browser walk-through; drag and ray feel on a phone and the listening checks are left to the user.
2. **Speaker roll-off:** a 40 Hz Butterworth high-pass (the "speaker") is applied to every simulated IR and to the Dry path. Pink weighting alone didn't fix the ~8 dB gap, because it came from bass below 50 Hz.
3. **Shared tolerance:** one `GEOMETRY_EPS` (1e-9), so panels that exactly touch never count as overlapping.
4. **Older links:** share links with stacked panels no longer load. Accepted, because the app hasn't been published.
5. **Panels** sit on their wall, offset by half their 4 cm thickness.
6. **Rays:** the shader applies alpha once (resting rays were nearly invisible) and outputs the colour as authored. The pulse keeps its position when the rays update.
7. **Task 8 fixes:**
   - The WebGL 2 check uses a real store, so a missing WebGL shows the notice instead of crashing.
   - Listener's view starts 0.2 m ahead of the head.
   - Pointer identity and button are tracked.
   - Preset clicks clear orbit momentum.
   - Tapping can't place more than 8 panels.
8. **Final fix wave:**
   - grab offset and grazing guard;
   - finger-sized grab spheres;
   - re-framing for loaded and resized rooms;
   - logging when the scene fails to build;
   - no console errors while a size field is empty;
   - the simulation client survives stale workers and failed starts.
