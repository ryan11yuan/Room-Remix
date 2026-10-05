# Room Remix — Plan 3: 3D Scene and Sound Rays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "type numbers to place things" with a 3D view of the room. The view draws translucent walls tinted by material. You can drag the speaker, listener and rug, tap a wall to place a panel, and watch sound rays pulse from the speaker to the listener, dimming where they hit a rug or panel. This plan also fixes Plan 1's loudness mismatch first, so the sound you judge alongside the view is fair.

**Architecture:** Plain three.js, no React wrapper library, behind a small imperative `RoomScene` class owned by a `RoomView` React component. Everything testable is pure and tested in Node: ray data, layout maths, clamping, and three.js object construction. Rays are recomputed on the main thread at image-source order 4 on every room change (cheap: 129 paths). The full IR still renders in the worker, debounced 150 ms, so it re-renders after a drag ends. The worker client now runs one job at a time, keeps only the newest waiting request, and recovers from crashes.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, three.js 0.186 (+ `@types/three`), zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-04-room-remix-design.md` (§6 audio, §8 3D scene, §11 errors). Follow-ups this plan picks up: `docs/superpowers/plans/2026-10-04-room-remix-plan-1-followups.md` ("Open issue that changes what you hear" and "Before Plan 3").

**Deviations from the spec, decided here:**
- **§6 loudness:** IRs are normalised by their *pink-weighted* gain (1/f over 50 Hz–16 kHz), not their flat energy. Flat energy left the room modes ~8 dB louder than Dry on real music. Pink weighting is what "matched perceived loudness" needs. Normalisation moves into the worker, so the main thread doesn't run large FFTs.
- **§11 "No WebGL → 2D top view":** without WebGL, the view shows a notice and you use the existing number fields. A separate 2D editor isn't worth building for browsers that lack WebGL.

**Roadmap:** Plan 4 (splat layer) builds on `RoomScene` from this plan. It adds a `SplatLayer` into the same three.js scene.

## Global Constraints

- Static export only (`output: 'export'`); no server code. No user data leaves the device.
- Coordinate frame: metres; origin at a floor corner; x along length, z along width, y up. three.js uses the same axes unchanged. A listener `yaw` θ (facing `(cos θ, 0, sin θ)`) is three.js `rotation.y = −θ`. Facing the front wall (x = 0), the right wall is `wallZ0`.
- `src/lib/acoustics/**` and `src/lib/room/**` must not import three.js or touch the DOM or Web Audio. three.js lives only in `src/lib/scene/**` and `src/components/**`.
- Speaker and listener stay ≥ 0.3 m from every wall, floor and ceiling. Speaker–listener ≥ 0.5 m. ≤ 1 rug, ≤ 8 panels. Rugs S 1.2×1.8, M 1.6×2.3, L 2×3 m. Panels 0.6×1.2 m. **New in this plan:** panels on the same wall must not overlap.
- Octave bands 125 Hz–4 kHz (index 0–5); speed of sound 343 m/s; IRs capped at 4 s.
- Rays: image-source order 4, at most 150 paths, and pulses travel at 343/200 m/s (sound slowed 200×).
- Full IR re-render 150 ms after the room stops changing (existing debounce). A/B crossfade 50 ms.
- Shell is Windows PowerShell. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`, passed as a second `-m`.

## Review Focus

1. **Dragging into or past walls and corners:** the speaker and listener are clamped to 0.3 m from every surface, and the rug stays on the floor. The clamped room must pass `validateRoom` even at float boundaries (e.g. a 1.9 m room). Tests: Task 3.
2. **Tapping a wall near a corner, the ceiling, or on an existing panel:** the panel is nudged so it fits. If it would overlap another panel, it is refused with a message, never added. Tests: Task 3.
3. **Dragging the listener onto the speaker:** the room becomes invalid. Rays disappear instead of throwing, the worker isn't asked, and the existing validation message shows. Tests: Task 2 (`computeRayPaths` returns `[]`) and Task 4.
4. **The audio context's sample rate differs from the default 48 kHz** (e.g. 44.1 kHz): IRs simulated at 48 kHz are never loaded into a 44.1 kHz engine, the room re-simulates at the engine's rate, and Play enables only then. Tests: Task 4 (`resultMatchesRate`).
5. **The worker crashes mid-drag or a burst of edits arrives:** a crash shows "Couldn't simulate this room" with Retry, and the next request uses a fresh worker. A burst runs at most one stale job, because only the newest waiting request survives. Tests: Task 4 (client with a fake worker).

---

## File Structure

```
src/lib/acoustics/
  loudness.ts            NEW  pink-weighted IR gain + normalisation (worker side)
  diffuse.ts             NEW  diffuseBounceFactor (moved from simulate.ts) + diffuseGains
  rays.ts                NEW  RayPath type, toRayPath, computeRayPaths (main thread, low order)
  imageSource.ts         MOD  Arrival gains per-bounce hitAbsorption / hitFix
  simulate.ts            MOD  uses diffuse.ts and rays.ts; RayPath moves out
  protocol.ts            MOD  normalises IR loudness before sending
  client.ts              MOD  one job at a time, newest waiting request wins, crash recovery, injectable worker
src/lib/audio/
  mix.ts                 MOD  normalizeIr removed (now in acoustics/loudness.ts)
  engine.ts              MOD  plays IRs as given (already loudness-matched)
src/lib/room/
  geometry.ts            MOD  rectsOverlap
  roomState.ts           MOD  float epsilon in range checks; overlapping panels invalid
  placement.ts           NEW  clampPosition, clampRug, panelAt, panelOverlaps, findFreePanelSpot, applyDrag
src/lib/scene/
  colors.ts              NEW  material tints and handle colours
  layout.ts              NEW  surface/fix quads, surface points, camera presets (pure)
  objects.ts             NEW  three.js builders: shell, speaker, listener, fixes; disposeTree
  rayBuffers.ts          NEW  RayPath[] → line-segment attribute arrays (pure)
  RaysObject.ts          NEW  batched line object with pulse shader
  RoomScene.ts           NEW  renderer, camera, orbit controls, picking, drag, wall taps
src/components/
  useSimulation.ts       MOD  retry, non-null sample rate, DEFAULT_SAMPLE_RATE, resultMatchesRate
  Player.tsx             MOD  receives sim/mode from page; rate-checked IR loading; Retry button
  RoomForm.tsx           MOD  "+ Panel" uses findFreePanelSpot
  RoomView.tsx           NEW  canvas + toolbar (camera presets, rays, place panel, heights)
src/app/room/page.tsx    MOD  owns sample rate, listen mode and the simulation; lays out view, player, form
```

---

### Task 1: Pink-weighted loudness matching, in the worker

**Files:**
- Create: `src/lib/acoustics/loudness.ts`, `src/lib/acoustics/loudness.test.ts`
- Modify: `src/lib/acoustics/protocol.ts`, `src/lib/acoustics/protocol.test.ts`, `src/lib/audio/engine.ts`, `src/lib/audio/mix.ts`, `src/lib/audio/mix.test.ts`

**Interfaces:**
- Consumes: `fft`, `nextPow2`, `createRng`, `gaussian` (`dsp.ts`); `StereoIr`, `simulateRoom`, `simulateBoth` (`simulate.ts`); `defaultRoom`.
- Produces:
  - `pinkGain(channel: Float32Array, sampleRate: number): number`: mean of |H(f)|² weighted 1/f over 50 Hz–min(16 kHz, Nyquist).
  - `normalizeLoudness(ir: StereoIr): StereoIr`: scales both ears by `1/√(mean of the two ears' pinkGain)`; returns the input unchanged for a silent IR.
  - `handleRequest` now returns IRs already passed through `normalizeLoudness`. `AudioEngine.setIrs` plays IRs as given. `normalizeIr` no longer exists.

Why: flat energy normalisation is dominated by the top octave band (88% of the bins). A room IR carries more low-frequency energy than that average, and so does music, so the room modes played about 8 dB louder than Dry. Pink weighting (equal energy per octave) matches how music spreads its energy.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/loudness.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { createRng, fft, gaussian, nextPow2 } from './dsp';
import { normalizeLoudness, pinkGain } from './loudness';
import { simulateRoom, type StereoIr } from './simulate';

/** Seeded noise with an exact 1/f power spectrum between 50 Hz and min(16 kHz, Nyquist). */
function pinkNoise(length: number, sampleRate: number, seed: number): Float64Array {
  const n = nextPow2(length);
  const rng = createRng(seed);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = gaussian(rng);
  fft(re, im);
  const top = Math.min(16000, sampleRate / 2);
  for (let k = 0; k < n; k++) {
    const f = (Math.min(k, n - k) * sampleRate) / n;
    const g = f >= 50 && f <= top ? 1 / Math.sqrt(f) : 0;
    re[k] *= g;
    im[k] *= g;
  }
  fft(re, im, true);
  return re.subarray(0, length);
}

/** Linear convolution via FFT. */
function convolve(signal: Float64Array, kernel: Float32Array): Float64Array {
  const n = nextPow2(signal.length + kernel.length);
  const aRe = new Float64Array(n);
  const aIm = new Float64Array(n);
  const bRe = new Float64Array(n);
  const bIm = new Float64Array(n);
  aRe.set(signal);
  bRe.set(kernel);
  fft(aRe, aIm);
  fft(bRe, bIm);
  for (let k = 0; k < n; k++) {
    const re = aRe[k] * bRe[k] - aIm[k] * bIm[k];
    aIm[k] = aRe[k] * bIm[k] + aIm[k] * bRe[k];
    aRe[k] = re;
  }
  fft(aRe, aIm, true);
  return aRe;
}

const power = (x: ArrayLike<number>, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return s / (to - from);
};

/** Level of pink noise played through the IR (both ears) relative to dry, in dB. */
function wetVsDry(ir: StereoIr): number {
  const length = 1 << 16;
  const noise = pinkNoise(length, ir.sampleRate, 5);
  const from = ir.left.length; // skip the reverb's build-up
  const wet = (power(convolve(noise, ir.left), from, length) + power(convolve(noise, ir.right), from, length)) / 2;
  return 10 * Math.log10(wet / power(noise, from, length));
}

describe('pinkGain', () => {
  it('is 1 for a unit impulse', () => {
    expect(pinkGain(Float32Array.of(1), 48000)).toBeCloseTo(1, 9);
  });

  it('scales with the square of the amplitude', () => {
    expect(pinkGain(Float32Array.of(2), 48000)).toBeCloseTo(4, 9);
  });
});

