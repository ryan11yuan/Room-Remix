# Room Remix: Plan 6, Video Splats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At a hackathon demo, someone films a room on their phone, uploads it to the author's laptop over Wi-Fi, and the laptop builds a Gaussian splat with Memento's pipeline (ffmpeg → COLMAP → OpenSplat) that drops into Room Remix's existing scan flow.

**Architecture:**
- **Pipeline:** the tools run in one Docker image (`room-remix-splat`), built from OpenSplat's own Dockerfile plus Ubuntu's COLMAP and ffmpeg.
- **Server:** a small Node/TypeScript server in this repo (`src/server/`, run with `tsx`). It serves the static export and a jobs API on the laptop's LAN address, and runs each pipeline step as its own `docker run`, one job at a time.
- **Phone:** shared, pure job code in `src/lib/splatJobs/`. The phone uploads with `XMLHttpRequest`, polls the job, downloads the `.spz`, and hands it to the existing `pendingScan` → `ScanController.open` path. Line-up then starts at once.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, Node 22 `http`, tsx, Vitest, Docker Desktop (WSL2, `--gpus all`), OpenSplat v1.2.2 (CUDA 12.1, sm_89), COLMAP 3.7 (Ubuntu 22.04, CPU SIFT), ffmpeg 4.4.

**Spec:** `docs/superpowers/specs/2026-10-06-room-remix-video-splats-design.md` (and, for everything it doesn't change, `docs/superpowers/specs/2026-10-04-room-remix-design.md`).

## Global Constraints

- **Nothing paid:** no paid tools, services, binaries or tiers. Free and open-source only.
- **Hackathon demo:** it runs on the author's laptop. No Cloudflare, tunnels or hosting. Licences (MASt3R is out anyway, OpenSplat is AGPL) don't constrain this plan.
- **Server binding:** port `8080` (or `PORT`), on `0.0.0.0`.
- **Job folders:** `%LOCALAPPDATA%\RoomRemix\jobs\<id>\` (or `ROOM_REMIX_JOBS_DIR`). Never inside the repo, which lives in OneDrive.
- **Docker images:** the pipeline image is `room-remix-splat`; its OpenSplat base is `room-remix-opensplat`.
- **Containers:** each step's container is named `rr-<job id>-<step>`, with the job folder mounted at `/job`.
- **Limits:** videos up to 2 minutes and 1 GB. Splats are capped at 1,500,000 gaussians. COLMAP must register at least 10 frames.
- **Starting settings:**
  - Quick: 2 fps, longer side 1000 px, 2,000 OpenSplat steps.
  - Best: 3 fps, longer side 1600 px, 15,000 steps.
  - Task 8 tunes them.
- **`src/lib/splatJobs/**` stays portable:** it never imports Node modules. Only `client.ts` and `remembered.ts` touch browser globals (`fetch`, `XMLHttpRequest`, `File`, `localStorage`), and each one is injectable for tests.
- **`src/server/**` is Node-only.** Nothing under `src/app` or `src/components` imports it.
- **Spark import rule unchanged:** Spark is imported only by `SplatLayer.ts` (enforced by `eslint.config.mjs`).
- **Copy:** plain sentences, straight apostrophes in TS strings, `…` for ellipses, an en dash in ranges ("30–60 seconds"). Use the exact strings from spec §6–§7 where given.
- **Shell:** Windows PowerShell 5.1 (no `&&`; use `;` or separate commands). npm scripts run in cmd.exe, where `&&` works.
- **Commits:** every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`. Commit by explicit path (`git commit -m … -m … -- <paths>`), because another session may share the tree. Work on `main`; never push.
- **Before each commit:** `npx vitest run` (all tests), `npx tsc --noEmit` and `npm run lint` pass. `npm run build` passes at the end of Tasks 5, 7 and 8.

## Review Focus

1. **A portrait iPhone `.mov` with rotation metadata.** Frames must come out upright, with the *longer* side capped, not the width. Pinned by Task 2's filter test and checked for real in Task 8 with a rotate-tagged sample.
2. **An upload cut off midway** (phone locked, Wi-Fi dropped). The server creates no job and deletes the folder; the phone says "The upload stopped. Try again with the screen on." Tests: Task 5 (aborted request → discard) and Task 6 (`onerror` → `stopped`).
3. **Cancel while a step is running.** The container is killed, the job ends `canceled` (not `failed`) and the next queued job starts. Test: Task 3.
4. **The laptop server restarts mid-build.** A phone that is polling gets the job as `failed` with "The laptop restarted while building. Start again.", not a 404 or an endless spinner. Tests: Task 3 (`init`) and Task 6 (`fetchJob` passes the job through).
5. **URL tricks on the static server** (`/..%2fsecret.txt`, `/..%5csecret.txt`) never serve a file outside `out/`. Test: Task 5.

---

## File Structure

```
pipeline/
  Dockerfile            NEW  FROM room-remix-opensplat + colmap + ffmpeg + rr-check
  check.sh              NEW  GPU and tool check run by `npm run pipeline:check`
.gitattributes          NEW  *.sh text eol=lf
src/lib/splatJobs/
  protocol.ts           NEW  job states, quality, API shapes, error codes and messages, limits
  settings.ts           NEW  Quick/Best settings, frame filter, the six pipeline steps' argument lists
  progress.ts           NEW  readProbe (ffprobe JSON), stepProgress (OpenSplat / COLMAP lines)
  client.ts             NEW  phone: fetchHealth, uploadVideo (XHR), fetchJob, cancelJob, downloadSplat
  remembered.ts         NEW  phone: rememberJob / recallJob / forgetJob (localStorage, per room)
  panel.ts              NEW  phone: VideoScanState, jobLine, jobFraction, messages, poll intervals
  *.test.ts             NEW
src/server/
  jobs.ts               NEW  JobQueue (state machine, one at a time, job.json, restart recovery), registeredImages
  runner.ts             NEW  dockerRunner (docker run per step, logs, kill), lineSplitter, pipelineHealth
  server.ts             NEW  createServer: static out/, /api/splat/*, upload streaming
  main.ts               NEW  wiring, LAN addresses, startup health message
  *.test.ts             NEW  (jobs, runner, server)
src/components/
  useSplatHealth.ts     NEW  health check on mount
  useVideoScan.ts       NEW  upload, follow, cancel, download; remembered per room
  VideoScanPanel.tsx    NEW  VideoScanPanel (tips, quality, video input, upload progress) + VideoScanProgress
  RoomView.tsx          MOD  "Make from a video", panel/progress, align-on-open for video scans
src/app/setup/page.tsx  MOD  last line of the scan step mentions video when the server answers
package.json            MOD  tsx dev dependency; scripts demo, demo:serve, pipeline:build, pipeline:check
README.md               MOD  "Hackathon demo" section
```

Task order: 1 (starts the long image build in the background) → 2 → 3 → 4 → 5 → 6 → 7 → 8 (needs the built image).

---

### Task 1: Pipeline image and GPU check

**Run by the controller, not a subagent.** This task is mostly long-running commands. The image build takes roughly 30–60 minutes and runs in the background while Tasks 2–6 proceed.

**Files:**
- Create: `pipeline/Dockerfile`, `pipeline/check.sh`, `.gitattributes`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: the Docker image `room-remix-splat`, with `ffprobe`, `ffmpeg`, `colmap`, `opensplat` and `rr-check` on `PATH` and `WORKDIR /job`. npm scripts `pipeline:build` and `pipeline:check`.

- [ ] **Step 1: Start Docker Desktop and wait for it**

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```
Then poll `docker info --format '{{.ServerVersion}}'` every few seconds, up to 3 minutes, until it prints a version.

- [ ] **Step 2: Check that Docker can use the GPU (the spec's 5-minute check)**

```powershell
docker run --rm --gpus all nvidia/cuda:12.1.1-base-ubuntu22.04 nvidia-smi -L
```
Expected: `GPU 0: NVIDIA GeForce RTX 4060 Laptop GPU (UUID: …)`.

If it fails, stop the plan here: the spec's fallback (building OpenSplat natively on Windows) needs a revised plan. Report the exact error.

- [ ] **Step 3: Write `pipeline/check.sh`**

```sh
#!/bin/sh
# Run by `npm run pipeline:check` with --gpus all: fails unless the GPU and every pipeline tool are usable.
set -e
nvidia-smi -L
echo "OpenSplat $(opensplat --version)"
colmap help > /dev/null
echo "COLMAP ok"
ffmpeg -hide_banner -version | head -n 1
ffprobe -hide_banner -version | head -n 1
```

- [ ] **Step 4: Write `pipeline/Dockerfile`**

```dockerfile
# Room Remix's splat pipeline (spec 2026-10-06 §3-§4). The base, room-remix-opensplat, is OpenSplat's own Dockerfile at
# v1.2.2 built for the RTX 4060 (sm_89) by `npm run pipeline:build`. COLMAP and ffmpeg come from Ubuntu 22.04's
# packages; Ubuntu's COLMAP has no CUDA, so SIFT runs on the CPU (the pipeline passes use_gpu 0).
FROM room-remix-opensplat
RUN apt-get update && \
    apt-get install -y --no-install-recommends colmap ffmpeg && \
    rm -rf /var/lib/apt/lists/*
RUN ln -sf /code/build/opensplat /usr/local/bin/opensplat
# COLMAP links Qt, and nothing here has a display.
ENV QT_QPA_PLATFORM=offscreen
COPY check.sh /usr/local/bin/rr-check
# A Windows checkout can give the script CRLF line endings.
RUN sed -i 's/\r$//' /usr/local/bin/rr-check && chmod +x /usr/local/bin/rr-check
WORKDIR /job
```

- [ ] **Step 5: Write `.gitattributes`**

```
*.sh text eol=lf
```

- [ ] **Step 6: Add the scripts to `package.json`**

In `"scripts"`, after `"test:watch"`, add:

```json
    "pipeline:build": "docker build -t room-remix-opensplat --build-arg CMAKE_CUDA_ARCHITECTURES=89 https://github.com/pierotofy/OpenSplat.git#v1.2.2 && docker build -t room-remix-splat pipeline",
    "pipeline:check": "docker run --rm --gpus all room-remix-splat rr-check"
```

- [ ] **Step 7: Commit**

```powershell
git add pipeline/Dockerfile pipeline/check.sh .gitattributes package.json
git commit -m "build: Docker image for the splat pipeline (OpenSplat v1.2.2 for sm_89, COLMAP, ffmpeg) and a GPU check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- pipeline/Dockerfile pipeline/check.sh .gitattributes package.json
```

- [ ] **Step 8: Start the image build in the background**

Run `npm run pipeline:build` with `run_in_background`, and don't wait for it. Tasks 2–6 don't need the image.

If the first stage fails while compiling OpenSplat, read the build log. A CUDA architecture or libtorch download problem can be fixed with `--build-arg` values (for example `TORCH_VERSION`, `CUDA_VERSION`); anything else is a plan revision.

- [ ] **Step 9 (before Task 7): Check the built image**

```powershell
npm run pipeline:check
```
Expected:
- `GPU 0: NVIDIA GeForce RTX 4060 Laptop GPU …`
- `OpenSplat` followed by a version
- `COLMAP ok`
- `ffmpeg version 4.4…`
- `ffprobe version 4.4…`
- exit code 0

---

### Task 2: Shared job types, pipeline commands and output reading

**Files:**
- Create: `src/lib/splatJobs/protocol.ts`, `src/lib/splatJobs/settings.ts`, `src/lib/splatJobs/progress.ts`
- Test: `src/lib/splatJobs/protocol.test.ts`, `src/lib/splatJobs/settings.test.ts`, `src/lib/splatJobs/progress.test.ts`

**Interfaces:**
- Produces (protocol.ts):
  ```ts
  type Quality = 'quick' | 'best';  QUALITIES: readonly Quality[];  isQuality(v: unknown): v is Quality
  type JobState = 'queued' | 'checking' | 'frames' | 'cameras' | 'training' | 'ready' | 'failed' | 'canceled'
  type JobErrorCode = 'too-long' | 'not-video' | 'no-model' | 'training-failed' | 'step-failed' | 'restarted'
  type JobView = { id: string; quality: Quality; state: JobState; place?: number; progress?: { done: number; total: number }; error?: { code: JobErrorCode; message: string } }
  type PipelineHealth = 'ready' | 'no-docker' | 'no-image';  type Health = { pipeline: PipelineHealth }
  MAX_VIDEO_BYTES = 1024 ** 3;  MAX_VIDEO_SECONDS = 120
  JOB_ERROR_MESSAGES: Record<JobErrorCode, string>;  isFinished(state: JobState): boolean
  ```
- Produces (settings.ts):
  ```ts
  type Settings = { fps: number; maxSize: number; steps: number };  SETTINGS: Record<Quality, Settings>
  MAX_GAUSSIANS = 1_500_000;  MIN_REGISTERED = 10;  JOB = '/job'
  type StepName = 'probe' | 'frames' | 'features' | 'matching' | 'mapper' | 'training'
  type PipelineStep = { name: StepName; state: JobState; gpu: boolean; args: string[] }
  frameFilter(fps: number, maxSize: number): string
  pipelineSteps(quality: Quality, videoName: string): PipelineStep[]
  ```
- Produces (progress.ts):
  ```ts
  type ProbeResult = { ok: true; seconds: number } | { ok: false; code: 'not-video' | 'too-long' }
  readProbe(json: string, maxSeconds?: number): ProbeResult
  stepProgress(step: StepName, line: string, frames: number, steps: number): { done: number; total: number } | null
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/splatJobs/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isFinished, isQuality, JOB_ERROR_MESSAGES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from './protocol';

describe('protocol', () => {
  it('knows which job states are final', () => {
    expect(['ready', 'failed', 'canceled'].every((s) => isFinished(s as never))).toBe(true);
    expect(['queued', 'checking', 'frames', 'cameras', 'training'].some((s) => isFinished(s as never))).toBe(false);
  });

  it('accepts only the two qualities', () => {
    expect(isQuality('quick')).toBe(true);
    expect(isQuality('best')).toBe(true);
    expect(isQuality('fast')).toBe(false);
    expect(isQuality(null)).toBe(false);
  });

  it('uses the spec messages and limits', () => {
    expect(JOB_ERROR_MESSAGES['no-model']).toBe(
      "Couldn't work out the room from this video. Walk slowly sideways around the room in good light, and try again.",
    );
    expect(JOB_ERROR_MESSAGES.restarted).toBe('The laptop restarted while building. Start again.');
    expect(JOB_ERROR_MESSAGES['too-long']).toBe('This video is too long. Keep it under 2 minutes.');
    expect(MAX_VIDEO_SECONDS).toBe(120);
    expect(MAX_VIDEO_BYTES).toBe(1024 ** 3);
  });
});
```

`src/lib/splatJobs/settings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { frameFilter, MAX_GAUSSIANS, MIN_REGISTERED, pipelineSteps, SETTINGS } from './settings';

describe('pipelineSteps', () => {
  it('runs the six steps in order, each under its job state', () => {
    expect(pipelineSteps('quick', 'video.mov').map((s) => [s.name, s.state])).toEqual([
      ['probe', 'checking'],
      ['frames', 'frames'],
      ['features', 'cameras'],
      ['matching', 'cameras'],
      ['mapper', 'cameras'],
      ['training', 'training'],
    ]);
  });

  it('gives only OpenSplat the GPU', () => {
    expect(pipelineSteps('quick', 'video.mp4').filter((s) => s.gpu).map((s) => s.name)).toEqual(['training']);
  });

  it('reads the video from the job folder and writes numbered frames into images/', () => {
    const [probe, frames] = pipelineSteps('best', 'video.mov');
    expect(probe.args).toEqual(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', '/job/video.mov']);
    expect(frames.args).toEqual([
      'ffmpeg', '-v', 'error', '-y', '-i', '/job/video.mov',
      '-vf', frameFilter(SETTINGS.best.fps, SETTINGS.best.maxSize),
      '-q:v', '2', '/job/images/%04d.jpg',
    ]);
  });

  it('uses the Memento COLMAP settings, with SIFT on the CPU', () => {
    const steps = pipelineSteps('quick', 'video.mp4');
    const args = (name: string) => steps.find((s) => s.name === name)!.args.join(' ');
    expect(args('features')).toBe(
      'colmap feature_extractor --database_path /job/database.db --image_path /job/images --ImageReader.single_camera 1 --ImageReader.camera_model SIMPLE_RADIAL --SiftExtraction.use_gpu 0',
    );
    expect(args('matching')).toBe(
      'colmap sequential_matcher --database_path /job/database.db --SequentialMatching.overlap 15 --SequentialMatching.quadratic_overlap 1 --SiftMatching.use_gpu 0',
    );
    expect(args('mapper')).toBe(
      'colmap mapper --database_path /job/database.db --image_path /job/images --output_path /job/sparse --Mapper.multiple_models 0 --Mapper.extract_colors 1',
    );
  });

  it('trains for the quality steps, caps the splat count and writes .spz', () => {
    expect(pipelineSteps('quick', 'video.mp4').at(-1)!.args).toEqual([
      'opensplat', '/job', '-n', String(SETTINGS.quick.steps), '--max-gaussians', '1500000', '-o', '/job/splat.spz',
    ]);
    expect(pipelineSteps('best', 'video.mp4').at(-1)!.args[3]).toBe(String(SETTINGS.best.steps));
    expect(MAX_GAUSSIANS).toBe(1_500_000);
    expect(MIN_REGISTERED).toBe(10);
  });

  it('takes fewer, smaller frames and fewer steps for Quick than for Best', () => {
    expect(SETTINGS.quick.fps).toBeLessThan(SETTINGS.best.fps);
    expect(SETTINGS.quick.maxSize).toBeLessThan(SETTINGS.best.maxSize);
    expect(SETTINGS.quick.steps).toBeLessThan(SETTINGS.best.steps);
  });
});

describe('frameFilter', () => {
  it('caps the longer side, so portrait and landscape video are treated alike, and never enlarges', () => {
    // ffmpeg rotates by the video's rotation tag before filters run, so iw/ih here are the upright frame's.
    expect(frameFilter(2, 1000)).toBe("fps=2,scale='if(gte(iw,ih),min(1000,iw),-2)':'if(gte(iw,ih),-2,min(1000,ih))'");
  });
});
```

`src/lib/splatJobs/progress.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readProbe, stepProgress } from './progress';

const probe = (format: object, streams: object[]) => JSON.stringify({ format, streams }, null, 2);

describe('readProbe', () => {
  it('accepts a video up to 2 minutes long', () => {
    expect(readProbe(probe({ duration: '59.500000' }, [{ codec_type: 'audio' }, { codec_type: 'video' }]))).toEqual({ ok: true, seconds: 59.5 });
    expect(readProbe(probe({ duration: '120.000000' }, [{ codec_type: 'video' }])).ok).toBe(true);
  });

  it('falls back to the video stream duration', () => {
    expect(readProbe(probe({}, [{ codec_type: 'video', duration: '12.0' }]))).toEqual({ ok: true, seconds: 12 });
  });

  it('refuses a video longer than 2 minutes', () => {
    expect(readProbe(probe({ duration: '120.5' }, [{ codec_type: 'video' }]))).toEqual({ ok: false, code: 'too-long' });
  });

  it('refuses audio only, a photo (no duration) and output that is not JSON', () => {
    expect(readProbe(probe({ duration: '30' }, [{ codec_type: 'audio' }]))).toEqual({ ok: false, code: 'not-video' });
    expect(readProbe(probe({}, [{ codec_type: 'video' }]))).toEqual({ ok: false, code: 'not-video' });
    expect(readProbe('/job/video.mp4: Invalid data found when processing input')).toEqual({ ok: false, code: 'not-video' });
  });
});

describe('stepProgress', () => {
  it('reads OpenSplat step lines against the step count', () => {
    expect(stepProgress('training', 'Step 1200: 0.0312 [60%]', 0, 2000)).toEqual({ done: 1200, total: 2000 });
    expect(stepProgress('training', 'Using CUDA', 0, 2000)).toBeNull();
  });

  it('reads COLMAP registered image counts against the frame count', () => {
    expect(stepProgress('mapper', 'Registering image #37 (12)', 80, 2000)).toEqual({ done: 12, total: 80 });
    expect(stepProgress('mapper', 'Registering image #37 (12)', 0, 2000)).toBeNull();
  });

  it('never reports more than the total', () => {
    expect(stepProgress('training', 'Step 2010: 0.01 [100%]', 0, 2000)).toEqual({ done: 2000, total: 2000 });
    expect(stepProgress('mapper', 'Registering image #90 (91)', 80, 2000)).toEqual({ done: 80, total: 80 });
  });

  it('has no progress for the other steps', () => {
    expect(stepProgress('features', 'Processed file [3/80]', 80, 2000)).toBeNull();
    expect(stepProgress('frames', 'frame=   12', 80, 2000)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/lib/splatJobs`
Expected: FAIL, because the modules don't exist yet.

- [ ] **Step 3: Write `src/lib/splatJobs/protocol.ts`**

```ts
/** Shared by the phone app and the demo server (spec 2026-10-06 §4-§7). No DOM or Node imports. */

export type Quality = 'quick' | 'best';
export const QUALITIES: readonly Quality[] = ['quick', 'best'];
export const isQuality = (value: unknown): value is Quality => value === 'quick' || value === 'best';

export type JobState = 'queued' | 'checking' | 'frames' | 'cameras' | 'training' | 'ready' | 'failed' | 'canceled';
export const isFinished = (state: JobState): boolean => state === 'ready' || state === 'failed' || state === 'canceled';

export type JobErrorCode = 'too-long' | 'not-video' | 'no-model' | 'training-failed' | 'step-failed' | 'restarted';

export type JobView = {
  id: string;
  quality: Quality;
  state: JobState;
  /** While queued: how many jobs are ahead of this one (1: the one building now). */
  place?: number;
  progress?: { done: number; total: number };
  error?: { code: JobErrorCode; message: string };
};

export type PipelineHealth = 'ready' | 'no-docker' | 'no-image';
export type Health = { pipeline: PipelineHealth };

export const MAX_VIDEO_BYTES = 1024 ** 3;
export const MAX_VIDEO_SECONDS = 120;

export const JOB_ERROR_MESSAGES: Record<JobErrorCode, string> = {
  'too-long': 'This video is too long. Keep it under 2 minutes.',
  'not-video': "This file isn't a video we can read.",
  'no-model': "Couldn't work out the room from this video. Walk slowly sideways around the room in good light, and try again.",
  'training-failed': 'Building the room failed. Try Quick.',
  'step-failed': "Something went wrong on the laptop. Its log is in the job's folder.",
  restarted: 'The laptop restarted while building. Start again.',
};
```

- [ ] **Step 4: Write `src/lib/splatJobs/settings.ts`**

```ts
import type { JobState, Quality } from './protocol';

export type Settings = { fps: number; maxSize: number; steps: number };

/** Spec §4. Starting values, tuned after timed runs on the demo laptop (Plan 6, Task 8). */
export const SETTINGS: Record<Quality, Settings> = {
  quick: { fps: 2, maxSize: 1000, steps: 2000 },
  best: { fps: 3, maxSize: 1600, steps: 15000 },
};

/** The app warns above this many splats (spec 2026-10-04 §8), so OpenSplat never makes more. */
export const MAX_GAUSSIANS = 1_500_000;
/** Fewer registered frames than this and COLMAP hasn't really found the room. */
export const MIN_REGISTERED = 10;
/** Where the job folder is mounted inside the pipeline container. */
export const JOB = '/job';

export type StepName = 'probe' | 'frames' | 'features' | 'matching' | 'mapper' | 'training';
export type PipelineStep = { name: StepName; state: JobState; gpu: boolean; args: string[] };

/** Frames per second, then the longer side capped at `maxSize` px (never enlarged) for portrait and landscape video. */
export function frameFilter(fps: number, maxSize: number): string {
  return `fps=${fps},scale='if(gte(iw,ih),min(${maxSize},iw),-2)':'if(gte(iw,ih),-2,min(${maxSize},ih))'`;
}

/** The pipeline Memento uses (ffmpeg → COLMAP → OpenSplat), as the commands run inside the container. */
export function pipelineSteps(quality: Quality, videoName: string): PipelineStep[] {
  const { fps, maxSize, steps } = SETTINGS[quality];
  const video = `${JOB}/${videoName}`;
  const database = `${JOB}/database.db`;
  const images = `${JOB}/images`;
  return [
    {
      name: 'probe',
      state: 'checking',
      gpu: false,
      args: ['ffprobe', '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', video],
    },
    {
      name: 'frames',
      state: 'frames',
      gpu: false,
      args: ['ffmpeg', '-v', 'error', '-y', '-i', video, '-vf', frameFilter(fps, maxSize), '-q:v', '2', `${images}/%04d.jpg`],
    },
    {
      name: 'features',
      state: 'cameras',
      gpu: false,
      args: [
        'colmap', 'feature_extractor',
        '--database_path', database,
        '--image_path', images,
        '--ImageReader.single_camera', '1',
        '--ImageReader.camera_model', 'SIMPLE_RADIAL',
        '--SiftExtraction.use_gpu', '0',
      ],
    },
    {
      name: 'matching',
      state: 'cameras',
      gpu: false,
      args: [
        'colmap', 'sequential_matcher',
        '--database_path', database,
        '--SequentialMatching.overlap', '15',
        '--SequentialMatching.quadratic_overlap', '1',
        '--SiftMatching.use_gpu', '0',
      ],
    },
    {
      name: 'mapper',
      state: 'cameras',
      gpu: false,
      args: [
        'colmap', 'mapper',
        '--database_path', database,
        '--image_path', images,
        '--output_path', `${JOB}/sparse`,
        '--Mapper.multiple_models', '0',
        '--Mapper.extract_colors', '1',
      ],
    },
    {
      name: 'training',
      state: 'training',
      gpu: true,
      // OpenSplat reads the COLMAP model from sparse/0 and the frames from images/ (its colmap.cpp); .spz by extension.
      args: ['opensplat', JOB, '-n', String(steps), '--max-gaussians', String(MAX_GAUSSIANS), '-o', `${JOB}/splat.spz`],
    },
  ];
}
```

- [ ] **Step 5: Write `src/lib/splatJobs/progress.ts`**

```ts
import { MAX_VIDEO_SECONDS } from './protocol';
import type { StepName } from './settings';

export type ProbeResult = { ok: true; seconds: number } | { ok: false; code: 'not-video' | 'too-long' };

type Probe = { format?: { duration?: string }; streams?: { codec_type?: string; duration?: string }[] };

/** Reads `ffprobe -print_format json -show_format -show_streams` output. A photo has a video stream but no duration. */
export function readProbe(json: string, maxSeconds = MAX_VIDEO_SECONDS): ProbeResult {
  let data: Probe;
  try {
    data = JSON.parse(json) as Probe;
  } catch {
    return { ok: false, code: 'not-video' };
  }
  const video = data.streams?.find((s) => s.codec_type === 'video');
  if (!video) return { ok: false, code: 'not-video' };
  const seconds = Number(data.format?.duration ?? video.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, code: 'not-video' };
  if (seconds > maxSeconds) return { ok: false, code: 'too-long' };
  return { ok: true, seconds };
}

/**
 * Progress within a step, from one line of its output: OpenSplat prints "Step 1200: 0.03 [60%]" every 10 steps, and
 * COLMAP's mapper prints "Registering image #37 (12)", 12 being the number registered so far. Other steps have none.
 */
export function stepProgress(step: StepName, line: string, frames: number, steps: number): { done: number; total: number } | null {
  if (step === 'training') {
    const match = /^Step (\d+):/.exec(line.trim());
    return match ? { done: Math.min(Number(match[1]), steps), total: steps } : null;
  }
  if (step === 'mapper' && frames > 0) {
    const match = /Registering image #\d+ \((\d+)\)/.exec(line);
    return match ? { done: Math.min(Number(match[1]), frames), total: frames } : null;
  }
  return null;
}
```

- [ ] **Step 6: Run the tests to check they pass**

Run: `npx vitest run src/lib/splatJobs`
Expected: PASS. Then run `npx tsc --noEmit` and `npm run lint`; both must be clean.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/splatJobs
git commit -m "feat: shared splat job types, the Memento pipeline steps with Quick and Best settings, and reading tool output" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/splatJobs
```

---

### Task 3: Job queue

**Files:**
- Create: `src/server/jobs.ts`
- Test: `src/server/jobs.test.ts`

**Interfaces:**
- Consumes: Task 2's `protocol.ts`, `settings.ts` and `progress.ts`.
- Produces:
  ```ts
  type RunningStep = { done: Promise<number>; kill(): void }
  type StepRunner = (jobId: string, dir: string, step: PipelineStep, onLine: (line: string) => void) => RunningStep
  registeredImages(dir: string): Promise<number>
  class JobQueue {
    constructor(root: string, run: StepRunner)
    init(): Promise<void>
    reserve(): Promise<{ id: string; dir: string }>
    discard(id: string): Promise<void>
    add(id: string, quality: Quality, videoName: string): Promise<JobView>
    get(id: string): JobView | null
    cancel(id: string): Promise<JobView | null>
    splatPath(id: string): string | null
    settled(): Promise<void>
  }
  ```

- [ ] **Step 1: Write the failing tests**

`src/server/jobs.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JOB_ERROR_MESSAGES } from '@/lib/splatJobs/protocol';
import { SETTINGS, type StepName } from '@/lib/splatJobs/settings';
import { JobQueue, registeredImages, type StepRunner } from './jobs';

type Behaviour = { lines?: string[]; code?: number; effect?: (dir: string) => Promise<unknown>; hold?: Promise<void>; throws?: boolean };

const PROBE_OK = JSON.stringify({ format: { duration: '45.0' }, streams: [{ codec_type: 'video' }] });

async function writeImagesBin(dir: string, count: number) {
  await mkdir(path.join(dir, 'sparse', '0'), { recursive: true });
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(count));
  await writeFile(path.join(dir, 'sparse', '0', 'images.bin'), bytes);
}

async function writeFrames(dir: string, count: number) {
  for (let i = 1; i <= count; i++) await writeFile(path.join(dir, 'images', `${String(i).padStart(4, '0')}.jpg`), '');
}

/** A runner that acts out each step: by default every step succeeds and leaves what the next one needs. */
function fakeRunner(overrides: Partial<Record<StepName, Behaviour>> = {}) {
  const log: string[] = [];
  const killed: string[] = [];
  const defaults: Record<StepName, Behaviour> = {
    probe: { lines: [PROBE_OK] },
    frames: { effect: (dir) => writeFrames(dir, 20) },
    features: {},
    matching: {},
    mapper: { lines: ['Registering image #4 (1)', 'Registering image #9 (2)'], effect: (dir) => writeImagesBin(dir, 20) },
    training: { lines: ['Using CUDA', 'Step 10: 0.21 [0%]'], effect: (dir) => writeFile(path.join(dir, 'splat.spz'), 'spz') },
  };
  const run: StepRunner = (id, dir, step, onLine) => {
    log.push(`${id}:${step.name}`);
    const b = { ...defaults[step.name], ...overrides[step.name] };
    let kill!: () => void;
    const killedAt = new Promise<number>((resolve) => {
      kill = () => {
        killed.push(`${id}:${step.name}`);
        resolve(137);
      };
    });
    const done = (async () => {
      for (const line of b.lines ?? []) onLine(line);
      if (b.hold) {
        const code = await Promise.race([b.hold.then(() => null), killedAt]);
        if (code !== null) return code;
      }
      if (b.throws) throw new Error('docker vanished');
      await b.effect?.(dir);
      return b.code ?? 0;
    })();
    return { done, kill };
  };
  return { run, log, killed };
}

function gate() {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
}

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'rr-jobs-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

async function queued(queue: JobQueue, quality: 'quick' | 'best' = 'quick') {
  const { id } = await queue.reserve();
  return queue.add(id, quality, 'video.mp4');
}

describe('JobQueue', () => {
  it('builds a video through every step to a ready splat, and keeps the record in job.json', async () => {
    const runner = fakeRunner();
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    expect(job).toEqual({ id: job.id, quality: 'quick', state: 'queued', place: 0 });
    await queue.settled();
    expect(queue.get(job.id)).toEqual({ id: job.id, quality: 'quick', state: 'ready' });
    expect(runner.log).toEqual(['probe', 'frames', 'features', 'matching', 'mapper', 'training'].map((s) => `${job.id}:${s}`));
    const splat = queue.splatPath(job.id)!;
    expect((await stat(splat)).isFile()).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, job.id, 'job.json'), 'utf8'))).toMatchObject({ state: 'ready', videoName: 'video.mp4' });
  });

  it('reports the running step state and its progress', async () => {
    const training = gate();
    const queue = new JobQueue(root, fakeRunner({ training: { hold: training.opened } }).run);
    await queue.init();
    const job = await queued(queue);
    // Progress appears once OpenSplat is running (the state changes a moment earlier, before job.json is saved).
    await vi.waitFor(() => expect(queue.get(job.id)?.progress).toEqual({ done: 10, total: SETTINGS.quick.steps }));
    expect(queue.get(job.id)?.state).toBe('training');
    training.open();
    await queue.settled();
    expect(queue.get(job.id)?.progress).toBeUndefined();
  });

  it('fails a video that is too long without pulling frames', async () => {
    const tooLong = JSON.stringify({ format: { duration: '200' }, streams: [{ codec_type: 'video' }] });
    const runner = fakeRunner({ probe: { lines: [tooLong] } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)).toMatchObject({ state: 'failed', error: { code: 'too-long', message: JOB_ERROR_MESSAGES['too-long'] } });
    expect(runner.log).toEqual([`${job.id}:probe`]);
  });

  it('fails as not-video when ffprobe or ffmpeg fail, or no frames come out', async () => {
    for (const overrides of [{ probe: { code: 1 } }, { frames: { code: 1 } }, { frames: { effect: async () => {} } }]) {
      const queue = new JobQueue(root, fakeRunner(overrides).run);
      await queue.init();
      const job = await queued(queue);
      await queue.settled();
      expect(queue.get(job.id)?.error?.code).toBe('not-video');
    }
  });

  it('fails with no-model when COLMAP registers fewer than 10 frames, and skips training', async () => {
    const runner = fakeRunner({ mapper: { effect: (dir) => writeImagesBin(dir, 3) } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)?.error?.code).toBe('no-model');
    expect(runner.log.some((entry) => entry.endsWith(':training'))).toBe(false);
  });

  it('fails with training-failed when OpenSplat exits non-zero or writes no splat', async () => {
    for (const overrides of [{ training: { code: 1 } }, { training: { effect: async () => {} } }]) {
      const queue = new JobQueue(root, fakeRunner(overrides).run);
      await queue.init();
      const job = await queued(queue);
      await queue.settled();
      expect(queue.get(job.id)).toMatchObject({ state: 'failed', error: { code: 'training-failed' } });
      expect(queue.splatPath(job.id)).toBeNull();
    }
  });

  it('fails as step-failed when a step cannot even run', async () => {
    const queue = new JobQueue(root, fakeRunner({ features: { throws: true } }).run);
    await queue.init();
    const job = await queued(queue);
    await queue.settled();
    expect(queue.get(job.id)?.error?.code).toBe('step-failed');
  });

  it('builds one job at a time and tells queued jobs their place in line', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    await vi.waitFor(() => expect(queue.get(first.id)?.state).toBe('training'));
    const second = await queued(queue, 'best');
    const third = await queued(queue);
    expect(queue.get(second.id)).toMatchObject({ state: 'queued', place: 1 });
    expect(queue.get(third.id)).toMatchObject({ state: 'queued', place: 2 });
    training.open();
    await queue.settled();
    expect([first, second, third].map((j) => queue.get(j.id)?.state)).toEqual(['ready', 'ready', 'ready']);
    const firstOfSecond = runner.log.indexOf(`${second.id}:probe`);
    expect(runner.log.slice(0, firstOfSecond).every((entry) => entry.startsWith(first.id))).toBe(true);
  });

  it('cancels a queued job without running it', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    const second = await queued(queue);
    expect((await queue.cancel(second.id))?.state).toBe('canceled');
    training.open();
    await queue.settled();
    expect(queue.get(first.id)?.state).toBe('ready');
    expect(runner.log.some((entry) => entry.startsWith(second.id))).toBe(false);
  });

  it('cancels a running job by killing its step, ends it canceled (not failed) and starts the next', async () => {
    const training = gate();
    const runner = fakeRunner({ training: { hold: training.opened } });
    const queue = new JobQueue(root, runner.run);
    await queue.init();
    const first = await queued(queue);
    const second = await queued(queue);
    await vi.waitFor(() => expect(queue.get(first.id)?.progress).toBeDefined()); // OpenSplat is running
    await queue.cancel(first.id);
    expect(runner.killed).toEqual([`${first.id}:training`]);
    training.open();
    await queue.settled();
    expect(queue.get(first.id)).toEqual({ id: first.id, quality: 'quick', state: 'canceled' });
    expect(queue.get(second.id)?.state).toBe('ready');
  });

  it('after a restart, fails unfinished jobs as restarted, keeps finished ones and skips unfinished uploads', async () => {
    const write = async (id: string, state: string) => {
      await mkdir(path.join(root, id), { recursive: true });
      await writeFile(path.join(root, id, 'job.json'), JSON.stringify({ id, quality: 'quick', videoName: 'video.mp4', state, createdAt: 1 }));
    };
    await write('building', 'training');
    await write('waiting', 'queued');
    await write('done', 'ready');
    await mkdir(path.join(root, 'upload-cut-off'));
    const queue = new JobQueue(root, fakeRunner().run);
    await queue.init();
    expect(queue.get('building')).toMatchObject({ state: 'failed', error: { code: 'restarted', message: JOB_ERROR_MESSAGES.restarted } });
    expect(queue.get('waiting')?.state).toBe('failed');
    expect(queue.get('done')?.state).toBe('ready');
    expect(queue.get('upload-cut-off')).toBeNull();
    expect(JSON.parse(await readFile(path.join(root, 'building', 'job.json'), 'utf8')).state).toBe('failed');
  });

  it('creates its folder, answers null for unknown ids and discards only folders that never became jobs', async () => {
    const queue = new JobQueue(path.join(root, 'nested', 'jobs'), fakeRunner().run);
    await queue.init();
    expect(queue.get('nope')).toBeNull();
    expect(await queue.cancel('nope')).toBeNull();
    expect(queue.splatPath('nope')).toBeNull();
    const { id, dir } = await queue.reserve();
    for (const sub of ['images', 'sparse', 'logs']) expect((await stat(path.join(dir, sub))).isDirectory()).toBe(true);
    await queue.discard(id);
    await expect(stat(dir)).rejects.toThrow();
    const job = await queued(queue);
    await queue.settled();
    await queue.discard(job.id);
    expect(queue.get(job.id)?.state).toBe('ready');
  });
});

describe('registeredImages', () => {
  it('reads the image count from images.bin, or 0 without a model', async () => {
    expect(await registeredImages(root)).toBe(0);
    await writeImagesBin(root, 37);
    expect(await registeredImages(root)).toBe(37);
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/server/jobs.test.ts`
Expected: FAIL, because `./jobs` doesn't exist.

- [ ] **Step 3: Write `src/server/jobs.ts`**

```ts
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readProbe, stepProgress } from '@/lib/splatJobs/progress';
import {
  isFinished,
  JOB_ERROR_MESSAGES,
  type JobErrorCode,
  type JobState,
  type JobView,
  type Quality,
} from '@/lib/splatJobs/protocol';
import { MIN_REGISTERED, pipelineSteps, SETTINGS, type PipelineStep } from '@/lib/splatJobs/settings';

export type RunningStep = { done: Promise<number>; kill(): void };
/** Runs one pipeline step for a job. `onLine` gets each line of its output; `done` resolves with the exit code. */
export type StepRunner = (jobId: string, dir: string, step: PipelineStep, onLine: (line: string) => void) => RunningStep;

type JobRecord = {
  id: string;
  quality: Quality;
  videoName: string;
  state: JobState;
  createdAt: number;
  error?: { code: JobErrorCode; message: string };
};
type Outcome = { state: 'ready' | 'failed' | 'canceled'; code?: JobErrorCode };

const RECORD = 'job.json';
const SPLAT = 'splat.spz';

/** How many images COLMAP registered: the first 8 bytes (little-endian) of sparse/0/images.bin. 0 without a model. */
export async function registeredImages(dir: string): Promise<number> {
  try {
    const bytes = await readFile(path.join(dir, 'sparse', '0', 'images.bin'));
    return bytes.length >= 8 ? Number(bytes.readBigUInt64LE(0)) : 0;
  } catch {
    return 0;
  }
}

const countFrames = async (dir: string) => (await readdir(path.join(dir, 'images'))).filter((n) => n.endsWith('.jpg')).length;
const exists = (file: string) => stat(file).then(
  () => true,
  () => false,
);

/**
 * The demo laptop's build queue (spec 2026-10-06 §4): one job at a time, each step run by `run`, state kept in each
 * job folder's job.json so a restarted server still answers for its jobs.
 */
export class JobQueue {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly progress = new Map<string, { done: number; total: number }>();
  private readonly waiting: string[] = [];
  private current: { id: string; step: RunningStep | null; canceled: boolean } | null = null;
  private building: Promise<void> = Promise.resolve();

  constructor(
    private readonly root: string,
    private readonly run: StepRunner,
  ) {}

  /** Reads every job folder. Jobs that weren't finished when the server stopped become failed, `restarted`. */
  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    for (const entry of await readdir(this.root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let job: JobRecord;
      try {
        job = JSON.parse(await readFile(path.join(this.root, entry.name, RECORD), 'utf8')) as JobRecord;
      } catch {
        continue; // no job.json: an upload that never finished
      }
      this.jobs.set(job.id, job);
      if (!isFinished(job.state)) await this.finish(job, 'failed', 'restarted');
    }
  }

  /** A new, empty job folder for an upload to be written into. */
  async reserve(): Promise<{ id: string; dir: string }> {
    const id = randomUUID();
    const dir = this.dirOf(id);
    for (const sub of ['images', 'sparse', 'logs']) await mkdir(path.join(dir, sub), { recursive: true });
    return { id, dir };
  }

  /** Throws away a reserved folder whose upload didn't finish. A real job's folder is never removed. */
  async discard(id: string): Promise<void> {
    if (this.jobs.has(id)) return;
    await rm(this.dirOf(id), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  /** Queues an uploaded video, and starts it if nothing is building. */
  async add(id: string, quality: Quality, videoName: string): Promise<JobView> {
    const job: JobRecord = { id, quality, videoName, state: 'queued', createdAt: Date.now() };
    this.jobs.set(id, job);
    await this.save(job);
    this.waiting.push(id);
    const view = this.get(id)!;
    this.pump();
    return view;
  }

  get(id: string): JobView | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    const view: JobView = { id, quality: job.quality, state: job.state };
    if (job.state === 'queued') view.place = this.waiting.indexOf(id) + (this.current ? 1 : 0);
    const progress = this.progress.get(id);
    if (progress && !isFinished(job.state)) view.progress = { ...progress };
    if (job.error) view.error = job.error;
    return view;
  }

  /** A queued job is dropped; a running one has its step killed and ends `canceled`. The folder stays. */
  async cancel(id: string): Promise<JobView | null> {
    const job = this.jobs.get(id);
    if (!job) return null;
    const at = this.waiting.indexOf(id);
    if (at >= 0) {
      this.waiting.splice(at, 1);
      await this.finish(job, 'canceled');
    } else if (this.current?.id === id) {
      this.current.canceled = true;
      this.current.step?.kill();
    }
    return this.get(id);
  }

  splatPath(id: string): string | null {
    return this.jobs.get(id)?.state === 'ready' ? path.join(this.dirOf(id), SPLAT) : null;
  }

  /** Resolves once nothing is building or waiting. */
  async settled(): Promise<void> {
    while (this.current) await this.building;
  }

  private dirOf(id: string): string {
    return path.join(this.root, id);
  }

  private async save(job: JobRecord): Promise<void> {
    await writeFile(path.join(this.dirOf(job.id), RECORD), JSON.stringify(job, null, 2));
  }

  private async finish(job: JobRecord, state: Outcome['state'], code?: JobErrorCode): Promise<void> {
    job.state = state;
    if (code) job.error = { code, message: JOB_ERROR_MESSAGES[code] };
    this.progress.delete(job.id);
    // A record that can't be written is still reported from memory until the server stops.
    await this.save(job).catch((error) => console.error(`Couldn't save job ${job.id}:`, error));
  }

  private pump(): void {
    if (this.current) return;
    const id = this.waiting.shift();
    if (!id) return;
    this.current = { id, step: null, canceled: false };
    this.building = this.build(this.jobs.get(id)!).finally(() => {
      this.current = null;
      this.pump();
    });
  }

  private async build(job: JobRecord): Promise<void> {
    let outcome: Outcome;
    try {
      outcome = await this.runSteps(job);
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      outcome = { state: 'failed', code: 'step-failed' };
    }
    await this.finish(job, outcome.state, outcome.code);
  }

  private async runSteps(job: JobRecord): Promise<Outcome> {
    const dir = this.dirOf(job.id);
    const current = this.current!;
    const totalSteps = SETTINGS[job.quality].steps;
    let frames = 0;
    for (const step of pipelineSteps(job.quality, job.videoName)) {
      if (job.state !== step.state) {
        job.state = step.state;
        this.progress.delete(job.id);
        await this.save(job);
      }
      // After the save: a cancel that arrived during it found no step to kill, so it must stop the job here.
      if (current.canceled) return { state: 'canceled' };
      const output: string[] = [];
      const running = this.run(job.id, dir, step, (line) => {
        if (step.name === 'probe') output.push(line);
        const progress = stepProgress(step.name, line, frames, totalSteps);
        if (progress) this.progress.set(job.id, progress);
      });
      current.step = running;
      const code = await running.done.catch(() => -1);
      current.step = null;
      if (current.canceled) return { state: 'canceled' };
      switch (step.name) {
        case 'probe': {
          const probe = code === 0 ? readProbe(output.join('\n')) : ({ ok: false, code: 'not-video' } as const);
          if (!probe.ok) return { state: 'failed', code: probe.code };
          break;
        }
        case 'frames':
          frames = code === 0 ? await countFrames(dir) : 0;
          if (frames === 0) return { state: 'failed', code: 'not-video' };
          break;
        case 'mapper':
          if (code !== 0 || (await registeredImages(dir)) < MIN_REGISTERED) return { state: 'failed', code: 'no-model' };
          break;
        case 'training':
          if (code !== 0 || !(await exists(path.join(dir, SPLAT)))) return { state: 'failed', code: 'training-failed' };
          break;
        default:
          if (code !== 0) return { state: 'failed', code: 'step-failed' };
      }
    }
    return { state: 'ready' };
  }
}
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/server/jobs.test.ts`
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 5: Commit**

```powershell
git add src/server/jobs.ts src/server/jobs.test.ts
git commit -m "feat: the laptop's build queue: one video at a time through the pipeline, cancel, and jobs that survive a restart" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/server/jobs.ts src/server/jobs.test.ts
```

---

### Task 4: Docker step runner and pipeline health

**Files:**
- Create: `src/server/runner.ts`
- Test: `src/server/runner.test.ts`

**Interfaces:**
- Consumes: `StepRunner` (Task 3), `PipelineStep` and `pipelineSteps` (Task 2), `PipelineHealth` (Task 2).
- Produces:
  ```ts
  IMAGE = 'room-remix-splat'
  dockerArgs(jobId: string, dir: string, step: PipelineStep): string[]
  lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void }
  dockerRunner(spawnFn?: (command: string, args: string[]) => ChildProcess): StepRunner
  pipelineHealth(exec?: (command: string, args: string[]) => Promise<number>): Promise<PipelineHealth>
  ```

- [ ] **Step 1: Write the failing tests**

`src/server/runner.test.ts`:

```ts
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pipelineSteps } from '@/lib/splatJobs/settings';
import { dockerArgs, dockerRunner, IMAGE, lineSplitter, pipelineHealth } from './runner';

