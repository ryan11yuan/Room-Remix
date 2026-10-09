# Hearify — Rehearse a Place by Sound (Plan 9)

**Date:** 2026-10-08
**Status:** Design approved in chat, pending spec review
**Builds on:** `2026-10-06-hearify-video-splats-design.md` (pipeline, jobs API, demo server), `2026-10-07-hearify-splat-viewer-design.md` (the viewer) and `2026-10-07-hearify-splat-sound-design.md` §2–3 (fitting the room box, finding and placing objects), all reused.
**Replaces:** the sound spec's §4–8 (speaker, best spot, walking music, panel) and everything in `2026-10-04-hearify-design.md` that only the hidden pages used. Where this spec disagrees with an earlier one, this spec wins.
**Scope rule:** build only what the demo needs, and delete everything else.

## 1. Purpose

Blind and low-vision people often learn a new place before they go: a new school, a clinic, a first day at work. Usually a sighted guide walks it with them. Hearify lets them rehearse it from home by sound:

1. **A helper films the place.** A sighted friend films one slow lap. The laptop builds the 3D room with the existing pipeline, finds the objects that matter for getting around, and the helper checks the list.
2. **The explorer listens.** On headphones and the keyboard, they walk through the room. Each object says its name from its real direction and distance. They can ask what's around them, choose a place, and follow a sound to it.

**Success criterion:** on the demo laptop, open the conference room (job `1c59fe0f-02bb-4ddd-97c6-118bb432c93d`).
- Within about a minute, the objects are labelled with the new names, including the door. The helper can rename, remove and add objects, and the changes survive a reload.
- After **Start exploring**, someone with their eyes closed, on headphones, can press Space and hear the names from their directions.
- With Tab and Enter, they follow the pulse to the door and hear "You're at the door", without looking.

**The demo:** build the room beforehand. Blindfold a judge, give them headphones, and let them explore for two minutes. Take the blindfold off and ask them to walk to the door, or point at the bin, in the real room.

## 2. Scope

**In:**
- Stage 1: delete everything the demo doesn't use (§3).
- Stage 2:
  - the navigation names (§4);
  - finding objects with them (§5);
  - the helper's check (§6);
  - exploring by sound (§7–8);
  - the screen (§9).

**Out:**
- typing your own object names;
- dragging or resizing objects;
- undo;
- looking up and down while exploring;
- a "where am I" summary;
- route-finding around obstacles;
- more than one room or floor;
- phones and touch;
- screen-reader testing;
- Playwright tests;
- any hosting.

## 3. Stage 1: what goes and what stays

Stage 1 lands before any new feature, so stage 2 starts on a clean base. After stage 1 the viewer is the plain splat viewer, with no panel. That is a valid state: tests, tsc, ESLint and `next build` pass.

### 3.1 Deleted

- **Pages:** `src/app/about`, `src/app/room` and `src/app/setup` (their pages and layouts).
- **Components only those pages used:** `browserStorage`, `EditRoom`, `ErrorList`, `LengthField`, `ListenDemo`, `MyRoomsLink`, `openRoomDirectly`, `pendingScan`, `Player`, `RoomCard`, `RoomForm`, `RoomsMenu`, `RoomView`, `ShareButton`, `SurfacePicker`, `tabRoom`, `Toggle`, `TopView`, `useRoomSession`, `useSimulation`, `useSplatHealth`, `useUnits`, `VideoScanPanel` and `WhatIf`.
- **The speaker features (Plan 8):**
  - `components/SoundPanel`;
  - `lib/viewer/SoundController` (stage 2 replaces it);
  - `lib/sound/bestSpot`, `client`, `heat`, `protocol`, `soundRoom` and `worker`.
