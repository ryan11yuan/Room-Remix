# Room Remix: Plan 4b, Walk Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Walk** button in the 3D view puts the camera over the listener's shoulder. A tap on the floor (or WASD / the arrow keys) walks the listener there at walking pace, round the speaker, never through it. The sound rays follow live, and the song re-renders from the new spot when they stop. It works in the box view and over an aligned room scan.

**Architecture:**
- **Walk maths (`walk.ts`):** pure functions with no three.js and no DOM, tested in Node. They pick where a tap sends the listener, step the listener along each frame (including round the speaker's keep-out ring), turn held keys into a direction, and place and pull in the camera.
- **Scene (`RoomScene`):** gains `setWalking(on)`. In walk mode, each frame:
  - steps the listener and reports each step through the existing `onDrag({ kind: 'listener' }, …)` callback;
  - moves the OrbitControls centre along with the head;
  - draws from a camera pulled inside the room.
  - A tap with tap mode `'none'` walks to where it meets the floor.
- **View (`RoomView`):** owns the on/off state. Camera buttons and **Align scan** turn walk mode off first.
- **Audio:** nothing new. Each step changes the room in the store, so rays recompute at once, and the existing 150 ms simulation debounce re-renders the IR once the walk stops.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, three.js 0.186, zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-room-remix-design.md`: §8 "Walk mode" and §12 "walk". Builds on Plan 4's `RoomScene` at `0381635`. See `docs/superpowers/plans/2026-10-05-room-remix-plan-4-followups.md`, "For Plan 4b".

**Already checked:** before this plan was written, its code was applied to a scratch copy of `0381635`. There it passed type-check, lint and all 340 tests, and built. It was then tried in Chrome: entering walk mode, tap to walk, WASD, a key typed into a field, arrow keys not scrolling, and a camera button ending walk mode, with no console errors. Not tried yet: touch and pinch on a phone, a loaded scan, audio. Those are in Task 2's browser check.

**Decided here (where the spec left room, or this plan differs):**
- **Tap rule:** a walk tap uses the scene's existing tap rule: the pointer moves ≤ 6 px, for any duration. This replaces the spec's "< 8 px in < 300 ms", so every tap in the view behaves the same.
- **No `onListenerMove` callback:** each step goes through the existing `onDrag({ kind: 'listener' }, point)`. `RoomView` already applies that with `applyDrag`, which keeps the height and the yaw.
- **The spec's `followCamera` is split in two:**
  - `walkView(room)` gives the first view.
  - `pullInside` keeps the drawn camera inside the room every frame.
  - OrbitControls already turns and zooms around the orbit centre, so angle, pitch and distance aren't separate inputs.
- **Look point:** the camera orbits and looks at a point 0.3 m over the head (`walkLook`). The view is level, so the head sits low in the picture with the speaker visible beyond it. Looking at the head itself hid the speaker behind it; this was seen in the browser.
- **Wanted vs drawn camera:**
  - OrbitControls keeps the unpulled "wanted" position, and only the drawn camera is pulled inside. Walking away from a wall lets the camera swing back out to the chosen distance.
  - The drawn camera stays put between frames, so taps aim from what is on screen.
- **The listener can't be dragged in walk mode.** The camera follows the head, so a drag would chase itself; tap the floor instead. The speaker and the rug drag as before, and walking pauses during a drag.
- **Going round the speaker:**
  - The listener walks round a keep-out ring, the shorter way that no wall blocks. The ring is 0.51 m in 3D, a centimetre over the 0.5 m rule, so float error can't break it.
  - If both ways are blocked, the listener stops beside the speaker. This happens when the speaker sits mid-width at head height in a room narrower than about 1.6 m.
- **Keys aim one step ahead.** Walking into a wall at an angle slides along it only as fast as the keys point along it.
- **Leaving walk mode:** **Stop walking** leaves the camera where it is. A camera button goes to its preset.

## Global Constraints

- Static export only. **No user data leaves the device.**
- Coordinate frame: metres. The origin is at the front-right floor corner; x runs along the length (toward the back), z along the width (toward the left), y up. three.js uses the same axes. A listener yaw θ faces `(cos θ, 0, sin θ)`.
- Imports:
  - `src/lib/acoustics/**` and `src/lib/room/**` don't import three.js or Spark and don't touch the DOM.
  - `src/lib/scene/walk.ts` doesn't either, so it is tested in Node.
  - three.js stays in `src/lib/scene/**` and `src/components/**`.
  - Spark is imported only by `src/lib/scene/SplatLayer.ts`. Lint enforces this; never value-import `SplatLayer`.
- Walk numbers (spec §8):
  - walking pace 1.4 m/s; frame time capped at 0.1 s;
  - camera 1 m behind and 0.3 m above the head; zoom 0.6–3 m;
  - camera drawn at least 0.1 m inside every wall, the floor and the ceiling;
  - on every frame, the listener stays ≥ 0.3 m from every wall and ≥ 0.5 m from the speaker.
- Walking is off while the scan alignment takes floor or corner taps (tap mode `'scan'`) and while room items are hidden.
- Shell is Windows PowerShell. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, passed as a second `-m`.

## Review Focus

1. **Walking past the speaker:** the speaker is dead ahead, or next to a wall, or in a room too narrow to pass it. The listener walks round on the open side and keeps 0.5 m on every frame. When the way is blocked it stops beside the speaker, and it never dithers back and forth. Tests: Task 1 (the `walkStep` cases and the 400-room sweep).
2. **The camera:** against walls, in corners, in a 1.5 × 1.5 × 2 m room, and zoomed out to 3 m. It is always drawn ≥ 0.1 m inside, so the back of a scan never shows, and walking away from a wall lets it swing back out. Tests: Task 1 (`pullInside`, `walkView`); Task 2 browser check.
3. **Dragging while walking:** the listener can't be grabbed, and dragging the speaker or the rug pauses walking. Dragging the speaker onto the walker shows the usual validation message, and the next step walks clear. Tests: Task 1 ("first steps out of the way…"); Task 2 browser check.
4. **Keys:**
   - W/A/S/D or arrows typed into a size field don't walk;
   - arrows don't scroll the page while walking;
   - a key held during Alt-Tab doesn't keep walking.

   Task 2 browser check.
5. **Leaving mid-walk:** a camera button or **Align scan** stops walking at once, and the camera doesn't snap back to the head. A room-size edit while walking doesn't yank the camera to a preset. Task 2 browser check.

---

## File Structure

```
src/lib/scene/
  walk.ts          NEW  walkTarget, walkStep, advanceWalk, keyDirection, pullInside, walkLook, walkView; walk constants
  walk.test.ts     NEW
  RoomScene.ts     MOD  setWalking; per-frame walk step and follow camera; tap to walk; walk keys; listener not grabbable while walking
src/components/
  RoomView.tsx     MOD  Walk button; camera buttons and Align scan leave walk mode first; walk help text
```

---

### Task 1: Walk maths

**Files:**
- Create: `src/lib/scene/walk.ts`, `src/lib/scene/walk.test.ts`

**Interfaces:**
- Consumes:
  - `listenerYaw(listener, speaker)` from `@/lib/acoustics/binaural`;
  - `LIMITS` from `@/lib/room/constants`;
  - `clampPosition(dims, p)` from `@/lib/room/placement`;
  - `Dims`, `RoomState`, `Vec3` from `@/lib/room/types`.
- Produces:
  ```ts
  type FloorPoint = { x: number; z: number };
  WALK_SPEED = 1.4; MAX_DT = 0.1; CAMERA_BACK = 1; CAMERA_UP = 0.3; CAMERA_MARGIN = 0.1;
  WALK_ZOOM = { min: 0.6, max: 3 };
  WALK_KEYS: ReadonlySet<string>          // KeyboardEvent.code values: KeyW/A/S/D and the four arrows
  walkTarget(room, point: FloorPoint): FloorPoint | null
  walkStep(room, goal: FloorPoint, dt: number): FloorPoint & { done: boolean }
  advanceWalk(room, goal: FloorPoint | null, direction: FloorPoint | null, dt: number): { to: FloorPoint | null; goal: FloorPoint | null }
  keyDirection(keys: ReadonlySet<string>, forward: FloorPoint): FloorPoint | null
  pullInside(dims: Dims, head: Vec3, camera: Vec3): Vec3
  walkLook(head: Vec3): Vec3
  walkView(room): { position: Vec3; target: Vec3 }
  ```

How it works:
- **Keep-out ring:** the listener's head must stay 0.51 m from the speaker in 3D. At the listener's height that is a circle on the floor of radius `√(0.51² − Δy²)`, or no circle at all when the heights differ by 0.51 m or more.
- **`walkTarget`:** clamps a tapped point inside the walls. If it lands in the ring, it is pushed straight out to the ring. If that spot is inside a wall, the nearest free ring point is used, checking every 5°.
- **`walkStep`:**
  - Walk straight while the next step stays clear of the ring.
  - When the speaker is in the way, walk up to the ring, then round it.
  - Choose the shorter way round that no wall cuts. Each way is checked every 0.02 rad up to where the goal comes into sight.
  - If both ways are cut, stop (`done`).
  - A listener who starts somewhere not allowed (the room shrank, or the speaker was dragged close) first moves to the nearest free spot.
- **`advanceWalk`:** one frame of walking. Held keys win over a tapped goal and cancel it. Keys aim one step ahead.
- **Camera:**
  - `walkView` puts the camera 1 m behind (opposite the facing) and 0.3 m above the head, looking level at `walkLook(head)`.
  - `pullInside` moves a camera toward the head until it is 0.1 m inside the room.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scene/walk.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom, validateRoom } from '@/lib/room/roomState';
import type { Dims, RoomState, Vec3 } from '@/lib/room/types';
import {
  advanceWalk,
  CAMERA_BACK,
  CAMERA_MARGIN,
  CAMERA_UP,
  keyDirection,
  MAX_DT,
  pullInside,
  walkStep,
  walkTarget,
  walkView,
  WALK_SPEED,
  type FloorPoint,
} from './walk';

const FRAME = 1 / 60;

/** The default room with the speaker and listener moved (both at 1.1 m unless given). */
function roomWith(speaker: Vec3, listener: Vec3, dims?: Dims): RoomState {
  const room = defaultRoom();
  return { ...room, dims: dims ?? room.dims, speaker, listener: { ...listener, yaw: 'faceSpeaker' } };
}

const moveListener = (room: RoomState, p: FloorPoint): RoomState => ({ ...room, listener: { ...room.listener, x: p.x, z: p.z } });
const distance3d = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** Walk frame by frame until done; every frame's room must be valid. Returns the final room and the number of frames. */
function walkAll(start: RoomState, goal: FloorPoint, maxFrames = 2000): { room: RoomState; frames: number } {
  let room = start;
  for (let frame = 1; frame <= maxFrames; frame++) {
    const step = walkStep(room, goal, FRAME);
    expect(Math.hypot(step.x - room.listener.x, step.z - room.listener.z)).toBeLessThanOrEqual(WALK_SPEED * FRAME + 1e-9);
    room = moveListener(room, step);
    expect(validateRoom(room)).toEqual([]);
    if (step.done) return { room, frames: frame };
  }
  throw new Error(`still walking after ${maxFrames} frames`);
}

describe('walkTarget', () => {
  const room = defaultRoom(); // speaker (0.6, 1.0, 1.4), listener at 1.1 m

  it('keeps a free spot as it is', () => {
    expect(walkTarget(room, { x: 2, z: 2 })).toEqual({ x: 2, z: 2 });
  });

  it('brings a spot beyond a wall back inside the wall clearance', () => {
    expect(walkTarget(room, { x: -1, z: 10 })).toEqual({ x: 0.3, z: 3.2 });
  });

  it('moves a spot next to the speaker straight out to 0.5 m from it', () => {
    const target = walkTarget(room, { x: 0.8, z: 1.4 })!;
    expect(target.z).toBeCloseTo(1.4, 9);
    expect(target.x).toBeGreaterThan(0.8);
    expect(distance3d({ x: target.x, y: 1.1, z: target.z }, room.speaker)).toBeGreaterThanOrEqual(0.5);
    expect(validateRoom(moveListener(room, target))).toEqual([]);
  });

  it('finds a free spot for a tap on the speaker itself', () => {
    const target = walkTarget(room, { x: 0.6, z: 1.4 })!;
    expect(validateRoom(moveListener(room, target))).toEqual([]);
  });

  it('finds the nearest free spot when straight out from the speaker is inside the wall', () => {
    const nearWall = roomWith({ x: 0.4, y: 1.1, z: 1.4 }, { x: 3, y: 1.1, z: 1.9 });
    const target = walkTarget(nearWall, { x: 0.31, z: 1.4 })!; // between the speaker and the wall at x = 0
    expect(validateRoom(moveListener(nearWall, target))).toEqual([]);
    expect(Math.hypot(target.x - 0.31, target.z - 1.4)).toBeLessThan(0.6);
  });
});

describe('walkStep', () => {
  const room = defaultRoom();

  it('walks toward the goal at walking pace', () => {
    const step = walkStep(room, { x: 3, z: 3 }, 0.1);
    expect(step.x).toBeCloseTo(3, 9);
    expect(step.z).toBeCloseTo(1.9 + WALK_SPEED * 0.1, 9);
    expect(step.done).toBe(false);
  });

  it('caps a long frame, so a tab coming back into view does not teleport the listener', () => {
    const step = walkStep(room, { x: 3, z: 3.2 }, 5);
    expect(Math.hypot(step.x - 3, step.z - 1.9)).toBeCloseTo(WALK_SPEED * MAX_DT, 9);
  });

  it('stands still for a zero-length frame', () => {
    expect(walkStep(room, { x: 3, z: 3 }, 0)).toEqual({ x: 3, z: 1.9, done: false });
  });

  it('arrives exactly on the goal', () => {
    expect(walkStep(room, { x: 3.05, z: 1.95 }, 0.1)).toEqual({ x: 3.05, z: 1.95, done: true });
  });

  it('walks round a speaker that is dead ahead, keeping 0.5 m on every frame, and still arrives', () => {
    const start = roomWith({ x: 2, y: 1.1, z: 1.75 }, { x: 1, y: 1.1, z: 1.75 });
    const { room: end, frames } = walkAll(start, { x: 3, z: 1.75 });
    expect(end.listener).toMatchObject({ x: 3, z: 1.75 });
    expect(frames).toBeLessThan(200); // about 2.6 m of walking, not an endless dither
  });

  it('goes round the open side when the speaker is close to a wall', () => {
    // Between the speaker and the wall at z = 0 there is 0.2 m of floor: too little to pass.
    const start = roomWith({ x: 2, y: 1.1, z: 0.5 }, { x: 1, y: 1.1, z: 0.5 });
    const { room: end } = walkAll(start, { x: 3, z: 0.5 });
    expect(end.listener).toMatchObject({ x: 3, z: 0.5 });
  });

  it('stops beside the speaker when it blocks a narrow room, without dithering', () => {
    const narrow = { length: 4, width: 1.5, height: 2.6 };
    const start = roomWith({ x: 2, y: 1.1, z: 0.75 }, { x: 1, y: 1.1, z: 0.75 }, narrow);
    const { room: end, frames } = walkAll(start, { x: 3, z: 0.75 });
    expect(end.listener.x).toBeLessThan(2); // still on the near side
    expect(frames).toBeLessThan(200);
  });

  it('lets the listener walk under or over a speaker at a different height', () => {
    const start = roomWith({ x: 2, y: 0.4, z: 1.75 }, { x: 1, y: 1.6, z: 1.75 }); // 1.2 m apart in height
    const { room: end } = walkAll(start, { x: 3, z: 1.75 });
    expect(end.listener).toMatchObject({ x: 3, z: 1.75 });
  });

  it('keeps every room valid and always finishes, over many random rooms, speakers and taps', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const between = (lo: number, hi: number) => lo + (hi - lo) * random();
    for (let trial = 0; trial < 400; trial++) {
      const dims = { length: between(1.5, 8), width: between(1.5, 8), height: between(2, 4) };
      const spot = (y: number) => ({ x: between(0.3, dims.length - 0.3), y, z: between(0.3, dims.width - 0.3) });
      const start = roomWith(spot([0.4, 1.0, 1.2][trial % 3]), spot(trial % 2 ? 1.1 : 1.6), dims);
      if (validateRoom(start).length > 0) continue; // the random listener landed next to the speaker
      const goal = walkTarget(start, { x: between(-1, dims.length + 1), z: between(-1, dims.width + 1) });
      expect(goal).not.toBeNull();
      walkAll(start, goal!, 1000); // asserts every frame
    }
  });

  it('first steps out of the way when it starts too close to the speaker', () => {
    const start = roomWith({ x: 2, y: 1.1, z: 1.75 }, { x: 2.2, y: 1.1, z: 1.75 });
    expect(validateRoom(start)).not.toEqual([]);
    const step = walkStep(start, { x: 3.5, z: 1.75 }, FRAME);
    expect(validateRoom(moveListener(start, step))).toEqual([]);
  });
});

