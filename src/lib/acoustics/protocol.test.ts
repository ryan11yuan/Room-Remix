import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { pinkGain } from './loudness';
import { handleRequest, transferables } from './protocol';

describe('handleRequest', () => {
  it('simulates a valid room and echoes the id', () => {
    const res = handleRequest({ id: 7, room: defaultRoom(), sampleRate: 16000 });
    expect(res.id).toBe(7);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.now.ir.sampleRate).toBe(16000);
      expect(transferables(res)).toHaveLength(4);
      const gain = (pinkGain(res.now.ir.left, 16000) + pinkGain(res.now.ir.right, 16000)) / 2;
      expect(gain).toBeCloseTo(1, 6);
    }
  });

  it('refuses an invalid room instead of producing NaNs', () => {
    const room = defaultRoom();
    const res = handleRequest({ id: 8, room: { ...room, listener: { ...room.listener, ...room.speaker } }, sampleRate: 16000 });
    expect(res).toEqual({ id: 8, ok: false, error: expect.stringContaining('listener') });
    expect(transferables(res)).toEqual([]);
  });
});