const steps = pipelineSteps('quick', 'video.mp4');
const probe = steps[0];
const training = steps[5];

const fakeChild = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
const asChild = (child: ReturnType<typeof fakeChild>) => child as unknown as ChildProcess;
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('dockerArgs', () => {
  it('runs a step in the pipeline image with the job folder at /job, named so it can be killed', () => {
    expect(dockerArgs('abc', 'C:\\jobs\\abc', probe)).toEqual([
      'run', '--rm', '--name', 'rr-abc-probe', '-v', 'C:\\jobs\\abc:/job', IMAGE, ...probe.args,
    ]);
  });

  it('gives OpenSplat the GPU', () => {
    expect(dockerArgs('abc', '/jobs/abc', training).slice(0, 6)).toEqual(['run', '--rm', '--gpus', 'all', '--name', 'rr-abc-training']);
  });
});

describe('lineSplitter', () => {
  it('splits on \\n, \\r\\n and \\r, across chunks, skips empty lines and flushes the rest at the end', () => {
    const lines: string[] = [];
    const split = lineSplitter((line) => lines.push(line));
    split.push('Step 1');
    split.push('0: 0.5\r\nStep 20: 0.4\rframe=  12\r');
    split.push('\n\nlast');
    split.end();
    expect(lines).toEqual(['Step 10: 0.5', 'Step 20: 0.4', 'frame=  12', 'last']);
  });
});

