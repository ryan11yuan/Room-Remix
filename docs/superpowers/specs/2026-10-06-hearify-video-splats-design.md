# Hearify — Video Splats Design Spec (hackathon demo)

**Date:** 2026-10-06
**Status:** Approved and built (Plan 6). Revised 2026-10-07 with what the build changed: §3 Dockerfile and job folders, §4 database volume and measured times, §6 progress.
**Builds on:** `2026-10-04-hearify-design.md`. Where the two disagree, this spec wins for the hackathon demo.

## 1. Purpose

At a hackathon demo, anyone can film their room on a phone and see it as a Gaussian splat in Hearify's 3D view, with the speaker, listener, rug, panels and sound rays on top.

**Success criterion:** on the demo laptop's Wi-Fi, someone films a room on their phone, uploads it with **Quick**, and the splat is in their room's 3D view, ready to line up, within about 10 minutes. A room made beforehand with **Best** is also shown.

**Where it runs:** on the author's laptop (Windows 11, RTX 4060 Laptop GPU with 8 GB, 16 GB RAM). Phones reach it over the same Wi-Fi. No hosting, no tunnels, nothing paid.

## 2. Decisions

- **Input is a video.** The splat is reconstructed from many views, so a single photo isn't supported.
- **The pipeline is the one the Memento hackathon project uses** (github.com/itsmarsss/memento): ffmpeg frames, COLMAP camera poses, OpenSplat training. We copy their command settings, not their code (the repo has no licence file).
- **No paid tools or services.** No World Labs Marble, no paid OpenSplat build.
- **The tools run in Docker** with GPU access, built from OpenSplat's own Dockerfile. If Docker can't reach the GPU, the fallback is building OpenSplat natively on Windows (Visual Studio 2022 C++, CUDA 11.8, libtorch 2.1.2, OpenCV 4.9, as OpenSplat's README describes).
- **The server is Node/TypeScript**, in this repo, so it shares types and tests with the app.
- **Privacy changes for videos only.** Scan files still never leave the phone. A video goes only to the laptop, and the upload panel says so.

### Out of scope

Single photos · MASt3R-SfM · Memento's moments, orbs, memory graph and messaging · more than one build at a time · automatic line-up · tunnels, Cloudflare and any hosting · a video option in the setup wizard. Plan 5d (Playwright tests, Cloudflare Pages config, cleanup) waits until after the hackathon.

## 3. Architecture

```
 Phone (same Wi-Fi)                         Laptop
┌──────────────────────┐   http (LAN)   ┌───────────────────────────────────────────┐
│ Hearify app       │ ─────────────→ │ Demo server (Node, src/server/)           │
│  RoomView            │  GET app files │  • serves the static export (out/)        │
│   "Make from a video"│  /api/splat/*  │  • /api/splat/* jobs API                  │
│  splat job client    │ ←───────────── │  • job queue, one build at a time         │
│  ScanController.open │   .spz bytes   │  • runs each step: docker run --gpus all  │
└──────────────────────┘                │        hearify-splat <step command>    │
                                        │  • job folders outside OneDrive           │
                                        └───────────────────────────────────────────┘
```

**One command:** `npm run demo` builds the app and starts the demo server on `0.0.0.0`, port `8080` (or `PORT`). On start it prints the laptop's LAN addresses (for example `http://192.168.1.20:8080`) and checks that Docker is running and the `hearify-splat` image exists, printing a clear message in the terminal if not.

**Units:**

| Unit | Does | Depends on |
|---|---|---|
| `src/lib/splatJobs/protocol.ts` | Shared types: job states, quality, API shapes, error codes | nothing |
| `src/lib/splatJobs/settings.ts` | Quick and Best settings; the ffmpeg, COLMAP and OpenSplat argument lists for a job | protocol |
| `src/lib/splatJobs/progress.ts` | Reads progress from tool output lines (OpenSplat step N of M, COLMAP registered image counts) | protocol |
| `src/server/jobs.ts` | Job queue and state machine; persists `job.json`; marks unfinished jobs failed on start | protocol, a step runner |
| `src/server/runner.ts` | Runs one step as `docker run`, streams its output to a log and to `progress`, can be killed | Docker |
| `src/server/server.ts` | HTTP: static files from `out/`, the jobs API, health | jobs, runner |
| `src/lib/splatJobs/client.ts` | Phone side: health, upload with progress (XMLHttpRequest), polling, cancel, download | protocol |
| `src/lib/splatJobs/panel.ts` | Pure state for the upload panel and the progress row | protocol |
| `src/components/VideoScanPanel.tsx` | The panel: tips, Quick/Best, choose or record a video, progress, Cancel | client, panel |
| `pipeline/Dockerfile` | OpenSplat v1.2.2 built the way its own Dockerfile builds it (Ubuntu 22.04, CUDA 12.1.1, libtorch 2.2.1) for the RTX 4060 (`CMAKE_CUDA_ARCHITECTURES=89`), but compiled with `ninja -j ${BUILD_JOBS}` (default 2), because one job per CPU filled Docker Desktop's 7.8 GB VM. It adds `colmap` and `ffmpeg` from Ubuntu's packages after the compile. | — |

The server runs with `tsx` (a free dev dependency) so it can import `src/lib` with the `@/` alias. Its tests live beside it and run in the existing Vitest suite.

**npm scripts:** `pipeline:build` (builds the image), `pipeline:check` (the GPU check: runs `rr-check` inside the image with `--gpus all`, which fails unless `nvidia-smi`, `opensplat --version`, `colmap`, `ffmpeg` and `ffprobe` all work), `demo` (build and serve).

**Job folders:** `%LOCALAPPDATA%\Hearify\jobs\<id>\` by default, or `HEARIFY_JOBS_DIR`. They must stay outside the repo because the repo is inside OneDrive, which would try to sync hundreds of frames per job. Each folder holds `video.<ext>`, `images/`, `sparse/0/`, `splat.spz`, `job.json` and `logs/<step>.log`. Folders are never deleted automatically. COLMAP's `database.db` lives on a per-job Docker volume, `rr-<id>-db`, mounted at `/db`, because SQLite through Docker Desktop's Windows bind mount was about 6× slower. That volume is removed when the job ends, and any left behind are swept when the server starts, along with leftover `rr-` containers.

## 4. Pipeline

Steps run in order, each as its own `docker run --rm --gpus all -v <job folder>:/job hearify-splat …`, with the container named `rr-<job id>-<step>` so Cancel can stop it.

1. **Check the video:** `ffprobe`. Longer than 2 minutes, or no video stream → fail with a specific message.
2. **Frames:** `ffmpeg -i video -vf "fps=<fps>,scale=…" images/%04d.jpg`, scaling so the frame's longer side is at most `<size>` px (never enlarging), whether the video is portrait or landscape.
3. **Camera positions (COLMAP, Memento's settings):**
   - `feature_extractor` with `--ImageReader.single_camera 1 --ImageReader.camera_model SIMPLE_RADIAL --SiftExtraction.use_gpu 0`
   - `sequential_matcher` with `--SequentialMatching.overlap 15 --SequentialMatching.quadratic_overlap 1 --SiftMatching.use_gpu 0`
   - `mapper` with `--Mapper.multiple_models 0 --Mapper.extract_colors 1`, output `sparse/`
   - All three use `--database_path /db/database.db`, on the job's Docker volume (§3).
   - Ubuntu's COLMAP has no CUDA, so SIFT runs on the CPU. A GPU build of COLMAP is added only if timing shows COLMAP is the bottleneck.
   - Fewer than 10 registered frames, or no model → fail with the filming message (§6).
4. **Splat (OpenSplat):** `opensplat /job -n <steps> --max-gaussians 1500000 -o /job/splat.spz`, with the folder laid out the way OpenSplat reads a COLMAP project (Memento puts the sparse model next to an `images` folder). If this OpenSplat build can't write `.spz`, the first pipeline task finds out and the spec is revised before going further.

**Settings** (starting values; tuned after the first timed runs and recorded in `settings.ts`):

| | Quick (live demo) | Best (made beforehand) |
|---|---|---|
| Frames per second | 2 | 3 |
| Frame size (longer side, at most) | 1000 px | 1600 px |
| OpenSplat steps | 2,000 | 15,000 |
| Target time for a 60 s video | under 10 minutes | no limit |
| Measured on the demo laptop (2026-10-07) | 2m52s for a 25 s video, 4m41s for 43 s (about 5–7 min for 60 s) | 24m02s for 43 s (about half an hour for 60 s) |

The starting values met both targets, so they stayed. The slowest Quick step is COLMAP's CPU matching. Best peaked at 5.7 of 7.6 GB in the Docker VM while extracting features at 1600 px.

**Job states:** `queued` → `checking` → `frames` → `cameras` → `training` → `ready`, or `failed` / `canceled` from any state. One job runs at a time; queued jobs report their place in line.

## 5. Jobs API

All under `/api/splat`, same origin as the app.

| Request | Response |
|---|---|
| `GET /health` | `{ pipeline: 'ready' \| 'no-docker' \| 'no-image' }` |
| `POST /jobs?quality=quick\|best`, body: the raw video bytes, `Content-Type: video/*` | `{ id }`. Over 1 GB → 413. |
| `GET /jobs/:id` | `{ id, quality, state, place?, progress?: { done, total }, error?: { code, message } }` |
| `DELETE /jobs/:id` | Cancels: removes a queued job, or stops the running container. The folder is kept. |
| `GET /jobs/:id/splat` | The `.spz` bytes, once `ready` |

Unknown ids answer 404. On start, the server reads every `job.json` in the jobs folder, so a phone polling after a restart still finds its job (now `failed`, code `restarted`).

## 6. On the phone

- **The button:** the 3D view's "Room scan" row gets **Make from a video** beside Load scan. It appears only when `GET /api/splat/health` answers with 200 and JSON. If the pipeline isn't ready, it's greyed out with "The laptop's scan builder isn't running." The app looks unchanged anywhere else, including `next dev`.
- **The panel:** filming tips ("Walk slowly around the room for 30–60 seconds. Move sideways rather than turning on the spot, and keep the light good."), a **Quick / Best** choice (Quick selected), a privacy line ("Your video is sent to this laptop to build the room, and stays there."), and **Choose or record a video** (`<input type="file" accept="video/*">`).
- **Uploading:** percentage sent, Cancel, and "Keep your screen on until the upload finishes."
- **Building:** the "Room scan" row shows the step ("Waiting for the room before yours", "Checking the video", "Pulling frames", "Finding camera positions", "Building your room, step 1,200 of 2,000"), a progress bar and Cancel. The bar follows COLMAP's own counters (files processed, images matched, images registered) and OpenSplat's steps, and slides when a step has nothing to count. The rest of the room works as normal.
- **Remembering the job:** the job id is kept in `localStorage` per room id. When that room's 3D view opens, it resumes polling (every 2 s; after a failed request, "Lost contact with the laptop. Trying again…" and every 5 s).
- **Ready:** the phone downloads the splat, wraps it as a `File` (`video-scan.spz`) and calls the existing `ScanController.open(file, room)`. It's stored in IndexedDB and the three line-up steps begin. If the 3D view is busy with another scan, it waits until that finishes. Then the job id is forgotten.
- **Setup wizard:** no new controls. When the health check answers, the scan step's last line reads "No scan? Open your room now. You can add one, or make one from a video, from the 3D view."

## 7. Errors

| Case | Message on the phone |
|---|---|
| Docker or the image missing | Button greyed out: "The laptop's scan builder isn't running." The server explains why in its terminal. |
| Phone loses contact during a build | "Lost contact with the laptop. Trying again…" The build continues. |
| Video too long, not a video, or over 1 GB | "This video is too long. Keep it under 2 minutes." / "This file isn't a video we can read." / "This video is too large." |
| COLMAP finds no usable model | "Couldn't work out the room from this video. Walk slowly sideways around the room in good light, and try again." |
| OpenSplat fails (e.g. out of GPU memory) | "Building the room failed. Try Quick." The log stays in the job folder. |
| Server restarted during a job | "The laptop restarted while building. Start again." |
| Upload interrupted | "The upload stopped. Try again with the screen on." |
| Remembered job no longer on the laptop (404) | "This build is no longer on the laptop." The job id is forgotten. |
| Cancel | Row returns to normal. The folder is kept. |

## 8. Testing

- **Vitest (with the existing suite):** settings → argument lists; progress parsing from captured COLMAP and OpenSplat output; the job state machine and queue with a fake step runner (success, each failure, cancel while queued, cancel while running, restart recovery); the HTTP API with a fake runner (upload, size limit, status, cancel, download, health); the panel state; the client against a fake server.
- **Pipeline check:** `npm run pipeline:check` passes before anything else is built on it.
- **Real runs:** the author films their bedroom; Quick and Best are timed on the laptop and the settings tuned. That room becomes the demo's room made beforehand.
- **Browser check:** Chrome at phone size against `npm run demo`, then the author's iPhone over Wi-Fi.

## 9. Running the demo

1. Start Docker Desktop.
2. `npm run pipeline:build` (first time only; roughly 30–60 minutes).
3. `npm run pipeline:check`.
4. `npm run demo`, then allow Node through Windows Firewall on private networks when asked. The Wi-Fi network must be set to Private.
5. Open the printed address on the phone.