describe('keyDirection', () => {
  it('walks W / up toward where the camera looks', () => {
    expect(keyDirection(new Set(['KeyW']), { x: 0, z: -2 })).toEqual({ x: 0, z: -1 });
    expect(keyDirection(new Set(['ArrowUp']), { x: 0, z: -2 })).toEqual({ x: 0, z: -1 });
  });

  it('walks S / down back toward the camera', () => {
    expect(keyDirection(new Set(['KeyS']), { x: 1, z: 0 })).toEqual({ x: -1, z: 0 });
  });

  it("walks D / right to the camera's right and A / left to its left", () => {
    // A camera looking along −z has +x on its right (three.js's default view).
    const right = keyDirection(new Set(['KeyD']), { x: 0, z: -1 })!;
    expect(right.x).toBeCloseTo(1, 12);
    expect(right.z).toBeCloseTo(0, 12);
    const left = keyDirection(new Set(['ArrowLeft']), { x: 1, z: 0 })!;
    expect(left.x).toBeCloseTo(0, 12);
    expect(left.z).toBeCloseTo(-1, 12);
  });

  it('walks diagonally at the same speed for two keys', () => {
    const d = keyDirection(new Set(['KeyW', 'KeyD']), { x: 0, z: -1 })!;
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1, 12);
    expect(d.x).toBeGreaterThan(0);
    expect(d.z).toBeLessThan(0);
  });

  it('stands still for opposite keys, other keys, or a camera looking straight down', () => {
    expect(keyDirection(new Set(['KeyW', 'KeyS']), { x: 0, z: -1 })).toBeNull();
    expect(keyDirection(new Set(['KeyQ', 'Space']), { x: 0, z: -1 })).toBeNull();
    expect(keyDirection(new Set(['KeyW']), { x: 0, z: 0 })).toBeNull();
  });
});

