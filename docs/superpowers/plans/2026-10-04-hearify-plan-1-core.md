# Hearify — Plan 1: Core "Hear Your Room" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static Next.js app where a user types in their room (size, materials, furnishing, speaker/listener positions, rug/panels), uploads a song, and hears it on headphones "dry", "in your room now" and "with fixes", with a shareable link.

**Architecture:** All acoustics run in the browser. A pure-TypeScript `acoustics` unit (image source method + band-shaped noise tail + spherical-head binaural cues) turns a `RoomState` into stereo impulse responses inside a Web Worker. An `audio` unit convolves the uploaded (mono-downmixed) song with those IRs using Web Audio and crossfades between modes. A zustand store holds the `RoomState`; a codec puts it in the URL fragment for sharing.

**Tech Stack:** Next.js (App Router, `output: 'export'`), React, TypeScript, Tailwind CSS, zustand, Vitest. Python + pyroomacoustics only for a one-off fixture script.

**Spec:** `docs/superpowers/specs/2026-10-04-hearify-design.md`

**Roadmap (this is Plan 1 of 5; each later plan gets its own document):**
1. **Core (this plan):** scaffold, room model, acoustics engine, worker, audio engine, URL sharing, form-based setup + player.
2. Clap calibration (`measure` unit, calibration factor solver, predicted-vs-measured UI).
3. 3D scene: three.js box view, draggable speaker/listener/fixes, sound rays (consumes `AcousticsResult.paths` from this plan).
4. Splat layer: load/IndexedDB storage, 3-step alignment, demo bedroom.
5. Landing with presets (recorded IRs), setup wizard + m/ft toggle, My rooms (localStorage), About/Privacy, Playwright E2E, Cloudflare Pages deploy.

## Global Constraints

- Static export only: `output: 'export'` in `next.config.ts`; no API routes, no server code.
- No user data leaves the device: never `fetch`/upload songs, mic audio, scans or room state. Share links put state in the URL **fragment** (`#…`) only.
- Coordinate frame: metres; origin at a floor corner; x along length, z along width, y up.
- Octave bands: 125, 250, 500, 1000, 2000, 4000 Hz (index 0–5). Mid RT60 = mean of 500 Hz and 1 kHz bands.
- Speed of sound: 343 m/s.
- Validation: length and width 1.5–30 m; height 2–15 m; speaker and listener ≥ 0.3 m from every wall, floor and ceiling; speaker–listener distance ≥ 0.5 m; ≤ 1 rug; ≤ 8 panels. Rug sizes S 1.2×1.8 m, M 1.6×2.3 m, L 2×3 m. Panels 0.6×1.2 m.
- Impulse responses are capped at 4 s.
- `src/lib/acoustics/**` must not touch the DOM or Web Audio (it runs in a worker and in Node tests). Type-only imports from `src/lib/room/types.ts` are allowed.
- Convolvers use `disableNormalization: true`; loudness matching is done by `normalizeIr`.
- A/B switches crossfade over 50 ms.
- Shell is Windows PowerShell; commands below are written for it.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>` (pass it as a second `-m`).

## Review Focus

1. **Tampered or old share links** (wrong types, `v: 2`, garbage base64, extra fields) → `decodeRoom` returns `null`, never throws, never passes unknown fields through. Tests: Task 10.
2. **Huge reverberant rooms** (30×30×15 m bare concrete, Eyring RT ≈ 17 s) → IR length capped at 4 s, every sample finite. Test: Task 8.
3. **Over-absorbed rooms** (all acoustic panels + full furnishing + calibration ×10, so mean α > 1) → finite, positive RT60 (Eyring clamps mean α to 0.99). Tests: Tasks 4 and 8.
4. **Hardware sample rate differs** (44.1 kHz vs 48 kHz) → IR is rendered at the AudioContext's rate, so the direct sound lands at `distance / 343 × sampleRate`. Test: Task 8.
5. **Speaker and listener almost touching, or hugging a wall** → validation error shown, worker refuses to simulate (returns an error, no NaNs). Tests: Tasks 2 and 9.

---

## File Structure

```
next.config.ts                     static export
vitest.config.ts                   test runner config, @ alias
scripts/make_pra_fixtures.py       one-off pyroomacoustics reference generator
src/
  app/
    layout.tsx                     metadata, dark body
    globals.css                    tailwind import
    page.tsx                       minimal landing → /room
    room/page.tsx                  setup form + player + share; reads #fragment
  components/
    RoomForm.tsx                   inputs bound to the store, shows validation errors
    Player.tsx                     song picker, play/pause, A/B toggles, room card
    ShareButton.tsx                copies share link
    useSimulation.ts               debounced worker calls → {now, withFixes}
  lib/
    room/
      types.ts                     RoomState and id unions
      constants.ts                 LIMITS, RUG_SIZES, PANEL_SIZE
      geometry.ts                  surface sizes/coords, fix rectangles
      roomState.ts                 defaultRoom, validateRoom
      urlCodec.ts                  encodeRoom/decodeRoom/migrate
      store.ts                     zustand store
      rating.ts                    RT60 → plain-language label
    acoustics/
      bands.ts                     band constants, air absorption, speed of sound
      materials.ts                 absorption tables, furnishing
      absorption.ts                surface lookup (fix-aware), total absorption area
      reverbTime.ts                volume, surface area, Sabine, Eyring, mid RT60
      imageSource.ts               shoebox image source method with hit points
      dsp.ts                       FFT, RNG, band masks, band noise
      binaural.ts                  yaw, ITD/ILD per arrival
      simulate.ts                  RoomState → AcousticsResult (IR, paths, RT60)
      protocol.ts                  worker request/response handling
      worker.ts                    Web Worker entry
      client.ts                    main-thread worker wrapper
      __fixtures__/pra-images.json reference image sources from pyroomacoustics
    audio/
      mix.ts                       pure helpers: mode gains, downmix, IR normalisation
      engine.ts                    AudioEngine (Web Audio graph)
```

Tests sit next to their modules as `*.test.ts`.

---

### Task 1: Scaffold the Next.js app with Vitest and static export

**Files:**
- Create (generated): `package.json`, `tsconfig.json`, `src/app/*`, `eslint.config.mjs`, `.gitignore`, etc.
- Create: `vitest.config.ts`
- Modify: `next.config.ts`, `.gitignore`

**Interfaces:**
- Produces: `npm test` (Vitest, runs `src/**/*.test.ts`), `npm run build` (static export to `out/`), `@/*` alias → `src/*` in both Next and Vitest.

- [ ] **Step 1: Generate the app in a temporary subfolder**

The folder name "Hearify" is not a valid npm package name, so scaffold into `hearify/` and move the files up.

Run:
```powershell
npx create-next-app@latest hearify --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --skip-install --yes
```
Expected: "Success! Created hearify".

- [ ] **Step 2: Move the generated files to the repo root**

Run:
```powershell
if (Test-Path hearify\.git) { Remove-Item -Recurse -Force hearify\.git }
Get-ChildItem -Force hearify | Move-Item -Destination .
Remove-Item hearify
Get-ChildItem -Force
```
Expected: `package.json`, `src`, `next.config.ts`, `docs`, `.git` at the root.

- [ ] **Step 3: Install dependencies**

Run:
```powershell
npm install
npm install zustand
npm install -D vitest
npm pkg set scripts.test="vitest run"
npm pkg set scripts.test:watch="vitest"
```

- [ ] **Step 4: Configure static export**

Replace `next.config.ts` with:
```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
```

- [ ] **Step 5: Configure Vitest**

Create `vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 6: Ignore Python artefacts**

Append to `.gitignore`:
```
# python
__pycache__/
.venv/
```

- [ ] **Step 7: Verify test runner and build**

Run: `npm test`
Expected: exits 0 with "No test files found".

Run: `npm run build`
Expected: build succeeds and `out/index.html` exists (`Test-Path out\index.html` → `True`).

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "chore: scaffold Next.js app with Vitest and static export" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Room model — types, constants, geometry, validation

**Files:**
- Create: `src/lib/room/types.ts`, `src/lib/room/constants.ts`, `src/lib/room/geometry.ts`, `src/lib/room/roomState.ts`
- Test: `src/lib/room/roomState.test.ts`

**Interfaces:**
- Produces:
  - Types `Vec3`, `MaterialId`, `WallId`, `SurfaceId`, `Furnishing`, `RugSize`, `RugFix`, `PanelFix`, `Fix`, `RoomState`, `Dims`; const arrays `MATERIAL_IDS`, `WALL_IDS`, `SURFACE_IDS`.
  - `LIMITS`, `RUG_SIZES: Record<RugSize, {x:number; z:number}>`, `PANEL_SIZE: {u:number; v:number}`.
  - `surfaceSize(dims: Dims, surface: SurfaceId): {u:number; v:number}`
  - `toSurfaceCoords(surface: SurfaceId, p: Vec3): {u:number; v:number}`
  - `fixSurface(fix: Fix): SurfaceId`, `fixRect(fix: Fix): Rect`, `rectContains(r: Rect, u: number, v: number): boolean`, `clippedArea(r: Rect, size: {u:number; v:number}): number`, `fixFits(dims: Dims, fix: Fix): boolean`
  - `defaultRoom(): RoomState`, `validateRoom(room: RoomState): RoomError[]` where `RoomError = { field: string; message: string }`.

Surface 2-D coordinates: floor/ceiling `u = x, v = z`; `wallX0`/`wallX1` (planes x = 0 / x = length) `u = z, v = y`; `wallZ0`/`wallZ1` (planes z = 0 / z = width) `u = x, v = y`.

- [ ] **Step 1: Write the types and constants (no behaviour to test yet)**

Create `src/lib/room/types.ts`:
```ts
export type Vec3 = { x: number; y: number; z: number };

export const MATERIAL_IDS = [
  'drywall',
  'brick',
  'concrete',
  'glass',
  'woodFloor',
  'carpet',
  'tile',
  'curtains',
  'plaster',
  'woodPanel',
  'acousticPanel',
  'rug',
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** wallX0/wallX1 are the planes x = 0 and x = length; wallZ0/wallZ1 are z = 0 and z = width. */
export const WALL_IDS = ['wallX0', 'wallX1', 'wallZ0', 'wallZ1'] as const;
export type WallId = (typeof WALL_IDS)[number];

export const SURFACE_IDS = ['floor', 'ceiling', ...WALL_IDS] as const;
export type SurfaceId = (typeof SURFACE_IDS)[number];

export type Furnishing = 'bare' | 'some' | 'full';
export type RugSize = 'S' | 'M' | 'L';

/** Rug centred at (x, z) on the floor, long side along x. */
export type RugFix = { kind: 'rug'; size: RugSize; x: number; z: number; on: boolean };
/** Panel centred at (u, v) in the wall's own coordinates. */
export type PanelFix = { kind: 'panel'; wall: WallId; u: number; v: number; on: boolean };
export type Fix = RugFix | PanelFix;

export type Dims = { length: number; width: number; height: number };

export type RoomState = {
  v: 1;
  name: string;
  dims: Dims;
  surfaces: Record<SurfaceId, MaterialId>;
  furnishing: Furnishing;
  speaker: Vec3;
  listener: Vec3 & { yaw: number | 'faceSpeaker' };
  fixes: Fix[];
  calibration: { factor: number; measuredRt60?: number };
};
```

Create `src/lib/room/constants.ts`:
```ts
import type { RugSize } from './types';

export const LIMITS = {
  minLengthWidth: 1.5,
  maxLengthWidth: 30,
  minHeight: 2,
  maxHeight: 15,
  wallClearance: 0.3,
  minSeparation: 0.5,
  maxRugs: 1,
  maxPanels: 8,
} as const;

/** Rug footprint: x = extent along the room length, z = extent along the width. */
export const RUG_SIZES: Record<RugSize, { x: number; z: number }> = {
  S: { x: 1.8, z: 1.2 },
  M: { x: 2.3, z: 1.6 },
  L: { x: 3.0, z: 2.0 },
};

/** Panel size: u = width along the wall, v = height. */
export const PANEL_SIZE = { u: 0.6, v: 1.2 } as const;
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/room/roomState.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { clippedArea, fixFits, fixRect, surfaceSize, toSurfaceCoords } from './geometry';
import { defaultRoom, validateRoom } from './roomState';
import type { Fix, RoomState } from './types';

const fields = (room: RoomState) => validateRoom(room).map((e) => e.field);
const rug = (x: number, z: number, size: 'S' | 'M' | 'L' = 'M'): Fix => ({ kind: 'rug', size, x, z, on: true });
const panel = (u: number, v: number): Fix => ({ kind: 'panel', wall: 'wallZ1', u, v, on: true });

describe('geometry', () => {
  const dims = { length: 4, width: 3.5, height: 2.6 };

  it('sizes each surface in its own u/v coordinates', () => {
    expect(surfaceSize(dims, 'floor')).toEqual({ u: 4, v: 3.5 });
    expect(surfaceSize(dims, 'wallX0')).toEqual({ u: 3.5, v: 2.6 });
    expect(surfaceSize(dims, 'wallZ1')).toEqual({ u: 4, v: 2.6 });
  });

  it('maps 3-D points to surface coordinates', () => {
    const p = { x: 1, y: 2, z: 3 };
    expect(toSurfaceCoords('ceiling', p)).toEqual({ u: 1, v: 3 });
    expect(toSurfaceCoords('wallX1', p)).toEqual({ u: 3, v: 2 });
    expect(toSurfaceCoords('wallZ0', p)).toEqual({ u: 1, v: 2 });
  });

  it('builds fix rectangles centred on the fix', () => {
    const expectRect = (actual: ReturnType<typeof fixRect>, expected: ReturnType<typeof fixRect>) => {
      for (const k of ['u0', 'u1', 'v0', 'v1'] as const) expect(actual[k]).toBeCloseTo(expected[k], 9);
    };
    expectRect(fixRect(rug(2, 1.75)), { u0: 0.85, u1: 3.15, v0: 0.95, v1: 2.55 });
    expectRect(fixRect(panel(2, 1.2)), { u0: 1.7, u1: 2.3, v0: 0.6, v1: 1.8 });
  });

  it('clips areas to the surface', () => {
    expect(clippedArea({ u0: -1, u1: 1, v0: 0, v1: 1 }, { u: 4, v: 4 })).toBeCloseTo(1, 9);
  });

  it('checks whether a fix fits on its surface', () => {
    expect(fixFits(dims, rug(2, 1.75))).toBe(true);
    expect(fixFits({ length: 2.5, width: 2.5, height: 2.6 }, rug(1.25, 1.25, 'L'))).toBe(false);
    expect(fixFits(dims, panel(2, 2.3))).toBe(false);
  });
});

