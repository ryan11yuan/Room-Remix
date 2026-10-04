import { describe, expect, it } from 'vitest';
import { rateRt60 } from './rating';

describe('rateRt60', () => {
  it.each([
    [0.29, 'Dead'],
    [0.3, 'Balanced'],
    [0.5, 'Balanced'],
    [0.51, 'A bit echoey'],
    [0.8, 'A bit echoey'],
    [0.81, 'Echoey'],
  ])('rates %s s as %s', (rt, label) => {
    expect(rateRt60(rt)).toBe(label);
  });
});
