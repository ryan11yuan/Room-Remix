import { describe, expect, it } from 'vitest';
import { hasArrived, pulseInterval } from './beacon';

describe('beacon', () => {
  it('pulses faster as you get closer, never slower than every 1.2 s', () => {
    expect(pulseInterval(0)).toBeCloseTo(0.25, 10);
    expect(pulseInterval(2)).toBeCloseTo(0.55, 10);
    expect(pulseInterval(10)).toBe(1.2);
  });

  it('arrives within a metre of the footprint', () => {
    expect(hasArrived(1)).toBe(true);
    expect(hasArrived(1.01)).toBe(false);
  });
});
