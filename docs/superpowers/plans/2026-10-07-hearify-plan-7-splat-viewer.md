# Hearify: Plan 7, Splat Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home page with a computer-only page. You import a room video, the laptop builds the splat with the existing pipeline, and you walk around it Memento-style (orbit and zoom, W/A/S/D and Q/E, click for mouse look). The page also lists earlier rooms.

**Architecture:**
- **Server:** OpenSplat also writes `cameras.json`. The demo server lists finished rooms (`GET /api/splat/rooms`) and serves each room's cameras (`GET /api/splat/jobs/:id/cameras`).
- **Pure viewer maths** (`src/lib/viewer/`): turns the cameras into an upright rotation and a start view, falls back to Memento's fixed flip, and turns held keys and mouse movement into motion.
- **`ViewerScene`:** a three.js class drawing the splat through the existing `SplatLayer`, with `OrbitControls`, keyboard and pointer lock.
- **The page** (`RoomsHome` at `/`): reuses `useVideoScan`, `VideoScanPanel` and `VideoScanProgress` for import and progress, and opens the viewer through the URL hash `#room=<id>`.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript, three 0.186 (`OrbitControls`), Spark 2.3 via `SplatLayer`, Vitest, the Plan 6 demo server and Docker pipeline.

**Spec:** `docs/superpowers/specs/2026-10-07-hearify-splat-viewer-design.md`. Background: `docs/superpowers/specs/2026-10-06-hearify-video-splats-design.md`.

## Global Constraints

- **Computer only.** No touch walking, no phone-specific UI, no Wi-Fi addresses on the page.
- **Spark** is reached only through `src/lib/scene/SplatLayer.ts` by dynamic `import()`. A value import of `SplatLayer` or `@sparkjsdev/spark` anywhere else fails lint (`eslint.config.mjs`). `import type` is fine.
- **Copy, verbatim from the spec:**
  - heading `Hearify`;
  - subline `Import a video of your room and walk around it in 3D.`;
  - button `Import a video`;
  - list heading `Your rooms`;
  - help line `Drag to spin · Scroll to zoom · W A S D to move · Q / E down and up · Click to look around, Esc to stop`;
  - states `Loading your room…`, `Couldn't load this room.`, `This browser can't show 3D.`;
  - no-server line `Start the room builder with pnpm run demo, then open http://localhost:8080.` (`pnpm run demo` in a `<code>`).
- **Viewer URL:** `#room=<job id>`.
- **Movement:**
  - base speed = a quarter of the diagonal of the box around all camera positions, per second (in the fallback, the box around the splat);
  - Shift doubles it;
  - Q/E move down/up;
  - pitch is kept within ±85°;
  - movement is level with the floor, relative to where you're looking.
- **Upright:** the average camera "up" is rotated to +Y, and the start view is the camera with the lowest `img_name`. Without a cameras file, rotate π about X and start outside the splat's box looking at its centre (Memento).
- **Old pages:** `/room`, `/setup`, `/about` and the old landing components stay in the repo, unlinked. Nothing is deleted.
- **Repo rules:**
  - Shell is Windows PowerShell 5.1 (no `&&`); npm scripts run in cmd.exe. The user runs `pnpm`; `npm`/`npx` work the same for these scripts.
  - Before each commit: `npx vitest run`, `npx tsc --noEmit` and `npm run lint` all clean. `npm run build` is also clean at the end of Tasks 4 and 5.
  - Commit by explicit path (`git commit -m … -m … -- <paths>`) on `main`, ending with the Co-Authored-By trailer your environment gives you. Never push.
  - Implementers never run docker or start servers; Task 6 is the controller's.

## Review Focus

1. **Rooms built before this change have no `cameras.json`.** They must open through the fallback, not an error. Tests: Task 1 (cameras endpoint 404s for a ready job without the file), Task 2 (`fetchCameras` → null on 404), Task 3 (`fallbackView`).
2. **A video filmed tilted or upside down** (phone held sideways) still shows the room upright. Test: Task 3 (`viewFromCameras` with tilted and upside-down cameras).
3. **Holding W while looking straight down or up** still moves level, at full speed. Test: Task 3 (`moveStep` depends only on yaw, always level and full length).
4. **Coming back to a tab left in the background,** or alt-tabbing with a key held, must not fling you across the room. Tests: Task 3 (`moveStep` caps a frame at 0.1 s). Task 4 clears held keys on window blur, checked in Task 6.
5. **A hand-edited or stale URL hash** (`#room=../../x`, `#room=`) is ignored, not fetched. Test: Task 3 (`roomFromHash`).

---

## File Structure

```
src/lib/splatJobs/
  settings.ts          MOD  OpenSplat also writes /job/cameras.json
  protocol.ts          MOD  RoomSummary, CameraPose types
  client.ts            MOD  fetchRooms/readRooms, fetchCameras/readCameras
src/server/
  jobs.ts              MOD  JobQueue.rooms(), JobQueue.camerasPath()
  server.ts            MOD  GET /api/splat/rooms, GET /api/splat/jobs/:id/cameras; Jobs interface
src/lib/viewer/
  view.ts              NEW  viewFromCameras, fallbackView, CAMERA_UP/CAMERA_FORWARD conventions
  controls.ts          NEW  moveStep, turn, lookDirection, anglesOf
  rooms.ts             NEW  roomFromHash, roomHash, roomLabel
  ViewerScene.ts       NEW  three.js viewer (renderer, OrbitControls, keys, pointer lock, SplatLayer)
src/components/
  SplatViewer.tsx      NEW  full-screen viewer: loads splat + cameras, Back, help line, states
  RoomsHome.tsx        NEW  the page: heading, import/progress, Your rooms, viewer by hash
  useVideoScan.ts      MOD  onReady also gets the job id
  VideoScanPanel.tsx   MOD  optional buttonLabel and showPrivacy props
src/app/
  page.tsx             MOD  renders <RoomsHome />
  layout.tsx           MOD  metadata description
```

---

### Task 1: Server: cameras file, rooms list, cameras endpoint

**Files:**
- Modify: `src/lib/splatJobs/settings.ts`, `src/lib/splatJobs/settings.test.ts`, `src/lib/splatJobs/protocol.ts`, `src/server/jobs.ts`, `src/server/jobs.test.ts`, `src/server/server.ts`, `src/server/server.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // protocol.ts
  type RoomSummary = { id: string; quality: Quality; createdAt: number }
  type CameraPose = { id: number; img_name: string; width: number; height: number; fx: number; fy: number;
    position: [number, number, number]; rotation: [[number, number, number], [number, number, number], [number, number, number]] }
  // jobs.ts (JobQueue)
  rooms(): RoomSummary[]            // ready jobs, newest first
  camerasPath(id: string): string | null   // <job dir>/cameras.json for a ready job, else null (file may not exist)
  // server.ts
  interface Jobs { …existing…; rooms(): RoomSummary[]; camerasPath(id: string): string | null }
  GET /api/splat/rooms → 200 RoomSummary[]
  GET /api/splat/jobs/:id/cameras → 200 application/json (the file) | 404 { error: 'no-cameras' }
  ```