describe('normalizeLoudness', () => {
  it('leaves a silent IR alone', () => {
    const ir = { left: new Float32Array(8), right: new Float32Array(8), sampleRate: 48000 };
    expect(normalizeLoudness(ir)).toBe(ir);
  });

  it('keeps the sample rate and the level difference between the ears', () => {
    const ir = normalizeLoudness({ left: Float32Array.of(2), right: Float32Array.of(1), sampleRate: 44100 });
    expect(ir.sampleRate).toBe(44100);
    expect(ir.left[0] / ir.right[0]).toBeCloseTo(2, 9);
  });

  it('plays pink noise at the dry level through a bass-heavy IR', () => {
    const kernel = Float32Array.from({ length: 2048 }, (_, i) => 0.05 * 0.95 ** i);
    const ir = { left: kernel, right: kernel, sampleRate: 32000 };
    expect(Math.abs(wetVsDry(normalizeLoudness(ir)))).toBeLessThan(1);

    // The old flat-energy scaling is several dB off for the same IR.
    let energy = 0;
    for (const v of kernel) energy += v * v;
    const flat = kernel.map((v) => v / Math.sqrt(energy));
    expect(Math.abs(wetVsDry({ left: flat, right: flat, sampleRate: 32000 }))).toBeGreaterThan(3);
  });

  it('plays pink noise at the dry level through a simulated room', () => {
    const ir = simulateRoom(defaultRoom(), 16000).ir;
    expect(Math.abs(wetVsDry(normalizeLoudness(ir)))).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/loudness.test.ts`
Expected: FAIL — cannot resolve `./loudness`.

- [ ] **Step 3: Implement**

Create `src/lib/acoustics/loudness.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/loudness.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Normalise in the worker**

In `src/lib/acoustics/protocol.ts`, add `import { normalizeLoudness } from './loudness';` and replace the success return inside `try` with:
```ts
    const { now, withFixes } = simulateBoth(room, sampleRate);
    // IRs leave the worker loudness-matched, so the main thread never runs these large FFTs.
    return {
      id,
      ok: true,
      now: { ...now, ir: normalizeLoudness(now.ir) },
      withFixes: { ...withFixes, ir: normalizeLoudness(withFixes.ir) },
    };
```

In `src/lib/acoustics/protocol.test.ts`, add `import { pinkGain } from './loudness';` and, inside the first test's `if (res.ok) { … }` block, add:
```ts
      const gain = (pinkGain(res.now.ir.left, 16000) + pinkGain(res.now.ir.right, 16000)) / 2;
      expect(gain).toBeCloseTo(1, 6);
```

- [ ] **Step 6: Stop normalising on the main thread**

In `src/lib/audio/engine.ts`:
- Change the import to `import { downmixToMono, modeGains, type ListenMode } from './mix';`.
- Above `setIrs`, add the doc comment `/** IRs must already be loudness-matched (the simulation worker does this). */`.
- In the slot-loading code, replace
  ```ts
      const normalized = normalizeIr(ir);
      const buffer = this.ctx.createBuffer(2, normalized.left.length, normalized.sampleRate);
      buffer.getChannelData(0).set(normalized.left);
      buffer.getChannelData(1).set(normalized.right);
  ```
  with
  ```ts
      const buffer = this.ctx.createBuffer(2, ir.left.length, ir.sampleRate);
      buffer.getChannelData(0).set(ir.left);
      buffer.getChannelData(1).set(ir.right);
  ```

In `src/lib/audio/mix.ts`, delete `normalizeIr` and its doc comment, plus the now-unused `StereoIr` import. In `src/lib/audio/mix.test.ts`, delete the `describe('normalizeIr', …)` block and remove `normalizeIr` from the import.

- [ ] **Step 7: Full check**

Run: `npm test`, then `npx tsc --noEmit`, then `npm run lint`
Expected: all pass. `rg normalizeIr src` returns nothing.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/acoustics/loudness.ts src/lib/acoustics/loudness.test.ts src/lib/acoustics/protocol.ts src/lib/acoustics/protocol.test.ts src/lib/audio
git commit -m "fix: match loudness with pink weighting, in the worker" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Per-bounce ray data for drawing

**Files:**
- Create: `src/lib/acoustics/diffuse.ts`, `src/lib/acoustics/rays.ts`, `src/lib/acoustics/rays.test.ts`
- Modify: `src/lib/acoustics/imageSource.ts`, `src/lib/acoustics/imageSource.test.ts`, `src/lib/acoustics/simulate.ts`

**Interfaces:**
- Consumes: `computeImageSources`, `Arrival` (`imageSource.ts`); `makeSurfaceLookup`, `absorptionArea`; `MAX_MEAN_ALPHA`, `totalSurfaceArea`; `validateRoom`.
- Produces:
  - `Arrival` gains `hitAbsorption: number[]` (mean absorption over bands at each bounce, travel order) and `hitFix: boolean[]` (each bounce on a rug or panel).
  - `diffuse.ts`: `diffuseBounceFactor(room): Bands` (moved unchanged from simulate.ts) and `diffuseGains(a: Arrival, bounce: Bands): Bands`.
  - `rays.ts`:
    ```ts
    type RayPath = { points: Vec3[]; energy: number; vertexEnergy: number[]; hitFix: boolean[] };
    RAY_ORDER = 4; MAX_RAYS = 150;
    toRayPath(a: Arrival, bounce: Bands): RayPath
    computeRayPaths(room: RoomState, maxOrder = RAY_ORDER, maxPaths = MAX_RAYS): RayPath[]   // [] for invalid rooms
    ```
    `vertexEnergy[i]` is the share of energy left at `points[i]`. It is 1 at the source, multiplied after each bounce by `(1 − hitAbsorption) × mean(k²)` (never rising), and the listener point repeats the last value. `energy` is the mean squared band gain including distance and diffuse loss, used to rank paths and set their brightness.
  - `AcousticsResult.paths` is now `RayPath[]` (from `rays.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/rays.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { computeRayPaths, MAX_RAYS } from './rays';

const withRug = (on = true): RoomState => ({ ...defaultRoom(), fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }] });

describe('computeRayPaths', () => {
  it('returns every image up to order 4, strongest first, direct path first', () => {
    const paths = computeRayPaths(defaultRoom());
    expect(paths).toHaveLength(129); // (2N+1)(2N²+2N+3)/3 for N = 4, under the 150 cap
    expect(paths.length).toBeLessThanOrEqual(MAX_RAYS);
    expect(paths[0].points).toHaveLength(2);
    expect(paths[0].vertexEnergy).toEqual([1, 1]);
    expect(paths[0].hitFix).toEqual([]);
    for (let i = 1; i < paths.length; i++) expect(paths[i].energy).toBeLessThanOrEqual(paths[i - 1].energy);
  });

  it('keeps per-point arrays aligned and never lets energy rise along a path', () => {
    for (const p of computeRayPaths(withRug())) {
      expect(p.vertexEnergy).toHaveLength(p.points.length);
      expect(p.hitFix).toHaveLength(p.points.length - 2);
      for (let i = 1; i < p.vertexEnergy.length; i++) expect(p.vertexEnergy[i]).toBeLessThanOrEqual(p.vertexEnergy[i - 1]);
    }
  });

  it('dims a path at the bounce where it lands on the rug', () => {
    // In the default room the floor bounce lands at about (1.74, 0, 1.64), inside a large centred rug.
    const floorBounce = (room: RoomState) =>
      computeRayPaths(room, 1).find((p) => p.points.length === 3 && p.points[1].y === 0)!;
    const onRug = floorBounce(withRug(true));
    const offRug = floorBounce(withRug(false));
    expect(onRug.hitFix).toEqual([true]);
    expect(offRug.hitFix).toEqual([false]);
    expect(onRug.vertexEnergy[1]).toBeLessThan(offRug.vertexEnergy[1]);
  });

  it('respects the order limit', () => {
    for (const p of computeRayPaths(defaultRoom(), 2)) expect(p.points.length).toBeLessThanOrEqual(4);
  });

  it('returns no paths for an invalid room instead of throwing', () => {
    const room = defaultRoom();
    expect(computeRayPaths({ ...room, listener: { ...room.listener, ...room.speaker } })).toEqual([]);
  });
});
```

In `src/lib/acoustics/imageSource.test.ts`, add inside `describe('computeImageSources')`:
```ts
  it('records the absorption and fix flag at every bounce', () => {
    const lookup = (surface: SurfaceId, p: Vec3) =>
      surface === 'floor' && p.x > 1.5 && p.x < 2.5 ? { alpha: flat(0.6), fix: true } : plain();
    const arrivals = computeImageSources({ dims, source, listener, maxOrder: 1, lookup });
    const direct = arrivals.find((a) => a.order === 0)!;
    const floor = arrivals.find((a) => a.hitSurfaces.join() === 'floor')!;
    expect(direct.hitAbsorption).toEqual([]);
    expect(direct.hitFix).toEqual([]);
    expect(floor.hitAbsorption[0]).toBeCloseTo(0.6, 12);
    expect(floor.hitFix).toEqual([true]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/rays.test.ts src/lib/acoustics/imageSource.test.ts`
Expected: FAIL — cannot resolve `./rays`; `hitAbsorption` undefined.

- [ ] **Step 3: Record per-bounce data in the image source method**

In `src/lib/acoustics/imageSource.ts`:
- Add to the `Arrival` type, after `hitFixes: boolean;`:
  ```ts
    hitAbsorption: number[]; // mean absorption over the bands at each bounce, in travel order
    hitFix: boolean[]; // whether each bounce landed on a rug or panel, in travel order
  ```
- In `trace`, next to `const hitSurfaces: SurfaceId[] = [];` declare `const hitAbsorption: number[] = [];` and `const hitFix: boolean[] = [];`. Inside the crossings loop, after `hitSurfaces.push(c.surface);`, add:
  ```ts
      hitAbsorption.push(alpha.reduce((sum, a) => sum + a, 0) / alpha.length);
      hitFix.push(fix);
  ```
- Add `hitAbsorption,` and `hitFix,` to the returned object.

- [ ] **Step 4: Move the diffuse factor into its own module**

Create `src/lib/acoustics/diffuse.ts`:
```ts
import type { RoomState } from '@/lib/room/types';
import { absorptionArea } from './absorption';
import { mapBands, type Bands } from './bands';
import type { Arrival } from './imageSource';
import { MAX_MEAN_ALPHA, totalSurfaceArea } from './reverbTime';

/**
 * Furnishing and calibration are diffuse absorption the walls in the image model don't carry.
 * This per-bounce factor makes image-source decay match the Eyring tail's mean absorption.
 */
export function diffuseBounceFactor(room: RoomState): Bands {
  const area = totalSurfaceArea(room.dims);
  const total = absorptionArea(room);
  const surfaceOnly = absorptionArea({ ...room, furnishing: 'bare', calibration: { factor: 1 } });
  return mapBands((b) => {
    const meanTotal = Math.min(total[b] / area, MAX_MEAN_ALPHA);
    const meanSurface = Math.min(surfaceOnly[b] / area, MAX_MEAN_ALPHA);
    return Math.sqrt((1 - meanTotal) / (1 - meanSurface));
  });
}

/** An arrival's band gains with the diffuse factor applied per bounce; a path never reflects more than 100 %. */
export function diffuseGains(a: Arrival, bounce: Bands): Bands {
  return a.gains.map((g, b) => g * Math.min(bounce[b] ** a.order, 1 / a.reflection[b]));
}
```

- [ ] **Step 5: Create the ray module**

Create `src/lib/acoustics/rays.ts`:
```ts
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState, Vec3 } from '@/lib/room/types';
import { makeSurfaceLookup } from './absorption';
import type { Bands } from './bands';
import { diffuseBounceFactor, diffuseGains } from './diffuse';
import { computeImageSources, type Arrival } from './imageSource';

export const RAY_ORDER = 4;
export const MAX_RAYS = 150;

export type RayPath = {
  points: Vec3[]; // speaker, bounces in travel order, listener
  energy: number; // mean squared band gain (distance, walls, diffuse loss): ranks and brightens paths
  vertexEnergy: number[]; // share of energy left at each point: 1 at the speaker, lower after each bounce
  hitFix: boolean[]; // per bounce: landed on a rug or panel
};

export function toRayPath(a: Arrival, bounce: Bands): RayPath {
  const gains = diffuseGains(a, bounce);
  const diffuse = bounce.reduce((sum, k) => sum + k * k, 0) / bounce.length;
  const vertexEnergy = [1];
  for (const absorption of a.hitAbsorption) {
    const previous = vertexEnergy[vertexEnergy.length - 1];
    vertexEnergy.push(Math.min(previous, previous * (1 - absorption) * diffuse));
  }
  vertexEnergy.push(vertexEnergy[vertexEnergy.length - 1]); // the last leg carries it to the listener
  return {
    points: a.points,
    energy: gains.reduce((sum, g) => sum + g * g, 0) / gains.length,
    vertexEnergy,
    hitFix: a.hitFix,
  };
}

/** Low-order paths for drawing, cheap enough to recompute on every drag frame. Empty for invalid rooms. */
export function computeRayPaths(room: RoomState, maxOrder = RAY_ORDER, maxPaths = MAX_RAYS): RayPath[] {
  if (validateRoom(room).length > 0) return [];
  const bounce = diffuseBounceFactor(room);
  return computeImageSources({
    dims: room.dims,
    source: room.speaker,
    listener: room.listener,
    maxOrder,
    lookup: makeSurfaceLookup(room),
  })
    .map((a) => toRayPath(a, bounce))
    .sort((p, q) => q.energy - p.energy)
    .slice(0, maxPaths);
}
```

- [ ] **Step 6: Use the shared helpers in the simulation**

In `src/lib/acoustics/simulate.ts`:
- Delete the `diffuseBounceFactor` function and its doc comment, and delete the `export type RayPath = …` line.
- Change the imports: drop `mapBands` from the `./bands` import and `MAX_MEAN_ALPHA` from the `./reverbTime` import. Drop `pathEnergy` from the `./imageSource` import, and drop `Vec3` from the room-types import if it is now unused. Add:
  ```ts
  import { diffuseBounceFactor, diffuseGains } from './diffuse';
  import { toRayPath, type RayPath } from './rays';
  ```
- Replace the `early` construction and the `paths` construction with:
  ```ts
    const inEarly = arrivals.filter((a) => a.delay < transition);
    const early = inEarly.map((a) => ({ ...a, gains: diffuseGains(a, bounce) }));
  ```
  and
  ```ts
    const paths = inEarly
      .map((a) => toRayPath(a, bounce))
      .sort((p, q) => q.energy - p.energy)
      .slice(0, MAX_PATHS);
  ```
- Keep `export type AcousticsResult = { ir: StereoIr; paths: RayPath[]; rt60: { bands: Bands; mid: number } };` (it now refers to the imported `RayPath`).

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics`
Expected: PASS (all acoustics tests, including the existing simulate tests).

- [ ] **Step 8: Full check and commit**

Run: `npm test` and `npx tsc --noEmit` (both clean).
```powershell
git add src/lib/acoustics
git commit -m "feat: per-bounce ray data and a cheap ray path builder for drawing" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Room rules for direct manipulation

**Files:**
- Create: `src/lib/room/placement.ts`, `src/lib/room/placement.test.ts`
- Modify: `src/lib/room/geometry.ts`, `src/lib/room/roomState.ts`, `src/lib/room/roomState.test.ts`, `src/components/RoomForm.tsx`

**Interfaces:**
- Consumes: `LIMITS`, `PANEL_SIZE`, `RUG_SIZES`, `fixRect`, `surfaceSize`, `toSurfaceCoords`, `validateRoom`, room types.
- Produces:
  - `geometry.ts`: `rectsOverlap(a: Rect, b: Rect): boolean` (positive-area overlap; touching edges don't count).
  - `roomState.ts`: range checks accept values within 1e-9 of a bound. Overlapping panels on the same wall are invalid: the later panel gets `{ field: 'fixes.<i>', message: "Panels can't overlap." }`.
  - `placement.ts`:
    ```ts
    type DragTarget = { kind: 'speaker' } | { kind: 'listener' } | { kind: 'rug'; index: number };
    clampPosition(dims: Dims, p: Vec3): Vec3
    clampRug(dims: Dims, rug: RugFix): RugFix
    panelAt(dims: Dims, wall: WallId, point: Vec3): PanelFix          // centred on the tap, nudged to fit
    panelOverlaps(room: RoomState, panel: PanelFix): boolean
    findFreePanelSpot(room: RoomState): PanelFix | null
    applyDrag(room: RoomState, target: DragTarget, point: Vec3): RoomState  // moves x/z, keeps height and yaw, clamps
    ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/placement.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { fixFits } from './geometry';
import { applyDrag, clampPosition, clampRug, findFreePanelSpot, panelAt, panelOverlaps } from './placement';
import { defaultRoom, validateRoom } from './roomState';
import type { PanelFix, RoomState } from './types';

const panel = (u: number, wall: PanelFix['wall'] = 'wallZ1'): PanelFix => ({ kind: 'panel', wall, u, v: 1.2, on: true });

describe('clampPosition', () => {
  it('keeps a point 0.3 m from every surface', () => {
    const p = clampPosition({ length: 4, width: 3.5, height: 2.6 }, { x: -1, y: 9, z: 99 });
    expect(p.x).toBeCloseTo(0.3, 9);
    expect(p.y).toBeCloseTo(2.3, 9); // 2.6 − 0.3 is 2.3000000000000003 in floating point
    expect(p.z).toBeCloseTo(3.2, 9);
  });

  it('produces positions that validate even where 1.9 − 0.3 is 1.5999999999999999', () => {
    const room: RoomState = { ...defaultRoom(), dims: { length: 1.9, width: 3.5, height: 2.6 }, listener: { x: 0.5, y: 1.1, z: 2.9, yaw: 'faceSpeaker' } };
    const speaker = clampPosition(room.dims, { x: 99, y: 1, z: 0.3 });
    expect(validateRoom({ ...room, speaker })).toEqual([]);
  });
});

describe('clampRug', () => {
  it('keeps the whole rug on the floor', () => {
    const rug = clampRug({ length: 4, width: 3.5, height: 2.6 }, { kind: 'rug', size: 'M', x: -5, z: 99, on: true });
    expect(rug.x).toBeCloseTo(1.15, 9);
    expect(rug.z).toBeCloseTo(2.7, 9);
    expect(fixFits({ length: 4, width: 3.5, height: 2.6 }, rug)).toBe(true);
  });
});

describe('panelAt', () => {
  it('centres the panel on the tap and nudges it to fit near a corner', () => {
    const dims = { length: 4, width: 3.5, height: 2.6 };
    const p = panelAt(dims, 'wallZ1', { x: 3.95, y: 2.55, z: 3.5 });
    expect(p.u).toBeCloseTo(3.7, 9);
    expect(p.v).toBeCloseTo(2.0, 9);
    expect(fixFits(dims, p)).toBe(true);
    expect(panelAt(dims, 'wallX0', { x: 0, y: 1.4, z: 2 })).toMatchObject({ wall: 'wallX0', u: 2, v: 1.4 });
  });
});

describe('panelOverlaps', () => {
  it('detects overlap on the same wall only, and allows touching edges', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [panel(1.0)] };
    expect(panelOverlaps(room, panel(1.3))).toBe(true);
    expect(panelOverlaps(room, panel(1.6))).toBe(false); // edges touch at u = 1.3
    expect(panelOverlaps(room, panel(1.0, 'wallZ0'))).toBe(false);
  });
});

describe('findFreePanelSpot', () => {
  it('fills each wall left to right, reusing gaps', () => {
    const room = defaultRoom();
    expect(findFreePanelSpot(room)).toEqual(panel(0.5));
    expect(findFreePanelSpot({ ...room, fixes: [panel(0.5)] })).toEqual(panel(1.2));
    expect(findFreePanelSpot({ ...room, fixes: [panel(1.2)] })).toEqual(panel(0.5));
  });

  it('returns null when no wall has room left', () => {
    let room: RoomState = { ...defaultRoom(), dims: { length: 1.5, width: 1.5, height: 2.6 }, speaker: { x: 0.4, y: 1, z: 0.4 }, listener: { x: 1.1, y: 1.1, z: 1.1, yaw: 'faceSpeaker' } };
    for (let i = 0; i < 8; i++) {
      const spot = findFreePanelSpot(room);
      expect(spot).not.toBeNull();
      room = { ...room, fixes: [...room.fixes, spot!] };
    }
    expect(validateRoom(room)).toEqual([]);
    expect(findFreePanelSpot(room)).toBeNull();
  });
});

describe('applyDrag', () => {
  it('moves the speaker on the floor plan, keeping its height, clamped to the room', () => {
    const room = defaultRoom();
    const next = applyDrag(room, { kind: 'speaker' }, { x: -3, y: 0, z: 2 });
    expect(next.speaker).toEqual({ x: 0.3, y: room.speaker.y, z: 2 });
  });

  it('moves the listener and keeps its yaw', () => {
    const room = defaultRoom();
    const next = applyDrag(room, { kind: 'listener' }, { x: 2, y: 0, z: 1 });
    expect(next.listener).toEqual({ x: 2, y: room.listener.y, z: 1, yaw: 'faceSpeaker' });
  });

  it('moves the rug, keeping it on the floor', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [panel(0.5), { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true }] };
    const next = applyDrag(room, { kind: 'rug', index: 1 }, { x: 10, y: 0, z: 0 });
    expect(next.fixes[0]).toBe(room.fixes[0]);
    expect(next.fixes[1]).toMatchObject({ kind: 'rug', x: 4 - 1.15, z: 0.8 });
  });
});
```

In `src/lib/room/roomState.test.ts`:
- Change the 9-panel assertion (`fields({ ...room, fixes: Array.from({ length: 9 }, () => panel(2, 1.2)) })`) from `.toEqual(['fixes'])` to `.toContain('fixes')`. The panels also overlap now, so they produce extra `fixes.<i>` errors.
- Add inside `describe('validateRoom')`:
  ```ts
  it('rejects panels that overlap on the same wall', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [panel(2, 1.2), panel(2.3, 1.2)] })).toEqual(['fixes.1']);
    expect(fields({ ...room, fixes: [panel(1, 1.2), panel(1.6, 1.2)] })).toEqual([]); // touching edges are fine
  });
  ```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room`
Expected: FAIL — cannot resolve `./placement`; the overlap test fails.

- [ ] **Step 3: Add the overlap test and the epsilon**

In `src/lib/room/geometry.ts`, add:
```ts
/** True when two rectangles share some area (touching edges don't count). */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1;
}
```

In `src/lib/room/roomState.ts`:
- Import `fixRect` and `rectsOverlap` alongside `fixFits` from `./geometry`.
- Replace `between` with:
  ```ts
  const EPS = 1e-9; // positions clamped exactly to a bound (e.g. 1.9 − 0.3) must not fail on float noise
  const between = (value: number, lo: number, hi: number) =>
    Number.isFinite(value) && value >= lo - EPS && value <= hi + EPS;
  ```
- After the existing `room.fixes.forEach(...)` fit loop, add:
  ```ts
  room.fixes.forEach((fix, i) => {
    if (fix.kind !== 'panel') return;
    const clash = room.fixes
      .slice(0, i)
      .some((other) => other.kind === 'panel' && other.wall === fix.wall && rectsOverlap(fixRect(other), fixRect(fix)));
    if (clash) errors.push({ field: `fixes.${i}`, message: "Panels can't overlap." });
  });
  ```

- [ ] **Step 4: Create the placement helpers**

Create `src/lib/room/placement.ts`:
```ts
import { LIMITS, PANEL_SIZE, RUG_SIZES } from './constants';
import { fixRect, rectsOverlap, surfaceSize, toSurfaceCoords } from './geometry';
import type { Dims, PanelFix, RoomState, RugFix, Vec3, WallId } from './types';

/** What a pointer drag in the 3D view can move. */
export type DragTarget = { kind: 'speaker' } | { kind: 'listener' } | { kind: 'rug'; index: number };

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Keep a speaker or listener position the wall clearance away from every surface. */
export function clampPosition(dims: Dims, p: Vec3): Vec3 {
  const c = LIMITS.wallClearance;
  return { x: clamp(p.x, c, dims.length - c), y: clamp(p.y, c, dims.height - c), z: clamp(p.z, c, dims.width - c) };
}

/** Move a rug's centre so the whole rug stays on the floor. */
export function clampRug(dims: Dims, rug: RugFix): RugFix {
  const size = RUG_SIZES[rug.size];
  return {
    ...rug,
    x: clamp(rug.x, size.x / 2, dims.length - size.x / 2),
    z: clamp(rug.z, size.z / 2, dims.width - size.z / 2),
  };
}

/** A panel centred where a wall was tapped, nudged so it fits on the wall. */
export function panelAt(dims: Dims, wall: WallId, point: Vec3): PanelFix {
  const size = surfaceSize(dims, wall);
  const { u, v } = toSurfaceCoords(wall, point);
  return {
    kind: 'panel',
    wall,
    u: clamp(u, PANEL_SIZE.u / 2, size.u - PANEL_SIZE.u / 2),
    v: clamp(v, PANEL_SIZE.v / 2, size.v - PANEL_SIZE.v / 2),
    on: true,
  };
}

/** Whether a panel would overlap a panel already on the same wall. */
export function panelOverlaps(room: RoomState, panel: PanelFix): boolean {
  return room.fixes.some(
    (f) => f.kind === 'panel' && f.wall === panel.wall && rectsOverlap(fixRect(f), fixRect(panel)),
  );
}

const PANEL_WALL_ORDER: WallId[] = ['wallZ1', 'wallZ0', 'wallX1', 'wallX0'];

/** The first free spot for a new panel: 1.2 m high, 0.1 m apart along each wall in turn; null when all are full. */
export function findFreePanelSpot(room: RoomState): PanelFix | null {
  for (const wall of PANEL_WALL_ORDER) {
    const length = surfaceSize(room.dims, wall).u;
    for (let k = 0; ; k++) {
      const u = (5 + 7 * k) / 10; // 0.5, 1.2, 1.9 … in tenths so 2.6 isn't 2.5999…
      if (u + PANEL_SIZE.u / 2 > length) break;
      const panel: PanelFix = { kind: 'panel', wall, u, v: 1.2, on: true };
      if (!panelOverlaps(room, panel)) return panel;
    }
  }
  return null;
}

/** Move a dragged item to a floor-plan point: x and z follow the pointer, height and yaw stay, and it stays in the room. */
export function applyDrag(room: RoomState, target: DragTarget, point: Vec3): RoomState {
  switch (target.kind) {
    case 'speaker':
      return { ...room, speaker: clampPosition(room.dims, { ...room.speaker, x: point.x, z: point.z }) };
    case 'listener':
      return {
        ...room,
        listener: { ...clampPosition(room.dims, { ...room.listener, x: point.x, z: point.z }), yaw: room.listener.yaw },
      };
    case 'rug':
      return {
        ...room,
        fixes: room.fixes.map((f, i) =>
          i === target.index && f.kind === 'rug' ? clampRug(room.dims, { ...f, x: point.x, z: point.z }) : f,
        ),
      };
  }
}
```

- [ ] **Step 5: Use the free-spot finder in the form**

In `src/components/RoomForm.tsx`:
- Import `findFreePanelSpot` from `@/lib/room/placement`. Remove the `surfaceSize` import if it becomes unused.
- Replace the whole `addPanel` definition with:
  ```ts
  const addPanel = () =>
    update((r) => {
      const spot = findFreePanelSpot(r);
      return spot ? { ...r, fixes: [...r.fixes, spot] } : r;
    });
  ```
- Change the "+ Panel" button's `disabled` to `disabled={panelCount >= LIMITS.maxPanels || findFreePanelSpot(room) === null}`.

- [ ] **Step 6: Run the tests, check and commit**

Run: `npx vitest run src/lib/room` (PASS), then `npm test`, `npx tsc --noEmit`, `npm run lint` (all clean).
```powershell
git add src/lib/room src/components/RoomForm.tsx
git commit -m "feat: drag clamping, panel placement and overlap rules" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Simulation pipeline — one job at a time, crash recovery, shared state

**Files:**
- Create: `src/lib/acoustics/client.test.ts`, `src/components/useSimulation.test.ts`
- Modify: `src/lib/acoustics/client.ts`, `src/components/useSimulation.ts`, `src/components/Player.tsx`, `src/app/room/page.tsx`

**Interfaces:**
- Consumes: `SimRequest`, `SimResponse` (`protocol.ts`); `AcousticsResult`; `validateRoom`; `ListenMode`.
- Produces:
  - `client.ts`: `WorkerLike`, `WorkerFactory`, `SUPERSEDED`, `CRASHED`, `CANCELLED` (message strings), and `class AcousticsClient { constructor(createWorker?: WorkerFactory); simulate(room, sampleRate): Promise<SimOutput>; dispose(): void }`.
    - **One job at a time:** while one job runs, the newest waiting request replaces any older waiting one, which rejects with `SUPERSEDED`.
    - **Crash recovery:** a worker error rejects the running job with the event's message (or `CRASHED`), terminates that worker, and the next job gets a fresh one.
    - **Dispose:** rejects everything with `CANCELLED`, and later calls reject too.
    - The worker is created lazily.
  - `useSimulation.ts`: `DEFAULT_SAMPLE_RATE = 48000`; `type Simulation = SimState & { retry: () => void }`; `useSimulation(room, sampleRate: number): Simulation`; `resultMatchesRate(result: SimOutput | null, sampleRate: number | null): result is SimOutput`.
  - `Player` props: `{ sim: Simulation; mode: ListenMode; onModeChange: (mode: ListenMode) => void; onSampleRate: (rate: number) => void }`.
  - The room page owns `sampleRate` (starts at 48000), `mode`, and `sim = useSimulation(room, sampleRate)`.

- [ ] **Step 1: Write the failing client tests**

Create `src/lib/acoustics/client.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { AcousticsClient, CRASHED, SUPERSEDED, type WorkerLike } from './client';
import type { SimRequest, SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<SimResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: SimRequest[] = [];
  terminated = false;
  postMessage(message: SimRequest) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated = true;
  }
  /** Answer the most recent request. */
  reply(ok = true) {
    const { id } = this.posted[this.posted.length - 1];
    const result = { rt60: { mid: id } } as unknown as AcousticsResult;
    const data: SimResponse = ok ? { id, ok: true, now: result, withFixes: result } : { id, ok: false, error: 'bad room' };
    this.onmessage?.({ data } as MessageEvent<SimResponse>);
  }
  crash(message = '') {
    this.onerror?.({ message, preventDefault() {} } as unknown as ErrorEvent);
  }
}

function setup() {
  const workers: FakeWorker[] = [];
  const client = new AcousticsClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

const room = defaultRoom();

describe('AcousticsClient', () => {
  it('creates its worker lazily and resolves with both results', async () => {
    const { client, workers } = setup();
    expect(workers).toHaveLength(0);
    const result = client.simulate(room, 48000);
    expect(workers).toHaveLength(1);
    workers[0].reply();
    await expect(result).resolves.toMatchObject({ now: { rt60: { mid: 1 } } });
  });

  it('runs one job at a time and keeps only the newest waiting request', async () => {
    const { client, workers } = setup();
    const first = client.simulate(room, 48000);
    const second = client.simulate(room, 48000);
    const third = client.simulate(room, 48000);
    await expect(second).rejects.toThrow(SUPERSEDED);
    expect(workers[0].posted).toHaveLength(1);
    workers[0].reply();
    await expect(first).resolves.toBeDefined();
    expect(workers[0].posted).toHaveLength(2); // the waiting request starts as soon as the first finishes
    workers[0].reply();
    await expect(third).resolves.toBeDefined();
  });

  it('rejects a failed simulation with its message', async () => {
    const { client, workers } = setup();
    const result = client.simulate(room, 48000);
    workers[0].reply(false);
    await expect(result).rejects.toThrow('bad room');
  });

  it('replaces a crashed worker on the next request', async () => {
    const { client, workers } = setup();
    const result = client.simulate(room, 48000);
    workers[0].crash();
    await expect(result).rejects.toThrow(CRASHED);
    expect(workers[0].terminated).toBe(true);
    const next = client.simulate(room, 48000);
    expect(workers).toHaveLength(2);
    workers[1].reply();
    await expect(next).resolves.toBeDefined();
  });

  it('starts a waiting request on a fresh worker after a crash', async () => {
    const { client, workers } = setup();
    const running = client.simulate(room, 48000);
    const waiting = client.simulate(room, 48000);
    workers[0].crash('boom');
    await expect(running).rejects.toThrow('boom');
    expect(workers).toHaveLength(2);
    expect(workers[1].posted).toHaveLength(1);
    workers[1].reply();
    await expect(waiting).resolves.toBeDefined();
  });

  it('rejects everything on dispose and refuses later requests', async () => {
    const { client, workers } = setup();
    const running = client.simulate(room, 48000);
    const waiting = client.simulate(room, 48000);
    client.dispose();
    await expect(running).rejects.toThrow('cancelled');
    await expect(waiting).rejects.toThrow('cancelled');
    expect(workers[0].terminated).toBe(true);
    await expect(client.simulate(room, 48000)).rejects.toThrow('cancelled');
  });
});
```

Create `src/components/useSimulation.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SimOutput } from '@/lib/acoustics/client';
import { resultMatchesRate } from './useSimulation';

const at = (sampleRate: number) => ({ now: { ir: { sampleRate } }, withFixes: { ir: { sampleRate } } }) as unknown as SimOutput;

describe('resultMatchesRate', () => {
  it('only accepts results simulated at the audio context rate', () => {
    expect(resultMatchesRate(at(48000), 48000)).toBe(true);
    expect(resultMatchesRate(at(48000), 44100)).toBe(false);
    expect(resultMatchesRate(at(48000), null)).toBe(false);
    expect(resultMatchesRate(null, 48000)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/client.test.ts src/components/useSimulation.test.ts`
Expected: FAIL — `AcousticsClient` takes no factory; `SUPERSEDED`/`CRASHED`/`resultMatchesRate` not exported.

- [ ] **Step 3: Rewrite the client**

Replace `src/lib/acoustics/client.ts` with:
```ts
import type { RoomState } from '@/lib/room/types';
import type { SimRequest, SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

export type SimOutput = { now: AcousticsResult; withFixes: AcousticsResult };

export type WorkerLike = {
  onmessage: ((event: MessageEvent<SimResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: SimRequest): void;
  terminate(): void;
};
export type WorkerFactory = () => WorkerLike;

export const SUPERSEDED = 'Superseded by a newer request';
export const CRASHED = 'The simulation stopped unexpectedly.';
export const CANCELLED = 'Simulation cancelled';

const createModuleWorker: WorkerFactory = () =>
  new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;

type Job = { room: RoomState; sampleRate: number; resolve: (value: SimOutput) => void; reject: (error: Error) => void };

/**
 * Runs room simulations in a Web Worker, one at a time. While one runs, only the newest waiting request is kept,
 * so a burst of edits never queues stale work. A crashed worker is replaced on the next request.
 */
export class AcousticsClient {
  private worker: WorkerLike | null = null;
  private running: (Job & { id: number }) | null = null;
  private waiting: Job | null = null;
  private nextId = 1;
  private disposed = false;

  constructor(private readonly createWorker: WorkerFactory = createModuleWorker) {}

  simulate(room: RoomState, sampleRate: number): Promise<SimOutput> {
    if (this.disposed) return Promise.reject(new Error(CANCELLED));
    return new Promise((resolve, reject) => {
      this.waiting?.reject(new Error(SUPERSEDED));
      this.waiting = { room, sampleRate, resolve, reject };
      this.startNext();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
    this.running?.reject(new Error(CANCELLED));
    this.waiting?.reject(new Error(CANCELLED));
    this.running = null;
    this.waiting = null;
  }

  private startNext(): void {
    if (this.running || !this.waiting) return;
    const job = { ...this.waiting, id: this.nextId++ };
    this.waiting = null;
    this.running = job;
    this.ensureWorker().postMessage({ id: job.id, room: job.room, sampleRate: job.sampleRate });
  }

  private ensureWorker(): WorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => {
      const res = event.data;
      const job = this.running;
      if (!job || job.id !== res.id) return;
      this.running = null;
      if (res.ok) job.resolve({ now: res.now, withFixes: res.withFixes });
      else job.reject(new Error(res.error));
      this.startNext();
    };
    worker.onerror = (event) => {
      event.preventDefault?.();
      const job = this.running;
      this.running = null;
      worker.terminate();
      if (this.worker === worker) this.worker = null; // a fresh one is created for the next job
      job?.reject(new Error(event.message || CRASHED));
      this.startNext();
    };
    this.worker = worker;
    return worker;
  }
}
```

- [ ] **Step 4: Update the simulation hook**

Replace `src/components/useSimulation.ts` with:
```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AcousticsClient, SUPERSEDED, type SimOutput } from '@/lib/acoustics/client';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';

/** Simulate before any song is picked; the page re-simulates if the audio context runs at another rate. */
export const DEFAULT_SAMPLE_RATE = 48000;

export type SimState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  result: SimOutput | null;
  error: string | null;
};
export type Simulation = SimState & { retry: () => void };

const DEBOUNCE_MS = 150;

/** True when the result was simulated at the audio context's rate, so its IRs can be loaded into it. */
export function resultMatchesRate(result: SimOutput | null, sampleRate: number | null): result is SimOutput {
  return result !== null && sampleRate !== null && result.now.ir.sampleRate === sampleRate;
}

/** Re-simulates the room in a worker 150 ms after it stops changing. Keeps the last good result on failure. */
export function useSimulation(room: RoomState, sampleRate: number): Simulation {
  const clientRef = useRef<AcousticsClient | null>(null);
  const [state, setState] = useState<SimState>({ status: 'idle', result: null, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = new AcousticsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    const valid = validateRoom(room).length === 0;
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = clientRef.current;
      if (!valid || !client) {
        setState((s) => (s.status === 'running' ? { ...s, status: s.result ? 'ready' : 'idle' } : s));
        return;
      }
      setState((s) => ({ ...s, status: 'running' }));
      client.simulate(room, sampleRate).then(
        (result) => {
          if (!cancelled) setState({ status: 'ready', result, error: null });
        },
        (error: Error) => {
          if (!cancelled && error.message !== SUPERSEDED) {
            setState((s) => ({ status: 'error', result: s.result, error: error.message }));
          }
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [room, sampleRate, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
```

- [ ] **Step 5: Make the Player a consumer of shared state**

In `src/components/Player.tsx`:
- Replace the imports of `useSimulation` with `import { resultMatchesRate, type Simulation } from './useSimulation';`.
- Change the signature to:
  ```tsx
  type PlayerProps = {
    sim: Simulation;
    mode: ListenMode;
    onModeChange: (mode: ListenMode) => void;
    onSampleRate: (rate: number) => void;
  };

  export function Player({ sim, mode, onModeChange, onSampleRate }: PlayerProps) {
  ```
- Delete the local `sampleRate` state, the local `mode` state and the `useSimulation(...)` call. Add `const [engineRate, setEngineRate] = useState<number | null>(null);` and `const ready = resultMatchesRate(sim.result, engineRate);`.
- Replace the `setIrs` effect with:
  ```tsx
  useEffect(() => {
    const result = sim.result;
    if (resultMatchesRate(result, engineRate)) engineRef.current?.setIrs(result.now.ir, result.withFixes.ir);
  }, [sim.result, engineRate]);
  ```
- In `pickSong`, replace the engine-creation block with:
  ```tsx
    if (!engineRef.current) {
      const engine = new AudioEngine();
      engineRef.current = engine;
      engine.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
      setEngineRate(engine.sampleRate);
      onSampleRate(engine.sampleRate); // the page re-simulates if this isn't the default rate
    }
  ```
- Change the Play button's `disabled` to `disabled={!songName || !ready}`.
- Change the toggles' handlers to `onChange={(v) => onModeChange({ ...mode, room: v })}` and `onChange={(v) => onModeChange({ ...mode, fixes: v })}`.
- Replace the error line with:
  ```tsx
        {sim.status === 'error' && (
          <p className="text-red-400">
            Couldn&apos;t simulate this room. {sim.error}{' '}
            <button onClick={sim.retry} className="underline">
              Retry
            </button>
          </p>
        )}
  ```

- [ ] **Step 6: Lift the state into the page**

In `src/app/room/page.tsx`:
- Add the imports:
  ```tsx
  import { DEFAULT_SAMPLE_RATE, useSimulation } from '@/components/useSimulation';
  import type { ListenMode } from '@/lib/audio/mix';
  ```
- Inside `RoomPage`, before the effect, add:
  ```tsx
  const room = useRoomStore((s) => s.room);
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const sim = useSimulation(room, sampleRate);
  ```
- Render `<Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />` in place of `<Player />`.

- [ ] **Step 7: Run tests, check and commit**

Run: `npx vitest run src/lib/acoustics/client.test.ts src/components/useSimulation.test.ts` (PASS), then `npm test`, `npx tsc --noEmit`, `npm run lint` (all clean, with no react-hooks warnings).
```powershell
git add src/lib/acoustics/client.ts src/lib/acoustics/client.test.ts src/components src/app/room/page.tsx
git commit -m "feat: one simulation at a time with crash recovery; shared simulation state and retry" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: three.js, scene colours and layout maths

**Files:**
- Modify: `package.json` (dependencies)
- Create: `src/lib/scene/colors.ts`, `src/lib/scene/layout.ts`, `src/lib/scene/layout.test.ts`

**Interfaces:**
- Consumes: `PANEL_SIZE`, `RUG_SIZES`, `fixSurface`, `surfaceSize`, `toSurfaceCoords`, room types.
- Produces:
  - `colors.ts`: `MATERIAL_COLORS: Record<MaterialId, number>`, `SPEAKER_COLOR`, `LISTENER_COLOR`, `RAY_COLOR`.
  - `layout.ts`:
    ```ts
    type Quad = { center: Vec3; normal: Vec3; uAxis: Vec3; vAxis: Vec3; width: number; height: number }
    surfacePoint(dims, surface, u, v): Vec3              // inverse of toSurfaceCoords
    surfaceQuad(dims, surface): Quad                     // normal points into the room
    fixQuad(dims, fix): Quad                             // lifted 1 cm off its surface
    type CameraPreset = 'top' | 'corner' | 'listener'
    cameraPreset(room, preset): { position: Vec3; target: Vec3 }
    ```

- [ ] **Step 1: Install three.js**

Run:
```powershell
npm install three
npm install -D @types/three
```
Expected: `three` (0.186.x) in dependencies, `@types/three` in devDependencies.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/scene/layout.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { toSurfaceCoords } from '@/lib/room/geometry';
import { defaultRoom } from '@/lib/room/roomState';
import { SURFACE_IDS } from '@/lib/room/types';
import { cameraPreset, fixQuad, surfacePoint, surfaceQuad } from './layout';

const dims = { length: 4, width: 3.5, height: 2.6 };

describe('surfaceQuad', () => {
  it('centres and sizes the floor and a wall', () => {
    expect(surfaceQuad(dims, 'floor')).toMatchObject({ center: { x: 2, y: 0, z: 1.75 }, width: 4, height: 3.5, normal: { x: 0, y: 1, z: 0 } });
    expect(surfaceQuad(dims, 'wallZ1')).toMatchObject({ center: { x: 2, y: 1.3, z: 3.5 }, width: 4, height: 2.6, normal: { x: 0, y: 0, z: -1 } });
  });

  it('points every normal into the room', () => {
    const middle = { x: 2, y: 1.3, z: 1.75 };
    for (const surface of SURFACE_IDS) {
      const { center, normal } = surfaceQuad(dims, surface);
      const toMiddle = (middle.x - center.x) * normal.x + (middle.y - center.y) * normal.y + (middle.z - center.z) * normal.z;
      expect(toMiddle).toBeGreaterThan(0);
    }
  });
});

describe('surfacePoint', () => {
  it('is the inverse of toSurfaceCoords on every surface', () => {
    for (const surface of SURFACE_IDS) {
      const p = surfacePoint(dims, surface, 1.25, 0.75);
      expect(toSurfaceCoords(surface, p)).toEqual({ u: 1.25, v: 0.75 });
    }
  });
});

describe('fixQuad', () => {
  it('lifts a rug just above the floor and a panel just off its wall', () => {
    const rug = fixQuad(dims, { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true });
    expect(rug.center).toEqual({ x: 2, y: 0.01, z: 1.75 });
    expect([rug.width, rug.height]).toEqual([2.3, 1.6]);
    const panel = fixQuad(dims, { kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: true });
    expect(panel.center.x).toBe(2);
    expect(panel.center.y).toBe(1.2);
    expect(panel.center.z).toBeCloseTo(3.49, 9);
    expect([panel.width, panel.height]).toEqual([0.6, 1.2]);
  });
});

describe('cameraPreset', () => {
  const room = defaultRoom();

  it('looks down from above for the top view', () => {
    const { position, target } = cameraPreset(room, 'top');
    expect(position.y).toBeGreaterThan(room.dims.height);
    expect(target).toEqual({ x: 2, y: 0, z: 1.75 });
  });

  it('stands outside the back-left corner for the corner view', () => {
    const { position } = cameraPreset(room, 'corner');
    expect(position.x).toBeGreaterThan(room.dims.length);
    expect(position.z).toBeGreaterThan(room.dims.width);
  });

  it("puts the camera at the listener's head looking at the speaker", () => {
    expect(cameraPreset(room, 'listener')).toEqual({
      position: { x: 3, y: 1.1, z: 1.9 },
      target: { x: 0.6, y: 1.0, z: 1.4 },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scene/layout.test.ts`
Expected: FAIL — cannot resolve `./layout`.

- [ ] **Step 4: Implement colours and layout**

Create `src/lib/scene/colors.ts`:
```ts
import type { MaterialId } from '@/lib/room/types';

/** Display tint per material: warm for soft, absorbent ones; grey and blue for hard, reflective ones. */
export const MATERIAL_COLORS: Record<MaterialId, number> = {
  drywall: 0xd6d3cd,
  brick: 0xb5523b,
  concrete: 0x8a8d91,
  glass: 0x7fb7d9,
  woodFloor: 0xa8743f,
  carpet: 0x7d5a8c,
  tile: 0xc9ccd1,
  curtains: 0x9c3d54,
  plaster: 0xe6dfd3,
  woodPanel: 0x8b5a2b,
  acousticPanel: 0x3f8f6b,
  rug: 0xc98a3d,
};

export const SPEAKER_COLOR = 0xf59e0b;
export const LISTENER_COLOR = 0x38bdf8;
export const RAY_COLOR = 0xfde68a;
```

Create `src/lib/scene/layout.ts`:
```ts
import { PANEL_SIZE, RUG_SIZES } from '@/lib/room/constants';
import { fixSurface, surfaceSize } from '@/lib/room/geometry';
import type { Dims, Fix, RoomState, SurfaceId, Vec3 } from '@/lib/room/types';

/** A rectangle in the room: its centre, inward normal, in-plane axes (u, v as in toSurfaceCoords) and size. */
export type Quad = { center: Vec3; normal: Vec3; uAxis: Vec3; vAxis: Vec3; width: number; height: number };

const vec = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

const AXES: Record<SurfaceId, { normal: Vec3; uAxis: Vec3; vAxis: Vec3 }> = {
  floor: { normal: vec(0, 1, 0), uAxis: vec(1, 0, 0), vAxis: vec(0, 0, 1) },
  ceiling: { normal: vec(0, -1, 0), uAxis: vec(1, 0, 0), vAxis: vec(0, 0, 1) },
  wallX0: { normal: vec(1, 0, 0), uAxis: vec(0, 0, 1), vAxis: vec(0, 1, 0) },
  wallX1: { normal: vec(-1, 0, 0), uAxis: vec(0, 0, 1), vAxis: vec(0, 1, 0) },
  wallZ0: { normal: vec(0, 0, 1), uAxis: vec(1, 0, 0), vAxis: vec(0, 1, 0) },
  wallZ1: { normal: vec(0, 0, -1), uAxis: vec(1, 0, 0), vAxis: vec(0, 1, 0) },
};

const LIFT = 0.01; // draw fixes just in front of their surface so they don't flicker against it

/** The room point at surface coordinates (u, v): the inverse of toSurfaceCoords. */
export function surfacePoint(dims: Dims, surface: SurfaceId, u: number, v: number): Vec3 {
  switch (surface) {
    case 'floor':
      return vec(u, 0, v);
    case 'ceiling':
      return vec(u, dims.height, v);
    case 'wallX0':
      return vec(0, v, u);
    case 'wallX1':
      return vec(dims.length, v, u);
    case 'wallZ0':
      return vec(u, v, 0);
    case 'wallZ1':
      return vec(u, v, dims.width);
  }
}

export function surfaceQuad(dims: Dims, surface: SurfaceId): Quad {
  const size = surfaceSize(dims, surface);
  return { ...AXES[surface], center: surfacePoint(dims, surface, size.u / 2, size.v / 2), width: size.u, height: size.v };
}

export function fixQuad(dims: Dims, fix: Fix): Quad {
  const surface = fixSurface(fix);
  const axes = AXES[surface];
  const [u, v, width, height] =
    fix.kind === 'rug'
      ? [fix.x, fix.z, RUG_SIZES[fix.size].x, RUG_SIZES[fix.size].z]
      : [fix.u, fix.v, PANEL_SIZE.u, PANEL_SIZE.v];
  const p = surfacePoint(dims, surface, u, v);
  const n = axes.normal;
  return { ...axes, center: vec(p.x + n.x * LIFT, p.y + n.y * LIFT, p.z + n.z * LIFT), width, height };
}

export type CameraPreset = 'top' | 'corner' | 'listener';

export function cameraPreset(room: RoomState, preset: CameraPreset): { position: Vec3; target: Vec3 } {
  const { length: L, width: W, height: H } = room.dims;
  switch (preset) {
    case 'top': // the tiny z offset keeps "looking straight down" well-defined for the orbit controls
      return { position: vec(L / 2, H + 1.3 * Math.max(L, W), W / 2 + 0.01), target: vec(L / 2, 0, W / 2) };
    case 'corner':
      return { position: vec(1.45 * L, 1.7 * H, 1.45 * W), target: vec(L / 2, H / 3, W / 2) };
    case 'listener':
      return {
        position: vec(room.listener.x, room.listener.y, room.listener.z),
        target: vec(room.speaker.x, room.speaker.y, room.speaker.z),
      };
  }
}
```

- [ ] **Step 5: Run the tests, check and commit**

Run: `npx vitest run src/lib/scene/layout.test.ts` (PASS), then `npm test` and `npx tsc --noEmit`.
```powershell
git add package.json package-lock.json src/lib/scene
git commit -m "feat: scene colours and layout maths" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: three.js room objects

**Files:**
- Create: `src/lib/scene/objects.ts`, `src/lib/scene/objects.test.ts`

**Interfaces:**
- Consumes: `surfaceQuad`, `fixQuad`, `Quad` (Task 5); colours; `listenerYaw` (`acoustics/binaural.ts`); `DragTarget` (Task 3).
- Produces:
  ```ts
  type Handle = DragTarget | { kind: 'panel'; index: number }   // stored as mesh.userData.handle
  buildShell(room): THREE.Group      // 6 surface meshes (name = SurfaceId, userData.surface), 'edges', 'grid'
  buildSpeaker(): THREE.Mesh         // name 'speaker', userData.handle {kind:'speaker'}
  buildListener(): THREE.Group       // name 'listener'; head + nose, each with userData.handle {kind:'listener'}
  placeSpeaker(object, room): void
  placeListener(object, room): void  // position + rotation.y = −yaw
  buildFixes(room): THREE.Group      // one mesh per fix, in order, userData.handle {kind, index}; off fixes at opacity 0.25
  disposeTree(object): void
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scene/objects.test.ts`:
```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { SURFACE_IDS, type RoomState } from '@/lib/room/types';
import { MATERIAL_COLORS } from './colors';
import { surfaceQuad } from './layout';
import { buildFixes, buildListener, buildShell, buildSpeaker, placeListener, placeSpeaker } from './objects';

describe('buildShell', () => {
  it('has one tagged, tinted surface per room surface at its centre', () => {
    const room = defaultRoom();
    const shell = buildShell(room);
    for (const surface of SURFACE_IDS) {
      const mesh = shell.getObjectByName(surface) as THREE.Mesh;
      const c = surfaceQuad(room.dims, surface).center;
      expect(mesh.userData.surface).toBe(surface);
      expect(mesh.position.toArray()).toEqual([c.x, c.y, c.z]);
      expect((mesh.material as THREE.MeshBasicMaterial).color.getHex()).toBe(MATERIAL_COLORS[room.surfaces[surface]]);
    }
    expect(shell.getObjectByName('edges')).toBeDefined();
    expect(shell.getObjectByName('grid')).toBeDefined();
  });

  it('turns each surface to face into the room and sizes it to the surface', () => {
    const room = defaultRoom();
    const shell = buildShell(room);
    for (const surface of SURFACE_IDS) {
      const mesh = shell.getObjectByName(surface) as THREE.Mesh;
      const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(mesh.quaternion);
      const quad = surfaceQuad(room.dims, surface);
      expect(facing.x).toBeCloseTo(quad.normal.x, 9);
      expect(facing.y).toBeCloseTo(quad.normal.y, 9);
      expect(facing.z).toBeCloseTo(quad.normal.z, 9);
      const { width, height } = (mesh.geometry as THREE.PlaneGeometry).parameters;
      expect([width, height]).toEqual([quad.width, quad.height]);
    }
  });
});

describe('handles', () => {
  it('places the speaker and tags it as draggable', () => {
    const room = defaultRoom();
    const speaker = buildSpeaker();
    placeSpeaker(speaker, room);
    expect(speaker.position.toArray()).toEqual([0.6, 1.0, 1.4]);
    expect(speaker.userData.handle).toEqual({ kind: 'speaker' });
  });

  it('turns the listener to face the speaker', () => {
    const room = defaultRoom();
    const listener = buildListener();
    placeListener(listener, room);
    const facing = new THREE.Vector3(1, 0, 0).applyEuler(listener.rotation);
    const toSpeaker = new THREE.Vector3(room.speaker.x - room.listener.x, 0, room.speaker.z - room.listener.z).normalize();
    expect(facing.x).toBeCloseTo(toSpeaker.x, 9);
    expect(facing.z).toBeCloseTo(toSpeaker.z, 9);
    for (const part of listener.children) expect(part.userData.handle).toEqual({ kind: 'listener' });
  });

  it('tags fixes with their index and fades switched-off ones', () => {
    const room: RoomState = {
      ...defaultRoom(),
      fixes: [
        { kind: 'panel', wall: 'wallZ1', u: 0.5, v: 1.2, on: true },
        { kind: 'rug', size: 'M', x: 2, z: 1.75, on: false },
      ],
    };
    const fixes = buildFixes(room);
    expect(fixes.children.map((m) => m.userData.handle)).toEqual([
      { kind: 'panel', index: 0 },
      { kind: 'rug', index: 1 },
    ]);
    expect(((fixes.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity).toBe(0.9);
    expect(((fixes.children[1] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity).toBe(0.25);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scene/objects.test.ts`
Expected: FAIL — cannot resolve `./objects`.

- [ ] **Step 3: Implement**

Create `src/lib/scene/objects.ts`:
```ts
import * as THREE from 'three';
import { listenerYaw } from '@/lib/acoustics/binaural';
import type { DragTarget } from '@/lib/room/placement';
import { SURFACE_IDS, type RoomState, type SurfaceId } from '@/lib/room/types';
import { LISTENER_COLOR, MATERIAL_COLORS, SPEAKER_COLOR } from './colors';
import { fixQuad, surfaceQuad, type Quad } from './layout';

/** What a mesh stands for when it's picked: stored in `userData.handle`. */
export type Handle = DragTarget | { kind: 'panel'; index: number };

/** Orient a plane-shaped object (built in XY, facing +Z) onto a quad. */
function placeOnQuad(object: THREE.Object3D, quad: Quad): void {
  const u = new THREE.Vector3(quad.uAxis.x, quad.uAxis.y, quad.uAxis.z);
  const n = new THREE.Vector3(quad.normal.x, quad.normal.y, quad.normal.z);
  const v = new THREE.Vector3().crossVectors(n, u); // keeps the basis right-handed, so it's a pure rotation
  object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u, v, n));
  object.position.set(quad.center.x, quad.center.y, quad.center.z);
}

/** Translucent surfaces tinted by material, the room's edges and a floor grid. Rebuild when size or materials change. */
export function buildShell(room: RoomState): THREE.Group {
  const group = new THREE.Group();
  group.name = 'shell';
  for (const surface of SURFACE_IDS) {
    const quad = surfaceQuad(room.dims, surface);
    const material = new THREE.MeshBasicMaterial({
      color: MATERIAL_COLORS[room.surfaces[surface]],
      transparent: true,
      opacity: surface === 'floor' ? 0.55 : 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(quad.width, quad.height), material);
    placeOnQuad(mesh, quad);
    mesh.name = surface;
    mesh.userData = { surface } satisfies { surface: SurfaceId };
    group.add(mesh);
  }

  const { length: L, width: W, height: H } = room.dims;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)),
    new THREE.LineBasicMaterial({ color: 0x9ca3af }),
  );
  edges.position.set(L / 2, H / 2, W / 2);
  edges.name = 'edges';
  group.add(edges);

  const size = Math.max(L, W);
  const grid = new THREE.GridHelper(size, Math.ceil(size), 0x52525b, 0x3f3f46);
  grid.position.set(L / 2, 0.002, W / 2);
  grid.name = 'grid';
  group.add(grid);
  return group;
}

export function buildSpeaker(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), new THREE.MeshBasicMaterial({ color: SPEAKER_COLOR }));
  mesh.name = 'speaker';
  mesh.userData = { handle: { kind: 'speaker' } satisfies Handle };
  return mesh;
}

export function buildListener(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'listener';
  const material = new THREE.MeshBasicMaterial({ color: LISTENER_COLOR });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), material);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.1, 12), material);
  nose.rotation.z = -Math.PI / 2; // the cone points along +x: the facing direction at yaw 0
  nose.position.x = 0.13;
  for (const part of [head, nose]) {
    part.userData = { handle: { kind: 'listener' } satisfies Handle };
    group.add(part);
  }
  return group;
}

export function placeSpeaker(object: THREE.Object3D, room: RoomState): void {
  object.position.set(room.speaker.x, room.speaker.y, room.speaker.z);
}

/** Position the listener and turn them to face where they're facing (three.js yaw is the negative of ours). */
export function placeListener(object: THREE.Object3D, room: RoomState): void {
  object.position.set(room.listener.x, room.listener.y, room.listener.z);
  object.rotation.y = -listenerYaw(room.listener, room.speaker);
}

/** One mesh per fix, in order; switched-off fixes are drawn faint. */
export function buildFixes(room: RoomState): THREE.Group {
  const group = new THREE.Group();
  group.name = 'fixes';
  room.fixes.forEach((fix, index) => {
    const quad = fixQuad(room.dims, fix);
    const material = new THREE.MeshBasicMaterial({
      color: MATERIAL_COLORS[fix.kind === 'rug' ? 'rug' : 'acousticPanel'],
      transparent: true,
      opacity: fix.on ? 0.9 : 0.25,
      side: THREE.DoubleSide,
    });
    const geometry =
      fix.kind === 'rug'
        ? new THREE.PlaneGeometry(quad.width, quad.height)
        : new THREE.BoxGeometry(quad.width, quad.height, 0.04);
    const mesh = new THREE.Mesh(geometry, material);
    placeOnQuad(mesh, quad);
    const handle: Handle = fix.kind === 'rug' ? { kind: 'rug', index } : { kind: 'panel', index };
    mesh.userData = { handle };
    group.add(mesh);
  });
  return group;
}

/** Free the GPU resources of everything under an object. */
export function disposeTree(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
```

- [ ] **Step 4: Run the tests, check and commit**

Run: `npx vitest run src/lib/scene/objects.test.ts` (PASS), then `npm test` and `npx tsc --noEmit`.
```powershell
git add src/lib/scene/objects.ts src/lib/scene/objects.test.ts
git commit -m "feat: three.js room shell, handles and fixes" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Sound rays — buffers and the pulse shader

**Files:**
- Create: `src/lib/scene/rayBuffers.ts`, `src/lib/scene/rayBuffers.test.ts`, `src/lib/scene/RaysObject.ts`, `src/lib/scene/RaysObject.test.ts`

**Interfaces:**
- Consumes: `RayPath` (Task 2), `RAY_COLOR`.
- Produces:
  - `buildRayBuffers(paths: RayPath[]): { positions: Float32Array; arc: Float32Array; energy: Float32Array; strength: Float32Array; maxArc: number }`. There is one line segment per path leg: 2 vertices, 3 floats each in `positions`, and 1 float per vertex in the others.
    - `arc`: metres travelled from the speaker.
    - `energy`: `vertexEnergy` of the leg's start point, constant along the leg.
    - `strength`: the path's energy relative to the strongest on a 30 dB log scale, 0 to 1.
  - `PULSE_SPEED = 343 / 200`, and `class RaysObject { readonly object: THREE.LineSegments; setPaths(paths): void; tick(seconds: number): void; get front(): number; dispose(): void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/scene/rayBuffers.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RayPath } from '@/lib/acoustics/rays';
import { buildRayBuffers } from './rayBuffers';

const direct: RayPath = { points: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }], energy: 0.04, vertexEnergy: [1, 1], hitFix: [] };
const bounce: RayPath = {
  points: [{ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 2 }, { x: 0, y: 1, z: 4 }],
  energy: 0.04 * 10 ** -1.5, // 15 dB below the direct path
  vertexEnergy: [1, 0.7, 0.7],
  hitFix: [true],
};

describe('buildRayBuffers', () => {
  it('makes one segment per leg with the distance travelled at each end', () => {
    const b = buildRayBuffers([direct, bounce]);
    expect(b.positions).toHaveLength(3 * 6); // 1 + 2 legs
    expect(Array.from(b.arc.slice(0, 2))).toEqual([0, 5]);
    const leg = Math.hypot(1, 2);
    expect(b.arc[2]).toBeCloseTo(0, 6);
    expect(b.arc[3]).toBeCloseTo(leg, 6);
    expect(b.arc[4]).toBeCloseTo(leg, 6);
    expect(b.arc[5]).toBeCloseTo(2 * leg, 6);
    expect(b.maxArc).toBeCloseTo(5, 6);
  });

  it('carries the energy left after each bounce along the following leg', () => {
    const b = buildRayBuffers([bounce]);
    expect(Array.from(b.energy)).toEqual([1, 1, Math.fround(0.7), Math.fround(0.7)]);
  });

  it('ranks paths on a 30 dB scale relative to the strongest', () => {
    const b = buildRayBuffers([direct, bounce]);
    expect(b.strength[0]).toBeCloseTo(1, 6);
    expect(b.strength[2]).toBeCloseTo(0.5, 6);
  });

  it('handles no paths', () => {
    const b = buildRayBuffers([]);
    expect(b.positions).toHaveLength(0);
    expect(b.maxArc).toBe(0);
  });
});
```

Create `src/lib/scene/RaysObject.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RayPath } from '@/lib/acoustics/rays';
import { PULSE_SPEED, RaysObject } from './RaysObject';

const direct: RayPath = { points: [{ x: 0, y: 1, z: 0 }, { x: 3, y: 1, z: 4 }], energy: 0.04, vertexEnergy: [1, 1], hitFix: [] };

describe('RaysObject', () => {
  it('uploads one vertex pair per leg', () => {
    const rays = new RaysObject();
    rays.setPaths([direct]);
    expect(rays.object.geometry.getAttribute('position').count).toBe(2);
    expect(rays.object.geometry.getAttribute('arc').count).toBe(2);
    rays.dispose();
  });

  it('moves the pulse front at the slowed speed of sound and loops after a pause', () => {
    const rays = new RaysObject();
    rays.setPaths([direct]);
    rays.tick(1);
    expect(rays.front).toBeCloseTo(PULSE_SPEED, 9);
    const loop = 5 / PULSE_SPEED + 0.8;
    rays.tick(loop + 0.5);
    expect(rays.front).toBeCloseTo(0.5 * PULSE_SPEED, 6);
    rays.dispose();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/scene/rayBuffers.test.ts src/lib/scene/RaysObject.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the buffers**

Create `src/lib/scene/rayBuffers.ts`:
```ts
import type { RayPath } from '@/lib/acoustics/rays';

export type RayBuffers = {
  positions: Float32Array; // 2 vertices per leg
  arc: Float32Array; // metres travelled from the speaker, per vertex
  energy: Float32Array; // energy left on the leg, per vertex
  strength: Float32Array; // path strength relative to the strongest, 0..1, per vertex
  maxArc: number; // longest path, metres
};

const RANGE_DB = 30;

export function buildRayBuffers(paths: RayPath[]): RayBuffers {
  const legs = paths.reduce((n, p) => n + p.points.length - 1, 0);
  const positions = new Float32Array(legs * 6);
  const arc = new Float32Array(legs * 2);
  const energy = new Float32Array(legs * 2);
  const strength = new Float32Array(legs * 2);
  const strongest = paths.reduce((m, p) => Math.max(m, p.energy), 0);

  let leg = 0;
  let maxArc = 0;
  for (const path of paths) {
    const db = strongest > 0 && path.energy > 0 ? 10 * Math.log10(path.energy / strongest) : -Infinity;
    const relative = Math.min(1, Math.max(0, 1 + db / RANGE_DB));
    let travelled = 0;
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], leg * 6);
      arc[leg * 2] = travelled;
      arc[leg * 2 + 1] = travelled + length;
      energy[leg * 2] = energy[leg * 2 + 1] = path.vertexEnergy[i];
      strength[leg * 2] = strength[leg * 2 + 1] = relative;
      travelled += length;
      leg++;
    }
    maxArc = Math.max(maxArc, travelled);
  }
  return { positions, arc, energy, strength, maxArc };
}
```

- [ ] **Step 4: Implement the rays object**

Create `src/lib/scene/RaysObject.ts`:
```ts
import * as THREE from 'three';
import type { RayPath } from '@/lib/acoustics/rays';
import { RAY_COLOR } from './colors';
import { buildRayBuffers } from './rayBuffers';

export const PULSE_SPEED = 343 / 200; // metres of path per second: sound slowed 200× so the eye can follow
const PAUSE_SECONDS = 0.8; // gap before the next pulse leaves the speaker

const vertexShader = /* glsl */ `
  attribute float arc;
  attribute float energy;
  attribute float strength;
  varying float vArc;
  varying float vEnergy;
  varying float vStrength;
  void main() {
    vArc = arc;
    vEnergy = energy;
    vStrength = strength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uFront;
  uniform vec3 uColor;
  varying float vArc;
  varying float vEnergy;
  varying float vStrength;
  void main() {
    float behind = uFront - vArc;                          // metres since the pulse passed this point
    float pulse = behind < 0.0 ? 0.0 : exp(-behind / 0.5); // bright head with a short fading trail
    float level = (0.08 + pulse) * vEnergy * (0.25 + 0.75 * vStrength);
    gl_FragColor = vec4(uColor * level, level);
  }
`;

/** Every ray path as one batched line object; a bright pulse travels from the speaker along all of them. */
export class RaysObject {
  readonly object: THREE.LineSegments;
  private readonly material: THREE.ShaderMaterial;
  private loopSeconds = 1;

  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uFront: { value: 0 }, uColor: { value: new THREE.Color(RAY_COLOR) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.LineSegments(new THREE.BufferGeometry(), this.material);
    this.object.frustumCulled = false;
    this.object.name = 'rays';
  }

  setPaths(paths: RayPath[]): void {
    const b = buildRayBuffers(paths);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(b.positions, 3));
    geometry.setAttribute('arc', new THREE.BufferAttribute(b.arc, 1));
    geometry.setAttribute('energy', new THREE.BufferAttribute(b.energy, 1));
    geometry.setAttribute('strength', new THREE.BufferAttribute(b.strength, 1));
    this.object.geometry.dispose();
    this.object.geometry = geometry;
    this.loopSeconds = b.maxArc / PULSE_SPEED + PAUSE_SECONDS;
  }

  /** Advance the pulse; `seconds` is any steadily increasing clock. */
  tick(seconds: number): void {
    this.material.uniforms.uFront.value = (seconds % this.loopSeconds) * PULSE_SPEED;
  }

  /** How far the pulse has travelled along every path, in metres. */
  get front(): number {
    return this.material.uniforms.uFront.value as number;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
  }
}
```

- [ ] **Step 5: Run the tests, check and commit**

Run: `npx vitest run src/lib/scene` (PASS), then `npm test` and `npx tsc --noEmit`.
```powershell
git add src/lib/scene/rayBuffers.ts src/lib/scene/rayBuffers.test.ts src/lib/scene/RaysObject.ts src/lib/scene/RaysObject.test.ts
git commit -m "feat: batched sound-ray lines with a travelling pulse" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The 3D view — scene controller, React view, page layout

