# Plan 8: Sound in the Splat Viewer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** inside a room built from a video, the app:
- auto-detects objects and labels each as absorbing or reflecting sound;
- shows where a speaker should go so everyone hears it well;
- lets you walk around on headphones while the sound follows you.

**Architecture:**
- **Server:** the demo server finds objects in 12 of the video's frames, using OWL-ViT through transformers.js in Node, and caches the result as `detections.json`.
- **Browser:**
  - fits a box in metres to the upright splat;
  - places the detections in 3D by projecting the splat's centres into each frame;
  - feeds box, materials and objects into the existing image-source engine. Objects add absorption, and blockers dim the direct path.
- **Worker:** a new Web Worker renders single IRs for walking and scores a grid of speaker spots.
- **Viewer:** a speaker, a floor heat map and floating object labels, drawn in a room-metres group whose matrix is room → world.

**Tech stack:** Next 16 static export, React 19, three 0.186 (`CSS2DRenderer`), Spark (via `SplatLayer` only), `@huggingface/transformers` 4.3.1 (Node, CPU, `Xenova/owlvit-base-patch32` fp32), Vitest 5, and the demo server (`tsx src/server/main.ts`).

**Spec:** `docs/superpowers/specs/2026-10-07-room-remix-splat-sound-design.md`

## Global Constraints

- **The demo is tonight. Happy path only.** Don't add error states, settings or polish beyond what a task names.
- **Free and open source only.** No paid services or APIs.
- **Git:**
  - work on `main`;
  - commit by explicit path only (`git commit -m "…" -- <paths>`), because another Claude session shares this working tree;
  - if `index.lock` exists, wait a few seconds and retry;
  - never push, pull, amend or rebase.
- **Spark:** it is only imported by `src/lib/scene/SplatLayer.ts`. Elsewhere, use `import type` for `SplatLayer`, and `ViewerScene` reaches it with `import()`. ESLint enforces this.
- **Room frame:** metres, with the origin at a floor corner, x along the length, z along the width and y up (`RoomState`).
  - "World" is the viewer's upright splat frame (the scene's frame after `view.rotation`).
  - "Raw" is the splat file's own frame, which `cameras.json` shares.
- **Camera axes from `cameras.json`** (pinned in Plan 7): `rotation[r][c]` holds camera axes as columns. Column 0 is right, column 1 is down, column 2 is forward.
- **Viewer styling:** the restyle's tokens (spec §8 Look).
  - Panel: `rounded-card border border-cork bg-walnut/80`.
  - Buttons: one `pill` per panel, `ghost` for the rest.
  - Text: `text-label`/`text-ui`, `voice` for full sentences, `text-cream/70` for secondary text.
  - Dividers: `rule`.
  - Teal and amber appear only on the object chips. Ember stays reserved for credit lines.
- **This is NOT the Next.js you know** (AGENTS.md). Before writing Next-specific code, read the guide in `node_modules/next/dist/docs/`. This plan adds only a `'use client'` component and no routes.
- **Checks to run before every commit:** `npx vitest run <the task's test files>` and `npx tsc --noEmit`. Also run `npx eslint <changed files>` for tasks 6–8.

## Review Focus

Each item says which task's test pins it:

1. **The camera flies outside the fitted box, below the floor, or into the speaker** (W/A/S/D and Q/E pass through walls). The listener must clamp into the room or be skipped; nothing should throw on any frame. → Task 3: `placeListener` returns a valid point or null for points outside the box and at the speaker.
2. **Detections name frames that have no camera, or a frame has no usable detections.** The result must be `[]`, never an exception. → Task 4.
3. **Detection takes about a minute the first time.** Placing the speaker, playing and the best-spot search must all work while "Finding objects…" shows, and objects arriving later must update the echo time and re-render the sound. → Task 8 manual check.
4. **Back or a room switch while detection or a worker job is in flight.** No state updates after dispose, and the audio stops. → Task 8 manual check, and `SoundController.dispose` guards.
5. **Place speaker armed, then a click on the sky (no floor hit), or while the pointer is locked.** It stays armed with no crash, and placing never locks the pointer. → Task 7: `floorPoint` returns null for an upward ray.

## Execution waves

The tasks are written in dependency order. Run them in parallel where the files don't overlap:
- **Wave A:** Tasks 1, 2 and 3 in parallel.
- **Wave B:** Tasks 4, 5 and 7 in parallel. They need Wave A's types. Task 7 owns `src/lib/sound/heat.ts`.
- **Wave C:** Task 6, then Task 8.
- **Task 9** is the controller's real check.

---

### Task 1: The server finds objects in the video's frames

**Files:**
- Modify: `package.json` and `package-lock.json` (via `npm install @huggingface/transformers@4.3.1`)
- Modify: `src/lib/splatJobs/protocol.ts` (detection types and `readDetections`)
- Modify: `src/lib/splatJobs/client.ts` (`fetchDetections`)
- Create: `src/server/detect.ts`
- Modify: `src/server/jobs.ts` (`jobDir`)
- Modify: `src/server/server.ts` (the `Jobs` interface, `ServerOptions.findObjects`, the route)
- Modify: `src/server/main.ts` (wire the real detector)
- Test: `src/server/detect.test.ts` (new), `src/server/server.test.ts`, `src/lib/splatJobs/protocol.test.ts`

**Interfaces:**
- Produces, in `src/lib/splatJobs/protocol.ts`:
  ```ts
  export type Detection = { label: string; score: number; box: [number, number, number, number] }; // pixels of that image
  export type FrameDetections = { img_name: string; width: number; height: number; detections: Detection[] };
  export type DetectionsFile = { frames: FrameDetections[] };
  export function readDetections(data: unknown): DetectionsFile | null;
  ```
- Produces `fetchDetections(id: string, fetchFn?: Fetch): Promise<DetectionsFile | null>` in `src/lib/splatJobs/client.ts`.
- Produces `GET /api/splat/jobs/:id/objects`: 200 with a `DetectionsFile`, 404 when the job isn't ready, 500 `{ error: 'detect-failed' }`.

**Facts from the spike** (scratch `detect-spike/`):
- **Speed:** `Xenova/owlvit-base-patch32` takes about 0.4 s per 1600×900 frame on this CPU and loads in 1.9 s once cached.
- **Prompt:** labels work best as `a photo of a ${label}`. Strip that prefix from the returned label.
- **Post-processing:** the pipeline returns every label above the threshold for each box, with no argmax and no NMS. So:
  1. collapse identical boxes to their best label;
  2. map `desk` → `table`;
  3. apply per-label thresholds (0.3 by default, 0.15 for whiteboard and television);
  4. run class-agnostic NMS at IoU 0.5.
- **Model files:** the fp32 model (612 MB) is already downloaded in the scratch cache. Downloading it again takes about 15 minutes at this network's speed, so copy it.

- [ ] **Step 1: Install the package and copy the model cache**

```bash
npm install @huggingface/transformers@4.3.1
mkdir -p "$LOCALAPPDATA/RoomRemix/models"
cp -r "C:/Users/ryany/AppData/Local/Temp/claude/c--Users-ryany-OneDrive-Desktop-Room-Remix/f7fd7940-c64c-4fef-aede-e9e430ff3389/scratchpad/detect-spike/.hf-cache/." "$LOCALAPPDATA/RoomRemix/models/"
ls "$LOCALAPPDATA/RoomRemix/models/Xenova/owlvit-base-patch32/onnx"
```
Expected: `model.onnx` is listed (about 612 MB). If the layout differs, find `model.onnx` under the scratch `.hf-cache` and mirror its folder path under `models/`.

- [ ] **Step 2: Write the failing tests**

Create `src/server/detect.test.ts`:

```ts
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Detection } from '@/lib/splatJobs/protocol';
import { cleanDetections, createObjectFinder, DETECTIONS_FILE, pickFrames, type DetectFrame } from './detect';

describe('pickFrames', () => {
  it('spreads the picks evenly, first and last included, in numeric order', () => {
    const names = Array.from({ length: 102 }, (_, i) => `${String(i + 1).padStart(4, '0')}.jpg`).reverse();
    const picked = pickFrames(names, 12);
    expect(picked).toHaveLength(12);
    expect(picked[0]).toBe('0001.jpg');
    expect(picked[11]).toBe('0102.jpg');
    expect([...picked].sort()).toEqual(picked);
  });
  it('keeps every image when there are fewer than asked, and ignores other files', () => {
    expect(pickFrames(['2.jpg', 'notes.txt', '10.jpg', '1.jpg'], 12)).toEqual(['1.jpg', '2.jpg', '10.jpg']);
  });
});

describe('cleanDetections', () => {
  const d = (label: string, score: number, box: Detection['box']): Detection => ({ label, score, box });
  it('keeps one label per box, maps desk to table, applies thresholds and class-agnostic NMS', () => {
    const out = cleanDetections([
      d('desk', 0.5, [0, 0, 100, 100]),
      d('bed', 0.35, [0, 0, 100, 100]), // same box, lower score: dropped
      d('chair', 0.4, [5, 5, 100, 100]), // overlaps the table box: NMS drops it
      d('chair', 0.25, [300, 300, 400, 400]), // under 0.3: dropped
      d('whiteboard', 0.18, [500, 0, 700, 200]), // whiteboard's threshold is 0.15: kept
    ]);
    expect(out).toEqual([d('table', 0.5, [0, 0, 100, 100]), d('whiteboard', 0.18, [500, 0, 700, 200])]);
  });
});

describe('createObjectFinder', () => {
  it('detects once, shares a concurrent run, saves detections.json and reads it afterwards', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    for (const name of ['0001.jpg', '0002.jpg', '0003.jpg']) await writeFile(path.join(dir, 'images', name), '');
    let calls = 0;
    const detectFrame: DetectFrame = async () => {
      calls++;
      return { width: 1600, height: 900, detections: [{ label: 'chair', score: 0.5, box: [1, 2, 3, 4] }] };
    };
    const find = createObjectFinder(detectFrame);
    const [a, b] = await Promise.all([find(dir), find(dir)]);
    expect(calls).toBe(3);
    expect(a).toEqual(b);
    expect(a.frames.map((f) => f.img_name)).toEqual(['0001.jpg', '0002.jpg', '0003.jpg']);
    expect(JSON.parse(await readFile(path.join(dir, DETECTIONS_FILE), 'utf8'))).toEqual(a);
    await find(dir);
    expect(calls).toBe(3);
  });
  it('a failed run rejects and the next call tries again', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    await writeFile(path.join(dir, 'images', '0001.jpg'), '');
    let fail = true;
    const find = createObjectFinder(async () => {
      if (fail) throw new Error('model broke');
      return { width: 10, height: 10, detections: [] };
    });
    await expect(find(dir)).rejects.toThrow('model broke');
    fail = false;
    await expect(find(dir)).resolves.toEqual({ frames: [{ img_name: '0001.jpg', width: 10, height: 10, detections: [] }] });
  });
});
```

Add to `src/lib/splatJobs/protocol.test.ts`, extending its imports with `readDetections`:

```ts
describe('readDetections', () => {
  it('keeps well-formed frames and detections and drops the rest', () => {
    const good = { label: 'chair', score: 0.5, box: [1, 2, 3, 4] };
    expect(
      readDetections({
        frames: [
          { img_name: '0001.jpg', width: 1600, height: 900, detections: [good, { label: 'chair', score: 'x', box: [1, 2, 3, 4] }] },
          { img_name: 7, width: 1600, height: 900, detections: [] },
        ],
      }),
    ).toEqual({ frames: [{ img_name: '0001.jpg', width: 1600, height: 900, detections: [good] }] });
    expect(readDetections(null)).toBeNull();
    expect(readDetections({ frames: 'no' })).toBeNull();
  });
});
```

In `src/server/server.test.ts`:
1. Add `jobDir` to the fake `Jobs` it builds. It returns a folder string for a ready job id and null otherwise; mirror how that fake answers `camerasPath`.
2. Add these cases next to the cameras-route tests, using the file's existing helpers for starting a server and requesting:
   - `findObjects` resolves `{ frames: [] }` → `GET /api/splat/jobs/<ready id>/objects` answers 200 with that JSON;
   - an unknown id → 404;
   - `findObjects` rejects → 500 with `{ error: 'detect-failed' }`.

- [ ] **Step 3: Run the tests to check they fail**

Run `npx vitest run src/server/detect.test.ts src/server/server.test.ts src/lib/splatJobs/protocol.test.ts`.
Expected: FAIL (the `./detect` module is missing; `readDetections` and `jobDir` are undefined).

- [ ] **Step 4: Implement**

Add to `src/lib/splatJobs/protocol.ts`:

```ts
/** One object the detector saw in one frame; `box` is [x0, y0, x1, y1] in that image's pixels (spec 2026-10-07 sound §3.1). */
export type Detection = { label: string; score: number; box: [number, number, number, number] };
export type FrameDetections = { img_name: string; width: number; height: number; detections: Detection[] };
export type DetectionsFile = { frames: FrameDetections[] };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The objects file as the server sends it; malformed frames and detections are dropped. Null unless it has a frames array. */
export function readDetections(data: unknown): DetectionsFile | null {
  const frames = (data as { frames?: unknown } | null)?.frames;
  if (!Array.isArray(frames)) return null;
  const out: FrameDetections[] = [];
  for (const f of frames as Partial<FrameDetections>[]) {
    if (!f || typeof f.img_name !== 'string' || !finite(f.width) || !finite(f.height) || !Array.isArray(f.detections)) continue;
    const detections = f.detections.filter(
      (d): d is Detection =>
        !!d && typeof d.label === 'string' && finite(d.score) && Array.isArray(d.box) && d.box.length === 4 && d.box.every(finite),
    );
    out.push({ img_name: f.img_name, width: f.width, height: f.height, detections });
  }
  return { frames: out };
}
```

Add to `src/lib/splatJobs/client.ts`, importing `readDetections` and `type DetectionsFile`:

```ts
/** The room's detected objects, per frame. The first call for a room runs the detector (about a minute); null on any failure. */
export async function fetchDetections(id: string, fetchFn: Fetch = browserFetch): Promise<DetectionsFile | null> {
  try {
    const res = await fetchFn(`${jobUrl(id)}/objects`, { cache: 'no-store' });
    if (!res.ok) return null;
    return readDetections(await res.json());
  } catch {
    return null;
  }
}
```

