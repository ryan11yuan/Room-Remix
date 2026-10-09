# Hearify Plan 9: Rehearse a Place by Sound — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete everything the demo doesn't use, then let a blind or low-vision explorer walk a room built from a video on headphones, hearing each object's name from where it is.

**Architecture:** Stage 1 (Tasks 1–2) deletes the hidden acoustics pages and the speaker features, keeping the splat viewer, room fit and object placement. Stage 2 adds pure, tested modules in `src/lib/explore/` (names, checked list, walking, scan, words, session state machine, keys, echo), a small browser audio layer (`src/lib/audio/`), and wires them into the viewer through `ExploreController` and `ExplorePanel`. Browser glue stays thin: every decision it makes comes from a pure function with tests.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, three.js with Spark, Web Audio (PannerNode HRTF, ConvolverNode), the browser's `speechSynthesis`, transformers.js (OWL-ViT) in the Node demo server, Kokoro (`kokoro-js`) or Windows' built-in voice for the clips, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-hearify-sound-rehearsal-design.md`

## Global Constraints

- Free and open-source only: never install or choose anything that costs money.
- Work on `main`. Another Claude session may share the working tree: run `git status` before each commit, commit by path (`git commit -m … -- <paths>`), and if a file you didn't touch shows as changed, leave it alone and tell the controller.
- End every commit message with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- This is Next.js 16, not the version in your training data: before writing page, layout or metadata code, read the relevant guide in `node_modules/next/dist/docs/` (AGENTS.md).
- Spark is imported only by `src/lib/scene/SplatLayer.ts` (an ESLint rule enforces it). Use `import type` for `SplatLayer` everywhere else.
- Room metres: origin at a floor corner, x along the room's length, z along its width, y up. A heading is `atan2(dz, dx)` of the facing direction; turning right **increases** it. A bearing is the clockwise angle from the facing direction, in `[0, 2π)`.
- Copy these strings exactly (spec §6–7): "Finding objects… (about 20 seconds the first time)", "Couldn't find objects. Add them by hand.", "Click the floor where it is.", "Couldn't save your changes.", "Couldn't load the voices.", "Start exploring", "Stop exploring", "Add an object", "You're at the starting point.", "Press H for help.", "Stopped.", "Film a place once. Someone who can't see it can explore it by sound."
- Comments: match the surrounding code's density (short doc comments that cite the spec section, e.g. `(spec 2026-10-08 §7.3)`).
- Commands (from the repo root): tests `npx vitest run [file]`, types `npx tsc --noEmit`, lint `npm run lint`, build `npx next build`. Each stage ends with all four passing, and ESLint showing no warnings beyond the 2 that exist today in test files.

## Review Focus

1. **A room where nothing was found** (the finder failed, or the helper removed everything): exploring still starts, the intro says "with nothing found yet", Space says "Nothing found around you." and Tab or Enter say "Nothing to go to yet." Pinned in Task 8.
2. **Keys the browser or OS needs** (Ctrl+Tab, Alt+Tab, Ctrl+W, Ctrl+R) must still work in explore mode: only unmodified keys are taken. Pinned in Task 8 (`keyAction`). Space or Enter pressed while a panel button still has focus must not click it: the controller blurs focus on start (checked in Task 14).
3. **A key held while the window loses focus** (alt-tab mid-walk never sends keyup): walking and turning stop. Pinned in Task 8 (`releaseAll`).
4. **A hand-edited or corrupt `checked-objects.json`**: the server answers 404 rather than 500, and the viewer falls back to the found objects. Pinned in Task 4.
5. **An object just left of straight ahead** (bearing a hair under 360°): it is announced last in a scan, at 12 o'clock, not first. Pinned in Tasks 5 and 6.

## File Structure

**Stage 1 deletes** (Tasks 1–2): see each task's list.

**Stage 2 creates:**

| File | Responsibility |
|---|---|
| `src/lib/explore/names.ts` | The 16 names: spoken words, prompts, blocking, sizes; clip ids |
| `src/lib/explore/checked.ts` | Validate, sort, add, rename and remove objects in the checked list |
| `src/lib/explore/geometry.ts` | `Pose`, box centre, footprint distance, bearing, clock hour |
| `src/lib/explore/walk.ts` | Steps, turns, walls and blocking objects |
| `src/lib/explore/scan.ts` | Scan groups and order; Tab target order |
| `src/lib/explore/beacon.ts` | Pulse interval and arrival distance |
| `src/lib/explore/words.ts` | Everything the narrator says |
| `src/lib/explore/session.ts` | Explore state machine: action in, new state and sound effects out |
| `src/lib/explore/keys.ts` | Key → action, and hold-to-repeat |
| `src/lib/explore/echo.ts` | The room's echo: reverb time and impulse response |
| `src/lib/acoustics/tail.ts` | The late-tail generator, moved from the old engine |
| `src/lib/audio/wav.ts` | Encode, decode and trim 16-bit WAV |
| `src/lib/audio/sounds.ts` | Footstep, thud, pulse and chime, made in code |
| `src/lib/audio/narrator.ts` | `speechSynthesis` wrapper |
| `src/lib/audio/spatial.ts` | Web Audio graph: clips, panners, echo (browser only) |
| `src/lib/viewer/LabelsOverlay.ts` | Floating labels (slimmed from `SoundOverlay`) |
| `src/lib/viewer/ExploreController.ts` | Check and explore modes in the viewer (browser only) |
| `src/components/ExplorePanel.tsx` | The panel and the captions |
| `scripts/make-voices.ts` | Generates `public/voices/*.wav` |

---

## Stage 1: delete what the demo doesn't use

### Task 1: Delete the hidden pages and everything only they use

**Files:**
- Delete: `src/app/about/`, `src/app/room/`, `src/app/setup/`
- Delete (components, with any `.test.ts` beside them): `src/components/browserStorage.ts`, `EditRoom.tsx`, `ErrorList.tsx`, `LengthField.tsx`, `ListenDemo.tsx`, `MyRoomsLink.tsx`, `openRoomDirectly.ts` (+ test), `pendingScan.ts` (+ test), `Player.tsx`, `RoomCard.tsx`, `RoomForm.tsx`, `RoomsMenu.tsx`, `RoomView.tsx`, `ShareButton.tsx`, `SurfacePicker.tsx`, `tabRoom.ts`, `Toggle.tsx`, `TopView.tsx`, `useRoomSession.ts`, `useSimulation.ts` (+ test), `useSplatHealth.ts`, `useUnits.ts`, `VideoScanPanel.tsx`, `WhatIf.tsx`
- Delete: `src/lib/presets/` (whole folder)
- Delete (with tests): `src/lib/room/autosave.ts`, `demoRoom.ts`, `errorPlace.ts`, `labels.ts`, `placement.ts`, `rating.ts`, `roomCard.ts`, `rooms.ts`, `session.ts`, `store.ts`, `surfaceDiagram.ts`, `topView.ts`, `units.ts`, `urlCodec.ts`, `wizard.ts`
- Delete (with tests): `src/lib/scene/colors.ts`, `layout.ts`, `objects.ts`, `rayBuffers.ts`, `RaysObject.ts`, `RoomScene.ts`, `ScanController.ts`, `scanStore.ts`, `walk.ts`, `walkCamera.ts`
- Delete (with tests): `src/lib/acoustics/client.ts`, `presetIr.ts`, `protocol.ts`, `worker.ts`
- Delete: `src/lib/audio/playAction.ts` (+ test), `src/lib/audio/trimWav.test.ts`, `scripts/trim-wav.mjs`, `scripts/trimWav.mjs`
- Delete: `public/ir/`, `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg`
- Modify: `src/components/contrast.test.ts`, `eslint.config.mjs`, `README.md`, `package.json` and `package-lock.json` (uninstall `zustand`, `fake-indexeddb`)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing new. Every file that `src/app/page.tsx`, `src/app/layout.tsx` and `src/server/main.ts` reach is untouched.

- [ ] **Step 1: Confirm nothing live imports these files**

Run (Bash):
```bash
grep -rn "lib/presets\|lib/room/\(autosave\|demoRoom\|errorPlace\|labels\|placement\|rating\|roomCard\|rooms\|session\|store\|surfaceDiagram\|topView\|units\|urlCodec\|wizard\)\|lib/scene/\(colors\|layout\|objects\|rayBuffers\|RaysObject\|RoomScene\|ScanController\|scanStore\|walk\|walkCamera\)\|lib/acoustics/\(client\|presetIr\|protocol\|worker\)\|playAction\|useSplatHealth\|VideoScanPanel" src --include=*.ts --include=*.tsx -l
```
Expected: only files that are themselves on this task's delete list. If any other file shows up, stop and tell the controller.

Also confirm the starter icons are unused:
```bash
grep -rn "file.svg\|globe.svg\|next.svg\|vercel.svg\|window.svg" src
```
Expected: no output.

- [ ] **Step 2: Delete the files**

Run these from the repo root, without `cd` (`--ignore-unmatch` skips a test that was never written):
```bash
git rm -r -q --ignore-unmatch src/app/about src/app/room src/app/setup src/lib/presets public/ir
git rm -q --ignore-unmatch src/components/{browserStorage.ts,EditRoom.tsx,ErrorList.tsx,LengthField.tsx,ListenDemo.tsx,MyRoomsLink.tsx,openRoomDirectly.ts,openRoomDirectly.test.ts,pendingScan.ts,pendingScan.test.ts,Player.tsx,RoomCard.tsx,RoomForm.tsx,RoomsMenu.tsx,RoomView.tsx,ShareButton.tsx,SurfacePicker.tsx,tabRoom.ts,Toggle.tsx,TopView.tsx,useRoomSession.ts,useSimulation.ts,useSimulation.test.ts,useSplatHealth.ts,useUnits.ts,VideoScanPanel.tsx,WhatIf.tsx}
git rm -q --ignore-unmatch src/lib/room/{autosave,demoRoom,errorPlace,labels,placement,rating,roomCard,rooms,session,store,surfaceDiagram,topView,units,urlCodec,wizard}.ts src/lib/room/{autosave,demoRoom,errorPlace,labels,placement,rating,roomCard,rooms,session,store,surfaceDiagram,topView,units,urlCodec,wizard}.test.ts
git rm -q --ignore-unmatch src/lib/scene/{colors,layout,objects,rayBuffers,RaysObject,RoomScene,ScanController,scanStore,walk,walkCamera}.ts src/lib/scene/{colors,layout,objects,rayBuffers,RaysObject,RoomScene,ScanController,scanStore,walk,walkCamera}.test.ts
git rm -q --ignore-unmatch src/lib/acoustics/{client,presetIr,protocol,worker}.ts src/lib/acoustics/{client,presetIr,protocol,worker}.test.ts
git rm -q --ignore-unmatch src/lib/audio/playAction.ts src/lib/audio/playAction.test.ts src/lib/audio/trimWav.test.ts scripts/trim-wav.mjs scripts/trimWav.mjs
git rm -q --ignore-unmatch public/{file,globe,next,vercel,window}.svg
```

- [ ] **Step 3: Point the contrast test at a file that still exists**

In `src/components/contrast.test.ts`, replace:
```ts
    expect(files.some((f) => f.endsWith('Player.tsx'))).toBe(true);
```
with:
```ts
    expect(files.some((f) => f.endsWith('SplatViewer.tsx'))).toBe(true);
```

- [ ] **Step 4: Update the ESLint comment and message that name ScanController**

In `eslint.config.mjs`, replace:
```js
  // pull Spark into the page's main bundle; the layer is only reached through ScanController's dynamic import().
```
with:
```js
  // pull Spark into the page's main bundle; the layer is only reached through the dynamic import() in ViewerScene and HeroScene.
```
and replace:
```js
                "A value import of SplatLayer pulls Spark into this bundle. Use `import type`, or the dynamic import() in ScanController.",
```
with:
```js
                "A value import of SplatLayer pulls Spark into this bundle. Use `import type`, or a dynamic import() as ViewerScene does.",
```

- [ ] **Step 5: Uninstall the packages only deleted code used**

```bash
grep -rn "zustand\|fake-indexeddb" src
```
Expected: no output. Then:
```bash
npm uninstall zustand fake-indexeddb
```

- [ ] **Step 6: Replace the README's create-next-app text**

Replace everything in `README.md` above the line `## Hackathon demo: rooms from video` with:
```markdown
# Hearify

A helper films a place once on a phone. The laptop turns the video into a 3D room and finds what matters for getting
around. Someone who can't see it can then explore it by sound, on headphones (design:
`docs/superpowers/specs/2026-10-08-hearify-sound-rehearsal-design.md`).

```
Keep the `## Hackathon demo: rooms from video` section and everything under it unchanged.

- [ ] **Step 7: Verify**

Run: `npx vitest run` — Expected: PASS (fewer tests than before; none failing).
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` — Expected: no errors, no new warnings.
Run: `npx next build` — Expected: success; the route list no longer shows `/about`, `/room` or `/setup`.

- [ ] **Step 8: Commit**

```bash
git status --short
git add -A src public scripts README.md eslint.config.mjs package.json package-lock.json
git commit -q -m "$(cat <<'EOF'
chore: delete the hidden acoustics pages and everything only they used

The demo is the splat viewer; /room, /setup and /about, their components,
presets, the old 3D scene and its state go, with zustand and fake-indexeddb.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src public scripts README.md eslint.config.mjs package.json package-lock.json
```

---

### Task 2: Delete the speaker features and the acoustics engine, keeping the echo pieces

**Files:**
- Create: `src/lib/acoustics/tail.ts`, `src/lib/acoustics/tail.test.ts`, `src/lib/viewer/LabelsOverlay.ts`
- Delete: `src/components/SoundPanel.tsx`, `src/lib/viewer/SoundController.ts`, `src/lib/viewer/SoundOverlay.ts`
- Delete (with tests): `src/lib/sound/bestSpot.ts`, `client.ts`, `heat.ts`, `protocol.ts`, `soundRoom.ts`, `worker.ts`
- Delete (with tests): `src/lib/acoustics/absorption.ts`, `binaural.ts`, `diffuse.ts`, `imageSource.ts` (+ `imageSource.pra.test.ts`), `loudness.ts`, `objects.ts`, `rays.ts`, `simulate.ts`, and `src/lib/acoustics/__fixtures__/`
- Delete (with tests): `src/lib/audio/demoClips.ts`, `engine.ts`, `mix.ts`
- Delete (with tests): `src/lib/room/geometry.ts`, `src/lib/room/roomState.ts`
- Delete: `scripts/make_pra_fixtures.py`
- Modify: `src/lib/acoustics/dsp.ts` and `dsp.test.ts`, `src/lib/acoustics/materials.ts`, `src/lib/room/types.ts`, `src/lib/room/constants.ts`, `src/lib/sound/types.ts`, `src/components/SplatViewer.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `addTail(rt: Bands, volume: number, transition: number, sampleRate: number, left: Float32Array, right: Float32Array): void` in `@/lib/acoustics/tail`.
  - `MATERIAL_ALPHA: Record<'drywall' | 'carpet' | 'plaster', Bands>` and `FURNISHING_SOME: Bands` in `@/lib/acoustics/materials`.
  - `class LabelsOverlay { root: THREE.Group; constructor(fit: RoomFit); setObjects(objects: RoomObject[]): void; dispose(): void }` in `@/lib/viewer/LabelsOverlay`.
  - `Vec3`, `Dims`, `ObjectLabel`, `RoomObject` (still the 12 furniture labels) in `@/lib/room/types`; `LIMITS = { minLengthWidth, maxLengthWidth, minHeight, maxHeight }` in `@/lib/room/constants`.

- [ ] **Step 1: Write the failing test for the moved tail generator**

Create `src/lib/acoustics/tail.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { addTail } from './tail';

const SR = 8000;
const RT = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
const rms = (s: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (to - from));
};

describe('addTail', () => {
  it('is silent before the transition and decays about 60 dB over the reverb time', () => {
    const left = new Float32Array(SR);
    const right = new Float32Array(SR);
    addTail(RT, 50, 0.05, SR, left, right);
    expect(left.subarray(0, 0.05 * SR).every((v) => v === 0)).toBe(true);
    const early = rms(left, 0.05 * SR, 0.1 * SR);
    const late = rms(left, 0.55 * SR, 0.6 * SR); // 0.5 s (one reverb time) later
    const db = 20 * Math.log10(late / early);
    expect(db).toBeGreaterThan(-66);
    expect(db).toBeLessThan(-54);
  });

  it('gives left and right different noise', () => {
    const left = new Float32Array(SR / 4);
    const right = new Float32Array(SR / 4);
    addTail(RT, 50, 0, SR, left, right);
    expect(left.some((v, i) => v !== right[i])).toBe(true);
  });

  it('is twice as loud in a room a quarter the volume', () => {
    const small = [new Float32Array(SR / 4), new Float32Array(SR / 4)] as const;
    const big = [new Float32Array(SR / 4), new Float32Array(SR / 4)] as const;
    addTail(RT, 25, 0, SR, ...small);
    addTail(RT, 100, 0, SR, ...big);
    expect(rms(small[0], 0, SR / 4) / rms(big[0], 0, SR / 4)).toBeCloseTo(2, 5);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/acoustics/tail.test.ts`
Expected: FAIL — cannot find module `./tail`.

- [ ] **Step 3: Create `src/lib/acoustics/tail.ts`**

```ts
import { NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';
import { bandNoise } from './dsp';

const EARLY_TAIL_RAMP_SECONDS = 0.005;
const NOISE_SEED = { left: 1, right: 2 };
const LN_1000 = 6.907755; // 60 dB decay in nepers

/**
 * Add a diffuse late tail from `transition` on: per-band decaying noise, independent left and right, at the level a room
 * of this volume gives. Moved from the old acoustics engine for the room echo (spec 2026-10-08 §8.4).
 */
