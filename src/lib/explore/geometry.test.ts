import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { bearing, centre, clockHour, footprintDistance, normalizeHeading, TAU, type Pose } from './geometry';

const table: RoomObject = { label: 'table', min: { x: 2, y: 0, z: 1 }, max: { x: 3, y: 0.8, z: 2 } };
const facingX: Pose = { x: 0, z: 0, heading: 0 };

describe('geometry', () => {
  it('finds a box centre and the floor distance to its footprint', () => {
    expect(centre(table)).toEqual({ x: 2.5, y: 0.4, z: 1.5 });
    expect(footprintDistance({ x: 2.5, z: 1.5 }, table)).toBe(0);
    expect(footprintDistance({ x: 1, z: 1.5 }, table)).toBe(1);
    expect(footprintDistance({ x: 6, z: 6 }, table)).toBeCloseTo(5, 10);
  });

  it('measures bearings clockwise from the facing direction: right is 3 o\'clock', () => {
    expect(bearing(facingX, { x: 5, z: 0 })).toBe(0);
    expect(bearing(facingX, { x: 0, z: 5 })).toBeCloseTo(Math.PI / 2, 10); // +z is to the right of +x
    expect(bearing(facingX, { x: -5, z: 0 })).toBeCloseTo(Math.PI, 10);
    expect(bearing(facingX, { x: 0, z: -5 })).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(bearing({ x: 0, z: 0, heading: Math.PI / 2 }, { x: 0, z: 5 })).toBe(0); // turned right to face +z
  });

  it('puts something a hair left of straight ahead just under a full turn, at 12 o\'clock', () => {
    const b = bearing(facingX, { x: 5, z: -0.001 });
    expect(b).toBeGreaterThan(TAU - 0.01);
    expect(b).toBeLessThan(TAU);
    expect(clockHour(b)).toBe(12);
  });

  it('rounds bearings to clock hours', () => {
    expect(clockHour(0)).toBe(12);
    expect(clockHour(Math.PI / 6)).toBe(1);
    expect(clockHour(Math.PI / 2)).toBe(3);
    expect(clockHour(Math.PI)).toBe(6);
    expect(clockHour((3 * Math.PI) / 2)).toBe(9);
  });

  it('wraps headings into (−π, π]', () => {
    expect(normalizeHeading(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(normalizeHeading(-Math.PI / 2 - TAU)).toBeCloseTo(-Math.PI / 2, 10);
  });
});