describe('advanceWalk', () => {
  const room = defaultRoom(); // listener (3, 1.1, 1.9)

  it('steps toward a tapped goal and keeps it until arrival', () => {
    const goal = { x: 3, z: 3 };
    const result = advanceWalk(room, goal, null, 0.1);
    expect(result.to?.z).toBeCloseTo(1.9 + WALK_SPEED * 0.1, 9);
    expect(result.goal).toBe(goal);
  });

  it('drops the goal on arrival', () => {
    expect(advanceWalk(room, { x: 3, z: 1.95 }, null, 0.1)).toEqual({ to: { x: 3, z: 1.95 }, goal: null });
  });

  it('lets held keys win over a tapped goal, and cancels the goal', () => {
    const result = advanceWalk(room, { x: 3, z: 3 }, { x: -1, z: 0 }, 0.1);
    expect(result.to?.x).toBeCloseTo(3 - WALK_SPEED * 0.1, 9);
    expect(result.to?.z).toBeCloseTo(1.9, 9);
    expect(result.goal).toBeNull();
  });

  it('stays put when the keys walk into a wall', () => {
    const atWall = moveListener(room, { x: 3.7, z: 1.9 }); // the wall at x = 4, less the 0.3 m clearance
    expect(advanceWalk(atWall, null, { x: 1, z: 0 }, 0.1)).toEqual({ to: null, goal: null });
  });

  it('slides along a wall only as fast as the keys point along it', () => {
    const atWall = moveListener(room, { x: 3.7, z: 1.9 });
    const result = advanceWalk(atWall, null, { x: 0.8, z: 0.6 }, 0.1); // mostly into the wall at x = 4
    expect(result.to?.x).toBe(3.7);
    expect(result.to?.z).toBeCloseTo(1.9 + 0.6 * WALK_SPEED * 0.1, 9);
  });

  it('does nothing with no goal and no keys', () => {
    expect(advanceWalk(room, null, null, 0.1)).toEqual({ to: null, goal: null });
  });
});

