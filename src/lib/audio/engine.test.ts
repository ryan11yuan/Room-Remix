import { describe, expect, it } from 'vitest';
import { isSilentIr, warmUpSeconds } from './engine';
import { silentIr } from './mix';

describe('isSilentIr', () => {
  it('is true for the one-sample silent IR', () => {
    expect(isSilentIr(silentIr(48000))).toBe(true);
  });

  it('is false for a real IR, even one that starts with silence', () => {
    const left = new Float32Array(4800);
    const right = new Float32Array(4800);
    left[200] = 0.5; // the direct sound arrives after the speaker-to-listener delay
    right[210] = 0.4;
    expect(isSilentIr({ left, right, sampleRate: 48000 })).toBe(false);
    expect(isSilentIr({ left: new Float32Array(4800), right, sampleRate: 48000 })).toBe(false); // sound in one ear only
  });
});

describe('warmUpSeconds', () => {
  it('is 0 when the pair being heard is silent: there is no reverb to keep, so the new IR comes in at once', () => {
    expect(warmUpSeconds(true, 6)).toBe(0);
  });

  it('is the IR length, at most 0.5 s, when a real IR is being heard', () => {
    expect(warmUpSeconds(false, 6)).toBe(0.5);
    expect(warmUpSeconds(false, 0.2)).toBe(0.2);
  });
});
