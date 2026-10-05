# Room Remix: Plan 5b, Presets and Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A visitor lands on the home page, presses Play, and hears a built-in clip in a cathedral, a parking garage, or a demo bedroom, with a Dry ↔ In the space switch, before entering anything. The room page can play the same built-in clips, so nobody needs a song file to try it. An About page credits the recordings and states that nothing leaves the device.

**Architecture:**
- **Recorded spaces:** two impulse-response files in `public/ir/`, fetched on first use and decoded by the browser. A pure function, `prepareIr`, makes each one fit the engine's contract (trimmed, capped, 40 Hz speaker roll-off, loudness-matched).
- **Built-in clips:** generated in code (`demoClips.ts`), so they have no licence and no download.
- **Engine:** gains `loadClip` (play generated samples) and `decodeIr` (decode a fetched file).
- **Landing page:** one client component, `ListenDemo`, with three tabs. The presets use `prepareIr`; the demo bedroom uses the existing simulation worker on a fixed `RoomState`.
- **About page:** static.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, Web Audio, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-room-remix-design.md`: §2 (presets, demo room), §6 (demo clip, presets through the same graph), §8 ("Presets: no geometry…"), §10 (Landing; About / Privacy), §13 (licensing). Also `docs/superpowers/plans/2026-10-05-room-remix-plan-5a-followups.md` ("For Plan 5b") and the Plan 1 and 3 follow-ups on presets.

**Decided here (where the spec left room, or this plan differs):**
- **Cathedral:** York Minster, from OpenAIR, CC BY 4.0 (Audiolab, University of York; Damian T. Murphy). The original stereo WAV ships as it is (2.9 MB, loaded only when that tab is played).
- **Parking garage:** a recording by djericmark on Freesound (sound 732453), CC0. The spec names OpenAIR only, but OpenAIR has no car park; CC0 allows everything CC BY does. The file is Freesound's public high-quality MP3 preview (58 KB), because the original WAV needs a login. Swapping in the WAV later is a one-file change.
- **Preset length:** recordings are capped at 6 s with a 0.1 s fade. Simulated rooms keep their 4 s cap and gain the same fade when the cap cuts them.
- **IR preparation runs on the main thread,** once per preset, after the file is decoded. It is two large FFTs; a "Loading…" label shows meanwhile.
- **Built-in clips are generated:** a drum loop and a plucked riff. Recorded music or voice can be added later with a credit.
- **Demo bedroom:** a box with placeholder size and materials until the author's measurements arrive (spec §14). "Explore it in 3D" opens it on the room page through a share link, which imports it as a room.
- **No demo scan yet.** Loading a scan from a static file waits until the scan exists.
- **Illustrations** for the presets are simple inline drawings. The photos in the OpenAIR download aren't used; their licence isn't stated separately.

## Global Constraints

- Static export only. **No user data leaves the device.** The only network requests are for the site's own files.
- Imports:
  - `src/lib/acoustics/**`, `src/lib/room/**` and `src/lib/audio/demoClips.ts` don't touch the DOM and are tested in Node.
  - Spark is imported only by `src/lib/scene/SplatLayer.ts`. Lint enforces this.
- React (lint enforces these): no synchronous `setState` in effect bodies; no ref reads during render; no browser APIs during render or prerender.
- Next.js 16 may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.
- The engine expects IRs that are already 40 Hz high-passed and loudness-matched (`highPass`, `normalizeLoudness`).
- Licences: only CC BY or CC0 material ships, and every third-party file is credited on the About page.
- Shell is Windows PowerShell. Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, passed as a second `-m`.

## Review Focus

1. **Loudness.** A preset must play about as loud as Dry, like the simulated rooms. A cathedral that is 10 dB louder or quieter than Dry spoils the comparison. Tests: Task 1 (pink gain of a prepared IR is 1).
2. **A recording with silence before the sound** (an MP3's encoder padding, or a gap before the direct sound). The preset must not add a delay. Tests: Task 1 (onset trimmed).
3. **Switching tabs or clips while playing,** or before a file has loaded. The sound must follow the last choice; a slow file must not overwrite a newer choice. Task 4 browser check.
4. **A file that fails to load or decode** (offline, blocked). The tab says so and the others still work. Task 4 browser check.
5. **Phones:** the first tap must start sound (the audio context starts on a tap), and leaving the page stops it. Task 4 browser check; the author's phone.

---

## File Structure

```
public/ir/
  york-minster.wav       NEW  OpenAIR, CC BY 4.0
  parking-garage.mp3     NEW  Freesound 732453, CC0
src/lib/acoustics/
  dsp.ts                 MOD  fadeTail
  simulate.ts            MOD  fade the tail when the 4 s cap cuts it
  presetIr.ts            NEW  prepareIr
  presetIr.test.ts       NEW
src/lib/audio/
  demoClips.ts           NEW  DEMO_CLIPS, synthClip
  demoClips.test.ts      NEW
  engine.ts              MOD  loadClip, decodeIr
src/lib/presets/
  presets.ts             NEW  the two recorded spaces and their credits
src/lib/room/
  demoRoom.ts            NEW  DEMO_ROOM
  demoRoom.test.ts       NEW
src/components/
  Player.tsx             MOD  built-in clip buttons
  ListenDemo.tsx         NEW  the landing page's three-tab player
src/app/
  page.tsx               MOD  landing page
  about/page.tsx         NEW  credits and privacy
```

---

### Task 1: Prepare a recorded impulse response

**Files:**
- Create: `src/lib/acoustics/presetIr.ts`, `src/lib/acoustics/presetIr.test.ts`
- Modify: `src/lib/acoustics/dsp.ts`, `src/lib/acoustics/dsp.test.ts`, `src/lib/acoustics/simulate.ts`, `src/lib/acoustics/simulate.test.ts`

**Interfaces:**
- Consumes: `highPass(signal, sampleRate, cutoffHz)` (in place) from `./dsp`; `normalizeLoudness(ir)`, `pinkGain(channel, sampleRate)` from `./loudness`; `SPEAKER_LOW_CUT_HZ`, `MAX_IR_SECONDS`, `StereoIr` from `./simulate`.
- Produces:
  - `dsp.ts`: `fadeTail(signal: Float32Array, sampleRate: number, seconds: number): void`. Raised-cosine fade of the last `seconds`, in place.
  - `presetIr.ts`: `PRESET_MAX_SECONDS = 6`, `TAIL_FADE_SECONDS = 0.1`, `prepareIr(ir: StereoIr, maxSeconds?: number): StereoIr`. It throws `Error('This recording is silent.')` for an all-zero input.
  - `simulate.ts`: when the 4 s cap shortens an IR, its last 0.1 s fades out.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/presetIr.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createRng, gaussian } from './dsp';
import { pinkGain } from './loudness';
import { PRESET_MAX_SECONDS, prepareIr, TAIL_FADE_SECONDS } from './presetIr';
import type { StereoIr } from './simulate';

const RATE = 48000;

/** A decaying-noise "recording": `lead` seconds of silence, then a click and a reverb tail of `seconds`. */
function recording(seconds: number, lead = 0, scale = 1): StereoIr {
  const rng = createRng(3);
  const start = Math.round(lead * RATE);
  const length = start + Math.round(seconds * RATE);
  const make = () => {
    const channel = new Float32Array(length);
    channel[start] = scale;
    for (let i = start + 1; i < length; i++) channel[i] = scale * 0.2 * gaussian(rng) * Math.exp((-3 * (i - start)) / RATE);
    return channel;
  };
  return { left: make(), right: make(), sampleRate: RATE };
}
const firstLoud = (channel: Float32Array) => {
  let peak = 0;
  for (const v of channel) peak = Math.max(peak, Math.abs(v));
  return channel.findIndex((v) => Math.abs(v) >= peak * 0.5);
};