describe('dockerRunner', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'rr-runner-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true, maxRetries: 5 });
  });

  it('streams both outputs line by line, keeps a log and resolves with the exit code once the log is written', async () => {
    const spawned: { command: string; args: string[] }[] = [];
    const child = fakeChild();
    const run = dockerRunner((command, args) => {
      spawned.push({ command, args });
      return asChild(child);
    });
    const lines: string[] = [];
    const step = run('abc', dir, training, (line) => lines.push(line));
    child.stdout.write('Using CUDA\nStep 10: 0.2 [0%]\n');
    child.stderr.write('warning: slow\n');
    await tick();
    child.emit('close', 0);
    expect(await step.done).toBe(0);
    expect(spawned).toEqual([{ command: 'docker', args: dockerArgs('abc', dir, training) }]);
    expect(lines).toEqual(expect.arrayContaining(['Using CUDA', 'Step 10: 0.2 [0%]', 'warning: slow']));
    const log = await readFile(path.join(dir, 'logs', 'training.log'), 'utf8');
    expect(log).toContain('Step 10: 0.2 [0%]');
    expect(log).toContain('warning: slow');
  });

  it('kills a step by killing its container', () => {
    const spawned: string[][] = [];
    const run = dockerRunner((_command, args) => {
      spawned.push(args);
      return asChild(fakeChild());
    });
    run('abc', dir, training, () => {}).kill();
    expect(spawned[1]).toEqual(['kill', 'rr-abc-training']);
  });

  it('resolves -1 when docker cannot be started, and ignores a close after that', async () => {
    const child = fakeChild();
    const step = dockerRunner(() => asChild(child))('abc', dir, probe, () => {});
    child.emit('error', new Error('spawn docker ENOENT'));
    child.emit('close', null);
    expect(await step.done).toBe(-1);
    expect(await readFile(path.join(dir, 'logs', 'probe.log'), 'utf8')).toContain('ENOENT');
  });
});

