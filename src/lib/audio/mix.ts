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
