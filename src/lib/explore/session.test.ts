import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import { act, pulseTarget, startSession, type Session } from './session';

const room: Dims = { length: 5, width: 4, height: 2.7 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 2, z: z1 },
});
const door = box('door', 4.9, 1.55, 5, 2.45); // on the far wall, straight ahead from (2, 2) facing +x
const table = box('table', 3, 1.5, 4, 2.5);
const start = (objects: RoomObject[], x = 2, z = 2): Session => startSession(room, objects, { x, z, heading: 0 }).session;

describe('startSession', () => {
  it('clamps the start inside the walls and says the intro', () => {
    const { session, effects } = startSession(room, [door], { x: -3, z: 2, heading: 0 });
    expect(session.pose).toEqual({ x: 0.3, z: 2, heading: 0 });
    expect(effects).toEqual([{ kind: 'say', text: expect.stringContaining("You're at the starting point.") }]);
  });
});

describe('walking', () => {
  it('steps with a footstep, and turns silently', () => {
    const forward = act(start([]), 'forward');
    expect(forward.session.pose.x).toBeCloseTo(2.5, 10);
    expect(forward.effects).toEqual([{ kind: 'footstep' }]);
    const right = act(start([]), 'right');
    expect(right.session.pose.heading).toBeCloseTo(Math.PI / 6, 10);
    expect(right.effects).toEqual([]);
  });

  it('bumps with a thud, then the blocker\'s name from the same point', () => {
    const bump = act(start([table], 2.5), 'forward');
    expect(bump.session.pose.x).toBe(2.5);
    expect(bump.effects).toEqual([{ kind: 'thud', at: { x: 3, y: 1, z: 2 } }, { kind: 'clip', clip: 'table', at: { x: 3, y: 1, z: 2 } }]);
    const wall = act(start([], 4.5), 'forward');
    expect(wall.effects).toEqual([{ kind: 'thud', at: { x: 5, y: 1, z: 2 } }, { kind: 'clip', clip: 'wall', at: { x: 5, y: 1, z: 2 } }]);
  });
});

describe('scan and help', () => {
  it('scans what is there, or says nothing was found', () => {
    expect(act(start([door]), 'scan').effects).toEqual([{ kind: 'scan', items: [{ clip: 'door', at: { x: 4.95, y: 1, z: 2 }, caption: 'Door' }] }]);
    expect(act(start([]), 'scan').effects).toEqual([{ kind: 'say', text: 'Nothing found around you.' }]);
    expect(act(start([]), 'help').effects).toEqual([{ kind: 'say', text: expect.stringContaining('W and S walk.') }]);
  });
});

describe('choosing and going', () => {
  it('cycles targets with Tab and Shift+Tab, announcing each', () => {
    const s = start([table, door]); // indices: table 0, door 1
    const first = act(s, 'next');
    expect(first.session.chosen).toBe(1);
    expect(first.effects).toEqual([
      { kind: 'clip', clip: 'door', at: { x: 4.95, y: 1, z: 2 } },
      { kind: 'say', text: "Door, 12 o'clock, about 3 metres." },
    ]);
    expect(act(first.session, 'next').session.chosen).toBe(0);
    expect(act(act(first.session, 'next').session, 'next').session.chosen).toBe(1);
    expect(act(s, 'previous').session.chosen).toBe(0);
  });

  it('goes to the first target when none is chosen, and arrives with a chime', () => {
    let turn = act(start([door]), 'go');
    expect(turn.session).toMatchObject({ chosen: 0, going: true });
    expect(turn.effects.map((e) => e.kind)).toEqual(['clip', 'say']);
    expect(pulseTarget(turn.session)?.at).toEqual({ x: 4.95, y: 1, z: 2 });
    expect(pulseTarget(turn.session)?.distance).toBeCloseTo(2.9, 10);
    for (let i = 0; i < 3; i++) turn = act(turn.session, 'forward'); // x 3.5: 1.4 m to go
    expect(turn.session.going).toBe(true);
    turn = act(turn.session, 'forward'); // x 4.0: 0.9 m
    expect(turn.effects).toEqual([{ kind: 'footstep' }, { kind: 'chime' }, { kind: 'say', text: "You're at the door." }]);
    expect(turn.session.going).toBe(false);
    expect(pulseTarget(turn.session)).toBeNull();
  });

  it('arrives at once when already there', () => {
    const turn = act(start([door], 4.2), 'go');
    expect(turn.effects.map((e) => e.kind)).toEqual(['clip', 'say', 'chime', 'say']);
    expect(turn.session.going).toBe(false);
  });

  it('stops the pulse with Esc, and Esc does nothing otherwise', () => {
    const going = act(start([door]), 'go').session;
    expect(act(going, 'stop')).toEqual({ session: { ...going, going: false }, effects: [{ kind: 'say', text: 'Stopped.' }] });
    expect(act(start([door]), 'stop').effects).toEqual([]);
  });

  it('has nothing to go to in an empty room', () => {
    expect(act(start([]), 'next').effects).toEqual([{ kind: 'say', text: 'Nothing to go to yet.' }]);
    expect(act(start([]), 'go').effects).toEqual([{ kind: 'say', text: 'Nothing to go to yet.' }]);
    expect(startSession(room, [], { x: 2, z: 2, heading: 0 }).effects[0]).toEqual({ kind: 'say', text: expect.stringContaining('with nothing found yet') });
  });
});
