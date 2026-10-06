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

// Voice levels, set so each clip's long-term spectrum is close to pink (equal energy per octave, as music has): the
// loudness match assumes that. Measured as the octave bands from 125 Hz to 8 kHz, all within about 4 dB of their mean.
const KICK = 0.35;
const SNARE_NOISE = 1.5;
const HAT = 3;
const LOW_ROOT = 0.6; // the guitar's low E

const FADE = 0.02; // each voice fades over its last 20 ms rather than being cut

/** Add `voice(t, i)` for `seconds`, starting at `at` seconds, wrapping round the end of the loop. The last 20 ms fade out. */
function add(out: Float32Array, sampleRate: number, at: number, seconds: number, voice: (t: number, i: number) => number): void {
  const start = Math.round(at * sampleRate);
  const n = Math.round(seconds * sampleRate);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    out[(start + i) % out.length] += voice(t, i) * Math.min(1, (seconds - t) / FADE);
  }
}

/** Noise whose power falls 3 dB an octave (equal energy per octave, like music): Paul Kellet's pink filter. */
function pinkNoise(rng: () => number): () => number {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = rng() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return pink * 0.25;
  };
}

function drums(out: Float32Array, sampleRate: number): void {
  const rng = createRng(11);
  const noise = () => rng() * 2 - 1;
  const snareNoise = pinkNoise(createRng(12));
  const kick = (at: number) =>
    // A sine that drops from 140 Hz to 60 Hz: phase is the integral of the falling pitch.
    add(out, sampleRate, at, 0.25, (t) => Math.sin(TAU * (60 * t + (80 / 35) * (1 - Math.exp(-35 * t)))) * Math.exp(-12 * t) * KICK);
  const snare = (at: number) =>
    add(out, sampleRate, at, 0.2, (t) => (SNARE_NOISE * snareNoise() + 0.3 * Math.sin(TAU * 185 * t)) * Math.exp(-20 * t));
  const hat = (at: number, level: number) => {
    let low = 0; // a one-pole high-pass at about 4 kHz: noise with the bottom taken off, but not the first difference's steep tilt
    const a = Math.exp((-TAU * 4000) / sampleRate);
    add(out, sampleRate, at, 0.05, (t) => {
      const n = noise();
      low = a * low + (1 - a) * n;
      return (n - low) * Math.exp(-70 * t) * level * HAT;
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
  // A low E under each bar, so the riff has something below the melody.
  for (const bar of [0, 4]) {
    add(out, sampleRate, bar * BEAT, 2.2, (t) => {
      const body = Math.sin(TAU * 82.41 * t) + 0.9 * Math.sin(TAU * 164.82 * t) + 0.3 * Math.sin(TAU * 247.23 * t);
      return body * Math.exp(-1.6 * t) * LOW_ROOT;
    });
  }
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