Create `src/server/detect.ts`:

```ts
import { readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Detection, DetectionsFile, FrameDetections } from '@/lib/splatJobs/protocol';

/** What the detector looks for (spec 2026-10-07 sound §3.1). `desk` comes back as `table`. */
export const DETECT_LABELS = [
  'chair', 'sofa', 'table', 'desk', 'whiteboard', 'television', 'window', 'curtains', 'rug', 'bookshelf', 'bed', 'cabinet', 'plant',
] as const;
export const FRAME_COUNT = 12;
export const DETECTIONS_FILE = 'detections.json';
export const MODEL = 'Xenova/owlvit-base-patch32';
const PROMPT = 'a photo of a ';
const PIPELINE_THRESHOLD = 0.1; // the pipeline's own cut; cleanDetections applies the real per-label ones
const DEFAULT_THRESHOLD = 0.3;
const LABEL_THRESHOLDS: Record<string, number> = { whiteboard: 0.15, television: 0.15 }; // the spike: these score low even when right
const NMS_IOU = 0.5;
/** Model files live outside the repo (OneDrive) and outside node_modules, so a reinstall keeps them. */
export const MODEL_CACHE = path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), '.cache'), 'RoomRemix', 'models');

/** One image in, its detections out (in that image's pixels). */
export type DetectFrame = (file: string) => Promise<{ width: number; height: number; detections: Detection[] }>;

/** Up to `count` image names spread evenly through the list, in numeric order, first and last included. */
export function pickFrames(names: string[], count = FRAME_COUNT): string[] {
  const sorted = names
    .filter((n) => /\.(jpe?g|png)$/i.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (count - 1))]);
}

const area = (b: Detection['box']) => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
function iou(a: Detection['box'], b: Detection['box']): number {
  const inter = area([Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])]);
  return inter / (area(a) + area(b) - inter || 1);
}

/** The pipeline gives every label above its threshold per box: keep the best label per box, threshold, then class-agnostic NMS. */
export function cleanDetections(raw: Detection[]): Detection[] {
  const bestPerBox = new Map<string, Detection>();
  for (const d of raw) {
    const label = d.label === 'desk' ? 'table' : d.label;
    const key = d.box.map((v) => Math.round(v * 2)).join(',');
    const seen = bestPerBox.get(key);
    if (!seen || d.score > seen.score) bestPerBox.set(key, { ...d, label });
  }
  const kept = [...bestPerBox.values()]
    .filter((d) => d.score >= (LABEL_THRESHOLDS[d.label] ?? DEFAULT_THRESHOLD))
    .sort((a, b) => b.score - a.score);
  const out: Detection[] = [];
  for (const d of kept) if (out.every((o) => iou(o.box, d.box) <= NMS_IOU)) out.push(d);
  return out;
}

/**
 * Detections for a job folder: read from detections.json, or computed once and saved. Concurrent calls share one run;
 * a failed run rejects and leaves nothing behind, so the next call tries again.
 */
export function createObjectFinder(detectFrame: DetectFrame): (dir: string) => Promise<DetectionsFile> {
  const running = new Map<string, Promise<DetectionsFile>>();
  return async (dir) => {
    const saved = path.join(dir, DETECTIONS_FILE);
    try {
      return JSON.parse(await readFile(saved, 'utf8')) as DetectionsFile;
    } catch {
      // not detected yet
    }
    let run = running.get(dir);
    if (!run) {
      run = (async () => {
        const images = path.join(dir, 'images');
        const frames: FrameDetections[] = [];
        for (const name of pickFrames(await readdir(images))) frames.push({ img_name: name, ...(await detectFrame(path.join(images, name))) });
        const file: DetectionsFile = { frames };
        await writeFile(saved, JSON.stringify(file));
        return file;
      })().finally(() => running.delete(dir));
      running.set(dir, run);
    }
    return run;
  };
}

type ZeroShotOutput = { score: number; label: string; box: { xmin: number; ymin: number; xmax: number; ymax: number } }[];
type ZeroShot = (image: unknown, labels: string[], options: { threshold: number }) => Promise<ZeroShotOutput>;

/** OWL-ViT through transformers.js on the CPU, loaded on first use (spec §3.1; settings from the Plan 8 spike). */
export function transformersDetector(): DetectFrame {
  let loading: Promise<{ detector: ZeroShot; RawImage: { read(file: string): Promise<{ width: number; height: number }> } }> | null = null;
  return async (file) => {
    loading ??= import('@huggingface/transformers').then(async (t) => {
      t.env.cacheDir = MODEL_CACHE;
      const detector = (await t.pipeline('zero-shot-object-detection', MODEL, { device: 'cpu' })) as unknown as ZeroShot;
      return { detector, RawImage: t.RawImage as never };
    });
    const { detector, RawImage } = await loading;
    const image = await RawImage.read(file);
    const output = await detector(image, DETECT_LABELS.map((l) => PROMPT + l), { threshold: PIPELINE_THRESHOLD });
    const raw = output.map((o) => ({
      label: o.label.startsWith(PROMPT) ? o.label.slice(PROMPT.length) : o.label,
      score: o.score,
      box: [o.box.xmin, o.box.ymin, o.box.xmax, o.box.ymax] as Detection['box'],
    }));
    return { width: image.width, height: image.height, detections: cleanDetections(raw) };
  };
}
```

In `src/server/jobs.ts`, add next to `camerasPath`:

```ts
  /** A ready job's folder (for its frames and detections.json); null otherwise. */
  jobDir(id: string): string | null {
    return this.jobs.get(id)?.state === 'ready' ? this.dirOf(id) : null;
  }
```

In `src/server/server.ts`:
1. Add `jobDir(id: string): string | null;` to `interface Jobs`.
2. Add `findObjects?: (dir: string) => Promise<DetectionsFile>;` to `ServerOptions`, importing `type DetectionsFile` from the protocol. Destructure it wherever `createServer` destructures its options, the same way as `jobs`.
3. Add this beside `sendCameras`:

```ts
  async function sendObjects(res: Res, id: string): Promise<void> {
    const dir = jobs.jobDir(id);
    if (!dir || !findObjects) return sendJson(res, 404, { error: 'not-found' });
    try {
      return sendJson(res, 200, await findObjects(dir));
    } catch (error) {
      console.error(error);
      return sendJson(res, 500, { error: 'detect-failed' });
    }
  }
```

and this in `api()`, after the cameras line:

```ts
    if (resource === 'jobs' && id && sub === 'objects' && method === 'GET') return sendObjects(res, id);
```

In `src/server/main.ts`, import `createObjectFinder` and `transformersDetector` from `./detect`, and pass `findObjects: createObjectFinder(transformersDetector())` to `createServer`.

- [ ] **Step 5: Run the tests and typecheck**

Run `npx vitest run src/server src/lib/splatJobs && npx tsc --noEmit`.
Expected: PASS, with no type errors. If `t.RawImage` or `t.pipeline` typings complain, keep the casts local to `transformersDetector`.

- [ ] **Step 6: A real detection on the conference room**

Run this check script from the scratchpad, not the repo. It uses the real detector on the real job:

```bash
cat > "$TMPDIR/rr-detect-check.mts" <<'EOF'
import { createObjectFinder, transformersDetector } from 'C:/Users/ryany/OneDrive/Desktop/Room Remix/src/server/detect.ts';
const dir = process.env.LOCALAPPDATA + '/RoomRemix/jobs/1c59fe0f-02bb-4ddd-97c6-118bb432c93d';
const t = Date.now();
const file = await createObjectFinder(transformersDetector())(dir);
console.log(((Date.now() - t) / 1000).toFixed(1) + ' s', JSON.stringify(file.frames.map((f) => [f.img_name, f.detections.map((d) => d.label + ' ' + d.score.toFixed(2))])));
EOF
npx tsx "$TMPDIR/rr-detect-check.mts"
```
Expected:
- it finishes in about 10 s, with no download (the model comes from `MODEL_CACHE`);
- frame 0001 lists table, chair ×5 or more, and whiteboard;
- `detections.json` now exists in that job folder. Keep it: the demo reads it.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/splatJobs/protocol.ts src/lib/splatJobs/protocol.test.ts src/lib/splatJobs/client.ts src/server/detect.ts src/server/detect.test.ts src/server/jobs.ts src/server/server.ts src/server/server.test.ts src/server/main.ts
git commit -m "feat: the laptop finds the room's objects in the video's frames (OWL-ViT, cached per room)" -- package.json package-lock.json src/lib/splatJobs/protocol.ts src/lib/splatJobs/protocol.test.ts src/lib/splatJobs/client.ts src/server/detect.ts src/server/detect.test.ts src/server/jobs.ts src/server/server.ts src/server/server.test.ts src/server/main.ts
```

---

### Task 2: Objects absorb sound and block the direct path

**Files:**
- Modify: `src/lib/room/types.ts` (`OBJECT_LABELS`, `ObjectLabel`, `RoomObject`, `RoomState.objects?`)
- Create: `src/lib/acoustics/objects.ts`
- Modify: `src/lib/acoustics/absorption.ts` (add the objects' absorption)
- Modify: `src/lib/acoustics/imageSource.ts` (the `blockers` input; occlusion of order 0)
- Modify: `src/lib/acoustics/simulate.ts` and `src/lib/acoustics/rays.ts` (pass `blockers`)
- Test: `src/lib/acoustics/objects.test.ts` (new)

**Interfaces:**
- Produces, in `src/lib/room/types.ts`:
  ```ts
  export const OBJECT_LABELS = ['chair','sofa','table','whiteboard','television','window','curtains','rug','bookshelf','bed','cabinet','plant'] as const;
  export type ObjectLabel = (typeof OBJECT_LABELS)[number];
  export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 }; // room metres
  // RoomState gains: objects?: RoomObject[];
  ```
- Produces, in `src/lib/acoustics/objects.ts`:
  ```ts
  export type Box = { min: Vec3; max: Vec3 };
  export const OBJECT_INFO: Record<ObjectLabel, { name: string; absorbs: boolean; blocks: boolean }>;
  export const OCCLUSION_DB: Bands; // [2, 4, 7, 10, 13, 16]
  export function objectAbsorption(object: RoomObject): Bands; // m² per band
  export function blockingBoxes(objects: RoomObject[] | undefined): Box[];
  export function segmentHitsBox(a: Vec3, b: Vec3, box: Box): boolean;
  ```
- Produces: `ImageSourceInput.blockers?: Box[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/acoustics/objects.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RoomObject, RoomState } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { computeImageSources } from './imageSource';
import { blockingBoxes, OBJECT_INFO, objectAbsorption, OCCLUSION_DB, segmentHitsBox } from './objects';

const room: RoomState = {
  v: 1,
  name: 't',
  dims: { length: 6, width: 4, height: 2.7 },
  surfaces: { floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'drywall' },
  furnishing: 'bare',
  speaker: { x: 1, y: 1, z: 2 },
  listener: { x: 5, y: 1.2, z: 2, yaw: 0 },
  fixes: [],
  calibration: { factor: 1 },
};
const chair: RoomObject = { label: 'chair', min: { x: 2, y: 0, z: 1 }, max: { x: 2.6, y: 1, z: 1.6 } };
const whiteboard: RoomObject = { label: 'whiteboard', min: { x: 3, y: 0, z: 1 }, max: { x: 3.1, y: 2, z: 3 } };

describe('objects', () => {
  it('soft things absorb, hard things reflect, tall hard things block', () => {
    expect(OBJECT_INFO.chair).toMatchObject({ absorbs: true, blocks: false });
    expect(OBJECT_INFO.whiteboard).toMatchObject({ absorbs: false, blocks: true });
    expect(blockingBoxes([chair, whiteboard])).toEqual([{ min: whiteboard.min, max: whiteboard.max }]);
    expect(blockingBoxes(undefined)).toEqual([]);
  });

  it('adds each object to the room absorption', () => {
    const without = absorptionArea(room);
    const withObjects = absorptionArea({ ...room, objects: [chair, whiteboard] });
    const added = [chair, whiteboard].map(objectAbsorption);
    withObjects.forEach((a, b) => expect(a).toBeCloseTo(without[b] + added[0][b] + added[1][b], 9));
    expect(added[0].every((a) => a > 0)).toBe(true);
  });

  it('a whiteboard is sized by its face: 2 m × 2 m reflects more area than a 1 m one', () => {
    const small = { ...whiteboard, max: { ...whiteboard.max, z: 2 } };
    expect(objectAbsorption(whiteboard)[3]).toBeGreaterThan(objectAbsorption(small)[3]);
  });

  it('segmentHitsBox', () => {
    const box = { min: { x: 1, y: 0, z: 1 }, max: { x: 2, y: 2, z: 2 } };
    expect(segmentHitsBox({ x: 0, y: 1, z: 1.5 }, { x: 3, y: 1, z: 1.5 }, box)).toBe(true);
    expect(segmentHitsBox({ x: 0, y: 3, z: 1.5 }, { x: 3, y: 3, z: 1.5 }, box)).toBe(false); // passes over it
    expect(segmentHitsBox({ x: 0, y: 1, z: 1.5 }, { x: 0.9, y: 1, z: 1.5 }, box)).toBe(false); // stops short
  });

  it('a blocker dims only the direct sound, more at high frequencies', () => {
    const input = { dims: room.dims, source: room.speaker, listener: room.listener, maxOrder: 1, lookup: makeSurfaceLookup(room) };
    const open = computeImageSources(input);
    const blocked = computeImageSources({ ...input, blockers: blockingBoxes([whiteboard]) });
    const direct = (list: typeof open) => list.find((a) => a.order === 0)!;
    direct(blocked).gains.forEach((g, b) => expect(g).toBeCloseTo(direct(open).gains[b] * 10 ** (-OCCLUSION_DB[b] / 20), 12));
    const ceiling = (list: typeof open) => list.find((a) => a.order === 1 && a.hitSurfaces[0] === 'ceiling')!;
    expect(ceiling(blocked).gains).toEqual(ceiling(open).gains);
  });
});
```

- [ ] **Step 2: Run it to check it fails**

Run `npx vitest run src/lib/acoustics/objects.test.ts`.
Expected: FAIL (the `./objects` module is missing).

- [ ] **Step 3: Implement**

Add to `src/lib/room/types.ts`:

```ts
/** What the object detector can name (spec 2026-10-07 sound §3). */
export const OBJECT_LABELS = [
  'chair', 'sofa', 'table', 'whiteboard', 'television', 'window', 'curtains', 'rug', 'bookshelf', 'bed', 'cabinet', 'plant',
] as const;
export type ObjectLabel = (typeof OBJECT_LABELS)[number];
/** A detected object's box in room metres. */
export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 };
```

Also add `objects?: RoomObject[];` as the last field of `RoomState`, with the comment `// detected objects (splat rooms only): their absorption and blocking`.

