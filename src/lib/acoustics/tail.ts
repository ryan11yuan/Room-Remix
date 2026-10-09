import { NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';
import { bandNoise } from './dsp';

const EARLY_TAIL_RAMP_SECONDS = 0.005;
const NOISE_SEED = { left: 1, right: 2 };
const LN_1000 = 6.907755; // 60 dB decay in nepers

/**
 * Add a diffuse late tail from `transition` on: per-band decaying noise, independent left and right, at the level a room
 * of this volume gives. Moved from the old acoustics engine for the room echo (spec 2026-10-08 §8.4).
 */
export function addTail(
  rt: Bands,
  volume: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const sigma0 = Math.sqrt((4 * Math.PI * SPEED_OF_SOUND) / (volume * sampleRate));
  const start = Math.floor(transition * sampleRate);
  const fade = Math.max(1, Math.round(EARLY_TAIL_RAMP_SECONDS * sampleRate));

  for (const [out, seed] of [
    [left, NOISE_SEED.left],
    [right, NOISE_SEED.right],
  ] as const) {
    const noise = bandNoise(out.length, sampleRate, seed);
    for (let b = 0; b < NUM_BANDS; b++) {
      const decay = Math.exp(-LN_1000 / (rt[b] * sampleRate));
      let envelope = sigma0 * Math.exp((-LN_1000 * start) / (rt[b] * sampleRate));
      const band = noise[b];
      for (let i = start; i < out.length; i++) {
        const ramp = i - start < fade ? 0.5 * (1 - Math.cos((Math.PI * (i - start)) / fade)) : 1;
        out[i] += band[i] * envelope * ramp;
        envelope *= decay;
      }
    }
  }
}
