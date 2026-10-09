import { createRng } from '@/lib/acoustics/dsp';

/** The sounds made in code (spec 2026-10-08 §8.3), as mono samples. */

const tone = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);

function normalize(s: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of s) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < s.length; i++) s[i] *= peak / max;
  return s;
}

/** A 2 ms raised-cosine fade at both ends, so nothing starts or stops with a click. */
function edges(s: Float32Array, sampleRate: number): Float32Array {
  const n = Math.min(Math.floor(s.length / 2), Math.round(0.002 * sampleRate));
  for (let i = 0; i < n; i++) {
    const g = 0.5 * (1 - Math.cos((Math.PI * i) / n));
    s[i] *= g;
    s[s.length - 1 - i] *= g;
  }
  return s;
}

function make(seconds: number, sampleRate: number, peak: number, sample: (t: number, i: number) => number): Float32Array {
  const s = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < s.length; i++) s[i] = sample(i / sampleRate, i);
  return edges(normalize(s, peak), sampleRate);
}

/** A footstep: a short low-passed noise burst. */
export function footstep(sampleRate: number): Float32Array {
  const rng = createRng(7);
  const a = Math.exp((-2 * Math.PI * 600) / sampleRate);
  let y = 0;
  return make(0.08, sampleRate, 0.5, (t) => {
    y = a * y + (1 - a) * (rng() * 2 - 1);
    return y * Math.exp(-t / 0.02);
  });
}

/** A thud: a low thump with a fast decay. */
export const thud = (sampleRate: number) => make(0.25, sampleRate, 0.8, (t) => tone(70, t) * Math.exp(-t / 0.05));

/** The go-to pulse: a short soft tone around 880 Hz. */
export const pulse = (sampleRate: number) => make(0.12, sampleRate, 0.5, (t) => tone(880, t) * Math.min(1, t / 0.005) * Math.exp(-t / 0.03));

/** Arrival: two rising tones. */
export const chime = (sampleRate: number) =>
  make(0.6, sampleRate, 0.6, (t) => tone(660, t) * Math.exp(-t / 0.12) + (t >= 0.15 ? tone(990, t - 0.15) * Math.exp(-(t - 0.15) / 0.15) : 0));
