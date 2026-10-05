import { describe, expect, it } from 'vitest';
import type { RayPath } from '@/lib/acoustics/rays';
import { buildRayBuffers } from './rayBuffers';

const direct: RayPath = { points: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }], energy: 0.04, vertexEnergy: [1, 1], hitFix: [] };
const bounce: RayPath = {
  points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 1, z: 4 }],
  energy: 0.04 * 10 ** -1.5, // 15 dB below the direct path
  vertexEnergy: [1, 0.7, 0.7],
  hitFix: [true],
};

describe('buildRayBuffers', () => {
  it('makes one segment per leg with the distance travelled at each end', () => {
    const b = buildRayBuffers([direct, bounce]);
    expect(b.positions).toHaveLength(3 * 6); // 1 + 2 legs
    expect(Array.from(b.arc.slice(0, 2))).toEqual([0, 5]);
    const leg = Math.hypot(1, 2);
    expect(b.arc[2]).toBeCloseTo(0, 6);
    expect(b.arc[3]).toBeCloseTo(leg, 6);
    expect(b.arc[4]).toBeCloseTo(leg, 6);
    expect(b.arc[5]).toBeCloseTo(2 * leg, 6);
    expect(b.maxArc).toBeCloseTo(5, 6);
  });

  it('carries the energy left after each bounce along the following leg', () => {
    const b = buildRayBuffers([bounce]);
    expect(Array.from(b.energy)).toEqual([1, 1, Math.fround(0.7), Math.fround(0.7)]);
  });

  it('ranks paths on a 30 dB scale relative to the strongest', () => {
    const b = buildRayBuffers([direct, bounce]);
    expect(b.strength[0]).toBeCloseTo(1, 6);
    expect(b.strength[2]).toBeCloseTo(0.5, 6);
  });

  it('handles no paths', () => {
    const b = buildRayBuffers([]);
    expect(b.positions).toHaveLength(0);
    expect(b.maxArc).toBe(0);
  });
});
