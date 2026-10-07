# Room Remix — Sound in the Splat Viewer (Plan 8)

**Date:** 2026-10-07
**Status:** Design approved in chat, pending spec review
**Builds on:** `2026-10-07-room-remix-splat-viewer-design.md` (the viewer) and `2026-10-04-room-remix-design.md` §5–6 (the acoustics engine and audio player, reused as they are).
**Deadline:** the demo is tonight. Happy path only; everything in §9 is cut.

## 1. Purpose

Inside a room built from a video, someone places a speaker and the app:
- finds the objects in the room and shows which absorb sound and which reflect it;
- shows where the speaker should go so that everyone in the room hears it well;
- lets them walk through the room on headphones and hear the sound change as they move.

**Success criterion:** on the demo laptop, open the conference room already built (job `1c59fe0f-02bb-4ddd-97c6-118bb432c93d`). Within about a minute:
- its chairs, tables and whiteboard are labelled in 3D as absorbing or reflecting;
- **Find the best spot** shows a floor heat map with a believable best spot (not in a corner, not behind the whiteboard);
- with the speaker placed and music playing, walking toward it, away from it, and behind the whiteboard audibly changes the sound.

## 2. Fitting a room box to the splat (browser)

The acoustics engine needs a box in metres (`RoomState.dims`, origin at a floor corner, x along length, z along width, y up). The splat is in arbitrary units, so the viewer fits one when a room opens. It needs the cameras file; rooms without one get no sound features.

