import { describe, expect, it } from 'vitest';
import { heatPixels } from './heat';

describe('heatPixels', () => {
  it('best is green, worst is red, gaps are clear, rows follow z', () => {
    const px = heatPixels({ x0: 0.5, z0: 0.5, step: 0.4, nx: 2, nz: 2, scores: [10, 90, null, 50], best: { x: 0.9, z: 0.5, score: 90 } });
    const pixel = (i: number) => Array.from(px.slice(4 * i, 4 * i + 4));
    const [worst, best, gap] = [pixel(0), pixel(1), pixel(2)];
    expect(worst[0]).toBeGreaterThan(worst[1]); // red
    expect(best[1]).toBeGreaterThan(best[0]); // green
    expect(gap[3]).toBe(0);
    expect(best[3]).toBeGreaterThan(0);
  });
});