- [ ] **Step 1: Write the failing tests**

**`settings.test.ts`:** in the test "trains for the quality steps, caps the splat count and writes .spz", change the expected Quick training args to:

```ts
    expect(pipelineSteps('quick', 'video.mp4').at(-1)!.args).toEqual([
      'opensplat', '/job', '-n', String(SETTINGS.quick.steps), '--max-gaussians', '1500000',
      '--output-cameras', '/job/cameras.json', '-o', '/job/splat.spz',
    ]);
```

**`jobs.test.ts`:** add inside `describe('JobQueue', …)`. The file already has `quiet`, `fakeRunner` and the temp `root`.

```ts
  it('lists finished rooms newest first, and where their cameras file is', async () => {
    const write = async (id: string, state: string, createdAt: number, quality = 'quick') => {
      await mkdir(path.join(root, id), { recursive: true });
      await writeFile(path.join(root, id, 'job.json'), JSON.stringify({ id, quality, videoName: 'video.mp4', state, createdAt }));
    };
    await write('old', 'ready', 1000);
    await write('broken', 'failed', 2000);
    await write('new', 'ready', 3000, 'best');
    const queue = new JobQueue(root, fakeRunner().run, quiet);
    await queue.init();
    expect(queue.rooms()).toEqual([
      { id: 'new', quality: 'best', createdAt: 3000 },
      { id: 'old', quality: 'quick', createdAt: 1000 },
    ]);
    expect(queue.camerasPath('new')).toBe(path.join(root, 'new', 'cameras.json'));
    expect(queue.camerasPath('broken')).toBeNull();
    expect(queue.camerasPath('nope')).toBeNull();
  });
```

**`server.test.ts`:**
- In `fakeJobs`, add to `state`:
  ```ts
    rooms: [] as RoomSummary[],
    cameras: new Map<string, string>(),
  ```
- Add to `jobs`:
  ```ts
    rooms: () => state.rooms,
    camerasPath: (id) => state.cameras.get(id) ?? null,
  ```
- Add `RoomSummary` to the `@/lib/splatJobs/protocol` type import.
- Then add inside `describe('jobs API', …)`:

```ts
  it('lists the finished rooms', async () => {
    fake.state.rooms = [{ id: 'b', quality: 'best', createdAt: 2 }, { id: 'a', quality: 'quick', createdAt: 1 }];
    const res = await fetch(`${base}/api/splat/rooms`);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual(fake.state.rooms);
  });

  it('serves a room cameras file, and 404s when the job or the file is missing', async () => {
    const file = path.join(tmp, 'cameras.json');
    await writeFile(file, '[{"id":0}]');
    fake.state.cameras.set('with', file);
    fake.state.cameras.set('older', path.join(tmp, 'no-such-cameras.json'));
    const ok = await fetch(`${base}/api/splat/jobs/with/cameras`);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('application/json');
    expect(await ok.text()).toBe('[{"id":0}]');
    expect((await fetch(`${base}/api/splat/jobs/older/cameras`)).status).toBe(404);
    const unknown = await fetch(`${base}/api/splat/jobs/nope/cameras`);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: 'no-cameras' });
  });
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/lib/splatJobs/settings.test.ts src/server/jobs.test.ts src/server/server.test.ts`
Expected: FAIL. The training args lack `--output-cameras`, `rooms`/`camerasPath` aren't functions, and the routes 404.

- [ ] **Step 3: Implement**

**`settings.ts`**, the training step's args:
```ts
      args: [
        'opensplat', JOB, '-n', String(steps), '--max-gaussians', String(MAX_GAUSSIANS),
        '--output-cameras', `${JOB}/cameras.json`, '-o', `${JOB}/splat.spz`,
      ],
```

**`protocol.ts`**, append:
```ts
/** A finished room on the laptop (spec 2026-10-07 §3). */
export type RoomSummary = { id: string; quality: Quality; createdAt: number };

/** One video frame's camera, as OpenSplat's --output-cameras writes it, in the splat's frame (spec 2026-10-07 §4). */
export type CameraPose = {
  id: number;
  img_name: string;
  width: number;
  height: number;
  fx: number;
  fy: number;
  position: [number, number, number];
  rotation: [[number, number, number], [number, number, number], [number, number, number]];
};
```

**`jobs.ts`:**
- Add `const CAMERAS = 'cameras.json';` beside `SPLAT`.
- Add `RoomSummary` to the protocol import.
- Add these methods after `splatPath`:
```ts
  /** Finished rooms, newest first (spec 2026-10-07 §5). */
  rooms(): RoomSummary[] {
    return [...this.jobs.values()]
      .filter((job) => job.state === 'ready')
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ id, quality, createdAt }) => ({ id, quality, createdAt }));
  }

  /** Where a ready job's cameras file would be; null for unknown or unfinished jobs. Older builds have no such file. */
  camerasPath(id: string): string | null {
    return this.jobs.get(id)?.state === 'ready' ? path.join(this.dirOf(id), CAMERAS) : null;
  }
```

**`server.ts`:**
- Add `RoomSummary` to the protocol import.
- Extend `interface Jobs` with:
```ts
  rooms(): RoomSummary[];
  camerasPath(id: string): string | null;
```
- Add a sender beside `sendSplat`:
```ts
  async function sendCameras(res: Res, id: string): Promise<void> {
    const file = jobs.camerasPath(id);
    const info = file ? await stat(file).catch(() => null) : null;
    if (!file || !info?.isFile()) return sendJson(res, 404, { error: 'no-cameras' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': info.size, 'Cache-Control': 'no-store' });
    await pipeline(createReadStream(file), res);
  }
```
- In `api(…)`, before the final 404, add:
```ts
    if (resource === 'rooms' && !id && method === 'GET') return sendJson(res, 200, jobs.rooms());
    if (resource === 'jobs' && id && sub === 'cameras' && method === 'GET') return sendCameras(res, id);
```

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/lib/splatJobs/settings.test.ts src/server/jobs.test.ts src/server/server.test.ts`
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: OpenSplat writes each room's cameras; the server lists finished rooms and serves their cameras" -m "<your Co-Authored-By trailer>" -- src/lib/splatJobs/settings.ts src/lib/splatJobs/settings.test.ts src/lib/splatJobs/protocol.ts src/server/jobs.ts src/server/jobs.test.ts src/server/server.ts src/server/server.test.ts
```

---

### Task 2: Client: rooms and cameras

**Files:**
- Modify: `src/lib/splatJobs/client.ts`, `src/lib/splatJobs/client.test.ts`

**Interfaces:**
- Consumes: `RoomSummary`, `CameraPose`, `isQuality` from `protocol.ts`; the routes from Task 1.
- Produces:
  ```ts
  readRooms(data: unknown): RoomSummary[] | null      // null unless an array; drops malformed entries
  fetchRooms(fetchFn?: Fetch): Promise<RoomSummary[] | null>
  readCameras(data: unknown): CameraPose[] | null     // null unless a non-empty array of well-formed cameras
  fetchCameras(id: string, fetchFn?: Fetch): Promise<CameraPose[] | null>   // null on 404, errors, bad data
  ```

