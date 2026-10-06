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

export const CROSSFADE_SECONDS = 0.05;

/** A one-sample silent IR, for a slot with nothing to play: the engine runs a convolver per slot, and this one costs nothing. */
export const silentIr = (sampleRate: number): StereoIr => ({ left: new Float32Array(1), right: new Float32Array(1), sampleRate });
