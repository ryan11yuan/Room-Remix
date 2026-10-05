# Room Remix: Plan 4, Splat View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user load a phone scan of their room (a Gaussian splat from Scaniverse, Polycam or Luma: `.ply`, `.spz`, `.splat` or `.ksplat`), line it up with the room box in three guided steps, and see their real room in the 3D view with the speaker, listener, rug, panels and sound rays on top. The scan stays on the device (IndexedDB) and survives reloads.

**Architecture:**
- **Rendering:** Spark (`@sparkjsdev/spark`) renders the splat inside the existing three.js scene. Spark is about 2.8 MB, so it loads by dynamic import only when a scan is opened; the room page doesn't pay for it otherwise.
- **Alignment maths and tap steps:** pure functions on three.js maths classes, tested in Node.
- **Storage:** a small IndexedDB wrapper, tested in Node with `fake-indexeddb`.
- **Scene support:** `RoomScene` gains generic layer hooks, a scan tap mode, shell styles (tinted, outline, hidden) and a render loop that pauses off-screen.
- **Orchestration:** a browser-only `ScanController` ties scene, layer, storage and alignment together. `RoomView` shows its status and controls.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, three.js 0.186, Spark 2.3, zustand, Vitest, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-04-room-remix-design.md` (§8 "Splat layer", §9 "Splats: IndexedDB", §11 splat errors). Follow-ups this plan picks up: `docs/superpowers/plans/2026-10-05-room-remix-plan-3-followups.md` ("Fix before or with Plan 4").

**Decided here:**
- **No demo bedroom yet:** the pre-aligned demo bedroom needs the author's own scan, room size and materials. Until those arrive it ships with Plan 5's landing page; this plan builds everything a demo would load through.
- **Storage key:** one scan is stored at a time, under the key `current`. Plan 5's "My rooms" will key scans by room id.
- **Alignment:**
  - **Step 1, floor:** tap 3 floor points. This levels the scan, with "up" on the camera's side.
  - **Step 2, corners:** tap the **front-right** then the **back-right** floor corner. These are the two ends of the right wall (`wallZ0`): room (0, 0, 0) and (length, 0, 0). This sets scale (typed length ÷ tapped distance), turn and position.
  - **Step 3, fine-tune:** turn ±1°/±5°, scale ±1%, move ±5 cm, all about the room's centre.
- **Crop:** splats outside the room box plus 0.3 m are hidden with a Spark `SplatEdit` box. Spark's box SDF uses the edit object's `scale` as half-extents.

## Global Constraints

- Static export only. **No user data leaves the device:** scans are read from a local file and stored only in this browser's IndexedDB. Never fetch or upload them.
- Coordinate frame: metres; origin at the front-right floor corner; x along length (toward the back), z along width (toward the left), y up. three.js uses the same axes. Facing the front wall (x = 0), the right wall is `wallZ0`.
- `src/lib/acoustics/**` and `src/lib/room/**` don't import three.js or Spark and don't touch the DOM. three.js stays in `src/lib/scene/**` and `src/components/**`. Spark is imported **only** by `src/lib/scene/SplatLayer.ts`, and only through dynamic `import()` from browser code.
- Warn above 1,500,000 splats (spec §8).
- Shell is Windows PowerShell. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, passed as a second `-m`.

## Review Focus

1. **The scan's own axes are arbitrary:** z-up, y-down, a different scale, or far from the origin. Alignment must recover the room exactly whatever the scan's orientation, scale and position. Tests: Task 1 (random transforms, an upside-down scan).
2. **Degenerate taps** (three floor points in a line, two corners in the same spot): a friendly message, and the step is not advanced. Tests: Task 1.
3. **Reloading the page:** the scan and its alignment come back from IndexedDB. If storage is full, the scan still shows for this session with a warning. Tests: Task 2 (store round trip); Task 5 browser check.
4. **A file that isn't a splat, or is corrupt:** "Couldn't read this scan" and the box view stays. No crash, no half-added layer. Task 5 browser check.
5. **The scan hides the room:** while aligning, the room box is hidden. Once aligned, walls switch to outline-only so the splat isn't tinted or hidden. Rays, handles and fixes stay drawn over the splat. Task 3 (shell styles) and Task 5 browser check.

---

## File Structure

```
src/lib/scene/
  alignment.ts         NEW  Alignment type, matrix, toRoom, levelFromFloor, alignFromCorners, nudgeAlignment, align tap steps
  alignment.test.ts    NEW
  scanStore.ts         NEW  IndexedDB: saveScan, loadScan, updateScanAlignment, deleteScan
  scanStore.test.ts    NEW
  layout.ts            MOD  boxView(min, max) camera framing for a bounding box
  RoomScene.ts         MOD  renderer getter, addLayer/removeLayer, tap modes (none/panel/scan), shell styles, room visibility, frameBox, pause off-screen
  SplatLayer.ts        NEW  Spark renderer + SplatMesh + crop edit (browser only)
  ScanController.ts    NEW  load/restore/align/nudge/finish/show/remove; talks to RoomScene, SplatLayer, scanStore
src/lib/room/
  placement.ts         MOD  applyDrag ignores drags while dimensions are invalid (Plan 3 follow-up)
src/components/
  RoomView.tsx         MOD  scan controls, alignment banner and nudge controls; tap mode wiring
```

---

### Task 1: Alignment maths and tap steps

**Files:**
- Create: `src/lib/scene/alignment.ts`, `src/lib/scene/alignment.test.ts`

**Interfaces:**
- Consumes: `Dims`, `Vec3` (room types); three.js maths.
- Produces:
  ```ts
  type Alignment = { level: [number, number, number, number]; scale: number; yaw: number; offset: Vec3 };
  IDENTITY_ALIGNMENT: Alignment
  alignmentMatrix(a: Alignment): THREE.Matrix4          // scan → room: offset · Ry(yaw) · scale · level
  toRoom(a: Alignment, p: Vec3): Vec3
  levelFromFloor(points: [Vec3, Vec3, Vec3], viewer: Vec3): Alignment['level']   // throws on collinear points
  alignFromCorners(level, floorPoint: Vec3, front: Vec3, back: Vec3, dims: Dims): Alignment  // throws if corners coincide
  nudgeAlignment(a: Alignment, change: { yaw?: number; scale?: number; x?: number; z?: number }, pivot: Vec3): Alignment
  type AlignState =
    | { step: 'floor'; floor: Vec3[] }
    | { step: 'corners'; level: Alignment['level']; floorPoint: Vec3; corners: Vec3[] }
    | { step: 'nudge'; alignment: Alignment };
  startAlign(): AlignState
  alignTap(state: AlignState, point: Vec3, viewer: Vec3, dims: Dims): AlignState   // throws AlignError on degenerate input (state unchanged)
  class AlignError extends Error {}
  ```

How it works:
- **Level:** the floor normal from three points is turned to +y. It is flipped first if needed so it points at the camera, which was above the floor.
- **Scale and yaw:** after levelling, the two corners give the horizontal vector `d = back − front`. Then `scale = length / |d|` and `yaw = atan2(d.z, d.x)`, so `Ry(yaw)` turns `d` onto +x (three.js `makeRotationY` convention).
- **Offset:** chosen so the front-right corner lands at the origin and the floor at y = 0.
- **Interior side:** the scan is a rotated, scaled copy of the room (never mirrored), so the room's interior lands on +z.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scene/alignment.test.ts`:
```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/lib/room/types';
import {
  AlignError,
  alignFromCorners,
  alignmentMatrix,
  alignTap,
  IDENTITY_ALIGNMENT,
  levelFromFloor,
  nudgeAlignment,
  startAlign,
  toRoom,
  type Alignment,
} from './alignment';

const dims = { length: 4, width: 3.5, height: 2.6 };

/** A scan: the room seen through an arbitrary rotation, scale and offset (the inverse of what we must recover). */
function makeScan(rotation: THREE.Quaternion, scale: number, offset: THREE.Vector3) {
  const roomToScan = new THREE.Matrix4().compose(offset, rotation, new THREE.Vector3(scale, scale, scale));
  return (p: Vec3): Vec3 => {
    const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(roomToScan);
    return { x: v.x, y: v.y, z: v.z };
  };
}

