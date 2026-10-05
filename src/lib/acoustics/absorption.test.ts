import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { MATERIALS } from './materials';

const withRug = (room: RoomState, on: boolean): RoomState => ({
  ...room,
  fixes: [{ kind: 'rug', size: 'M', x: 2, z: 1.75, on }],
});

describe('absorptionArea', () => {
  // Default room at 1 kHz: floor 14 m² × 0.07 + drywall 42.6 m² × 0.04 + glass 10.4 m² × 0.12
  // + furnishing "some" 14 m² × 0.30 = 0.98 + 1.704 + 1.248 + 4.2 = 8.132
  it('sums surface area × alpha plus furnishing', () => {
    expect(absorptionArea(defaultRoom())[3]).toBeCloseTo(8.132, 6);
  });

  it('replaces the floor the rug covers with rug absorption', () => {
    // rug M covers 2.3 × 1.6 = 3.68 m²; 3.68 × (0.37 − 0.07) = 1.104
    expect(absorptionArea(withRug(defaultRoom(), true))[3]).toBeCloseTo(9.236, 6);
  });

  it('ignores fixes that are switched off', () => {
    expect(absorptionArea(withRug(defaultRoom(), false))[3]).toBeCloseTo(8.132, 6);
  });

  it('scales by the calibration factor', () => {
    expect(absorptionArea({ ...defaultRoom(), calibration: { factor: 2 } })[3]).toBeCloseTo(16.264, 6);
  });

  it('applies fixes on top of the calibrated room', () => {
    // 2 × 8.132 + 3.68 × (0.37 − 2 × 0.07) = 16.264 + 0.8464
    const room: RoomState = { ...withRug(defaultRoom(), true), calibration: { factor: 2 } };
    expect(absorptionArea(room)[3]).toBeCloseTo(17.1104, 6);
  });
});

describe('makeSurfaceLookup', () => {
  it('returns the rug inside its footprint and the floor outside it', () => {
    const lookup = makeSurfaceLookup(withRug(defaultRoom(), true));
    expect(lookup('floor', { x: 2, y: 0, z: 1.75 })).toEqual({ alpha: MATERIALS.rug.alpha, fix: true });
    expect(lookup('floor', { x: 0.3, y: 0, z: 0.3 })).toEqual({ alpha: MATERIALS.woodFloor.alpha, fix: false });
  });

  it('returns a panel only on its own wall', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [{ kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: true }] };
    const lookup = makeSurfaceLookup(room);
    expect(lookup('wallZ1', { x: 2, y: 1.2, z: 3.5 })).toEqual({ alpha: MATERIALS.acousticPanel.alpha, fix: true });
    expect(lookup('wallZ1', { x: 0.5, y: 1.2, z: 3.5 })).toEqual({ alpha: MATERIALS.glass.alpha, fix: false });
    expect(lookup('wallZ0', { x: 2, y: 1.2, z: 0 })).toEqual({ alpha: MATERIALS.drywall.alpha, fix: false });
  });
});