describe('validateRoom', () => {
  it('accepts the default room', () => {
    expect(validateRoom(defaultRoom())).toEqual([]);
  });

  it('rejects dimensions out of range or not numbers', () => {
    const room = defaultRoom();
    expect(fields({ ...room, dims: { ...room.dims, length: 1.4 } })).toEqual(['dims.length']);
    expect(fields({ ...room, dims: { ...room.dims, width: 31 } })).toEqual(['dims.width']);
    expect(fields({ ...room, dims: { ...room.dims, height: 1.9 } })).toEqual(['dims.height']);
    expect(fields({ ...room, dims: { ...room.dims, length: Number.NaN } })).toEqual(['dims.length']);
  });

  it('requires 0.3 m clearance from walls, floor and ceiling', () => {
    const room = defaultRoom();
    expect(fields({ ...room, speaker: { ...room.speaker, x: 0.2 } })).toContain('speaker');
    expect(fields({ ...room, listener: { ...room.listener, y: 2.4 } })).toContain('listener');
  });

  it('requires 0.5 m between speaker and listener', () => {
    const room = defaultRoom();
    const near: RoomState = { ...room, listener: { ...room.speaker, x: room.speaker.x + 0.4, yaw: 'faceSpeaker' } };
    expect(fields(near)).toEqual(['listener']);
  });

  it('allows at most one rug and eight panels', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [rug(2, 1.75), rug(2, 1.75)] })).toEqual(['fixes']);
    expect(fields({ ...room, fixes: Array.from({ length: 9 }, () => panel(2, 1.2)) })).toEqual(['fixes']);
  });

  it('rejects fixes that do not fit', () => {
    const room = defaultRoom();
    expect(fields({ ...room, fixes: [rug(0.5, 1.75)] })).toEqual(['fixes.0']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/roomState.test.ts`
Expected: FAIL — cannot resolve `./geometry` / `./roomState`.

- [ ] **Step 4: Implement geometry**

Create `src/lib/room/geometry.ts`:
```ts
import { PANEL_SIZE, RUG_SIZES } from './constants';
import type { Dims, Fix, SurfaceId, Vec3 } from './types';

export type Rect = { u0: number; u1: number; v0: number; v1: number };

export function surfaceSize(dims: Dims, surface: SurfaceId): { u: number; v: number } {
  switch (surface) {
    case 'floor':
    case 'ceiling':
      return { u: dims.length, v: dims.width };
    case 'wallX0':
    case 'wallX1':
      return { u: dims.width, v: dims.height };
    case 'wallZ0':
    case 'wallZ1':
      return { u: dims.length, v: dims.height };
  }
}

export function toSurfaceCoords(surface: SurfaceId, p: Vec3): { u: number; v: number } {
  switch (surface) {
    case 'floor':
    case 'ceiling':
      return { u: p.x, v: p.z };
    case 'wallX0':
    case 'wallX1':
      return { u: p.z, v: p.y };
    case 'wallZ0':
    case 'wallZ1':
      return { u: p.x, v: p.y };
  }
}

export function fixSurface(fix: Fix): SurfaceId {
  return fix.kind === 'rug' ? 'floor' : fix.wall;
}

export function fixRect(fix: Fix): Rect {
  if (fix.kind === 'rug') {
    const s = RUG_SIZES[fix.size];
    return { u0: fix.x - s.x / 2, u1: fix.x + s.x / 2, v0: fix.z - s.z / 2, v1: fix.z + s.z / 2 };
  }
  return {
    u0: fix.u - PANEL_SIZE.u / 2,
    u1: fix.u + PANEL_SIZE.u / 2,
    v0: fix.v - PANEL_SIZE.v / 2,
    v1: fix.v + PANEL_SIZE.v / 2,
  };
}

export function rectContains(r: Rect, u: number, v: number): boolean {
  return u >= r.u0 && u <= r.u1 && v >= r.v0 && v <= r.v1;
}

/** Area of the rectangle that lies on a surface of the given size. */
export function clippedArea(r: Rect, size: { u: number; v: number }): number {
  const du = Math.min(r.u1, size.u) - Math.max(r.u0, 0);
  const dv = Math.min(r.v1, size.v) - Math.max(r.v0, 0);
  return du > 0 && dv > 0 ? du * dv : 0;
}

export function fixFits(dims: Dims, fix: Fix): boolean {
  const size = surfaceSize(dims, fixSurface(fix));
  const r = fixRect(fix);
  const eps = 1e-9;
  return r.u0 >= -eps && r.v0 >= -eps && r.u1 <= size.u + eps && r.v1 <= size.v + eps;
}
```

- [ ] **Step 5: Implement defaults and validation**

Create `src/lib/room/roomState.ts`:
```ts
import { LIMITS } from './constants';
import { fixFits } from './geometry';
import type { RoomState, Vec3 } from './types';

export type RoomError = { field: string; message: string };

export function defaultRoom(): RoomState {
  return {
    v: 1,
    name: 'My room',
    dims: { length: 4, width: 3.5, height: 2.6 },
    surfaces: {
      floor: 'woodFloor',
      ceiling: 'drywall',
      wallX0: 'drywall',
      wallX1: 'drywall',
      wallZ0: 'drywall',
      wallZ1: 'glass',
    },
    furnishing: 'some',
    speaker: { x: 0.6, y: 1.0, z: 1.4 },
    listener: { x: 3.0, y: 1.1, z: 1.9, yaw: 'faceSpeaker' },
    fixes: [],
    calibration: { factor: 1 },
  };
}

const between = (value: number, lo: number, hi: number) =>
  Number.isFinite(value) && value >= lo && value <= hi;

const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

export function validateRoom(room: RoomState): RoomError[] {
  const errors: RoomError[] = [];
  const { length, width, height } = room.dims;
  const { minLengthWidth: lo, maxLengthWidth: hi, minHeight, maxHeight, wallClearance: c } = LIMITS;

  if (!between(length, lo, hi)) errors.push({ field: 'dims.length', message: `Length must be between ${lo} and ${hi} m.` });
  if (!between(width, lo, hi)) errors.push({ field: 'dims.width', message: `Width must be between ${lo} and ${hi} m.` });
  if (!between(height, minHeight, maxHeight)) {
    errors.push({ field: 'dims.height', message: `Height must be between ${minHeight} and ${maxHeight} m.` });
  }
  if (errors.length > 0) return errors;

  for (const key of ['speaker', 'listener'] as const) {
    const p = room[key];
    const inside = between(p.x, c, length - c) && between(p.y, c, height - c) && between(p.z, c, width - c);
    if (!inside) errors.push({ field: key, message: `The ${key} must be at least ${c} m from the walls, floor and ceiling.` });
  }
  if (errors.length === 0 && distance(room.speaker, room.listener) < LIMITS.minSeparation) {
    errors.push({ field: 'listener', message: `The listener must be at least ${LIMITS.minSeparation} m from the speaker.` });
  }

  const rugs = room.fixes.filter((f) => f.kind === 'rug').length;
  const panels = room.fixes.length - rugs;
  if (rugs > LIMITS.maxRugs) errors.push({ field: 'fixes', message: 'Only one rug is supported.' });
  if (panels > LIMITS.maxPanels) errors.push({ field: 'fixes', message: `At most ${LIMITS.maxPanels} panels are supported.` });

  room.fixes.forEach((fix, i) => {
    if (!fixFits(room.dims, fix)) {
      errors.push({
        field: `fixes.${i}`,
        message: fix.kind === 'rug' ? 'The rug must fit inside the floor.' : 'The panel must fit on its wall.',
      });
    }
  });
  return errors;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/roomState.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```powershell
git add src/lib/room
git commit -m "feat: add room model, geometry and validation" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Materials and absorption

**Files:**
- Create: `src/lib/acoustics/bands.ts`, `src/lib/acoustics/materials.ts`, `src/lib/acoustics/absorption.ts`
- Test: `src/lib/acoustics/absorption.test.ts`

**Interfaces:**
- Consumes: room types and geometry from Task 2.
- Produces:
  - `bands.ts`: `BAND_CENTERS`, `NUM_BANDS = 6`, `type Bands = number[]`, `SPEED_OF_SOUND = 343`, `AIR_M: Bands`, `mapBands(f: (b: number) => number): Bands`.
  - `materials.ts`: `MATERIALS: Record<MaterialId, { label: string; alpha: Bands }>`, `FURNISHING_ALPHA_PER_FLOOR_M2: Record<Furnishing, Bands>`.
  - `absorption.ts`: `type SurfaceLookup = (surface: SurfaceId, point: Vec3) => { alpha: Bands; fix: boolean }`, `makeSurfaceLookup(room: RoomState): SurfaceLookup`, `absorptionArea(room: RoomState): Bands` (m², includes active fixes, furnishing, × calibration factor).

- [ ] **Step 1: Write band constants and material tables**

Create `src/lib/acoustics/bands.ts`:
```ts
export const BAND_CENTERS = [125, 250, 500, 1000, 2000, 4000] as const;
export const NUM_BANDS = BAND_CENTERS.length;

/** One value per octave band, index-aligned with BAND_CENTERS. */
export type Bands = number[];

export const SPEED_OF_SOUND = 343;

/** Air intensity attenuation coefficient m (1/m) at about 20 °C and 50 % relative humidity. */
export const AIR_M: Bands = [0.0001, 0.0002, 0.0006, 0.001, 0.0019, 0.0058];

export const mapBands = (f: (band: number) => number): Bands => Array.from({ length: NUM_BANDS }, (_, b) => f(b));
```

Create `src/lib/acoustics/materials.ts`:
```ts
import type { Furnishing, MaterialId } from '@/lib/room/types';
import type { Bands } from './bands';

/** Random-incidence absorption coefficients, 125 Hz – 4 kHz, from standard published tables. */
export const MATERIALS: Record<MaterialId, { label: string; alpha: Bands }> = {
  drywall: { label: 'Drywall', alpha: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09] },
  brick: { label: 'Brick', alpha: [0.03, 0.03, 0.03, 0.04, 0.05, 0.07] },
  concrete: { label: 'Concrete (painted)', alpha: [0.01, 0.01, 0.01, 0.02, 0.02, 0.02] },
  glass: { label: 'Glass / window', alpha: [0.35, 0.25, 0.18, 0.12, 0.07, 0.04] },
  woodFloor: { label: 'Wood floor', alpha: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07] },
  carpet: { label: 'Carpet (wall to wall)', alpha: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73] },
  tile: { label: 'Tile / linoleum', alpha: [0.02, 0.03, 0.03, 0.03, 0.03, 0.02] },
  curtains: { label: 'Heavy curtains', alpha: [0.07, 0.31, 0.49, 0.75, 0.7, 0.6] },
  plaster: { label: 'Plaster', alpha: [0.14, 0.1, 0.06, 0.05, 0.04, 0.03] },
  woodPanel: { label: 'Wood panelling', alpha: [0.28, 0.22, 0.17, 0.09, 0.1, 0.11] },
  acousticPanel: { label: 'Acoustic panels', alpha: [0.18, 0.7, 0.95, 0.95, 0.95, 0.95] },
  rug: { label: 'Area rug', alpha: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65] },
};

/** Extra absorption (m² per m² of floor) for furniture the box model cannot see. */
export const FURNISHING_ALPHA_PER_FLOOR_M2: Record<Furnishing, Bands> = {
  bare: [0, 0, 0, 0, 0, 0],
  some: [0.1, 0.18, 0.25, 0.3, 0.3, 0.3],
  full: [0.2, 0.35, 0.5, 0.55, 0.55, 0.55],
};
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/acoustics/absorption.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { MATERIALS } from './materials';

const withRug = (room: RoomState, on: boolean): RoomState => ({
  ...room,
  fixes: [{ kind: 'rug', size: 'M', x: 2, z: 1.75, on }],
});

describe('absorptionArea', () => {
  // Default room at 1 kHz: floor 14 m² × 0.07 + drywall 42.6 m² × 0.04 + glass 10.4 m² × 0.12
  // + furnishing "some" 14 m² × 0.30 = 0.98 + 1.704 + 1.248 + 4.2 = 8.132
  it('sums surface area × alpha plus furnishing', () => {
    expect(absorptionArea(defaultRoom())[3]).toBeCloseTo(8.132, 6);
  });

  it('replaces the floor the rug covers with rug absorption', () => {
    // rug M covers 2.3 × 1.6 = 3.68 m²; 3.68 × (0.37 − 0.07) = 1.104
    expect(absorptionArea(withRug(defaultRoom(), true))[3]).toBeCloseTo(9.236, 6);
  });

  it('ignores fixes that are switched off', () => {
    expect(absorptionArea(withRug(defaultRoom(), false))[3]).toBeCloseTo(8.132, 6);
  });

  it('scales by the calibration factor', () => {
    expect(absorptionArea({ ...defaultRoom(), calibration: { factor: 2 } })[3]).toBeCloseTo(16.264, 6);
  });
});