const expectNear = (a: Vec3, b: Vec3) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
  expect(a.z).toBeCloseTo(b.z, 9);
};

function recover(scan: (p: Vec3) => Vec3): Alignment {
  let state = startAlign();
  const viewer = scan({ x: 2, y: 2.2, z: 1.75 }); // the camera stood in the room, above the floor
  for (const p of [{ x: 1, y: 0, z: 1 }, { x: 3, y: 0, z: 0.5 }, { x: 2, y: 0, z: 3 }]) state = alignTap(state, scan(p), viewer, dims);
  state = alignTap(state, scan({ x: 0, y: 0, z: 0 }), viewer, dims); // front-right corner
  state = alignTap(state, scan({ x: dims.length, y: 0, z: 0 }), viewer, dims); // back-right corner
  if (state.step !== 'nudge') throw new Error('expected to reach the nudge step');
  return state.alignment;
}

describe('alignment', () => {
  it('is the identity for IDENTITY_ALIGNMENT', () => {
    expect(alignmentMatrix(IDENTITY_ALIGNMENT).equals(new THREE.Matrix4())).toBe(true);
  });

  it('recovers the room from a rotated, scaled, shifted scan', () => {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 1.1, -0.3));
    const scan = makeScan(rotation, 0.37, new THREE.Vector3(2, -1, 5));
    const alignment = recover(scan);
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 2.6, z: 3.5 }, { x: 1.2, y: 1.1, z: 2.9 }, { x: 0.6, y: 1, z: 1.4 }]) {
      expectNear(toRoom(alignment, scan(p)), p);
    }
  });

  it('recovers an upside-down (y-down) scan with the camera deciding which way is up', () => {
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
    const scan = makeScan(rotation, 2.5, new THREE.Vector3(-3, 4, 0.5));
    const alignment = recover(scan);
    expectNear(toRoom(alignment, scan({ x: 4, y: 2.6, z: 3.5 })), { x: 4, y: 2.6, z: 3.5 });
  });

  it('refuses three floor points in a line', () => {
    expect(() => levelFromFloor([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }], { x: 0, y: 1, z: 0 })).toThrow(AlignError);
  });

  it('refuses two corners in the same spot', () => {
    expect(() => alignFromCorners([0, 0, 0, 1], { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }, { x: 1, y: 0.5, z: 1 }, dims)).toThrow(AlignError);
  });

  it('leaves the state unchanged when a tap is refused', () => {
    let state = startAlign();
    const viewer = { x: 0, y: 1, z: 0 };
    state = alignTap(state, { x: 0, y: 0, z: 0 }, viewer, dims);
    state = alignTap(state, { x: 1, y: 0, z: 0 }, viewer, dims);
    expect(() => alignTap(state, { x: 2, y: 0, z: 0 }, viewer, dims)).toThrow(AlignError);
    expect(state).toEqual({ step: 'floor', floor: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] });
  });
});