describe('prepareIr', () => {
  it('plays as loud as dry, whatever level the recording was made at', () => {
    for (const scale of [0.01, 1, 30]) {
      const ir = prepareIr(recording(2, 0, scale));
      const gain = (pinkGain(ir.left, RATE) + pinkGain(ir.right, RATE)) / 2;
      expect(gain).toBeCloseTo(1, 6);
    }
  });

  it('removes silence before the sound, keeping about a millisecond', () => {
    const ir = prepareIr(recording(1, 0.03)); // 30 ms of padding, as an MP3 has
    expect(firstLoud(ir.left)).toBeLessThanOrEqual(Math.round(0.002 * RATE));
    expect(ir.left.length).toBeLessThan(Math.round(1.01 * RATE));
  });

  it('caps a long recording and fades its end to silence', () => {
    const ir = prepareIr(recording(10));
    expect(ir.left.length).toBe(Math.round(PRESET_MAX_SECONDS * RATE));
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(ir.right[ir.right.length - 1])).toBeLessThan(1e-6);
  });

  it('leaves the end of a short recording alone', () => {
    const source = recording(1);
    const ir = prepareIr(source);
    expect(ir.left.length).toBe(source.left.length);
    const tail = Math.round(TAIL_FADE_SECONDS * RATE);
    let energy = 0;
    for (let i = ir.left.length - tail; i < ir.left.length; i++) energy += ir.left[i] * ir.left[i];
    expect(energy).toBeGreaterThan(0); // not faded: the recording ended by itself
  });

  it('does not change the recording it was given', () => {
    const source = recording(1, 0.01);
    const copy = Float32Array.from(source.left);
    prepareIr(source);
    expect(source.left).toEqual(copy);
  });

  it('refuses a silent recording', () => {
    const silent: StereoIr = { left: new Float32Array(1000), right: new Float32Array(1000), sampleRate: RATE };
    expect(() => prepareIr(silent)).toThrow('This recording is silent.');
  });
});
```

In `src/lib/acoustics/dsp.test.ts`, add `fadeTail` to the import from `./dsp` and add:
```ts
describe('fadeTail', () => {
  it('fades the last stretch to zero and leaves the rest alone', () => {
    const signal = new Float32Array(1000).fill(1);
    fadeTail(signal, 1000, 0.1); // the last 100 samples
    expect(signal[899]).toBe(1);
    expect(signal[950]).toBeGreaterThan(0.3);
    expect(signal[950]).toBeLessThan(0.7);
    expect(signal[999]).toBeCloseTo(0, 6);
    for (let i = 901; i < 1000; i++) expect(signal[i]).toBeLessThanOrEqual(signal[i - 1]);
  });

  it('fades the whole of a signal shorter than the fade', () => {
    const signal = new Float32Array(10).fill(1);
    fadeTail(signal, 1000, 0.1);
    expect(signal[9]).toBeCloseTo(0, 6);
    expect(signal[0]).toBeLessThan(1);
  });
});
```

In `src/lib/acoustics/simulate.test.ts`, add this test. Read the file first and use its existing helpers and imports for the default room; `MAX_IR_SECONDS` comes from `./simulate`:
```ts
  it('fades out an impulse response that the length cap cut short', () => {
    // A bare tiled room rings for longer than the cap.
    const room = defaultRoom();
    const bare: RoomState = {
      ...room,
      dims: { length: 12, width: 9, height: 4 },
      furnishing: 'bare',
      surfaces: { floor: 'tile', ceiling: 'concrete', wallX0: 'concrete', wallX1: 'concrete', wallZ0: 'concrete', wallZ1: 'concrete' },
      speaker: { x: 2, y: 1.2, z: 3 },
      listener: { x: 8, y: 1.2, z: 5, yaw: 'faceSpeaker' },
    };
    const { ir } = simulateRoom(bare, 48000);
    expect(ir.left.length).toBe(Math.ceil(MAX_IR_SECONDS * 48000));
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-6);
    expect(Math.abs(ir.right[ir.right.length - 1])).toBeLessThan(1e-6);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/acoustics/presetIr.test.ts src/lib/acoustics/dsp.test.ts src/lib/acoustics/simulate.test.ts`
Expected: FAIL. `./presetIr` and `fadeTail` don't exist, and the capped IR's last sample isn't near zero.

- [ ] **Step 3: Implement**

In `src/lib/acoustics/dsp.ts`, add after `highPass`:
```ts
/** Fade the last `seconds` of a signal to silence with a raised cosine, in place, so a cut-off tail doesn't click. */
export function fadeTail(signal: Float32Array, sampleRate: number, seconds: number): void {
  const n = Math.min(signal.length, Math.round(seconds * sampleRate));
  const start = signal.length - n;
  for (let i = 0; i < n; i++) signal[start + i] *= 0.5 * (1 + Math.cos((Math.PI * (i + 1)) / n));
}
```

In `src/lib/acoustics/simulate.ts`:
- Import `fadeTail` from `./dsp` with the other dsp imports.
- Add `export const TAIL_FADE_SECONDS = 0.1;` under `MAX_IR_SECONDS`.
- In `simulateRoom`, right after the two `highPass` calls, add:
```ts
  if (seconds === MAX_IR_SECONDS) {
    // The cap cut a tail that was still ringing: fade it, or the cut is heard as a click.
    fadeTail(left, sampleRate, TAIL_FADE_SECONDS);
    fadeTail(right, sampleRate, TAIL_FADE_SECONDS);
  }
```

Create `src/lib/acoustics/presetIr.ts`:
```ts
import { fadeTail, highPass } from './dsp';
import { normalizeLoudness } from './loudness';
import { SPEAKER_LOW_CUT_HZ, TAIL_FADE_SECONDS, type StereoIr } from './simulate';

export { TAIL_FADE_SECONDS };
/** Recorded spaces ring far longer than a room; this much is kept. Long tails cost phones a lot to convolve. */
export const PRESET_MAX_SECONDS = 6;
const ONSET_LEVEL = 0.02; // the sound starts where a channel first reaches this fraction of the peak
const LEAD_SECONDS = 0.001; // kept before the onset, so its rise isn't cut

/**
 * Make a recorded impulse response fit the player, as simulated rooms already do: no silence before the sound, at most
 * `maxSeconds` long (faded if cut), the same 40 Hz speaker roll-off, and loudness-matched to dry. Returns new arrays.
 */
export function prepareIr(ir: StereoIr, maxSeconds = PRESET_MAX_SECONDS): StereoIr {
  const { sampleRate } = ir;
  const total = Math.min(ir.left.length, ir.right.length);
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(ir.left[i]), Math.abs(ir.right[i]));
  if (!(peak > 0)) throw new Error('This recording is silent.');
  let onset = 0;
  while (Math.abs(ir.left[onset]) < peak * ONSET_LEVEL && Math.abs(ir.right[onset]) < peak * ONSET_LEVEL) onset++;
  const start = Math.max(0, onset - Math.round(LEAD_SECONDS * sampleRate));
  const end = Math.min(total, start + Math.round(maxSeconds * sampleRate));
  const left = ir.left.slice(start, end);
  const right = ir.right.slice(start, end);
  highPass(left, sampleRate, SPEAKER_LOW_CUT_HZ);
  highPass(right, sampleRate, SPEAKER_LOW_CUT_HZ);
  if (end < total) {
    fadeTail(left, sampleRate, TAIL_FADE_SECONDS);
    fadeTail(right, sampleRate, TAIL_FADE_SECONDS);
  }
  return normalizeLoudness({ left, right, sampleRate });
}
```

- [ ] **Step 4: Run the tests, check and commit**

Run `npx vitest run src/lib/acoustics` (PASS), then `npm test`, `npx tsc --noEmit` and `npm run lint`.
```powershell
git add src/lib/acoustics
git commit -m "feat: prepare recorded impulse responses for the player; fade tails the length cap cuts" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Built-in clips and the engine's new inputs

