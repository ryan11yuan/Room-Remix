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

/** Walk with advanceWalk (tapped goal, no keys) until the goal is dropped; every frame's room must be valid. */
function walkGoal(start: RoomState, goal: FloorPoint, maxFrames = 600): { room: RoomState; frames: number } {
  let room = start;
  let current: FloorPoint | null = goal;
  for (let frame = 1; frame <= maxFrames; frame++) {
    const result = advanceWalk(room, current, null, FRAME);
    if (result.to) room = moveListener(room, result.to);
    expect(validateRoom(room)).toEqual([]);
    current = result.goal;
    if (!current) return { room, frames: frame };
  }
  throw new Error(`goal still kept after ${maxFrames} frames`);
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
    expect(end.listener.x).toBeCloseTo(2 - 0.51, 6); // stopped on the keep-out ring, on the near side
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

  it('(a) walks round a speaker standing on the wall clearance line to a spot on that line', () => {
    const start = roomWith({ x: 0.3, y: 1.1, z: 0.9 }, { x: 2, y: 1.1, z: 1.75 });
    const goal = walkTarget(start, { x: -0.5, z: 0.853 })!;
    expect(goal.x).toBe(0.3);
    const { room: end } = walkAll(start, goal);
    expect(end.listener).toMatchObject(goal);
  });

  it('arrives exactly, going round the speaker, whenever both ways round are open', () => {
    let seed = 11;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const between = (lo: number, hi: number) => lo + (hi - lo) * random();
    for (let trial = 0; trial < 300; trial++) {
      // The speaker stands at least 1.4 m from every wall: the ring (0.51 m) plus the wall clearance (0.3 m) leaves both ways open.
      const dims = { length: between(3, 8), width: between(3, 8), height: 2.6 };
      const speaker = { x: between(1.4, dims.length - 1.4), y: 1.1, z: between(1.4, dims.width - 1.4) };
      const angle = between(0, 2 * Math.PI);
      const d = between(0.6, 1);
      const start = roomWith(speaker, { x: speaker.x + Math.cos(angle) * d, y: 1.1, z: speaker.z + Math.sin(angle) * d }, dims);
      expect(validateRoom(start)).toEqual([]);
      const goal = walkTarget(start, { x: speaker.x - Math.cos(angle) * d, z: speaker.z - Math.sin(angle) * d })!; // straight through the speaker
      const { room: end } = walkAll(start, goal, 2000);
      expect(end.listener).toMatchObject(goal);
    }
  });

  it('stands still for a frame time that is not a number', () => {
    expect(walkStep(room, { x: 3, z: 3 }, Number.NaN)).toEqual({ x: 3, z: 1.9, done: false });
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

  it('counts W and the up arrow held together once', () => {
    expect(keyDirection(new Set(['KeyW', 'ArrowUp', 'KeyD']), { x: 0, z: -1 })).toEqual(keyDirection(new Set(['KeyW', 'KeyD']), { x: 0, z: -1 }));
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

  it('(b) walks to the nearest free spot when the speaker was dragged onto the goal, and then drops it', () => {
    const start = roomWith({ x: 2.6, y: 1.1, z: 1.75 }, { x: 1, y: 1.1, z: 1.75 });
    const { room: end } = walkGoal(start, { x: 2.5, z: 1.75 }); // inside the speaker's keep-out ring
    expect(Math.hypot(end.listener.x - 2.5, end.listener.z - 1.75)).toBeLessThan(0.6);
  });

  it('(c) walks to the wall when the room shrank past the goal, and then drops it', () => {
    const start = roomWith({ x: 0.6, y: 1.0, z: 1.4 }, { x: 2, y: 1.1, z: 1.75 }, { length: 3, width: 3.5, height: 2.6 });
    const { room: end } = walkGoal(start, { x: 3.5, z: 1.75 }); // beyond the wall at x = 3
    expect(end.listener.x).toBeCloseTo(2.7, 9);
    expect(end.listener.z).toBeCloseTo(1.75, 9);
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