describe('pipelineHealth', () => {
  it('needs Docker running and the pipeline image built', async () => {
    const exec = (codes: Record<string, number>) => async (_command: string, args: string[]) => codes[args[0]] ?? 0;
    expect(await pipelineHealth(exec({ info: 1 }))).toBe('no-docker');
    expect(await pipelineHealth(exec({ image: 1 }))).toBe('no-image');
    expect(await pipelineHealth(exec({}))).toBe('ready');
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/server/runner.test.ts`
Expected: FAIL, because `./runner` doesn't exist.

- [ ] **Step 3: Write `src/server/runner.ts`**

```ts
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { PipelineHealth } from '@/lib/splatJobs/protocol';
import type { PipelineStep } from '@/lib/splatJobs/settings';
import type { StepRunner } from './jobs';

/** Built by `npm run pipeline:build` from pipeline/Dockerfile. */
export const IMAGE = 'room-remix-splat';

const containerName = (jobId: string, step: PipelineStep) => `rr-${jobId}-${step.name}`;

/** `docker` arguments that run one step with its job folder mounted at /job. Only OpenSplat gets the GPU. */
export function dockerArgs(jobId: string, dir: string, step: PipelineStep): string[] {
  return [
    'run', '--rm',
    ...(step.gpu ? ['--gpus', 'all'] : []),
    '--name', containerName(jobId, step),
    '-v', `${dir}:/job`,
    IMAGE,
    ...step.args,
  ];
}

/** Splits streamed text into lines on \n, \r\n or \r (ffmpeg and COLMAP redraw progress with \r). Empty lines are skipped. */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = '';
  return {
    push(chunk) {
      const parts = (rest + chunk).split(/\r\n|\r|\n/);
      rest = parts.pop() ?? '';
      for (const part of parts) if (part) onLine(part);
    },
    end() {
      if (rest) onLine(rest);
      rest = '';
    },
  };
}

type Spawn = (command: string, args: string[]) => ChildProcess;
const spawnHidden: Spawn = (command, args) => spawn(command, args, { windowsHide: true });

/** Runs each step as its own `docker run`, writing everything it prints to logs/<step>.log in the job folder. */
export function dockerRunner(spawnFn: Spawn = spawnHidden): StepRunner {
  return (jobId, dir, step, onLine) => {
    mkdirSync(path.join(dir, 'logs'), { recursive: true });
    const log = createWriteStream(path.join(dir, 'logs', `${step.name}.log`));
    const child = spawnFn('docker', dockerArgs(jobId, dir, step));
    const out = lineSplitter(onLine);
    const err = lineSplitter(onLine);
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      log.write(chunk);
      out.push(chunk);
    });
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      log.write(chunk);
      err.push(chunk);
    });
    const done = new Promise<number>((resolve) => {
      let ended = false;
      const end = (code: number, note?: string) => {
        if (ended) return;
        ended = true;
        out.end();
        err.end();
        if (note) log.end(note, () => resolve(code));
        else log.end(() => resolve(code));
      };
      child.on('error', (error) => end(-1, `\n${String(error)}\n`));
      child.on('close', (code: number | null) => end(code ?? -1));
    });
    return {
      done,
      // Killing the docker CLI alone can leave the container running: kill the container by name.
      kill: () => {
        spawnFn('docker', ['kill', containerName(jobId, step)]).on('error', () => {});
      },
    };
  };
}

type Exec = (command: string, args: string[]) => Promise<number>;
const exitCode: Exec = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { windowsHide: true, timeout: 15_000 }, (error) => resolve(error ? 1 : 0));
  });