- [ ] **Step 1: Write the failing tests**

Append to `client.test.ts`, and add `fetchCameras, fetchRooms, readCameras, readRooms` to its import from `./client`:

```ts
const cameraJson = (overrides: Record<string, unknown> = {}) => ({
  id: 0, img_name: '0001.jpg', width: 1000, height: 750, fx: 800, fy: 800,
  position: [0, 0, 0], rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], ...overrides,
});

describe('rooms', () => {
  it('reads the list and drops malformed entries', () => {
    expect(readRooms([
      { id: 'a', quality: 'best', createdAt: 5 },
      { id: 'b', quality: 'fast', createdAt: 4 },
      { id: 7, quality: 'quick', createdAt: 3 },
      { id: 'c', quality: 'quick', createdAt: 'yesterday' },
      null,
    ])).toEqual([{ id: 'a', quality: 'best', createdAt: 5 }]);
    expect(readRooms({ rooms: [] })).toBeNull();
  });

  it('fetches the rooms, or null when the laptop answers badly or not at all', async () => {
    const fetchFn = vi.fn(async () => json([{ id: 'a', quality: 'quick', createdAt: 1 }]));
    expect(await fetchRooms(fetchFn)).toEqual([{ id: 'a', quality: 'quick', createdAt: 1 }]);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/rooms', expect.objectContaining({ cache: 'no-store' }));
    expect(await fetchRooms(async () => json({ error: 'x' }, 500))).toBeNull();
    expect(await fetchRooms(async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
  });
});

describe('cameras', () => {
  it('accepts well-formed cameras only', () => {
    expect(readCameras([cameraJson()])).toEqual([cameraJson()]);
    expect(readCameras([])).toBeNull();
    expect(readCameras({})).toBeNull();
    expect(readCameras([cameraJson({ position: [0, 0] })])).toBeNull();
    expect(readCameras([cameraJson({ rotation: [[1, 0, 0], [0, 1, 0]] })])).toBeNull();
    expect(readCameras([cameraJson({ position: [0, Number.NaN, 0] })])).toBeNull();
    expect(readCameras([cameraJson({ img_name: 3 })])).toBeNull();
  });

  it('fetches a room cameras, or null for an older room, an error or a dead laptop', async () => {
    const fetchFn = vi.fn(async () => json([cameraJson()]));
    expect(await fetchCameras('j 1', fetchFn)).toEqual([cameraJson()]);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j%201/cameras', expect.objectContaining({ cache: 'no-store' }));
    expect(await fetchCameras('j1', async () => json({ error: 'no-cameras' }, 404))).toBeNull();
    expect(await fetchCameras('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
    expect(await fetchCameras('j1', async () => json([cameraJson({ rotation: 'x' })]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/lib/splatJobs/client.test.ts`
Expected: FAIL. `readRooms` and the others don't exist.

- [ ] **Step 3: Implement**

In `client.ts`:
- Extend the protocol import to `import { isQuality, MAX_VIDEO_BYTES, type CameraPose, type Health, type JobView, type Quality, type RoomSummary } from './protocol';`. Keep whatever it already imports.
- Append:

```ts
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isTriple = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);

/** The rooms list as the server sends it; entries that aren't well-formed are dropped. Null unless it's an array. */
export function readRooms(data: unknown): RoomSummary[] | null {
  if (!Array.isArray(data)) return null;
  return data.filter((entry): entry is RoomSummary => {
    if (!entry || typeof entry !== 'object') return false;
    const { id, quality, createdAt } = entry as Partial<RoomSummary>;
    return typeof id === 'string' && isQuality(quality) && isFiniteNumber(createdAt);
  });
}

/** The finished rooms on the laptop, newest first; null when it can't be asked. */
export async function fetchRooms(fetchFn: Fetch = browserFetch): Promise<RoomSummary[] | null> {
  try {
    const res = await fetchFn(`${API}/rooms`, { cache: 'no-store' });
    if (!res.ok) return null;
    return readRooms(await res.json());
  } catch {
    return null;
  }
}

/** OpenSplat's cameras file, only if every camera has a name, a position and a 3×3 rotation of finite numbers. */
export function readCameras(data: unknown): CameraPose[] | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const wellFormed = data.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const { img_name, position, rotation } = entry as Partial<CameraPose>;
    return typeof img_name === 'string' && isTriple(position) && Array.isArray(rotation) && rotation.length === 3 && rotation.every(isTriple);
  });
  return wellFormed ? (data as CameraPose[]) : null;
}

/** A room's cameras; null for a room built before cameras were saved, or on any failure (the viewer falls back). */
export async function fetchCameras(id: string, fetchFn: Fetch = browserFetch): Promise<CameraPose[] | null> {
  try {
    const res = await fetchFn(`${jobUrl(id)}/cameras`, { cache: 'no-store' });
    if (!res.ok) return null;
    return readCameras(await res.json());
  } catch {
    return null;
  }
}
```

If `isQuality` isn't already exported from `protocol.ts`, it is: Plan 6 Task 2 defined it.

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/lib/splatJobs/client.test.ts`
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: the page can ask the laptop for its rooms and each room's cameras" -m "<your Co-Authored-By trailer>" -- src/lib/splatJobs/client.ts src/lib/splatJobs/client.test.ts
```

---

### Task 3: Viewer maths

**Files:**
- Create: `src/lib/viewer/view.ts`, `src/lib/viewer/controls.ts`, `src/lib/viewer/rooms.ts`, and a `.test.ts` for each

**Interfaces:**
- Consumes: `CameraPose`, `RoomSummary` (Task 1). `Vec3` from `@/lib/room/types` (`{ x, y, z }`).
- Produces:
  ```ts
  // view.ts
  type StartView = { rotation: THREE.Quaternion; position: THREE.Vector3; forward: THREE.Vector3; speed: number }
  CAMERA_UP = { column: 1, sign: -1 }; CAMERA_FORWARD = { column: 2, sign: 1 }; MIN_SPEED = 0.25
  viewFromCameras(cameras: CameraPose[]): StartView | null
  fallbackView(bounds: { min: Vec3; max: Vec3; centre: Vec3 }): StartView
  // controls.ts
  MOVE_KEYS: Record<string, [number, number, number]>   // code → [right, up, forward]
  MAX_STEP_SECONDS = 0.1; PITCH_LIMIT = 85° in radians; LOOK_SENSITIVITY = 0.0022
  type Angles = { yaw: number; pitch: number }
  lookDirection(yaw: number, pitch: number): THREE.Vector3
  anglesOf(direction: THREE.Vector3): Angles
  turn(angles: Angles, dx: number, dy: number, sensitivity?: number): Angles
  moveStep(keys: ReadonlySet<string>, yaw: number, speed: number, seconds: number): THREE.Vector3
  // rooms.ts
  roomFromHash(hash: string): string | null; roomHash(id: string): string
  roomLabel(room: RoomSummary, format?: { locale?: string; timeZone?: string }): string
  ```

- [ ] **Step 1: Write the failing tests**

