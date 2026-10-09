# Hearify Plan 7: follow-ups

Plan 7 (the desktop splat viewer) is on `main` (1091d0b..82ce3b7). It passed:
- per-task reviews, with fix rounds on Task 3 (tests for tilted videos) and Task 5 (a finished build no longer pulls you out of the room you're in);
- a final whole-branch review on Opus, one fix wave and its re-review;
- a real check on the laptop.

728 tests pass, and tsc, lint and build are clean.

## What the real check confirmed (Chrome, 1280×800)

- **The page** shows the heading, the filming tips, Quick or Best, Import a video and "Your rooms", newest first. Under `pnpm run dev` it shows only the start line.
- **Import:**
  - A 25 s clip built in about 2¾ minutes and opened in the viewer.
  - OpenSplat wrote `cameras.json` (50 cameras).
  - The new room joined the top of the list.
- **Upright and start view:** an upright clip's first view matches its `images/0001.jpg`. The building is upright, the path, lamp post, blue box and trees sit in the same places, and the field of view now matches the video's camera. In the real file, the third column of every camera points into the scene.
- **Controls:**
  - W moves forward level with the ground.
  - Holding a key, then switching windows, doesn't drift.
  - Scrolling zooms.
- **Navigation:**
  - Back returns to the list, and so does the browser's back button.
  - A reload reopens the room.
- **Older rooms** (built before `cameras.json`) open the Memento way, flipped and seen from outside.
- **Console:** no errors, including after a refused pointer lock.

## Only you can check these

1. **Click to look around** in your own Chrome or Edge. The automated browser refuses pointer lock, so it has never been seen working. Click the room, move the mouse, press Esc, then click again.
2. **The other keys:** Q/E (down and up), Shift (faster), A/S, and a drag that spins without locking the pointer.
3. **A real indoor room:** film your bedroom (30–60 s, walk slowly sideways) and import it with **Best**. Both test clips were the outdoor South Building sample. Best also hasn't yet been built with cameras.

## Deferred (none block the demo)

- **Rooms built before this plan** have no `cameras.json`. They start far outside, because stray splats inflate the box, and W moves very fast. Rebuild any you want to show.
- **The field of view:** the first view takes it from the video camera; spinning and walking keep it.
- **Readiness flicker:** while the Docker check is unanswered and the rooms are still loading, the import area can briefly show "isn't running" before a failed rooms fetch switches to the no-server line.
- **Old rooms list:** the list doesn't refetch when you come back from the viewer.
- **Double download:** a finished build is downloaded twice (once by the build follower, once by the viewer).
- **Leftover `#`:** Back on a reloaded room leaves a trailing `#` in the URL.
- **Stuck keys:** holding Cmd/Meta can swallow key releases. Switching windows clears them.
- **Camera file validation:** `readCameras` doesn't validate `fx`/`fy`/`width`/`height` (the field-of-view maths guards itself).
- **Unchanged from Plan 6:** silent disk-write failures during upload, and the other Plan 6 deferred items.