describe('pullInside', () => {
  const dims = { length: 4, width: 3.5, height: 2.6 };
  const expectInside = (p: Vec3, d: Dims) => {
    for (const [value, size] of [[p.x, d.length], [p.y, d.height], [p.z, d.width]]) {
      expect(value).toBeGreaterThanOrEqual(CAMERA_MARGIN - 1e-9);
      expect(value).toBeLessThanOrEqual(size - CAMERA_MARGIN + 1e-9);
    }
  };

  it('leaves a camera that is already inside alone', () => {
    expect(pullInside(dims, { x: 2, y: 1.1, z: 2 }, { x: 3, y: 1.4, z: 2 })).toEqual({ x: 3, y: 1.4, z: 2 });
  });

  it('pulls a camera behind a wall in along the line to the head', () => {
    const p = pullInside(dims, { x: 0.5, y: 1.1, z: 1.75 }, { x: -0.5, y: 1.4, z: 1.75 });
    expect(p.x).toBeCloseTo(0.1, 9);
    expect(p.y).toBeCloseTo(1.1 + 0.3 * 0.4, 9);
    expect(p.z).toBeCloseTo(1.75, 9);
  });

  it('keeps the camera inside a corner and under a low ceiling', () => {
    const low = { length: 1.5, width: 1.5, height: 2 };
    const p = pullInside(low, { x: 0.3, y: 1.6, z: 0.3 }, { x: -0.7, y: 2.5, z: -0.7 });
    expectInside(p, low);
  });
});