`src/lib/viewer/view.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { fallbackView, MIN_SPEED, viewFromCameras } from './view';

const UP = new THREE.Vector3(0, 1, 0);

/** A camera as OpenSplat saves it: rotation columns are its right, down and forward axes in world space. */
function camera(name: string, position: [number, number, number], forward: THREE.Vector3, up: THREE.Vector3): CameraPose {
  const f = forward.clone().normalize();
  const u = up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(f, u).normalize();
  const down = u.clone().negate();
  return {
    id: 0, img_name: name, width: 1000, height: 750, fx: 800, fy: 800, position,
    rotation: [
      [right.x, down.x, f.x],
      [right.y, down.y, f.y],
      [right.z, down.z, f.z],
    ],
  };
}

const close = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-6);

describe('viewFromCameras', () => {
  it('leaves an upright video as it is and starts at its first frame, looking where it looked', () => {
    const view = viewFromCameras([
      camera('0002.jpg', [4, 0, 3], new THREE.Vector3(1, 0, 0), UP),
      camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP),
    ])!;
    close(UP.clone().applyQuaternion(view.rotation), UP);
    close(view.position, new THREE.Vector3(0, 0, 0));
    close(view.forward, new THREE.Vector3(0, 0, -1));
    expect(view.speed).toBeCloseTo(5 * 0.25); // the camera box is 4 × 0 × 3: diagonal 5
  });

  it('turns an upside-down video upright', () => {
    const down = new THREE.Vector3(0, -1, 0);
    const view = viewFromCameras([camera('0001.jpg', [1, 2, 3], new THREE.Vector3(0, 0, 1), down)])!;
    close(down.clone().applyQuaternion(view.rotation), UP);
    expect(Math.abs(view.forward.y)).toBeLessThan(1e-6); // a level gaze stays level
  });

  it('turns a tilted video upright, using the average up of all its frames', () => {
    const tilt = new THREE.Vector3(1, 1, 0).normalize();
    const z = new THREE.Vector3(0, 0, 1);
    // Two frames leaning 0.2 rad either side of the tilt: their average up is the tilt itself.
    const view = viewFromCameras([
      camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), tilt.clone().applyAxisAngle(z, 0.2)),
      camera('0002.jpg', [1, 1, 0], new THREE.Vector3(0, 0, -1), tilt.clone().applyAxisAngle(z, -0.2)),
    ])!;
    close(tilt.clone().applyQuaternion(view.rotation), UP);
  });

  it('gives a still camera a usable speed, and nothing without cameras', () => {
    expect(viewFromCameras([camera('0001.jpg', [0, 0, 0], new THREE.Vector3(0, 0, -1), UP)])!.speed).toBe(MIN_SPEED);
    expect(viewFromCameras([])).toBeNull();
  });
});

describe('fallbackView', () => {
  it('flips the splat like Memento and starts outside its box, looking at its centre', () => {
    const view = fallbackView({ min: { x: -1, y: -1, z: -1 }, max: { x: 1, y: 1, z: 1 }, centre: { x: 0, y: 0, z: 0 } });
    close(UP.clone().applyQuaternion(view.rotation), new THREE.Vector3(0, -1, 0)); // π about X
    close(view.position, new THREE.Vector3(0, 0.5, 3.6)); // centre + (0, 0.25, 1.8) × the largest side (2)
    close(view.forward, new THREE.Vector3(0, -0.5, -3.6).normalize());
    expect(view.speed).toBeCloseTo(Math.sqrt(12) * 0.25);
  });
});
```

`src/lib/viewer/controls.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { anglesOf, lookDirection, MAX_STEP_SECONDS, moveStep, PITCH_LIMIT, turn } from './controls';

const keys = (...codes: string[]) => new Set(codes);
const close = (a: THREE.Vector3, b: THREE.Vector3) => expect(a.distanceTo(b)).toBeLessThan(1e-9);

describe('moveStep', () => {
  it('moves forward, back, left and right level with the floor, relative to yaw', () => {
    close(moveStep(keys('KeyW'), 0, 2, 0.05), new THREE.Vector3(0, 0, -0.1));
    close(moveStep(keys('KeyS'), 0, 2, 0.05), new THREE.Vector3(0, 0, 0.1));
    close(moveStep(keys('KeyD'), 0, 2, 0.05), new THREE.Vector3(0.1, 0, 0));
    close(moveStep(keys('KeyA'), 0, 2, 0.05), new THREE.Vector3(-0.1, 0, 0));
    close(moveStep(keys('KeyW'), Math.PI / 2, 2, 0.05), new THREE.Vector3(-0.1, 0, 0)); // turned left: forward is -X
  });

  it('moves straight down and up with Q and E', () => {
    close(moveStep(keys('KeyQ'), 1.3, 2, 0.05), new THREE.Vector3(0, -0.1, 0));
    close(moveStep(keys('KeyE'), 1.3, 2, 0.05), new THREE.Vector3(0, 0.1, 0));
  });

  it('keeps diagonals at full speed, cancels opposites, doubles with Shift and ignores other keys', () => {
    expect(moveStep(keys('KeyW', 'KeyD'), 0.4, 2, 0.05).length()).toBeCloseTo(0.1);
    expect(moveStep(keys('KeyW', 'KeyS'), 0, 2, 0.05).length()).toBe(0);
    expect(moveStep(keys('KeyW', 'ShiftLeft'), 0, 2, 0.05).length()).toBeCloseTo(0.2);
    expect(moveStep(keys('KeyX', 'Space'), 0, 2, 0.05).length()).toBe(0);
  });

  it('never moves further than one capped frame, however long the tab slept', () => {
    expect(moveStep(keys('KeyW'), 0, 2, 30).length()).toBeCloseTo(2 * MAX_STEP_SECONDS);
    expect(moveStep(keys('KeyW'), 0, 2, -1).length()).toBe(0);
  });

  it('stays level whatever the pitch, because only yaw steers it', () => {
    const { yaw } = anglesOf(new THREE.Vector3(0.0001, -1, 0)); // looking straight down
    const step = moveStep(keys('KeyW'), yaw, 2, 0.05);
    expect(step.y).toBe(0);
    expect(step.length()).toBeCloseTo(0.1);
  });
});

describe('looking around', () => {
  it('turns yaw and pitch from mouse movement, keeping pitch within ±85°', () => {
    expect(turn({ yaw: 0, pitch: 0 }, 100, 0, 0.01)).toEqual({ yaw: -1, pitch: 0 });
    expect(turn({ yaw: 0, pitch: 0 }, 0, -1000, 0.01).pitch).toBeCloseTo(PITCH_LIMIT);
    expect(turn({ yaw: 0, pitch: 0 }, 0, 1000, 0.01).pitch).toBeCloseTo(-PITCH_LIMIT);
  });

  it('round-trips a direction through yaw and pitch', () => {
    const direction = new THREE.Vector3(1, 0.5, -2).normalize();
    const { yaw, pitch } = anglesOf(direction);
    close(lookDirection(yaw, pitch), direction);
    close(lookDirection(0, 0), new THREE.Vector3(0, 0, -1));
  });
});
```