Create `src/lib/acoustics/objects.ts`:

```ts
import type { ObjectLabel, RoomObject, Vec3 } from '@/lib/room/types';
import type { Bands } from './bands';
import { MATERIALS } from './materials';

export type Box = { min: Vec3; max: Vec3 };

/** Absorption per object (m², 125 Hz – 4 kHz): typical published values for furniture, or a face area × a material. */
const PER_OBJECT: Partial<Record<ObjectLabel, Bands>> = {
  chair: [0.15, 0.25, 0.3, 0.35, 0.35, 0.35],
  sofa: [0.6, 0.9, 1.2, 1.4, 1.4, 1.4],
  bed: [0.8, 1.2, 1.6, 1.8, 1.8, 1.8],
  plant: [0.05, 0.1, 0.15, 0.2, 0.25, 0.25],
};
const HARD_BOARD: Bands = [0.1, 0.07, 0.05, 0.04, 0.04, 0.04]; // painted steel / melamine: a whiteboard
const BOOKS: Bands = [0.3, 0.4, 0.4, 0.4, 0.45, 0.45];
/** Upright things count their front face; flat things their top. */
const FACE_ALPHA: Partial<Record<ObjectLabel, { alpha: Bands; face: 'front' | 'top' }>> = {
  table: { alpha: MATERIALS.woodPanel.alpha, face: 'top' },
  rug: { alpha: MATERIALS.rug.alpha, face: 'top' },
  whiteboard: { alpha: HARD_BOARD, face: 'front' },
  television: { alpha: MATERIALS.glass.alpha, face: 'front' },
  window: { alpha: MATERIALS.glass.alpha, face: 'front' },
  curtains: { alpha: MATERIALS.curtains.alpha, face: 'front' },
  bookshelf: { alpha: BOOKS, face: 'front' },
  cabinet: { alpha: MATERIALS.woodPanel.alpha, face: 'front' },
};

export const OBJECT_INFO: Record<ObjectLabel, { name: string; absorbs: boolean; blocks: boolean }> = {
  chair: { name: 'Chair', absorbs: true, blocks: false },
  sofa: { name: 'Sofa', absorbs: true, blocks: false },
  bed: { name: 'Bed', absorbs: true, blocks: false },
  curtains: { name: 'Curtains', absorbs: true, blocks: false },
  rug: { name: 'Rug', absorbs: true, blocks: false },
  bookshelf: { name: 'Bookshelf', absorbs: true, blocks: true },
  plant: { name: 'Plant', absorbs: true, blocks: false },
  table: { name: 'Table', absorbs: false, blocks: false },
  whiteboard: { name: 'Whiteboard', absorbs: false, blocks: true },
  television: { name: 'TV', absorbs: false, blocks: true },
  window: { name: 'Window', absorbs: false, blocks: false },
  cabinet: { name: 'Cabinet', absorbs: false, blocks: true },
};

/** How much a blocker between speaker and listener cuts the direct sound (dB): low notes bend round, high ones don't. */
export const OCCLUSION_DB: Bands = [2, 4, 7, 10, 13, 16];
export const OCCLUSION_GAIN: Bands = OCCLUSION_DB.map((db) => 10 ** (-db / 20));

export function objectAbsorption(object: RoomObject): Bands {
  const fixed = PER_OBJECT[object.label];
  if (fixed) return [...fixed];
  const { alpha, face } = FACE_ALPHA[object.label]!;
  const x = object.max.x - object.min.x;
  const y = object.max.y - object.min.y;
  const z = object.max.z - object.min.z;
  const area = face === 'top' ? x * z : Math.max(x, z) * y;
  return alpha.map((a) => a * area);
}

export function blockingBoxes(objects: RoomObject[] | undefined): Box[] {
  return (objects ?? []).filter((o) => OBJECT_INFO[o.label].blocks).map(({ min, max }) => ({ min, max }));
}

/** Whether the segment a→b passes through the box (slab method). */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Box): boolean {
  let t0 = 0;
  let t1 = 1;
  for (const k of ['x', 'y', 'z'] as const) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-12) {
      if (a[k] < box.min[k] || a[k] > box.max[k]) return false;
      continue;
    }
    let ta = (box.min[k] - a[k]) / d;
    let tb = (box.max[k] - a[k]) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}
```

In `src/lib/acoustics/absorption.ts`, import `objectAbsorption` from `./objects`. At the end of `absorptionArea`, before `return total;`, add:

```ts
  for (const object of room.objects ?? []) {
    const a = objectAbsorption(object);
    for (let b = 0; b < NUM_BANDS; b++) total[b] += a[b];
  }
```

Also add to its doc comment: `Detected objects add their own absorption on top (spec 2026-10-07 sound §4).`

In `src/lib/acoustics/imageSource.ts`:
1. Import `OCCLUSION_GAIN`, `segmentHitsBox` and `type Box` from `./objects`.
2. Add `blockers?: Box[];` to `ImageSourceInput`, with the comment `// objects that dim the direct sound when they sit between source and listener`.
3. In `trace`, after the `for (const c of crossings)` loop and before `const distance`, add:

```ts
  const order = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
  if (order === 0 && input.blockers?.some((box) => segmentHitsBox(source, listener, box))) {
    for (let b = 0; b < NUM_BANDS; b++) reflection[b] *= OCCLUSION_GAIN[b];
  }
```

and use that `order` in the returned object (`order,`).

In `src/lib/acoustics/simulate.ts` (`simulateRoom`) and `src/lib/acoustics/rays.ts` (`computeRayPaths`), add `blockers: blockingBoxes(room.objects),` to the `computeImageSources({...})` input, importing `blockingBoxes` from `./objects`.

- [ ] **Step 4: Run the acoustics tests and typecheck**

Run `npx vitest run src/lib/acoustics src/lib/room && npx tsc --noEmit`.
Expected: everything passes, including the old acoustics tests (rooms without objects behave exactly as before).

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: detected objects absorb sound, and blockers dim the direct path" -- src/lib/room/types.ts src/lib/acoustics/objects.ts src/lib/acoustics/objects.test.ts src/lib/acoustics/absorption.ts src/lib/acoustics/imageSource.ts src/lib/acoustics/simulate.ts src/lib/acoustics/rays.ts
```
(`git add` the new files first.)

---

### Task 3: Fit a room box in metres to the splat

**Files:**
- Create: `src/lib/sound/types.ts`
- Create: `src/lib/sound/roomFit.ts`
- Create: `src/lib/sound/soundRoom.ts`
- Test: `src/lib/sound/roomFit.test.ts`, `src/lib/sound/soundRoom.test.ts`

**Interfaces:**
- Produces, in `src/lib/sound/types.ts`:
  ```ts
  /** world (upright splat units) → room metres: rotate by yaw about Y, shift, scale. Plain data (goes to workers). */
  export type RoomFit = { dims: Dims; scale: number; yaw: number; floorY: number; minX: number; minZ: number };
  /** Speaker-spot scores on a floor grid; row-major, z rows of x cells. null = not a candidate. */
  export type SpotMap = { x0: number; z0: number; step: number; nx: number; nz: number; scores: (number | null)[]; best: { x: number; z: number; score: number } | null };
  ```
- Produces, in `src/lib/sound/roomFit.ts`: `EYE_HEIGHT` (1.5), `quantile(sorted: ArrayLike<number>, q: number): number`, `fitRoom(points: Float32Array, cameras: Vec3[]): RoomFit`, `toRoom(fit, p: Vec3): Vec3`, `toWorld(fit, p: Vec3): Vec3`, `roomYaw(fit, worldDir: Vec3): number`, `roomToWorldMatrix(fit): THREE.Matrix4`.
- Produces, in `src/lib/sound/soundRoom.ts`: `SOUND_SURFACES`, `SPEAKER_HEIGHT` (1.0), `SPEAKER_WALL_GAP` (0.5), `soundRoom(dims, objects, speaker, listener): RoomState`, `clampSpeaker(dims, p: { x: number; z: number }): Vec3`, `placeListener(dims, speaker, p: Vec3): Vec3 | null`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sound/roomFit.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/lib/room/types';
import { fitRoom, roomToWorldMatrix, roomYaw, toRoom, toWorld } from './roomFit';
import type { RoomFit } from './types';

// A 6 × 4 × 2.7 m room, turned 30°, at 2 m per world unit, floor at world y = −1.
const truth: RoomFit = { dims: { length: 6, width: 4, height: 2.7 }, scale: 2, yaw: Math.PI / 6, floorY: -1, minX: 0.3, minZ: -0.7 };

/** Points on the floor, ceiling and four walls of the room (room metres), every 5 cm, sent to world. */
function roomSurfaces(fit: RoomFit, withCeiling = true, wallTop = fit.dims.height): Float32Array {
  const { length: L, width: W, height: H } = fit.dims;
  const out: number[] = [];
  const add = (p: Vec3) => {
    const w = toWorld(fit, p);
    out.push(w.x, w.y, w.z);
  };
  for (let x = 0; x <= L; x += 0.05) {
    for (let z = 0; z <= W; z += 0.05) {
      add({ x, y: 0, z });
      if (withCeiling) add({ x, y: H, z });
    }
    for (let y = 0; y <= wallTop; y += 0.05) {
      add({ x, y, z: 0 });
      add({ x, y, z: W });
    }
  }
  for (let z = 0; z <= W; z += 0.05) {
    for (let y = 0; y <= wallTop; y += 0.05) {
      add({ x: 0, y, z });
      add({ x: L, y, z });
    }
  }
  return new Float32Array(out);
}
const cameras = (fit: RoomFit) => [{ x: 2, y: 1.5, z: 2 }, { x: 4, y: 1.5, z: 1 }].map((p) => toWorld(fit, p));

describe('fitRoom', () => {
  it('recovers size, scale and the walls of a turned, scaled room', () => {
    const fit = fitRoom(roomSurfaces(truth), cameras(truth));
    expect(fit.scale).toBeCloseTo(2, 2);
    expect(fit.dims.length).toBeCloseTo(6, 1);
    expect(fit.dims.width).toBeCloseTo(4, 1);
    expect(fit.dims.height).toBeCloseTo(2.7, 1);
    const corner = toRoom(fit, toWorld(truth, { x: 6, y: 0, z: 4 }));
    expect(corner.x).toBeCloseTo(6, 1);
    expect(corner.y).toBeCloseTo(0, 1);
    expect(corner.z).toBeCloseTo(4, 1);
  });

  it('uses 2.7 m when the video barely saw the ceiling', () => {
    const low: RoomFit = { ...truth, dims: { ...truth.dims, height: 1.2 } };
    const fit = fitRoom(roomSurfaces(low, false, 1.2), cameras(truth));
    expect(fit.dims.height).toBe(2.7);
  });
});

describe('room ↔ world', () => {
  it('round-trips, and the matrix agrees with toWorld', () => {
    const p = { x: 1.2, y: 0.7, z: 3.1 };
    const back = toRoom(truth, toWorld(truth, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
    expect(back.z).toBeCloseTo(p.z, 9);
    const viaMatrix = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(roomToWorldMatrix(truth));
    const w = toWorld(truth, p);
    expect(viaMatrix.x).toBeCloseTo(w.x, 9);
    expect(viaMatrix.y).toBeCloseTo(w.y, 9);
    expect(viaMatrix.z).toBeCloseTo(w.z, 9);
  });

  it('roomYaw: facing along the room length is 0, along its width is π/2', () => {
    const along = (r: Vec3) => {
      const a = toWorld(truth, { x: 0, y: 0, z: 0 });
      const b = toWorld(truth, r);
      return { x: b.x - a.x, y: 0, z: b.z - a.z };
    };
    expect(roomYaw(truth, along({ x: 1, y: 0, z: 0 }))).toBeCloseTo(0, 9);
    expect(roomYaw(truth, along({ x: 0, y: 0, z: 1 }))).toBeCloseTo(Math.PI / 2, 9);
  });
});
```

Create `src/lib/sound/soundRoom.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateRoom } from '@/lib/room/roomState';
import { clampSpeaker, placeListener, soundRoom, SPEAKER_HEIGHT } from './soundRoom';

const dims = { length: 6, width: 4, height: 2.7 };

describe('soundRoom', () => {
  it('clampSpeaker keeps the speaker 0.5 m inside the walls at stand height', () => {
    expect(clampSpeaker(dims, { x: -3, z: 10 })).toEqual({ x: 0.5, y: SPEAKER_HEIGHT, z: 3.5 });
  });

  it('placeListener gives a valid room from anywhere the camera can fly, or null', () => {
    const speaker = clampSpeaker(dims, { x: 3, z: 2 });
    for (const p of [
      { x: -5, y: -2, z: 9 }, // outside, below the floor
      { x: 3, y: 1, z: 2 }, // inside the speaker
      { x: 3.1, y: 5, z: 2 }, // above the ceiling, over the speaker
      { x: 2, y: 1.2, z: 2 },
    ]) {
      const listener = placeListener(dims, speaker, p);
      if (listener === null) continue;
      expect(validateRoom(soundRoom(dims, [], speaker, { ...listener, yaw: 0 }))).toEqual([]);
    }
    expect(placeListener(dims, speaker, { x: 3, y: 1, z: 2 })).not.toBeNull(); // pushed out, not dropped
  });
});
```

- [ ] **Step 2: Run them to check they fail**

Run `npx vitest run src/lib/sound`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement**

Create `src/lib/sound/types.ts` with the two types from the Interfaces block above (importing `type Dims` from `@/lib/room/types`).

Create `src/lib/sound/roomFit.ts`:

