# Room Remix Plan 6: follow-ups

Plan 6 (video splats on the demo laptop) is on `main` (281d498 onwards). It passed:
- per-task reviews of Tasks 1–7, with fix rounds on Task 1 (`check.sh` exit codes) and Task 7 (line-up only in the scan's own room);
- a final whole-branch review on Opus, then one fix wave and its re-review;
- a reviewed performance fix found in Task 8 (COLMAP's database on a Docker volume);
- timed real runs and an end-to-end check in Chrome at phone size.

701 tests pass, and tsc, lint and build are clean. This file keeps what is still open.

## What the real runs showed (2026-10-07, RTX 4060 laptop)

Samples were made from COLMAP's South Building photos (128 images): a 42.7 s landscape video, the same video tagged to rotate like an iPhone portrait clip, and a 25 s cut.

| Run | Video | Result | Time | Splat |
|---|---|---|---|---|
| Quick, database on the bind mount | portrait 42.7 s | ready | 10m26s | 28,827 splats, 0.46 MB |
| Quick, database on a volume | portrait 42.7 s | ready | 4m41s: frames 5 s, features 19 s, matching 2m49s, mapper 53 s, training 34 s | 0.46 MB |
| Quick, from the phone UI | 25 s cut | ready | 2m52s | 19,661 splats |
| Best | landscape 42.7 s | ready | 24m02s: features 2 min, matching 7 min, mapper 2m45s, training 12 min | 159,410 splats, 3.85 MB |

- **Portrait handling works.** The rotation-tagged portrait video gave upright 750×1000 frames. Best's frames were 1600×1200.
- **Memory fits.** Best peaked at 5.7 of 7.6 GB in Docker's VM during feature extraction, then about 2 GB during GPU training. The Quick and Best settings stayed at their starting values.
- **The image build needs care.** OpenSplat's own Dockerfile compiles with one job per CPU, and that wedged Docker Desktop: the VM's memory and swap filled up and Docker stopped answering. `pipeline/Dockerfile` now builds with 2 jobs. If even that stalls, use `docker build --build-arg BUILD_JOBS=1 -t room-remix-splat pipeline` (it's in the README).

## What the browser check confirmed

At 390×844 with touch, against the demo server:
- **When Docker isn't ready:** the button is greyed out with "The laptop's scan builder isn't running." The setup wizard mentions video only when the server answers.
- **The panel:** it shows the tips, Quick or Best and the privacy line.
- **The build row:** it goes "Checking the video" → "Finding camera positions" → "Building your room, step N of 2,000". The bar follows COLMAP's counters and OpenSplat's steps.
- **Reload during a build:** the row comes back and keeps following.
- **When the build is ready:** the splat loads and "Step 1 of 3" starts by itself. After a reload the scan comes back from browser storage.
- **Cancel:** the row disappears, the job ends `canceled`, and no containers or volumes are left behind.
- **Server killed mid-build:**
  - The pipeline container keeps running.
  - The phone shows "Lost contact with the laptop. Trying again…".
  - On restart the server clears the leftovers, and the phone shows "The laptop restarted while building. Start again."

## Only you can do these (spec §8)

1. **Film your bedroom on the iPhone** and make it with **Best** the day before. It's the room you show first. Line it up, then check it's still there after reloading the page.
2. **Run the real phone check:** run `npm run demo` on the laptop, open the printed Wi-Fi address on the iPhone, and record with "Choose or record a video" using Quick. Check:
   - it arrives within about 10 minutes;
   - locking the phone mid-build and coming back picks the row up again;
   - iPhone HEVC/HDR `.mov` files work. The South Building samples were H.264, so this isn't tested yet.
3. **The first `npm run demo`** shows a Windows Firewall prompt. Allow Node on private networks, and set the Wi-Fi network to Private. If the venue Wi-Fi keeps devices apart, use Windows Mobile Hotspot (also in the README).
4. **Headphones and touch:** the same checks as after Plan 5c.

## Housekeeping on the laptop

- **The test servers are stopped.** Ports 8080 and 8081 are free, so `npm run demo` can start.
- **Disk space:**
  - Test videos and photos are in `%LOCALAPPDATA%\RoomRemix\samples` (about 600 MB).
  - Test jobs are in `%LOCALAPPDATA%\RoomRemix\jobs`. Folders are never deleted automatically, so delete old ones by hand.
  - The Docker image is 23.6 GB, and the abandoned first build left build cache. `docker builder prune` frees it.
- **Git:** `main` is many commits ahead of GitHub and still has the earlier divergence (one renamed commit on `origin`). You push, so the pull-or-force-push decision is still yours.

## Deferred (none block the demo)

- **Server:**
  - A disk-write failure during an upload is still silent: the socket drops and nothing is logged. The fix wave's check runs after `pipeline` has destroyed the request. Fix by watching the request's `aborted`/`close` before the pipeline (parked M5).
  - The startup sweep can delay startup by up to 30 s if Docker hangs.
  - The volume filter `name=^rr-` would also match an unrelated volume whose name starts with `rr-`.
  - After a cancel, removing the volume can hit "in use". It's logged and swept at the next start.
  - While a build runs, health says ready even if Docker has died.
- **Queue:**
  - A cancel during `add()`'s save is ignored.
  - `job.json` isn't written atomically.
  - A late output line can re-add a hidden progress entry.
- **Phone:**
  - The job id is forgotten before a busy 3D view opens the splat (M6).
  - "Starting…" shows while resuming a build with the laptop unreachable (M8).
  - Without `localStorage` the row never updates (M13).
  - The first poll of a remembered job can race a new upload.
  - The quality choice resets when the panel closes.
- **Tests:**
  - The hooks (`useVideoScan`, `useSplatHealth`) have no unit tests. After the demo, move the follow loop's "poll result → next state" decision into a pure, tested function in `panel.ts`.
  - The `'/%2e%2e/secret.txt'` server test is redundant. Swap it for a raw `http.request`.
- **Image:** `Linux.sh` leaves `/var/cuda-repo-*` in the image (a few GB).

## After the hackathon

- **Plan 5d:** end-to-end tests in Chromium and WebKit, Cloudflare Pages, and cleanup. Its design notes are in an old session's scratchpad. Decide whether the video feature has any place in a hosted build; it needs the laptop.
- **COLMAP on the GPU:** a GPU build would speed up matching, the slowest step, if Quick needs to be faster for 60-second videos.
