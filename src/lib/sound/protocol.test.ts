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