describe('nudgeAlignment', () => {
  const pivot = { x: 2, y: 0, z: 1.75 };
  const base: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };

  it('turns and scales about the pivot, which stays put', () => {
    const turned = nudgeAlignment(base, { yaw: 0.3, scale: 1.1 }, pivot);
    expectNear(toRoom(turned, pivot), pivot);
    expect(turned.yaw).toBeCloseTo(0.3, 12);
    expect(turned.scale).toBeCloseTo(1.1, 12);
  });

  it('moves along x and z', () => {
    expectNear(toRoom(nudgeAlignment(base, { x: 0.05, z: -0.05 }, pivot), { x: 1, y: 1, z: 1 }), { x: 1.05, y: 1, z: 0.95 });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scene/alignment.test.ts`
Expected: FAIL. Cannot resolve `./alignment`.

- [ ] **Step 3: Implement**

Create `src/lib/scene/alignment.ts`:
```ts
import * as THREE from 'three';
import type { Dims, Vec3 } from '@/lib/room/types';

/** How a scan sits in the room: level its floor, scale it to metres, turn it, then move it. */
export type Alignment = {
  level: [number, number, number, number]; // quaternion (x, y, z, w) turning the scan's floor normal to +y
  scale: number;
  yaw: number; // radians about +y, three.js makeRotationY convention
  offset: Vec3; // metres, applied last
};

export const IDENTITY_ALIGNMENT: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };

/** A tap that can't be used, with a message for the user. */
export class AlignError extends Error {}

const UP = new THREE.Vector3(0, 1, 0);
const vec = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const plain = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Scan → room transform: offset · Ry(yaw) · scale · level. */
export function alignmentMatrix(a: Alignment): THREE.Matrix4 {
  const level = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(...a.level));
  const scale = new THREE.Matrix4().makeScale(a.scale, a.scale, a.scale);
  const yaw = new THREE.Matrix4().makeRotationY(a.yaw);
  const move = new THREE.Matrix4().makeTranslation(a.offset.x, a.offset.y, a.offset.z);
  return move.multiply(yaw).multiply(scale).multiply(level);
}

export function toRoom(a: Alignment, p: Vec3): Vec3 {
  return plain(vec(p).applyMatrix4(alignmentMatrix(a)));
}

/** Rotation that levels the floor through three tapped points; "up" is the side the camera (viewer) was on. */
export function levelFromFloor(points: [Vec3, Vec3, Vec3], viewer: Vec3): Alignment['level'] {
  const [a, b, c] = points.map(vec);
  const normal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
  if (normal.lengthSq() < 1e-12 * Math.max(1, b.distanceToSquared(a) * c.distanceToSquared(a))) {
    throw new AlignError('Those floor points are in a line. Tap three spots spread out across the floor.');
  }
  normal.normalize();
  if (normal.dot(vec(viewer).sub(a)) < 0) normal.negate();
  const q = new THREE.Quaternion().setFromUnitVectors(normal, UP);
  return [q.x, q.y, q.z, q.w];
}

/**
 * Finish an alignment from the two ends of the right wall, tapped on the floor:
 * `front` is the front-right corner (room 0, 0, 0) and `back` the back-right corner (room length, 0, 0).
 */
export function alignFromCorners(level: Alignment['level'], floorPoint: Vec3, front: Vec3, back: Vec3, dims: Dims): Alignment {
  const q = new THREE.Quaternion(...level);
  const f = vec(front).applyQuaternion(q);
  const b = vec(back).applyQuaternion(q);
  const dx = b.x - f.x;
  const dz = b.z - f.z;
  const span = Math.hypot(dx, dz);
  if (span < 1e-9) throw new AlignError('Those corners are in the same spot. Tap both ends of the right wall.');
  const scale = dims.length / span;
  const yaw = Math.atan2(dz, dx);
  const turned = f.clone().multiplyScalar(scale).applyAxisAngle(UP, yaw);
  const floorY = vec(floorPoint).applyQuaternion(q).y * scale;
  return { level, scale, yaw, offset: { x: -turned.x, y: -floorY, z: -turned.z } };
}

/** Fine-tune: turn and scale about `pivot` (it stays put), then move along x/z. */
export function nudgeAlignment(
  a: Alignment,
  change: { yaw?: number; scale?: number; x?: number; z?: number },
  pivot: Vec3,
): Alignment {
  const k = change.scale ?? 1;
  const dyaw = change.yaw ?? 0;
  const c = vec(pivot);
  const offset = vec(a.offset).sub(c).applyAxisAngle(UP, dyaw).multiplyScalar(k).add(c);
  offset.x += change.x ?? 0;
  offset.z += change.z ?? 0;
  return { level: a.level, scale: a.scale * k, yaw: a.yaw + dyaw, offset: plain(offset) };
}

export type AlignState =
  | { step: 'floor'; floor: Vec3[] }
  | { step: 'corners'; level: Alignment['level']; floorPoint: Vec3; corners: Vec3[] }
  | { step: 'nudge'; alignment: Alignment };

export const startAlign = (): AlignState => ({ step: 'floor', floor: [] });

/** Take one tap on the scan. Throws AlignError (state unchanged) when the tap can't be used. */
export function alignTap(state: AlignState, point: Vec3, viewer: Vec3, dims: Dims): AlignState {
  switch (state.step) {
    case 'floor': {
      const floor = [...state.floor, point];
      if (floor.length < 3) return { step: 'floor', floor };
      const level = levelFromFloor([floor[0], floor[1], floor[2]], viewer);
      return { step: 'corners', level, floorPoint: floor[0], corners: [] };
    }
    case 'corners': {
      const corners = [...state.corners, point];
      if (corners.length < 2) return { ...state, corners };
      return { step: 'nudge', alignment: alignFromCorners(state.level, state.floorPoint, corners[0], corners[1], dims) };
    }
    case 'nudge':
      return state;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/scene/alignment.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Check and commit**

Run `npm test` and `npx tsc --noEmit` (clean).
```powershell
git add src/lib/scene/alignment.ts src/lib/scene/alignment.test.ts
git commit -m "feat: scan alignment maths and tap steps" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Scan storage on the device (IndexedDB)

**Files:**
- Create: `src/lib/scene/scanStore.ts`, `src/lib/scene/scanStore.test.ts`
- Modify: `package.json` (dev dependency)

**Interfaces:**
- Consumes: `Alignment` (Task 1, type only).
- Produces:
  ```ts
  type StoredScan = { fileName: string; bytes: ArrayBuffer; alignment: Alignment | null; savedAt: number };
  CURRENT_SCAN = 'current'
  saveScan(scan: StoredScan, key?: string, factory?: IDBFactory): Promise<void>      // rejects (e.g. QuotaExceededError) if it can't be stored
  loadScan(key?: string, factory?: IDBFactory): Promise<StoredScan | null>
  updateScanAlignment(alignment: Alignment | null, key?: string, factory?: IDBFactory): Promise<void>  // no-op if nothing stored
  deleteScan(key?: string, factory?: IDBFactory): Promise<void>
  ```
  `factory` defaults to the browser's `indexedDB`; tests pass a fresh `fake-indexeddb` factory.

- [ ] **Step 1: Install the test double**

Run: `npm install -D fake-indexeddb`

- [ ] **Step 2: Write the failing tests**

Create `src/lib/scene/scanStore.test.ts`:
```ts
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Alignment } from './alignment';
import { deleteScan, loadScan, saveScan, updateScanAlignment, type StoredScan } from './scanStore';

const alignment: Alignment = { level: [0, 0, 0, 1], scale: 2, yaw: 0.5, offset: { x: 1, y: 0, z: -1 } };
const scan = (): StoredScan => ({ fileName: 'bedroom.spz', bytes: Uint8Array.of(1, 2, 3, 250).buffer, alignment: null, savedAt: 1 });

describe('scanStore', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadScan(undefined, new IDBFactory())).toBeNull();
  });

  it('round-trips the file bytes and name', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    const loaded = await loadScan(undefined, factory);
    expect(loaded?.fileName).toBe('bedroom.spz');
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
    expect(loaded?.alignment).toBeNull();
  });

  it('updates the alignment without touching the bytes', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    await updateScanAlignment(alignment, undefined, factory);
    const loaded = await loadScan(undefined, factory);
    expect(loaded?.alignment).toEqual(alignment);
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
  });

  it('ignores an alignment update when nothing is stored', async () => {
    const factory = new IDBFactory();
    await updateScanAlignment(alignment, undefined, factory);
    expect(await loadScan(undefined, factory)).toBeNull();
  });

  it('deletes the scan', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    await deleteScan(undefined, factory);
    expect(await loadScan(undefined, factory)).toBeNull();
  });

  it('keeps scans under different keys apart', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), 'a', factory);
    expect(await loadScan('b', factory)).toBeNull();
    expect((await loadScan('a', factory))?.fileName).toBe('bedroom.spz');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scene/scanStore.test.ts`
Expected: FAIL. Cannot resolve `./scanStore`.

- [ ] **Step 4: Implement**

Create `src/lib/scene/scanStore.ts`:
```ts
import type { Alignment } from './alignment';