`src/lib/viewer/rooms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { roomFromHash, roomHash, roomLabel } from './rooms';

describe('room links', () => {
  it('reads a room id from the hash, and ignores anything else', () => {
    const id = 'f36821e6-cace-49ad-a6cc-6e0798a4bba1';
    expect(roomFromHash(roomHash(id))).toBe(id);
    expect(roomFromHash(`#room=${id}`)).toBe(id);
    expect(roomFromHash('')).toBeNull();
    expect(roomFromHash('#room=')).toBeNull();
    expect(roomFromHash('#room=../../x')).toBeNull();
    expect(roomFromHash('#other=abc')).toBeNull();
  });

  it('labels a room with when it was made and its quality', () => {
    const at = Date.UTC(2026, 9, 7, 0, 38);
    expect(roomLabel({ id: 'a', quality: 'best', createdAt: at }, { locale: 'en-US', timeZone: 'UTC' })).toBe('Oct 7, 2026, 12:38 AM · Best');
    expect(roomLabel({ id: 'a', quality: 'quick', createdAt: at }, { locale: 'en-US', timeZone: 'UTC' })).toBe('Oct 7, 2026, 12:38 AM · Quick');
  });
});
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `npx vitest run src/lib/viewer`
Expected: FAIL, because the modules don't exist.

- [ ] **Step 3: Implement**

`src/lib/viewer/view.ts`:

```ts
import * as THREE from 'three';
import type { Vec3 } from '@/lib/room/types';
import type { CameraPose } from '@/lib/splatJobs/protocol';

export type StartView = { rotation: THREE.Quaternion; position: THREE.Vector3; forward: THREE.Vector3; speed: number };

/**
 * Which rotation column, and which sign, is a camera's up and its viewing direction in OpenSplat's cameras file. OpenSplat
 * flips y and z of its internal (OpenGL-style) camera-to-world back when saving, so the columns are the camera's right,
 * down and forward axes. Pinned against a real job on the demo laptop (Plan 7 Task 6).
 */
export const CAMERA_UP = { column: 1, sign: -1 } as const;
export const CAMERA_FORWARD = { column: 2, sign: 1 } as const;
/** Speed for a video whose camera barely moved (a still shot): units per second. */
export const MIN_SPEED = 0.25;

const Y_UP = new THREE.Vector3(0, 1, 0);

function axis(rotation: CameraPose['rotation'], pick: { column: number; sign: number }): THREE.Vector3 {
  return new THREE.Vector3(rotation[0][pick.column], rotation[1][pick.column], rotation[2][pick.column]).multiplyScalar(pick.sign);
}

/** A quarter of the box's diagonal per second, so walking feels the same in any room (spec 2026-10-07 §4). */
function speedFor(box: THREE.Box3): number {
  const diagonal = box.isEmpty() ? 0 : box.getSize(new THREE.Vector3()).length();
  return diagonal > 1e-6 ? diagonal * 0.25 : MIN_SPEED;
}

/**
 * Upright and the start view from the video's cameras: the average camera up becomes +Y (the video was held upright),
 * and the view starts at the first frame (lowest image name), looking along it. Null without usable cameras.
 */
export function viewFromCameras(cameras: CameraPose[]): StartView | null {
  if (cameras.length === 0) return null;
  const up = new THREE.Vector3();
  for (const camera of cameras) up.add(axis(camera.rotation, CAMERA_UP).normalize());
  if (up.lengthSq() < 1e-12) return null;
  const rotation = new THREE.Quaternion().setFromUnitVectors(up.normalize(), Y_UP);
  const first = [...cameras].sort((a, b) => a.img_name.localeCompare(b.img_name))[0];
  const box = new THREE.Box3();
  for (const camera of cameras) box.expandByPoint(new THREE.Vector3(...camera.position).applyQuaternion(rotation));
  return {
    rotation,
    position: new THREE.Vector3(...first.position).applyQuaternion(rotation),
    forward: axis(first.rotation, CAMERA_FORWARD).normalize().applyQuaternion(rotation),
    speed: speedFor(box),
  };
}

/** Memento's view for a room with no cameras file: flip π about X, and start outside the splat's box looking at its centre. */
export function fallbackView(bounds: { min: Vec3; max: Vec3; centre: Vec3 }): StartView {
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  const box = new THREE.Box3()
    .expandByPoint(new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z).applyQuaternion(rotation))
    .expandByPoint(new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z).applyQuaternion(rotation));
  const size = box.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 1e-3);
  const centre = new THREE.Vector3(bounds.centre.x, bounds.centre.y, bounds.centre.z).applyQuaternion(rotation);
  const position = centre.clone().add(new THREE.Vector3(0, largest * 0.25, largest * 1.8));
  return { rotation, position, forward: centre.clone().sub(position).normalize(), speed: speedFor(box) };
}
```

`src/lib/viewer/controls.ts`:

```ts
import * as THREE from 'three';

/** Key code → [right, up, forward], like Memento: W/A/S/D on the floor, Q/E down and up. */
export const MOVE_KEYS: Record<string, [number, number, number]> = {
  KeyW: [0, 0, 1],
  KeyS: [0, 0, -1],
  KeyD: [1, 0, 0],
  KeyA: [-1, 0, 0],
  KeyE: [0, 1, 0],
  KeyQ: [0, -1, 0],
};
/** One frame never moves further than this many seconds' worth (a tab that slept, a long frame). */
export const MAX_STEP_SECONDS = 0.1;
export const PITCH_LIMIT = (85 * Math.PI) / 180;
export const LOOK_SENSITIVITY = 0.0022;

export type Angles = { yaw: number; pitch: number };

const clampPitch = (pitch: number) => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch));

/** Yaw 0 looks along -Z and positive yaw turns left (three.js's YXZ order); pitch is up from level. */
export function lookDirection(yaw: number, pitch: number): THREE.Vector3 {
  return new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
}

export function anglesOf(direction: THREE.Vector3): Angles {
  const d = direction.clone().normalize();
  return { yaw: Math.atan2(-d.x, -d.z), pitch: clampPitch(Math.asin(Math.max(-1, Math.min(1, d.y)))) };
}

/** Mouse movement turns the head: right turns right, down looks down (pointer lock's movementX/Y). */
export function turn(angles: Angles, dx: number, dy: number, sensitivity = LOOK_SENSITIVITY): Angles {
  return { yaw: angles.yaw - dx * sensitivity, pitch: clampPitch(angles.pitch - dy * sensitivity) };
}

/** This frame's move for the held keys: level with the floor, steered by yaw only; Shift doubles the speed. */
export function moveStep(keys: ReadonlySet<string>, yaw: number, speed: number, seconds: number): THREE.Vector3 {
  let right = 0;
  let up = 0;
  let forward = 0;
  for (const key of keys) {
    const move = MOVE_KEYS[key];
    if (!move) continue;
    right += move[0];
    up += move[1];
    forward += move[2];
  }
  const step = new THREE.Vector3()
    .addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), forward)
    .addScaledVector(new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), right)
    .add(new THREE.Vector3(0, up, 0));
  if (step.lengthSq() === 0) return step;
  const fast = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 2 : 1;
  return step.normalize().multiplyScalar(speed * fast * Math.min(Math.max(seconds, 0), MAX_STEP_SECONDS));
}
```