```ts
import * as THREE from 'three';
import { LIMITS } from '@/lib/room/constants';
import type { Vec3 } from '@/lib/room/types';
import type { RoomFit } from './types';

export const EYE_HEIGHT = 1.5; // m: the phone's height while filming (spec 2026-10-07 sound §2)
export const DEFAULT_CEILING = 2.7;
export const MIN_CEILING = 2.2;
const FLOOR_Q = 0.02;
const CEILING_Q = 0.98;
const WALL_Q = 0.03;
const SEARCH_POINTS = 20_000; // the yaw search runs on a sample; the final walls use every point

/** The q-quantile of sorted values, interpolated. */
export function quantile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const i = q * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, sorted.length - 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function extent(points: Float32Array, yaw: number, stride: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const n = Math.floor(points.length / 3);
  const xs = new Float64Array(Math.ceil(n / stride));
  const zs = new Float64Array(xs.length);
  let j = 0;
  for (let i = 0; i < n; i += stride, j++) {
    const x = points[3 * i];
    const z = points[3 * i + 2];
    xs[j] = x * c + z * s;
    zs[j] = -x * s + z * c;
  }
  xs.sort();
  zs.sort();
  return { minX: quantile(xs, WALL_Q), maxX: quantile(xs, 1 - WALL_Q), minZ: quantile(zs, WALL_Q), maxZ: quantile(zs, 1 - WALL_Q) };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A box in metres around the upright splat (spec §2). `points` are xyz triples in world (upright) units; `cameras` the
 * video's camera positions in the same frame. Floor = 2nd percentile height; scale from the phone held 1.5 m up; walls =
 * the 3rd–97th percentile box at the yaw (0–89°) that gives the smallest floor area; ceiling = 98th percentile, or 2.7 m.
 */
export function fitRoom(points: Float32Array, cameras: Vec3[]): RoomFit {
  const n = Math.floor(points.length / 3);
  if (n === 0) throw new Error('No splat points to fit a room to');
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) ys[i] = points[3 * i + 1];
  ys.sort();
  const floorY = quantile(ys, FLOOR_Q);
  const topY = quantile(ys, CEILING_Q);
  const eye = cameras.length > 0 ? cameras.reduce((sum, c) => sum + c.y, 0) / cameras.length - floorY : 0;
  const scale = eye > 1e-6 ? EYE_HEIGHT / eye : 1;

  const stride = Math.max(1, Math.floor(n / SEARCH_POINTS));
  let yaw = 0;
  let bestArea = Infinity;
  for (let deg = 0; deg < 90; deg++) {
    const a = (deg * Math.PI) / 180;
    const e = extent(points, a, stride);
    const area = (e.maxX - e.minX) * (e.maxZ - e.minZ);
    if (area < bestArea) {
      bestArea = area;
      yaw = a;
    }
  }
  const { minX, maxX, minZ, maxZ } = extent(points, yaw, 1);
  let height = (topY - floorY) * scale;
  if (!(height >= MIN_CEILING)) height = DEFAULT_CEILING;
  const { minLengthWidth: lo, maxLengthWidth: hi, minHeight, maxHeight } = LIMITS;
  return {
    dims: { length: clamp((maxX - minX) * scale, lo, hi), width: clamp((maxZ - minZ) * scale, lo, hi), height: clamp(height, minHeight, maxHeight) },
    scale,
    yaw,
    floorY,
    minX,
    minZ,
  };
}

export function toRoom(fit: RoomFit, p: Vec3): Vec3 {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  return {
    x: (p.x * c + p.z * s - fit.minX) * fit.scale,
    y: (p.y - fit.floorY) * fit.scale,
    z: (-p.x * s + p.z * c - fit.minZ) * fit.scale,
  };
}

export function toWorld(fit: RoomFit, p: Vec3): Vec3 {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  const xr = p.x / fit.scale + fit.minX;
  const zr = p.z / fit.scale + fit.minZ;
  return { x: xr * c - zr * s, y: p.y / fit.scale + fit.floorY, z: xr * s + zr * c };
}

/** The room yaw (atan2 of z over x, as binaural.listenerYaw uses) of a world direction. */
export function roomYaw(fit: RoomFit, dir: Vec3): number {
  const c = Math.cos(fit.yaw);
  const s = Math.sin(fit.yaw);
  return Math.atan2(-dir.x * s + dir.z * c, dir.x * c + dir.z * s);
}

/** room metres → world, as a matrix: things drawn inside a group with this matrix are placed in room metres. */
export function roomToWorldMatrix(fit: RoomFit): THREE.Matrix4 {
  const k = 1 / fit.scale;
  return new THREE.Matrix4()
    .makeRotationY(-fit.yaw)
    .multiply(new THREE.Matrix4().makeTranslation(fit.minX, fit.floorY, fit.minZ))
    .multiply(new THREE.Matrix4().makeScale(k, k, k));
}
```

Create `src/lib/sound/soundRoom.ts`:

```ts
import { LIMITS } from '@/lib/room/constants';
import { validateRoom } from '@/lib/room/roomState';
import type { Dims, MaterialId, RoomObject, RoomState, SurfaceId, Vec3 } from '@/lib/room/types';

/** Fixed materials for a splat room (spec §2): the objects add the furniture. */
export const SOUND_SURFACES: Record<SurfaceId, MaterialId> = {
  floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'drywall',
};
export const SPEAKER_HEIGHT = 1.0; // m: on a stand
export const SPEAKER_WALL_GAP = 0.5;
const LISTENER_GAP = LIMITS.wallClearance + 0.01;
const SEPARATION = LIMITS.minSeparation + 0.01;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function soundRoom(dims: Dims, objects: RoomObject[], speaker: Vec3, listener: Vec3 & { yaw: number }): RoomState {
  return {
    v: 1,
    name: 'Video room',
    dims,
    surfaces: SOUND_SURFACES,
    furnishing: 'bare',
    speaker,
    listener,
    fixes: [],
    calibration: { factor: 1 },
    objects,
  };
}

export function clampSpeaker(dims: Dims, p: { x: number; z: number }): Vec3 {
  return {
    x: clamp(p.x, SPEAKER_WALL_GAP, dims.length - SPEAKER_WALL_GAP),
    y: Math.min(SPEAKER_HEIGHT, dims.height - SPEAKER_WALL_GAP),
    z: clamp(p.z, SPEAKER_WALL_GAP, dims.width - SPEAKER_WALL_GAP),
  };
}

/** The camera as a listener: kept inside the room and out of the speaker's 0.5 m (spec §7). Null if no valid spot is near. */
export function placeListener(dims: Dims, speaker: Vec3, p: Vec3): Vec3 | null {
  const inside = (q: Vec3): Vec3 => ({
    x: clamp(q.x, LISTENER_GAP, dims.length - LISTENER_GAP),
    y: clamp(q.y, LISTENER_GAP, dims.height - LISTENER_GAP),
    z: clamp(q.z, LISTENER_GAP, dims.width - LISTENER_GAP),
  });
  let q = inside(p);
  const dy = q.y - speaker.y;
  if (Math.hypot(q.x - speaker.x, dy, q.z - speaker.z) < SEPARATION) {
    let ux = q.x - speaker.x;
    let uz = q.z - speaker.z;
    const len = Math.hypot(ux, uz);
    if (len < 1e-6) [ux, uz] = [1, 0];
    else [ux, uz] = [ux / len, uz / len];
    const h = Math.sqrt(Math.max(0, SEPARATION * SEPARATION - dy * dy)) + 1e-6;
    q = inside({ x: speaker.x + ux * h, y: q.y, z: speaker.z + uz * h });
  }
  return validateRoom(soundRoom(dims, [], speaker, { ...q, yaw: 0 })).length === 0 ? q : null;
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run `npx vitest run src/lib/sound && npx tsc --noEmit`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: a room box in metres fitted to the upright splat" -- src/lib/sound/types.ts src/lib/sound/roomFit.ts src/lib/sound/roomFit.test.ts src/lib/sound/soundRoom.ts src/lib/sound/soundRoom.test.ts
```
(`git add` them first.)

---

### Task 4: Place the detected objects in 3D

**Files:**
- Create: `src/lib/sound/placeObjects.ts`
- Test: `src/lib/sound/placeObjects.test.ts`

**Interfaces:**
- Consumes:
  - `DetectionsFile` and `CameraPose` (`@/lib/splatJobs/protocol`, Task 1);
  - `RoomObject` and `ObjectLabel` (`@/lib/room/types`, Task 2);
  - `quantile` (`./roomFit`, Task 3).
- Produces:
  ```ts
  export function project(camera: CameraPose, x: number, y: number, z: number): { u: number; v: number; depth: number } | null;
  export function placeObjects(file: DetectionsFile, cameras: CameraPose[], points: Float32Array, toRoomPoint: (x: number, y: number, z: number) => Vec3, metresPerUnit: number): RoomObject[];
  ```
  `points` and `cameras` are in the raw splat frame. `toRoomPoint` maps a raw point to room metres. `metresPerUnit` is `fit.scale`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { CameraPose, DetectionsFile } from '@/lib/splatJobs/protocol';
import { placeObjects, project } from './placeObjects';

const camera = (name: string, x: number): CameraPose => ({
  id: 0, img_name: name, width: 1000, height: 1000, fx: 500, fy: 500, position: [x, 0, 0],
  rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], // right +x, down +y, forward +z
});
/** A 1 m cube of points at z 4–5, and a wall behind it at z = 10. */
function scene(): Float32Array {
  const out: number[] = [];
  for (let x = -0.5; x <= 0.5001; x += 0.05) for (let y = -0.5; y <= 0.5001; y += 0.05) for (let z = 4; z <= 5.0001; z += 0.05) out.push(x, y, z);
  for (let x = -3; x <= 3.0001; x += 0.05) for (let y = -3; y <= 3.0001; y += 0.05) out.push(x, y, 10);
  return new Float32Array(out);
}
const identity = (x: number, y: number, z: number) => ({ x, y, z });
const file = (frames: [string, number, number, number, number, string, number][]): DetectionsFile => ({
  frames: frames.map(([img_name, x0, y0, x1, y1, label, score]) => ({ img_name, width: 1000, height: 1000, detections: [{ label, score, box: [x0, y0, x1, y1] }] })),
});

describe('project', () => {
  it('maps a point ahead to pixels and drops points behind', () => {
    expect(project(camera('a', 0), 0.5, 0, 4)).toEqual({ u: 562.5, v: 500, depth: 4 });
    expect(project(camera('a', 0), 0, 0, -1)).toBeNull();
  });
});