- **Points:** the splat centres (`SplatLayer`, via Spark's `forEachSplat`), turned upright with the viewer's rotation. Sample at most about 200k of them.
- **Floor:** the 2nd percentile of the points' heights. **Scale:** the phone was held about 1.5 m up, so metres per unit = 1.5 ÷ (mean camera height − floor).
- **Walls:** try yaw angles 0–90° in 1° steps. At each, take the 3rd–97th percentile box of the points across the floor. Keep the yaw with the smallest area. The walls are that box.
- **Ceiling:** the 98th percentile of the heights. If that comes out under 2.2 m (the video barely saw the ceiling), use 2.7 m.
- **Clamp** the result into the engine's limits: length and width 1.5–30 m, height 2–15 m.
- **The fit** is a pure function, `fitRoom(points, cameras) → RoomFit`, where `RoomFit = { dims, scale, toRoom(world), toWorld(room) }`. World means the viewer's upright splat frame.
- **Materials:** fixed. Walls drywall, floor carpet, ceiling plaster, furnishing `bare`. The objects add the furniture's absorption.

## 3. Finding objects

### 3.1 Server: 2D detection

- **`GET /api/splat/jobs/:id/objects`** returns `{ frames: [{ img_name, width, height, detections: [{ label, score, box: [x0, y0, x1, y1] }] }] }`. `box` is in that image's pixels.
- **First call:**
  - runs the detector on 12 frames evenly spaced through `images/`;
  - writes `detections.json` in the job folder and returns it;
  - concurrent calls share the one run, and later calls just read the file.
- **Errors:**
  - 404 when the job isn't ready;
  - 500 when detection fails.
- **The detector:**
  - transformers.js (`@huggingface/transformers`) in the demo server's Node process, on the CPU, with an open-vocabulary model;
  - the model is picked by the spike in Plan 8 Task 1 (OWL-ViT base first, Grounding DINO tiny or OWLv2 if they do much better);
  - the model loads once per server process, on the first request, and the download is cached on the laptop.
- **Labels:** chair, sofa, table, desk, whiteboard, television, window, curtains, rug, bookshelf, bed, cabinet, plant.

### 3.2 Browser: 3D placement

- **Projection:** for each detection, project the splat centres into that frame's camera using the cameras file:
  - right = column 0, down = column 1, forward = column 2;
  - `u = fx·x/z + width/2`, `v = fy·y/z + height/2`;
  - boxes are scaled if the image and the cameras file disagree on size.
- **Depth:**
  1. Take the centres that land inside the box and in front of the camera.
  2. The object's front is the 15th percentile of the depths of those in the box's central 60%.
  3. Keep the centres in the box with depths from the front to 1 m (in room metres) behind it.
  4. Those points' 10th–90th percentile extent, in room coordinates, is the object's box.
- **Merging across frames:**
  - "table" and "desk" count as one group;
  - detections of the same label whose box centres are within 0.7 m across the floor merge, or 0.5 m for chairs;
  - a merged object keeps the mean centre and the median size;
  - an object must be seen in at least 2 frames.
- **Result:** `RoomObject = { label, min: Vec3, max: Vec3 }` in room metres. This is a pure function, `placeObjects(detections, cameras, points, fit) → RoomObject[]`.

### 3.3 What each object does

A table, keyed by label:
- **Absorption** in m² per octave band (125 Hz–4 kHz). Soft items use per-object published values. Flat items use their box's face area times a material from `MATERIALS`: rug, curtains, glass for the window and TV, wood for the table, desk and cabinet, and a hard, glass-like value for the whiteboard.
- **Absorbs or reflects:**
  - absorbs: chair, sofa, bed, curtains, rug, bookshelf, plant;
  - reflects: table, desk, whiteboard, television, window, cabinet.
- **Blocks sound:** whiteboard, bookshelf, cabinet and television.

## 4. Sound model changes

- **Objects in the room:** `RoomState` gains an optional `objects?: RoomObject[]`.
  - `absorptionArea` adds each object's absorption, which changes the reverb time and the late tail.
  - In `computeImageSources`, the direct path (order 0) is attenuated when its segment crosses the box of a blocking object. The cut is 2, 4, 7, 10, 13 and 16 dB from 125 Hz to 4 kHz, because low notes bend round the object and high ones don't.
  - Reflections are unchanged.
- **One IR per change:** the worker gains a single-IR request for walking. There is no "with fixes" slot here.
- **Everything else is unchanged:** the image sources, the binaural rendering and the late tail.

## 5. Placing the speaker

- **Place speaker** arms one click. The next click on the 3D view is intersected with the floor plane, not the splat.
  - The speaker goes there at 1.0 m (stand height), clamped 0.5 m inside the walls.
  - In this mode, a click places the speaker instead of locking the pointer.
- **Drawn** as a small dark box with a light front, about 0.2 × 0.35 × 0.2 m in room scale.
- **Moving it:** press Place speaker again, or use **Move speaker here** (§6).

## 6. Best speaker spot

**Find the best spot** runs in a worker, in about a second:

- **Speaker candidates:**
  - every point of a 0.4 m floor grid, at 1.0 m height;
  - 0.5 m or more inside the walls;
  - outside every object's footprint, grown by 0.2 m.
- **Listeners:**
  - a 0.6 m floor grid at seated ear height (1.2 m);
  - 0.5 m or more inside the walls, outside objects;
  - and 1 m or more from that candidate.
- **Each candidate is scored over all its listeners** on three things:
  - **Coverage (40 %):** the spread (standard deviation, dB) of the mid-band level across the listeners. The level counts the direct sound (with blocking), image sources to order 2, and the reverberant level from the room's reverb time. 0 dB spread scores 1; 6 dB or more scores 0.
  - **Clarity (35 %):** the mean C50 across the listeners: energy before 50 ms against after, the late part from the reverb time. −5 dB scores 0; +5 dB scores 1.
  - **Even bass (25 %):** the box's room modes up to 200 Hz, summed for that speaker and each listener from 30 to 150 Hz. The score is the spread (dB) of the response across frequency, averaged over the listeners. 3 dB scores 1; 12 dB scores 0.
- **Score:** the weighted sum × 100. The weights can be retuned on the real room so the best spot is believable.
- **Shown:**
  - a heat map on the floor, red through yellow to green, as a translucent texture on a plane just above the floor, drawn after the splat;
  - a **Best spot** marker;
  - **Move speaker here**;
  - in the panel, "This spot: N/100 · Best: M/100".

## 7. Walking and listening

- **Play / Pause** loops the built-in clips (`synthClip`: drum loop or guitar). Headphones are recommended in the panel.
- **The listener is the camera:**
  - its position, converted to room metres, is clamped 0.3 m inside the room and pushed 0.5 m from the speaker;
  - its facing gives the yaw.
- **While the music plays:** whenever no render is running and the listener has moved 25 cm or more, or turned 15° or more, since the last render, a new single IR renders. The existing `AudioEngine` crossfades it in.
- **No speaker placed:** Play is disabled with "Place the speaker first."

## 8. The panel

A panel on the right of the viewer, about 300 px wide, above the canvas. From top to bottom:

1. **Room:** "About 6.1 × 4.2 × 2.7 m · Echo time 0.45 s". The echo time is the predicted mid RT60.
2. **Speaker:** Place speaker · Find the best spot · Move speaker here (after a search) · the score line.
3. **Listen:** Play/Pause, a Drum loop / Guitar choice, and "Use headphones. Walk with W A S D."
4. **Objects:**
   - "Finding objects… (about a minute the first time)" while the search runs;
   - then two groups: **Absorbs sound** (for example "Chair ×5") and **Reflects sound** (for example "Table ×2, Whiteboard");
   - if the search fails: "Couldn't find objects. Sound still works without them."

**Look:** the site's restyle (commit cb53742), with tokens in `src/app/globals.css`.
- **Inherited:** the panel sits inside the viewer's `darkroom` root, which gives uppercase Inter, weight 500, in cream.
- **Panel:** `rounded-card border border-cork bg-walnut/80`, with no shadows and no blur.
- **Buttons:** one `pill` for the main action, `ghost` for the others.
- **Text:** `text-label` or `text-ui` for text, `text-heading-sm` for headings, `voice` for full sentences, and `text-cream/70` for secondary text.
- **Dividers:** `rule`.
- **Placement:** top right. The restyle's own controls are at the top left and bottom left.
- **Object labels:** the teal and amber chips are this feature's only extra colours. Ember stays reserved for credit lines.

In the 3D view, each object gets a floating label above its box, "Chair · absorbs" in teal or "Whiteboard · reflects" in amber, using three's `CSS2DRenderer`.

## 9. Cut for tonight

- correcting detections, tagging by hand, or editing the fitted box, scale or materials;
- uploading a song;
- saving the speaker's position;
- rays;
- the A/B "with fixes" slot;
- phones;
- error states beyond those named here;
- Playwright.

## 10. Testing

- **Vitest, pure maths only:**
  - `fitRoom` on a synthetic box of points with known size, yaw and camera height;
  - the projection and `placeObjects` on a synthetic camera looking at a synthetic cube of points;
  - occlusion of the direct path;
  - object absorption in `absorptionArea`;
  - the best-spot scorer on a plain box: a corner scores below the middle of a wall, and a spot behind a blocker scores lower;
  - the server route answers from a cached `detections.json`.
- **Real check** on the conference room job, in Chrome at `http://localhost:8080`:
  - objects are labelled sensibly;
  - the heat map and the best spot look believable;
  - the sound changes when walking and turning;
  - no console errors.
