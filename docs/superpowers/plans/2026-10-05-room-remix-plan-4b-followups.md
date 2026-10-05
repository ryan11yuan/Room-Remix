# Room Remix Plan 4b: follow-ups for Plan 5

Plan 4b (walk mode) is on `master` (4b6b470..0a56b19). It passed:
- per-task reviews, each with one fix round;
- a final whole-branch review, then one final fix wave and its re-review;
- one small residual patch after that, checked by the controller and by tests, not by a separate review;
- Chrome walk-throughs after each round.

360 tests pass. This file keeps what is still open.

## What the browser walk-through confirmed
- **Entering:** **Walk** puts the camera over the listener's shoulder. The head is centred, the speaker shows beside it, and the lower third of the picture is floor. The button reads "Stop walking", and the help text and canvas label change.
- **Tapping:**
  - A tap on the floor walks the listener there at walking pace and stops 0.3 m from the walls. The rays follow.
  - A tap above the horizon does nothing.
  - Touch-type taps work.
- **Keys:**
  - WASD and the arrows walk relative to the view.
  - A W typed into a size field doesn't walk.
  - The arrows don't scroll the page while the view is mostly on screen, and scroll it again once the view is scrolled away.
  - A held key stops when the window loses focus.
- **Camera:**
  - The mouse wheel zooms.
  - Dragging turns the view round the head.
  - Backed against a wall, the camera stays inside the room.
- **Dragging:** the listener can't be grabbed while walking, and the speaker still drags. A speaker placed beside the walker shows the usual "at least 0.5 m" message, and the next step walks clear.
- **Leaving:**
  - Top, Corner and Listener's view end walk mode with no snap back.
  - **Stop walking** leaves the view exactly where it is.
  - A room-size edit while walking keeps the camera with the listener.
- **Scan:** **Align scan** ends walk mode, and **Walk** is disabled while aligning.
- **Unfinished input:**
  - Clearing the Listener x field keeps the view drawn; typing a value carries on.
  - Shrinking the room past the listener keeps the camera inside the room, and one tap walks the listener back in.
- **Console:** clean, apart from the known driver-level shader warning.

## Not checked by machine; please check on a phone and with headphones
- **Touch:** pinch zoom and one-finger orbit on a real touchscreen. The machine checks covered the mouse wheel, mouse drags and synthetic touch taps.
- **Sound:** with a song playing and **In your room** selected, the sound should change shortly after you stop walking.
- **Your real room scan:**
  - Walk over the aligned scan.
  - The back of the scan should never show.
  - Check whether real walls close to the camera hide the listener.
- **Framing:** whether the over-the-shoulder view feels right. The camera sits 1 m back, 0.3 m up and 0.3 m to the right; each is one constant in `walk.ts`.

## Where the build differs from the spec's §8 "Walk mode" text
Update the spec or accept these:
- **Camera:**
  - The spec puts it on the speaker → listener line.
  - The build puts it 0.3 m to the listener's right, looking at the head.
  - In line, the head hid the speaker, or (looking level) the view showed almost no floor to tap.
- **Tap rule:** the pointer moves ≤ 6 px, for any duration, like every other tap in the view. The spec says < 8 px in < 300 ms.
- **Steps** go through the existing `onDrag({ kind: 'listener' }, …)` callback. There is no `onListenerMove`.
- **The spec's `followCamera`** became:
  - `walkView`, `pullInside` and `clampInside` in `walk.ts`;
  - `followHead` and `drawFrom` in `walkCamera.ts`.
- **The listener can't be dragged in walk mode.** The camera follows the head, so a drag would chase itself.

## Fix with Plan 5
- **End-to-end test:** add walking to the Playwright flow (Walk, tap, the listener's position changes, Stop walking).
- **Speaker on a stand:**
  - It can't be dragged from the low walk camera, because the drag ray grazes its plane.
  - Dragging the view up first works.
  - Consider a lower grazing limit in walk mode.
- **Against a wall:** the camera sits close behind the head and the head fills the view. Consider fading the head, or raising the camera, when it is pulled in.
- **Accessibility:**
  - The Walk and rays buttons both swap their label and set `aria-pressed`; use one pattern for both. This is also in Plan 3's follow-ups.
  - There is no keyboard way to turn the walk camera.
- **Walk pressed with the Listener field blank:** the view keeps the previous camera direction until a value is typed.
- **Phone performance:**
  - Walking re-renders the view's React tree and recomputes the rays every frame, even with rays hidden.
  - Below about 7 frames a second the sound re-renders mid-walk. The one-job-at-a-time worker bounds it.
- **Smaller gaps:**
  - A long press without movement walks; there is no time limit on a tap.
  - A resize while walking draws one frame with the old projection.
  - Pressing Walk before any valid room exists leaves the button reading "Stop walking" with nothing walking. This is practically unreachable.
  - A listener that starts outside the room jumps up to 0.5 m in one frame.
  - The way-round check samples the ring every 0.02 rad, so a wall cut under 25 µm wide can flip its choice.
  - The "frame time isn't a number" test doesn't put the speaker in the path.

## Deliberate decisions made during execution
These went beyond or against the plan's literal text. The reasons are in the commit history.
1. **Browser checks:** the controller did the browser walk-throughs. Touch, sound and the real scan are left to the user.
2. **The plan's "Decided here" list** was accepted, except its level look point. That was replaced by the over-the-shoulder view (see 6).
3. **Tests for the scene wiring:** `RoomScene` itself has no unit tests, because it needs WebGL. The camera follow was moved into `walkCamera.ts` and is tested in Node against the real OrbitControls.
4. **Walk maths fixes:**
   - **Wall tolerance:** wall checks use the same tolerance as room validation, so a walk round a speaker standing against a wall no longer stops short.
   - **Stale goals:** a tapped goal is re-targeted every frame. A speaker dragged onto it, or a room shrunk past it, no longer leaves the listener jittering or stalled.
   - **Frame times:** a frame time that isn't a number stands still.
   - **Keys:** W and the up arrow held together count once.
5. **Camera ownership:**
   - OrbitControls keeps its own camera.
   - The view is drawn, and taps are aimed, from a copy pulled inside the room.
   - Before this, wheel and pinch zoom did nothing in walk mode and turning lost about a third of each drag.
6. **Final fix wave:**
   - The camera survives unfinished or outside-the-room positions; before, clearing a Listener field blanked the view.
   - The over-the-shoulder first view shows 21–45% floor, against 0–16% before.
   - Walk keys only act while at least half the view is on screen.
   - The help text and canvas label mention the keys and the wheel.
7. **One residual patch beyond the one-wave limit:**
   - Pressing Walk with a blank Speaker field no longer blanks the view.
   - A camera pulled right onto the head keeps its direction instead of staring at a wall.