/** Whether the laptop can build: Docker is running and the pipeline image exists. */
export async function pipelineHealth(exec: Exec = exitCode): Promise<PipelineHealth> {
  if ((await exec('docker', ['info'])) !== 0) return 'no-docker';
  if ((await exec('docker', ['image', 'inspect', IMAGE])) !== 0) return 'no-image';
  return 'ready';
}
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/server/runner.test.ts`
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 5: Commit**

```powershell
git add src/server/runner.ts src/server/runner.test.ts
git commit -m "feat: run each pipeline step in Docker with a log per step, kill by container, and check the laptop can build" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/server/runner.ts src/server/runner.test.ts
```

---

### Task 5: Demo server

**Files:**
- Create: `src/server/server.ts`, `src/server/main.ts`
- Test: `src/server/server.test.ts`
- Modify: `package.json` (tsx dev dependency; scripts `demo`, `demo:serve`), `README.md` (a "Hackathon demo" section)

**Interfaces:**
- Consumes: `JobQueue` (Task 3), `dockerRunner` and `pipelineHealth` (Task 4), protocol (Task 2).
- Produces:
  ```ts
  interface Jobs { reserve(); discard(id); add(id, quality, videoName); get(id); cancel(id); splatPath(id) }  // JobQueue satisfies it
  createServer(options: { jobs: Jobs; health: () => Promise<PipelineHealth>; staticDir: string; maxBytes?: number }): http.Server
  ```
  HTTP API (spec §5):
  - `GET /api/splat/health` → `{ pipeline }`
  - `POST /api/splat/jobs?quality=quick|best` (raw `video/*` body) → 201 `JobView`; 400 bad quality; 413 too large; 415 not a video or empty
  - `GET /api/splat/jobs/:id` → `JobView` | 404
  - `DELETE /api/splat/jobs/:id` → `JobView` | 404
  - `GET /api/splat/jobs/:id/splat` → the `.spz` bytes | 409 not ready | 404

- [ ] **Step 1: Write the failing tests**

`src/server/server.test.ts`:

```ts
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobView, Quality } from '@/lib/splatJobs/protocol';
import { createServer, type Jobs } from './server';

function fakeJobs(root: string) {
  const state = {
    reserved: 0,
    added: [] as { id: string; quality: Quality; videoName: string }[],
    discarded: [] as string[],
    canceled: [] as string[],
    views: new Map<string, JobView>(),
    splat: null as string | null,
  };
  const jobs: Jobs = {
    async reserve() {
      const id = `job${++state.reserved}`;
      const dir = path.join(root, id);
      await mkdir(dir, { recursive: true });
      return { id, dir };
    },
    async discard(id) {
      state.discarded.push(id);
    },
    async add(id, quality, videoName) {
      state.added.push({ id, quality, videoName });
      const view: JobView = { id, quality, state: 'queued', place: 0 };
      state.views.set(id, view);
      return view;
    },
    get: (id) => state.views.get(id) ?? null,
    async cancel(id) {
      state.canceled.push(id);
      const view = state.views.get(id);
      return view ? { ...view, state: 'canceled' } : null;
    },
    splatPath: (id) => (state.views.get(id)?.state === 'ready' ? state.splat : null),
  };
  return { jobs, state };
}

let tmp: string;
let server: http.Server;
let base: string;
let fake: ReturnType<typeof fakeJobs>;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'rr-server-'));
  const out = path.join(tmp, 'out');
  await mkdir(path.join(out, '_next', 'static'), { recursive: true });
  await writeFile(path.join(out, 'index.html'), '<p>landing</p>');
  await writeFile(path.join(out, 'room.html'), '<p>room</p>');
  await writeFile(path.join(out, '404.html'), '<p>missing</p>');
  await writeFile(path.join(out, '_next', 'static', 'app.js'), 'console.log(1)');
  await writeFile(path.join(tmp, 'secret.txt'), 'secret');
  fake = fakeJobs(path.join(tmp, 'jobs'));
  server = createServer({ jobs: fake.jobs, health: async () => 'no-image', staticDir: out, maxBytes: 64 });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

/** POSTs with chunked encoding (no Content-Length), as a phone streaming a big file would look. */
function postChunked(url: string, chunks: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

describe('static files', () => {
  it('serves the export: / as index.html, /room as room.html, assets with their type, unknown paths as 404.html', async () => {
    const landing = await fetch(`${base}/`);
    expect(landing.headers.get('content-type')).toContain('text/html');
    expect(await landing.text()).toBe('<p>landing</p>');
    expect(await (await fetch(`${base}/room`)).text()).toBe('<p>room</p>');
    const js = await fetch(`${base}/_next/static/app.js?v=1`);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    const missing = await fetch(`${base}/nowhere`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('<p>missing</p>');
  });

  it('never serves a file outside the export', async () => {
    for (const trick of ['/..%2fsecret.txt', '/..%5csecret.txt', '/%2e%2e/secret.txt', '/_next/..%2f..%2fsecret.txt']) {
      const res = await fetch(`${base}${trick}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('secret');
    }
  });

  it('allows a long upload: no request timeout', () => {
    expect(server.requestTimeout).toBe(0);
  });
});

describe('jobs API', () => {
  it('reports the pipeline health', async () => {
    const res = await fetch(`${base}/api/splat/health`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ pipeline: 'no-image' });
  });

  it('stores an uploaded video in a new job folder and queues it', async () => {
    const res = await fetch(`${base}/api/splat/jobs?quality=quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/quicktime' },
      body: 'moov-bytes',
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'job1', quality: 'quick', state: 'queued', place: 0 });
    expect(fake.state.added).toEqual([{ id: 'job1', quality: 'quick', videoName: 'video.mov' }]);
    expect(await readFile(path.join(tmp, 'jobs', 'job1', 'video.mov'), 'utf8')).toBe('moov-bytes');
  });

  it('refuses a bad quality, a non-video and an empty upload', async () => {
    const post = (query: string, type: string, body: string) =>
      fetch(`${base}/api/splat/jobs${query}`, { method: 'POST', headers: { 'Content-Type': type }, body });
    expect((await post('?quality=fast', 'video/mp4', 'x')).status).toBe(400);
    expect((await post('?quality=best', 'image/jpeg', 'x')).status).toBe(415);
    expect((await post('?quality=best', 'video/mp4', '')).status).toBe(415);
    expect(fake.state.added).toEqual([]);
    expect(fake.state.discarded).toEqual(['job1']); // only the empty upload got as far as a folder
  });

  it('refuses a video over the size limit, whether declared or streamed', async () => {
    const declared = await fetch(`${base}/api/splat/jobs?quality=quick`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4' },
      body: 'x'.repeat(100),
    });
    expect(declared.status).toBe(413);
    expect(await postChunked(`${base}/api/splat/jobs?quality=quick`, ['x'.repeat(50), 'x'.repeat(50)])).toBe(413);
    expect(fake.state.added).toEqual([]);
    expect(fake.state.discarded).toEqual(['job1']);
  });

  it('throws away the folder of an upload cut off midway, and queues nothing', async () => {
    const req = http.request(`${base}/api/splat/jobs?quality=best`, {
      method: 'POST',
      headers: { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' },
    });
    req.on('error', () => {}); // destroyed on purpose below
    req.write('partial');
    await vi.waitFor(() => expect(fake.state.reserved).toBe(1));
    req.destroy();
    await vi.waitFor(() => expect(fake.state.discarded).toEqual(['job1']));
    expect(fake.state.added).toEqual([]);
  });

  it('answers job status, cancels, and serves a ready splat', async () => {
    expect((await fetch(`${base}/api/splat/jobs/nope`)).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope`, { method: 'DELETE' })).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope/splat`)).status).toBe(404);
    fake.state.views.set('a', { id: 'a', quality: 'quick', state: 'training', progress: { done: 10, total: 2000 } });
    expect(await (await fetch(`${base}/api/splat/jobs/a`)).json()).toEqual({
      id: 'a', quality: 'quick', state: 'training', progress: { done: 10, total: 2000 },
    });
    expect((await fetch(`${base}/api/splat/jobs/a/splat`)).status).toBe(409);
    expect(await (await fetch(`${base}/api/splat/jobs/a`, { method: 'DELETE' })).json()).toMatchObject({ state: 'canceled' });
    expect(fake.state.canceled).toEqual(['a']);
    const splat = path.join(tmp, 'splat.spz');
    await writeFile(splat, 'SPZ!');
    fake.state.splat = splat;
    fake.state.views.set('a', { id: 'a', quality: 'quick', state: 'ready' });
    const res = await fetch(`${base}/api/splat/jobs/a/splat`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/octet-stream');
    expect(await res.text()).toBe('SPZ!');
  });

  it('answers unknown API paths and methods with 404 JSON', async () => {
    const res = await fetch(`${base}/api/splat/nothing`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not-found' });
    expect((await fetch(`${base}/api/splat/health`, { method: 'POST' })).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/server/server.test.ts`
Expected: FAIL, because `./server` doesn't exist.

- [ ] **Step 3: Write `src/server/server.ts`**

```ts
import { createReadStream, createWriteStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { isQuality, MAX_VIDEO_BYTES, type JobView, type PipelineHealth, type Quality } from '@/lib/splatJobs/protocol';

/** What the server needs from the job queue (JobQueue satisfies it). */
export interface Jobs {
  reserve(): Promise<{ id: string; dir: string }>;
  discard(id: string): Promise<void>;
  add(id: string, quality: Quality, videoName: string): Promise<JobView>;
  get(id: string): JobView | null;
  cancel(id: string): Promise<JobView | null>;
  splatPath(id: string): string | null;
}

export type ServerOptions = {
  jobs: Jobs;
  health: () => Promise<PipelineHealth>;
  /** The static export (out/). */
  staticDir: string;
  maxBytes?: number;
};

const VIDEO_EXT: Record<string, string> = {
  'video/quicktime': 'mov',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/3gpp': '3gp',
};

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

type Req = http.IncomingMessage;
type Res = http.ServerResponse;

function sendJson(res: Res, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

/** The demo server (spec 2026-10-06 §3, §5): the static export plus the /api/splat jobs API. */
export function createServer({ jobs, health, staticDir, maxBytes = MAX_VIDEO_BYTES }: ServerOptions): http.Server {
  const root = path.resolve(staticDir);

  async function upload(req: Req, res: Res, quality: string | null): Promise<void> {
    if (!isQuality(quality)) {
      req.resume();
      return sendJson(res, 400, { error: 'quality' });
    }
    const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    const declared = Number(req.headers['content-length']);
    if (!type.startsWith('video/') || (Number.isFinite(declared) && declared > maxBytes)) {
      res.setHeader('Connection', 'close'); // don't wait for a body we're refusing
      req.resume();
      return sendJson(res, type.startsWith('video/') ? 413 : 415, { error: type.startsWith('video/') ? 'too-large' : 'not-video' });
    }
    const { id, dir } = await jobs.reserve();
    const videoName = `video.${VIDEO_EXT[type] ?? 'video'}`;
    let received = 0;
    // Past the limit, keep reading (so the phone gets its 413) but stop writing.
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        callback(null, received > maxBytes ? undefined : chunk);
      },
    });
    try {
      await pipeline(req, counter, createWriteStream(path.join(dir, videoName)));
    } catch {
      await jobs.discard(id); // cut off midway: nobody is left to answer
      if (!res.headersSent) res.destroy();
      return;
    }
    if (received > maxBytes) {
      await jobs.discard(id);
      return sendJson(res, 413, { error: 'too-large' });
    }
    if (received === 0) {
      await jobs.discard(id);
      return sendJson(res, 415, { error: 'not-video' });
    }
    return sendJson(res, 201, await jobs.add(id, quality, videoName));
  }

  async function sendSplat(res: Res, id: string): Promise<void> {
    if (!jobs.get(id)) return sendJson(res, 404, { error: 'not-found' });
    const file = jobs.splatPath(id);
    if (!file) return sendJson(res, 409, { error: 'not-ready' });
    const info = await stat(file);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    await pipeline(createReadStream(file), res);
  }

  async function api(req: Req, res: Res, url: URL, parts: string[]): Promise<void> {
    const [, resource, id, sub] = parts; // parts[0] is 'splat'
    const method = req.method ?? 'GET';
    if (resource === 'health' && !id && method === 'GET') return sendJson(res, 200, { pipeline: await health() });
    if (resource === 'jobs' && !id && method === 'POST') return upload(req, res, url.searchParams.get('quality'));
    if (resource === 'jobs' && id && !sub && method === 'GET') {
      const job = jobs.get(id);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'not-found' });
    }
    if (resource === 'jobs' && id && !sub && method === 'DELETE') {
      const job = await jobs.cancel(id);
      return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: 'not-found' });
    }
    if (resource === 'jobs' && id && sub === 'splat' && method === 'GET') return sendSplat(res, id);
    req.resume();
    return sendJson(res, 404, { error: 'not-found' });
  }

  async function sendFile(req: Req, res: Res, file: string, status: number, size: number): Promise<void> {
    res.writeHead(status, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') return void res.end();
    await pipeline(createReadStream(file), res);
  }

  async function notFound(req: Req, res: Res): Promise<void> {
    const page = path.join(root, '404.html');
    const info = await stat(page).catch(() => null);
    if (info?.isFile()) return sendFile(req, res, page, 404, info.size);
    res.writeHead(404);
    res.end();
  }

  /** Files from the export only: /room is room.html, a folder is its index.html. Anything resolving outside is a 404. */
  async function serveStatic(req: Req, res: Res, pathname: string): Promise<void> {
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return notFound(req, res);
    }
    const candidates = decoded.endsWith('/') ? [`${decoded}index.html`] : [decoded, `${decoded}.html`, `${decoded}/index.html`];
    for (const candidate of candidates) {
      const file = path.resolve(root, `.${candidate}`);
      if (file !== root && !file.startsWith(root + path.sep)) return notFound(req, res);
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) return sendFile(req, res, file, 200, info.size);
    }
    return notFound(req, res);
  }

  async function handle(req: Req, res: Res): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') {
      if (parts[1] !== 'splat') {
        req.resume();
        return sendJson(res, 404, { error: 'not-found' });
      }
      return api(req, res, url, parts.slice(1));
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      req.resume();
      res.writeHead(405);
      return void res.end();
    }
    return serveStatic(req, res, url.pathname);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      console.error(error);
      if (!res.headersSent) sendJson(res, 500, { error: 'server' });
      else res.destroy();
    });
  });
  server.requestTimeout = 0; // a phone uploading a large video over Wi-Fi can take longer than Node's 5-minute default
  return server;
}
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/server/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `src/server/main.ts`**

```ts
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JobQueue } from './jobs';
import { dockerRunner, pipelineHealth } from './runner';
import { createServer } from './server';

/** Spec 2026-10-06 §3: job folders live outside the repo, which is in OneDrive. */
const JOBS_DIR =
  process.env.ROOM_REMIX_JOBS_DIR ?? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share'), 'RoomRemix', 'jobs');
const PORT = Number(process.env.PORT ?? 8080);
const STATIC_DIR = path.resolve('out');

const NOT_READY = {
  'no-docker': "Docker isn't running. Start Docker Desktop, then reload the page on the phone.",
  'no-image': 'The pipeline image is missing. Run npm run pipeline:build, then reload the page on the phone.',
};

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const address of list ?? []) if (address.family === 'IPv4' && !address.internal) addresses.push(address.address);
  }
  return addresses;
}

async function main(): Promise<void> {
  if (!existsSync(path.join(STATIC_DIR, 'index.html'))) {
    console.error('There is no built app in out/. Run npm run demo, which builds it first.');
    process.exit(1);
  }
  const queue = new JobQueue(JOBS_DIR, dockerRunner());
  await queue.init();
  const server = createServer({ jobs: queue, health: pipelineHealth, staticDir: STATIC_DIR });
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Room Remix demo server. Job folders: ${JOBS_DIR}`);
    for (const address of lanAddresses()) console.log(`  On a phone on this Wi-Fi: http://${address}:${PORT}`);
    console.log(`  On this laptop:           http://localhost:${PORT}`);
    void pipelineHealth().then((health) =>
      console.log(health === 'ready' ? 'Scan builder ready.' : `Scan builder not ready: ${NOT_READY[health]}`),
    );
  });
}

