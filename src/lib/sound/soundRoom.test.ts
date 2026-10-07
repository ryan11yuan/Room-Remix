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