describe('placeObjects', () => {
  const cameras = [camera('0001.jpg', 0), camera('0002.jpg', 0.2)];
  it('finds the cube, not the wall behind it, from two frames', () => {
    const objects = placeObjects(
      file([['0001.jpg', 430, 430, 570, 570, 'chair', 0.5], ['0002.jpg', 408, 430, 548, 570, 'chair', 0.5]]),
      cameras, scene(), identity, 1,
    );
    expect(objects).toHaveLength(1);
    const [o] = objects;
    expect(o.label).toBe('chair');
    expect((o.min.x + o.max.x) / 2).toBeCloseTo(0, 0);
    expect((o.min.z + o.max.z) / 2).toBeGreaterThan(4.2);
    expect((o.min.z + o.max.z) / 2).toBeLessThan(4.8);
    expect(o.max.z).toBeLessThan(5.2); // the wall at z = 10 was left out
  });
  it('drops objects seen in only one frame, maps desk to table, and ignores frames with no camera', () => {
    expect(placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    expect(placeObjects(file([['9999.jpg', 430, 430, 570, 570, 'chair', 0.5], ['9998.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    const desks = placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'desk', 0.5], ['0002.jpg', 408, 430, 548, 570, 'desk', 0.5]]), cameras, scene(), identity, 1);
    expect(desks.map((o) => o.label)).toEqual(['table']);
  });
});
```

- [ ] **Step 2: Run it to check it fails**

Run `npx vitest run src/lib/sound/placeObjects.test.ts`.
Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement**

```ts
import type { ObjectLabel, RoomObject, Vec3 } from '@/lib/room/types';
import type { CameraPose, DetectionsFile } from '@/lib/splatJobs/protocol';
import { quantile } from './roomFit';

const LABELS: Record<string, ObjectLabel> = {
  chair: 'chair', sofa: 'sofa', table: 'table', desk: 'table', whiteboard: 'whiteboard', television: 'television', window: 'window',
  curtains: 'curtains', rug: 'rug', bookshelf: 'bookshelf', bed: 'bed', cabinet: 'cabinet', plant: 'plant',
};
const CORE = 0.2; // trim this share off each side of a box for the depth estimate (spec §3.2: the central 60 %)
const FRONT_Q = 0.15;
const DEPTH_BEHIND_M = 1;
const DEPTH_AHEAD_M = 0.05;
const MIN_POINTS = 20;
const EXTENT_Q = 0.1;
const MERGE_M: Partial<Record<ObjectLabel, number>> = { chair: 0.5 };
const DEFAULT_MERGE_M = 0.7;
const MIN_FRAMES = 2;

/** Pixel and depth of a raw-frame point in a camera from cameras.json (columns: right, down, forward). Null behind it. */
export function project(camera: CameraPose, x: number, y: number, z: number): { u: number; v: number; depth: number } | null {
  const r = camera.rotation;
  const dx = x - camera.position[0];
  const dy = y - camera.position[1];
  const dz = z - camera.position[2];
  const cx = dx * r[0][0] + dy * r[1][0] + dz * r[2][0];
  const cy = dx * r[0][1] + dy * r[1][1] + dz * r[2][1];
  const depth = dx * r[0][2] + dy * r[1][2] + dz * r[2][2];
  if (depth <= 1e-6) return null;
  return { u: (camera.fx * cx) / depth + camera.width / 2, v: (camera.fy * cy) / depth + camera.height / 2, depth };
}

type Candidate = { label: ObjectLabel; centre: Vec3; size: Vec3; frame: string };

/**
 * Lift each 2D detection into the room (spec §3.2): the splat centres inside its box, from the front of what the box's
 * middle sees to 1 m behind it, give its 3D box; the same label across frames merges; an object needs two frames.
 */
export function placeObjects(
  file: DetectionsFile,
  cameras: CameraPose[],
  points: Float32Array,
  toRoomPoint: (x: number, y: number, z: number) => Vec3,
  metresPerUnit: number,
): RoomObject[] {
  const byName = new Map(cameras.map((c) => [c.img_name, c]));
  const n = Math.floor(points.length / 3);
  const candidates: Candidate[] = [];
  for (const frame of file.frames) {
    const camera = byName.get(frame.img_name);
    const detections = frame.detections.filter((d) => LABELS[d.label]);
    if (!camera || detections.length === 0 || !(frame.width > 0) || !(frame.height > 0)) continue;
    const us = new Float32Array(n);
    const vs = new Float32Array(n);
    const ds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = project(camera, points[3 * i], points[3 * i + 1], points[3 * i + 2]);
      if (p) [us[i], vs[i], ds[i]] = [p.u, p.v, p.depth];
    }
    const su = camera.width / frame.width;
    const sv = camera.height / frame.height;
    for (const d of detections) {
      const [x0, y0, x1, y1] = [d.box[0] * su, d.box[1] * sv, d.box[2] * su, d.box[3] * sv];
      const [cx0, cy0, cx1, cy1] = [x0 + CORE * (x1 - x0), y0 + CORE * (y1 - y0), x1 - CORE * (x1 - x0), y1 - CORE * (y1 - y0)];
      const inBox: number[] = [];
      const core: number[] = [];
      for (let i = 0; i < n; i++) {
        if (ds[i] <= 0 || us[i] < x0 || us[i] > x1 || vs[i] < y0 || vs[i] > y1) continue;
        inBox.push(i);
        if (us[i] >= cx0 && us[i] <= cx1 && vs[i] >= cy0 && vs[i] <= cy1) core.push(ds[i]);
      }
      if (core.length < MIN_POINTS) continue;
      core.sort((a, b) => a - b);
      const front = quantile(core, FRONT_Q);
      const near = front - DEPTH_AHEAD_M / metresPerUnit;
      const far = front + DEPTH_BEHIND_M / metresPerUnit;
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      for (const i of inBox) {
        if (ds[i] < near || ds[i] > far) continue;
        const r = toRoomPoint(points[3 * i], points[3 * i + 1], points[3 * i + 2]);
        xs.push(r.x);
        ys.push(r.y);
        zs.push(r.z);
      }
      if (xs.length < MIN_POINTS) continue;
      const span = (v: number[]) => {
        v.sort((a, b) => a - b);
        return [quantile(v, EXTENT_Q), quantile(v, 1 - EXTENT_Q)];
      };
      const [ax, bx] = span(xs);
      const [ay, by] = span(ys);
      const [az, bz] = span(zs);
      candidates.push({
        label: LABELS[d.label],
        centre: { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 },
        size: { x: bx - ax, y: by - ay, z: bz - az },
        frame: frame.img_name,
      });
    }
  }
  return merge(candidates);
}

const median = (v: number[]) => quantile([...v].sort((a, b) => a - b), 0.5);

function merge(candidates: Candidate[]): RoomObject[] {
  const clusters: { label: ObjectLabel; members: Candidate[]; centre: Vec3 }[] = [];
  for (const c of candidates) {
    const reach = MERGE_M[c.label] ?? DEFAULT_MERGE_M;
    let best: (typeof clusters)[number] | null = null;
    let bestDistance = reach;
    for (const k of clusters) {
      if (k.label !== c.label) continue;
      const distance = Math.hypot(k.centre.x - c.centre.x, k.centre.z - c.centre.z);
      if (distance <= bestDistance) [best, bestDistance] = [k, distance];
    }
    if (!best) {
      clusters.push({ label: c.label, members: [c], centre: { ...c.centre } });
      continue;
    }
    best.members.push(c);
    const m = best.members.length;
    best.centre = {
      x: best.centre.x + (c.centre.x - best.centre.x) / m,
      y: best.centre.y + (c.centre.y - best.centre.y) / m,
      z: best.centre.z + (c.centre.z - best.centre.z) / m,
    };
  }
  return clusters
    .filter((k) => new Set(k.members.map((m) => m.frame)).size >= MIN_FRAMES)
    .map((k) => {
      const size = { x: median(k.members.map((m) => m.size.x)), y: median(k.members.map((m) => m.size.y)), z: median(k.members.map((m) => m.size.z)) };
      return {
        label: k.label,
        min: { x: k.centre.x - size.x / 2, y: Math.max(0, k.centre.y - size.y / 2), z: k.centre.z - size.z / 2 },
        max: { x: k.centre.x + size.x / 2, y: k.centre.y + size.y / 2, z: k.centre.z + size.z / 2 },
      };
    });
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run `npx vitest run src/lib/sound && npx tsc --noEmit`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: detections are placed in the room by projecting the splat into each frame" -- src/lib/sound/placeObjects.ts src/lib/sound/placeObjects.test.ts
```
(`git add` them first.)

---

### Task 5: Score every speaker spot for the whole room

**Files:**
- Create: `src/lib/sound/bestSpot.ts`
- Test: `src/lib/sound/bestSpot.test.ts`
- (The heat-map pixels, `src/lib/sound/heat.ts`, belong to Task 7, their only user.)

**Interfaces:**
- Consumes:
  - `RoomState` and `RoomObject` (Task 2);
  - `blockingBoxes` (Task 2);
  - `ImageSourceInput.blockers` (Task 2);
  - `SpotMap` (Task 3);
  - `SPEAKER_HEIGHT` and `SPEAKER_WALL_GAP` (Task 3).
- Produces:
  - `findBestSpots(room: RoomState): SpotMap`;
  - `scoreSpeakerAt(room: RoomState, speaker: Vec3): number | null`.

- [ ] **Step 1: Write the failing tests**

`src/lib/sound/bestSpot.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { findBestSpots, scoreSpeakerAt } from './bestSpot';
import { soundRoom } from './soundRoom';

const dims = { length: 6, width: 4, height: 2.7 };
const room = (objects: RoomObject[] = []) => soundRoom(dims, objects, { x: 3, y: 1, z: 2 }, { x: 1, y: 1.2, z: 1, yaw: 0 });

describe('best speaker spot', () => {
  it('a corner scores below the middle of the room and the middle of a long wall', () => {
    const corner = scoreSpeakerAt(room(), { x: 0.5, y: 1, z: 0.5 })!;
    expect(corner).toBeLessThan(scoreSpeakerAt(room(), { x: 3, y: 1, z: 2 })!);
    expect(corner).toBeLessThan(scoreSpeakerAt(room(), { x: 3, y: 1, z: 0.5 })!);
  });

  it('a speaker behind a whiteboard scores lower than without it', () => {
    const whiteboard: RoomObject = { label: 'whiteboard', min: { x: 1.0, y: 0, z: 0.5 }, max: { x: 1.1, y: 2, z: 3.5 } };
    const spot = { x: 0.6, y: 1, z: 2 };
    expect(scoreSpeakerAt(room([whiteboard]), spot)!).toBeLessThan(scoreSpeakerAt(room(), spot)!);
  });

  it('maps the floor: cells on furniture are left out, the best is the top score, scores are 0–100', () => {
    const table: RoomObject = { label: 'table', min: { x: 2, y: 0, z: 1.5 }, max: { x: 4, y: 0.75, z: 2.5 } };
    const map = findBestSpots(room([table]));
    expect(map.nx * map.nz).toBe(map.scores.length);
    const at = (x: number, z: number) => map.scores[Math.round((z - map.z0) / map.step) * map.nx + Math.round((x - map.x0) / map.step)];
    expect(at(2.9, 2.1)).toBeNull(); // on the table
    const numbers = map.scores.filter((s): s is number => s !== null);
    expect(Math.max(...numbers)).toBe(map.best!.score);
    for (const s of numbers) expect(s).toBeGreaterThanOrEqual(0), expect(s).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: Run it to check it fails**

Run `npx vitest run src/lib/sound/bestSpot.test.ts`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement `src/lib/sound/bestSpot.ts`**

```ts
import { absorptionArea, makeSurfaceLookup, type SurfaceLookup } from '@/lib/acoustics/absorption';
import { SPEED_OF_SOUND } from '@/lib/acoustics/bands';
import { computeImageSources } from '@/lib/acoustics/imageSource';
import { blockingBoxes, type Box } from '@/lib/acoustics/objects';
import { totalSurfaceArea } from '@/lib/acoustics/reverbTime';
import { predictRt60 } from '@/lib/acoustics/simulate';
import type { Dims, RoomObject, RoomState, Vec3 } from '@/lib/room/types';
import { SPEAKER_HEIGHT, SPEAKER_WALL_GAP } from './soundRoom';
import type { SpotMap } from './types';

export const SPEAKER_STEP = 0.4;
export const LISTENER_STEP = 0.6;
export const EAR_HEIGHT = 1.2; // seated
export const LISTENER_WALL_GAP = 0.5;
export const MIN_LISTENER_DISTANCE = 1;
export const FOOTPRINT_GROW = 0.2;
export const SPOT_ORDER = 2;
/** Spec 2026-10-07 sound §6; retune on the real room if the best spot isn't believable. */
export const WEIGHTS = { coverage: 0.4, clarity: 0.35, bass: 0.25 };
const EARLY_SECONDS = 0.05; // C50
const BASS_FROM = 30;
const BASS_TO = 150;
const BASS_STEPS_PER_OCTAVE = 12;
const MAX_MODE_HZ = 200;

type Mode = { l: number; m: number; n: number; omega2: number; average: number };
type Context = {
  dims: Dims;
  lookup: SurfaceLookup;
  blockers: Box[];
  eRev: number;
  lateFraction: number;
  modes: Mode[];
  omegas: number[];
  delta: number;
  listeners: Vec3[];
  objects: RoomObject[];
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const std = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

function gridAxis(size: number, gap: number, step: number): number[] {
  if (size < 2 * gap) return [size / 2];
  const out: number[] = [];
  for (let v = gap; v <= size - gap + 1e-9; v += step) out.push(v);
  return out;
}

/** On something you can't stand or put a speaker on (rugs don't count). */
function onFootprint(objects: RoomObject[], x: number, z: number, grow: number): boolean {
  return objects.some(
    (o) => o.label !== 'rug' && x >= o.min.x - grow && x <= o.max.x + grow && z >= o.min.z - grow && z <= o.max.z + grow,
  );
}

function roomModes(dims: Dims): Mode[] {
  const modes: Mode[] = [];
  const c = SPEED_OF_SOUND;
  const max = (size: number) => Math.floor((2 * MAX_MODE_HZ * size) / c);
  for (let l = 0; l <= max(dims.length); l++)
    for (let m = 0; m <= max(dims.height); m++)
      for (let n = 0; n <= max(dims.width); n++) {
        if (l + m + n === 0) continue;
        const f = (c / 2) * Math.hypot(l / dims.length, m / dims.height, n / dims.width);
        if (f > MAX_MODE_HZ) continue;
        const nonZero = Number(l > 0) + Number(m > 0) + Number(n > 0);
        modes.push({ l, m, n, omega2: (2 * Math.PI * f) ** 2, average: 0.5 ** nonZero });
      }
  return modes;
}

const shape = (mode: Mode, dims: Dims, p: Vec3) =>
  Math.cos((mode.l * Math.PI * p.x) / dims.length) * Math.cos((mode.m * Math.PI * p.y) / dims.height) * Math.cos((mode.n * Math.PI * p.z) / dims.width);

function context(room: RoomState): Context {
  const { dims } = room;
  const objects = room.objects ?? [];
  const rt = predictRt60(room).bands;
  const area = absorptionArea(room);
  const aMid = (area[2] + area[3]) / 2;
  const alphaMid = Math.min(aMid / totalSurfaceArea(dims), 0.99);
  const roomConstant = aMid / (1 - alphaMid);
  const rtMid = (rt[2] + rt[3]) / 2;
  const omegas: number[] = [];
  for (let k = 0; BASS_FROM * 2 ** (k / BASS_STEPS_PER_OCTAVE) <= BASS_TO; k++) omegas.push(2 * Math.PI * BASS_FROM * 2 ** (k / BASS_STEPS_PER_OCTAVE));
  const listeners: Vec3[] = [];
  const y = Math.min(EAR_HEIGHT, dims.height - LISTENER_WALL_GAP);
  for (const z of gridAxis(dims.width, LISTENER_WALL_GAP, LISTENER_STEP))
    for (const x of gridAxis(dims.length, LISTENER_WALL_GAP, LISTENER_STEP)) if (!onFootprint(objects, x, z, 0)) listeners.push({ x, y, z });
  return {
    dims,
    lookup: makeSurfaceLookup(room),
    blockers: blockingBoxes(objects),
    eRev: (16 * Math.PI) / roomConstant, // reverberant energy in the image model's units (gain² = 1/r²)
    lateFraction: Math.exp((-13.82 * EARLY_SECONDS) / rtMid),
    modes: roomModes(dims),
    omegas,
    delta: 6.91 / rt[0],
    listeners,
    objects,
  };
}

/** dB spread across 30–150 Hz of the modal response between two points. */
function bassSpread(ctx: Context, shapesS: number[], r: Vec3): number {
  const shapesR = ctx.modes.map((mode) => shape(mode, ctx.dims, r));
  const levels = ctx.omegas.map((w) => {
    let re = 0;
    let im = 0;
    ctx.modes.forEach((mode, i) => {
      const a = mode.omega2 - w * w;
      const b = 2 * ctx.delta * w;
      const k = (shapesS[i] * shapesR[i]) / (a * a + b * b);
      re += k * a;
      im -= k * b;
    });
    return 10 * Math.log10(re * re + im * im + 1e-30);
  });
  return std(levels);
}

function scoreSpeaker(ctx: Context, s: Vec3): number | null {
  const listeners = ctx.listeners.filter((r) => Math.hypot(r.x - s.x, r.y - s.y, r.z - s.z) >= MIN_LISTENER_DISTANCE);
  if (listeners.length < 2) return null;
  const shapesS = ctx.modes.map((mode) => shape(mode, ctx.dims, s));
  const boost = 10 * Math.log10(shapesS.reduce((sum, v) => sum + v * v, 0) / ctx.modes.reduce((sum, m) => sum + m.average, 0));
  const levels: number[] = [];
  const clarity: number[] = [];
  const spreads: number[] = [];
  for (const r of listeners) {
    const arrivals = computeImageSources({ dims: ctx.dims, source: s, listener: r, maxOrder: SPOT_ORDER, lookup: ctx.lookup, blockers: ctx.blockers });
    const direct = Math.hypot(r.x - s.x, r.y - s.y, r.z - s.z) / SPEED_OF_SOUND;
    let early = 0;
    let total = 0;
    for (const a of arrivals) {
      const e = (a.gains[2] ** 2 + a.gains[3] ** 2) / 2;
      total += e;
      if (a.delay <= direct + EARLY_SECONDS) early += e;
    }
    levels.push(10 * Math.log10(total + ctx.eRev));
    clarity.push(10 * Math.log10(early / (ctx.eRev * ctx.lateFraction)));
    spreads.push(bassSpread(ctx, shapesS, r));
  }
  const coverage = clamp01(1 - std(levels) / 6);
  const clear = clamp01((mean(clarity) + 5) / 10);
  const bass = clamp01((12 - mean(spreads) - Math.max(0, boost)) / 9);
  return 100 * (WEIGHTS.coverage * coverage + WEIGHTS.clarity * clear + WEIGHTS.bass * bass);
}

export function scoreSpeakerAt(room: RoomState, speaker: Vec3): number | null {
  return scoreSpeaker(context(room), speaker);
}

/** Every speaker spot on a 0.4 m floor grid, scored for everyone in the room (spec §6). */
export function findBestSpots(room: RoomState): SpotMap {
  const ctx = context(room);
  const xs = gridAxis(room.dims.length, SPEAKER_WALL_GAP, SPEAKER_STEP);
  const zs = gridAxis(room.dims.width, SPEAKER_WALL_GAP, SPEAKER_STEP);
  const y = Math.min(SPEAKER_HEIGHT, room.dims.height - SPEAKER_WALL_GAP);
  const scores: (number | null)[] = [];
  let best: SpotMap['best'] = null;
  for (const z of zs)
    for (const x of xs) {
      const score = onFootprint(ctx.objects, x, z, FOOTPRINT_GROW) ? null : scoreSpeaker(ctx, { x, y, z });
      scores.push(score);
      if (score !== null && (!best || score > best.score)) best = { x, z, score };
    }
  return { x0: xs[0], z0: zs[0], step: SPEAKER_STEP, nx: xs.length, nz: zs.length, scores, best };
}
```

- [ ] **Step 4: Run the tests, check the speed, typecheck**

Run `npx vitest run src/lib/sound && npx tsc --noEmit`.
Expected: PASS.

Then time `findBestSpots(room())` in a scratch test. In a 6 × 4 m room it should finish within 3 s. If it's slower, lower `SPOT_ORDER` to 1 before anything else, and report it.

If the corner-ordering test fails, **don't fudge the weights**. Report the three sub-scores for each spot (coverage, clarity, bass and boost) as DONE_WITH_CONCERNS, and the controller will decide.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: every speaker spot scored for the whole room (coverage, clarity, even bass)" -- src/lib/sound/bestSpot.ts src/lib/sound/bestSpot.test.ts
```
(`git add` them first.)

---

### Task 6: The sound worker and its client

**Files:**
- Create: `src/lib/sound/protocol.ts`, `src/lib/sound/worker.ts`, `src/lib/sound/client.ts`
- Test: `src/lib/sound/protocol.test.ts`, `src/lib/sound/client.test.ts`

**Interfaces:**
- Consumes:
  - `simulateRoom` and `StereoIr` (`@/lib/acoustics/simulate`);
  - `normalizeLoudness` (`@/lib/acoustics/loudness`);
  - `validateRoom`;
  - `findBestSpots` (Task 5).
- Produces, in `src/lib/sound/client.ts`:
  ```ts
  export class SoundClient {
    constructor(createWorker?: () => WorkerLike);
    ir(room: RoomState, sampleRate: number): Promise<{ ir: StereoIr; rt60: number }>; // newest wins: a waiting request is superseded
    spots(room: RoomState): Promise<SpotMap>;
    dispose(): void;
  }
  export const SUPERSEDED = 'Superseded by a newer request';
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/sound/protocol.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { handleSound } from './protocol';
import { soundRoom } from './soundRoom';

const room = soundRoom({ length: 5, width: 4, height: 2.7 }, [], { x: 1, y: 1, z: 2 }, { x: 4, y: 1.2, z: 2, yaw: Math.PI });

describe('handleSound', () => {
  it('renders one loudness-matched stereo IR', () => {
    const res = handleSound({ id: 1, kind: 'ir', room, sampleRate: 16000 });
    expect(res).toMatchObject({ id: 1, ok: true, kind: 'ir' });
    if (res.ok && res.kind === 'ir') {
      expect(res.ir.left.length).toBeGreaterThan(1000);
      expect(res.rt60).toBeGreaterThan(0.1);
    }
  });
  it('scores spots', () => {
    const res = handleSound({ id: 2, kind: 'spots', room });
    expect(res.ok && res.kind === 'spots' && res.map.best).toBeTruthy();
  });
  it('refuses an invalid room', () => {
    expect(handleSound({ id: 3, kind: 'ir', room: { ...room, listener: { ...room.speaker, yaw: 0 } }, sampleRate: 16000 }).ok).toBe(false);
  });
});
```

`src/lib/sound/client.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { SoundRequest, SoundResponse } from './protocol';
import { SoundClient, SUPERSEDED, type WorkerLike } from './client';
import { soundRoom } from './soundRoom';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SoundResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  sent: SoundRequest[] = [];
  postMessage(message: SoundRequest) {
    this.sent.push(message);
  }
  terminate() {}
  answer(response: SoundResponse) {
    this.onmessage?.({ data: response } as MessageEvent<SoundResponse>);
  }
}
const room = soundRoom({ length: 5, width: 4, height: 2.7 }, [], { x: 1, y: 1, z: 2 }, { x: 4, y: 1.2, z: 2, yaw: 0 });

describe('SoundClient', () => {
  it('runs one IR at a time and keeps only the newest waiting one', async () => {
    const workers: FakeWorker[] = [];
    const client = new SoundClient(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    });
    const first = client.ir(room, 16000);
    const second = client.ir(room, 16000);
    const third = client.ir(room, 16000);
    await expect(second).rejects.toThrow(SUPERSEDED);
    const ir = { left: new Float32Array(1), right: new Float32Array(1), sampleRate: 16000 };
    const w = workers[0];
    w.answer({ id: w.sent[0].id, ok: true, kind: 'ir', ir, rt60: 0.4 });
    await expect(first).resolves.toEqual({ ir, rt60: 0.4 });
    expect(w.sent).toHaveLength(2);
    w.answer({ id: w.sent[1].id, ok: true, kind: 'ir', ir, rt60: 0.5 });
    await expect(third).resolves.toMatchObject({ rt60: 0.5 });
  });
});
```

- [ ] **Step 2: Run them to check they fail**

Run `npx vitest run src/lib/sound/protocol.test.ts src/lib/sound/client.test.ts`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement**

`src/lib/sound/protocol.ts`:

```ts
import { normalizeLoudness } from '@/lib/acoustics/loudness';
import { simulateRoom, type StereoIr } from '@/lib/acoustics/simulate';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { findBestSpots } from './bestSpot';
import type { SpotMap } from './types';

export type SoundRequest = { id: number; kind: 'ir'; room: RoomState; sampleRate: number } | { id: number; kind: 'spots'; room: RoomState };
export type SoundResponse =
  | { id: number; ok: true; kind: 'ir'; ir: StereoIr; rt60: number }
  | { id: number; ok: true; kind: 'spots'; map: SpotMap }
  | { id: number; ok: false; error: string };

export function handleSound(req: SoundRequest): SoundResponse {
  try {
    if (req.kind === 'spots') return { id: req.id, ok: true, kind: 'spots', map: findBestSpots(req.room) };
    const errors = validateRoom(req.room);
    if (errors.length > 0) return { id: req.id, ok: false, error: errors.map((e) => e.message).join(' ') };
    const result = simulateRoom(req.room, req.sampleRate);
    return { id: req.id, ok: true, kind: 'ir', ir: normalizeLoudness(result.ir), rt60: result.rt60.mid };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function soundTransferables(res: SoundResponse): ArrayBuffer[] {
  return res.ok && res.kind === 'ir' ? [res.ir.left.buffer as ArrayBuffer, res.ir.right.buffer as ArrayBuffer] : [];
}
```

`src/lib/sound/worker.ts`:

```ts
import { handleSound, soundTransferables, type SoundRequest } from './protocol';

addEventListener('message', (event: MessageEvent<SoundRequest>) => {
  const response = handleSound(event.data);
  postMessage(response, { transfer: soundTransferables(response) });
});
```

`src/lib/sound/client.ts`:

```ts
import type { StereoIr } from '@/lib/acoustics/simulate';
import type { RoomState } from '@/lib/room/types';
import type { SoundRequest, SoundResponse } from './protocol';
import type { SpotMap } from './types';

export type WorkerLike = {
  onmessage: ((event: MessageEvent<SoundResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SoundRequest): void;
  terminate(): void;
};
export const SUPERSEDED = 'Superseded by a newer request';
const CANCELLED = 'Sound cancelled';
const CRASHED = 'The sound worker stopped unexpectedly.';

const createModuleWorker = (): WorkerLike =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

type Job = { request: SoundRequest; resolve: (res: SoundResponse) => void; reject: (error: Error) => void };

/** One worker, one job at a time; only the newest waiting job is kept (like acoustics/client). */
class Lane {
  private worker: WorkerLike | null = null;
  private running: Job | null = null;
  private waiting: Job | null = null;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly create: () => WorkerLike) {}

  run(request: Omit<SoundRequest, 'id'>): Promise<SoundResponse> {
    if (this.disposed) return Promise.reject(new Error(CANCELLED));
    return new Promise((resolve, reject) => {
      this.waiting?.reject(new Error(SUPERSEDED));
      this.waiting = { request: { ...request, id: this.nextId++ } as SoundRequest, resolve, reject };
      this.startNext();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.running?.reject(new Error(CANCELLED));
    this.waiting?.reject(new Error(CANCELLED));
    this.running = this.waiting = null;
  }

  private startNext(): void {
    if (this.running || !this.waiting) return;
    this.running = this.waiting;
    this.waiting = null;
    this.ensureWorker().postMessage(this.running.request);
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.create();
    worker.onmessage = (event) => {
      const job = this.running;
      if (this.worker !== worker || !job || job.request.id !== event.data.id) return;
      this.running = null;
      job.resolve(event.data);
      this.startNext();
    };
    worker.onerror = (event) => {
      if (this.worker !== worker) return;
      event.preventDefault?.();
      worker.terminate();
      this.worker = null;
      const job = this.running;
      this.running = null;
      job?.reject(new Error(event.message || CRASHED));
      this.startNext();
    };
    this.worker = worker;
    return worker;
  }
}

/** Walking IRs and the best-spot map, each in its own worker so a map search never delays the sound (spec §6–7). */
export class SoundClient {
  private readonly irLane: Lane;
  private readonly spotLane: Lane;

  constructor(createWorker: () => WorkerLike = createModuleWorker) {
    this.irLane = new Lane(createWorker);
    this.spotLane = new Lane(createWorker);
  }

  async ir(room: RoomState, sampleRate: number): Promise<{ ir: StereoIr; rt60: number }> {
    const res = await this.irLane.run({ kind: 'ir', room, sampleRate });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'ir') throw new Error('Unexpected response');
    return { ir: res.ir, rt60: res.rt60 };
  }

  async spots(room: RoomState): Promise<SpotMap> {
    const res = await this.spotLane.run({ kind: 'spots', room });
    if (!res.ok) throw new Error(res.error);
    if (res.kind !== 'spots') throw new Error('Unexpected response');
    return res.map;
  }

  dispose(): void {
    this.irLane.dispose();
    this.spotLane.dispose();
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and lint**

Run `npx vitest run src/lib/sound && npx tsc --noEmit && npx eslint src/lib/sound`.
Expected: PASS and clean.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: a sound worker for walking IRs and the best-spot map" -- src/lib/sound/protocol.ts src/lib/sound/protocol.test.ts src/lib/sound/worker.ts src/lib/sound/client.ts src/lib/sound/client.test.ts
```
(`git add` them first.)

---

### Task 7: The viewer draws the speaker, heat map and object labels, and can place on the floor

**Files:**
- Modify: `src/lib/scene/SplatLayer.ts` (`centres()`)
- Modify: `src/lib/viewer/ViewerScene.ts` (overlay group, labels renderer, placement click, `pose()`, `onFrame`, `startView`, `splatCentres`)
- Create: `src/lib/viewer/floorPoint.ts`
- Create: `src/lib/viewer/SoundOverlay.ts`
- Create: `src/lib/sound/heat.ts` (the heat map's pixels; this task is its only user)
- Test: `src/lib/viewer/floorPoint.test.ts`, `src/lib/sound/heat.test.ts`

**Interfaces:**
- Consumes:
  - `RoomFit`, `SpotMap` and `roomToWorldMatrix` (Task 3);
  - `OBJECT_INFO` and `RoomObject` (Task 2).
- Produces:
  - `heatPixels(map: SpotMap): Uint8Array`: RGBA with nx × nz pixels, rows in z order (row 0 = `z0`), for a `THREE.DataTexture`;
  - `SplatLayer.centres(max?: number): Float32Array`: raw-frame xyz triples, strided down to at most `max` (default 200 000);
  - `ViewerScene` gains:
    - `readonly overlay: THREE.Group`, which is in world coordinates;
    - `onFrame: (() => void) | null`;
    - `get startView(): StartView | null`;
    - `get splatCentres(): Float32Array`;
    - `pose(): { position: THREE.Vector3; forward: THREE.Vector3 }`;
    - `armPlacement(floorY: number, onPlace: (world: THREE.Vector3) => void): void`;
  - `floorPoint(ray: THREE.Ray, floorY: number): THREE.Vector3 | null`;
  - `SoundOverlay`, with `constructor(fit: RoomFit)`, `root: THREE.Group`, `setSpeaker(p: Vec3 | null)`, `setObjects(objects: RoomObject[])`, `setSpots(map: SpotMap | null)` and `dispose()`. Everything is given in room metres.

- [ ] **Step 1: Write the failing test**

`src/lib/viewer/floorPoint.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { floorPoint } from './floorPoint';

describe('floorPoint', () => {
  it('meets the floor ahead, and is null looking up or level', () => {
    const down = new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, -1, 0).normalize());
    expect(floorPoint(down, 0.5)!.toArray().map((v) => +v.toFixed(6))).toEqual([1.5, 0.5, 0]);
    expect(floorPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 1, 0)), 0)).toBeNull();
    expect(floorPoint(new THREE.Ray(new THREE.Vector3(0, 2, 0), new THREE.Vector3(1, 0, 0)), 0)).toBeNull();
  });
});
```

`src/lib/sound/heat.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { heatPixels } from './heat';

describe('heatPixels', () => {
  it('best is green, worst is red, gaps are clear, rows follow z', () => {
    const px = heatPixels({ x0: 0.5, z0: 0.5, step: 0.4, nx: 2, nz: 2, scores: [10, 90, null, 50], best: { x: 0.9, z: 0.5, score: 90 } });
    const pixel = (i: number) => Array.from(px.slice(4 * i, 4 * i + 4));
    const [worst, best, gap] = [pixel(0), pixel(1), pixel(2)];
    expect(worst[0]).toBeGreaterThan(worst[1]); // red
    expect(best[1]).toBeGreaterThan(best[0]); // green
    expect(gap[3]).toBe(0);
    expect(best[3]).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run them to check they fail**

Run `npx vitest run src/lib/viewer/floorPoint.test.ts src/lib/sound/heat.test.ts`.
Expected: FAIL (the modules are missing).

- [ ] **Step 3: Implement**

`src/lib/sound/heat.ts`:

```ts
import type { SpotMap } from './types';

const ALPHA = 150; // of 255: the room still shows through

/** Red (worst on this map) → yellow → green (best), one RGBA pixel per cell, rows in z order. Cells off the map are clear. */
export function heatPixels(map: SpotMap): Uint8Array {
  const out = new Uint8Array(map.nx * map.nz * 4);
  const numbers = map.scores.filter((s): s is number => s !== null);
  const lo = Math.min(...numbers);
  const hi = Math.max(...numbers);
  map.scores.forEach((score, i) => {
    if (score === null) return;
    const t = hi > lo ? (score - lo) / (hi - lo) : 1;
    out[4 * i] = Math.round(255 * Math.min(1, 2 * (1 - t)));
    out[4 * i + 1] = Math.round(255 * Math.min(1, 2 * t));
    out[4 * i + 2] = 40;
    out[4 * i + 3] = ALPHA;
  });
  return out;
}
```

`src/lib/viewer/floorPoint.ts`:

```ts
import * as THREE from 'three';

/** Where a click's ray meets the floor plane y = floorY (spec §5: the floor plane, not the splat). Null if it never does. */
export function floorPoint(ray: THREE.Ray, floorY: number): THREE.Vector3 | null {
  if (ray.direction.y > -1e-6) return null;
  return ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
}
```

`src/lib/scene/SplatLayer.ts`: add this method after `get targets()`:

```ts
  /** The splat centres in the scan's own frame as xyz triples, every k-th one so there are at most `max`. */
  centres(max = 200_000): Float32Array {
    const packed = this.mesh?.packedSplats;
    const count = packed?.numSplats ?? 0;
    if (!packed || count === 0) return new Float32Array(0);
    const stride = Math.max(1, Math.ceil(count / max));
    const out = new Float32Array(Math.ceil(count / stride) * 3);
    let j = 0;
    packed.forEachSplat((index, c) => {
      if (index % stride !== 0) return;
      out[j++] = c.x;
      out[j++] = c.y;
      out[j++] = c.z;
    });
    return out.subarray(0, j);
  }
```

`src/lib/viewer/ViewerScene.ts` changes (keep everything else as it is):
1. Imports: `import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';` and `import { floorPoint } from './floorPoint';`.
2. New fields:

```ts
  /** Things drawn in the room (speaker, heat map, labels), in world coordinates. */
  readonly overlay = new THREE.Group();
  /** Called every frame before rendering (the sound follows the camera). */
  onFrame: (() => void) | null = null;
  private readonly labels = new CSS2DRenderer();
  private placing: { floorY: number; onPlace: (world: THREE.Vector3) => void } | null = null;
```

3. In the constructor, after the scene background is set:

```ts
    this.scene.add(this.overlay);
    const el = this.labels.domElement;
    el.style.position = 'absolute';
    el.style.inset = '0';
    el.style.pointerEvents = 'none';
    canvas.parentElement?.appendChild(el);
```

4. New public members:

```ts
  get startView(): StartView | null {
    return this.view;
  }

  /** The splat's centres in its own (raw) frame; empty before a room is open. */
  get splatCentres(): Float32Array {
    return this.layer?.centres() ?? new Float32Array(0);
  }

  pose(): { position: THREE.Vector3; forward: THREE.Vector3 } {
    return { position: this.camera.position.clone(), forward: this.camera.getWorldDirection(new THREE.Vector3()) };
  }

  /** The next click on the floor calls `onPlace` with where it landed, instead of locking the pointer (spec §5). */
  armPlacement(floorY: number, onPlace: (world: THREE.Vector3) => void): void {
    this.placing = { floorY, onPlace };
    if (this.locked) document.exitPointerLock();
    this.canvas.style.cursor = 'crosshair';
  }
```

5. In the `click` handler, right after `this.pressedAt = null;` and before any early return, add this block. A click on the sky leaves it armed.

```ts
    if (this.placing && from && Math.hypot(event.clientX - from.x, event.clientY - from.y) <= CLICK_SLOP_PX) {
      const rect = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, this.camera);
      const hit = floorPoint(raycaster.ray, this.placing.floorY);
      if (hit) {
        const { onPlace } = this.placing;
        this.placing = null;
        this.canvas.style.cursor = '';
        onPlace(hit);
      }
      return;
    }
```

6. In `resize`, add `this.labels.setSize(width, height);`.
7. In `tick`, call `this.onFrame?.();` before `this.renderer.render(...)`, and add `this.labels.render(this.scene, this.camera);` after it.
8. In `dispose`, add `this.onFrame = null;` and `this.labels.domElement.remove();`.

`src/lib/viewer/SoundOverlay.ts`:

```ts
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { OBJECT_INFO } from '@/lib/acoustics/objects';
import type { RoomObject, Vec3 } from '@/lib/room/types';
import { heatPixels } from '@/lib/sound/heat';
import { roomToWorldMatrix } from '@/lib/sound/roomFit';
import type { RoomFit, SpotMap } from '@/lib/sound/types';

const CREAM = 0xffedd7;
const BEST = 0x3ddc84;
const ON_TOP = 10; // drawn after the splat, which writes no depth

function chip(text: string, className: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = `rounded-full border bg-walnut/80 px-2.5 py-1 text-micro whitespace-nowrap ${className}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

/** The sound features drawn in the room (spec §5, §6, §8). Children are placed in room metres; `root` maps them to world. */
export class SoundOverlay {
  readonly root = new THREE.Group();
  private readonly speaker = new THREE.Group();
  private readonly marker = new THREE.Group();
  private heat: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private labels: CSS2DObject[] = [];

  constructor(fit: RoomFit) {
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(roomToWorldMatrix(fit));
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.35, 0.2), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 48),
      new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = ON_TOP;
    this.speaker.add(body, ring);
    this.speaker.visible = false;
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4), new THREE.MeshBasicMaterial({ color: BEST, depthTest: false }));
    pin.position.y = 0.7;
    pin.renderOrder = ON_TOP;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.26, 48),
      new THREE.MeshBasicMaterial({ color: BEST, depthTest: false, side: THREE.DoubleSide }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.04;
    halo.renderOrder = ON_TOP;
    const label = chip('Best spot', 'border-[#3ddc84] text-[#3ddc84]');
    label.position.y = 1.55;
    this.marker.add(pin, halo, label);
    this.marker.visible = false;
    this.root.add(this.speaker, this.marker);
  }

  setSpeaker(p: Vec3 | null): void {
    this.speaker.visible = p !== null;
    if (!p) return;
    this.speaker.position.set(p.x, 0, p.z);
    this.speaker.children[0].position.y = p.y; // the box sits at speaker height; the ring stays on the floor
    this.speaker.children[1].position.y = 0.03;
  }

  setObjects(objects: RoomObject[]): void {
    for (const l of this.labels) this.root.remove(l);
    this.labels = objects.map((o) => {
      const info = OBJECT_INFO[o.label];
      const l = chip(
        `${info.name} · ${info.absorbs ? 'absorbs' : 'reflects'}`,
        info.absorbs ? 'border-[#5fd4c4] text-[#5fd4c4]' : 'border-[#f0a540] text-[#f0a540]',
      );
      l.position.set((o.min.x + o.max.x) / 2, o.max.y + 0.15, (o.min.z + o.max.z) / 2);
      this.root.add(l);
      return l;
    });
  }

  setSpots(map: SpotMap | null): void {
    if (this.heat) {
      this.root.remove(this.heat);
      this.heat.material.map?.dispose();
      this.heat.material.dispose();
      this.heat.geometry.dispose();
      this.heat = null;
    }
    this.marker.visible = !!map?.best;
    if (!map) return;
    const texture = new THREE.DataTexture(heatPixels(map), map.nx, map.nz, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(map.nx * map.step, map.nz * map.step),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    plane.rotation.x = Math.PI / 2; // local +Y → room +Z, so texture row 0 (v = 0) is the z0 row
    plane.position.set(map.x0 + ((map.nx - 1) * map.step) / 2, 0.03, map.z0 + ((map.nz - 1) * map.step) / 2);
    plane.renderOrder = ON_TOP - 1;
    this.heat = plane;
    this.root.add(plane);
    if (map.best) this.marker.position.set(map.best.x, 0, map.best.z);
  }

  dispose(): void {
    this.setSpots(null);
    for (const l of this.labels) this.root.remove(l);
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
```

- [ ] **Step 4: Run the tests, typecheck and lint**

Run `npx vitest run src/lib/viewer src/lib/scene && npx tsc --noEmit && npx eslint src/lib/viewer src/lib/scene/SplatLayer.ts`.
Expected: PASS and clean, including `SplatLayer.test.ts`. If its Spark mock lacks `forEachSplat` with an index, extend the mock rather than changing `centres()`.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: the viewer can place on the floor and draw the speaker, heat map and object labels" -- src/lib/scene/SplatLayer.ts src/lib/viewer/ViewerScene.ts src/lib/viewer/floorPoint.ts src/lib/viewer/floorPoint.test.ts src/lib/viewer/SoundOverlay.ts
```
(`git add` the new files first.) Add `src/lib/sound/heat.ts` and its test to the commit if this task created them.

---

### Task 8: Sound controller, panel and wiring: place, search, play and walk

**Files:**
- Create: `src/lib/viewer/SoundController.ts`
- Create: `src/components/SoundPanel.tsx`
- Modify: `src/components/SplatViewer.tsx`

**Interfaces:**
- Consumes everything above. In particular:
  - `fetchDetections` and `placeObjects`;
  - `fitRoom`, `toRoom` and `roomYaw`;
  - `soundRoom`, `clampSpeaker` and `placeListener`;
  - `scoreSpeakerAt`;
  - `SoundClient`;
  - `SoundOverlay`;
  - the `ViewerScene` hooks from Task 7;
  - `AudioEngine` (`loadClip`, `play`, `pause`, `setIrs`, `sampleRate`, `dispose`) and `silentIr` from `@/lib/audio/mix`;
  - `synthClip`, `DEMO_CLIPS` and `DemoClipId`.
- Produces:
  - `SoundController.create(scene, roomId, cameras): SoundController | null`;
  - the store, through the arrow functions `subscribe` and `getState` (so `useSyncExternalStore` can use them as they are);
  - the actions `placeSpeaker()`, `findBestSpot()`, `moveSpeakerToBest()`, `togglePlay()`, `setClip(id)` and `dispose()`.

- [ ] **Step 1: Read the Next guide for client components**

Skim `node_modules/next/dist/docs/` for anything on `'use client'` and `useSyncExternalStore` in this version. Note any deprecation that affects a `'use client'` component using that hook.

- [ ] **Step 2: Implement `src/lib/viewer/SoundController.ts`**

```ts
import * as THREE from 'three';
import { predictRt60 } from '@/lib/acoustics/simulate';
import { synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import { silentIr } from '@/lib/audio/mix';
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { scoreSpeakerAt } from '@/lib/sound/bestSpot';
import { SoundClient } from '@/lib/sound/client';
import { placeObjects } from '@/lib/sound/placeObjects';
import { fitRoom, roomYaw, toRoom } from '@/lib/sound/roomFit';
import { clampSpeaker, placeListener, soundRoom } from '@/lib/sound/soundRoom';
import type { RoomFit, SpotMap } from '@/lib/sound/types';
import { fetchDetections } from '@/lib/splatJobs/client';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { SoundOverlay } from './SoundOverlay';
import type { ViewerScene } from './ViewerScene';

export const MOVE_TO_RENDER = 0.25; // m (spec §7)
export const TURN_TO_RENDER = (15 * Math.PI) / 180;

export type SoundState = {
  dims: Dims;
  rt60: number;
  objects: 'finding' | 'failed' | RoomObject[];
  speaker: Vec3 | null;
  placing: boolean;
  spots: 'idle' | 'finding' | 'failed' | SpotMap;
  speakerScore: number | null;
  playing: boolean;
  clip: DemoClipId;
};

const vec = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Sound in the splat viewer (spec 2026-10-07 sound): objects, the speaker, the best spot and walking audio. Browser only. */
export class SoundController {
  private state: SoundState;
  private readonly listeners = new Set<() => void>();
  private readonly overlay: SoundOverlay;
  private readonly client = new SoundClient();
  private engine: AudioEngine | null = null;
  private clipLoaded: DemoClipId | null = null;
  private lastRender: { position: Vec3; yaw: number } | null = null;
  private rendering = false;
  private disposed = false;

  /** Null without a cameras file: no scale, so no sound (spec §2). */
  static create(scene: ViewerScene, roomId: string, cameras: CameraPose[] | null): SoundController | null {
    const view = scene.startView;
    const raw = scene.splatCentres;
    if (!view || !cameras?.length || raw.length === 0) return null;
    const q = view.rotation;
    const upright = new Float32Array(raw.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < raw.length; i += 3) {
      v.set(raw[i], raw[i + 1], raw[i + 2]).applyQuaternion(q);
      [upright[i], upright[i + 1], upright[i + 2]] = [v.x, v.y, v.z];
    }
    const fit = fitRoom(upright, cameras.map((c) => vec(new THREE.Vector3(...c.position).applyQuaternion(q))));
    return new SoundController(scene, roomId, cameras, raw, q, fit);
  }

  private constructor(
    private readonly scene: ViewerScene,
    roomId: string,
    cameras: CameraPose[],
    raw: Float32Array,
    rotation: THREE.Quaternion,
    private readonly fit: RoomFit,
  ) {
    this.overlay = new SoundOverlay(fit);
    scene.overlay.add(this.overlay.root);
    this.state = {
      dims: fit.dims,
      rt60: this.rt60([]),
      objects: 'finding',
      speaker: null,
      placing: false,
      spots: 'idle',
      speakerScore: null,
      playing: false,
      clip: 'drums',
    };
    scene.onFrame = this.frame;
    void fetchDetections(roomId).then((file) => {
      if (this.disposed) return;
      if (!file) return this.set({ objects: 'failed' });
      const toRoomPoint = (x: number, y: number, z: number) => toRoom(fit, vec(new THREE.Vector3(x, y, z).applyQuaternion(rotation)));
      const objects = placeObjects(file, cameras, raw, toRoomPoint, fit.scale);
      this.overlay.setObjects(objects);
      this.overlay.setSpots(null);
      this.lastRender = null; // the room changed: re-render the sound
      this.set({ objects, rt60: this.rt60(objects), spots: 'idle', speakerScore: this.score(objects, this.state.speaker) });
    });
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): SoundState => this.state;

  placeSpeaker(): void {
    this.set({ placing: true });
    this.scene.armPlacement(this.fit.floorY, (world) => {
      if (this.disposed) return;
      const p = toRoom(this.fit, vec(world));
      this.setSpeaker(clampSpeaker(this.fit.dims, p));
    });
  }

  findBestSpot(): void {
    this.set({ spots: 'finding' });
    this.client
      .spots(this.room(this.state.speaker ?? clampSpeaker(this.fit.dims, { x: 0, z: 0 })))
      .then((map) => {
        if (this.disposed) return;
        this.overlay.setSpots(map);
        this.set({ spots: map });
      })
      .catch(() => {
        if (!this.disposed) this.set({ spots: 'failed' });
      });
  }

  moveSpeakerToBest(): void {
    const { spots } = this.state;
    if (typeof spots === 'object' && spots.best) this.setSpeaker(clampSpeaker(this.fit.dims, spots.best));
  }

  togglePlay(): void {
    if (!this.state.speaker) return;
    this.engine ??= new AudioEngine();
    if (this.state.playing) {
      this.engine.pause();
      return this.set({ playing: false });
    }
    if (this.clipLoaded !== this.state.clip) {
      this.engine.loadClip(synthClip(this.state.clip, this.engine.sampleRate), this.engine.sampleRate);
      this.clipLoaded = this.state.clip;
    }
    this.lastRender = null;
    void this.engine.play();
    this.set({ playing: true });
  }

  setClip(clip: DemoClipId): void {
    if (clip === this.state.clip) return;
    const wasPlaying = this.state.playing;
    this.set({ clip });
    if (!this.engine) return;
    this.engine.loadClip(synthClip(clip, this.engine.sampleRate), this.engine.sampleRate); // pauses
    this.clipLoaded = clip;
    if (wasPlaying) void this.engine.play();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.scene.onFrame === this.frame) this.scene.onFrame = null;
    this.client.dispose();
    this.engine?.dispose();
    this.overlay.dispose();
    this.listeners.clear();
  }

  private get objects(): RoomObject[] {
    return Array.isArray(this.state.objects) ? this.state.objects : [];
  }

  private room(speaker: Vec3, listener?: Vec3 & { yaw: number }) {
    const fallback = placeListener(this.fit.dims, speaker, { x: 0, y: 1.2, z: 0 }) ?? speaker;
    return soundRoom(this.fit.dims, this.objects, speaker, listener ?? { ...fallback, yaw: 0 });
  }

  private rt60(objects: RoomObject[]): number {
    const speaker = clampSpeaker(this.fit.dims, { x: 0, z: 0 });
    const listener = placeListener(this.fit.dims, speaker, { x: this.fit.dims.length, y: 1.2, z: this.fit.dims.width }) ?? speaker;
    return predictRt60(soundRoom(this.fit.dims, objects, speaker, { ...listener, yaw: 0 })).mid;
  }

  private score(objects: RoomObject[], speaker: Vec3 | null): number | null {
    if (!speaker) return null;
    return scoreSpeakerAt(soundRoom(this.fit.dims, objects, speaker, { ...speaker, yaw: 0 }), speaker);
  }

  private setSpeaker(speaker: Vec3): void {
    this.overlay.setSpeaker(speaker);
    this.lastRender = null;
    this.set({ speaker, placing: false, speakerScore: this.score(this.objects, speaker) });
  }

  /** Every frame: while music plays, re-render the room's sound once you've moved 25 cm or turned 15° (spec §7). */
  private readonly frame = (): void => {
    const { speaker, playing } = this.state;
    if (this.disposed || !playing || !speaker || this.rendering || !this.engine) return;
    const pose = this.scene.pose();
    const position = toRoom(this.fit, vec(pose.position));
    const yaw = roomYaw(this.fit, vec(pose.forward));
    const last = this.lastRender;
    if (last) {
      const moved = Math.hypot(position.x - last.position.x, position.y - last.position.y, position.z - last.position.z);
      const turned = Math.abs(Math.atan2(Math.sin(yaw - last.yaw), Math.cos(yaw - last.yaw)));
      if (moved < MOVE_TO_RENDER && turned < TURN_TO_RENDER) return;
    }
    const listener = placeListener(this.fit.dims, speaker, position);
    if (!listener) return;
    this.rendering = true;
    this.lastRender = { position, yaw };
    const engine = this.engine;
    this.client
      .ir(this.room(speaker, { ...listener, yaw }), engine.sampleRate)
      .then(({ ir }) => {
        if (!this.disposed) engine.setIrs(ir, silentIr(ir.sampleRate));
      })
      .catch(() => {}) // superseded or a bad spot: the next move tries again
      .finally(() => {
        this.rendering = false;
      });
  };

  private set(patch: Partial<SoundState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
```

`scoreSpeakerAt` only reads the room's dims, surfaces and objects, and the `speaker` argument. It ignores `room.listener`, so passing the speaker as the listener in `score()` is fine.

- [ ] **Step 3: Implement `src/components/SoundPanel.tsx`**

```tsx
'use client';

import { useSyncExternalStore } from 'react';
import { OBJECT_INFO } from '@/lib/acoustics/objects';
import { DEMO_CLIPS } from '@/lib/audio/demoClips';
import type { RoomObject } from '@/lib/room/types';
import type { SoundController } from '@/lib/viewer/SoundController';

/** "Chair ×5, Table ×2" for the objects that absorb (or reflect). */
function summary(objects: RoomObject[], absorbs: boolean): string {
  const counts = new Map<string, number>();
  for (const o of objects) if (OBJECT_INFO[o.label].absorbs === absorbs) counts.set(OBJECT_INFO[o.label].name, (counts.get(OBJECT_INFO[o.label].name) ?? 0) + 1);
  return [...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ') || 'Nothing found';
}

/** The sound panel, top right of the viewer (spec 2026-10-07 sound §8). */
export function SoundPanel({ controller }: { controller: SoundController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const map = typeof s.spots === 'object' ? s.spots : null;
  const scoreLine = [
    s.speakerScore !== null && `This spot: ${Math.round(s.speakerScore)}/100`,
    map?.best && `Best: ${Math.round(map.best.score)}/100`,
  ].filter(Boolean).join(' · ');

  return (
    <aside className="absolute right-0 top-0 m-4 flex max-h-[calc(100%-2rem)] w-[300px] max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-card border border-cork bg-walnut/80 p-5 sm:m-6">
      <section className="flex flex-col gap-1.5">
        <h2 className="text-heading-sm">Sound</h2>
        <p className="text-label text-cream/70">
          About {s.dims.length.toFixed(1)} × {s.dims.width.toFixed(1)} × {s.dims.height.toFixed(1)} m · Echo time {s.rt60.toFixed(2)} s
        </p>
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Speaker</span>
        <button className={s.speaker ? 'ghost' : 'pill'} onClick={() => controller.placeSpeaker()} disabled={s.placing}>
          {s.placing ? 'Click the floor' : s.speaker ? 'Move speaker' : 'Place speaker'}
        </button>
        <button className="ghost" onClick={() => controller.findBestSpot()} disabled={s.spots === 'finding'}>
          {s.spots === 'finding' ? 'Finding the best spot' : 'Find the best spot'}
        </button>
        {map?.best && (
          <button className="ghost" onClick={() => controller.moveSpeakerToBest()}>
            Move speaker here
          </button>
        )}
        {s.spots === 'failed' && <p className="voice text-label text-cream/70">Couldn&apos;t score the room. Try again.</p>}
        {scoreLine && <p className="text-label text-cream/70">{scoreLine}</p>}
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Listen</span>
        <button className={s.speaker ? 'pill' : 'ghost'} onClick={() => controller.togglePlay()} disabled={!s.speaker}>
          {s.playing ? 'Pause' : 'Play'}
        </button>
        {!s.speaker && <p className="voice text-label text-cream/70">Place the speaker first.</p>}
        <div className="flex gap-2" role="group" aria-label="Music">
          {DEMO_CLIPS.map((clip) => (
            <button
              key={clip.id}
              className={`ghost flex-1 ${s.clip === clip.id ? 'bg-cream text-walnut' : ''}`}
              aria-pressed={s.clip === clip.id}
              onClick={() => controller.setClip(clip.id)}
            >
              {clip.label}
            </button>
          ))}
        </div>
        <p className="voice text-label text-cream/70">Use headphones. Walk with W A S D.</p>
      </section>

      <section className="rule flex flex-col gap-2 pt-4">
        <span className="text-label">Objects</span>
        {s.objects === 'finding' && <p className="voice text-label text-cream/70">Finding objects… (about a minute the first time)</p>}
        {s.objects === 'failed' && <p className="voice text-label text-cream/70">Couldn&apos;t find objects. Sound still works without them.</p>}
        {Array.isArray(s.objects) && (
          <>
            <p className="text-label">
              <span className="text-[#5fd4c4]">Absorbs sound</span>
              <span className="voice block text-cream/70">{summary(s.objects, true)}</span>
            </p>
            <p className="text-label">
              <span className="text-[#f0a540]">Reflects sound</span>
              <span className="voice block text-cream/70">{summary(s.objects, false)}</span>
            </p>
          </>
        )}
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Wire it into `src/components/SplatViewer.tsx`**

1. Imports: `SoundPanel` from `./SoundPanel`, and `SoundController` from `@/lib/viewer/SoundController`.
2. State: `const [sound, setSound] = useState<SoundController | null>(null);`. In the room-switch block that runs during render, add `setSound(null);` beside `setStatus('loading');`.
3. In the effect, declare `let controller: SoundController | null = null;` before the `Promise.all`. After `await scene.open(bytes, cameras);`, replace `if (live) setStatus('ready');` with:

```tsx
        if (!live) return;
        setStatus('ready');
        controller = SoundController.create(scene, roomId, cameras);
        setSound(controller);
```

4. In the cleanup, call `controller?.dispose();` before `scene.dispose();`.
5. In the JSX, after the controls `<ul>`, add: `{status === 'ready' && webgl && sound && <SoundPanel controller={sound} />}`.

- [ ] **Step 5: Typecheck, lint, the full test run and a build**

Run `npx tsc --noEmit && npx eslint src && npx vitest run && npx next build`.
Expected: all clean, and the build exports `out/` with the sound worker chunk present.

- [ ] **Step 6: A quick check in the browser**

Start the demo server per [[windows-process-control]]: `Start-Process` it and keep the PID; don't use the TaskStop/npm route. Run `npm run demo:serve`, since the build already ran. Then open `http://localhost:8080/#room=1c59fe0f-02bb-4ddd-97c6-118bb432c93d` in Chrome with the DevTools MCP and confirm:
- the panel shows the room size and echo time;
- the objects arrive with chips in 3D (this is quick, because `detections.json` exists from Task 1);
- Place speaker → a floor click shows the speaker and its ring;
- clicking the sky while armed does nothing and stays armed;
- Find the best spot shows the heat map and the marker;
- Move speaker here moves it;
- Play doesn't throw;
- W/A/S/D while playing raises no console errors;
- Back closes the viewer with the audio stopped and no errors.

Stop the server by its PID.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: sound in the splat viewer: place the speaker, find the best spot, walk and listen" -- src/lib/viewer/SoundController.ts src/components/SoundPanel.tsx src/components/SplatViewer.tsx
```
(`git add` the new files first.)

---

### Task 9 (controller): real check on the conference room, and follow-ups

Do this yourself; it isn't dispatched.

- [ ] **Build and serve:** run `npm run demo` (Start-Process, keep the PID) and open job `1c59fe0f-…` in Chrome.
- [ ] **Look at the result:**
  - the fitted room size is plausible for a meeting room (about 4–7 m by 3–5 m, 2.4–3 m high);
  - the chairs, oval table and whiteboard are labelled near where they are;
  - the best spot isn't in a corner and isn't behind the whiteboard.
- [ ] **If something is off**, tune it before the demo: `EYE_HEIGHT` for size, `WEIGHTS` for the best spot, or the per-label thresholds in `detect.ts`. Record each change as a ruling.
- [ ] **Leave the headphone check to the user:** walking toward, away from and behind the whiteboard, and turning the head.
- [ ] **Write `docs/superpowers/plans/2026-10-07-room-remix-plan-8-followups.md`.** It holds the rulings, what was cut, and what the user must check. Stop the server by its PID, and commit the doc by path.
