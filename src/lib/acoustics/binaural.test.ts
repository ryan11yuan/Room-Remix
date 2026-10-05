import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { earResponse, HEAD_RADIUS, listenerYaw } from './binaural';
import { computeImageSources } from './imageSource';

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

describe('wall sidedness', () => {
  it('hears the left wall (wallZ1) in the left ear first for a listener facing the front wall', () => {
    const room = defaultRoom(); // listener faces the speaker near the front wall (x = 0)
    const yaw = listenerYaw(room.listener, room.speaker);
    const flat = () => ({ alpha: [0, 0, 0, 0, 0, 0], fix: false });
    const left = computeImageSources({ dims: room.dims, source: room.speaker, listener: room.listener, maxOrder: 1, lookup: flat })
      .find((a) => a.hitSurfaces.join() === 'wallZ1')!;
    const ears = earResponse(left.direction, yaw);
    expect(ears.delayRight).toBeGreaterThan(0);
    expect(ears.delayLeft).toBe(0);
  });
});