/** A scan kept in this browser only. It is never uploaded. */
export type StoredScan = { fileName: string; bytes: ArrayBuffer; alignment: Alignment | null; savedAt: number };

export const CURRENT_SCAN = 'current';
const DB_NAME = 'room-remix';
const DB_VERSION = 1;
const STORE = 'scans';

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage was aborted'));
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  return done(request);
}

async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await open(factory);
  try {
    const tx = db.transaction(STORE, mode);
    const [result] = await Promise.all([work(tx.objectStore(STORE)), finished(tx)]);
    return result;
  } finally {
    db.close();
  }
}

const browserIndexedDB = () => globalThis.indexedDB;

export function saveScan(scan: StoredScan, key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.put(scan, key));
  });
}

export function loadScan(key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<StoredScan | null> {
  return withStore(factory, 'readonly', async (store) => ((await done(store.get(key))) as StoredScan | undefined) ?? null);
}

export function updateScanAlignment(
  alignment: Alignment | null,
  key = CURRENT_SCAN,
  factory: IDBFactory = browserIndexedDB(),
): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    const existing = (await done(store.get(key))) as StoredScan | undefined;
    if (existing) await done(store.put({ ...existing, alignment }, key));
  });
}

export function deleteScan(key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.delete(key));
  });
}
```

- [ ] **Step 5: Run the tests, check and commit**

Run: `npx vitest run src/lib/scene/scanStore.test.ts` (PASS, 6 tests), then `npm test`, `npx tsc --noEmit` and `npm run lint`.
```powershell
git add package.json package-lock.json src/lib/scene/scanStore.ts src/lib/scene/scanStore.test.ts
git commit -m "feat: keep a scan and its alignment on the device" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Scene support for a splat layer

**Files:**
- Modify: `src/lib/scene/RoomScene.ts`, `src/lib/scene/layout.ts`, `src/lib/scene/layout.test.ts`, `src/lib/room/placement.ts`, `src/lib/room/placement.test.ts`, `src/components/RoomView.tsx`

**Interfaces:**
- Produces:
  - `layout.ts`: `boxView(min: Vec3, max: Vec3): { position: Vec3; target: Vec3 }`. It looks at the box centre from the +x, +y, +z diagonal at 1.6 × the box diagonal.
  - `RoomScene` changes:
    - `get renderer(): THREE.WebGLRenderer`
    - `addLayer(object)`, `removeLayer(object)`
    - `type TapMode = 'none' | 'panel' | 'scan'`; `setTapMode(mode)` replaces `setPlacingPanel(boolean)`
    - `setScanTargets(objects: THREE.Object3D[])`
    - callback `onScanTap(point: Vec3, viewer: Vec3)`: in scan mode, the first hit on a scan target, plus the camera position
    - `type ShellStyle = 'tinted' | 'outline' | 'hidden'`; `setShellStyle(style)`
    - `setRoomItemsVisible(visible)`: speaker, listener, fixes and rays
    - `frameBox(min, max)`
    - the render loop skips frames while the canvas is off-screen
  - `placement.ts`: `applyDrag` returns the room unchanged when any dimension isn't finite and positive.

- [ ] **Step 1: Write the failing tests**

In `src/lib/scene/layout.test.ts`, add:
```ts
describe('boxView', () => {
  it('looks at the centre of a box from outside it', () => {
    const { position, target } = boxView({ x: -1, y: 0, z: -2 }, { x: 3, y: 2, z: 2 });
    expect(target).toEqual({ x: 1, y: 1, z: 0 });
    expect(position.x).toBeGreaterThan(3);
    expect(position.y).toBeGreaterThan(2);
    expect(position.z).toBeGreaterThan(2);
  });
});
```
(Add `boxView` to the import from `./layout`.)

In `src/lib/room/placement.test.ts`, add inside `describe('applyDrag')`:
```ts
  it('ignores drags while a room size is being edited', () => {
    const room: RoomState = { ...defaultRoom(), dims: { length: Number.NaN, width: 3.5, height: 2.6 } };
    expect(applyDrag(room, { kind: 'speaker' }, { x: 2, y: 0, z: 2 })).toBe(room);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/scene/layout.test.ts src/lib/room/placement.test.ts`