`src/lib/viewer/rooms.ts`:

```ts
import type { RoomSummary } from '@/lib/splatJobs/protocol';

const ROOM_HASH = /^#room=([0-9a-f-]{8,64})$/i;

/** The room the viewer shows (`#room=<job id>`); null for anything else, so a hand-edited hash fetches nothing. */
export function roomFromHash(hash: string): string | null {
  return ROOM_HASH.exec(hash)?.[1] ?? null;
}

export const roomHash = (id: string) => `#room=${id}`;

/** "Oct 7, 2026, 12:38 AM · Best": when it was made (local time by default) and its quality. */
export function roomLabel(room: RoomSummary, format: { locale?: string; timeZone?: string } = {}): string {
  const when = new Date(room.createdAt).toLocaleString(format.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: format.timeZone,
  });
  return `${when} · ${room.quality === 'best' ? 'Best' : 'Quick'}`;
}
```

If the `roomLabel` test's exact string differs only by Node's ICU spacing (e.g. a narrow no-break space before "AM"), change the test to compare with `.replace(/\s/g, ' ')` on both sides. Don't change the format.

- [ ] **Step 4: Run the tests to check they pass**

Run: `npx vitest run src/lib/viewer`, three times.
Expected: PASS. Then run `npx vitest run`, `npx tsc --noEmit` and `npm run lint`; all must be clean.

- [ ] **Step 5: Commit**

```powershell
git commit -m "feat: viewer maths: upright and start view from the video's cameras, Memento's fallback, walking and looking" -m "<your Co-Authored-By trailer>" -- src/lib/viewer/view.ts src/lib/viewer/view.test.ts src/lib/viewer/controls.ts src/lib/viewer/controls.test.ts src/lib/viewer/rooms.ts src/lib/viewer/rooms.test.ts
```

---

### Task 4: The 3D viewer

**Files:**
- Create: `src/lib/viewer/ViewerScene.ts`, `src/components/SplatViewer.tsx`

**Interfaces:**
- Consumes:
  - Task 3: `viewFromCameras`, `fallbackView`, `StartView`, `moveStep`, `turn`, `anglesOf`, `lookDirection`, `MOVE_KEYS`.
  - `SplatLayer`, by dynamic import only: `new SplatLayer(renderer)`, `.group`, `.load(bytes, fileName): Promise<SplatInfo>` with `{ count, min, max, centre }`, `.setAlignment(a)`, `.dispose()`.
  - `IDENTITY_ALIGNMENT` from `@/lib/scene/alignment`.
  - Task 2: `downloadSplat(id)` (existing) and `fetchCameras(id)`.
  - `useWebGL` and `markWebGLUnavailable` from `src/components/useWebGL.ts`.
- Produces:
  ```ts
  class ViewerScene { constructor(canvas: HTMLCanvasElement); open(bytes: ArrayBuffer, cameras: CameraPose[] | null): Promise<void>; resize(w: number, h: number): void; dispose(): void }
  function SplatViewer(props: { roomId: string; onBack: () => void }): JSX.Element
  ```

Like `RoomScene`, these are browser-only and have no unit tests: their maths is Task 3's, tested. Task 6 checks them in the browser.

- [ ] **Step 1: Write `src/lib/viewer/ViewerScene.ts`**

```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { IDENTITY_ALIGNMENT } from '@/lib/scene/alignment';
// Never a value import of SplatLayer here: it would pull Spark into this bundle (eslint enforces). open() uses import().
import type { SplatLayer } from '@/lib/scene/SplatLayer';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { anglesOf, lookDirection, MOVE_KEYS, moveStep, turn, type Angles } from './controls';
import { fallbackView, viewFromCameras, type StartView } from './view';

const BACKGROUND = 0x0a0a0a;
const CLICK_SLOP_PX = 5; // a press that moved further than this was a drag (spin), not a click (look around)