describe('makeSurfaceLookup', () => {
  it('returns the rug inside its footprint and the floor outside it', () => {
    const lookup = makeSurfaceLookup(withRug(defaultRoom(), true));
    expect(lookup('floor', { x: 2, y: 0, z: 1.75 })).toEqual({ alpha: MATERIALS.rug.alpha, fix: true });
    expect(lookup('floor', { x: 0.3, y: 0, z: 0.3 })).toEqual({ alpha: MATERIALS.woodFloor.alpha, fix: false });
  });

  it('returns a panel only on its own wall', () => {
    const room: RoomState = { ...defaultRoom(), fixes: [{ kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: true }] };
    const lookup = makeSurfaceLookup(room);
    expect(lookup('wallZ1', { x: 2, y: 1.2, z: 3.5 })).toEqual({ alpha: MATERIALS.acousticPanel.alpha, fix: true });
    expect(lookup('wallZ1', { x: 0.5, y: 1.2, z: 3.5 })).toEqual({ alpha: MATERIALS.glass.alpha, fix: false });
    expect(lookup('wallZ0', { x: 2, y: 1.2, z: 0 })).toEqual({ alpha: MATERIALS.drywall.alpha, fix: false });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/absorption.test.ts`
Expected: FAIL — cannot resolve `./absorption`.

- [ ] **Step 4: Implement absorption**

Create `src/lib/acoustics/absorption.ts`:
```ts
import { clippedArea, fixRect, fixSurface, rectContains, surfaceSize, toSurfaceCoords } from '@/lib/room/geometry';
import { SURFACE_IDS, type Fix, type RoomState, type SurfaceId, type Vec3 } from '@/lib/room/types';
import { NUM_BANDS, type Bands } from './bands';
import { FURNISHING_ALPHA_PER_FLOOR_M2, MATERIALS } from './materials';

export type SurfaceLookup = (surface: SurfaceId, point: Vec3) => { alpha: Bands; fix: boolean };

const activeFixes = (room: RoomState) => room.fixes.filter((f) => f.on);
const fixAlpha = (fix: Fix) => MATERIALS[fix.kind === 'rug' ? 'rug' : 'acousticPanel'].alpha;

/** Material absorption at a point on a surface, taking switched-on fixes into account. */
export function makeSurfaceLookup(room: RoomState): SurfaceLookup {
  const fixes = activeFixes(room).map((fix) => ({ surface: fixSurface(fix), rect: fixRect(fix), alpha: fixAlpha(fix) }));
  return (surface, point) => {
    const { u, v } = toSurfaceCoords(surface, point);
    for (const f of fixes) {
      if (f.surface === surface && rectContains(f.rect, u, v)) return { alpha: f.alpha, fix: true };
    }
    return { alpha: MATERIALS[room.surfaces[surface]].alpha, fix: false };
  };
}

/** Total absorption area Σ S·α per band (m²), including fixes, furnishing and calibration. */
export function absorptionArea(room: RoomState): Bands {
  const total = new Array<number>(NUM_BANDS).fill(0);

  for (const surface of SURFACE_IDS) {
    const size = surfaceSize(room.dims, surface);
    const alpha = MATERIALS[room.surfaces[surface]].alpha;
    for (let b = 0; b < NUM_BANDS; b++) total[b] += size.u * size.v * alpha[b];
  }

  for (const fix of activeFixes(room)) {
    const surface = fixSurface(fix);
    const area = clippedArea(fixRect(fix), surfaceSize(room.dims, surface));
    const base = MATERIALS[room.surfaces[surface]].alpha;
    const alpha = fixAlpha(fix);
    for (let b = 0; b < NUM_BANDS; b++) total[b] += area * (alpha[b] - base[b]);
  }

  const floorArea = room.dims.length * room.dims.width;
  const furnishing = FURNISHING_ALPHA_PER_FLOOR_M2[room.furnishing];
  for (let b = 0; b < NUM_BANDS; b++) total[b] += floorArea * furnishing[b];

  return total.map((a) => a * room.calibration.factor);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/absorption.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/acoustics
git commit -m "feat: add material tables and absorption model" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Reverb time formulas

**Files:**
- Create: `src/lib/acoustics/reverbTime.ts`
- Test: `src/lib/acoustics/reverbTime.test.ts`

**Interfaces:**
- Consumes: `Bands`, `AIR_M`, `NUM_BANDS` (Task 3), `Dims` (Task 2).
- Produces: `roomVolume(dims: Dims): number`, `totalSurfaceArea(dims: Dims): number`, `sabine(volume: number, absorption: Bands, air?: Bands): Bands`, `eyring(volume: number, surfaceArea: number, absorption: Bands, air?: Bands): Bands`, `midRt60(rt: Bands): number`, `MAX_MEAN_ALPHA = 0.99`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/reverbTime.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { AIR_M } from './bands';
import { eyring, midRt60, roomVolume, sabine, totalSurfaceArea } from './reverbTime';

const noAir = [0, 0, 0, 0, 0, 0];
const flat = (v: number) => [v, v, v, v, v, v];

describe('reverb time', () => {
  it('computes volume and surface area', () => {
    const dims = { length: 4, width: 3.5, height: 2.6 };
    expect(roomVolume(dims)).toBeCloseTo(36.4, 9);
    expect(totalSurfaceArea(dims)).toBeCloseTo(67, 9);
  });

  it('matches the Sabine formula', () => {
    expect(sabine(100, flat(10), noAir)[0]).toBeCloseTo(1.61, 9);
  });

  it('matches the Eyring formula', () => {
    // 0.161 × 100 / (−130 × ln 0.9) = 1.175451
    expect(eyring(100, 130, flat(13), noAir)[0]).toBeCloseTo(1.17545, 4);
  });

  it('gives shorter times with Eyring than Sabine', () => {
    expect(eyring(100, 130, flat(30), noAir)[0]).toBeLessThan(sabine(100, flat(30), noAir)[0]);
  });

  it('shortens high bands with air absorption', () => {
    expect(eyring(1000, 600, flat(60), AIR_M)[5]).toBeLessThan(eyring(1000, 600, flat(60), noAir)[5]);
  });

  it('stays finite and positive when absorption exceeds the surface area', () => {
    const rt = eyring(100, 130, flat(500));
    for (const t of rt) {
      expect(Number.isFinite(t)).toBe(true);
      expect(t).toBeGreaterThan(0);
    }
  });

  it('averages the 500 Hz and 1 kHz bands for the mid value', () => {
    expect(midRt60([1, 1, 0.4, 0.6, 1, 1])).toBeCloseTo(0.5, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/reverbTime.test.ts`
Expected: FAIL — cannot resolve `./reverbTime`.

- [ ] **Step 3: Implement**

Create `src/lib/acoustics/reverbTime.ts`:
```ts
import type { Dims } from '@/lib/room/types';
import { AIR_M, type Bands } from './bands';

/** Mean absorption is clamped below 1 so ln(1 − ᾱ) stays finite in heavily treated or calibrated rooms. */
export const MAX_MEAN_ALPHA = 0.99;

export const roomVolume = (d: Dims) => d.length * d.width * d.height;

export const totalSurfaceArea = (d: Dims) => 2 * (d.length * d.width + d.length * d.height + d.width * d.height);

export function sabine(volume: number, absorption: Bands, air: Bands = AIR_M): Bands {
  return absorption.map((a, b) => (0.161 * volume) / (a + 4 * air[b] * volume));
}

export function eyring(volume: number, surfaceArea: number, absorption: Bands, air: Bands = AIR_M): Bands {
  return absorption.map((a, b) => {
    const meanAlpha = Math.min(a / surfaceArea, MAX_MEAN_ALPHA);
    return (0.161 * volume) / (-surfaceArea * Math.log(1 - meanAlpha) + 4 * air[b] * volume);
  });
}

export const midRt60 = (rt: Bands) => (rt[2] + rt[3]) / 2;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/reverbTime.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/acoustics/reverbTime.ts src/lib/acoustics/reverbTime.test.ts
git commit -m "feat: add Sabine and Eyring reverb time" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Image source method, checked against pyroomacoustics

**Files:**
- Create: `src/lib/acoustics/imageSource.ts`, `scripts/make_pra_fixtures.py`, `src/lib/acoustics/__fixtures__/pra-images.json` (generated)
- Test: `src/lib/acoustics/imageSource.test.ts`, `src/lib/acoustics/imageSource.pra.test.ts`

**Interfaces:**
- Consumes: `SurfaceLookup` (Task 3), `Bands`, `AIR_M`, `NUM_BANDS`, `SPEED_OF_SOUND` (Task 3), `Dims`, `Vec3`, `SurfaceId` (Task 2).
- Produces:
  ```ts
  type ImageSourceInput = { dims: Dims; source: Vec3; listener: Vec3; maxOrder: number; lookup: SurfaceLookup; air?: Bands };
  type Arrival = {
    image: Vec3; order: number; distance: number; delay: number;
    reflection: Bands;      // product of √(1 − α) over every bounce
    gains: Bands;           // reflection × air loss / distance (pressure)
    direction: Vec3;        // unit vector from the listener toward where the sound comes from
    points: Vec3[];         // [source, ...bounce points in travel order, listener]
    hitSurfaces: SurfaceId[];
    hitFixes: boolean;
  };
  computeImageSources(input: ImageSourceInput): Arrival[]
  pathEnergy(a: Arrival): number   // mean over bands of gains²
  ```

How it works: along each axis, image index `n` puts the image at `n·L + (n even ? s : L − s)`. The straight line from the image to the listener crosses `|n|` planes `k·L` on that axis; folding each crossing point back into the room gives the real bounce point, and `k` even/odd tells which of the two walls it hit.

- [ ] **Step 1: Write the failing unit tests**

Create `src/lib/acoustics/imageSource.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { SurfaceId, Vec3 } from '@/lib/room/types';
import { computeImageSources, pathEnergy } from './imageSource';

const dims = { length: 4, width: 3, height: 2.5 };
const source = { x: 1, y: 1, z: 1 };
const listener = { x: 3, y: 1, z: 1 };
const flat = (v: number) => [v, v, v, v, v, v];
const plain = () => ({ alpha: flat(0.2), fix: false });
const noAir = flat(0);

describe('computeImageSources', () => {
  it('returns the expected number of images for an order', () => {
    // integer points with |x| + |y| + |z| ≤ 3: (2N+1)(2N²+2N+3)/3 = 63
    expect(computeImageSources({ dims, source, listener, maxOrder: 3, lookup: plain })).toHaveLength(63);
  });

  it('includes the direct path', () => {
    const direct = computeImageSources({ dims, source, listener, maxOrder: 1, lookup: plain, air: noAir }).find(
      (a) => a.order === 0,
    )!;
    expect(direct.distance).toBeCloseTo(2, 9);
    expect(direct.delay).toBeCloseTo(2 / 343, 12);
    expect(direct.gains[0]).toBeCloseTo(0.5, 9);
    expect(direct.points).toEqual([source, listener]);
    expect(direct.direction).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('finds the floor bounce point and applies the reflection coefficient', () => {
    const floor = computeImageSources({ dims, source, listener, maxOrder: 1, lookup: plain, air: noAir }).find(
      (a) => a.hitSurfaces.join() === 'floor',
    )!;
    expect(floor.image).toEqual({ x: 1, y: -1, z: 1 });
    expect(floor.points[1].x).toBeCloseTo(2, 9);
    expect(floor.points[1].y).toBe(0);
    expect(floor.points[1].z).toBeCloseTo(1, 9);
    expect(floor.reflection[0]).toBeCloseTo(Math.sqrt(0.8), 12);
    expect(floor.distance).toBeCloseTo(Math.hypot(2, 2), 9);
  });

  it('orders bounce points from the source to the listener', () => {
    const arrival = computeImageSources({ dims, source, listener, maxOrder: 2, lookup: plain }).find(
      (a) => a.hitSurfaces.join() === 'wallX0,wallX1',
    )!;
    // source → wall at x = 0 → wall at x = length → listener
    expect(arrival.points[1].x).toBe(0);
    expect(arrival.points[2].x).toBe(4);
  });

  it('flags paths that bounce off a fix and uses its absorption', () => {
    const lookup = (surface: SurfaceId, p: Vec3) =>
      surface === 'floor' && p.x > 1.5 && p.x < 2.5 ? { alpha: flat(0.6), fix: true } : plain();
    const arrivals = computeImageSources({ dims, source, listener, maxOrder: 1, lookup });
    const floor = arrivals.find((a) => a.hitSurfaces.join() === 'floor')!;
    const ceiling = arrivals.find((a) => a.hitSurfaces.join() === 'ceiling')!;
    expect(floor.hitFixes).toBe(true);
    expect(floor.reflection[0]).toBeCloseTo(Math.sqrt(0.4), 12);
    expect(ceiling.hitFixes).toBe(false);
  });

  it('measures path energy as the mean squared band gain', () => {
    const direct = computeImageSources({ dims, source, listener, maxOrder: 0, lookup: plain, air: noAir })[0];
    expect(pathEnergy(direct)).toBeCloseTo(0.25, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/imageSource.test.ts`
Expected: FAIL — cannot resolve `./imageSource`.

- [ ] **Step 3: Implement the image source method**

Create `src/lib/acoustics/imageSource.ts`:
```ts
import type { Dims, SurfaceId, Vec3 } from '@/lib/room/types';
import type { SurfaceLookup } from './absorption';
import { AIR_M, NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';

export type ImageSourceInput = {
  dims: Dims;
  source: Vec3;
  listener: Vec3;
  maxOrder: number;
  lookup: SurfaceLookup;
  air?: Bands;
};

export type Arrival = {
  image: Vec3;
  order: number;
  distance: number;
  delay: number;
  reflection: Bands;
  gains: Bands;
  direction: Vec3;
  points: Vec3[];
  hitSurfaces: SurfaceId[];
  hitFixes: boolean;
};

type Axis = { key: 'x' | 'y' | 'z'; size: (d: Dims) => number; low: SurfaceId; high: SurfaceId };

const AXES: Axis[] = [
  { key: 'x', size: (d) => d.length, low: 'wallX0', high: 'wallX1' },
  { key: 'y', size: (d) => d.height, low: 'floor', high: 'ceiling' },
  { key: 'z', size: (d) => d.width, low: 'wallZ0', high: 'wallZ1' },
];

/** Position of image n along one axis for a source at s in a room of the given size. */
export function imageCoord(n: number, s: number, size: number): number {
  return n * size + (n % 2 === 0 ? s : size - s);
}

/** Map a coordinate in unfolded image space back into [0, size]. */
function fold(c: number, size: number): number {
  const period = 2 * size;
  const m = ((c % period) + period) % period;
  return m <= size ? m : period - m;
}

export function computeImageSources(input: ImageSourceInput): Arrival[] {
  const { maxOrder } = input;
  const arrivals: Arrival[] = [];
  for (let nx = -maxOrder; nx <= maxOrder; nx++) {
    const ry = maxOrder - Math.abs(nx);
    for (let ny = -ry; ny <= ry; ny++) {
      const rz = ry - Math.abs(ny);
      for (let nz = -rz; nz <= rz; nz++) arrivals.push(trace(input, [nx, ny, nz]));
    }
  }
  return arrivals;
}

function trace(input: ImageSourceInput, n: [number, number, number]): Arrival {
  const { dims, source, listener, lookup, air = AIR_M } = input;
  const image: Vec3 = {
    x: imageCoord(n[0], source.x, dims.length),
    y: imageCoord(n[1], source.y, dims.height),
    z: imageCoord(n[2], source.z, dims.width),
  };
  const dir: Vec3 = { x: listener.x - image.x, y: listener.y - image.y, z: listener.z - image.z };

  // Each crossing of a plane k·size on some axis is one bounce. t = 0 at the image (source side), 1 at the listener.
  const crossings: { t: number; axis: Axis; surface: SurfaceId }[] = [];
  AXES.forEach((axis, i) => {
    const a = image[axis.key];
    const r = listener[axis.key];
    const size = axis.size(dims);
    for (let j = 0; j < Math.abs(n[i]); j++) {
      const k = n[i] > 0 ? j + 1 : -j;
      const isLow = ((k % 2) + 2) % 2 === 0;
      crossings.push({ t: (k * size - a) / (r - a), axis, surface: isLow ? axis.low : axis.high });
    }
  });
  crossings.sort((p, q) => p.t - q.t);

  const reflection = new Array<number>(NUM_BANDS).fill(1);
  const hits: Vec3[] = [];
  const hitSurfaces: SurfaceId[] = [];
  let hitFixes = false;
  for (const c of crossings) {
    const p: Vec3 = {
      x: fold(image.x + c.t * dir.x, dims.length),
      y: fold(image.y + c.t * dir.y, dims.height),
      z: fold(image.z + c.t * dir.z, dims.width),
    };
    p[c.axis.key] = c.surface === c.axis.low ? 0 : c.axis.size(dims); // snap onto the wall exactly
    const { alpha, fix } = lookup(c.surface, p);
    for (let b = 0; b < NUM_BANDS; b++) reflection[b] *= Math.sqrt(Math.max(0, 1 - alpha[b]));
    hitFixes ||= fix;
    hits.push(p);
    hitSurfaces.push(c.surface);
  }

  const distance = Math.hypot(dir.x, dir.y, dir.z);
  return {
    image,
    order: Math.abs(n[0]) + Math.abs(n[1]) + Math.abs(n[2]),
    distance,
    delay: distance / SPEED_OF_SOUND,
    reflection,
    gains: reflection.map((r, b) => (r * Math.exp((-air[b] * distance) / 2)) / distance),
    direction: {
      x: (image.x - listener.x) / distance,
      y: (image.y - listener.y) / distance,
      z: (image.z - listener.z) / distance,
    },
    points: [source, ...hits, listener],
    hitSurfaces,
    hitFixes,
  };
}

export const pathEnergy = (a: Arrival) => a.gains.reduce((sum, g) => sum + g * g, 0) / a.gains.length;
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/imageSource.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the pyroomacoustics fixture script**

Create `scripts/make_pra_fixtures.py`:
```python
"""Generate image-source reference fixtures with pyroomacoustics.

Run once from the repo root:
    python -m pip install pyroomacoustics==0.10.1
    python scripts/make_pra_fixtures.py

Writes src/lib/acoustics/__fixtures__/pra-images.json.
Our frame: x = length, y = up, z = width. pyroomacoustics: x, y = width, z = up.
"""

import json
from pathlib import Path

import numpy as np
import pyroomacoustics as pra

ROOMS = [
    {
        "name": "bedroom",
        "dims": {"length": 4.0, "width": 3.5, "height": 2.6},
        "alpha": {"floor": 0.1, "ceiling": 0.2, "wallX0": 0.3, "wallX1": 0.4, "wallZ0": 0.5, "wallZ1": 0.6},
        "speaker": {"x": 0.6, "y": 1.0, "z": 1.4},
        "listener": {"x": 3.0, "y": 1.1, "z": 1.9},
        "maxOrder": 3,
    },
    {
        "name": "hall",
        "dims": {"length": 12.0, "width": 8.0, "height": 5.0},
        "alpha": {"floor": 0.05, "ceiling": 0.15, "wallX0": 0.25, "wallX1": 0.35, "wallZ0": 0.45, "wallZ1": 0.55},
        "speaker": {"x": 2.0, "y": 1.5, "z": 3.0},
        "listener": {"x": 9.0, "y": 1.2, "z": 5.5},
        "maxOrder": 3,
    },
]

WALL_NAMES = {
    "wallX0": "west",
    "wallX1": "east",
    "wallZ0": "south",
    "wallZ1": "north",
    "floor": "floor",
    "ceiling": "ceiling",
}


def to_pra(p):
    return [p["x"], p["z"], p["y"]]


def run(room):
    d = room["dims"]
    materials = pra.make_materials(**{WALL_NAMES[k]: v for k, v in room["alpha"].items()})
    r = pra.ShoeBox(
        [d["length"], d["width"], d["height"]],
        fs=16000,
        materials=materials,
        max_order=room["maxOrder"],
        air_absorption=False,
    )
    r.add_source(to_pra(room["speaker"]))
    r.add_microphone(to_pra(room["listener"]))
    r.image_source_model()
    src = r.sources[0]
    damping = np.atleast_2d(src.damping)[0]
    images = []
    for k in range(src.images.shape[1]):
        x, y_pra, z_pra = src.images[:, k]
        images.append(
            {
                "pos": {"x": float(x), "y": float(z_pra), "z": float(y_pra)},
                "order": int(src.orders[k]),
                "damping": float(damping[k]),
            }
        )
    return {**room, "images": images}


if __name__ == "__main__":
    out = Path("src/lib/acoustics/__fixtures__/pra-images.json")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps([run(r) for r in ROOMS], indent=1))
    print(f"wrote {out}")
```

- [ ] **Step 6: Generate the fixtures**

Run:
```powershell
python -m pip install pyroomacoustics==0.10.1
python scripts/make_pra_fixtures.py
```
Expected: `wrote src/lib/acoustics/__fixtures__/pra-images.json`; the file holds 2 rooms with 63 images each.

If `pip install` fails because no prebuilt wheel exists for Python 3.13 (it then tries to compile C++), install Python 3.12 from python.org and use `py -3.12 -m pip install pyroomacoustics==0.10.1` and `py -3.12 scripts/make_pra_fixtures.py` instead.

- [ ] **Step 7: Write the fixture comparison test**

Create `src/lib/acoustics/imageSource.pra.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dims, SurfaceId, Vec3 } from '@/lib/room/types';
import fixtures from './__fixtures__/pra-images.json';
import { computeImageSources } from './imageSource';

type Fixture = {
  name: string;
  dims: Dims;
  alpha: Record<SurfaceId, number>;
  speaker: Vec3;
  listener: Vec3;
  maxOrder: number;
  images: { pos: Vec3; order: number; damping: number }[];
};

const key = (p: Vec3) => [p.x, p.y, p.z].map((c) => c.toFixed(6)).join(',');

describe.each(fixtures as Fixture[])('image sources match pyroomacoustics: $name', (fx) => {
  const ours = computeImageSources({
    dims: fx.dims,
    source: fx.speaker,
    listener: fx.listener,
    maxOrder: fx.maxOrder,
    lookup: (surface) => ({ alpha: new Array(6).fill(fx.alpha[surface]), fix: false }),
  });
  const byPosition = new Map(ours.map((a) => [key(a.image), a]));

  it('produces the same number of images', () => {
    expect(ours).toHaveLength(fx.images.length);
  });

  it('places every image at the same position with the same order and damping', () => {
    for (const ref of fx.images) {
      const match = byPosition.get(key(ref.pos));
      expect(match, `image at ${key(ref.pos)}`).toBeDefined();
      expect(match!.order).toBe(ref.order);
      expect(match!.reflection[0]).toBeCloseTo(ref.damping, 9);
    }
  });
});
```

- [ ] **Step 8: Run the fixture test**

Run: `npx vitest run src/lib/acoustics/imageSource.pra.test.ts`
Expected: PASS for both rooms. pyroomacoustics applies `√(1 − α)` per bounce, the same convention as ours. If positions match but every damping equals the *square* of ours (or vice versa), or positions are mirrored along y/z, stop and report: it is a convention or axis-mapping mismatch to resolve, not a tolerance to loosen.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/acoustics scripts
git commit -m "feat: add shoebox image source method checked against pyroomacoustics" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: DSP helpers — FFT, seeded noise, octave band masks

**Files:**
- Create: `src/lib/acoustics/dsp.ts`
- Test: `src/lib/acoustics/dsp.test.ts`

**Interfaces:**
- Consumes: `NUM_BANDS` (Task 3).
- Produces:
  - `nextPow2(n: number): number`
  - `fft(re: Float64Array, im: Float64Array, inverse?: boolean): void` (in place, radix-2; inverse divides by n)
  - `createRng(seed: number): () => number` (uniform [0, 1)), `gaussian(rng: () => number): number`
  - `CROSSOVERS = [177, 354, 707, 1414, 2828]`
  - `bandMasks(fftSize: number, sampleRate: number): Float64Array[]` — 6 masks over bins `0..fftSize/2`, non-negative, summing to exactly 1 at every bin.
  - `applyBandMasks(bands: Float64Array[], masks: Float64Array[]): Float64Array` — filters each band signal (length = fftSize) with its mask and returns the sum.
  - `bandNoise(length: number, sampleRate: number, seed: number): Float32Array[]` — unit-variance white noise split into 6 band components that sum back to the original noise; cached by `(length, sampleRate, seed)`.

Crossovers sit halfway (geometrically) between band centres; each crossover is a raised-cosine half an octave wide in log frequency, so the bands add up to a perfectly flat response.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/dsp.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyBandMasks, bandMasks, bandNoise, createRng, fft, gaussian, nextPow2 } from './dsp';

describe('nextPow2', () => {
  it('rounds up to a power of two', () => {
    expect(nextPow2(1000)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });
});

describe('fft', () => {
  it('transforms an impulse into a flat spectrum', () => {
    const re = new Float64Array(8);
    const im = new Float64Array(8);
    re[0] = 1;
    fft(re, im);
    for (let k = 0; k < 8; k++) {
      expect(re[k]).toBeCloseTo(1, 12);
      expect(im[k]).toBeCloseTo(0, 12);
    }
  });

  it('round-trips through the inverse', () => {
    const rng = createRng(3);
    const original = Float64Array.from({ length: 64 }, () => rng() - 0.5);
    const re = Float64Array.from(original);
    const im = new Float64Array(64);
    fft(re, im);
    fft(re, im, true);
    original.forEach((v, i) => expect(re[i]).toBeCloseTo(v, 10));
  });
});

describe('bandMasks', () => {
  const masks = bandMasks(1024, 16000); // bin spacing 15.625 Hz

  it('sums to exactly one at every bin and is never negative', () => {
    for (let k = 0; k <= 512; k++) {
      const sum = masks.reduce((s, m) => s + m[k], 0);
      expect(sum).toBeCloseTo(1, 12);
      masks.forEach((m) => expect(m[k]).toBeGreaterThanOrEqual(0));
    }
  });

  it('puts 1 kHz fully in the 1 kHz band and 4 kHz in the top band', () => {
    expect(masks[3][64]).toBeCloseTo(1, 12); // 1000 Hz
    expect(masks[5][256]).toBeCloseTo(1, 12); // 4000 Hz
    expect(masks[3][256]).toBeCloseTo(0, 12);
  });
});

describe('applyBandMasks', () => {
  it('passes an impulse through unchanged when every band has the same gain', () => {
    const bands = Array.from({ length: 6 }, () => {
      const s = new Float64Array(256);
      s[10] = 1;
      return s;
    });
    const out = applyBandMasks(bands, bandMasks(256, 16000));
    out.forEach((v, i) => expect(v).toBeCloseTo(i === 10 ? 1 : 0, 9));
  });
});

describe('bandNoise', () => {
  it('splits seeded white noise into bands that sum back to it', () => {
    const rng = createRng(7);
    const white = Array.from({ length: 1000 }, () => gaussian(rng));
    const bands = bandNoise(1000, 16000, 7);
    expect(bands).toHaveLength(6);
    for (let i = 0; i < 1000; i++) {
      expect(bands.reduce((s, b) => s + b[i], 0)).toBeCloseTo(white[i], 4);
    }
  });

  it('is deterministic for a seed', () => {
    expect(bandNoise(500, 16000, 11)[2]).toEqual(bandNoise(500, 16000, 11)[2]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/dsp.test.ts`
Expected: FAIL — cannot resolve `./dsp`.

- [ ] **Step 3: Implement**

Create `src/lib/acoustics/dsp.ts`:
```ts
import { NUM_BANDS } from './bands';

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/** In-place iterative radix-2 FFT. The inverse divides by n. */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft size must be a power of two');

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let start = 0; start < n; start += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < half; k++) {
        const a = start + k;
        const b = a + half;
        const bRe = re[b] * cRe - im[b] * cIm;
        const bIm = re[b] * cIm + im[b] * cRe;
        re[b] = re[a] - bRe;
        im[b] = im[a] - bIm;
        re[a] += bRe;
        im[a] += bIm;
        const next = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = next;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/** mulberry32: small, fast, seedable uniform RNG in [0, 1). */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box–Muller). */
export function gaussian(rng: () => number): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const CROSSOVERS = [177, 354, 707, 1414, 2828];
const HALF_WIDTH_OCTAVES = 0.25;

/** Share of frequency f that falls below a crossover at fc: 1 well below, 0 well above, raised cosine between. */
function lowShare(f: number, fc: number): number {
  if (f <= 0) return 1;
  const x = Math.log2(f / fc);
  if (x <= -HALF_WIDTH_OCTAVES) return 1;
  if (x >= HALF_WIDTH_OCTAVES) return 0;
  return 0.5 * (1 + Math.cos((Math.PI * (x + HALF_WIDTH_OCTAVES)) / (2 * HALF_WIDTH_OCTAVES)));
}

export function bandMasks(fftSize: number, sampleRate: number): Float64Array[] {
  const half = fftSize / 2;
  const masks = Array.from({ length: NUM_BANDS }, () => new Float64Array(half + 1));
  for (let k = 0; k <= half; k++) {
    const f = (k * sampleRate) / fftSize;
    let below = 0;
    for (let b = 0; b < NUM_BANDS - 1; b++) {
      const share = lowShare(f, CROSSOVERS[b]);
      masks[b][k] = share - below;
      below = share;
    }
    masks[NUM_BANDS - 1][k] = 1 - below;
  }
  return masks;
}

export function applyBandMasks(bands: Float64Array[], masks: Float64Array[]): Float64Array {
  const n = bands[0].length;
  const half = n / 2;
  const sumRe = new Float64Array(n);
  const sumIm = new Float64Array(n);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  bands.forEach((signal, b) => {
    re.set(signal);
    im.fill(0);
    fft(re, im);
    const mask = masks[b];
    for (let k = 0; k < n; k++) {
      const g = mask[k <= half ? k : n - k];
      sumRe[k] += re[k] * g;
      sumIm[k] += im[k] * g;
    }
  });
  fft(sumRe, sumIm, true);
  return sumRe;
}

const noiseCache = new Map<string, Float32Array[]>();

export function bandNoise(length: number, sampleRate: number, seed: number): Float32Array[] {
  const cacheKey = `${length}:${sampleRate}:${seed}`;
  const cached = noiseCache.get(cacheKey);
  if (cached) return cached;

  const n = nextPow2(length);
  const rng = createRng(seed);
  const specRe = new Float64Array(n);
  const specIm = new Float64Array(n);
  for (let i = 0; i < length; i++) specRe[i] = gaussian(rng);
  fft(specRe, specIm);

  const half = n / 2;
  const result = bandMasks(n, sampleRate).map((mask) => {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const g = mask[k <= half ? k : n - k];
      re[k] = specRe[k] * g;
      im[k] = specIm[k] * g;
    }
    fft(re, im, true);
    return Float32Array.from(re.subarray(0, length));
  });
  noiseCache.set(cacheKey, result);
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/dsp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/acoustics/dsp.ts src/lib/acoustics/dsp.test.ts
git commit -m "feat: add FFT, seeded noise and octave band masks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Binaural cues (ITD and head shadow)

**Files:**
- Create: `src/lib/acoustics/binaural.ts`
- Test: `src/lib/acoustics/binaural.test.ts`

**Interfaces:**
- Consumes: `Bands`, `mapBands`, `SPEED_OF_SOUND` (Task 3); `Vec3`, `RoomState` (Task 2).
- Produces:
  - `HEAD_RADIUS = 0.0875`, `ILD_MAX_DB: Bands = [0.5, 1, 3, 6, 10, 15]`
  - `listenerYaw(listener: RoomState['listener'], speaker: Vec3): number` — radians; yaw 0 faces +x, π/2 faces +z.
  - `earResponse(direction: Vec3, yaw: number): { delayLeft: number; delayRight: number; gainLeft: Bands; gainRight: Bands }` — extra delay in seconds per ear (≥ 0) and linear gain per band per ear.

Facing direction is `(cos yaw, 0, sin yaw)`; the listener's right is `(−sin yaw, 0, cos yaw)`. The lateral angle `θ = asin(direction · right)` drives Woodworth's ITD `(a / c)(θ + sin θ)` and a far-ear attenuation of `ILD_MAX_DB[b] · |sin θ|` dB.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/binaural.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { earResponse, HEAD_RADIUS, listenerYaw } from './binaural';

describe('listenerYaw', () => {
  it('uses a fixed yaw when given', () => {
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 0.3 }, { x: 0, y: 0, z: 0 })).toBe(0.3);
  });

  it('faces the speaker when asked', () => {
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 'faceSpeaker' }, { x: 1, y: 1, z: 3 })).toBeCloseTo(Math.PI / 2, 12);
    expect(listenerYaw({ x: 1, y: 1, z: 1, yaw: 'faceSpeaker' }, { x: 3, y: 1, z: 1 })).toBeCloseTo(0, 12);
  });
});

describe('earResponse', () => {
  it('treats sound from straight ahead identically at both ears', () => {
    const r = earResponse({ x: 1, y: 0, z: 0 }, 0);
    expect(r.delayLeft).toBe(0);
    expect(r.delayRight).toBe(0);
    expect(r.gainLeft).toEqual(r.gainRight);
  });

  it('delays and shadows the left ear for sound from the right', () => {
    const r = earResponse({ x: 0, y: 0, z: 1 }, 0); // yaw 0 → right is +z
    expect(r.delayRight).toBe(0);
    expect(r.delayLeft).toBeCloseTo((HEAD_RADIUS / 343) * (Math.PI / 2 + 1), 12);
    expect(r.gainRight).toEqual([1, 1, 1, 1, 1, 1]);
    expect(r.gainLeft[5]).toBeCloseTo(10 ** (-15 / 20), 12);
    expect(r.gainLeft[0]).toBeGreaterThan(r.gainLeft[5]);
  });

  it('mirrors for sound from the left', () => {
    const r = earResponse({ x: 0, y: 0, z: -1 }, 0);
    expect(r.delayLeft).toBe(0);
    expect(r.delayRight).toBeGreaterThan(0);
    expect(r.gainRight[5]).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/binaural.test.ts`
Expected: FAIL — cannot resolve `./binaural`.

- [ ] **Step 3: Implement**

Create `src/lib/acoustics/binaural.ts`:
```ts
import type { RoomState, Vec3 } from '@/lib/room/types';
import { mapBands, SPEED_OF_SOUND, type Bands } from './bands';

export const HEAD_RADIUS = 0.0875;
/** Far-ear level drop (dB) per band for sound arriving fully from the side. */
export const ILD_MAX_DB: Bands = [0.5, 1, 3, 6, 10, 15];

export function listenerYaw(listener: RoomState['listener'], speaker: Vec3): number {
  if (listener.yaw !== 'faceSpeaker') return listener.yaw;
  return Math.atan2(speaker.z - listener.z, speaker.x - listener.x);
}

export type EarResponse = { delayLeft: number; delayRight: number; gainLeft: Bands; gainRight: Bands };

/** Spherical-head cues for a sound arriving from `direction` (unit vector from the listener). */
export function earResponse(direction: Vec3, yaw: number): EarResponse {
  const sinLateral = Math.max(-1, Math.min(1, -Math.sin(yaw) * direction.x + Math.cos(yaw) * direction.z));
  const lateral = Math.asin(sinLateral);
  const itd = (HEAD_RADIUS / SPEED_OF_SOUND) * (lateral + sinLateral); // > 0: right ear hears it first
  const near = mapBands(() => 1);
  const far = mapBands((b) => 10 ** ((-ILD_MAX_DB[b] * Math.abs(sinLateral)) / 20));
  const fromRight = sinLateral > 0;
  return {
    delayLeft: Math.max(itd, 0),
    delayRight: Math.max(-itd, 0),
    gainLeft: fromRight ? far : near,
    gainRight: fromRight ? near : far,
  };
}
```

Note on the straight-ahead test: with `sinLateral = 0`, `fromRight` is false, so `gainLeft = near` and `gainRight = far`, and `far` evaluates to all 1s (0 dB), so both are `[1,1,1,1,1,1]` and `toEqual` passes.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/binaural.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/acoustics/binaural.ts src/lib/acoustics/binaural.test.ts
git commit -m "feat: add spherical-head binaural cues" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Room simulation — stereo IR, ray paths, RT60

**Files:**
- Create: `src/lib/acoustics/simulate.ts`
- Test: `src/lib/acoustics/simulate.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–7.
- Produces:
  ```ts
  type StereoIr = { left: Float32Array; right: Float32Array; sampleRate: number };
  type RayPath = { points: Vec3[]; energy: number; hitFixes: boolean };
  type AcousticsResult = { ir: StereoIr; paths: RayPath[]; rt60: { bands: Bands; mid: number } };
  MAX_IR_SECONDS = 4; IR_MAX_ORDER = 10; MAX_PATHS = 200;
  withoutFixes(room: RoomState): RoomState
  predictRt60(room: RoomState): { bands: Bands; mid: number }
  simulateRoom(room: RoomState, sampleRate: number): AcousticsResult
  simulateBoth(room: RoomState, sampleRate: number): { now: AcousticsResult; withFixes: AcousticsResult }
  ```

How the IR is built:
1. **Early part:** image sources up to order 10. The transition time is `min(80 ms, earliest order-10 arrival)`, so every arrival before it is complete. Each arrival before the transition is written into 6 per-band buffers per ear with linear fractional delay (`delay + ear delay`), weighted by `gains[b] × ear gain[b]`. Each ear's band buffers then go through `applyBandMasks`. The FFT size is padded by 2 × 4096 samples so filter pre-ringing wraps into a region that is thrown away.
2. **Late tail:** from the transition onwards, `bandNoise` (one seed per ear) times a per-band envelope `σ₀ · exp(−6.908 t / RT_b)`, where `σ₀² = 4πc / (V · fs)`. That is the image-source energy density of a diffuse field, so the tail joins the early part at a matching level. A 5 ms raised-cosine fade-in avoids a click.
3. **Length:** `min(4 s, transition + 1.5 × max RT)`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/simulate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { MAX_IR_SECONDS, simulateBoth, simulateRoom, withoutFixes, type StereoIr } from './simulate';

const FS = 16000;

const energy = (ch: Float32Array, from: number, to: number) => {
  let e = 0;
  for (let i = from; i < Math.min(to, ch.length); i++) e += ch[i] * ch[i];
  return e;
};

const peakIndex = (ir: StereoIr, upTo: number) => {
  let best = 0;
  let index = 0;
  for (let i = 0; i < upTo; i++) {
    const v = Math.abs(ir.left[i]) + Math.abs(ir.right[i]);
    if (v > best) {
      best = v;
      index = i;
    }
  }
  return index;
};

const directSamples = (room: RoomState, fs: number) =>
  (Math.hypot(room.speaker.x - room.listener.x, room.speaker.y - room.listener.y, room.speaker.z - room.listener.z) /
    343) *
  fs;

const withLargeRug = (on = true): RoomState => ({
  ...defaultRoom(),
  fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }],
});

describe('simulateRoom', () => {
  it('returns a finite stereo IR at the requested sample rate', () => {
    const { ir } = simulateRoom(defaultRoom(), FS);
    expect(ir.sampleRate).toBe(FS);
    expect(ir.left.length).toBe(ir.right.length);
    expect(ir.left.length).toBeLessThanOrEqual(MAX_IR_SECONDS * FS);
    expect(ir.left.every(Number.isFinite) && ir.right.every(Number.isFinite)).toBe(true);
  });

  it('puts the direct sound at distance / c', () => {
    const room = defaultRoom();
    const { ir } = simulateRoom(room, FS);
    expect(Math.abs(peakIndex(ir, 0.02 * FS) - directSamples(room, FS))).toBeLessThanOrEqual(2);
  });

  it('scales timing with the sample rate (44.1 kHz)', () => {
    const room = defaultRoom();
    const { ir } = simulateRoom(room, 44100);
    expect(Math.abs(peakIndex(ir, 0.02 * 44100) - directSamples(room, 44100))).toBeLessThanOrEqual(2);
  });

  it('is louder in the right ear when the speaker is on the right', () => {
    const room: RoomState = {
      ...defaultRoom(),
      listener: { x: 2, y: 1.1, z: 1.2, yaw: 0 },
      speaker: { x: 2, y: 1.1, z: 2.4 },
    };
    const { ir } = simulateRoom(room, FS);
    const window = 0.01 * FS;
    expect(energy(ir.right, 0, window)).toBeGreaterThan(2 * energy(ir.left, 0, window));
  });

  it('rings longer in a bare room than a fully furnished one', () => {
    const bare = simulateRoom({ ...defaultRoom(), furnishing: 'bare' }, FS);
    const full = simulateRoom({ ...defaultRoom(), furnishing: 'full' }, FS);
    const from = 0.1 * FS;
    expect(bare.rt60.mid).toBeGreaterThan(full.rt60.mid);
    expect(energy(bare.ir.left, from, Infinity)).toBeGreaterThan(2 * energy(full.ir.left, from, Infinity));
  });

  it('shortens RT60 when the calibration factor doubles absorption', () => {
    const base = simulateRoom(defaultRoom(), FS).rt60.mid;
    const calibrated = simulateRoom({ ...defaultRoom(), calibration: { factor: 2 } }, FS).rt60.mid;
    expect(calibrated).toBeLessThan(0.55 * base);
  });

  it('returns at most 200 ray paths, strongest first, starting with the direct path', () => {
    const { paths } = simulateRoom(defaultRoom(), FS);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.length).toBeLessThanOrEqual(200);
    expect(paths[0].points).toHaveLength(2);
    for (let i = 1; i < paths.length; i++) expect(paths[i].energy).toBeLessThanOrEqual(paths[i - 1].energy);
  });

  it('caps huge reverberant rooms at 4 s with finite samples', () => {
    const room: RoomState = {
      ...defaultRoom(),
      dims: { length: 30, width: 30, height: 15 },
      surfaces: {
        floor: 'concrete',
        ceiling: 'concrete',
        wallX0: 'concrete',
        wallX1: 'concrete',
        wallZ0: 'concrete',
        wallZ1: 'concrete',
      },
      furnishing: 'bare',
      speaker: { x: 5, y: 1.5, z: 10 },
      listener: { x: 20, y: 1.2, z: 15, yaw: 'faceSpeaker' },
    };
    const { ir, rt60 } = simulateRoom(room, FS);
    expect(rt60.mid).toBeGreaterThan(3);
    expect(ir.left.length).toBe(MAX_IR_SECONDS * FS);
    expect(ir.left.every(Number.isFinite)).toBe(true);
  });

  it('stays finite in an over-absorbed room', () => {
    const room: RoomState = {
      ...defaultRoom(),
      surfaces: {
        floor: 'acousticPanel',
        ceiling: 'acousticPanel',
        wallX0: 'acousticPanel',
        wallX1: 'acousticPanel',
        wallZ0: 'acousticPanel',
        wallZ1: 'acousticPanel',
      },
      furnishing: 'full',
      calibration: { factor: 10 },
    };
    const { ir, rt60 } = simulateRoom(room, FS);
    expect(rt60.mid).toBeGreaterThan(0);
    expect(Number.isFinite(rt60.mid)).toBe(true);
    expect(ir.left.every(Number.isFinite)).toBe(true);
  });
});

describe('simulateBoth', () => {
  it('ignores fixes in "now" and applies switched-on fixes in "withFixes"', () => {
    const room = withLargeRug();
    const { now, withFixes } = simulateBoth(room, FS);
    expect(now.rt60.mid).toBeCloseTo(simulateRoom(withoutFixes(room), FS).rt60.mid, 12);
    expect(withFixes.rt60.mid).toBeLessThan(now.rt60.mid);
  });

  it('gives identical results when the fix is switched off', () => {
    const { now, withFixes } = simulateBoth(withLargeRug(false), FS);
    expect(withFixes.rt60.mid).toBeCloseTo(now.rt60.mid, 12);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/simulate.test.ts`
Expected: FAIL — cannot resolve `./simulate`.

- [ ] **Step 3: Implement**

Create `src/lib/acoustics/simulate.ts`:
```ts
import type { RoomState, Vec3 } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';
import { earResponse, listenerYaw } from './binaural';
import { applyBandMasks, bandMasks, bandNoise, nextPow2 } from './dsp';
import { computeImageSources, pathEnergy, type Arrival } from './imageSource';
import { eyring, midRt60, roomVolume, totalSurfaceArea } from './reverbTime';

export const MAX_IR_SECONDS = 4;
export const IR_MAX_ORDER = 10;
export const MAX_PATHS = 200;

const MAX_TRANSITION_SECONDS = 0.08;
const TAIL_FADE_SECONDS = 0.005;
const FILTER_PAD = 4096;
const NOISE_SEED = { left: 1, right: 2 };
const LN_1000 = 6.907755; // 60 dB decay in nepers

export type StereoIr = { left: Float32Array; right: Float32Array; sampleRate: number };
export type RayPath = { points: Vec3[]; energy: number; hitFixes: boolean };
export type AcousticsResult = { ir: StereoIr; paths: RayPath[]; rt60: { bands: Bands; mid: number } };

export const withoutFixes = (room: RoomState): RoomState => ({ ...room, fixes: [] });

export function predictRt60(room: RoomState): { bands: Bands; mid: number } {
  const bands = eyring(roomVolume(room.dims), totalSurfaceArea(room.dims), absorptionArea(room));
  return { bands, mid: midRt60(bands) };
}

export function simulateBoth(room: RoomState, sampleRate: number) {
  return { now: simulateRoom(withoutFixes(room), sampleRate), withFixes: simulateRoom(room, sampleRate) };
}

export function simulateRoom(room: RoomState, sampleRate: number): AcousticsResult {
  const rt60 = predictRt60(room);
  const arrivals = computeImageSources({
    dims: room.dims,
    source: room.speaker,
    listener: room.listener,
    maxOrder: IR_MAX_ORDER,
    lookup: makeSurfaceLookup(room),
  });

  let transition = MAX_TRANSITION_SECONDS;
  for (const a of arrivals) if (a.order === IR_MAX_ORDER) transition = Math.min(transition, a.delay);
  const early = arrivals.filter((a) => a.delay < transition);

  const seconds = Math.min(MAX_IR_SECONDS, transition + 1.5 * Math.max(...rt60.bands));
  const length = Math.ceil(seconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  renderEarly(early, listenerYaw(room.listener, room.speaker), transition, sampleRate, left, right);
  addTail(rt60.bands, roomVolume(room.dims), transition, sampleRate, left, right);

  const paths = early
    .map((a) => ({ points: a.points, energy: pathEnergy(a), hitFixes: a.hitFixes }))
    .sort((p, q) => q.energy - p.energy)
    .slice(0, MAX_PATHS);

  return { ir: { left, right, sampleRate }, paths, rt60 };
}

function renderEarly(
  arrivals: Arrival[],
  yaw: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const span = Math.ceil((transition + 0.002) * sampleRate);
  const fftSize = nextPow2(span + 2 * FILTER_PAD);
  const bandsLeft = Array.from({ length: NUM_BANDS }, () => new Float64Array(fftSize));
  const bandsRight = Array.from({ length: NUM_BANDS }, () => new Float64Array(fftSize));

  for (const a of arrivals) {
    const ear = earResponse(a.direction, yaw);
    addImpulse(bandsLeft, (a.delay + ear.delayLeft) * sampleRate, a.gains, ear.gainLeft);
    addImpulse(bandsRight, (a.delay + ear.delayRight) * sampleRate, a.gains, ear.gainRight);
  }

  const masks = bandMasks(fftSize, sampleRate);
  const outLeft = applyBandMasks(bandsLeft, masks);
  const outRight = applyBandMasks(bandsRight, masks);
  const keep = Math.min(left.length, span + FILTER_PAD);
  for (let i = 0; i < keep; i++) {
    left[i] += outLeft[i];
    right[i] += outRight[i];
  }
}

function addImpulse(bands: Float64Array[], position: number, gains: Bands, earGains: Bands): void {
  const i0 = Math.floor(position);
  const frac = position - i0;
  for (let b = 0; b < NUM_BANDS; b++) {
    const v = gains[b] * earGains[b];
    bands[b][i0] += v * (1 - frac);
    bands[b][i0 + 1] += v * frac;
  }
}

function addTail(
  rt: Bands,
  volume: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const sigma0 = Math.sqrt((4 * Math.PI * SPEED_OF_SOUND) / (volume * sampleRate));
  const start = Math.floor(transition * sampleRate);
  const fade = Math.max(1, Math.round(TAIL_FADE_SECONDS * sampleRate));
  const noiseLength = Math.ceil(MAX_IR_SECONDS * sampleRate);

  for (const [out, seed] of [
    [left, NOISE_SEED.left],
    [right, NOISE_SEED.right],
  ] as const) {
    const noise = bandNoise(noiseLength, sampleRate, seed);
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/simulate.test.ts`
Expected: PASS. The 44.1 kHz test builds a 4 s noise cache and may take a second or two.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/acoustics/simulate.ts src/lib/acoustics/simulate.test.ts
git commit -m "feat: render binaural room impulse responses" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Web Worker protocol and client

**Files:**
- Create: `src/lib/acoustics/protocol.ts`, `src/lib/acoustics/worker.ts`, `src/lib/acoustics/client.ts`
- Test: `src/lib/acoustics/protocol.test.ts`

**Interfaces:**
- Consumes: `simulateBoth`, `AcousticsResult` (Task 8); `validateRoom` (Task 2).
- Produces:
  ```ts
  type SimRequest = { id: number; room: RoomState; sampleRate: number };
  type SimResponse =
    | { id: number; ok: true; now: AcousticsResult; withFixes: AcousticsResult }
    | { id: number; ok: false; error: string };
  handleRequest(req: SimRequest): SimResponse
  transferables(res: SimResponse): ArrayBuffer[]
  type SimOutput = { now: AcousticsResult; withFixes: AcousticsResult };
  class AcousticsClient { simulate(room: RoomState, sampleRate: number): Promise<SimOutput>; dispose(): void }
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/acoustics/protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { handleRequest, transferables } from './protocol';

describe('handleRequest', () => {
  it('simulates a valid room and echoes the id', () => {
    const res = handleRequest({ id: 7, room: defaultRoom(), sampleRate: 16000 });
    expect(res.id).toBe(7);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.now.ir.sampleRate).toBe(16000);
      expect(transferables(res)).toHaveLength(4);
    }
  });

  it('refuses an invalid room instead of producing NaNs', () => {
    const room = defaultRoom();
    const res = handleRequest({ id: 8, room: { ...room, listener: { ...room.listener, ...room.speaker } }, sampleRate: 16000 });
    expect(res).toEqual({ id: 8, ok: false, error: expect.stringContaining('listener') });
    expect(transferables(res)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/acoustics/protocol.test.ts`
Expected: FAIL — cannot resolve `./protocol`.

- [ ] **Step 3: Implement the protocol**

Create `src/lib/acoustics/protocol.ts`:
```ts
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';
import { simulateBoth, type AcousticsResult } from './simulate';

export type SimRequest = { id: number; room: RoomState; sampleRate: number };
export type SimResponse =
  | { id: number; ok: true; now: AcousticsResult; withFixes: AcousticsResult }
  | { id: number; ok: false; error: string };

export function handleRequest({ id, room, sampleRate }: SimRequest): SimResponse {
  const errors = validateRoom(room);
  if (errors.length > 0) return { id, ok: false, error: errors.map((e) => e.message).join(' ') };
  try {
    return { id, ok: true, ...simulateBoth(room, sampleRate) };
  } catch (e) {
    return { id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function transferables(res: SimResponse): ArrayBuffer[] {
  if (!res.ok) return [];
  return [res.now.ir.left, res.now.ir.right, res.withFixes.ir.left, res.withFixes.ir.right].map(
    (a) => a.buffer as ArrayBuffer,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/acoustics/protocol.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the worker entry and client**

Create `src/lib/acoustics/worker.ts`:
```ts
import { handleRequest, transferables, type SimRequest } from './protocol';

addEventListener('message', (event: MessageEvent<SimRequest>) => {
  const response = handleRequest(event.data);
  postMessage(response, { transfer: transferables(response) });
});
```

Create `src/lib/acoustics/client.ts`:
```ts
import type { RoomState } from '@/lib/room/types';
import type { SimResponse } from './protocol';
import type { AcousticsResult } from './simulate';

export type SimOutput = { now: AcousticsResult; withFixes: AcousticsResult };

type Pending = { resolve: (value: SimOutput) => void; reject: (error: Error) => void };

/** Runs room simulations in a Web Worker so dragging and typing stay smooth. */
export class AcousticsClient {
  private readonly worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    this.worker.onmessage = (event: MessageEvent<SimResponse>) => {
      const res = event.data;
      const pending = this.pending.get(res.id);
      if (!pending) return;
      this.pending.delete(res.id);
      if (res.ok) pending.resolve({ now: res.now, withFixes: res.withFixes });
      else pending.reject(new Error(res.error));
    };
    this.worker.onerror = (event) => {
      for (const p of this.pending.values()) p.reject(new Error(event.message || "Couldn't simulate this room"));
      this.pending.clear();
    };
  }

  simulate(room: RoomState, sampleRate: number): Promise<SimOutput> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, room, sampleRate });
    });
  }

  dispose(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error('Simulation cancelled'));
    this.pending.clear();
  }
}
```

The worker and client run only in the browser; Task 13 verifies them end to end.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/acoustics/protocol.ts src/lib/acoustics/protocol.test.ts src/lib/acoustics/worker.ts src/lib/acoustics/client.ts
git commit -m "feat: run room simulation in a web worker" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Share-link codec

**Files:**
- Create: `src/lib/room/urlCodec.ts`
- Test: `src/lib/room/urlCodec.test.ts`

**Interfaces:**
- Consumes: room types, `validateRoom` (Task 2).
- Produces: `encodePayload(value: unknown): Promise<string>` (returns `v1.<base64url deflate-raw JSON>`), `encodeRoom(room: RoomState): Promise<string>`, `decodeRoom(code: string): Promise<RoomState | null>`, `migrate(raw: unknown): RoomState | null`.

`migrate` rebuilds the room field by field, so unknown fields never pass through, and returns `null` for anything that isn't a valid version-1 room.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/urlCodec.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';
import { decodeRoom, encodePayload, encodeRoom } from './urlCodec';

describe('share-link codec', () => {
  it('round-trips a room through a URL-safe code', async () => {
    const room: RoomState = {
      ...defaultRoom(),
      fixes: [
        { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true },
        { kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: false },
      ],
      calibration: { factor: 1.3, measuredRt60: 0.48 },
    };
    const code = await encodeRoom(room);
    expect(code).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(await decodeRoom(code)).toEqual(room);
  });

  it('keeps the default room link short', async () => {
    expect((await encodeRoom(defaultRoom())).length).toBeLessThan(600);
  });

  it('returns null for garbage instead of throwing', async () => {
    for (const code of ['', 'hello', 'v1.', 'v1.%%%', 'v1.AAAA']) {
      expect(await decodeRoom(code)).toBeNull();
    }
  });

  it('returns null for other versions', async () => {
    expect(await decodeRoom(await encodePayload({ ...defaultRoom(), v: 2 }))).toBeNull();
  });

  it('returns null for wrong types', async () => {
    const room = defaultRoom();
    expect(await decodeRoom(await encodePayload({ ...room, dims: { ...room.dims, length: 'abc' } }))).toBeNull();
    expect(await decodeRoom(await encodePayload({ ...room, surfaces: { ...room.surfaces, floor: 'lava' } }))).toBeNull();
    expect(await decodeRoom(await encodePayload({ ...room, fixes: [{ kind: 'sofa' }] }))).toBeNull();
  });

  it('returns null for rooms that fail validation', async () => {
    const room = defaultRoom();
    expect(await decodeRoom(await encodePayload({ ...room, dims: { ...room.dims, length: 100 } }))).toBeNull();
  });

  it('drops unknown fields', async () => {
    const decoded = await decodeRoom(await encodePayload({ ...defaultRoom(), evil: '<script>' }));
    expect(decoded).toEqual(defaultRoom());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/urlCodec.test.ts`
Expected: FAIL — cannot resolve `./urlCodec`.

- [ ] **Step 3: Implement**

Create `src/lib/room/urlCodec.ts`:
```ts
import { validateRoom } from './roomState';
import {
  MATERIAL_IDS,
  SURFACE_IDS,
  WALL_IDS,
  type Fix,
  type Furnishing,
  type MaterialId,
  type RoomState,
  type RugSize,
  type SurfaceId,
  type Vec3,
  type WallId,
} from './types';

const PREFIX = 'v1.';

export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export const encodeRoom = (room: RoomState) => encodePayload(room);

export async function decodeRoom(code: string): Promise<RoomState | null> {
  if (!code.startsWith(PREFIX)) return null;
  try {
    const bytes = await pipe(fromBase64Url(code.slice(PREFIX.length)), new DecompressionStream('deflate-raw'));
    return migrate(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function migrate(raw: unknown): RoomState | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.name !== 'string') return null;

  const dims = isRecord(raw.dims)
    ? { length: num(raw.dims.length), width: num(raw.dims.width), height: num(raw.dims.height) }
    : null;
  if (!dims || dims.length === null || dims.width === null || dims.height === null) return null;

  if (!isRecord(raw.surfaces)) return null;
  const surfaces = {} as Record<SurfaceId, MaterialId>;
  for (const s of SURFACE_IDS) {
    const m = raw.surfaces[s];
    if (!oneOf(MATERIAL_IDS, m)) return null;
    surfaces[s] = m;
  }

  if (!oneOf(['bare', 'some', 'full'] as const, raw.furnishing)) return null;
  const furnishing: Furnishing = raw.furnishing;

  const speaker = vec(raw.speaker);
  const listenerPos = vec(raw.listener);
  if (!speaker || !listenerPos || !isRecord(raw.listener)) return null;
  const yaw = raw.listener.yaw === 'faceSpeaker' ? 'faceSpeaker' : num(raw.listener.yaw);
  if (yaw === null) return null;

  if (!Array.isArray(raw.fixes)) return null;
  const fixes = raw.fixes.map(fix);
  if (fixes.some((f) => f === null)) return null;

  if (!isRecord(raw.calibration)) return null;
  const factor = num(raw.calibration.factor);
  if (factor === null || factor <= 0) return null;
  const measured = raw.calibration.measuredRt60 === undefined ? undefined : num(raw.calibration.measuredRt60);
  if (measured === null) return null;

  const room: RoomState = {
    v: 1,
    name: raw.name.slice(0, 80),
    dims: { length: dims.length, width: dims.width, height: dims.height },
    surfaces,
    furnishing,
    speaker,
    listener: { ...listenerPos, yaw },
    fixes: fixes as Fix[],
    calibration: measured === undefined ? { factor } : { factor, measuredRt60: measured },
  };
  return validateRoom(room).length === 0 ? room : null;
}

function fix(raw: unknown): Fix | null {
  if (!isRecord(raw) || typeof raw.on !== 'boolean') return null;
  if (raw.kind === 'rug') {
    const x = num(raw.x);
    const z = num(raw.z);
    if (x === null || z === null || !oneOf(['S', 'M', 'L'] as const, raw.size)) return null;
    return { kind: 'rug', size: raw.size as RugSize, x, z, on: raw.on };
  }
  if (raw.kind === 'panel') {
    const u = num(raw.u);
    const v = num(raw.v);
    if (u === null || v === null || !oneOf(WALL_IDS, raw.wall)) return null;
    return { kind: 'panel', wall: raw.wall as WallId, u, v, on: raw.on };
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(options: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

function vec(raw: unknown): Vec3 | null {
  if (!isRecord(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const z = num(raw.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/urlCodec.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/room/urlCodec.ts src/lib/room/urlCodec.test.ts
git commit -m "feat: encode rooms into share-link fragments" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Audio — mix helpers and the Web Audio engine

**Files:**
- Create: `src/lib/audio/mix.ts`, `src/lib/audio/engine.ts`
- Test: `src/lib/audio/mix.test.ts`

**Interfaces:**
- Consumes: `StereoIr` (Task 8).
- Produces:
  - `type ListenMode = { room: boolean; fixes: boolean }`
  - `modeGains(mode: ListenMode): { dry: number; now: number; withFixes: number }`
  - `downmixToMono(channels: Float32Array[]): Float32Array`
  - `normalizeIr(ir: StereoIr): StereoIr` — scales so mean per-ear energy is 1 (zero IR returned unchanged)
  - `CROSSFADE_SECONDS = 0.05`
  - `class AudioEngine { constructor(); get sampleRate(): number; get playing(): boolean; loadSong(file: File): Promise<void>; play(): Promise<void>; pause(): void; setIrs(now: StereoIr, withFixes: StereoIr): void; setMode(mode: ListenMode): void; dispose(): void }`

Graph: `source (mono) → input → dry → master`; `input → convolver → gain → slot out → master` with two convolver/gain pairs per slot ("now", "withFixes"). A new IR goes into the slot's idle pair, which crossfades in. Convolvers are replaced, never re-assigned, because some browsers refuse a second `buffer` assignment.

**Deviation from spec §6:** crossfades are 50 ms *linear* ramps, not equal-power curves. Equal-power needs `setValueCurveAtTime`, which throws if a new fade starts while one is running (fast toggling); at 50 ms the ~3 dB mid-fade dip of a linear fade is not audible.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/audio/mix.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { downmixToMono, modeGains, normalizeIr } from './mix';

describe('modeGains', () => {
  it('plays only the dry path when the room is off', () => {
    expect(modeGains({ room: false, fixes: true })).toEqual({ dry: 1, now: 0, withFixes: 0 });
  });
  it('plays the current room', () => {
    expect(modeGains({ room: true, fixes: false })).toEqual({ dry: 0, now: 1, withFixes: 0 });
  });
  it('plays the room with fixes', () => {
    expect(modeGains({ room: true, fixes: true })).toEqual({ dry: 0, now: 0, withFixes: 1 });
  });
});

describe('downmixToMono', () => {
  it('averages stereo', () => {
    expect(Array.from(downmixToMono([Float32Array.of(1, 0), Float32Array.of(0, 1)]))).toEqual([0.5, 0.5]);
  });
  it('averages six channels', () => {
    const channels = Array.from({ length: 6 }, (_, i) => Float32Array.of(i));
    expect(downmixToMono(channels)[0]).toBeCloseTo(2.5, 6);
  });
  it('passes mono through', () => {
    expect(Array.from(downmixToMono([Float32Array.of(0.25, -0.5)]))).toEqual([0.25, -0.5]);
  });
});

describe('normalizeIr', () => {
  it('scales to unit mean ear energy', () => {
    const ir = normalizeIr({ left: Float32Array.of(2, 0), right: Float32Array.of(0, 2), sampleRate: 48000 });
    const energy = (a: Float32Array) => a.reduce((s, v) => s + v * v, 0);
    expect((energy(ir.left) + energy(ir.right)) / 2).toBeCloseTo(1, 6);
    expect(ir.sampleRate).toBe(48000);
  });
  it('leaves a silent IR alone', () => {
    const ir = { left: new Float32Array(4), right: new Float32Array(4), sampleRate: 48000 };
    expect(normalizeIr(ir)).toBe(ir);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/audio/mix.test.ts`
Expected: FAIL — cannot resolve `./mix`.

- [ ] **Step 3: Implement the mix helpers**

Create `src/lib/audio/mix.ts`:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/audio/mix.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the engine**

Create `src/lib/audio/engine.ts`:
```ts
import type { StereoIr } from '@/lib/acoustics/simulate';
import { downmixToMono, modeGains, normalizeIr, type ListenMode } from './mix';

export const CROSSFADE_SECONDS = 0.05;

type Slot = {
  convolvers: [ConvolverNode, ConvolverNode];
  gains: [GainNode, GainNode];
  active: 0 | 1;
  out: GainNode;
  loaded: boolean;
};

/** Plays one song dry, through the "now" room, or through the room with fixes, switching without clicks. */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly slots: { now: Slot; withFixes: Slot };
  private song: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private startedAt = 0;
  private offset = 0;
  private mode: ListenMode = { room: true, fixes: false };

  constructor() {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = 'playback'; // keep playing with the iPhone silent switch on
    this.ctx = new AudioContext({ latencyHint: 'playback' });
    const master = new GainNode(this.ctx);
    master.connect(this.ctx.destination);
    this.input = new GainNode(this.ctx);
    this.dry = new GainNode(this.ctx, { gain: 0 });
    this.input.connect(this.dry).connect(master);
    this.slots = { now: this.createSlot(master), withFixes: this.createSlot(master) };
    this.applyMode(0);
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  get playing(): boolean {
    return this.source !== null;
  }

  /** Decodes a local file (never uploaded) and mixes it to mono: one speaker is one point source. */
  async loadSong(file: File): Promise<void> {
    const decoded = await this.ctx.decodeAudioData(await file.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
    const mono = this.ctx.createBuffer(1, decoded.length, decoded.sampleRate);
    mono.getChannelData(0).set(downmixToMono(channels));
    this.pause();
    this.offset = 0;
    this.song = mono;
  }

  async play(): Promise<void> {
    if (!this.song || this.source) return;
    await this.ctx.resume();
    const source = new AudioBufferSourceNode(this.ctx, { buffer: this.song, loop: true });
    source.connect(this.input);
    source.start(0, this.offset);
    this.startedAt = this.ctx.currentTime - this.offset;
    this.source = source;
  }

  pause(): void {
    if (!this.source || !this.song) return;
    this.offset = (this.ctx.currentTime - this.startedAt) % this.song.duration;
    this.source.stop();
    this.source.disconnect();
    this.source = null;
  }

  setIrs(now: StereoIr, withFixes: StereoIr): void {
    this.loadSlot(this.slots.now, now);
    this.loadSlot(this.slots.withFixes, withFixes);
  }

  setMode(mode: ListenMode): void {
    this.mode = mode;
    this.applyMode(CROSSFADE_SECONDS);
  }

  dispose(): void {
    this.source?.stop();
    void this.ctx.close();
  }

  private createSlot(master: GainNode): Slot {
    const out = new GainNode(this.ctx, { gain: 0 });
    out.connect(master);
    const pair = (): [ConvolverNode, GainNode] => {
      const conv = new ConvolverNode(this.ctx, { disableNormalization: true });
      const gain = new GainNode(this.ctx, { gain: 0 });
      conv.connect(gain).connect(out);
      return [conv, gain];
    };
    const [c0, g0] = pair();
    const [c1, g1] = pair();
    return { convolvers: [c0, c1], gains: [g0, g1], active: 0, out, loaded: false };
  }

  private loadSlot(slot: Slot, ir: StereoIr): void {
    const idle = slot.active === 0 ? 1 : 0;
    const old = slot.convolvers[idle];
    try {
      this.input.disconnect(old);
    } catch {
      // never connected yet
    }
    old.disconnect();

    const normalized = normalizeIr(ir);
    const buffer = this.ctx.createBuffer(2, normalized.left.length, normalized.sampleRate);
    buffer.getChannelData(0).set(normalized.left);
    buffer.getChannelData(1).set(normalized.right);
    const conv = new ConvolverNode(this.ctx, { disableNormalization: true, buffer });
    this.input.connect(conv);
    conv.connect(slot.gains[idle]);
    slot.convolvers[idle] = conv;

    const t = this.ctx.currentTime;
    if (slot.loaded) {
      ramp(slot.gains[idle].gain, 1, t);
      ramp(slot.gains[slot.active].gain, 0, t);
    } else {
      slot.gains[idle].gain.setValueAtTime(1, t);
    }
    slot.active = idle;
    slot.loaded = true;
  }

  private applyMode(seconds: number): void {
    const g = modeGains(this.mode);
    const t = this.ctx.currentTime;
    ramp(this.dry.gain, g.dry, t, seconds);
    ramp(this.slots.now.out.gain, g.now, t, seconds);
    ramp(this.slots.withFixes.out.gain, g.withFixes, t, seconds);
  }
}

function ramp(param: AudioParam, value: number, t: number, seconds = CROSSFADE_SECONDS): void {
  param.cancelScheduledValues(t);
  param.setValueAtTime(param.value, t);
  if (seconds > 0) param.linearRampToValueAtTime(value, t + seconds);
  else param.setValueAtTime(value, t);
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/audio
git commit -m "feat: add audio engine with matched-loudness A/B crossfades" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Store, rating and the simulation hook

**Files:**
- Create: `src/lib/room/store.ts`, `src/lib/room/rating.ts`, `src/components/useSimulation.ts`
- Test: `src/lib/room/store.test.ts`, `src/lib/room/rating.test.ts`

**Interfaces:**
- Consumes: `defaultRoom`, `validateRoom` (Task 2); `AcousticsClient`, `SimOutput` (Task 9).
- Produces:
  - `useRoomStore` (zustand) with state `{ room: RoomState; setRoom(room: RoomState): void; update(fn: (room: RoomState) => RoomState): void }`
  - `type RatingLabel = 'Dead' | 'Balanced' | 'A bit echoey' | 'Echoey'`, `rateRt60(mid: number): RatingLabel` (0.3–0.5 s is "Balanced", inclusive)
  - `type SimState = { status: 'idle' | 'running' | 'ready' | 'error'; result: SimOutput | null; error: string | null }`, `useSimulation(room: RoomState, sampleRate: number | null): SimState` — debounces 150 ms, skips invalid rooms, keeps the last good result on error.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/store.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { useRoomStore } from './store';

describe('useRoomStore', () => {
  it('starts with the default room', () => {
    expect(useRoomStore.getState().room).toEqual(defaultRoom());
  });

  it('updates and replaces the room', () => {
    useRoomStore.getState().update((r) => ({ ...r, name: 'Studio' }));
    expect(useRoomStore.getState().room.name).toBe('Studio');
    useRoomStore.getState().setRoom(defaultRoom());
    expect(useRoomStore.getState().room.name).toBe('My room');
  });
});
```

Create `src/lib/room/rating.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rateRt60 } from './rating';

describe('rateRt60', () => {
  it.each([
    [0.29, 'Dead'],
    [0.3, 'Balanced'],
    [0.5, 'Balanced'],
    [0.51, 'A bit echoey'],
    [0.8, 'A bit echoey'],
    [0.81, 'Echoey'],
  ])('rates %s s as %s', (rt, label) => {
    expect(rateRt60(rt)).toBe(label);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/store.test.ts src/lib/room/rating.test.ts`
Expected: FAIL — cannot resolve `./store` / `./rating`.

- [ ] **Step 3: Implement store and rating**

Create `src/lib/room/store.ts`:
```ts
import { create } from 'zustand';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';

type RoomStore = {
  room: RoomState;
  setRoom: (room: RoomState) => void;
  update: (fn: (room: RoomState) => RoomState) => void;
};

export const useRoomStore = create<RoomStore>()((set) => ({
  room: defaultRoom(),
  setRoom: (room) => set({ room }),
  update: (fn) => set((state) => ({ room: fn(state.room) })),
}));
```

Create `src/lib/room/rating.ts`:
```ts
export type RatingLabel = 'Dead' | 'Balanced' | 'A bit echoey' | 'Echoey';

/** Plain-language rating against the 0.3–0.5 s target for living rooms and bedrooms. */
export function rateRt60(mid: number): RatingLabel {
  if (mid < 0.3) return 'Dead';
  if (mid <= 0.5) return 'Balanced';
  if (mid <= 0.8) return 'A bit echoey';
  return 'Echoey';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/store.test.ts src/lib/room/rating.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the simulation hook**

Create `src/components/useSimulation.ts`:
```ts
'use client';

import { useEffect, useRef, useState } from 'react';
import { AcousticsClient, type SimOutput } from '@/lib/acoustics/client';
import { validateRoom } from '@/lib/room/roomState';
import type { RoomState } from '@/lib/room/types';

export type SimState = {
  status: 'idle' | 'running' | 'ready' | 'error';
  result: SimOutput | null;
  error: string | null;
};

const DEBOUNCE_MS = 150;

/** Re-simulates the room in a worker 150 ms after it stops changing. Keeps the last good result on failure. */
export function useSimulation(room: RoomState, sampleRate: number | null): SimState {
  const clientRef = useRef<AcousticsClient | null>(null);
  const [state, setState] = useState<SimState>({ status: 'idle', result: null, error: null });

  useEffect(() => {
    const client = new AcousticsClient();
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (sampleRate === null || validateRoom(room).length > 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const client = clientRef.current;
      if (!client) return;
      setState((s) => ({ ...s, status: 'running' }));
      client.simulate(room, sampleRate).then(
        (result) => {
          if (!cancelled) setState({ status: 'ready', result, error: null });
        },
        (error: Error) => {
          if (!cancelled) setState((s) => ({ status: 'error', result: s.result, error: error.message }));
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [room, sampleRate]);

  return state;
}
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/room/store.ts src/lib/room/store.test.ts src/lib/room/rating.ts src/lib/room/rating.test.ts src/components/useSimulation.ts
git commit -m "feat: add room store, RT60 rating and simulation hook" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Pages — room form, player, share link; end-to-end check

**Files:**
- Create: `src/components/RoomForm.tsx`, `src/components/Player.tsx`, `src/components/ShareButton.tsx`, `src/app/room/page.tsx`
- Modify (replace contents): `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `useRoomStore`, `validateRoom`, `rateRt60`, `encodeRoom`, `decodeRoom`, `MATERIALS`, `predictRt60`, `withoutFixes`, `AudioEngine`, `ListenMode`, `useSimulation`.
- Produces: routes `/` and `/room` (the latter reads `#v1.…` share codes).

The AudioContext is created on the first song pick, inside a user gesture, which is what iOS requires. The room card's RT60 comes from `predictRt60` on the main thread, so it shows before any song is picked.

- [ ] **Step 1: Replace global styles and layout**

Replace `src/app/globals.css` with:
```css
@import "tailwindcss";
```

Replace `src/app/layout.tsx` with:
```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hearify',
  description: 'Hear how your room sounds, and what a rug would fix, before you buy anything.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Replace the landing page**

Replace `src/app/page.tsx` with:
```tsx
import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4">
      <h1 className="text-4xl font-bold">Hearify</h1>
      <p className="text-lg text-neutral-300">
        Hear your music the way it sounds in your room, then hear what a rug or a few panels would fix, before you
        buy anything.
      </p>
      <p className="text-sm text-neutral-400">🎧 Use headphones. Room differences are hard to hear on phone speakers.</p>
      <Link href="/room" className="self-start rounded-lg bg-white px-5 py-3 font-semibold text-neutral-950">
        Try your room
      </Link>
    </main>
  );
}
```

- [ ] **Step 3: Write the room form**

Create `src/components/RoomForm.tsx`:
```tsx
'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { LIMITS } from '@/lib/room/constants';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import {
  MATERIAL_IDS,
  SURFACE_IDS,
  WALL_IDS,
  type Fix,
  type Furnishing,
  type MaterialId,
  type RoomState,
  type RugSize,
  type SurfaceId,
  type WallId,
} from '@/lib/room/types';

const SURFACE_LABELS: Record<SurfaceId, string> = {
  floor: 'Floor',
  ceiling: 'Ceiling',
  wallX0: 'Front wall',
  wallX1: 'Back wall',
  wallZ0: 'Left wall',
  wallZ1: 'Right wall',
};

const FURNISHING_LABELS: Record<Furnishing, string> = {
  bare: 'Bare (empty room)',
  some: 'Some (bed or sofa)',
  full: 'Full (bed, sofa, shelves, curtains)',
};

const RUG_LABELS: Record<RugSize, string> = { S: 'Small 1.2 × 1.8 m', M: 'Medium 1.6 × 2.3 m', L: 'Large 2 × 3 m' };

const inputClass = 'rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5';

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-400">{label}</span>
      <input
        type="number"
        inputMode="decimal"
        step={0.1}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className={`${inputClass} w-24`}
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      {children}
    </section>
  );
}