Expected: FAIL. `boxView` is not exported, and `applyDrag` returns a new room with NaN.

- [ ] **Step 3: Implement the pure parts**

In `src/lib/scene/layout.ts`, add:
```ts
/** Look at the centre of a box (e.g. a scan's bounds) from outside, on the +x, +y, +z diagonal. */
export function boxView(min: Vec3, max: Vec3): { position: Vec3; target: Vec3 } {
  const target = vec((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const reach = 1.6 * Math.max(Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z), 0.5) / Math.sqrt(3);
  return { position: vec(target.x + reach, target.y + reach, target.z + reach), target };
}
```

In `src/lib/room/placement.ts`, at the top of `applyDrag`:
```ts
  const { length, width, height } = room.dims;
  if (![length, width, height].every((d) => Number.isFinite(d) && d > 0)) return room; // a size is mid-edit
```

- [ ] **Step 4: Extend RoomScene**

In `src/lib/scene/RoomScene.ts`:
1. **Types:**
   - `export type TapMode = 'none' | 'panel' | 'scan'; export type ShellStyle = 'tinted' | 'outline' | 'hidden';`
   - Add `onScanTap: (point: Vec3, viewer: Vec3) => void;` to `SceneCallbacks`.
2. **Renderer getter:** `get renderer(): THREE.WebGLRenderer { return this.webgl; }`. Rename the private field `renderer` to `webgl` throughout, so the getter doesn't clash.
3. **Layers:**
   - `addLayer(object: THREE.Object3D) { this.scene.add(object); }`
   - `removeLayer(object: THREE.Object3D) { this.scene.remove(object); }`
4. **Tap mode:** replace the `placingPanel` boolean with `private tapMode: TapMode = 'none';` and `setTapMode(mode: TapMode)`. The cursor is crosshair unless the mode is 'none'.
   - `onPointerDown`: return early (no drag) when `tapMode !== 'none'`. This is where it currently checks `placingPanel`.
   - `onPointerUp` taps:
     - for `'panel'`, keep today's wall logic;
     - for `'scan'`, intersect `this.scanTargets` and call `onScanTap(hit point, camera position)` for the first hit.
   - Add `private scanTargets: THREE.Object3D[] = []` and `setScanTargets(objects: THREE.Object3D[]) { this.scanTargets = objects; }`.
5. **Shell style:** `private shellStyle: ShellStyle = 'tinted';` and `setShellStyle(style)` stores it and calls `applyShellStyle()`. `applyShellStyle()` sets on the current shell:
   - surfaces (`userData.surface`): `visible = style === 'tinted'`;
   - the `edges` child: `visible = style !== 'hidden'`;
   - the `grid` child: `visible = style === 'tinted'`.

   Call `applyShellStyle()` right after a new shell is built in `setRoom`. Invisible wall meshes still raycast, so panel placement keeps working in outline mode.
6. **Room items:** `setRoomItemsVisible(visible: boolean)` sets `visible` on `this.speaker`, `this.listener`, `this.fixes` (if any) and `this.rays.object`. Remember the value in a field and re-apply it to a newly built fixes group. `setRaysVisible` must still work. Track rays with their own flag and show them only when both the room-items flag and the rays flag are true.
7. **`frameBox(min: Vec3, max: Vec3)`:** apply `boxView(min, max)` the same way `setCameraPreset` applies a preset: clear momentum first, set position and target, update. Set `userMoved = false`.
8. **Pause off-screen:**
   - In the constructor, create an `IntersectionObserver` on the canvas that keeps `this.onScreen` (default true) up to date.
   - In the animation loop, `if (!this.onScreen) return;` before updating and rendering.
   - Disconnect the observer in `dispose()`.

In `src/components/RoomView.tsx`:
- Replace the `setPlacingPanel(placing)` effect with `sceneRef.current?.setTapMode(placing ? 'panel' : 'none')`. Task 5 extends this.
- Add `onScanTap: () => {}` to the scene callbacks for now. Task 5 replaces it.

- [ ] **Step 5: Run tests, check and commit**

Run: `npx vitest run src/lib/scene src/lib/room` (PASS), then `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`.
```powershell
git add src/lib/scene src/lib/room src/components/RoomView.tsx
git commit -m "feat: scene layers, scan tap mode, shell styles and off-screen pause" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The splat layer (Spark)

**Files:**
- Modify: `package.json` (dependency)
- Create: `src/lib/scene/SplatLayer.ts`

**Interfaces:**
- Consumes: `alignmentMatrix`, `Alignment` (Task 1); `Dims`.
- Produces:
  ```ts
  class SplatLayer {
    readonly group: THREE.Group;                       // add to the scene with RoomScene.addLayer
    constructor(renderer: THREE.WebGLRenderer);
    load(bytes: ArrayBuffer, fileName: string): Promise<{ count: number; min: Vec3; max: Vec3 }>;  // rejects for unreadable files
    get targets(): THREE.Object3D[];                   // what scan taps should raycast against
    setAlignment(alignment: Alignment | null): void;   // null = the scan's own coordinates (used while aligning)
    setCrop(dims: Dims | null): void;                  // hide splats outside the room + 0.3 m
    setVisible(visible: boolean): void;
    dispose(): void;
  }
  ```
  This module is browser-only and must only be reached through `await import('@/lib/scene/SplatLayer')`. Its behaviour is verified in the browser (Task 5).

- [ ] **Step 1: Install Spark**

Run: `npm install @sparkjsdev/spark@^2.3.1`
Expected: added to dependencies. Its peer dependency `three >= 0.180` is satisfied by three 0.186.

- [ ] **Step 2: Write the layer**

Create `src/lib/scene/SplatLayer.ts`:
```ts
import {
  SparkRenderer,
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatMesh,
} from '@sparkjsdev/spark';
import * as THREE from 'three';
import type { Dims, Vec3 } from '@/lib/room/types';
import { alignmentMatrix, type Alignment } from './alignment';

const CROP_MARGIN = 0.3; // metres of scan kept beyond the room box (walls are rarely captured exactly flat)

