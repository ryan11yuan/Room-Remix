import { describe, expect, it } from 'vitest';
import type { RayPath } from '@/lib/acoustics/rays';
import { PULSE_SPEED, RaysObject } from './RaysObject';

const direct: RayPath = { points: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }], energy: 0.04, vertexEnergy: [1, 1], hitFix: [] };

describe('RaysObject', () => {
  it('uploads one vertex pair per leg', () => {
    const rays = new RaysObject();
    rays.setPaths([direct]);
    expect(rays.object.geometry.getAttribute('position').count).toBe(2);
    expect(rays.object.geometry.getAttribute('arc').count).toBe(2);
    rays.dispose();
  });

  it('moves the pulse front at the slowed speed of sound and loops after a pause', () => {
    const rays = new RaysObject();
    rays.setPaths([direct]);
    rays.tick(1);
    expect(rays.front).toBeCloseTo(PULSE_SPEED, 9);
    const loop = 5 / PULSE_SPEED + 0.8;
    rays.tick(loop + 0.5);
    expect(rays.front).toBeCloseTo(0.5 * PULSE_SPEED, 6);
    rays.dispose();
  });
});