export function RoomForm() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const errors = validateRoom(room);
  const rugCount = room.fixes.filter((f) => f.kind === 'rug').length;
  const panelCount = room.fixes.length - rugCount;

  const setDim = (key: keyof RoomState['dims'], value: number) =>
    update((r) => ({ ...r, dims: { ...r.dims, [key]: value } }));
  const setSpeaker = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, speaker: { ...r.speaker, [axis]: value } }));
  const setListener = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, listener: { ...r.listener, [axis]: value } }));
  const setFix = (index: number, patch: Partial<Fix>) =>
    update((r) => ({ ...r, fixes: r.fixes.map((f, i) => (i === index ? ({ ...f, ...patch } as Fix) : f)) }));
  const removeFix = (index: number) => update((r) => ({ ...r, fixes: r.fixes.filter((_, i) => i !== index) }));
  const addRug = () =>
    update((r) => ({
      ...r,
      fixes: [...r.fixes, { kind: 'rug', size: 'M', x: r.dims.length / 2, z: r.dims.width / 2, on: true }],
    }));
  const addPanel = () =>
    update((r) => ({
      ...r,
      fixes: [...r.fixes, { kind: 'panel', wall: 'wallZ1', u: r.dims.length / 2, v: 1.2, on: true }],
    }));

  return (
    <div className="flex flex-col gap-8">
      <Section title="Room size (metres)">
        <div className="flex flex-wrap gap-3">
          <NumberField label="Length" value={room.dims.length} onChange={(v) => setDim('length', v)} />
          <NumberField label="Width" value={room.dims.width} onChange={(v) => setDim('width', v)} />
          <NumberField label="Ceiling height" value={room.dims.height} onChange={(v) => setDim('height', v)} />
        </div>
      </Section>

      <Section title="Surfaces">
        <div className="grid grid-cols-2 gap-3">
          {SURFACE_IDS.map((surface) => (
            <label key={surface} className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-400">{SURFACE_LABELS[surface]}</span>
              <select
                value={room.surfaces[surface]}
                onChange={(e) =>
                  update((r) => ({ ...r, surfaces: { ...r.surfaces, [surface]: e.target.value as MaterialId } }))
                }
                className={inputClass}
              >
                {MATERIAL_IDS.map((m) => (
                  <option key={m} value={m}>
                    {MATERIALS[m].label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-neutral-400">Furniture</span>
          <select
            value={room.furnishing}
            onChange={(e) => update((r) => ({ ...r, furnishing: e.target.value as Furnishing }))}
            className={inputClass}
          >
            {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map((f) => (
              <option key={f} value={f}>
                {FURNISHING_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Speaker and listener (metres)">
        <p className="text-xs text-neutral-500">
          x runs along the length from the front wall, z across the width from the left wall, y is height.
        </p>
        <div className="flex flex-wrap gap-3">
          <NumberField label="Speaker x" value={room.speaker.x} onChange={(v) => setSpeaker('x', v)} />
          <NumberField label="Speaker y" value={room.speaker.y} onChange={(v) => setSpeaker('y', v)} />
          <NumberField label="Speaker z" value={room.speaker.z} onChange={(v) => setSpeaker('z', v)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <NumberField label="Listener x" value={room.listener.x} onChange={(v) => setListener('x', v)} />
          <NumberField label="Listener y" value={room.listener.y} onChange={(v) => setListener('y', v)} />
          <NumberField label="Listener z" value={room.listener.z} onChange={(v) => setListener('z', v)} />
        </div>
      </Section>

      <Section title="What if…">
        <div className="flex gap-3">
          <button
            onClick={addRug}
            disabled={rugCount >= LIMITS.maxRugs}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            + Rug
          </button>
          <button
            onClick={addPanel}
            disabled={panelCount >= LIMITS.maxPanels}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm disabled:opacity-40"
          >
            + Panel
          </button>
        </div>
        {room.fixes.map((fix, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fix.on} onChange={(e) => setFix(i, { on: e.target.checked })} />
              {fix.kind === 'rug' ? 'Rug' : 'Panel'}
            </label>
            {fix.kind === 'rug' ? (
              <>
                <select
                  value={fix.size}
                  onChange={(e) => setFix(i, { size: e.target.value as RugSize })}
                  className={inputClass}
                >
                  {(['S', 'M', 'L'] as const).map((s) => (
                    <option key={s} value={s}>
                      {RUG_LABELS[s]}
                    </option>
                  ))}
                </select>
                <NumberField label="Centre x" value={fix.x} onChange={(v) => setFix(i, { x: v })} />
                <NumberField label="Centre z" value={fix.z} onChange={(v) => setFix(i, { z: v })} />
              </>
            ) : (
              <>
                <select
                  value={fix.wall}
                  onChange={(e) => setFix(i, { wall: e.target.value as WallId })}
                  className={inputClass}
                >
                  {WALL_IDS.map((w) => (
                    <option key={w} value={w}>
                      {SURFACE_LABELS[w]}
                    </option>
                  ))}
                </select>
                <NumberField label="Along wall" value={fix.u} onChange={(v) => setFix(i, { u: v })} />
                <NumberField label="Height" value={fix.v} onChange={(v) => setFix(i, { v })} />
              </>
            )}
            <button onClick={() => removeFix(i)} className="text-sm text-red-400">
              Remove
            </button>
          </div>
        ))}
      </Section>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          {errors.map((e) => (
            <li key={`${e.field}:${e.message}`}>{e.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the player**

Create `src/components/Player.tsx`:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { predictRt60, withoutFixes } from '@/lib/acoustics/simulate';
import { AudioEngine } from '@/lib/audio/engine';
import type { ListenMode } from '@/lib/audio/mix';
import { rateRt60 } from '@/lib/room/rating';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { useSimulation } from './useSimulation';

function Toggle({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: [string, string];
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`inline-flex rounded-lg border border-neutral-700 p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((label, i) => {
        const selected = value === (i === 1);
        return (
          <button
            key={label}
            disabled={disabled}
            onClick={() => onChange(i === 1)}
            className={`rounded-md px-3 py-1.5 text-sm ${selected ? 'bg-white text-neutral-950' : 'text-neutral-300'}`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Player() {
  const room = useRoomStore((s) => s.room);
  const engineRef = useRef<AudioEngine | null>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const [songName, setSongName] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sim = useSimulation(room, sampleRate);

  const valid = validateRoom(room).length === 0;
  const hasFixes = room.fixes.some((f) => f.on);
  const rtNow = valid ? predictRt60(withoutFixes(room)).mid : null;
  const rtFixed = valid && hasFixes ? predictRt60(room).mid : null;

  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    if (sim.result) engineRef.current?.setIrs(sim.result.now.ir, sim.result.withFixes.ir);
  }, [sim.result]);

  useEffect(() => {
    engineRef.current?.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
  }, [mode, hasFixes]);

  async function pickSong(file: File) {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      engineRef.current.setMode(mode);
      setSampleRate(engineRef.current.sampleRate);
    }
    setError(null);
    try {
      await engineRef.current.loadSong(file);
      setSongName(file.name);
      setPlaying(false);
    } catch {
      setError("This file type isn't supported on your browser. Try MP3 or M4A.");
    }
  }

  async function togglePlay() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      await engine.play();
      setPlaying(true);
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <p className="text-sm text-neutral-400">🎧 Use headphones. Room differences are hard to hear on phone speakers.</p>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-neutral-400">Song (stays on your device)</span>
        <input
          type="file"
          accept="audio/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pickSong(file);
          }}
          className="text-sm"
        />
      </label>
      {songName && <p className="truncate text-sm">{songName}</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        onClick={() => void togglePlay()}
        disabled={!songName || !sim.result}
        className="self-start rounded-lg bg-white px-5 py-2 font-semibold text-neutral-950 disabled:opacity-40"
      >
        {playing ? 'Pause' : 'Play'}
      </button>

      <div className="flex flex-wrap gap-3">
        <Toggle options={['Dry', 'In your room']} value={mode.room} onChange={(v) => setMode((m) => ({ ...m, room: v }))} />
        <Toggle
          options={['Now', 'With fixes']}
          value={mode.fixes}
          onChange={(v) => setMode((m) => ({ ...m, fixes: v }))}
          disabled={!mode.room || !hasFixes}
        />
      </div>

      <div className="flex flex-col gap-1 text-sm">
        {rtNow !== null && (
          <p>
            Now: <strong>{rtNow.toFixed(2)} s</strong> · {rateRt60(rtNow)}
          </p>
        )}
        {rtFixed !== null && (
          <p>
            With fixes: <strong>{rtFixed.toFixed(2)} s</strong> · {rateRt60(rtFixed)}
          </p>
        )}
        {rtNow !== null && rtFixed === null && <p className="text-neutral-500">Add a rug or panel to compare.</p>}
        {sim.status === 'running' && <p className="text-neutral-500">Simulating…</p>}
        {sim.status === 'error' && <p className="text-red-400">Couldn&apos;t simulate this room. {sim.error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Write the share button and the room page**

Create `src/components/ShareButton.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { encodeRoom } from '@/lib/room/urlCodec';

export function ShareButton() {
  const room = useRoomStore((s) => s.room);
  const [copied, setCopied] = useState(false);

  async function share() {
    const code = await encodeRoom(room);
    window.history.replaceState(null, '', `#${code}`);
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={() => void share()}
      disabled={validateRoom(room).length > 0}
      className="rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
    >
      {copied ? 'Link copied' : 'Share link'}
    </button>
  );
}
```

Create `src/app/room/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { Player } from '@/components/Player';
import { RoomForm } from '@/components/RoomForm';
import { ShareButton } from '@/components/ShareButton';
import { useRoomStore } from '@/lib/room/store';
import { decodeRoom } from '@/lib/room/urlCodec';

export default function RoomPage() {
  const setRoom = useRoomStore((s) => s.setRoom);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const code = window.location.hash.slice(1);
    if (!code) return;
    void decodeRoom(code).then((room) => {
      if (room) setRoom(room);
      else setNotice("This link couldn't be fully loaded, so you're starting from a default room.");
    });
  }, [setRoom]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      {notice && <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">{notice}</p>}
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="md:flex-1">
          <RoomForm />
        </div>
        <div className="md:w-80">
          <div className="md:sticky md:top-6">
            <Player />
          </div>
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Type-check, lint, test and build**

Run:
```powershell
npx tsc --noEmit
npm run lint
npm test
npm run build
```
Expected: no type errors; lint exits 0 (warnings allowed); all tests PASS; build succeeds and `out\room.html` exists. If the build fails to bundle the worker under Turbopack, run `npx next build --webpack` and, if that succeeds, set the build script with `npm pkg set scripts.build="next build --webpack"`.

- [ ] **Step 7: Manual end-to-end check in the browser**

Run: `npx serve@latest out` and open the printed URL in Chrome, with headphones on.

Check each item and note the result:
1. `/` shows the landing page; "Try your room" opens `/room`.
2. Pick an MP3. "Play" becomes enabled within about a second. It plays, and "In your room" sounds roomy compared with "Dry".
3. Set Furniture to "Bare": the RT60 goes up and the room audibly rings longer about 150 ms after the change.
4. Add a Large rug: "With fixes" shows a lower RT60. Toggling Now ↔ With fixes switches with no click, and the loudness stays about the same.
5. Type length `1`: a validation message appears and nothing crashes. Fix it back to `4`.
6. Click "Share link", open the copied URL in a new tab: the same room loads, including the rug.
7. Edit the fragment in the address bar to `#v1.garbage` and reload: the "couldn't be fully loaded" notice appears.
8. DevTools console: no errors (an AudioContext autoplay warning before the first song pick is acceptable).

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "feat: room setup form, player and share link" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