const plain = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** A phone scan of the room drawn by Spark inside the three.js scene. Browser only. */
export class SplatLayer {
  readonly group = new THREE.Group();
  private readonly spark: SparkRenderer;
  private mesh: SplatMesh | null = null;
  private crop: SplatEdit | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    this.spark = new SparkRenderer({ renderer });
    this.group.name = 'splat-layer';
    this.group.add(this.spark);
  }

  /** Parse a scan file kept on this device. Rejects if Spark can't read it; nothing is left behind on failure. */
  async load(bytes: ArrayBuffer, fileName: string): Promise<{ count: number; min: Vec3; max: Vec3 }> {
    this.removeMesh();
    const mesh = new SplatMesh({ fileBytes: bytes, fileName, raycastable: true });
    mesh.matrixAutoUpdate = false; // the alignment matrix is set directly
    try {
      await mesh.initialized;
    } catch (error) {
      mesh.dispose();
      throw error;
    }
    this.mesh = mesh;
    this.group.add(mesh);
    const box = mesh.getBoundingBox(true);
    return { count: mesh.packedSplats?.numSplats ?? 0, min: plain(box.min), max: plain(box.max) };
  }

  get targets(): THREE.Object3D[] {
    return this.mesh ? [this.mesh] : [];
  }

  setAlignment(alignment: Alignment | null): void {
    if (!this.mesh) return;
    this.mesh.matrix.copy(alignment ? alignmentMatrix(alignment) : new THREE.Matrix4());
    this.mesh.matrixWorldNeedsUpdate = true;
  }

  /** Hide splats outside the room box plus a margin: outdoor views through windows, stray floaters. */
  setCrop(dims: Dims | null): void {
    if (this.crop) {
      this.group.remove(this.crop);
      this.crop = null;
    }
    if (!dims) return;
    // Multiply opacity by 0 everywhere *outside* the box (invert); Spark's box SDF takes its scale as half-extents.
    const box = new SplatEditSdf({ type: SplatEditSdfType.BOX, opacity: 0 });
    box.position.set(dims.length / 2, dims.height / 2, dims.width / 2);
    box.scale.set(dims.length / 2 + CROP_MARGIN, dims.height / 2 + CROP_MARGIN, dims.width / 2 + CROP_MARGIN);
    const edit = new SplatEdit({ rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY, invert: true, sdfs: [box] });
    edit.add(box);
    this.crop = edit;
    this.group.add(edit);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    this.removeMesh();
    this.setCrop(null);
    this.spark.dispose();
    this.group.removeFromParent();
  }

  private removeMesh(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}
```

If `SplatEdit` with `invert: true` crops the wrong side (the room vanishes and only the outside shows), move `invert: true` from the edit to the `SplatEditSdf` options instead. Read Spark's SDF evaluation in `node_modules/@sparkjsdev/spark/dist/spark.module.js` (search `SDF_TYPE_BOX` and `invert`) to decide, and record which one it is in the report.

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`.
Expected: clean. Spark isn't imported anywhere else yet, so the build doesn't include it; Task 5 adds the dynamic import.

- [ ] **Step 4: Commit**

```powershell
git add package.json package-lock.json src/lib/scene/SplatLayer.ts
git commit -m "feat: Spark splat layer with alignment, crop and raycast targets" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Load, align and keep a scan (controller + UI)

**Files:**
- Create: `src/lib/scene/ScanController.ts`
- Modify: `src/components/RoomView.tsx`

**Interfaces:**
- Consumes: `RoomScene` (Task 3), `SplatLayer` (Task 4, via dynamic import), the scanStore functions (Task 2), `startAlign`, `alignTap`, `nudgeAlignment`, `AlignError`, `Alignment`, `AlignState` (Task 1).
- Produces:
  ```ts
  type ScanStatus =
    | { kind: 'none' }
    | { kind: 'loading'; fileName: string }
    | { kind: 'ready'; fileName: string; count: number; aligned: boolean; stored: boolean; visible: boolean }
    | { kind: 'error'; message: string };
  type ScanUiStep = 'floor' | 'corners' | 'nudge' | null;
  SPLAT_WARN_COUNT = 1_500_000      // spec §8: warn above this many splats
  class ScanController {
    constructor(scene: RoomScene, report: { status(s: ScanStatus): void; step(step: ScanUiStep, taps: number, hint: string | null): void });
    restore(room: RoomState): Promise<void>;                 // from IndexedDB, at startup
    open(file: File, room: RoomState): Promise<void>;        // read, store, show
    startAlignment(): void;
    tap(point: Vec3, viewer: Vec3, room: RoomState): void;   // from RoomScene.onScanTap
    nudge(change: { yaw?: number; scale?: number; x?: number; z?: number }, room: RoomState): void;
    finish(room: RoomState): Promise<void>;                  // save alignment, crop, outline shell
    cancelAlignment(room: RoomState): void;
    setVisible(visible: boolean): void;
    setRoom(room: RoomState): void;                          // keep the crop in step with the room size
    remove(): Promise<void>;
    dispose(): void;
  }
  ```

What the controller does:
- **Opening a file:**
  - Read it with `file.arrayBuffer()`. Spark is imported dynamically on first use.
  - Show the scan in its own coordinates if unaligned, otherwise apply the alignment.
  - Store it with `saveScan`. A storage failure gives `stored: false` and a warning; the scan still shows this session.
- **Status:** warn above `SPLAT_WARN_COUNT`. Unreadable files give "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export." and the box view stays.
- **Aligning:**
  - `startAlignment` sets the scan to its own coordinates, hides the room box and items (`setShellStyle('hidden')`, `setRoomItemsVisible(false)`), frames the scan's bounds, switches the scene to `'scan'` tap mode, and points scan targets at the layer.
  - Each tap goes through `alignTap`. An `AlignError` keeps the step and reports its message as the hint.
  - On reaching `'nudge'`, the alignment is applied live: outline shell visible, room items visible, camera on Corner.
  - `finish` saves the alignment (`updateScanAlignment`), applies the crop, keeps the outline shell, and sets tap mode `'none'`.
  - `cancelAlignment` returns to the previous alignment (or none) and restores the shell style.
- **Shell style when not aligning:** `'outline'` when a scan is aligned and visible, `'tinted'` otherwise.

- [ ] **Step 1: Write the controller**

Create `src/lib/scene/ScanController.ts`:
```ts
import type { Dims, RoomState, Vec3 } from '@/lib/room/types';
import { AlignError, alignTap, nudgeAlignment, startAlign, type Alignment, type AlignState } from './alignment';
import type { RoomScene } from './RoomScene';
import { deleteScan, loadScan, saveScan, updateScanAlignment } from './scanStore';
import type { SplatLayer } from './SplatLayer';

