import { fft, nextPow2 } from './dsp';
import type { StereoIr } from './simulate';

const LOW_HZ = 50;
const HIGH_HZ = 16000;
const MIN_FFT = 4096; // enough frequency resolution even for very short IRs

/** Mean of |H(f)|² weighted 1/f over 50 Hz–16 kHz: the IR's gain for pink-spectrum input such as music. */
export function pinkGain(channel: Float32Array, sampleRate: number): number {
  const n = nextPow2(Math.max(channel.length, MIN_FFT));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  re.set(channel);
  fft(re, im);
  const top = Math.min(HIGH_HZ, sampleRate / 2);
  let sum = 0;
  let weight = 0;
  for (let k = 1; k <= n / 2; k++) {
    const f = (k * sampleRate) / n;
    if (f < LOW_HZ || f > top) continue;
    sum += (re[k] * re[k] + im[k] * im[k]) / f;
    weight += 1 / f;
  }
  return weight > 0 ? sum / weight : 0;
}

/** Scale an IR so music plays at the same loudness through it as dry (|H| = 1), averaged over both ears. */
export function normalizeLoudness(ir: StereoIr): StereoIr {
  const gain = (pinkGain(ir.left, ir.sampleRate) + pinkGain(ir.right, ir.sampleRate)) / 2;
  if (!(gain > 0)) return ir;
  const scale = 1 / Math.sqrt(gain);
  return { left: ir.left.map((v) => v * scale), right: ir.right.map((v) => v * scale), sampleRate: ir.sampleRate };
}
