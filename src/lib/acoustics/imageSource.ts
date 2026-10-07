import type { Dims, SurfaceId, Vec3 } from '@/lib/room/types';
import type { SurfaceLookup } from './absorption';
import { AIR_M, NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';
import { OCCLUSION_GAIN, segmentHitsBox, type Box } from './objects';

export type ImageSourceInput = {
  dims: Dims;
  source: Vec3;
  listener: Vec3;
  maxOrder: number;
  lookup: SurfaceLookup;
  air?: Bands;
  blockers?: Box[]; // objects that dim the direct sound when they sit between source and listener
};

export type Arrival = {
  image: Vec3;
  order: number;
  distance: number;
  delay: number;
  reflection: Bands;
  gains: Bands;
  direction: Vec3;
  points: Vec3[];
  hitSurfaces: SurfaceId[];
  hitFixes: boolean;
  hitAbsorption: number[]; // mean absorption over the bands at each bounce, in travel order
  hitFix: boolean[]; // whether each bounce landed on a rug or panel, in travel order
};

type Axis = { key: 'x' | 'y' | 'z'; size: (d: Dims) => number; low: SurfaceId; high: SurfaceId };

const AXES: Axis[] = [
  { key: 'x', size: (d) => d.length, low: 'wallX0', high: 'wallX1' },
  { key: 'y', size: (d) => d.height, low: 'floor', high: 'ceiling' },
  { key: 'z', size: (d) => d.width, low: 'wallZ0', high: 'wallZ1' },
];

/** Position of image n along one axis for a source at s in a room of the given size. */
export function imageCoord(n: number, s: number, size: number): number {
  return n * size + (n % 2 === 0 ? s : size - s);
}

/** Map a coordinate in unfolded image space back into [0, size]. */
function fold(c: number, size: number): number {
  const period = 2 * size;
  const m = ((c % period) + period) % period;
  return m <= size ? m : period - m;
}

export function computeImageSources(input: ImageSourceInput): Arrival[] {
  const { maxOrder } = input;
  const arrivals: Arrival[] = [];
  for (let nx = -maxOrder; nx <= maxOrder; nx++) {
    const ry = maxOrder - Math.abs(nx);
    for (let ny = -ry; ny <= ry; ny++) {
      const rz = ry - Math.abs(ny);
      for (let nz = -rz; nz <= rz; nz++) arrivals.push(trace(input, [nx, ny, nz]));
    }
  }
  return arrivals;
}

function trace(input: ImageSourceInput, n: [number, number, number]): Arrival {
  const { dims, source, listener, lookup, air = AIR_M } = input;
  const image: Vec3 = {
    x: imageCoord(n[0], source.x, dims.length),
    y: imageCoord(n[1], source.y, dims.height),
    z: imageCoord(n[2], source.z, dims.width),
  };
  const dir: Vec3 = { x: listener.x - image.x, y: listener.y - image.y, z: listener.z - image.z };

  // Each crossing of a plane k·size on some axis is one bounce. t = 0 at the image (source side), 1 at the listener.
  const crossings: { t: number; axis: Axis; surface: SurfaceId }[] = [];
  AXES.forEach((axis, i) => {
    const a = image[axis.key];
    const r = listener[axis.key];
    const size = axis.size(dims);
    for (let j = 0; j < Math.abs(n[i]); j++) {
      const k = n[i] > 0 ? j + 1 : -j;
      const isLow = ((k % 2) + 2) % 2 === 0;
      crossings.push({ t: (k * size - a) / (r - a), axis, surface: isLow ? axis.low : axis.high });
    }
  });
  crossings.sort((p, q) => p.t - q.t);

  const reflection = new Array<number>(NUM_BANDS).fill(1);
  const hits: Vec3[] = [];
  const hitSurfaces: SurfaceId[] = [];
  const hitAbsorption: number[] = [];
  const hitFix: boolean[] = [];
  let hitFixes = false;
  for (const c of crossings) {
    const p: Vec3 = {
      x: fold(image.x + c.t * dir.x, dims.length),
      y: fold(image.y + c.t * dir.y, dims.height),
      z: fold(image.z + c.t * dir.z, dims.width),
    };
    p[c.axis.key] = c.surface === c.axis.low ? 0 : c.axis.size(dims); // snap onto the wall exactly
    const { alpha, fix } = lookup(c.surface, p);
    for (let b = 0; b < NUM_BANDS; b++) reflection[b] *= Math.sqrt(Math.max(0, 1 - alpha[b]));
    hitFixes ||= fix;
    hits.push(p);
    hitSurfaces.push(c.surface);
    hitAbsorption.push(alpha.reduce((sum, a) => sum + a, 0) / alpha.length);
    hitFix.push(fix);
  }

  const order = Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]);
  if (order === 0 && input.blockers?.some((box) => segmentHitsBox(source, listener, box))) {
    for (let b = 0; b < NUM_BANDS; b++) reflection[b] *= OCCLUSION_GAIN[b];
  }

  const distance = Math.hypot(dir.x, dir.y, dir.z);
  return {
    image,
    order,
    distance,
    delay: distance / SPEED_OF_SOUND,
    reflection,
    gains: reflection.map((r, b) => (r * Math.exp((-air[b] * distance) / 2)) / distance),
    direction: {
      x: (image.x - listener.x) / distance,
      y: (image.y - listener.y) / distance,
      z: (image.z - listener.z) / distance,
    },
    points: [source, ...hits, listener],
    hitSurfaces,
    hitFixes,
    hitAbsorption,
    hitFix,
  };
}

export const pathEnergy = (a: Arrival) => a.gains.reduce((sum, g) => sum + g * g, 0) / a.gains.length;