export function addTail(
  rt: Bands,
  volume: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const sigma0 = Math.sqrt((4 * Math.PI * SPEED_OF_SOUND) / (volume * sampleRate));
  const start = Math.floor(transition * sampleRate);
  const fade = Math.max(1, Math.round(EARLY_TAIL_RAMP_SECONDS * sampleRate));

  for (const [out, seed] of [
    [left, NOISE_SEED.left],
    [right, NOISE_SEED.right],
  ] as const) {
    const noise = bandNoise(out.length, sampleRate, seed);
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

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/acoustics/tail.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `src/lib/viewer/LabelsOverlay.ts`** (the labels from `SoundOverlay`, without the speaker, heat map or absorbs/reflects colours)

```ts
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { RoomObject } from '@/lib/room/types';
import { roomToWorldMatrix } from '@/lib/sound/roomFit';
import type { RoomFit } from '@/lib/sound/types';

function chipClass(highlight: boolean): string {
  return `rounded-full border bg-walnut/80 px-2.5 py-1 text-micro whitespace-nowrap ${highlight ? 'border-[#5fd4c4] text-[#5fd4c4]' : 'border-cream/60 text-cream'}`;
}

/** One floating label per object (spec 2026-10-08 §9). Labels are placed in room metres; `root` maps them to world. */
export class LabelsOverlay {
  readonly root = new THREE.Group();
  private labels: CSS2DObject[] = [];

  constructor(fit: RoomFit) {
    this.root.matrixAutoUpdate = false;
    this.root.matrix.copy(roomToWorldMatrix(fit));
  }

  setObjects(objects: RoomObject[]): void {
    for (const l of this.labels) this.root.remove(l);
    this.labels = objects.map((o) => {
      const el = document.createElement('div');
      el.className = chipClass(false);
      el.textContent = o.label;
      const label = new CSS2DObject(el);
      label.position.set((o.min.x + o.max.x) / 2, o.max.y + 0.15, (o.min.z + o.max.z) / 2);
      this.root.add(label);
      return label;
    });
  }

  dispose(): void {
    for (const l of this.labels) this.root.remove(l); // CSS2DObject removes its element when removed
    this.labels = [];
    this.root.removeFromParent();
  }
}
```

- [ ] **Step 6: Take the sound panel out of the viewer**

In `src/components/SplatViewer.tsx`:
- Delete the imports `import { SoundController } from '@/lib/viewer/SoundController';` and `import { SoundPanel } from './SoundPanel';`.
- Delete `const [sound, setSound] = useState<SoundController | null>(null);` and the `setSound(null);` line inside the room-switch block.
- In the effect, delete `let controller: SoundController | null = null;`, the whole `try { controller = SoundController.create(...); setSound(controller); } catch (error) { ... }` block, and `controller?.dispose();` in the cleanup.
- Delete the last JSX line `{status === 'ready' && webgl && sound && <SoundPanel controller={sound} />}`.

- [ ] **Step 7: Delete the speaker features, the engine and the old audio**

From the repo root, without `cd`:
```bash
git rm -q --ignore-unmatch src/components/SoundPanel.tsx src/lib/viewer/SoundController.ts src/lib/viewer/SoundOverlay.ts
git rm -q --ignore-unmatch src/lib/sound/{bestSpot,client,heat,protocol,soundRoom,worker}.ts src/lib/sound/{bestSpot,client,heat,protocol,soundRoom,worker}.test.ts
git rm -q --ignore-unmatch src/lib/acoustics/{absorption,binaural,diffuse,imageSource,loudness,objects,rays,simulate}.ts src/lib/acoustics/{absorption,binaural,diffuse,imageSource,loudness,objects,rays,simulate}.test.ts src/lib/acoustics/imageSource.pra.test.ts
git rm -r -q --ignore-unmatch src/lib/acoustics/__fixtures__
git rm -q --ignore-unmatch src/lib/audio/{demoClips,engine,mix}.ts src/lib/audio/{demoClips,engine,mix}.test.ts
git rm -q --ignore-unmatch src/lib/room/geometry.ts src/lib/room/geometry.test.ts src/lib/room/roomState.ts src/lib/room/roomState.test.ts scripts/make_pra_fixtures.py
```

- [ ] **Step 8: Prune `dsp.ts` to what the tail uses**

In `src/lib/acoustics/dsp.ts`, delete the functions `highPass` and `applyBandMasks` (and nothing else). In `src/lib/acoustics/dsp.test.ts`, delete the `describe('applyBandMasks', …)` and `describe('highPass', …)` blocks and remove `applyBandMasks` and `highPass` from the import line.

- [ ] **Step 9: Replace `src/lib/acoustics/materials.ts`**

```ts
import type { Bands } from './bands';

export type MaterialId = 'drywall' | 'carpet' | 'plaster';

/** Random-incidence absorption coefficients, 125 Hz – 4 kHz, from standard published tables (spec 2026-10-08 §8.4). */
export const MATERIAL_ALPHA: Record<MaterialId, Bands> = {
  drywall: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09],
  carpet: [0.08, 0.24, 0.57, 0.69, 0.71, 0.73],
  plaster: [0.14, 0.1, 0.06, 0.05, 0.04, 0.03],
};

/** Extra absorption (m² per m² of floor) for furniture a box can't see: the old "some furnishing" level. */
export const FURNISHING_SOME: Bands = [0.1, 0.18, 0.25, 0.3, 0.3, 0.3];
```

- [ ] **Step 10: Prune the room types and limits**

Replace `src/lib/room/types.ts` with:
```ts
export type Vec3 = { x: number; y: number; z: number };

export type Dims = { length: number; width: number; height: number };

/** What the object detector can name (spec 2026-10-07 sound §3). Plan 9 Task 3 replaces it with the navigation names. */
export const OBJECT_LABELS = [
  'chair', 'sofa', 'table', 'whiteboard', 'television', 'window', 'curtains', 'rug', 'bookshelf', 'bed', 'cabinet', 'plant',
] as const;
export type ObjectLabel = (typeof OBJECT_LABELS)[number];
/** A detected object's box in room metres. */
export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 };
```
Replace `src/lib/room/constants.ts` with:
```ts
/** The sizes the fitted room box is clamped to, in metres (spec 2026-10-07 sound §2). */
export const LIMITS = { minLengthWidth: 1.5, maxLengthWidth: 30, minHeight: 2, maxHeight: 15 } as const;
```
In `src/lib/sound/types.ts`, delete the `SpotMap` type and its comment, and change the `RoomFit` comment's "(goes to workers)" to nothing:
```ts
import type { Dims } from '@/lib/room/types';

/** world (upright splat units) → room metres: rotate by yaw about Y, shift, scale. Plain data. */
export type RoomFit = { dims: Dims; scale: number; yaw: number; floorY: number; minX: number; minZ: number };
```

- [ ] **Step 11: Verify**

Run: `npx vitest run` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors. (If an error names a deleted module, the importer is on this task's delete list or was missed: fix by deleting the import, never by restoring the module.)
Run: `npm run lint` — Expected: no errors, no new warnings.
Run: `npx next build` — Expected: success.

- [ ] **Step 12: Commit**

```bash
git status --short
git add -A src scripts
git commit -q -m "$(cat <<'EOF'
chore: delete the speaker features and the acoustics engine, keeping the echo pieces

The late-tail generator moves to acoustics/tail.ts with its own tests; the floating
labels become LabelsOverlay. The viewer is the plain splat viewer until stage 2.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src scripts
```

---

## Stage 2: rehearse a place by sound

### Task 3: The navigation names, and finding objects with them

**Files:**
- Create: `src/lib/explore/names.ts`, `src/lib/explore/names.test.ts`
- Modify: `src/lib/room/types.ts`, `src/lib/sound/placeObjects.ts`, `src/lib/sound/placeObjects.test.ts`, `src/server/detect.ts`, `src/server/detect.test.ts`

**Interfaces:**
- Consumes: `RoomObject`, `Vec3` from `@/lib/room/types`.
- Produces (in `@/lib/explore/names`):
  - `type NameInfo = { id; title; say; sayMany; one; many; prompts: readonly string[]; blocks: boolean; size: readonly [number, number, number]; bottom: number }`
  - `NAMES` (the §4 table, in order), `type NameId`, `NAME_IDS: readonly NameId[]`, `isNameId(v: unknown): v is NameId`, `nameInfo(id: NameId): NameInfo`
  - `clipId(words: string): string`, `WALL_CLIP = 'wall'`, `CLIPS: ReadonlyMap<string, string>` (clip id → words, 32 entries)
  - `PROMPT_TO_NAME: ReadonlyMap<string, NameId>`, `DETECT_PROMPTS: readonly string[]`
- `ObjectLabel` in `@/lib/room/types` becomes `NameId`. `FRAME_COUNT = 24` and `DETECTIONS_FILE = 'detections-v2.json'` in `src/server/detect.ts`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/explore/names.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CLIPS, clipId, DETECT_PROMPTS, isNameId, NAME_IDS, nameInfo, NAMES, PROMPT_TO_NAME, WALL_CLIP } from './names';

describe('names', () => {
  it("lists the 16 names in the spec's order", () => {
    expect(NAME_IDS).toEqual([
      'door', 'stairs', 'chair', 'sofa', 'table', 'counter', 'sink', 'toilet', 'bin', 'window', 'bed', 'cabinet', 'bookshelf', 'tv', 'whiteboard', 'plant',
    ]);
  });

  it('lets you walk through doors, windows, TVs and whiteboards only', () => {
    expect(NAMES.filter((n) => !n.blocks).map((n) => n.id)).toEqual(['door', 'window', 'tv', 'whiteboard']);
  });

  it('maps every detector prompt to its name', () => {
    expect(PROMPT_TO_NAME.get('desk')).toBe('table');
    expect(PROMPT_TO_NAME.get('doorway')).toBe('door');
    expect(PROMPT_TO_NAME.get('trash can')).toBe('bin');
    expect(PROMPT_TO_NAME.get('television')).toBe('tv');
    expect(DETECT_PROMPTS).toHaveLength(18);
  });

  it('has 32 clips: 16 names, 15 plurals (stairs is its own) and wall', () => {
    expect(CLIPS.size).toBe(32);
    expect(CLIPS.get('tv')).toBe('TV');
    expect(CLIPS.get('tvs')).toBe('TVs');
    expect(CLIPS.get('stairs')).toBe('stairs');
    expect(CLIPS.get('bookshelves')).toBe('bookshelves');
    expect(CLIPS.get(WALL_CLIP)).toBe('wall');
    expect(clipId('trash can')).toBe('trash-can');
  });

  it('gives added objects their typical size and height off the floor', () => {
    expect(nameInfo('door').size).toEqual([0.9, 0.1, 2.0]);
    expect(nameInfo('door').bottom).toBe(0);
    expect(nameInfo('window').bottom).toBe(0.9);
    expect(nameInfo('whiteboard').size).toEqual([1.8, 0.05, 1.2]);
  });

  it('knows a name from anything else', () => {
    expect(isNameId('tv')).toBe(true);
    expect(isNameId('television')).toBe(false);
    expect(isNameId(3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/explore/names.test.ts`
Expected: FAIL — cannot find module `./names`.

- [ ] **Step 3: Create `src/lib/explore/names.ts`**

```ts
/**
 * One kind of object the app finds, names and lets you walk to (spec 2026-10-08 §4). `say`/`sayMany` are the clip words,
 * `one`/`many` the words in the narrator's counts. Sizes are width (x) × depth (z) × height in metres, for added objects.
 */
export type NameInfo = {
  id: string;
  title: string;
  say: string;
  sayMany: string;
  one: string;
  many: string;
  prompts: readonly string[];
  blocks: boolean;
  size: readonly [number, number, number];
  bottom: number;
};

export const NAMES = [
  { id: 'door', title: 'Door', say: 'door', sayMany: 'doors', one: 'door', many: 'doors', prompts: ['door', 'doorway'], blocks: false, size: [0.9, 0.1, 2.0], bottom: 0 },
  { id: 'stairs', title: 'Stairs', say: 'stairs', sayMany: 'stairs', one: 'staircase', many: 'staircases', prompts: ['stairs'], blocks: true, size: [1.0, 2.0, 1.0], bottom: 0 },
  { id: 'chair', title: 'Chair', say: 'chair', sayMany: 'chairs', one: 'chair', many: 'chairs', prompts: ['chair'], blocks: true, size: [0.5, 0.5, 0.9], bottom: 0 },
  { id: 'sofa', title: 'Sofa', say: 'sofa', sayMany: 'sofas', one: 'sofa', many: 'sofas', prompts: ['sofa'], blocks: true, size: [2.0, 0.9, 0.8], bottom: 0 },
  { id: 'table', title: 'Table', say: 'table', sayMany: 'tables', one: 'table', many: 'tables', prompts: ['table', 'desk'], blocks: true, size: [1.4, 0.8, 0.75], bottom: 0 },
  { id: 'counter', title: 'Counter', say: 'counter', sayMany: 'counters', one: 'counter', many: 'counters', prompts: ['counter'], blocks: true, size: [1.5, 0.6, 0.9], bottom: 0 },
  { id: 'sink', title: 'Sink', say: 'sink', sayMany: 'sinks', one: 'sink', many: 'sinks', prompts: ['sink'], blocks: true, size: [0.6, 0.5, 0.9], bottom: 0 },
  { id: 'toilet', title: 'Toilet', say: 'toilet', sayMany: 'toilets', one: 'toilet', many: 'toilets', prompts: ['toilet'], blocks: true, size: [0.4, 0.7, 0.8], bottom: 0 },
  { id: 'bin', title: 'Bin', say: 'bin', sayMany: 'bins', one: 'bin', many: 'bins', prompts: ['trash can'], blocks: true, size: [0.4, 0.4, 0.7], bottom: 0 },
  { id: 'window', title: 'Window', say: 'window', sayMany: 'windows', one: 'window', many: 'windows', prompts: ['window'], blocks: false, size: [1.2, 0.1, 1.2], bottom: 0.9 },
  { id: 'bed', title: 'Bed', say: 'bed', sayMany: 'beds', one: 'bed', many: 'beds', prompts: ['bed'], blocks: true, size: [1.6, 2.0, 0.6], bottom: 0 },
  { id: 'cabinet', title: 'Cabinet', say: 'cabinet', sayMany: 'cabinets', one: 'cabinet', many: 'cabinets', prompts: ['cabinet'], blocks: true, size: [1.0, 0.5, 1.0], bottom: 0 },
  { id: 'bookshelf', title: 'Bookshelf', say: 'bookshelf', sayMany: 'bookshelves', one: 'bookshelf', many: 'bookshelves', prompts: ['bookshelf'], blocks: true, size: [0.9, 0.35, 1.8], bottom: 0 },
  { id: 'tv', title: 'TV', say: 'TV', sayMany: 'TVs', one: 'TV', many: 'TVs', prompts: ['television'], blocks: false, size: [1.2, 0.1, 0.7], bottom: 0.9 },
  { id: 'whiteboard', title: 'Whiteboard', say: 'whiteboard', sayMany: 'whiteboards', one: 'whiteboard', many: 'whiteboards', prompts: ['whiteboard'], blocks: false, size: [1.8, 0.05, 1.2], bottom: 0.9 },
  { id: 'plant', title: 'Plant', say: 'plant', sayMany: 'plants', one: 'plant', many: 'plants', prompts: ['plant'], blocks: true, size: [0.5, 0.5, 1.0], bottom: 0 },
] as const satisfies readonly NameInfo[];

export type NameId = (typeof NAMES)[number]['id'];
export const NAME_IDS: readonly NameId[] = NAMES.map((n) => n.id);

const BY_ID = new Map<string, NameInfo>(NAMES.map((n) => [n.id, n] as const));
export const isNameId = (v: unknown): v is NameId => typeof v === 'string' && BY_ID.has(v);
export const nameInfo = (id: NameId): NameInfo => BY_ID.get(id)!;

/** The clip that says some words: its file is public/voices/<id>.wav (spec §8.2). */
export const clipId = (words: string): string => words.toLowerCase().replace(/\s+/g, '-');
export const WALL_CLIP = 'wall';
/** Every clip id and the words it says: the names, their plurals where they differ, and "wall" (32 in all). */
export const CLIPS: ReadonlyMap<string, string> = new Map<string, string>(
  [...NAMES.flatMap((n) => [n.say, n.sayMany]), 'wall'].map((words) => [clipId(words), words] as const),
);

/** Detector prompt → name: "desk" is found as a table, "doorway" as a door (spec §5). */
export const PROMPT_TO_NAME: ReadonlyMap<string, NameId> = new Map<string, NameId>(
  NAMES.flatMap((n) => n.prompts.map((p) => [p, n.id] as const)),
);
export const DETECT_PROMPTS: readonly string[] = [...PROMPT_TO_NAME.keys()];
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/explore/names.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Make `ObjectLabel` the names**

Replace `src/lib/room/types.ts` with:
```ts
import type { NameId } from '@/lib/explore/names';

export type Vec3 = { x: number; y: number; z: number };

export type Dims = { length: number; width: number; height: number };

/** What the object finder names (spec 2026-10-08 §4). */
export type ObjectLabel = NameId;
/** A found or added object's box in room metres. */
export type RoomObject = { label: ObjectLabel; min: Vec3; max: Vec3 };
```
Then run `grep -rn "OBJECT_LABELS" src` — Expected: no output.

- [ ] **Step 6: Update the placement test, then `placeObjects`**

In `src/lib/sound/placeObjects.test.ts`, replace the second `it(…)` block with:
```ts
  it('drops objects seen in only one frame, labels that are not names, and frames with no camera', () => {
    expect(placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    expect(placeObjects(file([['9999.jpg', 430, 430, 570, 570, 'chair', 0.5], ['9998.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    const desks = placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'desk', 0.5], ['0002.jpg', 408, 430, 548, 570, 'desk', 0.5]]), cameras, scene(), identity, 1);
    expect(desks).toEqual([]); // the server maps "desk" to "table"; placement only takes names
    const doors = placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'door', 0.5], ['0002.jpg', 408, 430, 548, 570, 'door', 0.5]]), cameras, scene(), identity, 1);
    expect(doors.map((o) => o.label)).toEqual(['door']);
  });
```
Run `npx vitest run src/lib/sound/placeObjects.test.ts` — Expected: FAIL (`desks` is `['table']`).

In `src/lib/sound/placeObjects.ts`:
- Add `import { isNameId } from '@/lib/explore/names';` under the existing imports.
- Delete the `const LABELS: Record<string, ObjectLabel> = { … };` block.
- Replace `const detections = frame.detections.filter((d) => LABELS[d.label]);` with `const detections = frame.detections.filter((d) => isNameId(d.label));`
- Replace `label: LABELS[d.label],` with `label: d.label as ObjectLabel,`

Run `npx vitest run src/lib/sound/placeObjects.test.ts` — Expected: PASS.

- [ ] **Step 7: Update the detector tests**

In `src/server/detect.test.ts`:
- Change the import line to:
```ts
import { cleanDetections, createObjectFinder, DETECTIONS_FILE, FRAME_COUNT, pickFrames, type DetectFrame } from './detect';
```
- Replace the `describe('cleanDetections', …)` block with:
```ts
describe('cleanDetections', () => {
  const d = (label: string, score: number, box: Detection['box']): Detection => ({ label, score, box });
  it('maps prompts to names, keeps one name per box, applies thresholds and class-agnostic NMS', () => {
    const out = cleanDetections([
      d('desk', 0.5, [0, 0, 100, 100]),
      d('bed', 0.35, [0, 0, 100, 100]), // same box, lower score: dropped
      d('chair', 0.4, [5, 5, 100, 100]), // overlaps the table box: NMS drops it
      d('chair', 0.25, [300, 300, 400, 400]), // under 0.3: dropped
      d('whiteboard', 0.18, [500, 0, 700, 200]), // whiteboard's threshold is 0.15: kept
      d('doorway', 0.4, [800, 0, 900, 300]), // found as a door
      d('lamp', 0.9, [0, 500, 50, 600]), // not a prompt: dropped
    ]);
    expect(out).toEqual([d('table', 0.5, [0, 0, 100, 100]), d('door', 0.4, [800, 0, 900, 300]), d('whiteboard', 0.18, [500, 0, 700, 200])]);
  });
});
```
- In the containment test, replace
```ts
    expect(cleanDetections([d('television', 0.5, [0, 0, 100, 100]), d('whiteboard', 0.2, [5, 5, 95, 95])])).toEqual([d('television', 0.5, [0, 0, 100, 100])]);
```
with
```ts
    expect(cleanDetections([d('television', 0.5, [0, 0, 100, 100]), d('whiteboard', 0.2, [5, 5, 95, 95])])).toEqual([d('tv', 0.5, [0, 0, 100, 100])]);
```
- Add to `describe('pickFrames', …)`:
```ts
  it('picks 24 frames by default', () => {
    const names = Array.from({ length: 200 }, (_, i) => `${String(i + 1).padStart(4, '0')}.jpg`);
    expect(FRAME_COUNT).toBe(24);
    expect(pickFrames(names)).toHaveLength(24);
  });
```
- Add to `describe('createObjectFinder', …)`:
```ts
  it('ignores a detections.json saved under the old furniture labels', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    await writeFile(path.join(dir, 'images', '0001.jpg'), '');
    await writeFile(path.join(dir, 'detections.json'), JSON.stringify({ frames: [] }));
    let calls = 0;
    const find = createObjectFinder(async () => {
      calls++;
      return { width: 10, height: 10, detections: [] };
    });
    await find(dir);
    expect(calls).toBe(1);
    expect(DETECTIONS_FILE).toBe('detections-v2.json');
    expect(JSON.parse(await readFile(path.join(dir, 'detections-v2.json'), 'utf8')).frames).toHaveLength(1);
  });
```
Run `npx vitest run src/server/detect.test.ts` — Expected: FAIL (`FRAME_COUNT` is 12, labels aren't mapped).

- [ ] **Step 8: Update `src/server/detect.ts`**

- Add `import { DETECT_PROMPTS, PROMPT_TO_NAME } from '@/lib/explore/names';` under the existing imports.
- Replace the `DETECT_LABELS` constant (and its comment), `FRAME_COUNT`, `DETECTIONS_FILE` and `LABEL_THRESHOLDS` with:
```ts
/** 24 frames, not 12: a door can be on screen for only a few seconds of the video (spec 2026-10-08 §5). */
export const FRAME_COUNT = 24;
/** A new name, so rooms searched under the old furniture labels are searched again. */
export const DETECTIONS_FILE = 'detections-v2.json';
```
and, where `LABEL_THRESHOLDS` was:
```ts
const LABEL_THRESHOLDS: Record<string, number> = { whiteboard: 0.15, tv: 0.15 }; // the Plan 8 spike: these score low even when right
```
- Replace the `group` function with:
```ts
/** A whiteboard and a TV are the same flat rectangle to the detector; every other name is its own group. */
const group = (label: string) => (label === 'whiteboard' || label === 'tv' ? 'screen' : label);
```
- In `cleanDetections`, replace the start of the loop:
```ts
  for (const d of raw) {
    const label = d.label === 'desk' ? 'table' : d.label;
```
with:
```ts
  for (const d of raw) {
    const label = PROMPT_TO_NAME.get(d.label);
    if (!label) continue; // not one of our prompts
```
and change its doc comment to: `/** The pipeline gives every prompt above its threshold per box: map prompts to names, keep the best per box, threshold, then class-agnostic NMS. */`
- In `transformersDetector`, replace `DETECT_LABELS.map((l) => PROMPT + l)` with `DETECT_PROMPTS.map((p) => PROMPT + p)`.
- In `createObjectFinder`'s doc comment, replace `detections.json` with `detections-v2.json`.

Run `npx vitest run src/server/detect.test.ts` — Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `npx vitest run` — Expected: PASS. Run: `npx tsc --noEmit` — Expected: no errors. Run: `npm run lint` — Expected: clean.
```bash
git status --short
git add src/lib/explore/names.ts src/lib/explore/names.test.ts src/lib/room/types.ts src/lib/sound/placeObjects.ts src/lib/sound/placeObjects.test.ts src/server/detect.ts src/server/detect.test.ts
git commit -q -m "$(cat <<'EOF'
feat: the 16 navigation names, found in 24 frames

Doors, stairs and the furniture that blocks walking replace the absorb/reflect
labels. Old detections.json files are ignored, so older rooms are searched again.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/names.ts src/lib/explore/names.test.ts src/lib/room/types.ts src/lib/sound/placeObjects.ts src/lib/sound/placeObjects.test.ts src/server/detect.ts src/server/detect.test.ts
```

---

### Task 4: The helper's checked list: rules, server routes and client

**Files:**
- Create: `src/lib/explore/checked.ts`, `src/lib/explore/checked.test.ts`
- Modify: `src/server/server.ts`, `src/server/server.test.ts`, `src/lib/splatJobs/client.ts`, `src/lib/splatJobs/client.test.ts`

**Interfaces:**
- Consumes: `isNameId`, `nameInfo`, `NAMES`, `NameId` (Task 3); `RoomObject`, `Vec3`.
- Produces (in `@/lib/explore/checked`):
  - `MAX_CHECKED = 200`, `CHECKED_FILE = 'checked-objects.json'`
  - `readChecked(data: unknown): RoomObject[] | null`
  - `sortObjects(objects: RoomObject[]): RoomObject[]`
  - `defaultBox(label: NameId, at: { x: number; z: number }): RoomObject`
  - `addObject(objects, label, at): { objects: RoomObject[]; index: number }`
  - `renameObject(objects, index, label): { objects: RoomObject[]; index: number }`
  - `removeObject(objects, index): RoomObject[]`
- Produces (in `@/lib/splatJobs/client`): `fetchChecked(id, fetchFn?): Promise<RoomObject[] | null>`, `saveChecked(id, objects, fetchFn?): Promise<boolean>`.
- Server: `GET` and `PUT /api/splat/jobs/:id/checked` (spec §10; oversized body → 413).

- [ ] **Step 1: Write the failing test**

Create `src/lib/explore/checked.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { addObject, defaultBox, MAX_CHECKED, readChecked, removeObject, renameObject, sortObjects } from './checked';

const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});

describe('readChecked', () => {
  it('accepts a valid list and keeps only label, min and max', () => {
    const data = { objects: [{ ...box('door', 0, 1, 0.1, 2), extra: 1 }] };
    expect(readChecked(data)).toEqual([box('door', 0, 1, 0.1, 2)]);
    expect(readChecked({ objects: [] })).toEqual([]);
  });

  it('refuses anything wrong', () => {
    expect(readChecked(null)).toBeNull();
    expect(readChecked({})).toBeNull();
    expect(readChecked({ objects: 'x' })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), label: 'lamp' }] })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), min: { x: '0', y: 0, z: 1 } }] })).toBeNull();
    expect(readChecked({ objects: [{ ...box('door', 0, 1, 0.1, 2), max: { x: Infinity, y: 2, z: 2 } }] })).toBeNull();
    expect(readChecked({ objects: [box('door', 1, 1, 0.5, 2)] })).toBeNull(); // min.x > max.x
    expect(readChecked({ objects: Array.from({ length: MAX_CHECKED + 1 }, () => box('chair', 0, 0, 1, 1)) })).toBeNull();
  });
});

describe('sortObjects', () => {
  it("orders by the spec's name order, then along the length, then the width", () => {
    const sorted = sortObjects([box('chair', 3, 0, 4, 1), box('door', 0, 0, 1, 1), box('chair', 1, 2, 2, 3), box('chair', 1, 0, 2, 1)]);
    expect(sorted).toEqual([box('door', 0, 0, 1, 1), box('chair', 1, 0, 2, 1), box('chair', 1, 2, 2, 3), box('chair', 3, 0, 4, 1)]);
  });
});

describe('adding, renaming and removing', () => {
  it('adds a door-sized box on the floor point and says where it landed in the list', () => {
    expect(defaultBox('door', { x: 2, z: 3 })).toEqual({ label: 'door', min: { x: 1.55, y: 0, z: 2.95 }, max: { x: 2.45, y: 2, z: 3.05 } });
    const { objects, index } = addObject([box('chair', 0, 0, 1, 1)], 'door', { x: 2, z: 3 });
    expect(index).toBe(0); // doors list first
    expect(objects[1].label).toBe('chair');
  });

  it('resizes a just-added box when renamed, but keeps a found box as it is', () => {
    const added = addObject([], 'door', { x: 2, z: 3 }).objects;
    const renamed = renameObject(added, 0, 'table').objects[0];
    expect(renamed).toEqual(defaultBox('table', { x: 2, z: 3 }));
    const found = renameObject([box('whiteboard', 0, 1, 0.1, 2)], 0, 'tv');
    expect(found.objects).toEqual([box('tv', 0, 1, 0.1, 2)]);
    expect(found.index).toBe(0);
  });

  it('removes one object', () => {
    expect(removeObject([box('door', 0, 0, 1, 1), box('chair', 1, 0, 2, 1)], 0)).toEqual([box('chair', 1, 0, 2, 1)]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/explore/checked.test.ts`
Expected: FAIL — cannot find module `./checked`.

- [ ] **Step 3: Create `src/lib/explore/checked.ts`**

```ts
import type { RoomObject, Vec3 } from '@/lib/room/types';
import { isNameId, nameInfo, NAMES, type NameId } from './names';

/** The helper's checked list (spec 2026-10-08 §6, §10). No DOM or Node imports: the server and the viewer share it. */
export const MAX_CHECKED = 200;
export const CHECKED_FILE = 'checked-objects.json';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readVec(v: unknown): Vec3 | null {
  const p = v as Partial<Vec3> | null;
  return p && finite(p.x) && finite(p.y) && finite(p.z) ? { x: p.x, y: p.y, z: p.z } : null;
}

/** `{ objects: RoomObject[] }` as sent or saved, or null if anything in it is wrong (spec §10's 400 cases). */
export function readChecked(data: unknown): RoomObject[] | null {
  const objects = (data as { objects?: unknown } | null)?.objects;
  if (!Array.isArray(objects) || objects.length > MAX_CHECKED) return null;
  const out: RoomObject[] = [];
  for (const o of objects as { label?: unknown; min?: unknown; max?: unknown }[]) {
    if (!o || !isNameId(o.label)) return null;
    const min = readVec(o.min);
    const max = readVec(o.max);
    if (!min || !max || min.x > max.x || min.y > max.y || min.z > max.z) return null;
    out.push({ label: o.label, min, max });
  }
  return out;
}

const ORDER = new Map<string, number>(NAMES.map((n, i) => [n.id, i]));

/** The panel's order: by name, then along the room's length, then its width (spec §6). */
export function sortObjects(objects: RoomObject[]): RoomObject[] {
  return [...objects].sort(
    (a, b) =>
      ORDER.get(a.label)! - ORDER.get(b.label)! ||
      a.min.x + a.max.x - (b.min.x + b.max.x) ||
      a.min.z + a.max.z - (b.min.z + b.max.z),
  );
}

/** The box an added object of this name gets: its typical size, centred on a floor point, from its height off the floor. */
export function defaultBox(label: NameId, at: { x: number; z: number }): RoomObject {
  const { size: [w, d, h], bottom } = nameInfo(label);
  return { label, min: { x: at.x - w / 2, y: bottom, z: at.z - d / 2 }, max: { x: at.x + w / 2, y: bottom + h, z: at.z + d / 2 } };
}

export function addObject(objects: RoomObject[], label: NameId, at: { x: number; z: number }): { objects: RoomObject[]; index: number } {
  const added = defaultBox(label, at);
  const sorted = sortObjects([...objects, added]);
  return { objects: sorted, index: sorted.indexOf(added) };
}

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const sameBox = (a: RoomObject, b: RoomObject) =>
  (['x', 'y', 'z'] as const).every((k) => near(a.min[k], b.min[k]) && near(a.max[k], b.max[k]));

/** Rename one object. A box still at its added size takes the new name's size; a found box keeps its own (spec §6). */
export function renameObject(objects: RoomObject[], index: number, label: NameId): { objects: RoomObject[]; index: number } {
  const old = objects[index];
  const centre = { x: (old.min.x + old.max.x) / 2, z: (old.min.z + old.max.z) / 2 };
  const renamed = sameBox(old, defaultBox(old.label, centre)) ? defaultBox(label, centre) : { ...old, label };
  const sorted = sortObjects(objects.map((o, i) => (i === index ? renamed : o)));
  return { objects: sorted, index: sorted.indexOf(renamed) };
}

export function removeObject(objects: RoomObject[], index: number): RoomObject[] {
  return objects.filter((_, i) => i !== index);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/explore/checked.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing server tests**

In `src/server/server.test.ts`, add `import { CHECKED_FILE } from '@/lib/explore/checked';` to the imports, and add after the objects-route test:
```ts
  it('saves a checked list and serves it back; 404 before saving and for unknown jobs', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    const url = `${base}/api/splat/jobs/r1/checked`;
    expect((await fetch(url)).status).toBe(404);
    const objects = [{ label: 'door', min: { x: 0, y: 0, z: 1 }, max: { x: 0.1, y: 2, z: 2 } }];
    const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ objects }) });
    expect(put.status).toBe(204);
    const got = await fetch(url);
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ objects });
    expect(JSON.parse(await readFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), 'utf8'))).toEqual({ objects });
    expect((await fetch(`${base}/api/splat/jobs/nope/checked`)).status).toBe(404);
    expect((await fetch(`${base}/api/splat/jobs/nope/checked`, { method: 'PUT', body: '{"objects":[]}' })).status).toBe(404);
  });

  it('refuses a bad checked list with 400 and an oversized one with 413', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    const put = (body: string) => fetch(`${base}/api/splat/jobs/r1/checked`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    const door = { label: 'door', min: { x: 0, y: 0, z: 1 }, max: { x: 0.1, y: 2, z: 2 } };
    for (const body of [
      'not json',
      '{}',
      JSON.stringify({ objects: [{ ...door, label: 'lamp' }] }),
      JSON.stringify({ objects: [{ ...door, min: { x: 1, y: 0, z: 1 } }] }),
      JSON.stringify({ objects: Array.from({ length: 201 }, () => door) }),
    ]) {
      const res = await put(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad-objects' });
    }
    const big = await put(JSON.stringify({ objects: [], pad: 'x'.repeat(70_000) }));
    expect(big.status).toBe(413);
  });

  it('treats a corrupt checked file as no checked list', async () => {
    fake.state.ready.add('r1');
    await mkdir(path.join(tmp, 'jobs', 'r1'), { recursive: true });
    await writeFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), 'garbage');
    expect((await fetch(`${base}/api/splat/jobs/r1/checked`)).status).toBe(404);
    await writeFile(path.join(tmp, 'jobs', 'r1', CHECKED_FILE), JSON.stringify({ objects: [{ label: 'lamp' }] }));
    expect((await fetch(`${base}/api/splat/jobs/r1/checked`)).status).toBe(404);
  });
