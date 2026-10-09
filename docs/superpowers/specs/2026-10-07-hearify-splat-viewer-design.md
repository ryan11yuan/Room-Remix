# Hearify — Splat Viewer Design Spec (computer only)

**Date:** 2026-10-07
**Status:** Approved design, pending spec review
**Builds on:** `2026-10-06-hearify-video-splats-design.md`. The pipeline, jobs API and demo server stay as built. This spec replaces what the user sees.

## 1. Purpose

On the demo laptop, someone imports a video of a room from the computer. The laptop builds the Gaussian splat with the existing pipeline, and the person walks around the room in 3D, the way Memento's viewer works (github.com/itsmarsss/memento). Nothing else.

**Success criterion:** at `http://localhost:8080` (`pnpm run demo`), a person imports a room video with Quick. About 5 minutes later they are inside their room:
- it is upright;
- the view starts where the video began;
- they can walk with W/A/S/D and look around with the mouse.

They can reopen any earlier room from the list.

## 2. Scope

**In:**
- one page at `/` with an import button, the Quick/Best choice, build progress with Cancel, and a list of finished rooms;
- a full-screen, Memento-style viewer with a Back button.

**Out:**
- phone support (no touch walking, no Wi-Fi addresses on the page);
- the setup wizard, room box, sound, What if…, line-up steps, My rooms, share links, and the cathedral/garage/bedroom demos.

**Old pages:** `/room`, `/setup` and `/about` stay in the code and at their URLs, but nothing links to them. The old landing page's components stay in the repo, unused. Nothing is deleted.

## 3. The page (`/`)

- **Heading:** "Hearify", with one line under it: "Import a video of your room and walk around it in 3D."
- **Import:**
  - The filming tips (the existing text).
  - The Quick / Best choice, with the existing labels ("Quick: about 5 minutes", "Best: sharper, about half an hour").
  - An **Import a video** button: `<input type="file" accept="video/*">`, a normal file picker on a computer.
- **While a build runs:**
  - the existing upload percentage, then the progress row ("Checking the video", "Pulling frames", "Finding camera positions", "Building your room, step N of M"), the bar and Cancel;
  - the existing errors and messages from spec 2026-10-06 §7.
- **Remembering a build:** the running build is kept in `localStorage` under one key, so a reload picks it up again.
- **When the build finishes,** the viewer opens on that room.
- **Your rooms:** every finished build on this laptop, newest first. Each row shows when it was made (local date and time) and Quick or Best. Clicking a row opens the viewer.
- **No server:** when the page isn't served by the demo server (e.g. `pnpm run dev`), the import and list are replaced by one line: "Start the room builder with `pnpm run demo`, then open http://localhost:8080." Docker or the image missing keeps the existing "The laptop's scan builder isn't running." message.

## 4. The viewer

Full-screen over the page. Its URL hash is `#room=<job id>`, so Back is browser history and a reload reopens the same room.

- **Drawing:**
  - three.js with a dark background.
  - The splat comes from `GET /api/splat/jobs/:id/splat` and is drawn by Spark through the existing `SplatLayer`, which is reached by dynamic `import()`, so the ESLint rule that keeps Spark in its own chunk still holds.
  - The splat is turned upright through `SplatLayer`'s alignment, which sets the splat mesh's own transform. Spark's renderer lives in the same group and must not be rotated.
- **Upright and the start view** come from `GET /api/splat/jobs/:id/cameras`, OpenSplat's `--output-cameras` file in the same frame as the splat: one `{ id, img_name, width, height, fx, fy, position[3], rotation[3][3] }` per frame.
  - **Up:** the average of the cameras' "up" directions, taken from the rotation matrices. The video was held upright, so this is the room's up. The scene is rotated so it points to +Y.
  - **Start:** the camera with the lowest `img_name` (the video's first frame), at its position and looking along its viewing direction.
  - **Axis signs:** which matrix columns and signs are "up" and "forward", and any axis flip between the cameras file and how Spark places a `.spz`, are pinned by a check against a real job built on this laptop. That job's first view must match `images/0001.jpg`.
- **Rooms built before this change** have no cameras file. They fall back to Memento's behaviour: rotate π about X, and start outside the splat's box, looking at its centre.
- **Controls** (mouse and keyboard, like Memento):
  - **Spin:** drag to spin around a target point, right-drag to pan, scroll to zoom (three's `OrbitControls`, with damping). The target starts a short distance in front of the start camera.
  - **Move:** W/A/S/D move forward/left/back/right, level with the floor, relative to where you're looking. Q/E move down/up, and Shift doubles the speed. Moving shifts the camera and the spin target together. The base speed is a quarter of the diagonal of the box around all camera positions, per second, so it feels the same in any room. In the fallback, the box around the splat is used instead.
  - **Look:** clicking the 3D view locks the pointer. Moving the mouse then turns your head (yaw and pitch, pitch kept within ±85°). Esc releases it (the browser's behaviour). Spinning is off while the pointer is locked.
  - **Help line:** at the bottom, "Drag to spin · Scroll to zoom · W A S D to move · Q / E down and up · Click to look around, Esc to stop".
  - **Back:** a button at the top left.
- **States:**
  - "Loading your room…" while loading.
  - "Couldn't load this room." with Back, when the splat can't be fetched or read.
  - "This browser can't show 3D." without WebGL.

## 5. Server and pipeline changes

- **OpenSplat** also gets `--output-cameras /job/cameras.json`.
- **`GET /api/splat/rooms`:** the ready jobs, newest first, as `[{ id, quality, createdAt }]`. `JobQueue` gains a method that lists them; `createdAt` is already in `job.json`.
- **`GET /api/splat/jobs/:id/cameras`:** that file as `application/json`. 404 when the job is unknown or has no cameras file.
- **Nothing else changes** in the queue, runner, Docker image or upload API.

## 6. Testing

- **Vitest:**
  - the upright and start-view maths, on synthetic cameras with known up directions, including upside-down and tilted cameras, plus the no-cameras fallback;
  - the keyboard-to-movement maths, as a pure function of the keys held, the view direction and up;
  - the rooms list and cameras endpoints, and `JobQueue`'s list (newest first, ready only);
  - the OpenSplat arguments.
- **Real check on this laptop:**
  - build one room with the new pipeline and confirm its first view matches `images/0001.jpg`;
  - open an older room through the fallback;
  - walk with W/A/S/D and Q/E, look around with pointer lock, spin and zoom;
  - check the Back button and the list, and that a reload reopens the viewer;
  - check no console errors.
