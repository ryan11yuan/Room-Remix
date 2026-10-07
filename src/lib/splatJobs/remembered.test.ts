import { afterEach, describe, expect, it, vi } from 'vitest';
import { forgetJob, recallJob, rememberJob } from './remembered';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remembered builds', () => {
  it('keeps one build per room', () => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    });
    rememberJob('room-a', 'job-1');
    rememberJob('room-b', 'job-2');
    expect(recallJob('room-a')).toBe('job-1');
    expect(store.get('room-remix:video-scan:room-b')).toBe('job-2');
    forgetJob('room-a');
    expect(recallJob('room-a')).toBeNull();
    expect(recallJob('room-b')).toBe('job-2');
  });

  it('never throws when storage is blocked or missing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => rememberJob('room-a', 'job-1')).not.toThrow();
    expect(recallJob('room-a')).toBeNull();
    expect(() => forgetJob('room-a')).not.toThrow();
    vi.stubGlobal('localStorage', undefined);
    expect(recallJob('room-a')).toBeNull();
  });
});