export type ScanStatus =
  | { kind: 'none' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'ready'; fileName: string; count: number; aligned: boolean; stored: boolean; visible: boolean }
  | { kind: 'error'; message: string };
export type ScanUiStep = 'floor' | 'corners' | 'nudge' | null;
type Report = { status(s: ScanStatus): void; step(step: ScanUiStep, taps: number, hint: string | null): void };

/** Spec §8: scans above this many splats get a "may be slow on your phone" warning. */
export const SPLAT_WARN_COUNT = 1_500_000;

const UNREADABLE = "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export.";
const centre = (dims: Dims): Vec3 => ({ x: dims.length / 2, y: 0, z: dims.width / 2 });

/** Loads, aligns and keeps the room scan. Browser only; Spark is loaded the first time a scan is opened. */
export class ScanController {
  private layer: SplatLayer | null = null;
  private alignment: Alignment | null = null;
  private align: AlignState | null = null;
  private status: ScanStatus = { kind: 'none' };
  private bounds: { min: Vec3; max: Vec3 } | null = null;
  private disposed = false;

  constructor(
    private readonly scene: RoomScene,
    private readonly report: Report,
  ) {}

  async restore(room: RoomState): Promise<void> {
    try {
      const stored = await loadScan();
      if (stored && !this.disposed) await this.show(stored.bytes, stored.fileName, stored.alignment, true, room);
    } catch {
      // nothing usable stored: start without a scan
    }
  }