- **The labels overlay is slimmed, not deleted.** `lib/viewer/SoundOverlay` becomes `lib/viewer/LabelsOverlay`, keeping only the floating labels. Its heat map, speaker drawing and absorbs/reflects colours go. Stage 2 uses it.
- **The acoustics engine,** except what the echo needs (§8.4):
  - **moved first:** before `simulate.ts` is deleted, its late-tail generator (`addTail`) moves into a kept file, `lib/acoustics/tail.ts`, with a test;
  - **deleted:** `lib/acoustics/absorption`, `binaural`, `client`, `diffuse`, `imageSource`, `loudness`, `objects`, `presetIr`, `protocol`, `rays`, `simulate` and `worker`, plus `__fixtures__`;
  - **kept:**
    - `bands`, `reverbTime` and `tail`;
    - the parts of `dsp` that the tail uses;
    - `materials`, pruned to drywall, carpet and plaster plus the "some" furnishing row, with its material and furnishing types moved into it.
- **Audio:** all of `lib/audio` (the engine, mix, demo clips and play action).
- **Old state and scenes:**
  - `lib/presets`;
  - `lib/room`, except `types` (pruned to `Vec3`, `Dims`, `ObjectLabel` and `RoomObject`) and `constants` (pruned to the room-size limits);
  - `lib/scene`, except `SplatLayer` and `alignment`.