void main();
```

- [ ] **Step 6: Add tsx and the scripts**

Run: `npm install --save-dev tsx`

In `package.json` `"scripts"`, add:

```json
    "demo": "next build && tsx src/server/main.ts",
    "demo:serve": "tsx src/server/main.ts",
```

- [ ] **Step 7: Add the README section**

Append to `README.md`:

```markdown
## Hackathon demo: rooms from video

Phones on the laptop's Wi-Fi can film a room and get it back as a Gaussian splat in the 3D view. The laptop builds it
with ffmpeg, COLMAP and OpenSplat in Docker (design: `docs/superpowers/specs/2026-10-06-room-remix-video-splats-design.md`).

1. Start Docker Desktop.
2. `npm run pipeline:build` (first time only; roughly 30–60 minutes).
3. `npm run pipeline:check` (prints the GPU and each tool's version).
4. `npm run demo`, and allow Node through Windows Firewall on private networks when asked. The Wi-Fi network must be
   set to Private.
5. Open the printed `http://<laptop address>:8080` on the phone.

`npm run demo:serve` restarts the server without rebuilding the app. Job folders (video, frames, COLMAP model, splat,
logs) are kept in `%LOCALAPPDATA%\RoomRemix\jobs`; set `ROOM_REMIX_JOBS_DIR` or `PORT` to change where and which port.
```

- [ ] **Step 8: Smoke test the server**

Run `npm run demo` in the background, then:

```powershell
curl.exe -s http://localhost:8080/api/splat/health
curl.exe -s -o NUL -w "%{http_code}" http://localhost:8080/
```
Expected:
- The first command prints `{"pipeline":"…"}`: `no-image` while Task 1's build is still running, or `ready` once it's done.
- The second prints `200`.

Stop the server afterwards.

- [ ] **Step 9: Run everything and commit**

Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`; all must pass.

```powershell
git add src/server/server.ts src/server/server.test.ts src/server/main.ts package.json package-lock.json README.md
git commit -m "feat: the demo server: the app and a jobs API on the laptop's Wi-Fi address, started with npm run demo" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/server/server.ts src/server/server.test.ts src/server/main.ts package.json package-lock.json README.md
```

---

### Task 6: Phone client

**Files:**
- Create: `src/lib/splatJobs/client.ts`, `src/lib/splatJobs/remembered.ts`, `src/lib/splatJobs/panel.ts`
- Test: `src/lib/splatJobs/client.test.ts`, `src/lib/splatJobs/remembered.test.ts`, `src/lib/splatJobs/panel.test.ts`

**Interfaces:**
- Consumes: protocol (Task 2). The HTTP API (Task 5).
- Produces:
  ```ts
  // client.ts
  API = '/api/splat'
  type Fetch = (input: string, init?: RequestInit) => Promise<Response>
  interface Xhr { open; setRequestHeader; send; abort; status; responseText; upload: { onprogress }; onload; onerror; onabort }
  type UploadFailure = 'too-large' | 'not-video' | 'stopped' | 'aborted'
  type UploadResult = { ok: true; job: JobView } | { ok: false; reason: UploadFailure }
  type JobPoll = { kind: 'job'; job: JobView } | { kind: 'gone' } | { kind: 'offline' }
  fetchHealth(fetchFn?: Fetch): Promise<Health | null>
  uploadVideo(file: File, quality: Quality, onProgress: (fraction: number) => void, makeXhr?: () => Xhr): { done: Promise<UploadResult>; abort(): void }
  fetchJob(id: string, fetchFn?: Fetch): Promise<JobPoll>
  cancelJob(id: string, fetchFn?: Fetch): Promise<void>
  downloadSplat(id: string, fetchFn?: Fetch): Promise<File>   // named 'video-scan.spz'
  // remembered.ts
  rememberJob(roomId: string, jobId: string): void;  recallJob(roomId: string): string | null;  forgetJob(roomId: string): void
  // panel.ts
  type VideoScanState = { kind: 'idle' } | { kind: 'uploading'; fraction: number } | { kind: 'building'; job: JobView; offline: boolean } | { kind: 'downloading' } | { kind: 'failed'; message: string; retry?: boolean }
  KEEP_SCREEN_ON, LOST_CONTACT, GONE, NOT_RUNNING, DOWNLOAD_FAILED: string;  POLL_MS = 2000;  OFFLINE_POLL_MS = 5000
  uploadFailMessage(reason: Exclude<UploadFailure, 'aborted'>): string
  jobLine(job: JobView): string
  jobFraction(job: JobView): number | null
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/splatJobs/client.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { cancelJob, downloadSplat, fetchHealth, fetchJob, uploadVideo, type Xhr } from './client';
import { MAX_VIDEO_BYTES, type JobView } from './protocol';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class FakeXhr implements Xhr {
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: Blob | null = null;
  status = 0;
  responseText = '';
  upload: Xhr['upload'] = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: Blob) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
  }
}

const video = (type = 'video/quicktime') => new File([new Uint8Array([1, 2, 3])], 'IMG_0001.MOV', { type });
const queuedJob: JobView = { id: 'j1', quality: 'quick', state: 'queued', place: 0 };

describe('fetchHealth', () => {
  it('reads the pipeline state from the demo server', async () => {
    const fetchFn = vi.fn(async () => json({ pipeline: 'no-image' }));
    expect(await fetchHealth(fetchFn)).toEqual({ pipeline: 'no-image' });
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/health', expect.objectContaining({ cache: 'no-store' }));
  });

  it('is null where the page is not served by the demo server', async () => {
    expect(await fetchHealth(async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }))).toBeNull();
    expect(await fetchHealth(async () => new Response('missing', { status: 404 }))).toBeNull();
    expect(await fetchHealth(async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
    expect(await fetchHealth(async () => json({ pipeline: 'maybe' }))).toBeNull();
  });
});

describe('uploadVideo', () => {
  it('posts the raw video with its type to the quality URL and reports progress', async () => {
    const xhr = new FakeXhr();
    const progress: number[] = [];
    const file = video();
    const upload = uploadVideo(file, 'best', (fraction) => progress.push(fraction), () => xhr);
    expect([xhr.method, xhr.url, xhr.headers['Content-Type'], xhr.body]).toEqual(['POST', '/api/splat/jobs?quality=best', 'video/quicktime', file]);
    xhr.upload.onprogress?.({ loaded: 25, total: 100, lengthComputable: true });
    xhr.upload.onprogress?.({ loaded: 5, total: 0, lengthComputable: false });
    xhr.respond(201, queuedJob);
    expect(await upload.done).toEqual({ ok: true, job: queuedJob });
    expect(progress).toEqual([0.25]);
  });

  it('sends a file with no type as video/mp4 and lets the laptop decide', () => {
    const xhr = new FakeXhr();
    uploadVideo(video(''), 'quick', () => {}, () => xhr);
    expect(xhr.headers['Content-Type']).toBe('video/mp4');
  });

  it('refuses a file over 1 GB, or one that is not a video, without sending it', async () => {
    const big = video();
    Object.defineProperty(big, 'size', { value: MAX_VIDEO_BYTES + 1 });
    const makeXhr = vi.fn(() => new FakeXhr());
    expect(await uploadVideo(big, 'quick', () => {}, makeXhr).done).toEqual({ ok: false, reason: 'too-large' });
    expect(await uploadVideo(video('image/png'), 'quick', () => {}, makeXhr).done).toEqual({ ok: false, reason: 'not-video' });
    expect(makeXhr).not.toHaveBeenCalled();
  });

  it('tells the server refusals apart', async () => {
    const result = async (status: number) => {
      const xhr = new FakeXhr();
      const upload = uploadVideo(video(), 'quick', () => {}, () => xhr);
      xhr.respond(status, { error: 'x' });
      return upload.done;
    };
    expect(await result(413)).toEqual({ ok: false, reason: 'too-large' });
    expect(await result(415)).toEqual({ ok: false, reason: 'not-video' });
    expect(await result(500)).toEqual({ ok: false, reason: 'stopped' });
  });

  it('reports a dropped connection as stopped and Cancel as aborted', async () => {
    const dropped = new FakeXhr();
    const first = uploadVideo(video(), 'quick', () => {}, () => dropped);
    dropped.onerror?.();
    expect(await first.done).toEqual({ ok: false, reason: 'stopped' });
    const canceled = new FakeXhr();
    const second = uploadVideo(video(), 'quick', () => {}, () => canceled);
    second.abort();
    expect(await second.done).toEqual({ ok: false, reason: 'aborted' });
  });
});

describe('fetchJob', () => {
  it('passes the job through, including a job failed by a laptop restart', async () => {
    const failed: JobView = { id: 'j1', quality: 'quick', state: 'failed', error: { code: 'restarted', message: 'The laptop restarted while building. Start again.' } };
    const fetchFn = vi.fn(async () => json(failed));
    expect(await fetchJob('j1', fetchFn)).toEqual({ kind: 'job', job: failed });
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j1', expect.objectContaining({ cache: 'no-store' }));
  });

  it('is gone on 404 and offline when the laptop cannot be reached', async () => {
    expect(await fetchJob('j1', async () => json({ error: 'not-found' }, 404))).toEqual({ kind: 'gone' });
    expect(await fetchJob('j1', async () => json({ error: 'server' }, 500))).toEqual({ kind: 'offline' });
    expect(await fetchJob('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).toEqual({ kind: 'offline' });
  });
});

describe('cancelJob and downloadSplat', () => {
  it('cancels with DELETE, and shrugs off a laptop that is gone', async () => {
    const fetchFn = vi.fn(async () => json(queuedJob));
    await cancelJob('j 1', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j%201', { method: 'DELETE' });
    await expect(cancelJob('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).resolves.toBeUndefined();
  });

  it('downloads the splat as a .spz file for the scan loader, and throws when it is not there', async () => {
    const file = await downloadSplat('j1', async () => new Response(new Uint8Array([83, 80, 90])));
    expect(file.name).toBe('video-scan.spz');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([83, 80, 90]));
    await expect(downloadSplat('j1', async () => json({ error: 'not-ready' }, 409))).rejects.toThrow();
  });
});
```

`src/lib/splatJobs/remembered.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetJob, recallJob, rememberJob } from './remembered';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remembered builds', () => {
  it('keeps one build per room', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    rememberJob('room-a', 'job-1');
    rememberJob('room-b', 'job-2');
    expect(recallJob('room-a')).toBe('job-1');
    expect(store.get('room-remix:video-scan:room-b')).toBe('job-2');
    forgetJob('room-a');
    expect(recallJob('room-a')).toBeNull();
    expect(recallJob('room-b')).toBe('job-2');
  });

  it('never throws when storage is blocked or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberJob('room-a', 'job-1')).not.toThrow();
    expect(recallJob('room-a')).toBeNull();
    expect(() => forgetJob('room-a')).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(recallJob('room-a')).toBeNull();
  });
});
```

`src/lib/splatJobs/panel.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { jobFraction, jobLine, uploadFailMessage } from './panel';
import type { JobView } from './protocol';

const job = (fields: Partial<JobView>): JobView => ({ id: 'j1', quality: 'quick', state: 'queued', ...fields });

describe('jobLine', () => {
  it('says where the build is, in the spec words', () => {
    expect(jobLine(job({ state: 'queued', place: 1 }))).toBe('Waiting for the room before yours');
    expect(jobLine(job({ state: 'queued', place: 2 }))).toBe('Waiting for the 2 rooms before yours');
    expect(jobLine(job({ state: 'queued', place: 0 }))).toBe('Starting…');
    expect(jobLine(job({ state: 'checking' }))).toBe('Checking the video');
    expect(jobLine(job({ state: 'frames' }))).toBe('Pulling frames');
    expect(jobLine(job({ state: 'cameras' }))).toBe('Finding camera positions');
    expect(jobLine(job({ state: 'training', progress: { done: 1200, total: 2000 } }))).toBe('Building your room, step 1,200 of 2,000');
    expect(jobLine(job({ state: 'training' }))).toBe('Building your room');
  });

  it('shows the error message of a failed build', () => {
    expect(jobLine(job({ state: 'failed', error: { code: 'training-failed', message: 'Building the room failed. Try Quick.' } }))).toBe(
      'Building the room failed. Try Quick.',
    );
  });
});

describe('jobFraction', () => {
  it('is the share done, clamped, or null where a step has no measure', () => {
    expect(jobFraction(job({ state: 'training', progress: { done: 500, total: 2000 } }))).toBe(0.25);
    expect(jobFraction(job({ state: 'cameras', progress: { done: 90, total: 80 } }))).toBe(1);
    expect(jobFraction(job({ state: 'frames' }))).toBeNull();
    expect(jobFraction(job({ state: 'training', progress: { done: 0, total: 0 } }))).toBeNull();
  });
});

describe('uploadFailMessage', () => {
  it('uses the spec words', () => {
    expect(uploadFailMessage('stopped')).toBe('The upload stopped. Try again with the screen on.');
    expect(uploadFailMessage('too-large')).toBe('This video is too large.');
    expect(uploadFailMessage('not-video')).toBe("This file isn't a video we can read.");
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/lib/splatJobs`
Expected: FAIL. Tasks 2's tests still pass; the three new files are missing.

- [ ] **Step 3: Write `src/lib/splatJobs/client.ts`**

```ts
import { MAX_VIDEO_BYTES, type Health, type JobView, type Quality } from './protocol';

/** Same origin: the demo server serves both the app and this API (spec 2026-10-06 §5). */
export const API = '/api/splat';

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
const browserFetch: Fetch = (input, init) => fetch(input, init);

type ProgressLike = { loaded: number; total: number; lengthComputable: boolean };
/** The part of XMLHttpRequest an upload uses (fetch can't report upload progress). */
export interface Xhr {
  open(method: string, url: string): void;
  setRequestHeader(name: string, value: string): void;
  send(body: Blob): void;
  abort(): void;
  readonly status: number;
  readonly responseText: string;
  upload: { onprogress: ((event: ProgressLike) => void) | null };
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
}
// The DOM's handler types take `this` and a full ProgressEvent, so the real thing needs a cast to this narrower shape.
const browserXhr = () => new XMLHttpRequest() as unknown as Xhr;

export type UploadFailure = 'too-large' | 'not-video' | 'stopped' | 'aborted';
export type UploadResult = { ok: true; job: JobView } | { ok: false; reason: UploadFailure };
export type JobPoll = { kind: 'job'; job: JobView } | { kind: 'gone' } | { kind: 'offline' };

const jobUrl = (id: string) => `${API}/jobs/${encodeURIComponent(id)}`;

/** The demo server's health, or null where this page isn't served by it (no server, `next dev`, a static host). */
export async function fetchHealth(fetchFn: Fetch = browserFetch): Promise<Health | null> {
  try {
    const res = await fetchFn(`${API}/health`, { cache: 'no-store' });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('application/json')) return null;
    const { pipeline } = (await res.json()) as Partial<Health>;
    return pipeline === 'ready' || pipeline === 'no-docker' || pipeline === 'no-image' ? { pipeline } : null;
  } catch {
    return null;
  }
}

/** Sends the video as the raw request body. `onProgress` gets the share sent, 0..1. */
export function uploadVideo(
  file: File,
  quality: Quality,
  onProgress: (fraction: number) => void,
  makeXhr: () => Xhr = browserXhr,
): { done: Promise<UploadResult>; abort(): void } {
  const type = file.type || 'video/mp4'; // no type: let the laptop's ffprobe decide
  if (file.size > MAX_VIDEO_BYTES) return { done: Promise.resolve({ ok: false, reason: 'too-large' }), abort: () => {} };
  if (!type.startsWith('video/')) return { done: Promise.resolve({ ok: false, reason: 'not-video' }), abort: () => {} };
  const xhr = makeXhr();
  const done = new Promise<UploadResult>((resolve) => {
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve({ ok: true, job: JSON.parse(xhr.responseText) as JobView });
        } catch {
          resolve({ ok: false, reason: 'stopped' });
        }
        return;
      }
      resolve({ ok: false, reason: xhr.status === 413 ? 'too-large' : xhr.status === 415 ? 'not-video' : 'stopped' });
    };
    xhr.onerror = () => resolve({ ok: false, reason: 'stopped' });
    xhr.onabort = () => resolve({ ok: false, reason: 'aborted' });
  });
  xhr.open('POST', `${API}/jobs?quality=${quality}`);
  xhr.setRequestHeader('Content-Type', type);
  xhr.send(file);
  return { done, abort: () => xhr.abort() };
}

export async function fetchJob(id: string, fetchFn: Fetch = browserFetch): Promise<JobPoll> {
  try {
    const res = await fetchFn(jobUrl(id), { cache: 'no-store' });
    if (res.status === 404) return { kind: 'gone' };
    if (!res.ok) return { kind: 'offline' };
    return { kind: 'job', job: (await res.json()) as JobView };
  } catch {
    return { kind: 'offline' };
  }
}

export async function cancelJob(id: string, fetchFn: Fetch = browserFetch): Promise<void> {
  try {
    await fetchFn(jobUrl(id), { method: 'DELETE' });
  } catch {
    // the laptop may be gone; the phone forgets the build either way
  }
}

/** The finished splat, as a File the scan loader reads like any exported .spz. */
export async function downloadSplat(id: string, fetchFn: Fetch = browserFetch): Promise<File> {
  const res = await fetchFn(`${jobUrl(id)}/splat`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't download the splat: ${res.status}`);
  return new File([await res.blob()], 'video-scan.spz', { type: 'application/octet-stream' });
}
```

- [ ] **Step 4: Write `src/lib/splatJobs/remembered.ts`**

```ts
/** The build each room is waiting for, kept in localStorage so a reload (or coming back to the room) picks it up again. */
const key = (roomId: string) => `room-remix:video-scan:${roomId}`;

