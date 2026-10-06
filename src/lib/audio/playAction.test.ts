import { describe, expect, it } from 'vitest';
import { playAction } from './playAction';

describe('playAction', () => {
  it('picks the drum loop only when nothing is loaded and nothing is loading', () => {
    expect(playAction({ loaded: false, loading: false, playing: false })).toBe('drums');
  });

  it('waits for a song that is still loading, rather than throwing it away for the drum loop', () => {
    expect(playAction({ loaded: false, loading: true, playing: false })).toBe('wait');
    expect(playAction({ loaded: true, loading: true, playing: false })).toBe('wait'); // a second song, picked while paused
  });

  it('plays or pauses what is loaded', () => {
    expect(playAction({ loaded: true, loading: false, playing: false })).toBe('play');
    expect(playAction({ loaded: true, loading: false, playing: true })).toBe('play');
  });

  it('can still pause while the next song loads', () => {
    expect(playAction({ loaded: true, loading: true, playing: true })).toBe('play');
  });
});
