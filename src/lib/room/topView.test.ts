import { describe, expect, it } from 'vitest';
import { defaultRoom, validateRoom } from './roomState';
import {
  arrowHead,
  clientToPlan,
  dragTo,
  facingArrow,
  fitPlan,
  fromPlan,
  itemLabel,
  nudge,
  nudgeHint,
  panelSegment,
  PLAN_BAR_H,
  PLAN_H,
  PLAN_PAD,
  PLAN_W,
  planFor,
  rugRect,
  scaleBar,
  toPlan,
} from './topView';
import type { RoomState, RugFix } from './types';

const room = (patch: Partial<RoomState> = {}): RoomState => ({ ...defaultRoom(), ...patch });
const rug = (patch: Partial<RugFix> = {}): RugFix => ({ kind: 'rug', size: 'M', x: 2, z: 1.75, on: true, ...patch });
const small = room({
  dims: { length: 1.5, width: 1.5, height: 2.4 },
  speaker: { x: 0.4, y: 1, z: 0.4 },
  listener: { x: 1.1, y: 1.1, z: 1.1, yaw: 'faceSpeaker' },
});
const SPEAKER = { kind: 'speaker' } as const;
const LISTENER = { kind: 'listener' } as const;

describe('fitPlan', () => {
  it('fits the floor inside the padding, keeps its shape and centres it', () => {
    const plan = fitPlan({ length: 4, width: 3.5, height: 2.6 }, 320, 240, 28)!;
    expect(plan.scale).toBeCloseTo(Math.min(264 / 4, 184 / 3.5), 12);
    const far = toPlan(plan, { x: 4, z: 3.5 });
    expect(plan.left).toBeGreaterThanOrEqual(28);
    expect(plan.top).toBeGreaterThanOrEqual(28);
    expect(far.px).toBeLessThanOrEqual(320 - 28 + 1e-9);
    expect(far.py).toBeLessThanOrEqual(240 - 28 + 1e-9);
    expect(plan.left + far.px).toBeCloseTo(320, 9); // centred across
    expect(plan.top + far.py).toBeCloseTo(240, 9); // and down
    expect((far.px - plan.left) / (far.py - plan.top)).toBeCloseTo(4 / 3.5, 12); // same shape as the floor
  });

  it('gives a usable plan for a long, narrow room', () => {
    const plan = planFor({ length: 30, width: 1.5, height: 2.4 })!;
    expect(plan.scale).toBeGreaterThan(0);
    expect(Number.isFinite(plan.left) && Number.isFinite(plan.top)).toBe(true);
    const back = fromPlan(plan, toPlan(plan, { x: 29.7, z: 1.2 }).px, toPlan(plan, { x: 29.7, z: 1.2 }).py);
    expect(back.x).toBeCloseTo(29.7, 9);
    expect(back.z).toBeCloseTo(1.2, 9);
  });

  it('gives no plan while a size is mid-edit', () => {
    expect(fitPlan({ length: Number.NaN, width: 3, height: 2.4 }, 320, 240, 28)).toBeNull();
    expect(fitPlan({ length: 4, width: 0, height: 2.4 }, 320, 240, 28)).toBeNull();
    expect(fitPlan({ length: 4, width: 3, height: 2.4 }, 40, 240, 28)).toBeNull(); // no room left inside the padding
  });

  it('leaves the bottom strip to the scale bar', () => {
    const plan = planFor({ length: 1.5, width: 3, height: 2.4 })!;
    expect(toPlan(plan, { x: 0, z: 3 }).py).toBeLessThanOrEqual(PLAN_H - PLAN_BAR_H - PLAN_PAD + 1e-9);
  });
});

describe('toPlan and fromPlan', () => {
  it('round-trip a floor point', () => {
    const plan = planFor(defaultRoom().dims)!;
    for (const p of [{ x: 0, z: 0 }, { x: 0.6, z: 1.4 }, { x: 4, z: 3.5 }, { x: -2, z: 9 }]) {
      const { px, py } = toPlan(plan, p);
      const back = fromPlan(plan, px, py);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.z).toBeCloseTo(p.z, 9);
    }
  });

  it('draw x to the right and z downward, as the 3D Top camera shows them', () => {
    const plan = planFor(defaultRoom().dims)!;
    const origin = toPlan(plan, { x: 0, z: 0 });
    expect(toPlan(plan, { x: 1, z: 0 }).px).toBeGreaterThan(origin.px);
    expect(toPlan(plan, { x: 0, z: 1 }).py).toBeGreaterThan(origin.py);
  });
});

