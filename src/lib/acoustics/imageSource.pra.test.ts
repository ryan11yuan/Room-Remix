import { describe, expect, it } from 'vitest';
import type { Dims, SurfaceId, Vec3 } from '@/lib/room/types';
import fixtures from './__fixtures__/pra-images.json';
import { computeImageSources } from './imageSource';

type Fixture = {
  name: string;
  dims: Dims;
  alpha: Record<SurfaceId, number>;
  speaker: Vec3;
  listener: Vec3;
  maxOrder: number;
  images: { pos: Vec3; order: number; damping: number }[];
};

const key = (p: Vec3) => [p.x, p.y, p.z].map((c) => c.toFixed(6)).join(',');

describe.each(fixtures as Fixture[])('image sources match pyroomacoustics: $name', (fx) => {
  const ours = computeImageSources({
    dims: fx.dims,
    source: fx.speaker,
    listener: fx.listener,
    maxOrder: fx.maxOrder,
    lookup: (surface) => ({ alpha: new Array(6).fill(fx.alpha[surface]), fix: false }),
  });
  const byPosition = new Map(ours.map((a) => [key(a.image), a]));

  it('produces the same number of images', () => {
    expect(ours).toHaveLength(fx.images.length);
  });

  it('places every image at the same position with the same order and damping', () => {
    for (const ref of fx.images) {
      const match = byPosition.get(key(ref.pos));
      expect(match, `image at ${key(ref.pos)}`).toBeDefined();
      expect(match!.order).toBe(ref.order);
      // pyroomacoustics stores images and damping as float32, so agreement is limited to about 1e-7; a convention error (√(1−α) vs (1−α)) would differ by >0.02.
      expect(match!.reflection[0]).toBeCloseTo(ref.damping, 6);
    }
  });
});