**Files:**
- Create: `src/lib/scene/RoomScene.ts`, `src/components/RoomView.tsx`
- Modify: `src/app/room/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–7; `useRoomStore`; `ListenMode`; `withoutFixes`.
- Produces:
  ```ts
  type SceneCallbacks = { onDrag(target: DragTarget, point: Vec3): void; onWallTap(wall: WallId, point: Vec3): void };
  class RoomScene {
    constructor(canvas: HTMLCanvasElement, callbacks: SceneCallbacks);
    setRoom(room): void; setPaths(paths): void; setRaysVisible(v): void; setPlacingPanel(v): void;
    setCameraPreset(room, preset): void; resize(w, h): void; dispose(): void;
  }
  RoomView({ mode }: { mode: ListenMode })
  ```
  `RoomScene` is browser-only (WebGL) and is checked in the browser, not in Node.

How input works:
- **Drags:** the scene listens for `pointerdown` in the capture phase, so it sees the press before OrbitControls. If the press lands on the speaker, the listener or the rug, it disables the orbit controls and drags that item. Dragging moves along a horizontal plane at the item's height, so the item stays under the finger. `RoomView` applies each drag through `applyDrag`, which clamps.
- **Panel taps:** in "place panel" mode, a press-and-release under 6 px picks the first wall whose inward side faces the camera. That's the wall you see from inside, not the one nearest the camera when you look in from outside. `RoomView` adds a panel there via `panelAt`, or refuses overlaps.
- **Rays:** `computeRayPaths` runs on the main thread on every room change, for the room as heard. Fixes apply only in "In your room / With fixes" mode.

- [ ] **Step 1: Write the scene controller**

Create `src/lib/scene/RoomScene.ts`:
```ts
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RayPath } from '@/lib/acoustics/rays';
import type { DragTarget } from '@/lib/room/placement';
import type { RoomState, Vec3, WallId } from '@/lib/room/types';
import { cameraPreset, type CameraPreset } from './layout';
import {
  buildFixes,
  buildListener,
  buildShell,
  buildSpeaker,
  disposeTree,
  placeListener,
  placeSpeaker,
  type Handle,
} from './objects';
import { RaysObject } from './RaysObject';

