import { describe, expect, it } from 'vitest';
import { roomFromHash, roomHash, roomLabel } from './rooms';

describe('room links', () => {
  it('reads a room id from the hash, and ignores anything else', () => {
    const id = 'f36821e6-cace-49ad-a6cc-6e0798a4bba1';
    expect(roomFromHash(roomHash(id))).toBe(id);
    expect(roomFromHash(`#room=${id}`)).toBe(id);
    expect(roomFromHash('')).toBeNull();
    expect(roomFromHash('#room=')).toBeNull();
    expect(roomFromHash('#room=../../x')).toBeNull();
    expect(roomFromHash('#other=abc')).toBeNull();
  });

  it('labels a room with when it was made and its quality', () => {
    const at = Date.UTC(2026, 9, 7, 0, 38);
    expect(roomLabel({ id: 'a', quality: 'best', createdAt: at }, { locale: 'en-US', timeZone: 'UTC' })).toBe('Oct 7, 2026, 12:38 AM · Best');
    expect(roomLabel({ id: 'a', quality: 'quick', createdAt: at }, { locale: 'en-US', timeZone: 'UTC' })).toBe('Oct 7, 2026, 12:38 AM · Quick');
  });
});
