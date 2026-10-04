import { NUM_BANDS } from './bands';

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. The inverse divides by n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of two');

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const bRe = re[b] * cRe - im[b] * cIm;
        const bIm = re[b] * cIm + im[b] * cRe;
        re[b] = re[a] - bRe;
        im[b] = im[a] - bIm;
        re[a] += bRe;
        im[a] += bIm;
        const next = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = next;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** mulberry32: small, fast, seedable uniform RNG in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box–Muller). */
export function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const CROSSOVERS = [177, 354, 707, 1414, 2828];
const HALF_WIDTH_OCTAVES = 0.25;

/** Share of frequency f that falls below a crossover at fc: 1 well below, 0 well above, raised cosine between. */
function lowShare(f: number, fc: number): number {
  if (f <= 0) return 1;
  const x = Math.log2(f / fc);
  if (x <= -HALF_WIDTH_OCTAVES) return 1;
  if (x >= HALF_WIDTH_OCTAVES) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * (x + HALF_WIDTH_OCTAVES)) / (2 * HALF_WIDTH_OCTAVES)));
}

export function bandMasks(fftSize: number, sampleRate: number): Float64Array[] {
  const half = fftSize / 2;
  const masks = Array.from({ length: NUM_BANDS }, () => new Float64Array(half + 1));
  for (let k = 0; k <= half; k++) {
    const f = (k * sampleRate) / fftSize;
    let below = 0;
    for (let b = 0; b < NUM_BANDS - 1; b++) {
      const share = lowShare(f, CROSSOVERS[b]);
      masks[b][k] = share - below;
      below = share;
    }
    masks[NUM_BANDS - 1][k] = 1 - below;
  }
  return masks;
}

export function applyBandMasks(bands: Float64Array[], masks: Float64Array[]): Float64Array {
  const n = bands[0].length;
  const half = n / 2;
  const sumRe = new Float64Array(n);
  const sumIm = new Float64Array(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  bands.forEach((signal, b) => {
    re.set(signal);
    im.fill(0);
    fft(re, im);
    const mask = masks[b];
    for (let k = 0; k < n; k++) {
      const g = mask[k <= half ? k : n - k];
      sumRe[k] += re[k] * g;
      sumIm[k] += im[k] * g;
    }
  });
  fft(sumRe, sumIm, true);
  return sumRe;
}

const noiseCache = new Map<string, Float32Array[]>();

export function bandNoise(length: number, sampleRate: number, seed: number): Float32Array[] {
  const cacheKey = `${length}:${sampleRate}:${seed}`;
  const cached = noiseCache.get(cacheKey);
  if (cached) return cached;

  const n = nextPow2(length);
  const rng = createRng(seed);
  const specRe = new Float64Array(n);
  const specIm = new Float64Array(n);
  for (let i = 0; i < length; i++) specRe[i] = gaussian(rng);
  fft(specRe, specIm);

  const half = n / 2;
  const result = bandMasks(n, sampleRate).map((mask) => {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const g = mask[k <= half ? k : n - k];
      re[k] = specRe[k] * g;
      im[k] = specIm[k] * g;
    }
    fft(re, im, true);
    return Float32Array.from(re.subarray(0, length));
  });
  noiseCache.set(cacheKey, result);
  return result;
}