  async open(file: File, room: RoomState): Promise<void> {
    this.setStatus({ kind: 'loading', fileName: file.name });
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
    } catch {
      this.setStatus({ kind: 'error', message: UNREADABLE });
      return;
    }
    if (!(await this.show(bytes, file.name, null, false, room))) return;
    let stored = true;
    try {
      await saveScan({ fileName: file.name, bytes, alignment: null, savedAt: Date.now() });
    } catch {
      stored = false; // e.g. storage full: keep it for this session only
    }
    if (this.status.kind === 'ready') this.setStatus({ ...this.status, stored });
  }

  startAlignment(): void {
    if (!this.layer || !this.bounds) return;
    this.align = startAlign();
    this.layer.setAlignment(null);
    this.layer.setCrop(null);
    this.layer.setVisible(true);
    this.scene.setShellStyle('hidden');
    this.scene.setRoomItemsVisible(false);
    this.scene.setScanTargets(this.layer.targets);
    this.scene.setTapMode('scan');
    this.scene.frameBox(this.bounds.min, this.bounds.max);
    this.reportStep(null);
  }

  tap(point: Vec3, viewer: Vec3, room: RoomState): void {
    if (!this.align || this.align.step === 'nudge') return;
    try {
      this.align = alignTap(this.align, point, viewer, room.dims);
    } catch (error) {
      if (error instanceof AlignError) return this.reportStep(error.message);
      throw error;
    }
    if (this.align.step === 'nudge') this.enterNudge(room);
    this.reportStep(null);
  }

  nudge(change: { yaw?: number; scale?: number; x?: number; z?: number }, room: RoomState): void {
    if (this.align?.step !== 'nudge') return;
    this.align = { step: 'nudge', alignment: nudgeAlignment(this.align.alignment, change, centre(room.dims)) };
    this.layer?.setAlignment(this.align.alignment);
  }

  async finish(room: RoomState): Promise<void> {
    if (this.align?.step !== 'nudge') return;
    this.alignment = this.align.alignment;
    this.align = null;
    this.endAlignment(room);
    try {
      await updateScanAlignment(this.alignment);
    } catch {
      // the alignment still applies for this session
    }
    if (this.status.kind === 'ready') this.setStatus({ ...this.status, aligned: true });
  }

  cancelAlignment(room: RoomState): void {
    if (!this.align) return;
    this.align = null;
    this.endAlignment(room);
  }

  setVisible(visible: boolean): void {
    if (!this.layer || this.status.kind !== 'ready') return;
    this.layer.setVisible(visible);
    this.setStatus({ ...this.status, visible });
    this.applyShell();
  }

  setRoom(room: RoomState): void {
    if (this.layer && this.alignment && !this.align) this.layer.setCrop(room.dims);
  }

  async remove(): Promise<void> {
    this.align = null;
    this.alignment = null;
    this.bounds = null;
    this.disposeLayer();
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.setStatus({ kind: 'none' });
    this.applyShell();
    this.reportStep(null);
    try {
      await deleteScan();
    } catch {
      // already gone
    }
  }

  dispose(): void {
    this.disposed = true;
    this.disposeLayer();
  }

  /** Show bytes as the scan; false (with an error status) if Spark can't read them. */
  private async show(bytes: ArrayBuffer, fileName: string, alignment: Alignment | null, stored: boolean, room: RoomState): Promise<boolean> {
    this.setStatus({ kind: 'loading', fileName });
    try {
      if (!this.layer) {
        const { SplatLayer } = await import('./SplatLayer');
        if (this.disposed) return false;
        this.layer = new SplatLayer(this.scene.renderer);
        this.scene.addLayer(this.layer.group);
      }
      const { count, min, max } = await this.layer.load(bytes, fileName);
      if (this.disposed) return false;
      this.bounds = { min, max };
      this.alignment = alignment;
      this.layer.setAlignment(alignment);
      this.layer.setCrop(alignment ? room.dims : null);
      this.layer.setVisible(true);
      this.setStatus({ kind: 'ready', fileName, count, aligned: alignment !== null, stored, visible: true });
      this.applyShell();
      return true;
    } catch {
      this.disposeLayer();
      this.setStatus({ kind: 'error', message: UNREADABLE });
      this.applyShell();
      return false;
    }
  }

  private enterNudge(room: RoomState): void {
    if (this.align?.step !== 'nudge') return;
    this.layer?.setAlignment(this.align.alignment);
    this.scene.setShellStyle('outline');
    this.scene.setRoomItemsVisible(true);
    this.scene.setTapMode('none');
    this.scene.setCameraPreset(room, 'corner');
  }

  private endAlignment(room: RoomState): void {
    this.layer?.setAlignment(this.alignment);
    this.layer?.setCrop(this.alignment ? room.dims : null);
    this.scene.setTapMode('none');
    this.scene.setRoomItemsVisible(true);
    this.applyShell();
    this.reportStep(null);
  }

  private applyShell(): void {
    const showingAligned = this.status.kind === 'ready' && this.status.visible && this.alignment !== null;
    this.scene.setShellStyle(showingAligned ? 'outline' : 'tinted');
  }

  private reportStep(hint: string | null): void {
    const a = this.align;
    if (!a) return this.report.step(null, 0, hint);
    const taps = a.step === 'floor' ? a.floor.length : a.step === 'corners' ? a.corners.length : 0;
    this.report.step(a.step, taps, hint);
  }

  private setStatus(status: ScanStatus): void {
    this.status = status;
    this.report.status(status);
  }

  private disposeLayer(): void {
    if (!this.layer) return;
    this.scene.removeLayer(this.layer.group);
    this.layer.dispose();
    this.layer = null;
  }

}
```

- [ ] **Step 2: Wire it into the view**

In `src/components/RoomView.tsx`:
1. **State:**
   - `const [scanStatus, setScanStatus] = useState<ScanStatus>({ kind: 'none' });`
   - `const [alignStep, setAlignStep] = useState<{ step: ScanUiStep; taps: number; hint: string | null }>({ step: null, taps: 0, hint: null });`
   - `const scanRef = useRef<ScanController | null>(null);`
2. **Create and restore:** in Effect 1, right after the scene is created:
   ```ts
   const scans = new ScanController(scene, {
     status: setScanStatus,
     step: (step, taps, hint) => setAlignStep({ step, taps, hint }),
   });
   scanRef.current = scans;
   void scans.restore(useRoomStore.getState().room);
   ```
   Route `onScanTap` in the scene callbacks to `(point, viewer) => scanRef.current?.tap(point, viewer, useRoomStore.getState().room)`. In the cleanup, call `scans.dispose(); scanRef.current = null;` before `scene.dispose()`.
3. **Keep the crop in step:** add an effect `useEffect(() => { scanRef.current?.setRoom(room); }, [room, webgl]);`.
4. **Tap mode:** keep `setTapMode(placing ? 'panel' : 'none')`, but skip it while `alignStep.step` is `'floor'` or `'corners'`, because the controller owns the tap mode then. Use the effect `useEffect(() => { if (alignStep.step === 'floor' || alignStep.step === 'corners') return; sceneRef.current?.setTapMode(placing ? 'panel' : 'none'); }, [placing, alignStep.step, webgl]);`. Disable "Place panel" while aligning.
5. **Toolbar, new row "Room scan":**
   - **Load button:** a file input (`accept=".ply,.spz,.splat,.ksplat"`), labelled "Load scan" or "Replace scan". `onChange` calls `scanRef.current?.open(file, room)` and resets `e.target.value = ''`.
   - **When `scanStatus.kind === 'ready'` and not aligning:**
     - "Align scan" (`startAlignment()`);
     - "Hide scan" / "Show scan" (`setVisible(!visible)`), with `aria-pressed={!visible}` and a constant label "Hide scan";
     - "Remove scan" (`remove()`).
   - **Status line (`role="status"`, always rendered):**
     - loading: "Loading {fileName}…";
     - ready: "{fileName}: {count.toLocaleString()} splats", plus " · not aligned yet" when unaligned, plus " · only kept until you leave this page" when `!stored`;
     - error: the message.
   - **Large scans:** when `count > SPLAT_WARN_COUNT`, add the warning "This scan has {n} million splats and may be slow on your phone.", with n to one decimal. Import `SPLAT_WARN_COUNT` from `@/lib/scene/ScanController`, never from `SplatLayer`; importing that would pull Spark into the room page's bundle.
6. **Alignment banner:** when `alignStep.step` isn't null, an overlay at the top of the canvas (`pointer-events-none` text):
   - floor: "Step 1 of 3: tap 3 spots on the floor ({taps}/3)";
   - corners: "Step 2 of 3: tap the front-right floor corner, then the back-right one ({taps}/2). They're the two ends of the right wall as you face the front wall.";
   - nudge: "Step 3 of 3: line the box up with your room".
   - Show `hint` below it in amber when present.
7. **Nudge controls:** when the step is `'nudge'`, a control row below the canvas:
   - "Turn −5°", "Turn −1°", "Turn +1°", "Turn +5°" (yaw ±π/36, ±π/180);
   - "Smaller", "Bigger" (scale 0.99, 1.01);
   - "← Front", "Back →" (x ∓0.05);
   - "Right", "Left" (z −0.05, +0.05);
   - "Done" (`finish(room)`) and "Cancel".

   During floor and corner steps, show only "Cancel" (`cancelAlignment(room)`).

- [ ] **Step 3: Check, build and commit**

Run: `npx tsc --noEmit`, `npm run lint` (no react-hooks findings), `npm test` and `npm run build`. Confirm with a search of `out/_next/static/chunks` that Spark ends up in a separate chunk from the room page's main chunk: the dynamic import works. Serve `out/` and confirm `/room` returns 200, then stop the server.
```powershell
git add src/lib/scene/ScanController.ts src/components/RoomView.tsx
git commit -m "feat: load, align and keep a room scan in the 3D view" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

The controller then walks through it in Chrome with a sample `.spz`:
- load;
- splat count shown;
- align: floor taps, corner taps, nudge, Done;
- reload, and the scan and alignment come back;
- Hide and Show;
- Remove;
- a non-splat file gives the error and the box view;
- the crop hides outside splats;
- no console errors.