describe('walkView', () => {
  it("starts behind the listener's head, away from the speaker and a little above it, looking level over the head", () => {
    const room = defaultRoom();
    const { position, target } = walkView(room);
    expect(target.x).toBe(3);
    expect(target.y).toBeCloseTo(1.1 + CAMERA_UP, 12);
    expect(target.z).toBe(1.9);
    expect(position.y).toBeGreaterThan(room.listener.y);
    const toSpeaker = (p: Vec3) => Math.hypot(p.x - room.speaker.x, p.z - room.speaker.z);
    expect(toSpeaker(position)).toBeGreaterThan(toSpeaker(target));
    expect(Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z)).toBeGreaterThan(0.5);
  });

  it('starts a full CAMERA_BACK behind when the room leaves space', () => {
    const room = roomWith({ x: 0.6, y: 1.0, z: 1.75 }, { x: 2, y: 1.1, z: 1.75 }); // facing the front wall, 2 m of room behind
    const { position } = walkView(room);
    expect(position.x).toBeCloseTo(2 + CAMERA_BACK, 9);
    expect(position.y).toBeCloseTo(1.1 + CAMERA_UP, 9);
    expect(position.z).toBeCloseTo(1.75, 9);
  });

  it('stays inside the smallest room, at the walls and the ceiling', () => {
    const small = { length: 1.5, width: 1.5, height: 2 };
    const room = roomWith({ x: 1.2, y: 1.0, z: 1.2 }, { x: 0.3, y: 1.6, z: 0.3 }, small);
    const { position } = walkView(room);
    for (const [value, size] of [[position.x, small.length], [position.y, small.height], [position.z, small.width]]) {
      expect(value).toBeGreaterThanOrEqual(CAMERA_MARGIN - 1e-9);
      expect(value).toBeLessThanOrEqual(size - CAMERA_MARGIN + 1e-9);
    }
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/scene/walk.test.ts`
Expected: FAIL. Vitest can't resolve `./walk`.

- [ ] **Step 3: Implement**

Create `src/lib/scene/walk.ts`:
```ts
import { listenerYaw } from '@/lib/acoustics/binaural';
import { LIMITS } from '@/lib/room/constants';
import { clampPosition } from '@/lib/room/placement';
import type { Dims, RoomState, Vec3 } from '@/lib/room/types';

/** A spot on the floor plan. The listener's height stays whatever it is. */
export type FloorPoint = { x: number; z: number };

export const WALK_SPEED = 1.4; // m/s, a normal walking pace
export const MAX_DT = 0.1; // s: a long frame (or a tab coming back into view) mustn't teleport the listener
export const CAMERA_BACK = 1; // m behind the head
export const CAMERA_UP = 0.3; // m above it
export const CAMERA_MARGIN = 0.1; // the camera stays this far inside the room, so it never shows the back of a scan
export const WALK_ZOOM = { min: 0.6, max: 3 } as const; // how close and far the camera can orbit the head

const KEEP_OUT = LIMITS.minSeparation + 0.01; // a centimetre more than the rule, so float noise can't break it
const ON_RING = 1e-9; // a point computed onto the keep-out ring may land a hair inside it
const RING_SAMPLES = 72; // every 5°
const ARC_CHECK = 0.02; // rad (1 cm of ring): how finely a way round the speaker is checked for walls
const TAU = 2 * Math.PI;

/** Held keys (KeyboardEvent.code) and the way each one walks: forward/back along the camera's view, or sideways. */
const KEY_AXES = new Map<string, { forward: number; right: number }>([
  ['KeyW', { forward: 1, right: 0 }],
  ['ArrowUp', { forward: 1, right: 0 }],
  ['KeyS', { forward: -1, right: 0 }],
  ['ArrowDown', { forward: -1, right: 0 }],
  ['KeyD', { forward: 0, right: 1 }],
  ['ArrowRight', { forward: 0, right: 1 }],
  ['KeyA', { forward: 0, right: -1 }],
  ['ArrowLeft', { forward: 0, right: -1 }],
]);
export const WALK_KEYS: ReadonlySet<string> = new Set(KEY_AXES.keys());

/** How far, across the floor, the listener's head must stay from the speaker so the two are at least 0.5 m apart in 3D. */
function keepOutRadius(room: RoomState): number {
  const dy = room.listener.y - room.speaker.y;
  return Math.sqrt(Math.max(0, KEEP_OUT * KEEP_OUT - dy * dy));
}

/** The point moved inside the walls (the listener's wall clearance). */
function inWalls(room: RoomState, p: FloorPoint): FloorPoint {
  const c = clampPosition(room.dims, { x: p.x, y: room.listener.y, z: p.z });
  return { x: c.x, z: c.z };
}

/** Whether the listener may stand here: inside the walls and outside the speaker's keep-out ring. */
function allowed(room: RoomState, p: FloorPoint, radius: number): boolean {
  const w = inWalls(room, p);
  return w.x === p.x && w.z === p.z && Math.hypot(p.x - room.speaker.x, p.z - room.speaker.z) >= radius - ON_RING;
}

/** The unit floor vector from the speaker toward `p` (+x if `p` is right above or below the speaker). */
function awayFromSpeaker(room: RoomState, p: FloorPoint): FloorPoint {
  const dx = p.x - room.speaker.x;
  const dz = p.z - room.speaker.z;
  const d = Math.hypot(dx, dz);
  return d > 0 ? { x: dx / d, z: dz / d } : { x: 1, z: 0 };
}

/** The point on the keep-out ring in the direction of `p` from the speaker. */
function ringPoint(room: RoomState, p: FloorPoint, radius: number): FloorPoint {
  const n = awayFromSpeaker(room, p);
  return { x: room.speaker.x + n.x * radius, z: room.speaker.z + n.z * radius };
}

/** The point on the keep-out ring at `angle` round the speaker (0 is +x, π/2 is +z). */
function onRing(room: RoomState, angle: number, radius: number): FloorPoint {
  return { x: room.speaker.x + Math.cos(angle) * radius, z: room.speaker.z + Math.sin(angle) * radius };
}

/** Where a tap on the floor sends the listener: inside the walls and clear of the speaker. Null when nowhere near it is free. */
export function walkTarget(room: RoomState, point: FloorPoint): FloorPoint | null {
  const radius = keepOutRadius(room);
  const p = inWalls(room, point);
  if (allowed(room, p, radius)) return p;
  // Too close to the speaker: straight out onto the keep-out ring, or else the nearest free spot on it.
  const pushed = inWalls(room, ringPoint(room, p, radius));
  if (allowed(room, pushed, radius)) return pushed;
  let best: FloorPoint | null = null;
  let bestDistance = Infinity;
  for (let i = 0; i < RING_SAMPLES; i++) {
    const angle = (TAU * i) / RING_SAMPLES;
    const q = onRing(room, angle, radius);
    const distance = Math.hypot(q.x - p.x, q.z - p.z);
    if (distance < bestDistance && allowed(room, q, radius)) {
      best = q;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * One step of a walk toward `goal`: at most WALK_SPEED × dt (dt capped at MAX_DT). The speaker is walked around, never
 * through; `done` means the listener arrived, or the speaker and the walls block the way and it stopped where it could.
 */
export function walkStep(room: RoomState, goal: FloorPoint, dt: number): FloorPoint & { done: boolean } {
  const radius = keepOutRadius(room);
  const p = { x: room.listener.x, z: room.listener.z };
  if (!allowed(room, p, radius)) {
    // Starting somewhere not allowed (the room shrank, or the speaker was dragged close): first move to the nearest free spot.
    const free = walkTarget(room, p);
    return free ? { ...free, done: false } : { ...p, done: true };
  }
  const step = WALK_SPEED * Math.min(Math.max(dt, 0), MAX_DT);
  if (step === 0) return { ...p, done: false };
  const togo = Math.hypot(goal.x - p.x, goal.z - p.z);
  if (togo <= step) return allowed(room, goal, radius) ? { ...goal, done: true } : { ...p, done: true };
  const dir = { x: (goal.x - p.x) / togo, z: (goal.z - p.z) / togo };
  const straight = { x: p.x + dir.x * step, z: p.z + dir.z * step };
  if (allowed(room, straight, radius)) return { ...straight, done: false };

  // The speaker is in the way. Off the keep-out ring: walk straight on up to it.
  const s = room.speaker;
  const m = { x: p.x - s.x, z: p.z - s.z };
  if (Math.hypot(m.x, m.z) > radius + 1e-6) {
    const along = m.x * dir.x + m.z * dir.z;
    const t = Math.max(0, -along - Math.sqrt(Math.max(0, along * along - (m.x * m.x + m.z * m.z - radius * radius))));
    return { x: p.x + dir.x * t, z: p.z + dir.z * t, done: false };
  }
  // On the ring: walk round it, the shorter way that no wall blocks, until the goal comes into sight.
  const from = Math.atan2(m.z, m.x);
  const plus = arcRound(room, from, goal, radius, 1);
  const minus = arcRound(room, from, goal, radius, -1);
  if (plus === null && minus === null) return { ...p, done: true }; // the speaker and the walls block the way: stop here
  const sign = minus === null || (plus !== null && plus <= minus) ? 1 : -1;
  const next = onRing(room, from + (sign * step) / radius, radius);
  return allowed(room, next, radius) ? { ...next, done: false } : { ...p, done: true };
}

/**
 * How far round the keep-out ring (radians), starting at angle `from` and going `sign` (+1: increasing angle), the
 * listener walks before the goal comes into sight. Null when a wall cuts across the ring on the way.
 */
function arcRound(room: RoomState, from: number, goal: FloorPoint, radius: number, sign: 1 | -1): number | null {
  const s = room.speaker;
  const toward = Math.atan2(goal.z - s.z, goal.x - s.x);
  const seen = Math.acos(Math.min(1, radius / Math.hypot(goal.x - s.x, goal.z - s.z))); // half the ring the goal can see
  const edge = toward - sign * seen; // the end of that visible stretch this way round reaches first
  const arc = (((sign * (edge - from)) % TAU) + TAU) % TAU;
  for (let a = 0; a < arc; a += ARC_CHECK) {
    if (!allowed(room, onRing(room, from + sign * a, radius), radius)) return null;
  }
  return allowed(room, onRing(room, from + sign * arc, radius), radius) ? arc : null;
}

/** Which way the held keys walk, as a unit floor vector: forward is where the camera looks (`forward`, any length). */
export function keyDirection(keys: ReadonlySet<string>, forward: FloorPoint): FloorPoint | null {
  let ahead = 0;
  let right = 0;
  for (const key of keys) {
    const axes = KEY_AXES.get(key);
    if (axes) {
      ahead += axes.forward;
      right += axes.right;
    }
  }
  const length = Math.hypot(forward.x, forward.z);
  if (length < 1e-9) return null;
  const f = { x: forward.x / length, z: forward.z / length };
  // three.js axes with y up: the right of a floor direction (x, z) is (−z, x).
  const x = ahead * f.x - right * f.z;
  const z = ahead * f.z + right * f.x;
  const size = Math.hypot(x, z);
  return size < 1e-9 ? null : { x: x / size, z: z / size };
}

/**
 * One frame of walk mode. Held keys win over a tapped goal and cancel it. Returns where the listener moves to (null: they
 * stay put) and the goal still to walk to (null once arrived or blocked).
 */
export function advanceWalk(
  room: RoomState,
  goal: FloorPoint | null,
  direction: FloorPoint | null,
  dt: number,
): { to: FloorPoint | null; goal: FloorPoint | null } {
  // Keys aim one step ahead, so walking into a wall at an angle slides along it only as fast as the keys point along it.
  const reach = WALK_SPEED * Math.min(Math.max(dt, 0), MAX_DT);
  const target = direction
    ? walkTarget(room, { x: room.listener.x + direction.x * reach, z: room.listener.z + direction.z * reach })
    : goal;
  if (!target) return { to: null, goal: null };
  const step = walkStep(room, target, dt);
  const moved = step.x !== room.listener.x || step.z !== room.listener.z;
  return { to: moved ? { x: step.x, z: step.z } : null, goal: direction || step.done ? null : goal };
}

/** The camera moved toward the head until it is CAMERA_MARGIN inside every wall, the floor and the ceiling. */
export function pullInside(dims: Dims, head: Vec3, camera: Vec3): Vec3 {
  const lo = CAMERA_MARGIN;
  const hi = { x: dims.length - lo, y: dims.height - lo, z: dims.width - lo };
  let t = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const d = camera[axis] - head[axis];
    if (d > 0 && camera[axis] > hi[axis]) t = Math.min(t, (hi[axis] - head[axis]) / d);
    if (d < 0 && camera[axis] < lo) t = Math.min(t, (lo - head[axis]) / d);
  }
  t = Math.max(0, t);
  return { x: head.x + (camera.x - head.x) * t, y: head.y + (camera.y - head.y) * t, z: head.z + (camera.z - head.z) * t };
}

/**
 * What the walk camera looks at and orbits: a point CAMERA_UP over the head. The view is level, so the head sits low in
 * the picture with the speaker beyond it, instead of covering the speaker.
 */
export function walkLook(head: Vec3): Vec3 {
  return { x: head.x, y: head.y + CAMERA_UP, z: head.z };
}

/** Walk mode's first view: over the listener's shoulder, CAMERA_BACK behind and CAMERA_UP above the head, facing the way they face. */
export function walkView(room: RoomState): { position: Vec3; target: Vec3 } {
  const yaw = listenerYaw(room.listener, room.speaker);
  const head = { x: room.listener.x, y: room.listener.y, z: room.listener.z };
  const target = walkLook(head);
  const behind = { x: target.x - Math.cos(yaw) * CAMERA_BACK, y: target.y, z: target.z - Math.sin(yaw) * CAMERA_BACK };
  return { position: pullInside(room.dims, head, behind), target };
}
```

- [ ] **Step 4: Run the tests, check and commit**

Run `npx vitest run src/lib/scene/walk.test.ts` (PASS, 32 tests). Then run `npm test`, `npx tsc --noEmit` and `npm run lint`.
```powershell
git add src/lib/scene/walk.ts src/lib/scene/walk.test.ts
git commit -m "feat: walk maths: tap targets, steps round the speaker, walk keys and the follow camera" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Walk mode in the 3D view

**Files:**
- Modify: `src/lib/scene/RoomScene.ts`, `src/components/RoomView.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces except `walkStep` (used through `advanceWalk`); `applyDrag` from `@/lib/room/placement`.
- Produces:
  - `RoomScene.setWalking(on: boolean): void`. It is idempotent.
  - Turning it on: needs a room from `setRoom`, moves the camera to `walkView`, and starts listening for walk keys on `window`.
  - Turning it off: removes the key listeners and leaves the camera where it is.
  - `dispose()` turns it off.

There are no unit tests for this task. `RoomScene` needs WebGL, as in Plans 3 and 4. All of its decisions are in Task 1's tested functions, and the controller checks the wiring in the browser (Step 4).

- [ ] **Step 1: Walk mode in `RoomScene`**

In `src/lib/scene/RoomScene.ts`:

1. **Imports.** Change the `placement` import from type-only to a value import, and import the walk functions after `RaysObject`:
   ```ts
   import { applyDrag, type DragTarget } from '@/lib/room/placement';
   ```
   ```ts
   import { RaysObject } from './RaysObject';
   import { advanceWalk, keyDirection, pullInside, walkLook, walkTarget, walkView, WALK_KEYS, WALK_ZOOM, type FloorPoint } from './walk';
   ```

2. **Constants**, after `const FORWARD = …`:
   ```ts
   const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
   const LISTENER: DragTarget = { kind: 'listener' };

   /** Keys typed into a form field are for the field, not for walking. */
   function isTyping(target: EventTarget | null): boolean {
     return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName));
   }
   ```

3. **Fields**, after `private extraPointer = false; …`:
   ```ts
   private room: RoomState | null = null; // the last room with usable dimensions
   // Walk mode: where the orbit wants the camera (it is drawn pulled inside the room) and the floor spot being walked to.
   private walk: { wanted: THREE.Vector3; goal: FloorPoint | null } | null = null;
   private readonly keys = new Set<string>(); // walk keys held down (KeyboardEvent.code)
   private lastFrame = 0; // ms: the previous frame's time
   ```

4. **Render loop.** In the constructor's `setAnimationLoop`, replace `this.controls.update();` with:
   ```ts
   const dt = (time - this.lastFrame) / 1000; // long gaps (off-screen, a background tab) are capped by walkStep
   this.lastFrame = time;
   if (this.walk) this.stepWalk(this.walk, dt);
   else this.controls.update();
   ```

5. **`setRoom`.**
   - Right after the "mid-edit" early return, add `this.room = room;`.
   - Replace the re-framing line `if (!this.userMoved) this.setCameraPreset(room, this.preset); // …` with:
   ```ts
   // Re-frame for a new or resized room, unless the user has taken over the camera or walk mode is following the listener.
   if (!this.userMoved && !this.walk) this.setCameraPreset(room, this.preset);
   ```

6. **Walk mode.** Insert this right before `private moveCamera(`:
   ```ts
   /**
    * Walk mode: the camera rides over the listener's shoulder, and a tap on the floor (or WASD / the arrow keys) walks them.
    * Turning it off leaves the camera where it is. The caller turns walk mode off before choosing another view.
    */
   setWalking(on: boolean): void {
     if (on === (this.walk !== null)) return;
     if (!on) {
       this.walk = null;
       this.keys.clear();
       window.removeEventListener('keydown', this.onKeyDown);
       window.removeEventListener('keyup', this.onKeyUp);
       window.removeEventListener('blur', this.onBlur);
       this.controls.enablePan = true;
       this.controls.minDistance = 0;
       this.controls.maxDistance = Infinity;
       this.userMoved = true; // the camera stays where the walk left it, so a room-size edit mustn't snap it to a preset
       return;
     }
     if (!this.room) return;
     this.controls.enablePan = false; // the orbit stays centred on the head
     this.controls.minDistance = WALK_ZOOM.min;
     this.controls.maxDistance = WALK_ZOOM.max;
     this.moveCamera(walkView(this.room));
     this.walk = { wanted: this.camera.position.clone(), goal: null };
     window.addEventListener('keydown', this.onKeyDown);
     window.addEventListener('keyup', this.onKeyUp);
     window.addEventListener('blur', this.onBlur);
   }

   /** One walk-mode frame: step the listener (held keys win over a tapped goal), then carry the camera along inside the room. */
   private stepWalk(walk: { wanted: THREE.Vector3; goal: FloorPoint | null }, dt: number): void {
     const room = this.room;
     if (room && this.roomItemsOn && this.tapMode === 'none' && !this.dragging) {
       const forward = { x: this.controls.target.x - this.camera.position.x, z: this.controls.target.z - this.camera.position.z };
       const step = advanceWalk(room, walk.goal, keyDirection(this.keys, forward), dt);
       walk.goal = step.goal;
       if (step.to) {
         const point = { x: step.to.x, y: room.listener.y, z: step.to.z };
         this.room = applyDrag(room, LISTENER, point); // ahead of React, so the next frame steps on from here
         placeListener(this.listener, this.room);
         this.callbacks.onDrag(LISTENER, point);
       }
     }
     // Carry the orbit along with the head, then let OrbitControls apply the user's turn and zoom.
     const head = this.listener.position;
     const look = walkLook(head);
     this.camera.position.copy(walk.wanted).sub(this.controls.target).add(look);
     this.controls.target.set(look.x, look.y, look.z);
     this.controls.update();
     walk.wanted.copy(this.camera.position);
     // Draw from inside the room. The camera stays there until the next frame, so taps aim from what is on screen.
     if (this.room) {
       const inside = pullInside(this.room.dims, head, this.camera.position);
       this.camera.position.set(inside.x, inside.y, inside.z);
     }
   }

   private readonly onKeyDown = (event: KeyboardEvent) => {
     if (!WALK_KEYS.has(event.code) || event.altKey || event.ctrlKey || event.metaKey || isTyping(event.target)) return;
     this.keys.add(event.code);
     event.preventDefault(); // the arrow keys mustn't scroll the page while walking
   };

   private readonly onKeyUp = (event: KeyboardEvent) => {
     this.keys.delete(event.code);
   };

   /** A key let go while another window had focus never sends keyup. */
   private readonly onBlur = () => {
     this.keys.clear();
   };
   ```

7. **`dispose()`**, right after `this.webgl.setAnimationLoop(null);`:
   ```ts
   this.setWalking(false); // removes the window key listeners
   ```

8. **`onPointerDown`.** Replace `const hit = this.raycaster.intersectObjects([this.speaker, this.listener, ...rugs], true)[0];` with:
   ```ts
   // In walk mode the camera rides on the listener's head, so dragging the listener would chase itself: tap the floor instead.
   const grabbable = this.walk ? [this.speaker, ...rugs] : [this.speaker, this.listener, ...rugs];
   const hit = this.raycaster.intersectObjects(grabbable, true)[0];
   ```

9. **`onPointerUp`.** Taps with tap mode `'none'` now walk.
   - Replace the guard `if (wasDragging || extra || this.tapMode === 'none' || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;` with:
   ```ts
   if (wasDragging || extra || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;
   ```
   - Right after the `this.aim(event);` that follows it, before `if (this.tapMode === 'scan') {`, add:
   ```ts
   if (this.tapMode === 'none') {
     // Walk mode: walk to where the tap meets the floor. A tap above the horizon never meets it.
     if (!this.walk || !this.room || !this.roomItemsOn) return;
     const floor = this.raycaster.ray.intersectPlane(FLOOR, new THREE.Vector3());
     const goal = floor && walkTarget(this.room, { x: floor.x, z: floor.z });
     if (goal) this.walk.goal = goal;
     return;
   }
   ```

- [ ] **Step 2: The Walk button in `RoomView`**

In `src/components/RoomView.tsx`:

1. **State**, after `const [placing, setPlacing] = useState(false);`:
   ```tsx
   const [walking, setWalking] = useState(false);
   ```

2. **Effect and helper**, right after the effect that calls `scanRef.current?.setRoom(room)`. Its position matters: React runs effects in order, and walk mode starts from the scene's room.
   ```tsx
   useEffect(() => {
     sceneRef.current?.setWalking(walking); // after setRoom above: walk mode starts from the scene's room
   }, [walking, webgl]);

   /** Leave walk mode now, not after the re-render: otherwise the next frame pulls the camera back to the listener's head. */
   const stopWalking = () => {
     setWalking(false);
     sceneRef.current?.setWalking(false);
   };
   ```

3. **Canvas label.** Replace the canvas's `aria-label="Your room in 3D. Drag the speaker, listener or rug to move them."` with:
   ```tsx
   aria-label={
     walking
       ? 'Your room in 3D, walking. Tap the floor to walk the listener there.'
       : 'Your room in 3D. Drag the speaker, listener or rug to move them.'
   }
   ```

4. **Camera buttons.**
   - Each preset button's `onClick` becomes:
   ```tsx
   onClick={() => {
     stopWalking();
     sceneRef.current?.setCameraPreset(room, preset);
   }}
   ```
   - After the presets' `.map(…)`, before the rays button, add:
   ```tsx
   <button aria-pressed={walking} disabled={aligning} onClick={() => setWalking((v) => !v)} className={buttonClass}>
     {walking ? 'Stop walking' : 'Walk'}
   </button>
   ```

5. **Align scan.** Make `stopWalking();` the first line of the **Align scan** button's `onClick`, before `setPlacing(false);`:
   ```tsx
   stopWalking(); // alignment frames the scan, and its floor taps aren't for walking
   ```

6. **Help text.** In the small help paragraph at the bottom, replace the line `Drag the speaker (orange), the listener (blue) or the rug. One finger turns the view; two fingers zoom and pan.` with:
   ```tsx
   {walking
     ? 'Tap the floor to walk the listener there, or use WASD or the arrow keys. Drag to look around them; pinch to zoom. You can still drag the speaker and the rug.'
     : 'Drag the speaker (orange), the listener (blue) or the rug. One finger turns the view; two fingers zoom and pan.'}{' '}
   ```
   Keep the line `Rays show the room as you&apos;re hearing it.` after it.

- [ ] **Step 3: Check and commit**

Run `npm test` (all pass, 340 tests), then `npx tsc --noEmit`, `npm run lint` and `npm run build`.
```powershell
git add src/lib/scene/RoomScene.ts src/components/RoomView.tsx
git commit -m "feat: walk mode: tap or WASD to walk the listener, with an over-the-shoulder camera" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Browser walk-through (controller)**

Run `npx --yes serve@latest out -l 4173` in the background and open `/room` in Chrome. The rendering in an automated Chrome may be software-only and slow. Each frame moves the listener at most 0.14 m, so a slow browser walks slowly; that is the frame cap working, not a bug. Check:
- **Walk:** the camera moves over the listener's shoulder and looks level, with the speaker visible above the head. The button reads "Stop walking", and the help text and canvas label change.
- **Tap the floor:** the listener walks there; the rays follow; no validation message appears.
- **Tap beyond the speaker:** the listener walks round it.
- **Tap above the horizon:** nothing happens.
- **Drag** turns the view round the listener. The wheel (or a pinch) zooms between about 0.6 and 3 m. Backed against a wall, the camera stays inside the room, and walking away lets it swing back out.
- **WASD and arrows** walk relative to the view. A W typed into the Length field doesn't walk. The arrows don't scroll the page.
- **Drags:** the speaker and the rug still drag; the listener can't be grabbed. Dragging the speaker onto the listener shows the usual message, and the next step walks clear.
- **Leaving:** Top, Corner and Listener's view each end walk mode, and the camera doesn't snap back. Editing the room's length while walking keeps the camera with the listener.
- **Scan:** load and align a sample `.spz`, then walk. The back of the scan never shows. **Align scan** ends walk mode, and **Walk** is disabled while aligning.
- **Audio:** with a song playing and **In your room** selected, the sound changes shortly after the listener stops.
- **Phone emulation** (Chrome device mode, touch): tap to walk, one-finger orbit, pinch zoom.
- No console errors.
