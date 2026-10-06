import { describe, expect, it } from 'vitest';
import { fft, nextPow2 } from '@/lib/acoustics/dsp';
import { normalizeLoudness } from '@/lib/acoustics/loudness';
import { simulateRoom } from '@/lib/acoustics/simulate';
import { DEMO_ROOM } from '@/lib/room/demoRoom';
import { CLIP_SECONDS, DEMO_CLIPS, synthClip } from './demoClips';

const RATE = 48000;
const OCTAVES = [125, 250, 500, 1000, 2000, 4000, 8000];

function spectrum(samples: Float32Array, size: number): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(samples);
  fft(re, im);
  return { re, im };
}

/** Power in each octave band (fc/√2 to fc·√2), in dB, from one FFT of the whole clip. */
function octaveBandsDb(clip: Float32Array): number[] {
  const n = nextPow2(clip.length);
  const { re, im } = spectrum(clip, n);
  return OCTAVES.map((fc) => {
    let sum = 0;
    for (let k = 1; k < n / 2; k++) {
      const f = (k * RATE) / n;
      if (f >= fc / Math.SQRT2 && f < fc * Math.SQRT2) sum += re[k] * re[k] + im[k] * im[k];
    }
    return 10 * Math.log10(sum);
  });
}

const bandSpreadDb = (clip: Float32Array) => {
  const bands = octaveBandsDb(clip);
  const mean = bands.reduce((a, b) => a + b, 0) / bands.length;
  return Math.max(...bands.map((b) => Math.abs(b - mean)));
};

/** The standard A-weighting power gain at f. */
function aWeight(f: number): number {
  const f2 = f * f;
  const ra = (12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
  return ra * ra;
}

/** How much louder (dB, A-weighted) the clip is after the room's impulse response than dry. */
function roomMinusDryDb(clip: Float32Array, ir: { left: Float32Array; right: Float32Array }): number {
  const n = nextPow2(Math.max(clip.length, ir.left.length, ir.right.length));
  const x = spectrum(clip, n);
  const l = spectrum(ir.left, n);
  const r = spectrum(ir.right, n);
  let dry = 0;
  let wet = 0;
  for (let k = 1; k < n / 2; k++) {
    const w = aWeight((k * RATE) / n);
    const px = x.re[k] ** 2 + x.im[k] ** 2;
    const h = (l.re[k] ** 2 + l.im[k] ** 2 + (r.re[k] ** 2 + r.im[k] ** 2)) / 2;
    dry += w * px;
    wet += w * px * h;
  }
  return 10 * Math.log10(wet / dry);
}

const peakOf = (samples: Float32Array) => samples.reduce((peak, v) => Math.max(peak, Math.abs(v)), 0);
const energy = (samples: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += samples[i] * samples[i];
  return sum / (to - from);
};

describe('synthClip', () => {
  it('lists a drum loop and a guitar riff', () => {
    expect(DEMO_CLIPS.map((c) => c.id)).toEqual(['drums', 'guitar']);
  });

  for (const { id } of DEMO_CLIPS) {
    it(`makes ${id} the right length for the sample rate, at a safe level`, () => {
      for (const rate of [44100, 48000]) {
        const clip = synthClip(id, rate);
        expect(clip.length).toBe(Math.round(CLIP_SECONDS * rate));
        expect(peakOf(clip)).toBeCloseTo(0.8, 5);
        expect(clip.every(Number.isFinite)).toBe(true);
      }
    });

    it(`makes ${id} the same every time`, () => {
      expect(synthClip(id, 48000)).toEqual(synthClip(id, 48000));
    });

    it(`fills ${id} with sound from start to end`, () => {
      const clip = synthClip(id, 48000);
      const quarter = clip.length / 4;
      for (let q = 0; q < 4; q++) expect(energy(clip, Math.floor(q * quarter), Math.floor((q + 1) * quarter))).toBeGreaterThan(1e-4);
    });
  }

  it("carries the guitar's last pluck over the loop end, so the start of the loop rings at that note", () => {
    // The last pluck is G3 (196 Hz) at 4.5 s and rings 1.2 s: past the clip's end, so it wraps round onto the first 0.3 s.
    // Nothing else sounds at 196 Hz there (the first pluck is E3, 164.8 Hz; the low root has 82, 165 and 247 Hz).
    const clip = synthClip('guitar', 48000);
    const n = Math.round(0.3 * 48000);
    let sin = 0;
    let cos = 0;
    for (let i = 0; i < n; i++) {
      sin += clip[i] * Math.sin((2 * Math.PI * 196 * i) / 48000);
      cos += clip[i] * Math.cos((2 * Math.PI * 196 * i) / 48000);
    }
    const magnitude = Math.hypot(sin, cos) / n;
    expect(magnitude).toBeGreaterThan(0.005); // about 0.009 with the wrap, 0.002 without
  });

  it('makes two different clips', () => {
    expect(synthClip('drums', 48000)).not.toEqual(synthClip('guitar', 48000));
  });

  it('starts the drum loop on a hit, so a room has something to answer at once', () => {
    const clip = synthClip('drums', 48000);
    expect(energy(clip, 0, 2400)).toBeGreaterThan(energy(clip, 12000, 14400));
  });

  describe('sounds like music to the loudness match', () => {
    const ir = normalizeLoudness(simulateRoom(DEMO_ROOM, RATE).ir);
    for (const { id } of DEMO_CLIPS) {
      it(`keeps every octave band of ${id} within 6 dB of the mean (a near-pink spectrum)`, () => {
        const clip = synthClip(id, RATE);
        expect(bandSpreadDb(clip)).toBeLessThanOrEqual(6);
      });

      it(`plays ${id} through the demo bedroom within 3 dB of dry, A-weighted`, () => {
        const diff = roomMinusDryDb(synthClip(id, RATE), ir);
        expect(Math.abs(diff)).toBeLessThanOrEqual(3);
      });
    }
  });
});