export type SceneCallbacks = {
  onDrag: (target: DragTarget, point: Vec3) => void;
  onWallTap: (wall: WallId, point: Vec3) => void;
};

const TAP_SLOP_PX = 6;
const FORWARD = new THREE.Vector3(0, 0, 1);

/** The 3D room: draws the shell, handles, fixes and rays, and turns pointer input into drags and wall taps. */
export class RoomScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly rays = new RaysObject();
  private readonly speaker = buildSpeaker();
  private readonly listener = buildListener();
  private shell: THREE.Group | null = null;
  private fixes: THREE.Group | null = null;
  private shellKey = '';
  private fixesKey = '';
  private framed = false;
  private placingPanel = false;
  private dragging: { target: DragTarget; plane: THREE.Plane } | null = null;
  private down: { x: number; y: number } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x0a0a0a);
    this.scene.add(this.speaker, this.listener, this.rays.object);
    // Capture phase: claim a drag before OrbitControls (a bubble-phase listener on the same canvas) starts orbiting.
    canvas.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.renderer.setAnimationLoop((time) => {
      this.controls.update();
      this.rays.tick(time / 1000);
      this.renderer.render(this.scene, this.camera);
    });
  }

  setRoom(room: RoomState): void {
    const shellKey = JSON.stringify([room.dims, room.surfaces]);
    if (shellKey !== this.shellKey) {
      if (this.shell) {
        this.scene.remove(this.shell);
        disposeTree(this.shell);
      }
      this.shell = buildShell(room);
      this.scene.add(this.shell);
      this.shellKey = shellKey;
    }
    const fixesKey = JSON.stringify([room.dims, room.fixes]);
    if (fixesKey !== this.fixesKey) {
      if (this.fixes) {
        this.scene.remove(this.fixes);
        disposeTree(this.fixes);
      }
      this.fixes = buildFixes(room);
      this.scene.add(this.fixes);
      this.fixesKey = fixesKey;
    }
    placeSpeaker(this.speaker, room);
    placeListener(this.listener, room);
    if (!this.framed) {
      this.setCameraPreset(room, 'corner');
      this.framed = true;
    }
  }

  setPaths(paths: RayPath[]): void {
    this.rays.setPaths(paths);
  }

  setRaysVisible(visible: boolean): void {
    this.rays.object.visible = visible;
  }

  setPlacingPanel(placing: boolean): void {
    this.placingPanel = placing;
    this.canvas.style.cursor = placing ? 'crosshair' : '';
  }

  setCameraPreset(room: RoomState, preset: CameraPreset): void {
    const { position, target } = cameraPreset(room, preset);
    this.camera.position.set(position.x, position.y, position.z);
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.update();
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown, { capture: true });
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerUp);
    this.controls.dispose();
    for (const object of [this.shell, this.fixes, this.speaker, this.listener]) if (object) disposeTree(object);
    this.rays.dispose();
    this.renderer.dispose();
  }

  private aim(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
    if (this.placingPanel) return;
    this.aim(event);
    const rugs = this.fixes?.children.filter((c) => (c.userData.handle as Handle).kind === 'rug') ?? [];
    const hit = this.raycaster.intersectObjects([this.speaker, this.listener, ...rugs], true)[0];
    const handle = hit?.object.userData.handle as Handle | undefined;
    if (!handle || handle.kind === 'panel') return;
    const height = handle.kind === 'speaker' ? this.speaker.position.y : handle.kind === 'listener' ? this.listener.position.y : 0;
    this.dragging = { target: handle, plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), -height) };
    this.controls.enabled = false;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.dragging) return;
    this.aim(event);
    const point = this.raycaster.ray.intersectPlane(this.dragging.plane, new THREE.Vector3());
    if (point) this.callbacks.onDrag(this.dragging.target, { x: point.x, y: point.y, z: point.z });
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const wasDragging = this.dragging !== null;
    if (wasDragging) {
      this.dragging = null;
      this.controls.enabled = true;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    }
    const moved = this.down ? Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) : Infinity;
    this.down = null;
    if (wasDragging || !this.placingPanel || event.type === 'pointercancel' || moved > TAP_SLOP_PX) return;

    // Take the first wall whose inside faces the camera: the one you see, even when looking in from outside.
    this.aim(event);
    const walls = this.shell?.children.filter((c) => String(c.userData.surface ?? '').startsWith('wall')) ?? [];
    const hit = this.raycaster.intersectObjects(walls, false).find((h) => {
      const inward = FORWARD.clone().applyQuaternion(h.object.quaternion);
      return inward.dot(this.raycaster.ray.direction) < 0;
    });
    if (hit) this.callbacks.onWallTap(hit.object.userData.surface as WallId, { x: hit.point.x, y: hit.point.y, z: hit.point.z });
  };
}
```

- [ ] **Step 2: Write the React view**

Create `src/components/RoomView.tsx`:
```tsx
'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { computeRayPaths } from '@/lib/acoustics/rays';
import { withoutFixes } from '@/lib/acoustics/simulate';
import type { ListenMode } from '@/lib/audio/mix';
import { LIMITS } from '@/lib/room/constants';
import { applyDrag, clampPosition, panelAt, panelOverlaps } from '@/lib/room/placement';
import { useRoomStore } from '@/lib/room/store';
import type { CameraPreset } from '@/lib/scene/layout';
import { RoomScene } from '@/lib/scene/RoomScene';