describe('clientToPlan', () => {
  it('maps client pixels to drawing units', () => {
    const rect = { left: 10, top: 20, width: 640, height: 480 };
    expect(clientToPlan(rect, 10, 20)).toEqual({ px: 0, py: 0 });
    expect(clientToPlan(rect, 650, 500)).toEqual({ px: PLAN_W, py: PLAN_H });
  });

  it('gives nothing while the drawing has no size, so no NaN reaches the room', () => {
    expect(clientToPlan({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toBeNull();
  });
});

describe('dragTo', () => {
  it('moves the speaker to the pointer', () => {
    const plan = planFor(defaultRoom().dims)!;
    const { px, py } = toPlan(plan, { x: 2, z: 1 });
    const moved = dragTo(defaultRoom(), plan, SPEAKER, px, py);
    expect(moved.speaker.x).toBeCloseTo(2, 9);
    expect(moved.speaker.z).toBeCloseTo(1, 9);
    expect(moved.speaker.y).toBe(defaultRoom().speaker.y);
  });

  it('keeps the offset where the item was grabbed', () => {
    const plan = planFor(defaultRoom().dims)!;
    const { px, py } = toPlan(plan, { x: 2, z: 1 });
    const moved = dragTo(defaultRoom(), plan, SPEAKER, px, py, { x: 0.25, z: -0.1 });
    expect(moved.speaker.x).toBeCloseTo(2.25, 9);
    expect(moved.speaker.z).toBeCloseTo(0.9, 9);
  });

  it('keeps a drag that left the drawing 0.3 m inside the walls', () => {
    const plan = planFor(defaultRoom().dims)!;
    const corner = dragTo(defaultRoom(), plan, LISTENER, -5000, 99999);
    expect(corner.listener.x).toBeCloseTo(0.3, 9);
    expect(corner.listener.z).toBeCloseTo(defaultRoom().dims.width - 0.3, 9);
    const other = dragTo(defaultRoom(), plan, SPEAKER, 99999, -5000);
    expect(other.speaker.x).toBeCloseTo(defaultRoom().dims.length - 0.3, 9);
    expect(other.speaker.z).toBeCloseTo(0.3, 9);
  });

  it('keeps the rug on the floor', () => {
    const withRug = room({ fixes: [rug()] });
    const plan = planFor(withRug.dims)!;
    const moved = dragTo(withRug, plan, { kind: 'rug', index: 0 }, -1000, -1000);
    expect(moved.fixes[0]).toMatchObject({ x: 2.3 / 2, z: 1.6 / 2 });
  });

  it('ignores a pointer position that is not a number', () => {
    const plan = planFor(defaultRoom().dims)!;
    const before = defaultRoom();
    expect(dragTo(before, plan, SPEAKER, Number.NaN, 10)).toBe(before);
  });

  it('keeps every drag in the smallest room inside the walls', () => {
    const plan = planFor(small.dims)!;
    for (const [px, py] of [[0, 0], [PLAN_W, PLAN_H], [PLAN_W / 2, PLAN_H / 2], [-50, 400]]) {
      const moved = dragTo(small, plan, SPEAKER, px, py);
      expect(moved.speaker.x).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(moved.speaker.x).toBeLessThanOrEqual(1.2 + 1e-9);
      expect(moved.speaker.z).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(moved.speaker.z).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });
});

describe('nudge', () => {
  it('moves 0.1 m the way the arrow points in the drawing', () => {
    const start = defaultRoom(); // speaker at x 0.6, z 1.4
    expect(nudge(start, SPEAKER, 'ArrowRight')!.speaker).toMatchObject({ x: 0.7, z: 1.4 });
    expect(nudge(start, SPEAKER, 'ArrowLeft')!.speaker).toMatchObject({ x: 0.5, z: 1.4 });
    expect(nudge(start, SPEAKER, 'ArrowDown')!.speaker).toMatchObject({ x: 0.6, z: 1.5 });
    expect(nudge(start, SPEAKER, 'ArrowUp')!.speaker).toMatchObject({ x: 0.6, z: 1.3 });
  });

  it('lands on whole millimetres after many presses', () => {
    let r = defaultRoom();
    for (let i = 0; i < 7; i++) r = nudge(r, LISTENER, 'ArrowLeft')!;
    expect(r.listener.x).toBe(2.3);
  });

  it('stops 0.3 m from the wall', () => {
    let r = small;
    for (let i = 0; i < 20; i++) r = nudge(r, SPEAKER, 'ArrowUp')!;
    expect(r.speaker.z).toBeCloseTo(0.3, 9);
  });

  it('moves the rug and keeps it on the floor', () => {
    let r = room({ fixes: [rug()] });
    r = nudge(r, { kind: 'rug', index: 0 }, 'ArrowRight')!;
    expect(r.fixes[0]).toMatchObject({ x: 2.1 });
    for (let i = 0; i < 30; i++) r = nudge(r, { kind: 'rug', index: 0 }, 'ArrowRight')!;
    expect(r.fixes[0]).toMatchObject({ x: 4 - 2.3 / 2 });
  });

  it('leaves other keys to the page', () => {
    for (const key of ['Enter', ' ', 'a', 'Tab', 'toString']) expect(nudge(defaultRoom(), SPEAKER, key)).toBeNull();
    expect(nudge(defaultRoom(), { kind: 'rug', index: 3 }, 'ArrowLeft')).toBeNull();
  });
});

describe('labels', () => {
  it('give distances from the front and right walls in the chosen unit', () => {
    expect(itemLabel(defaultRoom(), SPEAKER, 'm')).toBe('Speaker, 0.6 m from the front wall and 1.4 m from the right wall');
    expect(itemLabel(defaultRoom(), LISTENER, 'ft')).toBe('Listener, 9.8 ft from the front wall and 6.2 ft from the right wall');
    expect(itemLabel(room({ fixes: [rug()] }), { kind: 'rug', index: 0 }, 'm')).toBe(
      'Rug centre, 2 m from the front wall and 1.75 m from the right wall',
    );
  });

  it('say so when a position is mid-edit', () => {
    const editing = room({ speaker: { x: Number.NaN, y: 1, z: 1.4 } });
    expect(itemLabel(editing, SPEAKER, 'm')).toBe('Speaker, an unknown distance from the front wall and 1.4 m from the right wall');
  });

  it('give the arrow-key step in the chosen unit', () => {
    expect(nudgeHint('m')).toBe('Drag it, or use the arrow keys to move it 0.1 m at a time.');
    expect(nudgeHint('ft')).toBe('Drag it, or use the arrow keys to move it 0.3 ft at a time.');
  });
});

describe('fixes in the drawing', () => {
  it('draws a rug bigger than the room as the floor it covers', () => {
    const big = { ...small, fixes: [rug({ size: 'L', x: 0.75, z: 0.75 })] };
    expect(validateRoom(big).map((e) => e.message)).toContain('The rug must fit inside the floor.');
    const plan = planFor(big.dims)!;
    const rect = rugRect(plan, big.dims, big.fixes[0] as RugFix)!;
    const floor = toPlan(plan, { x: 1.5, z: 1.5 });
    expect(rect.x).toBeCloseTo(plan.left, 9);
    expect(rect.y).toBeCloseTo(plan.top, 9);
    expect(rect.x + rect.width).toBeCloseTo(floor.px, 9);
    expect(rect.y + rect.height).toBeCloseTo(floor.py, 9);
  });

  it('draws a rug that fits at its size', () => {
    const plan = planFor(defaultRoom().dims)!;
    const rect = rugRect(plan, defaultRoom().dims, rug())!;
    expect(rect.width).toBeCloseTo(2.3 * plan.scale, 9);
    expect(rect.height).toBeCloseTo(1.6 * plan.scale, 9);
  });

  it('skips a rug whose position is mid-edit', () => {
    const plan = planFor(defaultRoom().dims)!;
    expect(rugRect(plan, defaultRoom().dims, rug({ x: Number.NaN }))).toBeNull();
  });

  it('draws each panel along its own wall', () => {
    const dims = defaultRoom().dims; // 4 × 3.5
    const plan = planFor(dims)!;
    const at = (x: number, z: number) => toPlan(plan, { x, z });
    const seg = (wall: 'wallX0' | 'wallX1' | 'wallZ0' | 'wallZ1', u: number) =>
      panelSegment(plan, dims, { kind: 'panel', wall, u, v: 1.2, on: true })!;
    expect(seg('wallX0', 1)).toEqual({ x1: at(0, 0.7).px, y1: at(0, 0.7).py, x2: at(0, 1.3).px, y2: at(0, 1.3).py });
    expect(seg('wallX1', 1)).toEqual({ x1: at(4, 0.7).px, y1: at(4, 0.7).py, x2: at(4, 1.3).px, y2: at(4, 1.3).py });
    expect(seg('wallZ0', 2)).toEqual({ x1: at(1.7, 0).px, y1: at(1.7, 0).py, x2: at(2.3, 0).px, y2: at(2.3, 0).py });
    expect(seg('wallZ1', 2)).toEqual({ x1: at(1.7, 3.5).px, y1: at(1.7, 3.5).py, x2: at(2.3, 3.5).px, y2: at(2.3, 3.5).py });
  });
});

describe('facingArrow', () => {
  it('points from the listener toward the speaker when facing it', () => {
    const plan = planFor(defaultRoom().dims)!;
    const arrow = facingArrow(plan, defaultRoom())!;
    const listener = toPlan(plan, defaultRoom().listener);
    expect(arrow.x1).toBeCloseTo(listener.px, 9);
    expect(arrow.y1).toBeCloseTo(listener.py, 9);
    expect(arrow.x2).toBeLessThan(arrow.x1); // the speaker (x 0.6) is toward the front wall, on the left
    expect(Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1)).toBeCloseTo(0.5 * plan.scale, 9);
  });

  it('follows a set yaw', () => {
    const plan = planFor(defaultRoom().dims)!;
    const arrow = facingArrow(plan, room({ listener: { x: 2, y: 1.1, z: 2, yaw: Math.PI / 2 } }))!;
    expect(arrow.x2).toBeCloseTo(arrow.x1, 9);
    expect(arrow.y2).toBeGreaterThan(arrow.y1); // +z is down the drawing
  });

  it('draws no arrow while a position is mid-edit', () => {
    const plan = planFor(defaultRoom().dims)!;
    expect(facingArrow(plan, room({ speaker: { x: Number.NaN, y: 1, z: 1 } }))).toBeNull();
  });
});

describe('scaleBar', () => {
  it('is 1 m long in metres and 3 ft long in feet', () => {
    const plan = planFor(defaultRoom().dims)!;
    const metre = scaleBar(plan, 'm');
    expect(metre.label).toBe('1 m');
    expect(metre.x2 - metre.x1).toBeCloseTo(plan.scale, 9);
    const feet = scaleBar(plan, 'ft');
    expect(feet.label).toBe('3 ft');
    expect(feet.x2 - feet.x1).toBeCloseTo(0.9144 * plan.scale, 9);
    expect(metre.y1).toBeGreaterThan(PLAN_H - PLAN_BAR_H);
  });
});

describe('arrowHead', () => {
  it('puts the tip at the end of the arrow and the base behind it', () => {
    const points = arrowHead({ x1: 0, y1: 0, x2: 10, y2: 0 }, 7)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points[0]).toEqual([10, 0]);
    expect(points[1][0]).toBeCloseTo(3, 9);
    expect(points[2][0]).toBeCloseTo(3, 9);
    expect(points[1][1]).toBeCloseTo(-points[2][1], 9); // the base is centred on the arrow
    expect(Math.abs(points[1][1] - points[2][1])).toBeCloseTo(2 * 7 * 0.6, 9);
  });
});