/** The splat viewer (spec 2026-10-07 §4), Memento-style: spin and zoom, W/A/S/D and Q/E, click to look around. Browser only. */
export class ViewerScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 1000);
  private readonly controls: OrbitControls;
  private readonly keys = new Set<string>();
  private layer: SplatLayer | null = null;
  private view: StartView | null = null;
  private angles: Angles = { yaw: 0, pitch: 0 };
  private targetDistance = 1;
  private pressedAt: { x: number; y: number } | null = null;
  private frame = 0;
  private last = 0;
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(BACKGROUND);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.screenSpacePanning = true;
    canvas.addEventListener('pointerdown', this.press);
    canvas.addEventListener('click', this.click);
    document.addEventListener('pointerlockchange', this.lockChanged);
    document.addEventListener('mousemove', this.look);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseKeys);
    this.frame = requestAnimationFrame(this.tick);
  }

  /** Show a room: its splat, turned upright and seen from where the video began (or Memento's view without cameras). */
  async open(bytes: ArrayBuffer, cameras: CameraPose[] | null): Promise<void> {
    const { SplatLayer } = await import('@/lib/scene/SplatLayer');
    if (this.disposed) return;
    const layer = new SplatLayer(this.renderer);
    let info: Awaited<ReturnType<SplatLayer['load']>>;
    try {
      info = await layer.load(bytes, 'splat.spz');
    } catch (error) {
      layer.dispose();
      throw error;
    }
    if (this.disposed) {
      layer.dispose();
      return;
    }
    const view = (cameras && viewFromCameras(cameras)) ?? fallbackView(info);
    const q = view.rotation;
    layer.setAlignment({ ...IDENTITY_ALIGNMENT, level: [q.x, q.y, q.z, q.w] }); // turns the splat only, not Spark's renderer
    this.scene.add(layer.group);
    this.layer = layer;
    this.view = view;
    const size = view.speed * 4; // the diagonal the speed came from
    this.camera.near = Math.max(size / 10_000, 0.001);
    this.camera.far = Math.max(size * 100, 10);
    this.camera.updateProjectionMatrix();
    this.targetDistance = Math.max(size * 0.1, 0.05);
    this.camera.position.copy(view.position);
    this.controls.target.copy(view.position).addScaledVector(view.forward, this.targetDistance);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.canvas.removeEventListener('pointerdown', this.press);
    this.canvas.removeEventListener('click', this.click);
    document.removeEventListener('pointerlockchange', this.lockChanged);
    document.removeEventListener('mousemove', this.look);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseKeys);
    this.controls.dispose();
    this.layer?.dispose();
    this.renderer.dispose();
  }

  private get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  private readonly press = (event: PointerEvent) => {
    this.pressedAt = { x: event.clientX, y: event.clientY };
  };

  /** A click (not the end of a spin drag) locks the pointer for looking around; Esc releases it (the browser's). */
  private readonly click = (event: MouseEvent) => {
    const from = this.pressedAt;
    this.pressedAt = null;
    if (!this.view || this.locked || !from) return;
    if (Math.hypot(event.clientX - from.x, event.clientY - from.y) > CLICK_SLOP_PX) return;
    void this.canvas.requestPointerLock?.();
  };

  private readonly lockChanged = () => {
    const locked = this.locked;
    this.controls.enabled = !locked; // no spinning while looking around
    if (locked) {
      this.angles = anglesOf(this.camera.getWorldDirection(new THREE.Vector3()));
      this.targetDistance = this.camera.position.distanceTo(this.controls.target) || this.targetDistance;
    }
  };

  private readonly look = (event: MouseEvent) => {
    if (!this.locked) return;
    this.angles = turn(this.angles, event.movementX, event.movementY);
    const direction = lookDirection(this.angles.yaw, this.angles.pitch);
    this.controls.target.copy(this.camera.position).addScaledVector(direction, this.targetDistance);
    this.camera.lookAt(this.controls.target);
  };

  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!(event.code in MOVE_KEYS) && event.code !== 'ShiftLeft' && event.code !== 'ShiftRight') return;
    this.keys.add(event.code);
    event.preventDefault();
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  /** Alt-tab with a key held never sends its keyup: stop instead of drifting forever. */
  private readonly releaseKeys = () => {
    this.keys.clear();
  };

  private readonly tick = (now: number) => {
    if (this.disposed) return;
    const seconds = this.last ? (now - this.last) / 1000 : 0;
    this.last = now;
    if (this.view && this.keys.size > 0) {
      const yaw = this.locked ? this.angles.yaw : anglesOf(this.camera.getWorldDirection(new THREE.Vector3())).yaw;
      const step = moveStep(this.keys, yaw, this.view.speed, seconds);
      this.camera.position.add(step);
      this.controls.target.add(step); // move the spin point with you, like Memento
    }
    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  };
}
```

- [ ] **Step 2: Write `src/components/SplatViewer.tsx`**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadSplat, fetchCameras } from '@/lib/splatJobs/client';
import { ViewerScene } from '@/lib/viewer/ViewerScene';
import { markWebGLUnavailable, useWebGL } from './useWebGL';

const HELP = 'Drag to spin · Scroll to zoom · W A S D to move · Q / E down and up · Click to look around, Esc to stop';
type Status = 'loading' | 'ready' | 'error';

/** One room, full screen (spec 2026-10-07 §4). */
export function SplatViewer({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const webgl = useWebGL();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  // Another room: back to loading (set during render, like RoomView's room switch, not in an effect).
  const [shownRoom, setShownRoom] = useState(roomId);
  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setStatus('loading');
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!webgl || !canvas) return;
    let scene: ViewerScene;
    try {
      scene = new ViewerScene(canvas);
    } catch (error) {
      console.error(error);
      markWebGLUnavailable(); // re-renders to the "can't show 3D" line through the store
      return;
    }
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(canvas);
    let live = true;
    void Promise.all([downloadSplat(roomId), fetchCameras(roomId)])
      .then(async ([file, cameras]) => {
        const bytes = await file.arrayBuffer();
        if (!live) return;
        await scene.open(bytes, cameras);
        if (live) setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error(error);
        if (live) setStatus('error');
      });
    return () => {
      live = false;
      observer.disconnect();
      scene.dispose();
    };
  }, [webgl, roomId]);

  const message = !webgl
    ? "This browser can't show 3D."
    : status === 'loading'
      ? 'Loading your room…'
      : status === 'error'
        ? "Couldn't load this room."
        : '';

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950">
      {webgl && <canvas ref={canvasRef} className="block h-full w-full" aria-label="Your room in 3D" />}
      <button
        onClick={onBack}
        className="absolute left-4 top-4 inline-flex min-h-11 items-center rounded-md border border-neutral-700 bg-neutral-950/80 px-4"
      >
        Back
      </button>
      <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-lg text-neutral-200 empty:hidden">
        {message}
      </p>
      {status === 'ready' && webgl && (
        <p className="pointer-events-none absolute inset-x-0 bottom-4 px-4 text-center text-sm text-neutral-300">{HELP}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Check**

Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`; all must be clean. Lint must not report the Spark/SplatLayer import rule: `ViewerScene` imports `SplatLayer` only as a type and through `import()`. If a React hooks lint rule objects to the render-time reset in `SplatViewer`, keep the behaviour and use the smallest change that satisfies it. Report it.

- [ ] **Step 4: Commit**

```powershell
git commit -m "feat: the splat viewer: spin and zoom, W/A/S/D and Q/E to walk, click to look around, upright from the video's cameras" -m "<your Co-Authored-By trailer>" -- src/lib/viewer/ViewerScene.ts src/components/SplatViewer.tsx
```

---

### Task 5: The page

**Files:**
- Create: `src/components/RoomsHome.tsx`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`, `src/components/useVideoScan.ts`, `src/components/VideoScanPanel.tsx`

**Interfaces:**
- Consumes:
  - Task 2: `fetchRooms`, plus `fetchHealth` (existing).
  - Task 3: `roomFromHash`, `roomHash`, `roomLabel`.
  - Task 4: `SplatViewer`.
  - `useVideoScan`, `VideoScanPanel`, `VideoScanProgress`, `NOT_RUNNING` (existing).
- Produces:
  ```ts
  useVideoScan(roomId, onReady: (file: File, roomId: string, jobId: string) => void)   // the job id is new; RoomView's 2-arg callback still fits
  VideoScanPanel({ state, onStart, onCancel, buttonLabel?: string /* default 'Choose or record a video' */, showPrivacy?: boolean /* default true */ })
  RoomsHome(): JSX.Element
  ```

There are no unit tests: this is glue over Tasks 2–4. Task 6 checks it in the browser.

- [ ] **Step 1: Pass the job id on**

In `src/components/useVideoScan.ts`:
- Change the signature's callback type to `onReady: (file: File, roomId: string, jobId: string) => void`.
- In the follow effect, change `ready.current(file, room);` to `ready.current(file, room, id);`.
- Update the doc comment's mention of `onReady(file, roomId)` to `onReady(file, roomId, jobId)`.

`RoomView`'s `onVideoReady(file, forRoom)` keeps working unchanged.

- [ ] **Step 2: Let the panel be labelled for importing**

In `src/components/VideoScanPanel.tsx`'s `VideoScanPanel`:
- Add two optional props: `buttonLabel = 'Choose or record a video'` and `showPrivacy = true`.
- Render `{buttonLabel}` instead of the literal button text.
- Render the privacy paragraph only when `showPrivacy`.

Nothing else changes, and RoomView passes neither prop.

- [ ] **Step 3: Write `src/components/RoomsHome.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { fetchHealth, fetchRooms } from '@/lib/splatJobs/client';
import { NOT_RUNNING } from '@/lib/splatJobs/panel';
import type { Health, RoomSummary } from '@/lib/splatJobs/protocol';
import { roomFromHash, roomHash, roomLabel } from '@/lib/viewer/rooms';
import { SplatViewer } from './SplatViewer';
import { useVideoScan } from './useVideoScan';
import { VideoScanPanel, VideoScanProgress } from './VideoScanPanel';