```
Run `npx vitest run src/server/server.test.ts` — Expected: FAIL (404 for the PUT).

- [ ] **Step 6: Add the routes to `src/server/server.ts`**

- Change the `node:fs/promises` import to `import { readFile, rename, stat, writeFile } from 'node:fs/promises';`
- Add `import { CHECKED_FILE, readChecked } from '@/lib/explore/checked';` after the protocol import.
- Under `function sendJson(…)`, add:
```ts
const MAX_CHECKED_BYTES = 64 * 1024;

/** A request body as text, or null once it passes `limit` bytes (the rest is still read, so the client gets its answer). */
function readBody(req: Req, limit: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
```
- Inside `createServer`, after `sendObjects`, add:
```ts
  /** The helper's checked list (spec 2026-10-08 §10). A missing or unreadable file is "not checked yet". */
  async function sendChecked(res: Res, id: string): Promise<void> {
    const dir = jobs.jobDir(id);
    if (!dir) return sendJson(res, 404, { error: 'not-found' });
    let objects = null;
    try {
      objects = readChecked(JSON.parse(await readFile(path.join(dir, CHECKED_FILE), 'utf8')));
    } catch {
      // not saved yet, or not JSON
    }
    return objects ? sendJson(res, 200, { objects }) : sendJson(res, 404, { error: 'not-checked' });
  }

  async function saveChecked(req: Req, res: Res, id: string): Promise<void> {
    const dir = jobs.jobDir(id);
    if (!dir) {
      req.resume();
      return sendJson(res, 404, { error: 'not-found' });
    }
    const text = await readBody(req, MAX_CHECKED_BYTES);
    if (text === null) return sendJson(res, 413, { error: 'too-large' });
    let objects = null;
    try {
      objects = readChecked(JSON.parse(text));
    } catch {
      // not JSON
    }
    if (!objects) return sendJson(res, 400, { error: 'bad-objects' });
    const file = path.join(dir, CHECKED_FILE);
    await writeFile(`${file}.tmp`, JSON.stringify({ objects }));
    await rename(`${file}.tmp`, file); // never a half-written file
    res.writeHead(204, { 'Cache-Control': 'no-store' });
    res.end();
  }
```
- In `api`, after the `objects` route, add:
```ts
    if (resource === 'jobs' && id && sub === 'checked' && method === 'GET') return sendChecked(res, id);
    if (resource === 'jobs' && id && sub === 'checked' && method === 'PUT') return saveChecked(req, res, id);
```
Run `npx vitest run src/server/server.test.ts` — Expected: PASS.

- [ ] **Step 7: Write the failing client tests**

In `src/lib/splatJobs/client.test.ts`, add `fetchChecked` and `saveChecked` to the import from `./client`, and add at the end:
```ts
describe('checked list', () => {
  const door = { label: 'door', min: { x: 0, y: 0, z: 1 }, max: { x: 0.1, y: 2, z: 2 } };
  it('fetches a valid list, and gives null for none, a network error or a bad list', async () => {
    const fetchFn = vi.fn(async () => json({ objects: [door] }));
    expect(await fetchChecked('j 1', fetchFn)).toEqual([door]);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j%201/checked', expect.objectContaining({ cache: 'no-store' }));
    expect(await fetchChecked('j1', async () => json({ error: 'not-checked' }, 404))).toBeNull();
    expect(await fetchChecked('j1', async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
    expect(await fetchChecked('j1', async () => json({ objects: [{ label: 'lamp' }] }))).toBeNull();
  });

  it('saves with a PUT and reports whether it worked', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await saveChecked('j1', [door] as never, fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith('/api/splat/jobs/j1/checked', expect.objectContaining({ method: 'PUT', body: JSON.stringify({ objects: [door] }) }));
    expect(await saveChecked('j1', [], async () => json({ error: 'bad-objects' }, 400))).toBe(false);
    expect(await saveChecked('j1', [], async () => Promise.reject(new TypeError('Failed to fetch')))).toBe(false);
  });
});
```
Run `npx vitest run src/lib/splatJobs/client.test.ts` — Expected: FAIL (not exported).

- [ ] **Step 8: Add the client functions**

In `src/lib/splatJobs/client.ts`, add `import { readChecked } from '@/lib/explore/checked';` and `import type { RoomObject } from '@/lib/room/types';` after the protocol import, and append:
```ts
/** The helper's checked list for a room, or null when there isn't a valid one (spec 2026-10-08 §6). */
export async function fetchChecked(id: string, fetchFn: Fetch = browserFetch): Promise<RoomObject[] | null> {
  try {
    const res = await fetchFn(`${jobUrl(id)}/checked`, { cache: 'no-store' });
    if (!res.ok) return null;
    return readChecked(await res.json());
  } catch {
    return null;
  }
}

/** Save the whole checked list; false if the laptop didn't take it. */
export async function saveChecked(id: string, objects: RoomObject[], fetchFn: Fetch = browserFetch): Promise<boolean> {
  try {
    const res = await fetchFn(`${jobUrl(id)}/checked`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ objects }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
```
Run `npx vitest run src/lib/splatJobs/client.test.ts` — Expected: PASS.

- [ ] **Step 9: Verify and commit**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — Expected: all clean.
```bash
git status --short
git add src/lib/explore/checked.ts src/lib/explore/checked.test.ts src/server/server.ts src/server/server.test.ts src/lib/splatJobs/client.ts src/lib/splatJobs/client.test.ts
git commit -q -m "$(cat <<'EOF'
feat: the helper's checked list, saved on the laptop

GET and PUT /api/splat/jobs/:id/checked keep checked-objects.json in the job
folder; a bad body is a 400, an oversized one a 413, a corrupt file a 404.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/checked.ts src/lib/explore/checked.test.ts src/server/server.ts src/server/server.test.ts src/lib/splatJobs/client.ts src/lib/splatJobs/client.test.ts
```

---

### Task 5: Geometry and walking

**Files:**
- Create: `src/lib/explore/geometry.ts`, `src/lib/explore/geometry.test.ts`, `src/lib/explore/walk.ts`, `src/lib/explore/walk.test.ts`

**Interfaces:**
- Consumes: `nameInfo`, `NameId` (Task 3); `Dims`, `RoomObject`, `Vec3`.
- Produces (in `@/lib/explore/geometry`): `type Pose = { x: number; z: number; heading: number }`, `TAU`, `centre(o): Vec3`, `footprintDistance(p: { x; z }, o): number`, `bearing(pose, p: { x; z }): number` (clockwise, `[0, 2π)`), `clockHour(bearing): number` (1–12), `normalizeHeading(h): number` (to `(−π, π]`).
- Produces (in `@/lib/explore/walk`): `STEP_M = 0.5`, `TURN = π/6`, `WALL_GAP_M = 0.3`, `BODY_M = 0.25`, `CONTACT_HEIGHT_M = 1`, `type Blocker = { label: NameId | 'wall'; at: Vec3 }`, `type StepResult = { ok: true; pose: Pose } | { ok: false; blocker: Blocker }`, `turn(pose, direction: 1 | -1): Pose`, `step(dims, objects, pose, direction: 1 | -1): StepResult`, `clampToRoom(dims, p: { x; z }): { x; z }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/explore/geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import { bearing, centre, clockHour, footprintDistance, normalizeHeading, TAU, type Pose } from './geometry';

const table: RoomObject = { label: 'table', min: { x: 2, y: 0, z: 1 }, max: { x: 3, y: 0.8, z: 2 } };
const facingX: Pose = { x: 0, z: 0, heading: 0 };

describe('geometry', () => {
  it('finds a box centre and the floor distance to its footprint', () => {
    expect(centre(table)).toEqual({ x: 2.5, y: 0.4, z: 1.5 });
    expect(footprintDistance({ x: 2.5, z: 1.5 }, table)).toBe(0);
    expect(footprintDistance({ x: 1, z: 1.5 }, table)).toBe(1);
    expect(footprintDistance({ x: 6, z: 6 }, table)).toBeCloseTo(5, 10);
  });

  it('measures bearings clockwise from the facing direction: right is 3 o\'clock', () => {
    expect(bearing(facingX, { x: 5, z: 0 })).toBe(0);
    expect(bearing(facingX, { x: 0, z: 5 })).toBeCloseTo(Math.PI / 2, 10); // +z is to the right of +x
    expect(bearing(facingX, { x: -5, z: 0 })).toBeCloseTo(Math.PI, 10);
    expect(bearing(facingX, { x: 0, z: -5 })).toBeCloseTo((3 * Math.PI) / 2, 10);
    expect(bearing({ x: 0, z: 0, heading: Math.PI / 2 }, { x: 0, z: 5 })).toBe(0); // turned right to face +z
  });

  it('puts something a hair left of straight ahead just under a full turn, at 12 o\'clock', () => {
    const b = bearing(facingX, { x: 5, z: -0.001 });
    expect(b).toBeGreaterThan(TAU - 0.01);
    expect(b).toBeLessThan(TAU);
    expect(clockHour(b)).toBe(12);
  });

  it('rounds bearings to clock hours', () => {
    expect(clockHour(0)).toBe(12);
    expect(clockHour(Math.PI / 6)).toBe(1);
    expect(clockHour(Math.PI / 2)).toBe(3);
    expect(clockHour(Math.PI)).toBe(6);
    expect(clockHour((3 * Math.PI) / 2)).toBe(9);
  });

  it('wraps headings into (−π, π]', () => {
    expect(normalizeHeading(3 * Math.PI)).toBeCloseTo(Math.PI, 10);
    expect(normalizeHeading(-Math.PI / 2 - TAU)).toBeCloseTo(-Math.PI / 2, 10);
  });
});
```
Create `src/lib/explore/walk.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import { clampToRoom, step, turn, TURN } from './walk';

const room: Dims = { length: 5, width: 4, height: 2.7 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});
const table = box('table', 3, 1.5, 4, 2.5);

describe('turn', () => {
  it('turns one clock hour right or left, wrapping round', () => {
    expect(turn({ x: 1, z: 1, heading: 0 }, 1).heading).toBeCloseTo(TURN, 10);
    expect(turn({ x: 1, z: 1, heading: 0 }, -1).heading).toBeCloseTo(-TURN, 10);
    expect(turn({ x: 1, z: 1, heading: Math.PI }, 1).heading).toBeCloseTo(-Math.PI + TURN, 10);
  });
});

describe('step', () => {
  it('moves half a metre forward or back along the heading', () => {
    expect(step(room, [], { x: 2, z: 2, heading: 0 }, 1)).toEqual({ ok: true, pose: { x: 2.5, z: 2, heading: 0 } });
    const back = step(room, [], { x: 2, z: 2, heading: Math.PI / 2 }, -1);
    expect(back.ok && back.pose.z).toBeCloseTo(1.5, 10);
  });

  it('stops 0.3 m short of a wall and reports the wall point nearest you', () => {
    expect(step(room, [], { x: 4.5, z: 2, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 5, y: 1, z: 2 } } });
    expect(step(room, [], { x: 2, z: 0.6, heading: -Math.PI / 2 }, 1)).toEqual({ ok: false, blocker: { label: 'wall', at: { x: 2, y: 1, z: 0 } } });
  });

  it('bumps into furniture grown by 0.25 m and reports its name and nearest point', () => {
    expect(step(room, [table], { x: 2.4, z: 2, heading: 0 }, 1)).toEqual({ ok: false, blocker: { label: 'table', at: { x: 3, y: 1, z: 2 } } });
    expect(step(room, [table], { x: 2.0, z: 2, heading: 0 }, 1).ok).toBe(true); // ends at 2.5, outside 2.75
  });

  it('walks through doors, windows, TVs and whiteboards', () => {
    expect(step(room, [box('door', 2.4, 1.5, 2.6, 2.5)], { x: 2, z: 2, heading: 0 }, 1).ok).toBe(true);
  });

  it('never traps you inside a box you are already in', () => {
    expect(step(room, [table], { x: 2.9, z: 2, heading: 0 }, 1).ok).toBe(true);
    expect(step(room, [table], { x: 2.9, z: 2, heading: Math.PI }, 1).ok).toBe(true);
  });
});

describe('clampToRoom', () => {
  it('keeps a point 0.3 m inside the walls', () => {
    expect(clampToRoom(room, { x: -1, z: 9 })).toEqual({ x: 0.3, z: 3.7 });
    expect(clampToRoom(room, { x: 2, z: 2 })).toEqual({ x: 2, z: 2 });
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/explore/geometry.test.ts src/lib/explore/walk.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/explore/geometry.ts`**

```ts
import type { RoomObject, Vec3 } from '@/lib/room/types';

/**
 * Where the explorer stands and faces, in room metres (spec 2026-10-08 §7). `heading` is atan2(dz, dx) of the facing
 * direction; turning right increases it, because +z is to the right of +x seen from above.
 */
export type Pose = { x: number; z: number; heading: number };

export const TAU = 2 * Math.PI;

export const centre = (o: RoomObject): Vec3 => ({ x: (o.min.x + o.max.x) / 2, y: (o.min.y + o.max.y) / 2, z: (o.min.z + o.max.z) / 2 });

/** Floor distance from a point to an object's footprint; 0 inside it. */
export function footprintDistance(p: { x: number; z: number }, o: RoomObject): number {
  const dx = Math.max(o.min.x - p.x, 0, p.x - o.max.x);
  const dz = Math.max(o.min.z - p.z, 0, p.z - o.max.z);
  return Math.hypot(dx, dz);
}

/** The clockwise angle on the floor from the facing direction to a point, in [0, 2π). */
export function bearing(pose: Pose, p: { x: number; z: number }): number {
  const a = Math.atan2(p.z - pose.z, p.x - pose.x) - pose.heading;
  return ((a % TAU) + TAU) % TAU;
}

/** A bearing as a clock hour, 1–12, with straight ahead at 12 (spec §7.6). */
export function clockHour(b: number): number {
  const hour = Math.round(b / (Math.PI / 6)) % 12;
  return hour === 0 ? 12 : hour;
}

export const normalizeHeading = (h: number): number => Math.atan2(Math.sin(h), Math.cos(h));
```

- [ ] **Step 4: Create `src/lib/explore/walk.ts`**

```ts
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { footprintDistance, normalizeHeading, type Pose } from './geometry';
import { nameInfo, type NameId } from './names';

/** Walking by sound (spec 2026-10-08 §7.2–7.3). */
export const STEP_M = 0.5;
export const TURN = Math.PI / 6; // one clock hour
export const WALL_GAP_M = 0.3;
export const BODY_M = 0.25;
export const CONTACT_HEIGHT_M = 1;

export type Blocker = { label: NameId | 'wall'; at: Vec3 };
export type StepResult = { ok: true; pose: Pose } | { ok: false; blocker: Blocker };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampToRoom(dims: Dims, p: { x: number; z: number }): { x: number; z: number } {
  return { x: clamp(p.x, WALL_GAP_M, dims.length - WALL_GAP_M), z: clamp(p.z, WALL_GAP_M, dims.width - WALL_GAP_M) };
}

export function turn(pose: Pose, direction: 1 | -1): Pose {
  return { ...pose, heading: normalizeHeading(pose.heading + direction * TURN) };
}

const inside = (p: { x: number; z: number }, o: RoomObject, grow: number) =>
  p.x >= o.min.x - grow && p.x <= o.max.x + grow && p.z >= o.min.z - grow && p.z <= o.max.z + grow;

/**
 * One step forward (1) or back (−1). Blocked by a wall closer than 0.3 m, or by a blocking object's footprint grown by
 * 0.25 m for the body, unless you're already inside it. A blocker comes back with its nearest point to you, at 1 m.
 */
export function step(dims: Dims, objects: RoomObject[], pose: Pose, direction: 1 | -1): StepResult {
  const to = { x: pose.x + direction * STEP_M * Math.cos(pose.heading), z: pose.z + direction * STEP_M * Math.sin(pose.heading) };
  const wall = [
    { depth: WALL_GAP_M - to.x, at: { x: 0, z: pose.z } },
    { depth: to.x - (dims.length - WALL_GAP_M), at: { x: dims.length, z: pose.z } },
    { depth: WALL_GAP_M - to.z, at: { x: pose.x, z: 0 } },
    { depth: to.z - (dims.width - WALL_GAP_M), at: { x: pose.x, z: dims.width } },
  ]
    .filter((w) => w.depth > 0)
    .sort((a, b) => b.depth - a.depth)[0];
  if (wall) {
    const at = { x: clamp(wall.at.x, 0, dims.length), y: CONTACT_HEIGHT_M, z: clamp(wall.at.z, 0, dims.width) };
    return { ok: false, blocker: { label: 'wall', at } };
  }
  let hit: RoomObject | null = null;
  let nearest = Infinity;
  for (const o of objects) {
    if (!nameInfo(o.label).blocks || !inside(to, o, BODY_M) || inside(pose, o, BODY_M)) continue;
    const d = footprintDistance(pose, o);
    if (d < nearest) [hit, nearest] = [o, d];
  }
  if (hit) {
    const at = { x: clamp(pose.x, hit.min.x, hit.max.x), y: CONTACT_HEIGHT_M, z: clamp(pose.z, hit.min.z, hit.max.z) };
    return { ok: false, blocker: { label: hit.label, at } };
  }
  return { ok: true, pose: { ...pose, ...to } };
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/lib/explore/geometry.test.ts src/lib/explore/walk.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/explore/geometry.ts src/lib/explore/geometry.test.ts src/lib/explore/walk.ts src/lib/explore/walk.test.ts
git commit -q -m "$(cat <<'EOF'
feat: walking by sound: steps, turns, walls and furniture

Half-metre steps and one-hour turns in room metres; walls stop you 0.3 m short,
blocking furniture is grown 0.25 m for the body, and a blocker reports its name.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/geometry.ts src/lib/explore/geometry.test.ts src/lib/explore/walk.ts src/lib/explore/walk.test.ts
```

---

### Task 6: Scan, targets and the pulse

**Files:**
- Create: `src/lib/explore/scan.ts`, `src/lib/explore/scan.test.ts`, `src/lib/explore/beacon.ts`, `src/lib/explore/beacon.test.ts`

**Interfaces:**
- Consumes: `bearing`, `centre`, `footprintDistance`, `Pose` (Task 5); `clipId`, `nameInfo`, `NAMES` (Task 3).
- Produces (in `@/lib/explore/scan`): `GROUP_M = 1.5`, `type ScanItem = { clip: string; at: Vec3; caption: string }`, `scanItems(objects, pose): ScanItem[]`, `targetOrder(objects, pose): number[]` (indices into `objects`).
- Produces (in `@/lib/explore/beacon`): `ARRIVE_M = 1`, `MAX_PULSE_S = 1.2`, `pulseInterval(distance): number`, `hasArrived(distance): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/explore/scan.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { RoomObject } from '@/lib/room/types';
import type { Pose } from './geometry';
import { scanItems, targetOrder } from './scan';

/** A 0.4 m box centred on (x, z). */
const at = (label: RoomObject['label'], x: number, z: number): RoomObject => ({
  label, min: { x: x - 0.2, y: 0, z: z - 0.2 }, max: { x: x + 0.2, y: 1, z: z + 0.2 },
});
const pose: Pose = { x: 2, z: 2, heading: 0 }; // facing +x; +z is to the right

describe('scanItems', () => {
  it('goes clockwise from straight ahead, grouping same-name objects within 1.5 m', () => {
    const items = scanItems([at('door', 2, 0.3), at('chair', 3, 2.1), at('table', 2, 3.5), at('chair', 3.5, 2.5)], pose);
    expect(items.map((i) => [i.clip, i.caption])).toEqual([['chairs', 'Chairs'], ['table', 'Table'], ['door', 'Door']]);
    expect(items[0].at.x).toBeCloseTo(3.25, 10); // the group speaks from the mean of its centres
    expect(items[0].at.z).toBeCloseTo(2.3, 10);
  });

  it('chains a group through its neighbours, and never groups different names', () => {
    const items = scanItems([at('chair', 3, 2), at('chair', 4.2, 2), at('chair', 5.4, 2), at('sofa', 3, 2.5)], pose);
    expect(items.map((i) => i.clip).sort()).toEqual(['chairs', 'sofa']);
  });

  it('says the singular for one object and puts something just left of ahead last', () => {
    const items = scanItems([at('plant', 5, 1.999), at('tv', 2, 4)], pose);
    expect(items.map((i) => i.clip)).toEqual(['tv', 'plant']);
    expect(items[0].caption).toBe('TV');
  });
});

describe('targetOrder', () => {
  it('offers the nearest of each name: door first, stairs second, then by distance', () => {
    const objects = [at('chair', 2.5, 2), at('chair', 4, 2), at('stairs', 4.5, 3.5), at('table', 3, 3), at('door', 0.3, 0.3)];
    expect(targetOrder(objects, pose)).toEqual([4, 2, 0, 3]);
  });

  it('is empty when nothing was found', () => {
    expect(targetOrder([], pose)).toEqual([]);
  });
});
```
Create `src/lib/explore/beacon.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { hasArrived, pulseInterval } from './beacon';

describe('beacon', () => {
  it('pulses faster as you get closer, never slower than every 1.2 s', () => {
    expect(pulseInterval(0)).toBeCloseTo(0.25, 10);
    expect(pulseInterval(2)).toBeCloseTo(0.55, 10);
    expect(pulseInterval(10)).toBe(1.2);
  });

  it('arrives within a metre of the footprint', () => {
    expect(hasArrived(1)).toBe(true);
    expect(hasArrived(1.01)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/explore/scan.test.ts src/lib/explore/beacon.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/explore/scan.ts`**

```ts
import type { RoomObject, Vec3 } from '@/lib/room/types';
import { bearing, centre, footprintDistance, type Pose } from './geometry';
import { clipId, nameInfo, NAMES } from './names';

/** Same-name objects closer than this (centre to centre, on the floor) speak once, as a group (spec 2026-10-08 §7.4). */
export const GROUP_M = 1.5;

export type ScanItem = { clip: string; at: Vec3; caption: string };

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What Space says: each group's clip from where it is, clockwise from straight ahead. */
export function scanItems(objects: RoomObject[], pose: Pose): ScanItem[] {
  const parent = objects.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const centres = objects.map(centre);
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      const near = Math.hypot(centres[i].x - centres[j].x, centres[i].z - centres[j].z) <= GROUP_M;
      if (near && objects[i].label === objects[j].label) parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, number[]>();
  objects.forEach((_, i) => groups.set(root(i), [...(groups.get(root(i)) ?? []), i]));
  return [...groups.values()]
    .map((members) => {
      const mean = (k: 'x' | 'y' | 'z') => members.reduce((sum, i) => sum + centres[i][k], 0) / members.length;
      const info = nameInfo(objects[members[0]].label);
      const words = members.length > 1 ? info.sayMany : info.say;
      return { clip: clipId(words), at: { x: mean('x'), y: mean('y'), z: mean('z') }, caption: capitalize(words) };
    })
    .sort((a, b) => bearing(pose, a.at) - bearing(pose, b.at));
}

const FIRST: readonly string[] = ['door', 'stairs'];
const ORDER = new Map<string, number>(NAMES.map((n, i) => [n.id, i]));

/** What Tab offers: the nearest object of each name, doors first, then stairs, then by distance (spec §7.5). */
export function targetOrder(objects: RoomObject[], pose: Pose): number[] {
  const nearest = new Map<string, { index: number; distance: number }>();
  objects.forEach((o, index) => {
    const distance = footprintDistance(pose, o);
    const seen = nearest.get(o.label);
    if (!seen || distance < seen.distance) nearest.set(o.label, { index, distance });
  });
  const rank = (label: string) => (FIRST.includes(label) ? FIRST.indexOf(label) : FIRST.length);
  return [...nearest.entries()]
    .sort(([la, a], [lb, b]) => rank(la) - rank(lb) || a.distance - b.distance || ORDER.get(la)! - ORDER.get(lb)!)
    .map(([, t]) => t.index);
}
```

- [ ] **Step 4: Create `src/lib/explore/beacon.ts`**

```ts
/** Go to (spec 2026-10-08 §7.5): a pulse from the target that speeds up as you close in, and arrival at 1 m. */
export const ARRIVE_M = 1;
export const MAX_PULSE_S = 1.2;

/** Seconds between pulses, `d` metres from the target's footprint. */
export const pulseInterval = (d: number): number => Math.min(MAX_PULSE_S, 0.25 + 0.15 * Math.max(0, d));

export const hasArrived = (d: number): boolean => d <= ARRIVE_M;
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/lib/explore/scan.test.ts src/lib/explore/beacon.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/explore/scan.ts src/lib/explore/scan.test.ts src/lib/explore/beacon.ts src/lib/explore/beacon.test.ts
git commit -q -m "$(cat <<'EOF'
feat: scan clockwise, choose targets, pulse toward them

Same-name objects within 1.5 m speak once as a plural; Tab offers the nearest of
each name, doors first; the pulse quickens with distance and arrives at 1 m.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/scan.ts src/lib/explore/scan.test.ts src/lib/explore/beacon.ts src/lib/explore/beacon.test.ts
```

---

### Task 7: The narrator's words

**Files:**
- Create: `src/lib/explore/words.ts`, `src/lib/explore/words.test.ts`

**Interfaces:**
- Consumes: `bearing`, `centre`, `clockHour`, `footprintDistance`, `Pose` (Task 5); `NAMES`, `nameInfo` (Task 3); `Dims`, `RoomObject`.
- Produces (in `@/lib/explore/words`): `HELP_LINE`, `STOPPED_LINE`, `NOTHING_AROUND_LINE`, `NOTHING_TO_GO_TO_LINE`, `distanceWords(m)`, `roomSizeWords(dims)`, `listWords(parts)`, `countWords(objects)`, `introLine(dims, objects, pose)`, `targetLine(o, pose)`, `arrivalLine(o)` — all returning `string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/explore/words.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import type { Pose } from './geometry';
import { arrivalLine, countWords, distanceWords, introLine, listWords, roomSizeWords, targetLine } from './words';

const room: Dims = { length: 4.6, width: 3.3, height: 2.4 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 1, z: z1 },
});
const pose: Pose = { x: 2, z: 2, heading: 0 };
const door = box('door', 0, 1.55, 0.1, 2.45); // on the wall behind you

describe('words', () => {
  it('rounds distances: under a metre, half metres under 3 m, whole metres above', () => {
    expect(distanceWords(0.99)).toBe('less than a metre');
    expect(distanceWords(1)).toBe('about 1 metre');
    expect(distanceWords(1.3)).toBe('about 1.5 metres');
    expect(distanceWords(2.99)).toBe('about 3 metres');
    expect(distanceWords(3)).toBe('about 3 metres');
    expect(distanceWords(4.4)).toBe('about 4 metres');
  });

  it('says the room size in whole metres and joins lists naturally', () => {
    expect(roomSizeWords(room)).toBe('about 5 by 3 metres');
    expect(listWords([])).toBe('');
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b'])).toBe('a and b');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it("counts objects in the spec's name order", () => {
    const objects = [box('tv', 0, 0, 1, 1), box('chair', 0, 0, 1, 1), box('door', 0, 0, 1, 1), box('chair', 2, 2, 3, 3), box('stairs', 0, 0, 1, 1)];
    expect(countWords(objects)).toBe('1 door, 1 staircase, 2 chairs and 1 TV');
  });

  it('introduces the room, and where the nearest door is when there is one', () => {
    expect(introLine(room, [door], pose)).toBe(
      "A room about 5 by 3 metres, with 1 door. You're at the starting point. The nearest door is at 6 o'clock, about 2 metres. Press H for help.",
    );
    expect(introLine(room, [], pose)).toBe("A room about 5 by 3 metres, with nothing found yet. You're at the starting point. Press H for help.");
  });

  it('names a target with its clock hour and distance, and says when you arrive', () => {
    expect(targetLine(box('table', 1.5, 3.3, 2.5, 4), pose)).toBe("Table, 3 o'clock, about 1.5 metres.");
    expect(arrivalLine(box('tv', 0, 0, 1, 1))).toBe("You're at the TV.");
    expect(arrivalLine(door)).toBe("You're at the door.");
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/explore/words.test.ts`
Expected: FAIL — cannot find module `./words`.

- [ ] **Step 3: Create `src/lib/explore/words.ts`**

```ts
import type { Dims, RoomObject } from '@/lib/room/types';
import { bearing, centre, clockHour, footprintDistance, type Pose } from './geometry';
import { nameInfo, NAMES } from './names';

/** Everything the narrator says (spec 2026-10-08 §7). */
export const HELP_LINE =
  "W and S walk. A and D turn. Space: what's around you. Tab: choose a place. Enter: go there. Escape: stop. H: these keys again.";
export const STOPPED_LINE = 'Stopped.';
export const NOTHING_AROUND_LINE = 'Nothing found around you.';
export const NOTHING_TO_GO_TO_LINE = 'Nothing to go to yet.';

/** Under 1 m "less than a metre"; under 3 m to the half metre; otherwise whole metres (spec §7.6). */
export function distanceWords(metres: number): string {
  if (metres < 1) return 'less than a metre';
  const rounded = metres < 3 ? Math.round(metres * 2) / 2 : Math.round(metres);
  return `about ${rounded} ${rounded === 1 ? 'metre' : 'metres'}`;
}

export function roomSizeWords(dims: Dims): string {
  return `about ${Math.max(1, Math.round(dims.length))} by ${Math.max(1, Math.round(dims.width))} metres`;
}

/** "a", "a and b", "a, b and c". */
export function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

export function countWords(objects: RoomObject[]): string {
  return listWords(
    NAMES.flatMap((n) => {
      const count = objects.filter((o) => o.label === n.id).length;
      return count === 0 ? [] : [`${count} ${count === 1 ? n.one : n.many}`];
    }),
  );
}

/** "6 o'clock, about 2 metres": the clock hour to its centre, the distance to its footprint. */
const whereWords = (o: RoomObject, pose: Pose) => `${clockHour(bearing(pose, centre(o)))} o'clock, ${distanceWords(footprintDistance(pose, o))}`;

export function introLine(dims: Dims, objects: RoomObject[], pose: Pose): string {
  const parts = [`A room ${roomSizeWords(dims)}, with ${countWords(objects) || 'nothing found yet'}.`, "You're at the starting point."];
  const door = objects
    .filter((o) => o.label === 'door')
    .sort((a, b) => footprintDistance(pose, a) - footprintDistance(pose, b))[0];
  if (door) parts.push(`The nearest door is at ${whereWords(door, pose)}.`);
  parts.push('Press H for help.');
  return parts.join(' ');
}

export const targetLine = (o: RoomObject, pose: Pose): string => `${nameInfo(o.label).title}, ${whereWords(o, pose)}.`;

export const arrivalLine = (o: RoomObject): string => `You're at the ${nameInfo(o.label).say}.`;
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/explore/words.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/lib/explore/words.ts src/lib/explore/words.test.ts
git commit -q -m "$(cat <<'EOF'
feat: what the narrator says: intro, targets, arrival, help

Clock hours to an object's centre, distances to its footprint, rounded to the half
metre under 3 m; the intro ends with the nearest door when there is one.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/words.ts src/lib/explore/words.test.ts
```

---

### Task 8: The explore session and its keys

**Files:**
- Create: `src/lib/explore/session.ts`, `src/lib/explore/session.test.ts`, `src/lib/explore/keys.ts`, `src/lib/explore/keys.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6 and 7 (`clipId`, `nameInfo`, `WALL_CLIP`; `centre`, `footprintDistance`, `Pose`; `clampToRoom`, `step`, `turn`; `scanItems`, `targetOrder`, `ScanItem`; `hasArrived`; the `words` lines).
- Produces (in `@/lib/explore/session`):
  - `EAR_HEIGHT_M = 1.5`
  - `type Action = 'forward' | 'back' | 'left' | 'right' | 'scan' | 'next' | 'previous' | 'go' | 'stop' | 'help'`
  - `type Effect = { kind: 'say'; text } | { kind: 'clip'; clip; at: Vec3 } | { kind: 'scan'; items: ScanItem[] } | { kind: 'footstep' } | { kind: 'thud'; at: Vec3 } | { kind: 'chime' }`
  - `type Session = { dims; objects; pose: Pose; chosen: number | null; going: boolean }`, `type Turn = { session: Session; effects: Effect[] }`
  - `startSession(dims, objects, start: Pose): Turn`, `act(session, action): Turn`, `pulseTarget(session): { at: Vec3; distance: number } | null`, `earPosition(session): Vec3`
- Produces (in `@/lib/explore/keys`): `REPEAT_MS = 500`, `type KeyLike = { code; shiftKey; ctrlKey; altKey; metaKey; repeat? }`, `keyAction(e: KeyLike): Action | null`, `createRepeater(run: (a: Action) => void, timers?): { press(e: KeyLike): boolean; release(code: string): void; releaseAll(): void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/explore/session.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Dims, RoomObject } from '@/lib/room/types';
import { act, pulseTarget, startSession, type Session } from './session';

const room: Dims = { length: 5, width: 4, height: 2.7 };
const box = (label: RoomObject['label'], x0: number, z0: number, x1: number, z1: number): RoomObject => ({
  label, min: { x: x0, y: 0, z: z0 }, max: { x: x1, y: 2, z: z1 },
});
const door = box('door', 4.9, 1.55, 5, 2.45); // on the far wall, straight ahead from (2, 2) facing +x
const table = box('table', 3, 1.5, 4, 2.5);
const start = (objects: RoomObject[], x = 2, z = 2): Session => startSession(room, objects, { x, z, heading: 0 }).session;

describe('startSession', () => {
  it('clamps the start inside the walls and says the intro', () => {
    const { session, effects } = startSession(room, [door], { x: -3, z: 2, heading: 0 });
    expect(session.pose).toEqual({ x: 0.3, z: 2, heading: 0 });
    expect(effects).toEqual([{ kind: 'say', text: expect.stringContaining("You're at the starting point.") }]);
  });
});

describe('walking', () => {
  it('steps with a footstep, and turns silently', () => {
    const forward = act(start([]), 'forward');
    expect(forward.session.pose.x).toBeCloseTo(2.5, 10);
    expect(forward.effects).toEqual([{ kind: 'footstep' }]);
    const right = act(start([]), 'right');
    expect(right.session.pose.heading).toBeCloseTo(Math.PI / 6, 10);
    expect(right.effects).toEqual([]);
  });

  it('bumps with a thud, then the blocker\'s name from the same point', () => {
    const bump = act(start([table], 2.4), 'forward');
    expect(bump.session.pose.x).toBe(2.4);
    expect(bump.effects).toEqual([{ kind: 'thud', at: { x: 3, y: 1, z: 2 } }, { kind: 'clip', clip: 'table', at: { x: 3, y: 1, z: 2 } }]);
    const wall = act(start([], 4.5), 'forward');
    expect(wall.effects).toEqual([{ kind: 'thud', at: { x: 5, y: 1, z: 2 } }, { kind: 'clip', clip: 'wall', at: { x: 5, y: 1, z: 2 } }]);
  });
});

describe('scan and help', () => {
  it('scans what is there, or says nothing was found', () => {
    expect(act(start([door]), 'scan').effects).toEqual([{ kind: 'scan', items: [{ clip: 'door', at: { x: 4.95, y: 1, z: 2 }, caption: 'Door' }] }]);
    expect(act(start([]), 'scan').effects).toEqual([{ kind: 'say', text: 'Nothing found around you.' }]);
    expect(act(start([]), 'help').effects).toEqual([{ kind: 'say', text: expect.stringContaining('W and S walk.') }]);
  });
});

describe('choosing and going', () => {
  it('cycles targets with Tab and Shift+Tab, announcing each', () => {
    const s = start([table, door]); // indices: table 0, door 1
    const first = act(s, 'next');
    expect(first.session.chosen).toBe(1);
    expect(first.effects).toEqual([
      { kind: 'clip', clip: 'door', at: { x: 4.95, y: 1, z: 2 } },
      { kind: 'say', text: "Door, 12 o'clock, about 3 metres." },
    ]);
    expect(act(first.session, 'next').session.chosen).toBe(0);
    expect(act(act(first.session, 'next').session, 'next').session.chosen).toBe(1);
    expect(act(s, 'previous').session.chosen).toBe(0);
  });

  it('goes to the first target when none is chosen, and arrives with a chime', () => {
    let turn = act(start([door]), 'go');
    expect(turn.session).toMatchObject({ chosen: 0, going: true });
    expect(turn.effects.map((e) => e.kind)).toEqual(['clip', 'say']);
    expect(pulseTarget(turn.session)?.at).toEqual({ x: 4.95, y: 1, z: 2 });
    expect(pulseTarget(turn.session)?.distance).toBeCloseTo(2.9, 10);
    for (let i = 0; i < 3; i++) turn = act(turn.session, 'forward'); // x 3.5: 1.4 m to go
    expect(turn.session.going).toBe(true);
    turn = act(turn.session, 'forward'); // x 4.0: 0.9 m
    expect(turn.effects).toEqual([{ kind: 'footstep' }, { kind: 'chime' }, { kind: 'say', text: "You're at the door." }]);
    expect(turn.session.going).toBe(false);
    expect(pulseTarget(turn.session)).toBeNull();
  });

  it('arrives at once when already there', () => {
    const turn = act(start([door], 4.2), 'go');
    expect(turn.effects.map((e) => e.kind)).toEqual(['clip', 'say', 'chime', 'say']);
    expect(turn.session.going).toBe(false);
  });

  it('stops the pulse with Esc, and Esc does nothing otherwise', () => {
    const going = act(start([door]), 'go').session;
    expect(act(going, 'stop')).toEqual({ session: { ...going, going: false }, effects: [{ kind: 'say', text: 'Stopped.' }] });
    expect(act(start([door]), 'stop').effects).toEqual([]);
  });

  it('has nothing to go to in an empty room', () => {
    expect(act(start([]), 'next').effects).toEqual([{ kind: 'say', text: 'Nothing to go to yet.' }]);
    expect(act(start([]), 'go').effects).toEqual([{ kind: 'say', text: 'Nothing to go to yet.' }]);
    expect(startSession(room, [], { x: 2, z: 2, heading: 0 }).effects[0]).toEqual({ kind: 'say', text: expect.stringContaining('with nothing found yet') });
  });
});
```
Create `src/lib/explore/keys.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepeater, keyAction, REPEAT_MS, type KeyLike } from './keys';
import type { Action } from './session';

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

describe('keyAction', () => {
  it('maps W A S D, Space, Tab, Enter, Esc and H', () => {
    expect(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'Enter', 'Escape', 'KeyH'].map((c) => keyAction(key(c)))).toEqual([
      'forward', 'back', 'left', 'right', 'scan', 'go', 'stop', 'help',
    ]);
    expect(keyAction(key('Tab'))).toBe('next');
    expect(keyAction(key('Tab', { shiftKey: true }))).toBe('previous');
  });

  it('leaves arrows and keys with Ctrl, Alt or Cmd to the browser', () => {
    expect(keyAction(key('ArrowUp'))).toBeNull();
    expect(keyAction(key('Tab', { ctrlKey: true }))).toBeNull();
    expect(keyAction(key('Tab', { altKey: true }))).toBeNull();
    expect(keyAction(key('KeyW', { metaKey: true }))).toBeNull();
    expect(keyAction(key('KeyR', { ctrlKey: true }))).toBeNull();
  });
});

describe('createRepeater', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('acts on press, repeats walking and turning every 0.5 s while held, and stops on release', () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    expect(keys.press(key('KeyW'))).toBe(true);
    vi.advanceTimersByTime(REPEAT_MS * 2);
    expect(ran).toEqual(['forward', 'forward', 'forward']);
    keys.release('KeyW');
    vi.advanceTimersByTime(REPEAT_MS * 2);
    expect(ran).toHaveLength(3);
  });

  it("ignores the browser's own key repeat, and never repeats Space", () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    keys.press(key('Space'));
    keys.press({ ...key('Space'), repeat: true });
    vi.advanceTimersByTime(REPEAT_MS * 3);
    expect(ran).toEqual(['scan']);
    keys.release('Space');
    keys.press(key('Space'));
    expect(ran).toEqual(['scan', 'scan']);
  });

  it('stops everything when the window loses focus mid-walk', () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    keys.press(key('KeyW'));
    keys.press(key('KeyD'));
    keys.releaseAll();
    vi.advanceTimersByTime(REPEAT_MS * 3);
    expect(ran).toEqual(['forward', 'right']);
  });

  it('reports keys it does not use as unhandled', () => {
    const keys = createRepeater(() => {});
    expect(keys.press(key('ArrowUp'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/lib/explore/session.test.ts src/lib/explore/keys.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/explore/session.ts`**

```ts
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { hasArrived } from './beacon';
import { centre, footprintDistance, type Pose } from './geometry';
import { clipId, nameInfo, WALL_CLIP } from './names';
import { scanItems, targetOrder, type ScanItem } from './scan';
import { clampToRoom, step, turn } from './walk';
import { arrivalLine, HELP_LINE, introLine, NOTHING_AROUND_LINE, NOTHING_TO_GO_TO_LINE, STOPPED_LINE, targetLine } from './words';

/** The explorer's ears: the phone's assumed height while filming (spec 2026-10-08 §7.1). */
export const EAR_HEIGHT_M = 1.5;

export type Action = 'forward' | 'back' | 'left' | 'right' | 'scan' | 'next' | 'previous' | 'go' | 'stop' | 'help';
export type Effect =
  | { kind: 'say'; text: string }
  | { kind: 'clip'; clip: string; at: Vec3 }
  | { kind: 'scan'; items: ScanItem[] }
  | { kind: 'footstep' }
  | { kind: 'thud'; at: Vec3 }
  | { kind: 'chime' };

/** The explorer's state. Pure data: `act` returns a new one and the sounds to play, so all of it is testable. */
export type Session = { dims: Dims; objects: RoomObject[]; pose: Pose; chosen: number | null; going: boolean };
export type Turn = { session: Session; effects: Effect[] };

const say = (session: Session, text: string): Turn => ({ session, effects: [{ kind: 'say', text }] });

export function startSession(dims: Dims, objects: RoomObject[], start: Pose): Turn {
  const pose = { ...clampToRoom(dims, start), heading: start.heading };
  return say({ dims, objects, pose, chosen: null, going: false }, introLine(dims, objects, pose));
}

/** The target's clip from where it is, then the narrator's line (spec §7.5). */
function announce(s: Session, index: number): Effect[] {
  const o = s.objects[index];
  return [
    { kind: 'clip', clip: clipId(nameInfo(o.label).say), at: centre(o) },
    { kind: 'say', text: targetLine(o, s.pose) },
  ];
}

/** While going, within a metre of the target: chime, say so, and stop. */
function arrive(s: Session, effects: Effect[]): Turn {
  if (!s.going || s.chosen === null) return { session: s, effects };
  const o = s.objects[s.chosen];
  if (!hasArrived(footprintDistance(s.pose, o))) return { session: s, effects };
  return { session: { ...s, going: false }, effects: [...effects, { kind: 'chime' }, { kind: 'say', text: arrivalLine(o) }] };
}

function choose(s: Session, direction: 1 | -1): Turn {
  const order = targetOrder(s.objects, s.pose);
  if (order.length === 0) return say(s, NOTHING_TO_GO_TO_LINE);
  const at = s.chosen === null ? -1 : order.indexOf(s.chosen);
  const i = at === -1 ? (direction === 1 ? 0 : order.length - 1) : (at + direction + order.length) % order.length;
  return { session: { ...s, chosen: order[i] }, effects: announce(s, order[i]) };
}

export function act(s: Session, action: Action): Turn {
  switch (action) {
    case 'forward':
    case 'back': {
      const r = step(s.dims, s.objects, s.pose, action === 'forward' ? 1 : -1);
      if (!r.ok) {
        const clip = r.blocker.label === 'wall' ? WALL_CLIP : clipId(nameInfo(r.blocker.label).say);
        return { session: s, effects: [{ kind: 'thud', at: r.blocker.at }, { kind: 'clip', clip, at: r.blocker.at }] };
      }
      return arrive({ ...s, pose: r.pose }, [{ kind: 'footstep' }]);
    }
    case 'left':
    case 'right':
      return { session: { ...s, pose: turn(s.pose, action === 'right' ? 1 : -1) }, effects: [] };
    case 'scan': {
      const items = scanItems(s.objects, s.pose);
      return items.length > 0 ? { session: s, effects: [{ kind: 'scan', items }] } : say(s, NOTHING_AROUND_LINE);
    }
    case 'next':
    case 'previous':
      return choose(s, action === 'next' ? 1 : -1);
    case 'go': {
      const order = targetOrder(s.objects, s.pose);
      const chosen = s.chosen ?? (order.length > 0 ? order[0] : null);
      if (chosen === null) return say(s, NOTHING_TO_GO_TO_LINE);
      return arrive({ ...s, chosen, going: true }, s.chosen === null ? announce(s, chosen) : []);
    }
    case 'stop':
      return s.going ? say({ ...s, going: false }, STOPPED_LINE) : { session: s, effects: [] };
    case 'help':
      return say(s, HELP_LINE);
  }
}

/** Where the pulse plays from, and how far away it is; null unless going somewhere. */
export function pulseTarget(s: Session): { at: Vec3; distance: number } | null {
  if (!s.going || s.chosen === null) return null;
  const o = s.objects[s.chosen];
  return { at: centre(o), distance: footprintDistance(s.pose, o) };
}

export const earPosition = (s: Session): Vec3 => ({ x: s.pose.x, y: EAR_HEIGHT_M, z: s.pose.z });
```

- [ ] **Step 4: Create `src/lib/explore/keys.ts`**

```ts
import type { Action } from './session';

/** Held W/S/A/D act again every half second: about 1 m/s walking (spec 2026-10-08 §7.2). */
export const REPEAT_MS = 500;

export type KeyLike = { code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat?: boolean };

const KEYS: Record<string, Action> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'scan',
  Enter: 'go',
  NumpadEnter: 'go',
  Escape: 'stop',
  KeyH: 'help',
};
const REPEATS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']);

/** The explore action for a key, or null. Keys with Ctrl, Alt or Cmd stay with the browser and the OS. */
export function keyAction(e: KeyLike): Action | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.code === 'Tab') return e.shiftKey ? 'previous' : 'next';
  return KEYS[e.code] ?? null;
}

type Timers = { set: (run: () => void, ms: number) => ReturnType<typeof setInterval>; clear: (id: ReturnType<typeof setInterval>) => void };
const realTimers: Timers = { set: (run, ms) => setInterval(run, ms), clear: (id) => clearInterval(id) };

/**
 * Key presses to actions, acting on the first press and repeating held walking and turning keys on our own clock (the
 * browser's repeat is ignored). `press` returns true for keys it used, so the caller can prevent the browser's default.
 */
export function createRepeater(run: (action: Action) => void, timers: Timers = realTimers) {
  const held = new Map<string, ReturnType<typeof setInterval>>();
  return {
    press(e: KeyLike): boolean {
      const action = keyAction(e);
      if (!action) return false;
      if (e.repeat || held.has(e.code)) return true;
      run(action);
      if (REPEATS.has(e.code)) held.set(e.code, timers.set(() => run(action), REPEAT_MS));
      return true;
    },
    release(code: string): void {
      const id = held.get(code);
      if (id === undefined) return;
      timers.clear(id);
      held.delete(code);
    },
    /** The window lost focus: its keyups will never come. */
    releaseAll(): void {
      for (const id of held.values()) timers.clear(id);
      held.clear();
    },
  };
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run src/lib/explore/session.test.ts src/lib/explore/keys.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git status --short
git add src/lib/explore/session.ts src/lib/explore/session.test.ts src/lib/explore/keys.ts src/lib/explore/keys.test.ts
git commit -q -m "$(cat <<'EOF'
feat: the explore session: keys in, state and sounds out

A pure state machine for walking, bumping, scanning, choosing and going, with
hold-to-repeat keys that leave Ctrl, Alt and Cmd combinations to the browser.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/session.ts src/lib/explore/session.test.ts src/lib/explore/keys.ts src/lib/explore/keys.test.ts
```

---

### Task 9: The room's echo

**Files:**
- Create: `src/lib/explore/echo.ts`, `src/lib/explore/echo.test.ts`

**Interfaces:**
- Consumes: `addTail` (Task 2), `fadeTail` from `@/lib/acoustics/dsp`, `eyring`, `roomVolume`, `totalSurfaceArea`, `midRt60` from `@/lib/acoustics/reverbTime`, `MATERIAL_ALPHA`, `FURNISHING_SOME` (Task 2), `NUM_BANDS`, `Bands`.
- Produces (in `@/lib/explore/echo`): `MAX_ECHO_S = 2`, `echoRt60(dims): Bands`, `echoIr(dims, sampleRate): { left: Float32Array; right: Float32Array }`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/explore/echo.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { midRt60 } from '@/lib/acoustics/reverbTime';
import { echoIr, echoRt60, MAX_ECHO_S } from './echo';

const SR = 8000;
const room = { length: 5, width: 4, height: 2.7 };
const rms = (s: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += s[i] * s[i];
  return Math.sqrt(sum / (to - from));
};

describe('echo', () => {
  it('predicts the reverb time of a drywall room with a carpet floor and a plaster ceiling', () => {
    expect(midRt60(echoRt60(room))).toBeCloseTo(0.354, 2);
  });

  it('makes a stereo response one and a half reverb times long that fades away', () => {
    const ir = echoIr(room, SR);
    expect(ir.left.length).toBe(Math.ceil(1.5 * Math.max(...echoRt60(room)) * SR));
    expect(ir.right.length).toBe(ir.left.length);
    expect(ir.left.some((v, i) => v !== ir.right[i])).toBe(true);
    const tenth = Math.floor(ir.left.length / 10);
    expect(rms(ir.left, ir.left.length - tenth, ir.left.length)).toBeLessThan(rms(ir.left, 0, tenth) / 100);
  });

  it('caps a big room at 2 s and fades the cut to silence', () => {
    const ir = echoIr({ length: 25, width: 20, height: 10 }, SR);
    expect(ir.left.length).toBe(MAX_ECHO_S * SR);
    expect(Math.abs(ir.left[ir.left.length - 1])).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/lib/explore/echo.test.ts`
Expected: FAIL — cannot find module `./echo`.

- [ ] **Step 3: Create `src/lib/explore/echo.ts`**

```ts
import { NUM_BANDS, type Bands } from '@/lib/acoustics/bands';
import { fadeTail } from '@/lib/acoustics/dsp';
import { FURNISHING_SOME, MATERIAL_ALPHA } from '@/lib/acoustics/materials';
import { eyring, roomVolume, totalSurfaceArea } from '@/lib/acoustics/reverbTime';
import { addTail } from '@/lib/acoustics/tail';
import type { Dims } from '@/lib/room/types';

/** The light room echo behind every voice (spec 2026-10-08 §8.4): set by the room's size, not by where you stand. */
export const MAX_ECHO_S = 2;
const FADE_S = 0.1;

/** Eyring per octave band over the fitted box: drywall walls, a carpet floor, a plaster ceiling and some furniture. */
export function echoRt60(d: Dims): Bands {
  const floor = d.length * d.width;
  const walls = 2 * (d.length + d.width) * d.height;
  const absorption = Array.from(
    { length: NUM_BANDS },
    (_, b) => walls * MATERIAL_ALPHA.drywall[b] + floor * (MATERIAL_ALPHA.carpet[b] + MATERIAL_ALPHA.plaster[b] + FURNISHING_SOME[b]),
  );
  return eyring(roomVolume(d), totalSurfaceArea(d), absorption);
}

/** The echo's stereo impulse response: one and a half reverb times of tail, capped at 2 s with the cut faded. */
export function echoIr(d: Dims, sampleRate: number): { left: Float32Array; right: Float32Array } {
  const rt = echoRt60(d);
  const full = 1.5 * Math.max(...rt);
  const length = Math.ceil(Math.min(MAX_ECHO_S, full) * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  addTail(rt, roomVolume(d), 0, sampleRate, left, right);
  if (full > MAX_ECHO_S) {
    fadeTail(left, sampleRate, FADE_S);
    fadeTail(right, sampleRate, FADE_S);
  }
  return { left, right };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run src/lib/explore/echo.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git status --short
git add src/lib/explore/echo.ts src/lib/explore/echo.test.ts
git commit -q -m "$(cat <<'EOF'
feat: the room echo, from the fitted box's size

Eyring reverb time over fixed surfaces drives the moved tail generator; the
response is capped at 2 s and faded so a big room doesn't click.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/explore/echo.ts src/lib/explore/echo.test.ts
```

---

### Task 10: The voice clips

**Files:**
- Create: `src/lib/audio/wav.ts`, `src/lib/audio/wav.test.ts`, `scripts/make-voices.ts`, `src/lib/explore/voices.test.ts`, `public/voices/*.wav` (32 files)
- Modify: `package.json` (a `voices` script; `kokoro-js` as a dev dependency if it works), `package-lock.json`

**Interfaces:**
- Consumes: `CLIPS` (Task 3).
- Produces (in `@/lib/audio/wav`): `encodeWav(samples: Float32Array, sampleRate: number): Uint8Array`, `decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number }`, `trimSilence(samples, sampleRate, thresholdDb = -45, padSeconds = 0.01): Float32Array`.
- Produces: `public/voices/<clip id>.wav` for every key of `CLIPS`.

- [ ] **Step 1: Write the failing WAV test**

Create `src/lib/audio/wav.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeWav, encodeWav, trimSilence } from './wav';

/** A 16-bit PCM WAV with `channels` interleaved channels, built by hand. */
function wav(channels: number, sampleRate: number, frames: number[][]): Uint8Array {
  const data = frames.length * channels * 2;
  const v = new DataView(new ArrayBuffer(44 + data));
  const text = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + data, true); text(8, 'WAVE'); text(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * 2, true); v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, data, true);
  frames.flat().forEach((s, i) => v.setInt16(44 + 2 * i, s, true));
  return new Uint8Array(v.buffer);
}

describe('wav', () => {
  it('round-trips mono 16-bit samples', () => {
    const samples = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const back = decodeWav(encodeWav(samples, 16000));
    expect(back.sampleRate).toBe(16000);
    back.samples.forEach((s, i) => expect(s).toBeCloseTo(samples[i], 3));
  });

  it('mixes stereo down to mono', () => {
    const { samples, sampleRate } = decodeWav(wav(2, 22050, [[16384, 0], [-16384, -16384]]));
    expect(sampleRate).toBe(22050);
    expect(samples[0]).toBeCloseTo(0.25, 3);
    expect(samples[1]).toBeCloseTo(-0.5, 3);
  });

  it('refuses something that is not a WAV', () => {
    expect(() => decodeWav(new Uint8Array(64))).toThrow('Not a WAV file');
  });

  it('trims silence at both ends, keeping a little padding', () => {
    const s = new Float32Array(1000);
    s[400] = 0.5;
    s[500] = -0.3;
    const trimmed = trimSilence(s, 1000, -45, 0.01); // 10 samples of padding
    expect(trimmed.length).toBe(500 - 400 + 1 + 20);
    expect(trimmed[10]).toBe(0.5);
    expect(trimSilence(new Float32Array(100), 1000)).toHaveLength(0);
  });
});
```
Run `npx vitest run src/lib/audio/wav.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 2: Create `src/lib/audio/wav.ts`**

```ts
/** 16-bit PCM WAV, for the voice clips (spec 2026-10-08 §8.2). */

/** Mono 16-bit PCM WAV bytes for samples in [−1, 1]. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const data = samples.length * 2;
  const v = new DataView(new ArrayBuffer(44 + data));
  const text = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  v.setUint32(4, 36 + data, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, data, true);
  for (let i = 0; i < samples.length; i++) v.setInt16(44 + 2 * i, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return new Uint8Array(v.buffer);
}

/** The samples (mixed to mono) and rate of a 16-bit PCM WAV. Throws on anything else. */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (v.byteLength < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  for (let o = 12; o + 8 <= v.byteLength; ) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    const body = o + 8;
    if (id === 'fmt ') {
      format = v.getUint16(body, true);
      channels = v.getUint16(body + 2, true);
      sampleRate = v.getUint32(body + 4, true);
      bits = v.getUint16(body + 14, true);
    } else if (id === 'data') {
      if (format !== 1 || bits !== 16 || channels < 1) throw new Error('Only 16-bit PCM WAV is supported');
      const frames = Math.floor(Math.min(size, v.byteLength - body) / (2 * channels));
      const samples = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        let sum = 0;
        for (let c = 0; c < channels; c++) sum += v.getInt16(body + 2 * (i * channels + c), true);
        samples[i] = sum / channels / 32768;
      }
      return { samples, sampleRate };
    }
    o = body + size + (size % 2);
  }
  throw new Error('WAV file has no data');
}

/** Cut leading and trailing silence (at or below `thresholdDb` of full scale), keeping `padSeconds` either side. */
export function trimSilence(samples: Float32Array, sampleRate: number, thresholdDb = -45, padSeconds = 0.01): Float32Array {
  const threshold = 10 ** (thresholdDb / 20);
  const first = samples.findIndex((s) => Math.abs(s) > threshold);
  if (first === -1) return new Float32Array(0);
  let last = samples.length - 1;
  while (Math.abs(samples[last]) <= threshold) last--;
  const pad = Math.round(padSeconds * sampleRate);
  return samples.slice(Math.max(0, first - pad), Math.min(samples.length, last + pad + 1));
}
```
Run `npx vitest run src/lib/audio/wav.test.ts` — Expected: PASS.

- [ ] **Step 3: Write the failing clip test**

Create `src/lib/explore/voices.test.ts`:
```ts
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '@/lib/audio/wav';
import { CLIPS } from './names';

const VOICES = fileURLToPath(new URL('../../../public/voices/', import.meta.url));

describe('voice clips', () => {
  it('has a short, audible clip for every name, plural and wall', () => {
    for (const id of CLIPS.keys()) {
      const file = `${VOICES}${id}.wav`;
      expect(existsSync(file), id).toBe(true);
      const { samples, sampleRate } = decodeWav(new Uint8Array(readFileSync(file)));
      const seconds = samples.length / sampleRate;
      expect(seconds, id).toBeGreaterThan(0.1);
      expect(seconds, id).toBeLessThan(2);
      expect(samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0), id).toBeGreaterThan(0.05);
    }
  });
});
```
Run `npx vitest run src/lib/explore/voices.test.ts` — Expected: FAIL (no files).

- [ ] **Step 4: Create `scripts/make-voices.ts`**

```ts
/**
 * Records the voice clips into public/voices (spec 2026-10-08 §8.2). Run by hand, never during a build:
 *   npm run voices                      Kokoro, every clip
 *   npm run voices -- --sapi            Windows' built-in voice instead
 *   npm run voices -- --only=door,tvs   just these clips
 */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { decodeWav, encodeWav, trimSilence } from '@/lib/audio/wav';
import { CLIPS } from '@/lib/explore/names';

type Speak = (words: string) => Promise<{ samples: Float32Array; sampleRate: number }>;
type KokoroModule = {
  KokoroTTS: {
    from_pretrained(model: string, options: { dtype: string; device: string }): Promise<{
      generate(text: string, options: { voice: string }): Promise<{ audio: Float32Array; sampling_rate: number }>;
    }>;
  };
};

const OUT = path.join(process.cwd(), 'public', 'voices');
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICE = 'af_heart';

async function kokoro(): Promise<Speak> {
  const { KokoroTTS } = (await import('kokoro-js')) as unknown as KokoroModule;
  const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'cpu' });
  return async (words) => {
    const audio = await tts.generate(words, { voice: KOKORO_VOICE });
    return { samples: audio.audio, sampleRate: audio.sampling_rate };
  };
}

/** Windows' built-in voice through System.Speech, written to a temporary WAV. */
function sapi(): Speak {
  const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return async (words) => {
    const file = path.join(os.tmpdir(), `rr-voice-${process.pid}.wav`);
    const script = [
      'Add-Type -AssemblyName System.Speech',
      '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
      `$s.SetOutputToWaveFile(${quote(file)})`,
      `$s.Speak(${quote(words)})`,
      '$s.Dispose()',
    ].join('; ');
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    try {
      return decodeWav(new Uint8Array(await readFile(file)));
    } finally {
      await rm(file, { force: true });
    }
  };
}

// No top-level await: package.json has no "type": "module", so tsx runs this as CommonJS (like src/server/main.ts).
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',');
  const speak = args.includes('--sapi') ? sapi() : await kokoro();
  await mkdir(OUT, { recursive: true });
  for (const [id, words] of CLIPS) {
    if (only && !only.includes(id)) continue;
    const { samples, sampleRate } = await speak(words);
    const trimmed = trimSilence(samples, sampleRate);
    if (trimmed.length === 0) throw new Error(`"${words}" came out silent`);
    await writeFile(path.join(OUT, `${id}.wav`), encodeWav(trimmed, sampleRate));
    console.log(`${id}.wav  "${words}"  ${(trimmed.length / sampleRate).toFixed(2)} s`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```
Add to `package.json`'s `"scripts"`: `"voices": "tsx scripts/make-voices.ts",`

- [ ] **Step 5: Try Kokoro on one clip**

```bash
npm install -D kokoro-js
npm run voices -- --only=door
```
Expected: prints `door.wav  "door"  0.xx s` (the first run downloads the model, about 90 MB; it is free).

If the install or the run fails (a build error, an ONNX error, a crash), don't debug it for more than about 10 minutes. Instead:
```bash
npm uninstall kokoro-js
npm run voices -- --sapi --only=door
```
Expected: prints `door.wav  "door"  0.xx s`. If you fall back, change `scripts/make-voices.ts` so `--sapi` is the default and Kokoro is `--kokoro` (swap the condition in `main` to `args.includes('--kokoro') ? await kokoro() : sapi()`), and delete the `KokoroModule` type and `kokoro()` only if `tsc` complains about the missing module. Record which engine you used in the commit message.

- [ ] **Step 6: Record every clip**

Run `npm run voices` (plus `-- --sapi` if you fell back). Expected: 32 lines, one per clip, each under 2 s.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run src/lib/explore/voices.test.ts src/lib/audio/wav.test.ts` — Expected: PASS.
Run: `npx tsc --noEmit` and `npm run lint` — Expected: clean.

- [ ] **Step 8: Commit**

```bash
git status --short
git add src/lib/audio/wav.ts src/lib/audio/wav.test.ts scripts/make-voices.ts src/lib/explore/voices.test.ts public/voices package.json package-lock.json
git commit -q -m "$(cat <<'EOF'
feat: the 32 voice clips, recorded with <Kokoro | Windows' built-in voice>

npm run voices records each name, its plural and "wall" into public/voices,
trimmed of silence; a test checks every clip is there and audible.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/audio/wav.ts src/lib/audio/wav.test.ts scripts/make-voices.ts src/lib/explore/voices.test.ts public/voices package.json package-lock.json
```
(Replace `<Kokoro | Windows' built-in voice>` with the engine you used.)

---

### Task 11: Sounds, narrator and the spatial audio graph

**Files:**
- Create: `src/lib/audio/sounds.ts`, `src/lib/audio/sounds.test.ts`, `src/lib/audio/narrator.ts`, `src/lib/audio/narrator.test.ts`, `src/lib/audio/spatial.ts`

**Interfaces:**
- Consumes: `createRng` from `@/lib/acoustics/dsp`; `echoIr` (Task 9); `Dims`, `Vec3`.
- Produces (in `@/lib/audio/sounds`): `footstep(sr)`, `thud(sr)`, `pulse(sr)`, `chime(sr)` → `Float32Array`.
- Produces (in `@/lib/audio/narrator`): `NARRATOR_RATE = 1.05`, `pickVoice(voices)`, `createNarrator(speech, utter): { say(text: string): void; stop(): void }`.
- Produces (in `@/lib/audio/spatial`): `class SpatialAudio { static create(dims: Dims, clipIds: Iterable<string>, fetchFn?): Promise<SpatialAudio>; setListener(at: Vec3, heading: number): void; playClip(id: string, at: Vec3): Promise<void>; playThud(at: Vec3): Promise<void>; playPulse(at: Vec3): Promise<void>; playFootstep(): Promise<void>; playChime(): Promise<void>; stopAll(): void; dispose(): void }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/audio/sounds.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { chime, footstep, pulse, thud } from './sounds';

const SR = 16000;
const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('sounds', () => {
  for (const [name, make, seconds] of [
    ['footstep', footstep, 0.08],
    ['thud', thud, 0.25],
    ['pulse', pulse, 0.12],
    ['chime', chime, 0.6],
  ] as const) {
    it(`makes a ${name} that is audible and starts and ends in silence`, () => {
      const s = make(SR);
      expect(s.length).toBe(Math.round(seconds * SR));
      expect(s.every(Number.isFinite)).toBe(true);
      expect(peak(s)).toBeGreaterThan(0.1);
      expect(peak(s)).toBeLessThanOrEqual(1);
      expect(Math.abs(s[0])).toBeLessThan(1e-3);
      expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
    });
  }
});
```
Create `src/lib/audio/narrator.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { createNarrator, NARRATOR_RATE, pickVoice } from './narrator';

const voice = (lang: string, localService: boolean, name: string) => ({ lang, localService, name }) as SpeechSynthesisVoice;
const utter = (text: string) => ({ text }) as unknown as SpeechSynthesisUtterance;

describe('pickVoice', () => {
  it('prefers an English voice on this computer, then any English voice', () => {
    expect(pickVoice([voice('fr-FR', true, 'a'), voice('en-US', false, 'b'), voice('en-GB', true, 'c')])?.name).toBe('c');
    expect(pickVoice([voice('en-US', false, 'b')])?.name).toBe('b');
    expect(pickVoice([voice('fr-FR', true, 'a')])).toBeNull();
  });
});

describe('createNarrator', () => {
  it('cuts off the line being spoken and says the new one in the chosen voice', () => {
    const spoken: SpeechSynthesisUtterance[] = [];
    let cancels = 0;
    const speech = { speak: (u: SpeechSynthesisUtterance) => spoken.push(u), cancel: () => cancels++, getVoices: () => [voice('en-US', true, 'v')] };
    const narrator = createNarrator(speech, utter);
    narrator.say('Hello.');
    expect(cancels).toBe(1);
    expect(spoken[0]).toMatchObject({ text: 'Hello.', rate: NARRATOR_RATE, voice: { name: 'v' } });
    narrator.stop();
    expect(cancels).toBe(2);
  });

  it('stays quiet without speech synthesis', () => {
    expect(() => createNarrator(undefined, utter).say('Hello.')).not.toThrow();
  });
});
```
Run `npx vitest run src/lib/audio/sounds.test.ts src/lib/audio/narrator.test.ts` — Expected: FAIL (modules not found).

- [ ] **Step 2: Create `src/lib/audio/sounds.ts`**

```ts
import { createRng } from '@/lib/acoustics/dsp';

/** The sounds made in code (spec 2026-10-08 §8.3), as mono samples. */

const tone = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);

function normalize(s: Float32Array, peak: number): Float32Array {
  let max = 0;
  for (const v of s) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < s.length; i++) s[i] *= peak / max;
  return s;
}

/** A 2 ms raised-cosine fade at both ends, so nothing starts or stops with a click. */
function edges(s: Float32Array, sampleRate: number): Float32Array {
  const n = Math.min(Math.floor(s.length / 2), Math.round(0.002 * sampleRate));
  for (let i = 0; i < n; i++) {
    const g = 0.5 * (1 - Math.cos((Math.PI * i) / n));
    s[i] *= g;
    s[s.length - 1 - i] *= g;
  }
  return s;
}

function make(seconds: number, sampleRate: number, peak: number, sample: (t: number, i: number) => number): Float32Array {
  const s = new Float32Array(Math.round(seconds * sampleRate));
  for (let i = 0; i < s.length; i++) s[i] = sample(i / sampleRate, i);
  return edges(normalize(s, peak), sampleRate);
}

/** A footstep: a short low-passed noise burst. */
export function footstep(sampleRate: number): Float32Array {
  const rng = createRng(7);
  const a = Math.exp((-2 * Math.PI * 600) / sampleRate);
  let y = 0;
  return make(0.08, sampleRate, 0.5, (t) => {
    y = a * y + (1 - a) * (rng() * 2 - 1);
    return y * Math.exp(-t / 0.02);
  });
}

/** A thud: a low thump with a fast decay. */
export const thud = (sampleRate: number) => make(0.25, sampleRate, 0.8, (t) => tone(70, t) * Math.exp(-t / 0.05));

/** The go-to pulse: a short soft tone around 880 Hz. */
export const pulse = (sampleRate: number) => make(0.12, sampleRate, 0.5, (t) => tone(880, t) * Math.min(1, t / 0.005) * Math.exp(-t / 0.03));

/** Arrival: two rising tones. */
export const chime = (sampleRate: number) =>
  make(0.6, sampleRate, 0.6, (t) => tone(660, t) * Math.exp(-t / 0.12) + (t >= 0.15 ? tone(990, t - 0.15) * Math.exp(-(t - 0.15) / 0.15) : 0));
```

- [ ] **Step 3: Create `src/lib/audio/narrator.ts`**

```ts
/** The narrator: the browser's own speech, heard inside the head (spec 2026-10-08 §7.7). */
export const NARRATOR_RATE = 1.05;

export type SpeechLike = {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  getVoices(): SpeechSynthesisVoice[];
};

/** An English voice that runs on this computer (so the demo works offline), else any English voice. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return english.find((v) => v.localService) ?? english[0] ?? null;
}

/** `say` cuts off whatever is being said; without speech synthesis it does nothing and the captions carry the words. */
export function createNarrator(speech: SpeechLike | undefined, utter: (text: string) => SpeechSynthesisUtterance) {
  return {
    say(text: string): void {
      if (!speech) return;
      speech.cancel();
      const u = utter(text);
      const voice = pickVoice(speech.getVoices());
      if (voice) u.voice = voice;
      u.rate = NARRATOR_RATE;
      speech.speak(u);
    },
    stop(): void {
      speech?.cancel();
    },
  };
}
```
Run `npx vitest run src/lib/audio/sounds.test.ts src/lib/audio/narrator.test.ts` — Expected: PASS.

- [ ] **Step 4: Create `src/lib/audio/spatial.ts`** (browser only; checked by `tsc` here and by ear in Task 14)

```ts
import { echoIr } from '@/lib/explore/echo';
import type { Dims, Vec3 } from '@/lib/room/types';
import { chime, footstep, pulse, thud } from './sounds';

/** Starting levels, tuned in the headphone check (spec 2026-10-08 §8.1). */
export const ECHO_SEND_DB = -10;
export const ROLLOFF = 0.6;

const gainOf = (db: number) => 10 ** (db / 20);

/**
 * The explorer's sound (spec §8): clips, pulse and thud from their positions through HRTF panners, footsteps and chime in
 * the head, all through one light echo. Room metres throughout; the listener follows the explorer. Browser only.
 */
export class SpatialAudio {
  private readonly clips = new Map<string, AudioBuffer>();
  private readonly playing = new Set<AudioBufferSourceNode>();
  private readonly dry: GainNode;
  private readonly send: GainNode;
  private readonly sounds: Record<'footstep' | 'thud' | 'pulse' | 'chime', AudioBuffer>;

  /** Call from a click: the AudioContext must start inside a user gesture. Rejects if any clip can't be loaded. */
  static async create(
    dims: Dims,
    clipIds: Iterable<string>,
    fetchFn: (url: string) => Promise<Response> = (url) => fetch(url),
  ): Promise<SpatialAudio> {
    const ctx = new AudioContext();
    const resumed = ctx.resume();
    try {
      const audio = new SpatialAudio(ctx, dims);
      await Promise.all([
        resumed,
        ...[...clipIds].map(async (id) => {
          const res = await fetchFn(`/voices/${id}.wav`);
          if (!res.ok) throw new Error(`Voice clip ${id}: HTTP ${res.status}`);
          audio.clips.set(id, await ctx.decodeAudioData(await res.arrayBuffer()));
        }),
      ]);
      return audio;
    } catch (error) {
      void ctx.close();
      throw error;
    }
  }

  private constructor(
    private readonly ctx: AudioContext,
    dims: Dims,
  ) {
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(master);
    const ir = echoIr(dims, ctx.sampleRate);
    const echo = ctx.createBuffer(2, ir.left.length, ctx.sampleRate);
    echo.copyToChannel(ir.left, 0);
    echo.copyToChannel(ir.right, 1);
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = echo;
    convolver.connect(master);
    this.send = ctx.createGain();
    this.send.gain.value = gainOf(ECHO_SEND_DB);
    this.send.connect(convolver);
    const buffer = (samples: Float32Array) => {
      const b = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      b.copyToChannel(samples, 0);
      return b;
    };
    const rate = ctx.sampleRate;
    this.sounds = { footstep: buffer(footstep(rate)), thud: buffer(thud(rate)), pulse: buffer(pulse(rate)), chime: buffer(chime(rate)) };
  }

  /** The ears: at `at`, facing `heading` (room metres, atan2 of z over x), head upright. */
  setListener(at: Vec3, heading: number): void {
    const l = this.ctx.listener;
    const [fx, fz] = [Math.cos(heading), Math.sin(heading)];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(at.x, t);
      l.positionY.setValueAtTime(at.y, t);
      l.positionZ.setValueAtTime(at.z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(0, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(at.x, at.y, at.z); // older browsers
      l.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  /** A name from a point in the room; resolves when it has finished (or straight away for an unknown clip). */
  playClip(id: string, at: Vec3): Promise<void> {
    const clip = this.clips.get(id);
    return clip ? this.play(clip, at) : Promise.resolve();
  }

  playThud = (at: Vec3): Promise<void> => this.play(this.sounds.thud, at);
  playPulse = (at: Vec3): Promise<void> => this.play(this.sounds.pulse, at);
  playFootstep = (): Promise<void> => this.play(this.sounds.footstep, null);
  playChime = (): Promise<void> => this.play(this.sounds.chime, null);

  stopAll(): void {
    for (const source of [...this.playing]) source.stop();
  }

  dispose(): void {
    this.stopAll();
    void this.ctx.close();
  }

  private play(buffer: AudioBuffer, at: Vec3 | null): Promise<void> {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    let out: AudioNode = source;
    if (at) {
      const panner = new PannerNode(this.ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        rolloffFactor: ROLLOFF,
        positionX: at.x,
        positionY: at.y,
        positionZ: at.z,
      });
      source.connect(panner);
      out = panner;
    }
    out.connect(this.dry);
    out.connect(this.send);
    this.playing.add(source);
    return new Promise((resolve) => {
      source.onended = () => {
        this.playing.delete(source);
        out.disconnect();
        resolve();
      };
      source.start();
    });
  }
}
```

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint` — Expected: clean.
```bash
git status --short
git add src/lib/audio/sounds.ts src/lib/audio/sounds.test.ts src/lib/audio/narrator.ts src/lib/audio/narrator.test.ts src/lib/audio/spatial.ts
git commit -q -m "$(cat <<'EOF'
feat: the explorer's sound: HRTF voices, made-in-code sounds, narrator

Clips, pulse and thud play from their room positions through head-shaped panning;
footsteps and chime stay in the head; everything goes through the room echo.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/audio/sounds.ts src/lib/audio/sounds.test.ts src/lib/audio/narrator.ts src/lib/audio/narrator.test.ts src/lib/audio/spatial.ts
```

---

### Task 12: Viewer hooks for explore mode, and named, highlightable labels

**Files:**
- Modify: `src/lib/viewer/ViewerScene.ts`, `src/lib/viewer/LabelsOverlay.ts`

**Interfaces:**
- Consumes: `nameInfo` (Task 3).
- Produces:
  - `ViewerScene.setExploring(on: boolean): void` — its own controls (spin, fly keys, pointer-lock look, placement) stop while on.
  - `ViewerScene.setPose(position: THREE.Vector3, forward: THREE.Vector3): void` — world coordinates; the camera stands there looking along `forward`.
  - `LabelsOverlay.setObjects(objects)` shows each name's title; `LabelsOverlay.setHighlight(index: number | null): void` turns one chip teal.

- [ ] **Step 1: Add explore mode to `ViewerScene`**

In `src/lib/viewer/ViewerScene.ts`:
- Change the `overlay` comment to `/** Things drawn in the room (the object labels), in world coordinates. */` and the `onFrame` comment to `/** Called every frame before rendering (explore mode's pulse). */`.
- Add the field `private exploring = false;` under `private disposed = false;`.
- Add these methods after `armPlacement`:
```ts
  /** Explore mode (spec 2026-10-08 §7.1): the viewer's own controls stop, and the camera follows setPose. */
  setExploring(on: boolean): void {
    this.exploring = on;
    this.keys.clear();
    this.placing = null;
    this.canvas.style.cursor = '';
    if (on && this.locked) document.exitPointerLock();
    this.controls.enabled = !on && !this.locked;
  }

  /** Stand the camera at `position`, looking along `forward` (world coordinates). */
  setPose(position: THREE.Vector3, forward: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.controls.target.copy(position).addScaledVector(forward, this.targetDistance);
    this.camera.lookAt(this.controls.target);
  }
```
- At the top of the `click` handler body, before `const from = this.pressedAt;`, add `if (this.exploring) return;`
- In `lockChanged`, replace `this.controls.enabled = !locked; // no spinning while looking around` with `this.controls.enabled = !locked && !this.exploring; // no spinning while looking around or exploring`
- In `keyDown`, replace `if (event.ctrlKey || event.metaKey || event.altKey) return;` with `if (this.exploring || event.ctrlKey || event.metaKey || event.altKey) return;`

- [ ] **Step 2: Name and highlight the labels**

In `src/lib/viewer/LabelsOverlay.ts`:
- Add `import { nameInfo } from '@/lib/explore/names';` to the imports.
- Replace `el.textContent = o.label;` with `el.textContent = nameInfo(o.label).title;`
- Add after `setObjects`:
```ts
  /** One chip in teal: the row the helper points at, or the explorer's target (spec §9). */
  setHighlight(index: number | null): void {
    this.labels.forEach((label, i) => {
      label.element.className = chipClass(i === index);
    });
  }
```

- [ ] **Step 3: Verify and commit**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npx next build` — Expected: clean.
```bash
git status --short
git add src/lib/viewer/ViewerScene.ts src/lib/viewer/LabelsOverlay.ts
git commit -q -m "$(cat <<'EOF'
feat: the viewer hands the camera to explore mode; labels show names

setExploring stops spin, fly keys, look and placement; setPose stands the camera
where the explorer is. Labels show each name and can highlight one in teal.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/viewer/ViewerScene.ts src/lib/viewer/LabelsOverlay.ts
```

---

### Task 13: Check and explore in the viewer

**Files:**
- Create: `src/lib/viewer/ExploreController.ts`, `src/components/ExplorePanel.tsx`
- Modify: `src/components/SplatViewer.tsx`, `src/components/RoomsHome.tsx`, `src/app/layout.tsx`

**Interfaces:**
- Consumes: everything above — `fitRoom`, `toRoom`, `toWorld`, `roomYaw`, `placeObjects`, `fetchChecked`, `fetchDetections`, `saveChecked`, `addObject`, `removeObject`, `renameObject`, `sortObjects`, `createRepeater`, `CLIPS`, `pulseInterval`, `act`, `startSession`, `pulseTarget`, `earPosition`, `SpatialAudio`, `createNarrator`, `LabelsOverlay`, `ViewerScene.setExploring/setPose/armPlacement/startView/splatCentres/onFrame/overlay`.
- Produces: `class ExploreController` with `static create(scene, roomId, cameras): ExploreController | null`, `subscribe`, `getState(): ExploreState`, `rename(index, label)`, `remove(index)`, `add()`, `setHighlight(index | null)`, `startExploring(): Promise<void>`, `stopExploring()`, `dispose()`; and `ExplorePanel({ controller })`.

- [ ] **Step 1: Read the Next.js guide for client components**

Skim the client-components and metadata guides under `node_modules/next/dist/docs/` (AGENTS.md). This task only edits `'use client'` components and a `metadata` string, both in the existing patterns.

- [ ] **Step 2: Create `src/lib/viewer/ExploreController.ts`**

```ts
import * as THREE from 'three';
import { createNarrator } from '@/lib/audio/narrator';
import { SpatialAudio } from '@/lib/audio/spatial';
import { pulseInterval } from '@/lib/explore/beacon';
import { addObject, removeObject, renameObject, sortObjects } from '@/lib/explore/checked';
import { createRepeater } from '@/lib/explore/keys';
import { CLIPS, type NameId } from '@/lib/explore/names';
import type { ScanItem } from '@/lib/explore/scan';
import { act, earPosition, pulseTarget, startSession, type Action, type Effect, type Session } from '@/lib/explore/session';
import type { Dims, RoomObject, Vec3 } from '@/lib/room/types';
import { placeObjects } from '@/lib/sound/placeObjects';
import { fitRoom, roomYaw, toRoom, toWorld } from '@/lib/sound/roomFit';
import type { RoomFit } from '@/lib/sound/types';
import { fetchChecked, fetchDetections, saveChecked } from '@/lib/splatJobs/client';
import type { CameraPose } from '@/lib/splatJobs/protocol';
import { LabelsOverlay } from './LabelsOverlay';
import type { ViewerScene } from './ViewerScene';

export const SCAN_GAP_MS = 250; // between scan clips (spec §7.4)

export type ExploreState = {
  dims: Dims;
  objects: 'finding' | RoomObject[];
  findFailed: boolean;
  adding: boolean;
  saveFailed: boolean;
  highlight: number | null;
  mode: 'check' | 'starting' | 'exploring';
  voicesFailed: boolean;
  caption: string;
  /** The row whose name select should take focus: a just-added or just-renamed object. */
  focus: number | null;
};

const vec = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Check mode and explore mode in the splat viewer (spec 2026-10-08 §6–9). Browser only; decisions live in lib/explore. */
export class ExploreController {
  private state: ExploreState;
  private readonly listeners = new Set<() => void>();
  private readonly overlay: LabelsOverlay;
  private readonly narrator = createNarrator(
    typeof speechSynthesis === 'undefined' ? undefined : speechSynthesis,
    (text) => new SpeechSynthesisUtterance(text),
  );
  private readonly repeater = createRepeater((action) => this.perform(action));
  private audio: SpatialAudio | null = null;
  private session: Session | null = null;
  private runToken = 0; // a newer action's sounds replace an older one's that are still queued
  private scanToken = 0; // a new scan replaces the one playing
  private lastPulse = 0;
  private disposed = false;

  /** Null without a cameras file or splat points: no scale, so no room box (spec §12). */
  static create(scene: ViewerScene, roomId: string, cameras: CameraPose[] | null): ExploreController | null {
    const view = scene.startView;
    const raw = scene.splatCentres;
    if (!view || !cameras?.length || raw.length === 0) return null;
    const q = view.rotation;
    const upright = new Float32Array(raw.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < raw.length; i += 3) {
      v.set(raw[i], raw[i + 1], raw[i + 2]).applyQuaternion(q);
      [upright[i], upright[i + 1], upright[i + 2]] = [v.x, v.y, v.z];
    }
    const fit = fitRoom(upright, cameras.map((c) => vec(new THREE.Vector3(...c.position).applyQuaternion(q))));
    return new ExploreController(scene, roomId, cameras, raw, q, fit);
  }

  private constructor(
    private readonly scene: ViewerScene,
    private readonly roomId: string,
    cameras: CameraPose[],
    raw: Float32Array,
    rotation: THREE.Quaternion,
    private readonly fit: RoomFit,
  ) {
    this.overlay = new LabelsOverlay(fit);
    scene.overlay.add(this.overlay.root);
    this.state = {
      dims: fit.dims,
      objects: 'finding',
      findFailed: false,
      adding: false,
      saveFailed: false,
      highlight: null,
      mode: 'check',
      voicesFailed: false,
      caption: '',
      focus: null,
    };
    scene.onFrame = this.frame;
    void this.load(cameras, raw, rotation);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getState = (): ExploreState => this.state;

  // ── Check mode (spec §6) ──

  rename(index: number, label: NameId): void {
    if (this.state.mode !== 'check') return;
    const r = renameObject(this.objects, index, label);
    this.setObjects(r.objects, true);
    this.set({ focus: r.index });
  }

  remove(index: number): void {
    if (this.state.mode !== 'check') return;
    this.setObjects(removeObject(this.objects, index), true);
    this.set({ focus: null });
  }

  add(): void {
    if (this.state.mode !== 'check' || this.state.objects === 'finding') return;
    this.set({ adding: true });
    this.scene.armPlacement(this.fit.floorY, (world) => {
      if (this.disposed || this.state.mode !== 'check') return;
      const at = toRoom(this.fit, vec(world));
      const r = addObject(this.objects, 'door', at);
      this.setObjects(r.objects, true);
      this.set({ adding: false, focus: r.index });
    });
  }

  setHighlight(index: number | null): void {
    if (this.state.mode !== 'check') return;
    this.overlay.setHighlight(index);
    this.set({ highlight: index });
  }

  // ── Explore mode (spec §7–8) ──

  async startExploring(): Promise<void> {
    if (this.state.mode !== 'check' || this.state.objects === 'finding') return;
    (document.activeElement as HTMLElement | null)?.blur?.(); // Space or Enter must not click a focused button
    this.set({ mode: 'starting', voicesFailed: false, adding: false });
    let audio: SpatialAudio;
    try {
      audio = await SpatialAudio.create(this.fit.dims, CLIPS.keys()); // its AudioContext starts inside this click
    } catch (error) {
      console.error(error);
      return this.set({ mode: 'check', voicesFailed: true });
    }
    const view = this.scene.startView;
    if (this.disposed || this.state.mode !== 'starting' || !view) return audio.dispose();
    this.audio = audio;
    const p = toRoom(this.fit, vec(view.position));
    const start = startSession(this.fit.dims, this.objects, { x: p.x, z: p.z, heading: roomYaw(this.fit, vec(view.forward)) });
    this.session = start.session;
    this.lastPulse = 0;
    this.scene.setExploring(true);
    this.overlay.setHighlight(null);
    this.followPose();
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.releaseKeys);
    this.set({ mode: 'exploring', caption: '', highlight: null });
    void this.run(start.effects, ++this.runToken);
  }

  stopExploring(): void {
    if (this.state.mode !== 'exploring') return;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.releaseKeys);
    this.repeater.releaseAll();
    this.runToken++;
    this.scanToken++;
    this.narrator.stop();
    this.audio?.dispose();
    this.audio = null;
    this.session = null;
    this.scene.setExploring(false);
    this.overlay.setHighlight(null);
    this.set({ mode: 'check', caption: '' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.stopExploring();
    this.disposed = true;
    if (this.scene.onFrame === this.frame) this.scene.onFrame = null;
    this.audio?.dispose();
    this.overlay.dispose();
    this.listeners.clear();
  }

  private get objects(): RoomObject[] {
    return Array.isArray(this.state.objects) ? this.state.objects : [];
  }

  /** The checked list if the helper saved one; otherwise the objects found in the video (spec §6). */
  private async load(cameras: CameraPose[], raw: Float32Array, rotation: THREE.Quaternion): Promise<void> {
    const checked = await fetchChecked(this.roomId);
    if (this.disposed) return;
    if (checked) return this.setObjects(sortObjects(checked), false);
    const file = await fetchDetections(this.roomId);
    if (this.disposed) return;
    if (!file) {
      this.set({ findFailed: true });
      return this.setObjects([], false);
    }
    const toRoomPoint = (x: number, y: number, z: number) => toRoom(this.fit, vec(new THREE.Vector3(x, y, z).applyQuaternion(rotation)));
    this.setObjects(sortObjects(placeObjects(file, cameras, raw, toRoomPoint, this.fit.scale)), false);
  }

  private setObjects(objects: RoomObject[], save: boolean): void {
    this.overlay.setObjects(objects);
    this.set({ objects, highlight: null });
    if (save) void saveChecked(this.roomId, objects).then((ok) => this.set({ saveFailed: !ok }));
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    if (this.repeater.press(event)) event.preventDefault();
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.repeater.release(event.code);
  };

  private readonly releaseKeys = () => {
    this.repeater.releaseAll();
  };

  private perform(action: Action): void {
    if (!this.session) return;
    const { session, effects } = act(this.session, action);
    const moved = session.pose !== this.session.pose;
    this.session = session;
    if (moved) this.followPose();
    this.overlay.setHighlight(session.chosen);
    if (effects.length > 0) void this.run(effects, ++this.runToken);
  }

  /** Effects in order: a clip or thud finishes before what follows it (a bump's name, a target's line). */
  private async run(effects: Effect[], token: number): Promise<void> {
    for (const e of effects) {
      const audio = this.audio;
      if (!audio || token !== this.runToken) return;
      if (e.kind === 'say') {
        this.narrator.say(e.text);
        this.set({ caption: e.text });
      } else if (e.kind === 'clip') await audio.playClip(e.clip, e.at);
      else if (e.kind === 'thud') await audio.playThud(e.at);
      else if (e.kind === 'footstep') void audio.playFootstep();
      else if (e.kind === 'chime') void audio.playChime();
      else void this.playScan(e.items);
    }
  }

  /** Each scan name from its place, 0.25 s apart, added to the caption as it plays; moving doesn't stop it. */
  private async playScan(items: ScanItem[]): Promise<void> {
    const token = ++this.scanToken;
    const said: string[] = [];
    for (const item of items) {
      if (token !== this.scanToken || !this.audio) return;
      said.push(item.caption);
      this.set({ caption: said.join(' · ') });
      await this.audio.playClip(item.clip, item.at);
      await new Promise((resolve) => setTimeout(resolve, SCAN_GAP_MS));
    }
  }

  /** The camera and the ears follow the explorer: room metres → world, heading → a world direction. */
  private followPose(): void {
    if (!this.session) return;
    const ear = earPosition(this.session);
    const world = toWorld(this.fit, ear);
    const h = this.session.pose.heading + this.fit.yaw; // a room direction (cos θ, sin θ) is (cos(θ + yaw), sin(θ + yaw)) in world
    this.scene.setPose(new THREE.Vector3(world.x, world.y, world.z), new THREE.Vector3(Math.cos(h), 0, Math.sin(h)));
    this.audio?.setListener(ear, this.session.pose.heading);
  }

  /** Every frame while going somewhere: the pulse, faster as you close in (spec §7.5). */
  private readonly frame = (): void => {
    if (!this.session || !this.audio) return;
    const target = pulseTarget(this.session);
    if (!target) return;
    const now = performance.now() / 1000;
    if (now - this.lastPulse < pulseInterval(target.distance)) return;
    this.lastPulse = now;
    void this.audio.playPulse(target.at);
  };

  private set(patch: Partial<ExploreState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
}
```

- [ ] **Step 3: Create `src/components/ExplorePanel.tsx`**

```tsx
'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { nameInfo, NAMES, type NameId } from '@/lib/explore/names';
import type { RoomObject } from '@/lib/room/types';
import type { ExploreController } from '@/lib/viewer/ExploreController';

const KEYS_LINE = 'W S walk · A D turn · Space scan · Tab choose · Enter go · Esc stop · H help';
const PANEL = 'absolute right-0 top-0 m-4 flex max-h-[calc(100%-2rem)] w-[300px] max-w-[calc(100%-2rem)] flex-col gap-4 overflow-y-auto rounded-card border border-cork bg-walnut/80 p-5 sm:m-6';

/** "Chair 1", "Chair 2": each object's number among those with its name. */
function numbering(objects: RoomObject[]): number[] {
  const seen = new Map<string, number>();
  return objects.map((o) => {
    const n = (seen.get(o.label) ?? 0) + 1;
    seen.set(o.label, n);
    return n;
  });
}

/** The panel top right of the viewer, and the captions while exploring (spec 2026-10-08 §9). */
export function ExplorePanel({ controller }: { controller: ExploreController }) {
  const s = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const selects = useRef<(HTMLSelectElement | null)[]>([]);
  useEffect(() => {
    if (s.focus !== null) selects.current[s.focus]?.focus();
  }, [s.focus, s.objects]);

  if (s.mode === 'exploring') {
    return (
      <>
        <aside className={PANEL}>
          <h2 className="text-heading-sm">Exploring</h2>
          <p className="text-label text-cream/70">{KEYS_LINE}</p>
          <button className="ghost" onClick={() => controller.stopExploring()}>
            Stop exploring
          </button>
        </aside>
        <p aria-live="polite" className="voice pointer-events-none absolute inset-x-0 bottom-0 mx-auto max-w-3xl p-6 text-center text-body">
          {s.caption}
        </p>
      </>
    );
  }

  const objects = Array.isArray(s.objects) ? s.objects : [];
  const numbers = numbering(objects);
  return (
    <aside className={PANEL}>
      <section className="flex flex-col gap-1.5">
        <h2 className="text-heading-sm">Room</h2>
        <p className="text-label text-cream/70">
          About {s.dims.length.toFixed(1)} × {s.dims.width.toFixed(1)} × {s.dims.height.toFixed(1)} m
        </p>
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <span className="text-label">Objects</span>
        {s.objects === 'finding' && <p className="voice text-label text-cream/70">Finding objects… (about 20 seconds the first time)</p>}
        {s.findFailed && <p className="voice text-label text-cream/70">Couldn&apos;t find objects. Add them by hand.</p>}
        <ul className="flex flex-col gap-2">
          {objects.map((o, i) => {
            const name = `${nameInfo(o.label).title} ${numbers[i]}`;
            return (
              <li
                key={`${i}-${o.label}`}
                className="flex items-center gap-2"
                onMouseEnter={() => controller.setHighlight(i)}
                onMouseLeave={() => controller.setHighlight(null)}
                onFocus={() => controller.setHighlight(i)}
                onBlur={() => controller.setHighlight(null)}
              >
                <span className="w-6 text-label text-cream/70">{numbers[i]}</span>
                <select
                  ref={(el) => {
                    selects.current[i] = el;
                  }}
                  aria-label={`Name of ${name}`}
                  value={o.label}
                  onChange={(e) => controller.rename(i, e.target.value as NameId)}
                  className="min-h-11 min-w-0 flex-1 rounded-card border border-cork bg-walnut px-3 text-label"
                >
                  {NAMES.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.title}
                    </option>
                  ))}
                </select>
                <button className="ghost" onClick={() => controller.remove(i)} aria-label={`Remove ${name}`}>
                  Remove
                </button>
              </li>
            );
          })}
        </ul>
        <button className="ghost" onClick={() => controller.add()} disabled={s.adding || s.objects === 'finding'}>
          Add an object
        </button>
        {s.adding && <p className="voice text-label text-cream/70">Click the floor where it is.</p>}
        {s.saveFailed && <p className="voice text-label text-cream/70">Couldn&apos;t save your changes.</p>}
      </section>

      <section className="rule flex flex-col gap-3 pt-4">
        <button className="pill" onClick={() => void controller.startExploring()} disabled={s.objects === 'finding' || s.mode === 'starting'}>
          Start exploring
        </button>
        {s.voicesFailed && <p className="voice text-label text-cream/70">Couldn&apos;t load the voices.</p>}
        <p className="voice text-label text-cream/70">Use headphones.</p>
      </section>
    </aside>
  );
}
```

- [ ] **Step 4: Replace `src/components/SplatViewer.tsx`**

```tsx
'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { downloadSplat, fetchCameras } from '@/lib/splatJobs/client';
import { ExploreController } from '@/lib/viewer/ExploreController';
import { ViewerScene } from '@/lib/viewer/ViewerScene';
import { Arrow } from './Arrow';
import { ExplorePanel } from './ExplorePanel';
import { markWebGLUnavailable, useWebGL } from './useWebGL';

/** The controls, as keycap and what it does. */
const HINTS: readonly [string, string][] = [
  ['Drag', 'Spin'],
  ['Scroll', 'Zoom'],
  ['W A S D', 'Move'],
  ['Q / E', 'Down / up'],
  ['Click', 'Look around'],
  ['Esc', 'Stop looking'],
];
type Status = 'loading' | 'ready' | 'error';

/** One room, full screen (spec 2026-10-07 §4), with check and explore modes (spec 2026-10-08 §6–9). */
export function SplatViewer({ roomId, title, onBack }: { roomId: string; title?: string; onBack: () => void }) {
  const webgl = useWebGL();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [explore, setExplore] = useState<ExploreController | null>(null);
  // Another room: back to loading (set during render, not in an effect).
  const [shownRoom, setShownRoom] = useState(roomId);
  if (shownRoom !== roomId) {
    setShownRoom(roomId);
    setStatus('loading');
    setExplore(null);
  }
  const subscribe = useCallback((listener: () => void) => explore?.subscribe(listener) ?? (() => {}), [explore]);
  const exploring = useSyncExternalStore(subscribe, () => explore?.getState().mode === 'exploring', () => false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!webgl || !canvas) return;
    let scene: ViewerScene;
    try {
      scene = new ViewerScene(canvas);
    } catch (error) {
      console.error(error);
      markWebGLUnavailable(); // re-renders to the "can't show 3D" line through the store
      return;
    }
    const observer = new ResizeObserver(([entry]) => scene.resize(entry.contentRect.width, entry.contentRect.height));
    observer.observe(canvas);
    let live = true;
    let controller: ExploreController | null = null;
    void Promise.all([downloadSplat(roomId), fetchCameras(roomId)])
      .then(async ([file, cameras]) => {
        const bytes = await file.arrayBuffer();
        if (!live) return;
        await scene.open(bytes, cameras);
        if (!live) return;
        setStatus('ready');
        try {
          controller = ExploreController.create(scene, roomId, cameras);
          setExplore(controller);
        } catch (error) {
          console.error(error); // the room stays viewable without the panel
        }
      })
      .catch((error: unknown) => {
        console.error(error);
        if (live) setStatus('error');
      });
    return () => {
      live = false;
      observer.disconnect();
      controller?.dispose();
      scene.dispose();
    };
  }, [webgl, roomId]);

  const message = !webgl
    ? "This browser can't show 3D."
    : status === 'loading'
      ? 'Loading your room'
      : status === 'error'
        ? "Couldn't load this room."
        : '';

  return (
    <div className="darkroom fixed inset-0 z-50">
      {webgl && (
        <canvas
          ref={canvasRef}
          className={`block h-full w-full ${status === 'ready' ? 'motion-safe:animate-[develop_1.8s_var(--ease-develop)_both]' : 'opacity-0'}`}
          aria-label="Your room in 3D"
        />
      )}
      {/* Shade under the chrome so cream type reads over a bright room. Not decoration: it is where the labels sit. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-linear-to-b from-walnut/85 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-walnut/85 to-transparent" />

      <header className="absolute left-0 top-0 flex items-center gap-5 p-4 sm:p-6">
        <button onClick={onBack} className="ghost">
          <Arrow to="left" />
          Back
        </button>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-ui">Hearify</span>
          {title && <span className="truncate text-label text-cream/70">{title}</span>}
        </div>
      </header>

      {message && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
          <div className="flex w-72 max-w-full flex-col gap-4">
            <p role="status" className="text-heading-sm">
              {message}
            </p>
            {status === 'loading' && webgl && (
              <div aria-hidden className="h-px w-full overflow-hidden bg-cork">
                <div className="h-full w-1/3 bg-cream motion-safe:animate-[indeterminate_1.6s_ease-in-out_infinite]" />
              </div>
            )}
          </div>
        </div>
      )}

      {status === 'ready' && webgl && !exploring && (
        <ul
          aria-label="Controls"
          className="pointer-events-none absolute bottom-0 left-0 flex max-w-full flex-wrap gap-x-5 gap-y-3 p-4 text-label sm:p-6 lg:max-w-[62%]"
        >
          {HINTS.map(([key, does]) => (
            <li key={key} className="flex items-center gap-2">
              <kbd className="rounded-full border border-cream/60 px-2.5 py-1.5 font-[inherit] text-micro">{key}</kbd>
              <span>{does}</span>
            </li>
          ))}
        </ul>
      )}

      {status === 'ready' && webgl && explore && <ExplorePanel controller={explore} />}
    </div>
  );
}
```

- [ ] **Step 5: Change the home page line and the page description**

In `src/components/RoomsHome.tsx`, replace `Import a video of your room and walk around it in 3D.` with `Film a place once. Someone who can&apos;t see it can explore it by sound.`

In `src/app/layout.tsx`, replace `description: 'Import a video of your room and walk around it in 3D.',` with `description: "Film a place once. Someone who can't see it can explore it by sound.",`

- [ ] **Step 6: Verify**

Run: `npx vitest run` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: no errors.
Run: `npm run lint` — Expected: no errors, no new warnings.
Run: `npx next build` — Expected: success.

- [ ] **Step 7: Commit**

```bash
git status --short
git add src/lib/viewer/ExploreController.ts src/components/ExplorePanel.tsx src/components/SplatViewer.tsx src/components/RoomsHome.tsx src/app/layout.tsx
git commit -q -m "$(cat <<'EOF'
feat: check the objects, then explore the room by sound

The viewer opens in check mode (rename, remove, add, saved on the laptop); Start
exploring hands the keyboard and camera to the explorer, with captions on screen.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- src/lib/viewer/ExploreController.ts src/components/ExplorePanel.tsx src/components/SplatViewer.tsx src/components/RoomsHome.tsx src/app/layout.tsx
```

---

### Task 14: Docs, the real check and the follow-ups (controller)

The controller runs this task: subagents can't drive the browser here.

**Files:**
- Modify: `PRODUCT.md`, `DESIGN.md`, possibly `src/server/detect.ts` (the door threshold)
- Create: `docs/superpowers/plans/2026-10-09-hearify-plan-9-followups.md`

- [ ] **Step 1: Rewrite `PRODUCT.md`**

```markdown
# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Hackathon judges watching the maker demo Hearify live on a laptop. The story has two people: a sighted helper who films a place, and a blind or low-vision explorer who rehearses it by sound before going. In the demo, a blindfolded judge plays the explorer.

## Product Purpose

Rehearse a place by sound. A helper films one slow lap of a room on a phone; the laptop turns the video into a 3D room and finds what matters for getting around: doors, stairs, chairs, tables and the rest. The helper checks the list. The explorer then walks the room on headphones and the keyboard: each object says its name from where it really is, Space sweeps the room clockwise, and Tab and Enter choose a place and lead there with a pulse. Success: a blindfolded judge explores for two minutes, then walks to the real door.

## Positioning

Built entirely on the maker's laptop from one video, with free, open-source tools: ffmpeg, COLMAP, OpenSplat, OWL-ViT and a free speech model, shown with Spark in the browser. No paid service and no cloud.

## Operating Context

- Runs on the maker's laptop (`npm run demo`, port 8080).
- One page: `/` holds the import (Quick about 5 minutes, Best about half an hour), the build's progress, the list of finished rooms, and a full-screen viewer at `#room=<id>`.
- Viewer, check mode: the found objects, with rename, remove and add; Start exploring.
- Viewer, explore mode: W/S step, A/D turn, Space scan, Tab choose, Enter go, Esc stop, H help. Headphones.

## Capabilities and Constraints

- Input is video only; the pipeline can't use a single photo.
- Free and open-source only: never a paid tool, font or service.
- Distances are approximate: the scale assumes the phone was held 1.5 m up.
- For rehearsal before a visit, not navigation on the day. It doesn't replace a cane or a guide.
- No blind person has tried it yet. Don't claim it helps blind people until one has.
- The desktop browser on the laptop is the main surface.

## Brand Commitments

- Name: Hearify.
- Visual world pinned by the user on 2026-10-07: the ORYZO darkroom product-editorial style (warm dark canvas, cream uppercase type, one ember accent for credit lines only). See DESIGN.md.

## Evidence on Hand

- The rooms the maker has built on this laptop (served by the local server at `/api/splat/rooms`).
- No testimonials, metrics, users or press exist. Do not invent any.

## Product Principles

- Sound first: everything the explorer needs is heard; the screen is for onlookers.
- Every claim is true of this laptop and this pipeline.
- A wrong label misleads someone who can't see it, so the helper checks the list.
- The demo must read in seconds to someone watching over the maker's shoulder.
```

- [ ] **Step 2: Update `DESIGN.md` for the new viewer**

Make these replacements (exact old text → new text):
- `description: Import a video of your room and walk around it in 3D.` → `description: Film a place once. Someone who can't see it can explore it by sound.`
- The three front-matter lines `data-absorbs: "#5fd4c4"`, `data-reflects: "#f0a540"`, `data-best: "#3ddc84"` → the single line `data-target: "#5fd4c4"`
- In the Overview, `the full-screen viewer and its sound panel. The hidden acoustics pages (/room, /setup, /about) are out of scope and keep their older look on purpose.` → `the full-screen viewer, its explore panel and its captions.`
- `80% for the sound panel and 3D chips` → `80% for the explore panel and 3D chips`
- Replace the whole `### Data (viewer sound overlay only)` section (its heading and four bullets) with:
```markdown
### Data (viewer labels only)
- **Target Teal** (#5fd4c4): the one highlighted 3D chip: the row the helper points at in check mode, or the explorer's current target.
```
- `**The Data-Only Hues Rule.** Teal, amber and green encode acoustic data in the viewer. They never color chrome, buttons or headings, and never appear on the home page.` → `**The Data-Only Hue Rule.** Teal marks the highlighted object in the viewer. It never colors chrome, buttons or headings, and never appears on the home page.`
- `the viewer's loading message, the sound panel's heading.` → `the viewer's loading message, the explore panel's headings.`
- `key hints, the sound panel's section names and readouts.` → `key hints, the explore panel's section names and readouts.`
- `The sound panel's terse help lines drop it to 12px.` → `The explore panel's terse help lines drop it to 12px; the explore captions use it at body size.`
- `and the 300px sound panel top right.` → `the 300px explore panel top right, and the captions bottom centre while exploring.`
- `the hero's cards, the sound panel, the 3D chips.` → `the hero's cards, the explore panel, the 3D chips.`
- `The sound panel moves its single pill to whichever step comes next (Place speaker, then Play).` → `The explore panel's single pill is Start exploring.`
- `Cancel, Close, Back, Move speaker, Find the best spot. In a toggle group (the sound panel's music choice) the pressed ghost stays filled cream with walnut type.` → `Cancel, Close, Back, Add an object, Remove, Stop exploring.`
- In `### Viewer Chrome`, replace the `**Sound panel:**` bullet with:
```markdown
- **Explore panel:** a 300px card at walnut 80% pinned top right, scrolling within the screen height. In check mode: Room, Objects (one row per object: its number, a name select, Remove) and the Start exploring pill, separated by dashed rules. In explore mode: the heading, a one-line key reminder in cream 70%, and Stop exploring. Key hints bottom left hide while exploring.
- **Captions:** while exploring, what the narrator says (or the scan's names as they play) bottom centre in the voice style at body size, in a polite live region.
```
and the `**3D chips:**` bullet's `a 1px border and text in the data hue` → `a 1px cream border at 60% with cream text, or teal when highlighted`.

Then `grep -n -i "absorb\|reflect\|best spot\|best-spot\|speaker\|sound panel" DESIGN.md` — Expected: no remaining references to removed features (fix any leftovers in the same plain style).

- [ ] **Step 3: Commit the docs**

```bash
git status --short
git add PRODUCT.md DESIGN.md
git commit -q -m "$(cat <<'EOF'
docs: PRODUCT.md and DESIGN.md describe rehearsing a place by sound

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- PRODUCT.md DESIGN.md
```

- [ ] **Step 4: Real check in Chrome**

Build and start a test server on a spare port (Start-Process with a PID, per the Windows process notes), then in Chrome at that address, on the conference room (job `1c59fe0f-02bb-4ddd-97c6-118bb432c93d`) and the classroom:
1. The panel shows "Finding objects…", then the list with the new names, including a door. If no door is found in a room whose video shows one, lower `door` in `LABEL_THRESHOLDS` in `src/server/detect.ts` (try 0.2, then 0.15), delete that job's `detections-v2.json`, reload, and re-run `npx vitest run src/server/detect.test.ts`; commit the change on its own.
2. Rename a chip (e.g. a TV found as a whiteboard), remove a false find, and add a door by clicking the floor. Reload: the changes are still there.
3. Start exploring: the view jumps to the first frame's position at ear height; the intro appears in the captions; the key hints hide.
4. Press W, S, A and D (also hold W): the view steps and turns. Walk into the table: the caption doesn't change, and the console shows no errors.
5. Space: the captions list the names one by one, clockwise from straight ahead.
6. Tab until "Door", then Enter, then walk toward it: the caption reaches "You're at the door."
7. With the Start exploring button just clicked (focus on the page), press Space and Enter: neither clicks a panel button.
8. Ctrl+Tab still switches tabs while exploring.
9. Stop exploring returns to check mode with the viewer's own controls working.
10. The console shows no errors (the existing three.js shader warning is fine).

- [ ] **Step 5: Write the follow-ups**

Create `docs/superpowers/plans/2026-10-09-hearify-plan-9-followups.md` in the style of the Plan 8 follow-ups, with:
- **Before the demo (the user):** restart the demo server (`npm run demo`) so it has the new routes; the headphone check from spec §13 (scan from the start, turn 90°, then go to the door blindfolded), and whether the rolloff (0.6) and echo (−10 dB) need changing in `src/lib/audio/spatial.ts`; which voice engine recorded the clips, and how to re-record (`npm run voices`); the demo script (open the pre-built room, check the list, Start exploring, blindfold, scan, Tab to the door, walk, take the blindfold off, point at the real door).
- **Verified (controller):** what the real check found, room by room, including the room fit and object counts.
- **Rulings made during execution:** each with what was decided, why, and the cost if wrong.
- **Known limits:** from spec §14, plus anything new.

- [ ] **Step 6: Final verification and commit**

Run: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npx next build` — Expected: all clean.
```bash
git status --short
git add docs/superpowers/plans/2026-10-09-hearify-plan-9-followups.md
git commit -q -m "$(cat <<'EOF'
docs: Plan 9 follow-ups: the headphone check, the demo script, rulings and limits

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)" -- docs/superpowers/plans/2026-10-09-hearify-plan-9-followups.md
```
