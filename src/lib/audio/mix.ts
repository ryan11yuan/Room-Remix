import type { StereoIr } from '@/lib/acoustics/simulate';

export type ListenMode = { room: boolean; fixes: boolean };

export function modeGains(mode: ListenMode): { dry: number; now: number; withFixes: number } {
  if (!mode.room) return { dry: 1, now: 0, withFixes: 0 };
  return mode.fixes ? { dry: 0, now: 0, withFixes: 1 } : { dry: 0, now: 1, withFixes: 0 };
}

export function downmixToMono(channels: Float32Array[]): Float32Array {
  const out = new Float32Array(channels[0]?.length ?? 0);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] / channels.length;
  }
  return out;
}

/** Scale an IR so each ear carries unit energy on average, giving every listening mode matched loudness. */
export function normalizeIr(ir: StereoIr): StereoIr {
  let energy = 0;
  for (const v of ir.left) energy += v * v;
  for (const v of ir.right) energy += v * v;
  energy /= 2;
  if (energy === 0) return ir;
  const scale = 1 / Math.sqrt(energy);
  return { left: ir.left.map((v) => v * scale), right: ir.right.map((v) => v * scale), sampleRate: ir.sampleRate };
}

export const CROSSFADE_SECONDS = 0.05;