const BUILD_KEY = 'home'; // useVideoScan remembers the running build per key; this page has one
const subscribeHash = (changed: () => void) => {
  window.addEventListener('hashchange', changed);
  return () => window.removeEventListener('hashchange', changed);
};

/** The whole app now (spec 2026-10-07 §3): import a video, follow its build, and open rooms in the viewer. */
export function RoomsHome() {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => '');
  const openRoom = roomFromHash(hash);
  const [health, setHealth] = useState<Health | null | undefined>(undefined); // undefined: still asking
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [listVersion, setListVersion] = useState(0);
  const openedHere = useRef(false); // Back goes back in history only if this page opened the viewer

  useEffect(() => {
    let live = true;
    void fetchHealth().then((answer) => {
      if (live) setHealth(answer);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let live = true;
    void fetchRooms().then((list) => {
      if (live) setRooms(list);
    });
    return () => {
      live = false;
    };
  }, [listVersion]);

  const open = useCallback((id: string) => {
    openedHere.current = true;
    window.location.hash = roomHash(id);
  }, []);

  const onReady = useCallback(
    (_file: File, _key: string, jobId: string) => {
      setListVersion((n) => n + 1);
      open(jobId);
    },
    [open],
  );
  const build = useVideoScan(BUILD_KEY, onReady);

  const back = () => {
    if (openedHere.current) {
      openedHere.current = false;
      window.history.back();
    } else {
      window.location.hash = '';
    }
  };

  if (openRoom) return <SplatViewer roomId={openRoom} onBack={back} />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">Hearify</h1>
        <p className="text-lg text-neutral-300">Import a video of your room and walk around it in 3D.</p>
      </header>
      {health === null && (
        <p className="text-neutral-300">
          Start the room builder with <code className="rounded bg-neutral-800 px-1">pnpm run demo</code>, then open
          http://localhost:8080.
        </p>
      )}
      {health && (
        <>
          <section aria-label="Import a video" className="flex flex-col gap-3">
            {health.pipeline !== 'ready' && <p className="text-amber-200">{NOT_RUNNING}</p>}
            {health.pipeline === 'ready' && (build.state.kind === 'idle' || build.state.kind === 'uploading') && (
              <VideoScanPanel
                state={build.state}
                onStart={build.start}
                onCancel={build.cancel}
                buttonLabel="Import a video"
                showPrivacy={false}
              />
            )}
            {(build.state.kind === 'building' || build.state.kind === 'downloading' || build.state.kind === 'failed') && (
              <VideoScanProgress state={build.state} onCancel={build.cancel} onDismiss={build.dismiss} onRetry={build.retry} />
            )}
          </section>
          <section aria-labelledby="your-rooms" className="flex flex-col gap-3">
            <h2 id="your-rooms" className="text-xl font-semibold">
              Your rooms
            </h2>
            {rooms === null && <p className="text-neutral-400">Couldn't load the rooms on this laptop.</p>}
            {rooms?.length === 0 && <p className="text-neutral-400">No rooms yet. Import a video to make one.</p>}
            {rooms && rooms.length > 0 && (
              <ul className="flex flex-col gap-2">
                {rooms.map((room) => (
                  <li key={room.id}>
                    <button
                      onClick={() => open(room.id)}
                      className="flex min-h-11 w-full items-center rounded-lg border border-neutral-800 px-4 text-left hover:border-neutral-600"
                    >
                      {roomLabel(room)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Point `/` at it**

Replace the whole of `src/app/page.tsx` with:

```tsx
import { RoomsHome } from '@/components/RoomsHome';

/** Spec 2026-10-07: the app is the splat viewer. The old landing page's components stay in src/components, unused. */
export default function Home() {
  return <RoomsHome />;
}
```

In `src/app/layout.tsx`, change the metadata `description` to `'Import a video of your room and walk around it in 3D.'`.

- [ ] **Step 5: Check**

Run `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run build`; all must be clean. If a React hooks lint rule objects to something, keep the behaviour and use the smallest change that satisfies it. Report it.

- [ ] **Step 6: Commit**

```powershell
git commit -m "feat: the home page is the room viewer: import a video, follow the build, open your rooms" -m "<your Co-Authored-By trailer>" -- src/components/RoomsHome.tsx src/app/page.tsx src/app/layout.tsx src/components/useVideoScan.ts src/components/VideoScanPanel.tsx
```

---

### Task 6: Real check on the laptop (controller)

**Run by the controller.** It restarts the demo server, builds a real room, pins the camera conventions and walks through the viewer.

- [ ] **Step 1: Start the demo server so it can be stopped cleanly**

Run `npm run build`. Then, from PowerShell:

```powershell
$p = Start-Process -FilePath node -ArgumentList '--import','tsx','src/server/main.ts' -WorkingDirectory "C:\Users\ryany\OneDrive\Desktop\Room Remix" -PassThru -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\rr-demo.log" -RedirectStandardError "$env:TEMP\rr-demo.err"
```

Keep `$p.Id` and stop it with `Stop-Process -Id` at the end. Docker Desktop must be running.

- [ ] **Step 2: Build one room with the new pipeline**

In Chrome at 1280×800, open `http://localhost:8080`. Import the 25 s sample: `e2e.mp4` remade under the repo's `.superpowers/` (a path the browser tool may read), or any South Building video from `%LOCALAPPDATA%\Hearify\samples`. Choose Quick and wait for the viewer to open.

- [ ] **Step 3: Pin the camera conventions**

The job's folder must now have `cameras.json`. Compare the viewer's first view with `images/0001.jpg` from that job:
- **They match** (same framing, upright): the conventions are right.
- **The view is upside down, mirrored or looking backwards:** dispatch a fix to `src/lib/viewer/view.ts`'s `CAMERA_UP` or `CAMERA_FORWARD` (and its tests' camera helper, which encodes the same convention). Use the sign or column that makes the real first view match. If positions and splat disagree by a fixed axis flip, add one documented frame rotation in `viewFromCameras`. Re-check after the fix.

Record the ruling either way.

- [ ] **Step 4: Walk through everything**

- **Moving:**
  - W/A/S/D move level with the floor; Q/E go down and up; Shift is faster.
  - Holding W and switching windows stops moving (keys released on blur).
- **Looking:** click locks the pointer and the mouse looks around; Esc unlocks; looking straight down and pressing W still moves level.
- **Spinning:** a drag spins and doesn't lock the pointer; scroll zooms.
- **Navigation:**
  - Back returns to the page, and the browser's back button does too.
  - A reload while in the viewer reopens the same room.
- **Rooms:**
  - An older room (no `cameras.json`, e.g. the Plan 6 South Building builds) opens through the fallback: Memento's flip, from outside.
  - "Your rooms" lists the new room at the top as "<date, time> · Quick".
- **Without the demo server:** `npm run dev` shows only the start line, with no import and no list.
- **Console:** no errors.

Take screenshots of the first view next to `images/0001.jpg`, the page, and an older room.

- [ ] **Step 5: Stop the server**

`Stop-Process -Id $p.Id`, then confirm port 8080 is free.