export function rememberJob(roomId: string, jobId: string): void {
  try {
    localStorage.setItem(key(roomId), jobId);
  } catch {
    // not remembered: a reload loses track of this build, which still finishes on the laptop
  }
}

export function recallJob(roomId: string): string | null {
  try {
    return localStorage.getItem(key(roomId));
  } catch {
    return null;
  }
}

export function forgetJob(roomId: string): void {
  try {
    localStorage.removeItem(key(roomId));
  } catch {
    // nothing to forget
  }
}
```

- [ ] **Step 5: Write `src/lib/splatJobs/panel.ts`**

```ts
import type { UploadFailure } from './client';
import type { JobView } from './protocol';

/** What the phone shows for a room's video scan (spec 2026-10-06 §6). */
export type VideoScanState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'building'; job: JobView; offline: boolean }
  | { kind: 'downloading' }
  | { kind: 'failed'; message: string; retry?: boolean };

export const KEEP_SCREEN_ON = 'Keep your screen on until the upload finishes.';
export const LOST_CONTACT = 'Lost contact with the laptop. Trying again…';
export const GONE = 'This build is no longer on the laptop.';
export const NOT_RUNNING = "The laptop's scan builder isn't running.";
export const DOWNLOAD_FAILED = "Couldn't fetch the finished room from the laptop.";
export const POLL_MS = 2000;
export const OFFLINE_POLL_MS = 5000;

export function uploadFailMessage(reason: Exclude<UploadFailure, 'aborted'>): string {
  switch (reason) {
    case 'too-large':
      return 'This video is too large.';
    case 'not-video':
      return "This file isn't a video we can read.";
    case 'stopped':
      return 'The upload stopped. Try again with the screen on.';
  }
}

const count = (n: number) => n.toLocaleString('en-US');

/** The progress row's words for a build. */
export function jobLine(job: JobView): string {
  switch (job.state) {
    case 'queued':
      if (!job.place) return 'Starting…';
      return job.place === 1 ? 'Waiting for the room before yours' : `Waiting for the ${job.place} rooms before yours`;
    case 'checking':
      return 'Checking the video';
    case 'frames':
      return 'Pulling frames';
    case 'cameras':
      return 'Finding camera positions';
    case 'training':
      return job.progress ? `Building your room, step ${count(job.progress.done)} of ${count(job.progress.total)}` : 'Building your room';
    case 'ready':
      return 'Ready';
    case 'failed':
      return job.error?.message ?? 'Building the room failed.';
    case 'canceled':
      return 'Canceled';
  }
}

/** The progress bar's fill, 0..1, or null for a step with nothing to measure. */
export function jobFraction(job: JobView): number | null {
  if (!job.progress || job.progress.total <= 0) return null;
  return Math.min(1, Math.max(0, job.progress.done / job.progress.total));
}
```

- [ ] **Step 6: Run the tests to check they pass**

Run: `npx vitest run src/lib/splatJobs`
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/splatJobs/client.ts src/lib/splatJobs/client.test.ts src/lib/splatJobs/remembered.ts src/lib/splatJobs/remembered.test.ts src/lib/splatJobs/panel.ts src/lib/splatJobs/panel.test.ts
git commit -m "feat: the phone side of video scans: upload with progress, follow, cancel and download a build, remembered per room" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/splatJobs/client.ts src/lib/splatJobs/client.test.ts src/lib/splatJobs/remembered.ts src/lib/splatJobs/remembered.test.ts src/lib/splatJobs/panel.ts src/lib/splatJobs/panel.test.ts
```

---

### Task 7: Phone UI

**Files:**
- Create: `src/components/useSplatHealth.ts`, `src/components/useVideoScan.ts`, `src/components/VideoScanPanel.tsx`
- Modify: `src/components/RoomView.tsx`, `src/app/setup/page.tsx:203`

**Interfaces:**
- Consumes: Task 6's `client.ts`, `remembered.ts` and `panel.ts`. From `pendingScan.ts`: `setPendingScanForRoom`, `takePendingScan`, `returnPendingScan` (existing). `ScanController.open` / `startAlignment` (existing).
- Produces:
  ```ts
  useSplatHealth(): Health | null
  useVideoScan(roomId: string | null, onReady: (file: File, roomId: string) => void): {
    state: VideoScanState; start(file: File, quality: Quality): void; cancel(): void; dismiss(): void; retry(): void }
  VideoScanPanel({ state, onStart, onCancel })      // state: idle | uploading
  VideoScanProgress({ state, onCancel, onDismiss, onRetry })   // state: building | downloading | failed
  ```

There are no unit tests: these are React glue over Task 6's tested functions, and the repo's Vitest runs in Node without a DOM. Step 6 checks them in the browser.

- [ ] **Step 1: Write `src/components/useSplatHealth.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';
import { fetchHealth } from '@/lib/splatJobs/client';
import type { Health } from '@/lib/splatJobs/protocol';

/** The demo server's health, asked once on mount. Null until it answers, and where the page isn't served by it. */
export function useSplatHealth(): Health | null {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let live = true;
    void fetchHealth().then((answer) => {
      if (live) setHealth(answer);
    });
    return () => {
      live = false;
    };
  }, []);
  return health;
}
```

- [ ] **Step 2: Write `src/components/useVideoScan.ts`**

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cancelJob, downloadSplat, fetchJob, uploadVideo } from '@/lib/splatJobs/client';
import { DOWNLOAD_FAILED, GONE, OFFLINE_POLL_MS, POLL_MS, uploadFailMessage, type VideoScanState } from '@/lib/splatJobs/panel';
import type { Quality } from '@/lib/splatJobs/protocol';
import { forgetJob, recallJob, rememberJob } from '@/lib/splatJobs/remembered';

/**
 * Builds a room scan from a video on the demo laptop (spec 2026-10-06 §6). `onReady(file, roomId)` gets the finished
 * splat for the room its build belongs to. Builds are remembered per room: a reload, or coming back to the room, picks
 * one up again, and one that finished while its room wasn't open is fetched then.
 */
export function useVideoScan(roomId: string | null, onReady: (file: File, roomId: string) => void) {
  const [state, setState] = useState<VideoScanState>({ kind: 'idle' });
  const [follow, setFollow] = useState(0); // bumped to (re)start following this room's remembered build
  const upload = useRef<{ abort(): void } | null>(null);
  const ready = useRef(onReady);
  useEffect(() => {
    ready.current = onReady;
  }, [onReady]);

  // Another room: what was shown belonged to the last one, whose build keeps running on the laptop.
  const [shownRoom, setShownRoom] = useState(roomId);
  if (roomId !== shownRoom) {
    setShownRoom(roomId);
    setState({ kind: 'idle' });
  }

  // An upload belongs to the room it started in: leaving the room (or the page) stops it.
  useEffect(
    () => () => {
      upload.current?.abort();
      upload.current = null;
    },
    [roomId],
  );

  // Follows this room's remembered build until it finishes.
  useEffect(() => {
    if (!roomId) return;
    const room = roomId;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const id = recallJob(room);
      if (!id) return;
      const result = await fetchJob(id);
      if (!live) return;
      if (result.kind === 'gone') {
        forgetJob(room);
        setState({ kind: 'failed', message: GONE });
        return;
      }
      if (result.kind === 'offline') {
        setState((shown) =>
          shown.kind === 'building' ? { ...shown, offline: true } : { kind: 'building', job: { id, quality: 'quick', state: 'queued' }, offline: true },
        );
        timer = setTimeout(() => void poll(), OFFLINE_POLL_MS);
        return;
      }
      const { job } = result;
      if (job.state === 'ready') {
        setState({ kind: 'downloading' });
        try {
          const file = await downloadSplat(id);
          if (!live) return; // still remembered: fetched again when this room is next open
          forgetJob(room);
          setState({ kind: 'idle' });
          ready.current(file, room);
        } catch {
          if (live) setState({ kind: 'failed', message: DOWNLOAD_FAILED, retry: true });
        }
        return;
      }
      if (job.state === 'failed' || job.state === 'canceled') {
        forgetJob(room);
        setState(job.state === 'failed' ? { kind: 'failed', message: job.error?.message ?? 'Building the room failed.' } : { kind: 'idle' });
        return;
      }
      setState({ kind: 'building', job, offline: false });
      timer = setTimeout(() => void poll(), POLL_MS);
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [roomId, follow]);

  const start = useCallback(
    (file: File, quality: Quality) => {
      if (!roomId || upload.current) return;
      const room = roomId;
      setState({ kind: 'uploading', fraction: 0 });
      const sending = uploadVideo(file, quality, (fraction) => {
        if (upload.current === sending) setState({ kind: 'uploading', fraction });
      });
      upload.current = sending;
      void sending.done.then((result) => {
        if (upload.current !== sending) return; // canceled, or the room was left
        upload.current = null;
        if (!result.ok) {
          setState(result.reason === 'aborted' ? { kind: 'idle' } : { kind: 'failed', message: uploadFailMessage(result.reason) });
          return;
        }
        rememberJob(room, result.job.id);
        setState({ kind: 'building', job: result.job, offline: false });
        setFollow((n) => n + 1);
      });
    },
    [roomId],
  );

  const cancel = useCallback(() => {
    const sending = upload.current;
    if (sending) {
      upload.current = null;
      sending.abort();
      setState({ kind: 'idle' });
      return;
    }
    if (!roomId) return;
    const id = recallJob(roomId);
    forgetJob(roomId);
    if (id) void cancelJob(id);
    setState({ kind: 'idle' });
    setFollow((n) => n + 1); // the follow loop stops: nothing is remembered now
  }, [roomId]);

  /** Closes a failure message; a build whose splat couldn't be fetched is given up on. */
  const dismiss = useCallback(() => {
    if (roomId) forgetJob(roomId);
    setState({ kind: 'idle' });
  }, [roomId]);

  /** After a failed download: fetch the remembered build again. */
  const retry = useCallback(() => {
    setState({ kind: 'idle' });
    setFollow((n) => n + 1);
  }, []);

  return { state, start, cancel, dismiss, retry };
}
```

- [ ] **Step 3: Write `src/components/VideoScanPanel.tsx`**

```tsx
'use client';

import { useId, useState } from 'react';
import { jobFraction, jobLine, KEEP_SCREEN_ON, LOST_CONTACT, type VideoScanState } from '@/lib/splatJobs/panel';
import type { Quality } from '@/lib/splatJobs/protocol';

const buttonClass = 'inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 disabled:opacity-40';
const TIPS = 'Walk slowly around the room for 30–60 seconds. Move sideways rather than turning on the spot, and keep the light good.';
const PRIVACY = 'Your video is sent to this laptop to build the room, and stays there.';
const QUALITY_LABELS: Record<Quality, string> = { quick: 'Quick: a few minutes', best: 'Best: sharper, much slower' };

function Bar({ fraction, label }: { fraction: number | null; label: string }) {
  if (fraction === null) return null;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(fraction * 100)}
      className="h-2 w-full overflow-hidden rounded-full bg-neutral-800"
    >
      <div className="h-full bg-sky-400" style={{ width: `${fraction * 100}%` }} />
    </div>
  );
}

