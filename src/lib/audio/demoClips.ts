import { createRng } from '@/lib/acoustics/dsp';

export type DemoClipId = 'drums' | 'guitar';
export const DEMO_CLIPS: { id: DemoClipId; label: string }[] = [
  { id: 'drums', label: 'Drum loop' },
  { id: 'guitar', label: 'Guitar riff' },
];

const BEAT = 0.6; // seconds: 100 beats a minute
const BEATS = 8; // two bars
export const CLIP_SECONDS = BEAT * BEATS;
const PEAK = 0.8;
const TAU = 2 * Math.PI;

/**
 * A built-in clip to play through a room: generated here, so it has no licence and nothing to download. Mono, the same
 * every time, and made to loop: a sound that rings past the end carries on from the start.
 */
export function synthClip(id: DemoClipId, sampleRate: number): Float32Array {
  const out = new Float32Array(Math.round(CLIP_SECONDS * sampleRate));
  if (id === 'drums') drums(out, sampleRate);
  else guitar(out, sampleRate);
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < out.length; i++) out[i] *= PEAK / peak;
  return out;
}

/** Add `voice(t)` for `seconds`, starting at `at` seconds, wrapping round the end of the loop. */
function add(out: Float32Array, sampleRate: number, at: number, seconds: number, voice: (t: number, i: number) => number): void {
  const start = Math.round(at * sampleRate);
  const n = Math.round(seconds * sampleRate);
  for (let i = 0; i < n; i++) out[(start + i) % out.length] += voice(i / sampleRate, i);
}

function drums(out: Float32Array, sampleRate: number): void {
  const rng = createRng(11);
  const noise = () => rng() * 2 - 1;
  const kick = (at: number) =>
    // A sine that drops from 120 Hz to 45 Hz: phase is the integral of the falling pitch.
    add(out, sampleRate, at, 0.3, (t) => Math.sin(TAU * (45 * t + (75 / 30) * (1 - Math.exp(-30 * t)))) * Math.exp(-9 * t));
  const snare = (at: number) =>
    add(out, sampleRate, at, 0.2, (t) => (0.7 * noise() + 0.4 * Math.sin(TAU * 185 * t)) * Math.exp(-22 * t) * 0.7);
  const hat = (at: number, level: number) => {
    let previous = 0;
    add(out, sampleRate, at, 0.05, (t) => {
      const n = noise();
      const bright = n - previous; // a first difference keeps only the top of the noise
      previous = n;
      return bright * Math.exp(-90 * t) * level;
    });
  };
  for (let beat = 0; beat < BEATS; beat++) {
    if (beat % 2 === 0) kick(beat * BEAT);
    else snare(beat * BEAT);
    hat(beat * BEAT, 0.25);
    hat((beat + 0.5) * BEAT, 0.18);
  }
  kick(5.5 * BEAT); // a push into the last bar's second half
}

function guitar(out: Float32Array, sampleRate: number): void {
  const rng = createRng(23);
  // E minor pentatonic, up and back, an eighth note each: E3 G3 B3 D4 E4 D4 B3 G3, twice.
  const notes = [164.81, 196.0, 246.94, 293.66, 329.63, 293.66, 246.94, 196.0];
  for (let step = 0; step < 16; step++) pluck(out, sampleRate, (step * BEAT) / 2, notes[step % notes.length], rng);
}

/** One plucked string (Karplus–Strong): a burst of noise going round a delay line that averages it away. */
function pluck(out: Float32Array, sampleRate: number, at: number, hz: number, rng: () => number): void {
  const period = Math.round(sampleRate / hz);
  const line = new Float32Array(period);
  for (let i = 0; i < period; i++) line[i] = rng() * 2 - 1;
  add(out, sampleRate, at, 1.2, (_, i) => {
    const slot = i % period;
    const value = line[slot];
    line[slot] = 0.996 * 0.5 * (value + line[(slot + 1) % period]);
    return value;
  });
}
