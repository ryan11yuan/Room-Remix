import { describe, expect, it } from 'vitest';
import { earResponse, HEAD_RADIUS, listenerYaw } from './binaural';

describe('listenerYaw', () => {
  it('uses a fixed yaw when given', () => {
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 0.3 }, { x: 0, y: 0, z: 0 })).toBe(0.3);
  });

  it('faces the speaker when asked', () => {
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 'faceSpeaker' }, { x: 1, y: 1, z: 3 })).toBeCloseTo(Math.PI / 2, 12);
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 'faceSpeaker' }, { x: 3, y: 1, z: 1 })).toBeCloseTo(0, 12);
  });
});

describe('earResponse', () => {
  it('treats sound from straight ahead identically at both ears', () => {
    const r = earResponse({ x: 1, y: 0, z: 0 }, 0);
    expect(r.delayLeft).toBe(0);
    expect(r.delayRight).toBe(0);
    expect(r.gainLeft).toEqual(r.gainRight);
  });

  it('delays and shadows the left ear for sound from the right', () => {
    const r = earResponse({ x: 0, y: 0, z: 1 }, 0); // yaw 0 → right is +z
    expect(r.delayRight).toBe(0);
    expect(r.delayLeft).toBeCloseTo((HEAD_RADIUS / 343) * (Math.PI / 2 + 1), 12);
    expect(r.gainRight).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.gainLeft[5]).toBeCloseTo(10 ** (-15 / 20), 12);
    expect(r.gainLeft[0]).toBeGreaterThan(r.gainLeft[5]);
  });

  it('mirrors for sound from the left', () => {
    const r = earResponse({ x: 0, y: 0, z: -1 }, 0);
    expect(r.delayLeft).toBe(0);
    expect(r.delayRight).toBeGreaterThan(0);
    expect(r.gainRight[5]).toBeLessThan(1);
  });
});