/** Opened by "Make from a video": the tips, Quick or Best, and the video; then the upload's progress. */
export function VideoScanPanel({
  state,
  onStart,
  onCancel,
}: {
  state: Extract<VideoScanState, { kind: 'idle' | 'uploading' }>;
  onStart: (file: File, quality: Quality) => void;
  onCancel: () => void;
}) {
  const [quality, setQuality] = useState<Quality>('quick');
  const group = useId();
  return (
    <section aria-label="Make a scan from a video" className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-3 text-sm">
      <p className="text-neutral-300">{TIPS}</p>
      {state.kind === 'idle' ? (
        <>
          <fieldset className="flex flex-wrap gap-x-4">
            <legend className="sr-only">Quality</legend>
            {(['quick', 'best'] as const).map((q) => (
              <label key={q} className="inline-flex min-h-11 items-center gap-2">
                <input type="radio" name={group} checked={quality === q} onChange={() => setQuality(q)} />
                {QUALITY_LABELS[q]}
              </label>
            ))}
          </fieldset>
          <p className="text-neutral-400">{PRIVACY}</p>
          <label
            className={`${buttonClass} cursor-pointer self-start has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-300`}
          >
            Choose or record a video
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = ''; // so picking the same file again still fires
                if (file) onStart(file, quality);
              }}
            />
          </label>
        </>
      ) : (
        <>
          <p role="status" className="text-neutral-300">{`Uploading ${Math.round(state.fraction * 100)}%`}</p>
          <Bar fraction={state.fraction} label="Upload" />
          <p className="text-amber-200">{KEEP_SCREEN_ON}</p>
          <button onClick={onCancel} className={`${buttonClass} self-start`}>
            Cancel
          </button>
        </>
      )}
    </section>
  );
}

/** Under the "Room scan" row while a build runs, downloads or has failed. */
export function VideoScanProgress({
  state,
  onCancel,
  onDismiss,
  onRetry,
}: {
  state: Extract<VideoScanState, { kind: 'building' | 'downloading' | 'failed' }>;
  onCancel: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (state.kind === 'failed') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p role="status" className="min-w-0 flex-1 text-amber-200">
          {state.message}
        </p>
        {state.retry && (
          <button onClick={onRetry} className={buttonClass}>
            Try again
          </button>
        )}
        <button onClick={onDismiss} className={buttonClass}>
          Close
        </button>
      </div>
    );
  }
  if (state.kind === 'downloading') {
    return (
      <p role="status" className="text-sm text-neutral-300">
        Getting your room from the laptop…
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="min-w-0 flex-1 text-neutral-300">
          {jobLine(state.job)}
          {state.offline && <span className="text-amber-200">{` · ${LOST_CONTACT}`}</span>}
        </p>
        <button onClick={onCancel} className={buttonClass}>
          Cancel
        </button>
      </div>
      <Bar fraction={jobFraction(state.job)} label="Building your room" />
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `src/components/RoomView.tsx`**

4a. **Imports.** Change line 3, and the `./pendingScan` import on line 15:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
```
```tsx
import { pendingScanRoom, returnPendingScan, setPendingScanForRoom, subscribePendingScan, takePendingScan } from './pendingScan';
```
Then add, keeping the import order alphabetical by path (each line goes where it sorts):
```tsx
import { NOT_RUNNING } from '@/lib/splatJobs/panel';
import { useSplatHealth } from './useSplatHealth';
import { useVideoScan } from './useVideoScan';
import { VideoScanPanel, VideoScanProgress } from './VideoScanPanel';
```

4b. **State and the hook.** After `const [alignStep, setAlignStep] = useState<…>({ … });` (it ends at line 117), add:

```tsx
  const health = useSplatHealth();
  const alignNext = useRef(false); // the next pending scan was built from a video: line it up as soon as it opens
  const onVideoReady = useCallback((file: File, forRoom: string) => {
    alignNext.current = true;
    setPendingScanForRoom(file, forRoom); // opened by the pending-scan effect, which waits while the view is busy
  }, []);
  const video = useVideoScan(roomId, onVideoReady);
  const [videoPanel, setVideoPanel] = useState(false);
  // Once a build starts (or an upload fails), its progress row takes over from the panel.
  if (videoPanel && video.state.kind !== 'idle' && video.state.kind !== 'uploading') setVideoPanel(false);
```

In the existing room-switch block (lines 120–125), add `setVideoPanel(false);` after `setMessage(null);`.

4c. **Line up a video scan as soon as it opens.** Replace the body of the pending-scan effect, from `const file = takePendingScan(roomId);` to the end of its returned cleanup (lines 224–231), with:

```tsx
    const file = takePendingScan(roomId);
    if (!file) return;
    const align = alignNext.current;
    alignNext.current = false;
    void scans.open(file, useRoomStore.getState().room).then(() => {
      if (!align || scanRef.current !== scans) return;
      // Built from a video: the three line-up steps begin at once (spec 2026-10-06 §6). A scan that didn't open is a no-op.
      setWalking(false);
      sceneRef.current?.setWalking(false);
      setPlacing(false);
      setMessage(null);
      scans.startAlignment();
    });
    // React's development double mount disposes this controller at once: hand the file back for the one that follows.
    return () =>
      queueMicrotask(() => {
        if (scanRef.current === scans) return;
        if (align) alignNext.current = true;
        returnPendingScan(roomId, file);
      });
```

4d. **The button.** In the "Room scan" group, right after the `</label>` that closes the Load scan input (line 373), add:

```tsx
        {health && (
          <button
            aria-expanded={videoPanel}
            disabled={health.pipeline !== 'ready' || video.state.kind !== 'idle'}
            onClick={() => setVideoPanel((open) => !open)}
            className={buttonClass}
          >
            Make from a video
          </button>
        )}
        {health && health.pipeline !== 'ready' && <span className="text-neutral-400">{NOT_RUNNING}</span>}
```

4e. **Panel and progress.** Right after the "Room scan" group's closing `</div>` (line 402), before the `largeScanWarning` paragraph, add:

```tsx
      {videoPanel && (video.state.kind === 'idle' || video.state.kind === 'uploading') && (
        <VideoScanPanel state={video.state} onStart={video.start} onCancel={video.cancel} />
      )}
      {(video.state.kind === 'building' || video.state.kind === 'downloading' || video.state.kind === 'failed') && (
        <VideoScanProgress state={video.state} onCancel={video.cancel} onDismiss={video.dismiss} onRetry={video.retry} />
      )}
```

- [ ] **Step 5: The setup wizard's last line**

In `src/app/setup/page.tsx`:
- Add `import { useSplatHealth } from '@/components/useSplatHealth';` with the other `@/components` imports.
- Add `const health = useSplatHealth();` beside the other hooks at the top of the component.
- Replace line 203:

```tsx
          <p className="text-neutral-400">No scan? Open your room now. You can add one later from the 3D view.</p>
```
with:
```tsx
          <p className="text-neutral-400">
            {health
              ? 'No scan? Open your room now. You can add one, or make one from a video, from the 3D view.'
              : 'No scan? Open your room now. You can add one later from the 3D view.'}
          </p>
```

- [ ] **Step 6: Check, then look at it in the browser**

Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`; all must pass.

Then start `npm run demo:serve` in the background (the build just ran) and, in Chrome at phone size (390×844, touch), open `http://localhost:8080`. Go through "Try your room" and the setup wizard to a room's 3D view. Check:
- With the server up, the scan step's last line mentions video, and the 3D view shows **Make from a video**. If the pipeline image isn't built yet, the button is greyed out with "The laptop's scan builder isn't running."
- If the pipeline is ready: open the panel and check the tips, Quick/Best and the privacy line. Choose a small video (any `.mp4` from Task 8's samples, or one made with `ffmpeg -f lavfi -i testsrc=duration=5:size=640x360 test.mp4` in the pipeline container). Check that the upload percentage shows, then the progress row with the step text and Cancel. Press Cancel, and check that the row goes away and the job's `job.json` ends `canceled`.
- `next dev` (`npm run dev`) shows no video button.

Stop the server afterwards.

- [ ] **Step 7: Commit**

```powershell
git add src/components/useSplatHealth.ts src/components/useVideoScan.ts src/components/VideoScanPanel.tsx src/components/RoomView.tsx src/app/setup/page.tsx
git commit -m "feat: Make from a video: film or pick a video, follow the laptop's build, and line the room up when it arrives" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/useSplatHealth.ts src/components/useVideoScan.ts src/components/VideoScanPanel.tsx src/components/RoomView.tsx src/app/setup/page.tsx
```

---

### Task 8: First real runs, tuning, and the end-to-end check

**Run by the controller.** Builds take minutes to hours, so run them in the background and record the timings.

**Files:**
- Modify (only if tuning needs it): `src/lib/splatJobs/settings.ts` (`SETTINGS`), `src/components/VideoScanPanel.tsx` (`QUALITY_LABELS`)

**Interfaces:**
- Consumes: everything above, plus the built image (Task 1, Step 9 passed).

- [ ] **Step 1: Make sample videos from COLMAP's South Building photos**

```powershell
$samples = "$env:LOCALAPPDATA\RoomRemix\samples"
New-Item -ItemType Directory -Force $samples | Out-Null
curl.exe -L -o "$samples\south-building.zip" https://github.com/colmap/colmap/releases/download/3.11.1/south-building.zip
Expand-Archive -Force "$samples\south-building.zip" $samples
Get-ChildItem "$samples\south-building\images" | Measure-Object
```
Expected: 128 images. If the folder layout differs, find the `images` folder with `Get-ChildItem -Recurse -Directory $samples`.

Make a landscape video (3 photos per second, about 43 s), and a portrait one carrying a rotation tag like an iPhone `.mov`:

```powershell
docker run --rm -v "${samples}:/s" room-remix-splat ffmpeg -y -framerate 3 -pattern_type glob -i "/s/south-building/images/*.JPG" -vf "scale=1920:-2" -c:v libx264 -pix_fmt yuv420p /s/south-landscape.mp4
docker run --rm -v "${samples}:/s" room-remix-splat ffmpeg -y -i /s/south-landscape.mp4 -c copy -metadata:s:v:0 rotate=90 /s/south-portrait.mp4
```
If the glob finds nothing, check the images' extension case (`*.jpg`).

- [ ] **Step 2: Time a Quick build of the portrait video**

Start `npm run demo:serve` in the background. Then:

```powershell
$job = curl.exe -s -X POST -H "Content-Type: video/mp4" --data-binary "@$samples\south-portrait.mp4" "http://localhost:8080/api/splat/jobs?quality=quick" | ConvertFrom-Json
$job.id
```
Poll `curl.exe -s http://localhost:8080/api/splat/jobs/$($job.id)` about once a minute until `state` is `ready` or `failed`. Then read the timings and check the frames:

```powershell
$dir = "$env:LOCALAPPDATA\RoomRemix\jobs\$($job.id)"
Get-ChildItem "$dir\logs" | Select-Object Name, CreationTime, LastWriteTime
Select-String -Path "$dir\logs\training.log" -Pattern "Using CUDA"
docker run --rm -v "${dir}:/job" room-remix-splat ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 /job/images/0001.jpg
```
Expected:
- `ready`.
- `Using CUDA` appears in the training log.
- The first frame is **portrait**, with the longer side at most 1000 (the 1920×1440 sample turned upright gives `750,1000`). That covers Review Focus 1.
- `splat.spz` exists.

If the build failed, read the failing step's log in `$dir\logs` and use superpowers:systematic-debugging before changing anything.

- [ ] **Step 3: Time a Best build of the landscape video**

The same as Step 2, with `quality=best` and `south-landscape.mp4`. Run it in the background and check back about every 10 minutes. Record the per-step times.

- [ ] **Step 4: Tune the settings**

The spec's target is Quick under 10 minutes for a 60-second video. Scale the Step 2 time to 60 seconds of video (frames grow with length; COLMAP's sequential matching and OpenSplat's per-step cost grow roughly with the frame count).
- If Quick misses, lower in this order: `fps` (2 → 1.5), then `maxSize` (1000 → 800), then `steps` (2000 → 1500). Re-run Step 2 after each change.
- If Best takes over 2 hours for 60 seconds, lower its `steps`.
- Put the measured minutes into `QUALITY_LABELS` (for example `Quick: about 6 minutes`).
- Record each ruling (what, why, cost if wrong) for the final report.

Commit only if something changed:
```powershell
git commit -m "tune: Quick and Best settings from timed runs on the demo laptop" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/splatJobs/settings.ts src/components/VideoScanPanel.tsx
```

- [ ] **Step 5: The end-to-end check in the browser**

Run `npm run demo` (it rebuilds the app with any new labels) in the background. In Chrome at phone size (390×844, touch), open `http://localhost:8080`, make a room through the setup wizard, and in the 3D view:

1. **Make from a video** → Quick → choose `south-landscape.mp4` (chrome-devtools `upload_file`).
2. Watch the upload percentage. Then the row should go through "Checking the video", "Pulling frames", "Finding camera positions" and "Building your room, step N of M" with a moving bar.
3. **Reload the page mid-build.** The row comes back and keeps following (remembered per room).
4. On `ready`: check "Getting your room from the laptop…", then the splat appears, the scan line reads `video-scan.spz: … splats · not aligned yet`, and "Step 1 of 3: tap 3 spots on the floor (0/3)" shows at once.
5. Cancel the line-up, then reload. The scan comes back from IndexedDB, as any loaded scan does.
6. Start a second Quick build and **Cancel** it during "Finding camera positions". The row goes away and its `job.json` ends `canceled`.
7. Stop the server while a third build runs, then start `npm run demo:serve` again. The phone's row reports "The laptop restarted while building. Start again." with Close.

Take a screenshot at steps 2, 4 and 7. Check the console for errors.

Stop the server afterwards, and delete the samples' job folders you no longer need (not the samples).