- **Files:**
  - `public/ir/` (the cathedral and garage recordings);
  - the unused Next.js starter icons in `public/` (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`), after checking nothing references them;
  - `scripts/make_pra_fixtures.py`, `scripts/trim-wav.mjs` and `scripts/trimWav.mjs`.
- **Packages:** `zustand` and `fake-indexeddb`.
- **Tests:** every test of deleted code goes with it.

### 3.2 Untouched

- **The home page:** import a video, Quick or Best, build progress, "Your rooms" and the 3D intro (`RoomsHome`, `HomeImport`, `RoomStage`, `RoomSketch`, `Arrow`, `useVideoScan`, `useWebGL`, `useReducedMotion` and `lib/hero`).
- **The server and pipeline:** `src/server/*`, `lib/splatJobs/*` and `pipeline/`.
- **The viewer:** `SplatViewer`, `lib/viewer/ViewerScene`, `controls`, `view`, `floorPoint` and `rooms`.
- **From the sound work:** `lib/sound/roomFit`, `placeObjects` and `types`. Nothing uses them between stage 1 and stage 2.

### 3.3 Docs and wording

- **`PRODUCT.md`** is rewritten for the new purpose (stage 2).
- **`README.md`:** the leftover create-next-app text goes; the hackathon run steps stay (stage 1).
- **The home page line** under the heading becomes "Film a place once. Someone who can't see it can explore it by sound." (stage 2).
- **Older specs and plans** stay as history. The name stays Hearify.

## 4. The names

One table, `lib/explore/names.ts`, drives detection, labels, voices, walking and the helper's add.

| Name | Plural clip | Detector prompts | Blocks walking | Size when added (w × d × h, m) | Bottom when added (m) |
|---|---|---|---|---|---|
| door | doors | door, doorway | no | 0.9 × 0.1 × 2.0 | 0 |
| stairs | stairs | stairs | yes | 1.0 × 2.0 × 1.0 | 0 |
| chair | chairs | chair | yes | 0.5 × 0.5 × 0.9 | 0 |
| sofa | sofas | sofa | yes | 2.0 × 0.9 × 0.8 | 0 |
| table | tables | table, desk | yes | 1.4 × 0.8 × 0.75 | 0 |
| counter | counters | counter | yes | 1.5 × 0.6 × 0.9 | 0 |
| sink | sinks | sink | yes | 0.6 × 0.5 × 0.9 | 0 |
| toilet | toilets | toilet | yes | 0.4 × 0.7 × 0.8 | 0 |
| bin | bins | trash can | yes | 0.4 × 0.4 × 0.7 | 0 |
| window | windows | window | no | 1.2 × 0.1 × 1.2 | 0.9 |
| bed | beds | bed | yes | 1.6 × 2.0 × 0.6 | 0 |
| cabinet | cabinets | cabinet | yes | 1.0 × 0.5 × 1.0 | 0 |
| bookshelf | bookshelves | bookshelf | yes | 0.9 × 0.35 × 1.8 | 0 |
| TV | TVs | television | no | 1.2 × 0.1 × 0.7 | 0.9 |
| whiteboard | whiteboards | whiteboard | no | 1.8 × 0.05 × 1.2 | 0.9 |
| plant | plants | plant | yes | 0.5 × 0.5 × 1.0 | 0 |

- **Prompt to name:** several prompts can map to one name; for example, "desk" is found as a table.
- **Added objects:** an added box is aligned to the room's axes and centred on the clicked floor point.
- **Clip files:** each name and plural has a clip file named after it, plus `wall`: 32 clips (§8.2).

## 5. Finding objects (server)

`src/server/detect.ts` changes:
- **Prompts:** the prompts in §4 replace the 13 furniture labels, still as "a photo of a …". Each result is mapped to its name.
- **Frames:** 24 evenly spaced frames instead of 12, because a door may be on screen for only a few seconds.
- **Thresholds:**
  - per name, starting from the current defaults: 0.3, or 0.15 for the whiteboard and TV;
  - the door's is tuned on the conference room and classroom jobs during the build;
  - whiteboard and TV stay one group for duplicate suppression, as now.
- **Cache:** results go to `detections-v2.json`. An old `detections.json` is ignored, so older rooms are searched again.
- **Timing:** the first run is expected to take about 15–20 seconds on the CPU; later calls read the file.
- **Unchanged:** `GET /api/splat/jobs/:id/objects`, its response shape, the shared single run, the 404 and 500 behaviour, and the cached OWL-ViT model.

`placeObjects` is unchanged apart from its labels:
- objects are grouped by name;
- chairs merge within 0.5 m and everything else within 0.7 m;
- an object must be seen in at least 2 frames.

## 6. Checking objects (the helper)

Opening a room in the viewer starts in **check mode**:
- the existing viewer controls (W/A/S/D fly, mouse look, drag to spin);
- a floating label on each object;
- the panel (§9).

**The room line:** "Room: about 4.6 × 3.3 × 2.4 m", from the room fit.

**Finding:**
- while finding: "Finding objects… (about 20 seconds the first time)";
- on failure: "Couldn't find objects. Add them by hand." The list starts empty and everything else works.

**The list** has one row per object, ordered by §4's name order, then along the room's length, then its width: "Chair 1", "Chair 2"…
- **Rename:** a select with the 16 names. The box stays the same.
- **Remove:** a button.
- **Highlight:** hovering or focusing a row highlights its label in 3D.

**Add an object:**
1. The helper presses **Add an object**, and the panel says "Click the floor where it is."
2. The next click on the 3D view meets the floor plane, reusing the existing placement and `floorPoint`.
3. A box of §4's size for a door is placed there, and a new row appears with its select focused.
4. Picking a different name resizes the box to that name's size.

**Saving:**
- **What's saved:** after every change, the whole list goes to the laptop as `PUT /api/splat/jobs/:id/checked` (§10), in room metres.
- **On open:** if a checked list exists, it is used instead of the found objects.
- **Why room metres are safe:** the room fit is the same on every load, because the splat centres are sampled by a fixed stride.
- **On failure:** "Couldn't save your changes."

**Start exploring** (the main button) switches to explore mode. It is available once finding has finished or failed.

## 7. Exploring (the explorer)

### 7.1 Starting

- **Position:** the explorer stands where the video's first frame was taken, at ear height (1.5 m, the phone's assumed height), facing the first frame's direction.
- **Inside the room:** the position is clamped 0.3 m inside the fitted walls.
- **Controls:** the viewer's own controls turn off and the camera follows the explorer: first person, level and at ear height. **Stop exploring** returns to check mode, where the viewer's controls take over from the explorer's position.
- **The intro:** the narrator says, for example:

  > "A room about 5 by 3 metres, with 1 door, 10 chairs, 3 tables, 1 TV and 1 whiteboard. You're at the starting point. The nearest door is at 6 o'clock, about 1.5 metres. Press H for help."

  - **Counts:** in §4's order.
  - **The door sentence:** only when there's a door.
  - **No objects:** "with nothing found yet".

### 7.2 Keys

Explore mode listens on the window and prevents the browser's default for these keys, including Tab and Space.

| Key | Action |
|---|---|
| W / S | Step 0.5 m forward or back, with a footstep. |
| A / D | Turn 30° left or right (one clock hour). |
| Space | Scan (§7.4). Pressing again restarts it. |
| Tab / Shift+Tab | Choose the next or previous target (§7.5). |
| Enter | Go to the chosen target. With none chosen, the first target is chosen and gone to. |
| Esc | Stop the pulse; the narrator says "Stopped." |
| H | Help: "W and S walk. A and D turn. Space: what's around you. Tab: choose a place. Enter: go there. Escape: stop. H: these keys again." |

- **Holding W, S, A or D** acts on the first press, then repeats every 0.5 s while held, which is about 1 m/s walking. The browser's own key repeat is ignored.
- **Other keys,** including the arrows, do nothing in explore mode.

### 7.3 Walking and bumping

All of this is in room metres, on the floor plane.

- **Walls:** a step is blocked if it would end closer than 0.3 m to a fitted wall.
- **Objects:** a step is blocked if it would end inside the footprint of a blocking object (§4), grown by 0.1 m on every side for the body. (Revised 2026-10-09 from 0.25 m, which left the conference room's floor in three disconnected pieces.)
- **Already inside:** a box the explorer is already inside doesn't block, so a move out of it is always allowed.
- **When blocked:**
  - the explorer doesn't move;
  - a thud plays from the nearest point of what blocked them, at 1 m height;
  - then that object's name clip plays from the same point, or `wall`.
- **Turning** is never blocked.

### 7.4 Scan

- **Groups:**
  - objects of the same name whose centres are within 1.5 m of another in the group form one group (single-link);
  - a group of one speaks its name clip;
  - a larger group speaks the plural clip.
- **Where each speaks from:** a group's clip plays from the mean of its centres, and a single object's from its box centre.
- **Order:** clockwise by bearing from the explorer's facing direction, starting at straight ahead (0°) and going round to just under 360°. Bearing is measured on the floor plane, to the group's position.
- **Pacing:** each clip starts 0.25 s after the previous one ends.
- **Moving during a scan** keeps it going. The clips stay at their positions, and the explorer's ears move.
- **Caption:** the names are added to the caption as they play: "Door · Chairs · Table · TV".

### 7.5 Choose and go to

- **Targets:** one per name present, namely the nearest object of that name.
  - **Order:** door first, then stairs, then the rest by distance.
  - **Fresh order:** the order is worked out again at each Tab press, from where the explorer now stands.
- **Choosing:** the target's name clip plays from its position, then the narrator says "Door, 2 o'clock, about 4 metres."
- **Go to (Enter):**
  - A short pulse plays from the target's box centre, repeating every `min(1.2, 0.25 + 0.15 × d)` seconds, where `d` is the floor distance to the nearest edge of the target's footprint.
  - **Arrival:** when `d ≤ 1.0` m, a chime plays and the narrator says "You're at the door." The pulse stops.
  - **Choosing another target** while a pulse plays switches the pulse to it.

### 7.6 Wording

- **Clock hour:** `round(bearing / 30)`, with 0 said as 12. Bearings point to the box or group centre.
- **Distance:** the floor distance to the nearest edge of the footprint.
  - under 1 m: "less than a metre";
  - under 3 m: rounded to 0.5 m ("about 1.5 metres");
  - otherwise: whole metres ("about 4 metres").
- **Room size:** length and width rounded to whole metres.

### 7.7 Narrator and captions

- **The narrator** is the browser's `speechSynthesis`.
  - **Voice:** an English voice with `localService` if there is one, so it works offline; otherwise the default.
  - **Speed:** rate 1.05.
  - **Interruptions:** a new narrator line cancels the one speaking.
- **Captions:**
  - the caption area shows the current narrator line, or the scan's names as they play;
  - it is an `aria-live="polite"` region;
  - if `speechSynthesis` is missing, the captions still show.

## 8. Sound

### 8.1 The graph

- **Created on** the **Start exploring** click (a user gesture). One `AudioContext` lives for the viewer's lifetime.
- **Spatial sounds** (names, pulse, thud): `AudioBufferSourceNode` → `PannerNode` (`HRTF`, `inverse` distance, `refDistance` 1 m, `rolloffFactor` 0.6 as a starting value) → the dry gain → master. Each panner also feeds the echo send.
- **Footsteps** aren't spatial. They go to the dry gain and the echo send.
- **The listener:**
  - `AudioListener`'s position and orientation follow the explorer every frame, in room metres;
  - forward comes from yaw, and up is +y.
- **Starting levels,** tuned during the headphone check: echo send −10 dB, master 0 dB.

### 8.2 Voice clips

- **The script:** `scripts/make-voices.mjs` (`npm run voices`), run by hand, never during a build.
- **What it makes:** the 32 clips of §4, written to `public/voices/<clip>.wav`, mono, with leading and trailing silence trimmed. The files are committed.
- **The voice:**
  - Kokoro (`kokoro-js`, Apache-2.0, ONNX on the CPU) with one fixed English voice, installed as a dev dependency;
  - if it won't run on this laptop, the script uses Windows' built-in voice through `System.Speech` instead;
  - the first stage-2 task generates one clip each way and the user listens.
- **Loading:** the viewer fetches and decodes all 32 clips when exploring starts.

### 8.3 Made in code

- **Footstep:** a short low-passed noise burst.
- **Thud:** a low sine thump with a fast decay.
- **Pulse:** a short soft tone around 880 Hz.
- **Chime:** two rising tones.

All four are rendered once into `AudioBuffer`s.

### 8.4 The echo

- **Shape:** one `ConvolverNode` holds a stereo impulse response, generated once per room when exploring starts.
- **Reverb time:** per octave band, Eyring (`reverbTime.ts`) over the fitted box, with fixed surfaces (walls drywall, floor carpet, ceiling plaster) plus the "some" furnishing absorption, both from `materials.ts`.
- **The tail:** made by the existing tail generator, which stage 1 moved into `lib/acoustics/tail.ts`: band-filtered decaying noise, independent left and right. `lib/explore/echo.ts` calls it.
- **Length:** capped at 2 s, with the existing tail fade at the cap.
- **Not modelled:** the echo doesn't change as the explorer walks, and objects don't change it.

## 9. The screen

- **The panel** sits top right in the existing style (`rounded-card border border-cork bg-walnut/80`).
  - **Check mode:** the room line, the finding status, the list with selects and Remove, **Add an object**, and **Start exploring** (`pill`).
  - **Explore mode:** "Exploring", a one-line key reminder for sighted onlookers, and **Stop exploring** (`ghost`).
- **Labels:** the floating labels from `LabelsOverlay` (§3.1).
  - **Normal:** one neutral chip style, cream on walnut, saying the name ("Door").
  - **Highlighted:** a row the helper is hovering, or the explorer's current target, uses the teal chip. Ember stays reserved for credit lines.
- **Captions:** a large caption area, bottom centre, in `voice` style, while exploring.
- **The home page** changes only its line under the heading (§3.3).

## 10. Server API changes

- **`GET /api/splat/jobs/:id/objects`:** unchanged path and shape. It reads and writes `detections-v2.json` (§5).
- **`GET /api/splat/jobs/:id/checked`:** returns `{ objects: RoomObject[] }` from `checked-objects.json` in the job folder. 404 when the job is unknown or not ready, or when nothing has been saved.
- **`PUT /api/splat/jobs/:id/checked`:**
  - **Body:** `{ objects: RoomObject[] }`, at most 64 KB.
  - **Writes** the file and returns 204.
  - **404** for an unknown or unready job.
  - **400** for a bad body: invalid JSON, more than 200 objects, a name outside §4, a non-finite number, or `min > max` on any axis.

## 11. Code layout

**New, pure and tested** (`src/lib/explore/`):
- `names.ts`: the §4 table.
- `walk.ts`: step, turn and blocking.
- `scan.ts`: grouping, scan order and target order.
- `words.ts`: clock hour, distance, room size, the intro, help and target lines.
- `beacon.ts`: the pulse interval and arrival.
- `checked.ts`: validating a checked list, and adding or renaming with §4's sizes.
- `echo.ts`: the room's reverb time and the impulse response.

**New, browser only:**
- `lib/audio/spatial.ts`: the graph, clip loading and the made-in-code sounds.
- `lib/viewer/ExploreController.ts`: replaces `SoundController`. It owns the fit, the objects, the mode and the keys.
- `components/ExplorePanel.tsx`: replaces `SoundPanel`, and holds the captions.

**Changed:**
- `lib/viewer/LabelsOverlay.ts` (slimmed from `SoundOverlay` in stage 1): neutral chips, plus a highlight for one object.
- `ViewerScene`: a way to turn its own controls off and set the camera's pose.
- `SplatViewer`: uses the new controller and panel.
- `server/detect.ts` and `server/server.ts`: §5 and §10.
- `lib/room/types.ts`: `ObjectLabel` becomes §4's names.
- `RoomsHome`: the home page line.

## 12. Errors

| Case | Behaviour |
|---|---|
| Room built before the cameras file existed | No panel. The viewer works as before. |
| Finding fails | "Couldn't find objects. Add them by hand." |
| Saving fails | "Couldn't save your changes." The list on screen stays. |
| Voice clips fail to load | "Couldn't load the voices." Exploring doesn't start. |
| No `speechSynthesis` | Captions only. |

## 13. Testing

**Vitest:**
- **Walking:** steps and turns land where expected. Walls and grown blocking footprints stop a step. A box you're already inside doesn't trap you. Non-blocking names never block.
- **Bumping:** reports the blocker's name, or `wall`, and the contact point.
- **Wording:** clock hours (including 12), distance rounding at the edges (0.99, 1, 2.99, 3 m), room size, the intro with and without a door or objects, and the target line.
- **Scan:** clockwise order from straight ahead; grouping by name within 1.5 m (single-link); plurals for groups.
- **Targets:** door first, then stairs, then by distance; recomputed from a new position.
- **Go to:** the pulse interval formula and its cap; arrival at 1.0 m to the footprint edge.
- **Names:** every name and plural, and `wall`, has a file in `public/voices/`; the blocking set; the sizes and bottoms.
- **Checked list:** validation (each 400 case) and renaming or adding with §4's sizes.
- **Echo:** the reverb time for a known box; the impulse response is stereo, as long as the cap, and decays.
- **Server:**
  - the prompts and their mapping;
  - 24 frames;
  - `detections-v2.json` ignoring an old `detections.json`;
  - the checked routes (save then load, 404s, each 400 case, the size limit).
- **The whole suite,** tsc, ESLint (no new warnings) and `next build` pass after stage 1 and again after stage 2.

**Real check** (the controller, in Chrome on `http://localhost:8080`, on the conference room and the classroom):
- the new names are found, including a door, or the door threshold is tuned until it is;
- rename, remove and add work and survive a reload;
- Start exploring starts at the first frame's view, and the intro shows in the captions;
- W, A, S and D move and turn; bumping the table captions "table";
- Space captions the names clockwise;
- Tab, then Enter, on the door leads to "You're at the door";
- no console errors.

**Headphone check** (the user, about five minutes; the test browser can't listen):
1. Scan from the start: do the names come from the right directions?
2. Turn 90°: do they swing around the head?
3. Then, blindfolded: go to the door.

Tune the rolloff and echo levels (§8.1) from this.

## 14. Known limits

- **Approximate distances.** The scale assumes the phone was 1.5 m up.
- **Doors.** An open doorway is a hole, so the finder can miss it. The helper's Add is the safety net.
- **Moved objects.** Anything moved after filming, like chairs, is out of date.
- **Simplified sound.** The echo only gives the room's size. It doesn't change near walls, and furniture doesn't shape it.
- **Rehearsal only.** It is for rehearsing before a visit, not for navigating on the day. It doesn't replace a cane or a guide.
- **Untested with blind users.** Before claiming it helps blind people, one blind person or an orientation-and-mobility instructor should try it. Screen readers may catch the explore keys first.