**Files:**
- Create: `src/lib/audio/demoClips.ts`, `src/lib/audio/demoClips.test.ts`
- Modify: `src/lib/audio/engine.ts`

**Interfaces:**
- Consumes: `createRng(seed)` from `@/lib/acoustics/dsp`; `StereoIr` from `@/lib/acoustics/simulate`.
- Produces:
  - `demoClips.ts`:
    ```ts
    type DemoClipId = 'drums' | 'guitar';
    DEMO_CLIPS: { id: DemoClipId; label: string }[]   // 'Drum loop', 'Guitar riff'
    CLIP_SECONDS = 4.8
    synthClip(id: DemoClipId, sampleRate: number): Float32Array   // mono, loops cleanly, peak 0.8, same every time
    ```
  - `AudioEngine`:
    - `loadClip(samples: Float32Array, sampleRate: number): void`: the clip becomes the song (paused, at its start).
    - `decodeIr(bytes: ArrayBuffer): Promise<StereoIr>`: decodes an audio file at the context's rate; a mono file gives the same channel twice.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/audio/demoClips.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CLIP_SECONDS, DEMO_CLIPS, synthClip } from './demoClips';

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

  it('makes two different clips', () => {
    expect(synthClip('drums', 48000)).not.toEqual(synthClip('guitar', 48000));
  });

  it('starts the drum loop on a hit, so a room has something to answer at once', () => {
    const clip = synthClip('drums', 48000);
    expect(energy(clip, 0, 2400)).toBeGreaterThan(energy(clip, 12000, 14400));
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/audio/demoClips.test.ts`
Expected: FAIL. Vitest can't resolve `./demoClips`.

- [ ] **Step 3: Implement the clips**

Create `src/lib/audio/demoClips.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/audio/demoClips.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: The engine's new inputs**

In `src/lib/audio/engine.ts`, add these two methods after `loadSong`:
```ts
  /** Use generated samples (a built-in clip) as the song. `sampleRate` is the rate they were generated at. */
  loadClip(samples: Float32Array, sampleRate: number): void {
    const clip = this.ctx.createBuffer(1, samples.length, sampleRate);
    clip.getChannelData(0).set(samples);
    this.pause();
    this.offset = 0;
    this.song = clip;
  }

  /** Decode a fetched recording of a space at this context's sample rate. A mono file gives the same channel twice. */
  async decodeIr(bytes: ArrayBuffer): Promise<StereoIr> {
    const decoded = await this.ctx.decodeAudioData(bytes);
    const left = Float32Array.from(decoded.getChannelData(0));
    const right = decoded.numberOfChannels > 1 ? Float32Array.from(decoded.getChannelData(1)) : Float32Array.from(left);
    return { left, right, sampleRate: decoded.sampleRate };
  }
```
The engine has no unit tests (it needs Web Audio); the controller checks these in the browser in Task 4.

- [ ] **Step 6: Check and commit**

Run `npm test`, `npx tsc --noEmit` and `npm run lint`.
```powershell
git add src/lib/audio
git commit -m "feat: built-in drum and guitar clips; the engine plays generated clips and decodes recorded spaces" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The recorded spaces, the demo room, and clips on the room page

**Files:**
- Create: `public/ir/york-minster.wav`, `public/ir/parking-garage.mp3`, `src/lib/presets/presets.ts`, `src/lib/presets/presets.test.ts`, `src/lib/room/demoRoom.ts`, `src/lib/room/demoRoom.test.ts`
- Modify: `src/components/Player.tsx`

**Interfaces:**
- Consumes: `DEMO_CLIPS`, `synthClip`, `DemoClipId` (Task 2); `AudioEngine.loadClip` (Task 2); `validateRoom`; `isSavable` from `@/lib/room/rooms`.
- Produces:
  - `presets.ts`:
    ```ts
    type PresetId = 'cathedral' | 'garage';
    type Preset = {
      id: PresetId;
      label: string;        // the tab: 'Cathedral', 'Parking garage'
      place: string;        // 'York Minster, England' / 'A parking garage'
      blurb: string;        // one sentence about what you will hear
      file: string;         // '/ir/york-minster.wav'
      credit: { text: string; licence: string; licenceUrl: string; sourceUrl: string };
    };
    PRESETS: Preset[]
    ```
  - `demoRoom.ts`: `DEMO_ROOM: RoomState`, named "Demo bedroom".
  - `Player`: under the song picker, a row "Or try a built-in clip:" with one button per `DEMO_CLIPS` entry.

- [ ] **Step 1: Add the two recordings**

Copy these files into the repo. They were downloaded and checked by the controller:
- `C:\Users\ryany\AppData\Local\Temp\claude\c--Users-ryany-OneDrive-Desktop-Room-Remix\bd9e447d-62e3-4e89-9619-b49616226d30\scratchpad\york-minster\york-minster\stereo\minster1_000_ortf_48k.wav` → `public/ir/york-minster.wav` (2,880,044 bytes)
- `C:\Users\ryany\AppData\Local\Temp\claude\c--Users-ryany-OneDrive-Desktop-Room-Remix\bd9e447d-62e3-4e89-9619-b49616226d30\scratchpad\garage-preview.mp3` → `public/ir/parking-garage.mp3` (58,200 bytes)

Copy nothing else from those folders.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/presets/presets.test.ts`:
```ts
import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';

describe('PRESETS', () => {
  it('offers the cathedral and the parking garage', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['cathedral', 'garage']);
  });

  it('points every preset at a file that ships with the site', () => {
    for (const preset of PRESETS) {
      expect(preset.file.startsWith('/ir/')).toBe(true);
      expect(existsSync(`public${preset.file}`)).toBe(true);
    }
  });

  it('credits every recording under a licence that allows commercial use', () => {
    for (const preset of PRESETS) {
      expect(preset.credit.text.length).toBeGreaterThan(10);
      expect(['CC BY 4.0', 'CC0 1.0']).toContain(preset.credit.licence);
      expect(preset.credit.licenceUrl.startsWith('https://creativecommons.org/')).toBe(true);
      expect(preset.credit.sourceUrl.startsWith('https://')).toBe(true);
    }
  });
});
```

Create `src/lib/room/demoRoom.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DEMO_ROOM } from './demoRoom';
import { isSavable } from './rooms';
import { validateRoom } from './roomState';

describe('DEMO_ROOM', () => {
  it('is a valid room that can be saved and shared', () => {
    expect(validateRoom(DEMO_ROOM)).toEqual([]);
    expect(isSavable(DEMO_ROOM)).toBe(true);
    expect(DEMO_ROOM.name).toBe('Demo bedroom');
  });
});
```

Run `npx vitest run src/lib/presets src/lib/room/demoRoom.test.ts`. Expected: FAIL, the modules don't exist.

- [ ] **Step 3: The data**

Create `src/lib/presets/presets.ts`:
```ts
export type PresetId = 'cathedral' | 'garage';

/** A real space, recorded: its impulse response plays through the same player as a simulated room. */
export type Preset = {
  id: PresetId;
  label: string;
  place: string;
  blurb: string;
  /** The recording, served with the site. */
  file: string;
  credit: { text: string; licence: string; licenceUrl: string; sourceUrl: string };
};

export const PRESETS: Preset[] = [
  {
    id: 'cathedral',
    label: 'Cathedral',
    place: 'York Minster, England',
    blurb: 'One of the largest Gothic cathedrals in Europe. Sound hangs in the air for seconds.',
    file: '/ir/york-minster.wav',
    credit: {
      text: 'York Minster impulse response by Audiolab, University of York (Damian T. Murphy), from the OpenAIR library, www.openairlib.net.',
      licence: 'CC BY 4.0',
      licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sourceUrl: 'https://www.openairlib.net/',
    },
  },
  {
    id: 'garage',
    label: 'Parking garage',
    place: 'A concrete parking garage',
    blurb: 'Hard concrete all round: a short, loud, slappy echo.',
    file: '/ir/parking-garage.mp3',
    credit: {
      text: 'Parking garage impulse response by djericmark, from Freesound (sound 732453).',
      licence: 'CC0 1.0',
      licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      sourceUrl: 'https://freesound.org/people/djericmark/sounds/732453/',
    },
  },
];
```

Create `src/lib/room/demoRoom.ts`:
```ts
import type { RoomState } from './types';

/**
 * The demo room on the landing page. PLACEHOLDER size and materials: a typical carpeted bedroom, until the author's
 * measured bedroom (and its scan) replaces it.
 */
export const DEMO_ROOM: RoomState = {
  v: 1,
  name: 'Demo bedroom',
  dims: { length: 3.6, width: 3, height: 2.4 },
  surfaces: { floor: 'carpet', ceiling: 'plaster', wallX0: 'drywall', wallX1: 'drywall', wallZ0: 'drywall', wallZ1: 'curtains' },
  furnishing: 'full',
  speaker: { x: 0.5, y: 0.9, z: 1 },
  listener: { x: 2.6, y: 1.1, z: 1.7, yaw: 'faceSpeaker' },
  fixes: [],
  calibration: { factor: 1 },
};
```

Run the two test files again. Expected: PASS (3 + 1 tests).

- [ ] **Step 4: Built-in clips in the room page's player**

In `src/components/Player.tsx`:
1. Import `DEMO_CLIPS`, `synthClip` and `type DemoClipId` from `@/lib/audio/demoClips`.
2. `pickSong` creates the engine on first use. Move that first block into a helper inside the component, and use it from `pickSong`:
   ```tsx
   /** The engine starts at the first tap (browsers only allow sound after one). */
   function ensureEngine(): AudioEngine {
     if (!engineRef.current) {
       const engine = new AudioEngine();
       engineRef.current = engine;
       engine.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
       setEngineRate(engine.sampleRate);
       onSampleRate(engine.sampleRate); // the page re-simulates if this isn't the default rate
     }
     return engineRef.current;
   }
   ```
3. Add:
   ```tsx
   function pickClip(id: DemoClipId, label: string) {
     const engine = ensureEngine();
     setError(null);
     engine.loadClip(synthClip(id, engine.sampleRate), engine.sampleRate);
     setSongName(label);
     setPlaying(false);
   }
   ```
4. Under the song `<label>…</label>`, add:
   ```tsx
   <div className="flex flex-wrap items-center gap-2 text-sm">
     <span className="text-neutral-400">Or try a built-in clip:</span>
     {DEMO_CLIPS.map((clip) => (
       <button key={clip.id} onClick={() => pickClip(clip.id, clip.label)} className="rounded-md border border-neutral-700 px-2 py-1">
         {clip.label}
       </button>
     ))}
   </div>
   ```

- [ ] **Step 5: Check, build and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. Confirm `out/ir/york-minster.wav` and `out/ir/parking-garage.mp3` exist after the build.
```powershell
git add public/ir src/lib/presets src/lib/room/demoRoom.ts src/lib/room/demoRoom.test.ts src/components/Player.tsx
git commit -m "feat: cathedral and parking-garage recordings, a demo bedroom, and built-in clips on the room page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The landing page and the About page

**Files:**
- Create: `src/components/ListenDemo.tsx`, `src/app/about/page.tsx`
- Modify: `src/app/page.tsx`, `src/app/room/page.tsx` (a footer link only)

**Interfaces:**
- Consumes: `PRESETS`, `Preset` (Task 3); `DEMO_ROOM` (Task 3); `DEMO_CLIPS`, `synthClip` (Task 2); `AudioEngine` with `loadClip`, `decodeIr`, `setIrs`, `setMode`, `play`, `pause`, `sampleRate`, `playing`, `dispose`; `prepareIr` (Task 1); `AcousticsClient` from `@/lib/acoustics/client` (its `simulate(room, sampleRate)` resolves `{ now, withFixes }`, and `dispose()` ends it); `encodeRoom` from `@/lib/room/urlCodec`.
- Produces: the landing page at `/`, and `/about`.

There are no unit tests for this task: it is a page over tested parts. The controller checks it in the browser (Step 4).

- [ ] **Step 1: `ListenDemo`**

Create `src/components/ListenDemo.tsx`, a client component (`'use client'`). What it does:

- **Tabs:** `Cathedral`, `Parking garage`, `Demo bedroom` (the two `PRESETS` labels, then the demo room). Use `role="tablist"` / `role="tab"` with `aria-selected`, and a `role="tabpanel"`. The first tab is selected at the start.
- **Panel for a preset:**
  - a simple inline SVG drawing (a pointed arch for the cathedral, concrete pillars and a ramp for the garage; a few lines each, `aria-hidden`);
  - the place name, the blurb, and the caption "Recorded in a real space";
  - no rays and no what-ifs.
- **Panel for the demo bedroom:**
  - a small top-view drawing of `DEMO_ROOM` (a rectangle in the room's proportions, with a dot each for the speaker and the listener);
  - "A simulated bedroom, 3.6 × 3 × 2.4 m, carpeted and furnished.", built from `DEMO_ROOM.dims`;
  - a button **Explore it in 3D**: on click, `encodeRoom(DEMO_ROOM)` then `window.location.assign('/room#' + code)`. The room page imports it as a room.
- **Controls, shared by all tabs:**
  - a clip choice, one button per `DEMO_CLIPS` entry with `aria-pressed`; the drum loop is chosen at the start;
  - **Play** / **Pause**;
  - a two-way switch **Dry** / **In the space** (`aria-pressed` on each; "In the space" is on at the start);
  - the line "🎧 Use headphones. Room differences are hard to hear on phone speakers.";
  - a status line (`role="status"`, always mounted) showing "Loading the cathedral…" (or the garage, or "Simulating the bedroom…") while a space isn't ready, and the error text when one fails.
- **Audio behaviour:**
  - The engine is created at the first Play tap, not before (browsers need a tap). Keep it in a ref. Dispose it when the component unmounts; do the same for the `AcousticsClient`.
  - At the first tap, load the chosen clip with `engine.loadClip(synthClip(id, engine.sampleRate), engine.sampleRate)`.
  - A space's IR is loaded the first time its tab is played, then kept in a `Map` in a ref:
    - preset: `fetch(preset.file)` → `arrayBuffer()` → `engine.decodeIr(...)` → `prepareIr(...)`;
    - demo bedroom: `client.simulate(DEMO_ROOM, engine.sampleRate)` → `result.now.ir`.
  - When the selected space's IR is ready, call `engine.setIrs(ir, ir)` (a preset has no "with fixes") and `engine.setMode({ room: inTheSpace, fixes: false })`.
  - Play starts once the selected space is ready. Pressing Play while it loads shows the loading line and starts when it is ready.
  - Changing tab while playing keeps playing: the engine crossfades to the new space when its IR is ready.
  - Changing clip while playing loads the new clip and plays it from its start.
  - **Stale loads:** a load that finishes after the user has chosen another tab must not be applied. Keep the selected tab id in a ref and compare after each await.
  - **Failures:** a failed fetch, decode or simulation shows "Couldn't load this space. Check your connection and try again." in the status line, for that tab only. The other tabs still work, and choosing the failed tab again retries.
- **React rules:** no `setState` synchronously in an effect body; no ref reads during render. Do the loading from event handlers and async continuations.

- [ ] **Step 2: The pages**

Replace `src/app/page.tsx` with a server component that renders:
- the heading "Room Remix" and the existing intro sentence;
- `<ListenDemo />`;
- the **Try your room** link to `/room` (keep its current look);
- a footer with a link to `/about` ("About and privacy").

Create `src/app/about/page.tsx`, a server component, with `export const metadata = { title: 'About · Room Remix' }` and these sections:
- **What this is:** two or three sentences from the spec's §1: hear how your room sounds and what fixes would change, before you spend money.
- **Privacy:** "Nothing you add leaves your device. Songs, room scans and your rooms stay in this browser. There are no accounts and nothing is uploaded."
- **Credits:** one paragraph per `PRESETS` entry: its `credit.text`, the licence as a link to `licenceUrl`, and a "Source" link to `sourceUrl`. Then: "The built-in drum loop and guitar riff are generated in your browser."
- **How it works, briefly:** the room is modelled as an empty box with materials; furniture in a scan has no effect on the sound.
- a link back to the home page.

External links get `rel="noreferrer"`.

In `src/app/room/page.tsx`, add a small footer link to `/about` at the end of `<main>` (`text-xs text-neutral-500`).

- [ ] **Step 3: Check, build and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. The build must list `/`, `/about` and `/room` as static pages. Serve `out/` on port 4173, confirm `/`, `/about`, `/room` and `/ir/parking-garage.mp3` each return 200, then stop the server.
```powershell
git add src/components/ListenDemo.tsx src/app/page.tsx src/app/about/page.tsx src/app/room/page.tsx
git commit -m "feat: landing page with a cathedral, a parking garage and a demo bedroom to listen to; About and privacy page" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Browser walk-through (controller)**

Serve `out/` and open `/` in Chrome. Check:
- **First Play:** on the Cathedral tab, the loading line shows, then sound plays. Measure the output level: "In the space" and "Dry" are within about 2 dB of each other.
- **Each space:** the garage and the demo bedroom each play. Each is audibly different (the cathedral's tail is long).
- **Switching:** changing tab while playing keeps playing. Changing clip restarts with the new clip. Pause stops.
- **Stale loads:** click Cathedral then Parking garage quickly before either has loaded: the garage is what plays.
- **Failures:** with the file request blocked, the tab shows the error and another tab still works.
- **Demo room:** **Explore it in 3D** opens `/room` with "Demo bedroom" as a room, and the address bar is clean.
- **Room page:** a built-in clip plays through the room with no song file.
- **About:** the page shows both credits, with working licence links.
- **Phone width:** no horizontal scroll at 390 px.
- No console errors.