const PRESET_LABELS: Record<CameraPreset, string> = { top: 'Top', corner: 'Corner', listener: "Listener's view" };
const SPEAKER_HEIGHTS = [
  { label: 'On the floor', y: 0.4 },
  { label: 'On a desk', y: 1.0 },
  { label: 'On a stand', y: 1.2 },
];
const LISTENER_HEIGHTS = [
  { label: 'Seated', y: 1.1 },
  { label: 'Standing', y: 1.6 },
];
const buttonClass = 'rounded-md border border-neutral-700 px-3 py-1.5 disabled:opacity-40';

const subscribeNever = () => () => {};
let webglSupport: boolean | undefined;
/** Probed once and cached: React calls this on every render, and browsers cap how many WebGL contexts can live. */
function hasWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      webglSupport = gl !== null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

function HeightSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { label: string; y: number }[];
  value: number;
  onChange: (y: number) => void;
}) {
  const current = options.find((o) => Math.abs(o.y - value) < 0.005);
  return (
    <label className="flex items-center gap-1">
      <span className="text-neutral-400">{label}</span>
      <select
        value={current ? String(current.y) : 'custom'}
        onChange={(e) => {
          const y = Number(e.target.value);
          if (Number.isFinite(y)) onChange(y);
        }}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1"
      >
        {!current && <option value="custom">{value.toFixed(2)} m</option>}
        {options.map((o) => (
          <option key={o.label} value={String(o.y)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RoomView({ mode }: { mode: ListenMode }) {
  const webgl = useSyncExternalStore(subscribeNever, hasWebGL, () => true);
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<RoomScene | null>(null);
  const [raysOn, setRaysOn] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const withFixes = mode.room && mode.fixes;
  const paths = useMemo(() => computeRayPaths(withFixes ? room : withoutFixes(room)), [room, withFixes]);
  const panelCount = room.fixes.filter((f) => f.kind === 'panel').length;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!webgl || !canvas || !container) return;
    const scene = new RoomScene(canvas, {
      onDrag: (target, point) => update((r) => applyDrag(r, target, point)),
      onWallTap: (wall, point) => {
        let refused = false;
        update((r) => {
          const panel = panelAt(r.dims, wall, point);
          if (panelOverlaps(r, panel)) {
            refused = true;
            return r;
          }
          return { ...r, fixes: [...r.fixes, panel] };
        });
        setMessage(refused ? "Panels can't overlap. Tap an empty part of a wall." : null);
        if (!refused) setPlacing(false);
      },
    });
    sceneRef.current = scene;
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(container);
    return () => {
      observer.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [webgl, update]);

  useEffect(() => {
    sceneRef.current?.setRoom(room);
  }, [room, webgl]);

  useEffect(() => {
    sceneRef.current?.setPaths(paths);
  }, [paths, webgl]);

  useEffect(() => {
    sceneRef.current?.setRaysVisible(raysOn);
  }, [raysOn, webgl]);

  useEffect(() => {
    sceneRef.current?.setPlacingPanel(placing);
  }, [placing, webgl]);

  if (!webgl) {
    return (
      <p className="rounded-xl border border-neutral-800 p-4 text-sm text-neutral-400">
        The 3D view needs WebGL, which this browser doesn&apos;t provide. Use the number fields below to place the
        speaker, listener, rug and panels.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-2" aria-label="3D view of your room">
      <div ref={containerRef} className="relative h-[55vh] min-h-80 overflow-hidden rounded-xl border border-neutral-800">
        <canvas
          ref={canvasRef}
          className="block h-full w-full touch-none"
          aria-label="Your room in 3D. Drag the speaker, listener or rug to move them."
        />
        {placing && (
          <p className="pointer-events-none absolute inset-x-0 top-2 text-center text-sm text-amber-200">
            Tap a wall to place the panel
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {(Object.keys(PRESET_LABELS) as CameraPreset[]).map((preset) => (
          <button key={preset} onClick={() => sceneRef.current?.setCameraPreset(room, preset)} className={buttonClass}>
            {PRESET_LABELS[preset]}
          </button>
        ))}
        <button aria-pressed={raysOn} onClick={() => setRaysOn((v) => !v)} className={buttonClass}>
          {raysOn ? 'Hide rays' : 'Show rays'}
        </button>
        <button
          aria-pressed={placing}
          disabled={!placing && panelCount >= LIMITS.maxPanels}
          onClick={() => {
            setPlacing((v) => !v);
            setMessage(null);
          }}
          className={buttonClass}
        >
          {placing ? 'Cancel panel' : 'Place panel'}
        </button>
        <HeightSelect
          label="Speaker"
          options={SPEAKER_HEIGHTS}
          value={room.speaker.y}
          onChange={(y) => update((r) => ({ ...r, speaker: clampPosition(r.dims, { ...r.speaker, y }) }))}
        />
        <HeightSelect
          label="Listener"
          options={LISTENER_HEIGHTS}
          value={room.listener.y}
          onChange={(y) =>
            update((r) => ({ ...r, listener: { ...clampPosition(r.dims, { ...r.listener, y }), yaw: r.listener.yaw } }))
          }
        />
      </div>
      <p className="text-xs text-neutral-500">
        Drag the speaker (orange), the listener (blue) or the rug. One finger turns the view; two fingers zoom and pan.
        Rays show the room as you&apos;re hearing it.
      </p>
      {message && (
        <p role="status" className="text-sm text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Lay out the page**

In `src/app/room/page.tsx`, import `RoomView` from `@/components/RoomView` and replace the returned `<main>` with:
```tsx
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      {notice && <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">{notice}</p>}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:flex-1">
          <RoomView mode={mode} />
        </div>
        <div className="lg:w-80">
          <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
        </div>
      </div>
      <RoomForm />
    </main>
```

- [ ] **Step 4: Type-check, lint, test, build**

Run:
```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: no type errors; lint clean with no react-hooks warnings; all tests PASS; build succeeds with `out\room.html` present.

If `three/examples/jsm/controls/OrbitControls.js` doesn't resolve, use `three/addons/controls/OrbitControls.js` (the package's exports map provides both).

- [ ] **Step 5: Smoke-check the served build**

Run `npx --yes serve@latest out -l 4173` in the background. Confirm `/room` returns HTTP 200 (`Invoke-WebRequest http://localhost:4173/room -UseBasicParsing`), then stop the server. The controller does the browser walk-through:
- the room renders;
- dragging moves the speaker, listener and rug, and they stay inside;
- "Place panel" then a wall tap adds a panel, and an overlapping tap is refused;
- rays pulse and dim on the rug in "With fixes";
- the camera presets work;
- there are no console errors.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/scene/RoomScene.ts src/components/RoomView.tsx src/app/room/page.tsx
git commit -m "feat: 3D room view with draggable speaker, listener and rug, panel placement and sound rays" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
