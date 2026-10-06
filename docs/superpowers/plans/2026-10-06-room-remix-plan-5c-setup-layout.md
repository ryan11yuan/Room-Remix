# Room Remix: Plan 5c, Setup Wizard, Player Layout and Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A first-time visitor sets up their room in a four-step wizard (size in metres or feet, a tap-a-surface diagram, a top view to place the speaker and themselves, an optional scan), lands in a player laid out for phones, and every control is usable by touch, keyboard and screen reader. Browsers without WebGL get an editable top view.

**Architecture:**
- **Pure modules in `src/lib/room/`, tested in Node:** `units.ts` (metres and feet), `topView.ts` (plan geometry, drags, arrow-key nudges), `surfaceDiagram.ts` (the picker's polygons), `wizard.ts` (the wizard's reducer), `roomCard.ts` (the room card's lines). `rooms.ts` gains `shouldRunSetup` and `displayName`; `session.ts`'s `start()` resolves to the id of the room a link opened.
- **The wizard is its own route, `/setup`.** "Open my room" encodes the room and pushes `/room#v1.…`, so the tested share-link import adds it. A scan file can't travel in a link: it waits in `src/components/pendingScan.ts` (module state, tested in Node) until the room page has opened the wizard's link, then the 3D view loads it.
- **The room page's first visit** goes to `/setup` when there are no saved rooms and no link; blocked storage starts the page as before.
- **The player** keeps one engine and renders two sections: the song picker in the page, and a control bar fixed to the bottom of the screen below `lg`. The room card, What if… and a folded "Edit room" follow.
- **One `TopView` component** serves the wizard's Placement step and the room page without WebGL.

**Tech Stack:** Next.js 16.3 (App Router, `output: 'export'`), React 19.2, TypeScript 5.9, Tailwind 4, zustand 5, Vitest 5 (Node environment), three.js 0.186.

**Spec:** `docs/superpowers/specs/2026-10-04-room-remix-design.md`: §10.2 (room setup wizard), §10.3 (player), §11 (the "No WebGL" and "Dimensions out of range" rows), §4 (validation), §9 (share links). Also the Plan 5c items in `docs/superpowers/plans/2026-10-05-room-remix-plan-5a-followups.md` and `…-plan-5b-followups.md`.

**Where this sits:** Plan 5 runs as four plans, in order.
- **5a (done):** rooms that persist.
- **5b (done):** recorded spaces, built-in clips, the landing page, About.
- **5c (this plan):** the setup wizard, the player layout, the top view without WebGL, the accessibility pass.
- **5d:** end-to-end tests, cleanup, Cloudflare Pages.

**Not in this plan:** the clap step (Plan 2 adds it between Placement and Scan), the demo bedroom's static scan loader (it waits for the author's scan), a DOM-free ListenDemo controller, and drafts for rooms that can't be saved.

**Decided here (where the rulings left room, or this plan departs from them):**
- **The surface picker looks at the front wall from behind the back wall, not in an oblique projection.** In an oblique view of a box, the far wall and one side wall's inner face overlap, and a deep or tall room leaves some faces as slivers. Here the front wall is a rectangle, the floor, ceiling and side walls are four trapezoids around it, and the cut-away back wall is a strip under the drawing. The shape follows the room within limits (width-to-height 0.75–2.4, depth ratio 0.4–0.6) that keep every surface at least 24 units across. Facing the front wall makes "left wall" and "right wall" sit where their names say.
- **`shouldRunSetup(storage, hash)` takes the storage object and the hash,** not two booleans, so the "storage throws" case is decided, and tested, in the pure function. Any hash longer than `#` counts as a link. A hash that isn't a room link goes to the room page, which says "This link couldn't be fully loaded." (5a's behaviour).
- **`RoomSession.start()` resolves to the id of the room a link opened** (`Promise<string | null>`). This is a return value, not a new method. It is needed because a room page that was open earlier in the visit first shows the previous room, and the scan must go to the wizard's room, not that one.
- **The pending scan belongs to the wizard's link** until the session opens that link as a room, then to that room. `takePendingScan` returns it once, as ruled. `returnPendingScan` hands it back when React's development double mount disposes the first 3D view before it loads.
- **"Open my room" gives the room a name no saved room has** (`uniqueName`) before encoding it. Without this, `importRoom` would reopen an identical saved room: New room → Open my room with the defaults would land in an untouched "My room" instead of a new one.
- **Leaving the Size step pulls the speaker and listener inside the new size** (`fitPositions`). Otherwise a smaller room leaves the default listener (x = 3 m) outside it, and the visitor meets a placement error they didn't cause.
- **The wizard's state lives in the page.** A reload or the browser's Back leaves `/setup`, and the wizard starts again. It isn't kept as a draft.
- **Bad links keep 5a's behaviour** (R3): the notice shows on the room page and the visitor's room opens. Spec §11 says "open setup with notice"; keeping the visitor's place is better.
- **The unit reaches every hint:** the arrow-key description says "0.3 ft" in feet, and the scale bar is 3 ft long in feet (1 m in metres).
- **The room card says "Reverb time",** not "RT60".
- **The room's errors are split by where they're fixed:** rug and panel errors show under What if…, everything else under Edit room. A rug made too big for the room is then never hidden inside the folded Edit room.
- **The bar pads by `env(safe-area-inset-bottom)` but the page doesn't set `viewport-fit=cover`.** `cover` would put landscape content under the notch. Without it, Safari keeps the page clear of the home indicator, and the inset is 0.
- **`Toggle` is built in Task 1,** where the m/ft switch first needs it. Task 6 moves the player and the landing demo onto it.
- **The room page's section headings come with the sections, in Task 6.** RoomForm's own section headings become h3s under "Edit room".
- **Extra focus moves:** Back and Next focus the new step's heading. In My rooms, pressing Delete focuses Keep, and Keep focuses Delete again.
- **Length fields are `type="text"` with `inputMode="decimal"`,** so a comma works as the decimal point and what was typed stays put while typing.
- **The React lint rules shaped two components.** TopView keeps its drag in state and finds its SVG through `ownerSVGElement`. My rooms finds focus targets by a `data-focus` attribute. Handler helpers that close over refs are flagged as "ref access during render".

## Global Constraints

- Static export only (`output: 'export'`), and no user data leaves the device.
- `src/lib/**` (except `src/lib/scene/**`) never touches the DOM, `window` or storage; browser objects are passed in.
- three.js stays in `src/lib/scene/**` and `src/components/**`. Spark is imported only by `src/lib/scene/SplatLayer.ts`.
- React lint rules: no synchronous setState in effect bodies, no ref reads during render, no browser APIs during render or prerender.
- Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`, passed as a second `-m`.
- Never amend or rebase commits that are already on `origin/main`.
- Next.js 16 differs from your training data: read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md` before touching routing code.
- Shell is Windows PowerShell; the repo path has a space. Commit by path (another session may share the working tree).
- Copy: plain, short and concrete; British spelling ("metres", "colour"); no exclamation marks.
- Every button, tab, toggle, link-button and form field is at least 44 px tall on phones (`min-h-11`; `min-w-11` for icon-only).
- localStorage keys: `room-remix:rooms` (5a), `room-remix:units` (new, 'm' or 'ft').

## Review Focus

1. **Back and Next losing edits.** A visitor edits each step, goes back two steps and forward again, including back from a step that has an error. Every edit is still there, and Next stays put on a step with errors. Tests: Task 4 (`wizard.test.ts`, "keep every edit, on every step, through Back and Next" and "goes Back from a step with errors without losing them").
2. **A first visit that arrives with a link.** Someone opens a shared room on a fresh browser. The link opens at once (no detour to setup), and exactly one room exists afterwards, the link's, with no extra "My room". Tests: Task 4 (`rooms.test.ts`, "opens a link straight away, even on a first visit"; `session.test.ts`, "opens only the linked room on a first visit with a link").
3. **A pointer drag that leaves the drawing.** On a phone, a finger dragging the speaker overshoots the small plan, or the drawing has no size yet. The item stops 0.3 m from the walls and never becomes NaN. Tests: Task 2 (`topView.test.ts`, "keeps a drag that left the drawing 0.3 m inside the walls" and "gives nothing while the drawing has no size").
4. **Storage blocked on the first visit.** Private modes and blocked site data make `localStorage` throw. The room page starts as usual (rooms in memory, the 5a notice) instead of sending the visitor to setup on every visit. Tests: Task 4 (`rooms.test.ts`, "starts as usual when storage is blocked or missing").
5. **Feet at the limits.** A US visitor types the smallest or largest size the form shows. That value is valid, the value just past it is refused, and the message is in feet. Tests: Task 1 (`units.test.ts`, "accept a value typed at a shown limit" and "refuse a value just outside a shown limit").

Also pinned (not in the five): a rug bigger than the room is drawn cut to the floor (Task 2), and every drag in a 1.5 m room stays inside the walls (Task 2).

---

## File Structure

```
src/lib/room/
  units.ts               NEW  Unit, toUnit/fromUnit, formatLength, parseLength, unitBounds, errorMessage, parseUnit, defaultUnit
  units.test.ts          NEW
  labels.ts              NEW  SURFACE_LABELS, FURNISHING_LABELS (moved out of RoomForm)
  topView.ts             NEW  plan geometry, clientToPlan, dragTo, nudge, labels, rug/panel/arrow/scale-bar shapes
  topView.test.ts        NEW
  surfaceDiagram.ts      NEW  the surface picker's six polygons
  surfaceDiagram.test.ts NEW
  wizard.ts              NEW  WIZARD_STEPS, wizardReducer, stepErrors, fitPositions, readyToOpen
  wizard.test.ts         NEW
  roomCard.ts            NEW  describeRoom, roomCardFor, TARGET_NOTE
  roomCard.test.ts       NEW
  rooms.ts               MOD  hasRoomsFile, shouldRunSetup (Task 4); UNTITLED, displayName (Task 7)
  rooms.test.ts          MOD
  session.ts             MOD  start() resolves to the linked room's id (Task 5); copies of unnamed rooms (Task 7)
  session.test.ts        MOD
src/lib/audio/
  mix.ts                 MOD  silentIr
  mix.test.ts            MOD
src/components/
  browserStorage.ts      NEW  localStorage or null (moved out of useRoomSession)
  useUnits.ts            NEW  the unit preference (useSyncExternalStore)
  Toggle.tsx             NEW  the two-option switch
  LengthField.tsx        NEW  a length typed in the visitor's unit; inputClass
  useWebGL.ts            NEW  the WebGL probe (moved out of RoomView)
  TopView.tsx            NEW  the editable top view
  SurfacePicker.tsx      NEW  diagram + list + material radios
  MyRoomsLink.tsx        NEW  the landing page's "My rooms" link
  pendingScan.ts         NEW  the scan's handoff from /setup to the room page
  pendingScan.test.ts    NEW
  RoomCard.tsx           NEW  "Your room's sound"
  WhatIf.tsx             NEW  "What if…" (moved out of RoomForm)
  ErrorList.tsx          NEW  the amber error list; isFixError
  EditRoom.tsx           NEW  the folded "Edit room"
  useReducedMotion.ts    NEW  prefers-reduced-motion
  contrast.test.ts       NEW  guard: no text-neutral-500/600/700 in pages and components
  RoomForm.tsx           MOD  lengths in the unit (Task 1); labels (Task 2); What if… moved out (Task 6)
  RoomView.tsx           MOD  top view without WebGL (Task 2); pending scan (Task 5); targets, rays (Task 7)
  useRoomSession.ts      MOD  browserStorage (Task 1); first-visit redirect (Task 4); scan handoff (Task 5)
  Player.tsx             MOD  two sections, Toggle, silent IR (Task 6)
  ListenDemo.tsx         MOD  Toggle, silentIr (Task 6); heading, targets, contrast (Task 7)
  RoomsMenu.tsx          MOD  New room → /setup (Task 4); focus, names, backdrop (Task 7)
  ShareButton.tsx        MOD  announced, focused copy-by-hand field (Task 7)
src/app/
  setup/page.tsx         NEW  the wizard
  page.tsx               MOD  Try your room → /setup, My rooms link (Task 4); footer (Task 7)
  room/page.tsx          MOD  the player layout (Task 6); targets, contrast (Task 7)
  about/page.tsx         MOD  the home link's target (Task 7)
  globals.css            MOD  a global :focus-visible ring (Task 7)
```

---
### Task 1: Metres or feet

**Files:**
- Create: `src/lib/room/units.ts`, `src/lib/room/units.test.ts`, `src/components/browserStorage.ts`, `src/components/useUnits.ts`, `src/components/Toggle.tsx`, `src/components/LengthField.tsx`
- Modify: `src/components/RoomForm.tsx` (replaced whole), `src/components/useRoomSession.ts`

**Interfaces:**
- Consumes: `LIMITS` from `./constants`; `RoomError`, `validateRoom` from `./roomState`; `RoomsStorage` from `@/lib/room/rooms`.
- Produces:
  ```ts
  // src/lib/room/units.ts
  type Unit = 'm' | 'ft';
  FOOT = 0.3048; UNITS_KEY = 'room-remix:units';
  toUnit(m: number, unit: Unit): number
  fromUnit(value: number, unit: Unit): number
  formatNumber(value: number, unit: Unit): string      // a number already in `unit`
  formatLength(m: number, unit: Unit): string          // metres, shown in `unit`, no unit suffix
  parseLength(text: string, unit: Unit): number | null // metres
  type UnitBounds = { minLengthWidth: number; maxLengthWidth: number; minHeight: number; maxHeight: number };
  unitBounds(unit: Unit): UnitBounds
  errorMessage(error: RoomError, unit: Unit): string
  parseUnit(stored: string | null): Unit | null
  defaultUnit(language: string | undefined): Unit
  // src/components
  browserStorage(): RoomsStorage                                  // browserStorage.ts
  useUnits(): [Unit, (unit: Unit) => void]; setUnit(unit: Unit)  // useUnits.ts
  Toggle({ label, options: [string, string], value: boolean, onChange: (v: boolean) => void, disabled?: boolean })
  LengthField({ label, metres: number, unit: Unit, onChange: (metres: number) => void }); inputClass: string
  ```

What it does:
- **Storage stays in metres, unrounded.** A field only writes back when its own text changes, so switching units or tabbing through never rounds a room.
- **Feet are typed as decimals** ("12.5"), shown to one decimal. Metres are shown to at most two decimals, with trailing zeros dropped.
- **Limits are rounded inward,** so a value typed at a shown limit is valid: 5.0–98.4 ft for length and width, 6.6–49.2 ft for height.
- **The choice is remembered** under `room-remix:units`. It defaults to feet when `navigator.language` is `en-US`, else metres, and to metres while prerendering.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/units.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom, validateRoom } from './roomState';
import type { RoomState } from './types';
import {
  defaultUnit,
  errorMessage,
  FOOT,
  formatLength,
  formatNumber,
  fromUnit,
  parseLength,
  parseUnit,
  toUnit,
  unitBounds,
} from './units';

const withLength = (length: number): RoomState => ({ ...defaultRoom(), dims: { ...defaultRoom().dims, length } });
const withHeight = (height: number): RoomState => ({ ...defaultRoom(), dims: { ...defaultRoom().dims, height } });
/** The room's size errors only: a small room also puts the default speaker and listener outside it. */
const sizeErrors = (room: RoomState) => validateRoom(room).filter((e) => e.field.startsWith('dims.'));

describe('converting', () => {
  it('uses the exact foot', () => {
    expect(FOOT).toBe(0.3048);
    expect(toUnit(3.048, 'ft')).toBeCloseTo(10, 12);
    expect(fromUnit(10, 'ft')).toBeCloseTo(3.048, 12);
    expect(toUnit(3.5, 'm')).toBe(3.5);
    expect(fromUnit(3.5, 'm')).toBe(3.5);
  });

  it('round-trips any length through feet', () => {
    for (const m of [1.5, 2.6, 3.6576, 29.99]) expect(fromUnit(toUnit(m, 'ft'), 'ft')).toBeCloseTo(m, 12);
  });
});

describe('formatting', () => {
  it('shows feet to one decimal and metres to at most two, without trailing zeros', () => {
    expect(formatLength(3.048, 'ft')).toBe('10.0');
    expect(formatLength(3.81, 'ft')).toBe('12.5');
    expect(formatLength(4, 'm')).toBe('4');
    expect(formatLength(3.5, 'm')).toBe('3.5');
    expect(formatLength(3.6576, 'm')).toBe('3.66');
    expect(formatNumber(5, 'ft')).toBe('5.0');
  });
});

describe('parsing', () => {
  it('reads decimals in either unit, with a point or a comma', () => {
    expect(parseLength('12.5', 'ft')).toBeCloseTo(3.81, 12);
    expect(parseLength(' 3,5 ', 'm')).toBe(3.5);
    expect(parseLength('4', 'm')).toBe(4);
    expect(parseLength('.5', 'm')).toBe(0.5);
    expect(parseLength('12.', 'ft')).toBeCloseTo(3.6576, 12);
  });

  it("gives null for anything that isn't a plain number", () => {
    for (const text of ['', ' ', 'abc', '12 ft', "12'6\"", '1e3', '1.2.3', '-', '.', 'Infinity']) {
      expect(parseLength(text, 'm')).toBeNull();
    }
  });

  it('shows what was typed in feet the way it was typed', () => {
    const m = parseLength('12.5', 'ft')!;
    expect(formatLength(m, 'ft')).toBe('12.5');
  });
});

describe('limits in each unit', () => {
  it('are the spec limits in metres', () => {
    expect(unitBounds('m')).toEqual({ minLengthWidth: 1.5, maxLengthWidth: 30, minHeight: 2, maxHeight: 15 });
  });

  it('are rounded inward in feet', () => {
    expect(unitBounds('ft')).toEqual({ minLengthWidth: 5, maxLengthWidth: 98.4, minHeight: 6.6, maxHeight: 49.2 });
  });

  it('accept a value typed at a shown limit', () => {
    const b = unitBounds('ft');
    expect(sizeErrors(withLength(parseLength(formatNumber(b.minLengthWidth, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withLength(parseLength(formatNumber(b.maxLengthWidth, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withHeight(parseLength(formatNumber(b.minHeight, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withHeight(parseLength(formatNumber(b.maxHeight, 'ft'), 'ft')!))).toEqual([]);
  });

  it('refuse a value just outside a shown limit, and say so in feet', () => {
    const errors = sizeErrors(withLength(parseLength('4.9', 'ft')!));
    expect(errors.map((e) => errorMessage(e, 'ft'))).toEqual(['Length must be between 5.0 and 98.4 ft.']);
  });
});

describe('errorMessage', () => {
  it('leaves the metre messages as validateRoom words them', () => {
    const errors = [
      ...validateRoom(withLength(1)),
      ...validateRoom({ ...defaultRoom(), dims: { length: 4, width: 40, height: 1 } }),
      ...validateRoom({ ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } }),
    ];
    expect(errors.length).toBeGreaterThan(3);
    for (const e of errors) expect(errorMessage(e, 'm')).toBe(e.message);
  });

  it('gives every size message in feet', () => {
    const errors = validateRoom({ ...defaultRoom(), dims: { length: 1, width: 40, height: 1 } });
    expect(errors.map((e) => errorMessage(e, 'ft'))).toEqual([
      'Length must be between 5.0 and 98.4 ft.',
      'Width must be between 5.0 and 98.4 ft.',
      'Height must be between 6.6 and 49.2 ft.',
    ]);
  });

  it('turns the distances in other messages into feet', () => {
    const tooClose = validateRoom({ ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } });
    expect(errorMessage(tooClose[0], 'ft')).toBe('The speaker must be at least 1.0 ft from the walls, floor and ceiling.');
    const together = validateRoom({ ...defaultRoom(), listener: { x: 0.7, y: 1.0, z: 1.4, yaw: 'faceSpeaker' } });
    expect(errorMessage(together[0], 'ft')).toBe('The listener must be at least 1.6 ft from the speaker.');
  });
});

describe('the unit preference', () => {
  it('reads only a unit back from storage', () => {
    expect(parseUnit('ft')).toBe('ft');
    expect(parseUnit('m')).toBe('m');
    expect(parseUnit(null)).toBeNull();
    expect(parseUnit('feet')).toBeNull();
  });

  it('starts in feet for US English and in metres otherwise', () => {
    expect(defaultUnit('en-US')).toBe('ft');
    expect(defaultUnit('en-us')).toBe('ft');
    expect(defaultUnit('en-GB')).toBe('m');
    expect(defaultUnit('de')).toBe('m');
    expect(defaultUnit(undefined)).toBe('m');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/units.test.ts`
Expected: FAIL. Vitest can't resolve `./units`.

- [ ] **Step 3: Implement the units**

Create `src/lib/room/units.ts`:
```ts
import { LIMITS } from './constants';
import type { RoomError } from './roomState';

/** How lengths are shown and typed. Rooms are always stored in metres. */
export type Unit = 'm' | 'ft';

/** One foot, in metres (exact by definition). */
export const FOOT = 0.3048;
/** The localStorage key for the visitor's choice. */
export const UNITS_KEY = 'room-remix:units';

/** A length in metres, in `unit`. */
export function toUnit(m: number, unit: Unit): number {
  return unit === 'ft' ? m / FOOT : m;
}

/** A length in `unit`, in metres. */
export function fromUnit(value: number, unit: Unit): number {
  return unit === 'ft' ? value * FOOT : value;
}

/** A number already in `unit`, as fields show it: feet to one decimal ("12.5"), metres to at most two ("3.5", "4"). */
export function formatNumber(value: number, unit: Unit): string {
  return unit === 'ft' ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

/** A length in metres, as fields show it in `unit` (without the unit). */
export function formatLength(m: number, unit: Unit): string {
  return formatNumber(toUnit(m, unit), unit);
}

const DECIMAL = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;

/** What was typed into a length field, in metres. Null when it isn't a plain decimal number. A comma works as the point. */
export function parseLength(text: string, unit: Unit): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  return fromUnit(Number(trimmed.replace(',', '.')), unit);
}

export type UnitBounds = { minLengthWidth: number; maxLengthWidth: number; minHeight: number; maxHeight: number };

/**
 * The size limits in `unit`, rounded inward to the precision fields show, so a value typed at a shown limit is valid:
 * 1.5 m is 4.92 ft, shown as 5.0 (4.9 ft would be too small); 30 m is 98.43 ft, shown as 98.4.
 */
export function unitBounds(unit: Unit): UnitBounds {
  const steps = unit === 'ft' ? 10 : 100; // feet show one decimal, metres two
  const up = (m: number) => Math.ceil(toUnit(m, unit) * steps - 1e-9) / steps;
  const down = (m: number) => Math.floor(toUnit(m, unit) * steps + 1e-9) / steps;
  return {
    minLengthWidth: up(LIMITS.minLengthWidth),
    maxLengthWidth: down(LIMITS.maxLengthWidth),
    minHeight: up(LIMITS.minHeight),
    maxHeight: down(LIMITS.maxHeight),
  };
}

/** A validation message with its lengths in `unit`. Size limits use the rounded-inward bounds above. */
export function errorMessage(error: RoomError, unit: Unit): string {
  const bounds = unitBounds(unit);
  const n = (value: number) => formatNumber(value, unit);
  switch (error.field) {
    case 'dims.length':
      return `Length must be between ${n(bounds.minLengthWidth)} and ${n(bounds.maxLengthWidth)} ${unit}.`;
    case 'dims.width':
      return `Width must be between ${n(bounds.minLengthWidth)} and ${n(bounds.maxLengthWidth)} ${unit}.`;
    case 'dims.height':
      return `Height must be between ${n(bounds.minHeight)} and ${n(bounds.maxHeight)} ${unit}.`;
  }
  if (unit === 'm') return error.message;
  return error.message.replace(/(\d+(?:\.\d+)?) m\b/g, (_, metres: string) => `${formatLength(Number(metres), 'ft')} ft`);
}

/** A stored choice, or null when nothing (or something else) is stored. */
export function parseUnit(stored: string | null): Unit | null {
  return stored === 'm' || stored === 'ft' ? stored : null;
}

/** The unit to start with before the visitor chooses: feet for US English, metres everywhere else. */
export function defaultUnit(language: string | undefined): Unit {
  return language?.toLowerCase() === 'en-us' ? 'ft' : 'm';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/units.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: The browser pieces**

Create `src/components/browserStorage.ts` (moved out of `useRoomSession.ts`, so pages that don't need the session can read storage):
```ts
import type { RoomsStorage } from '@/lib/room/rooms';

/** This browser's localStorage, or null where it is blocked (reading the property itself throws there). Browser only. */
export function browserStorage(): RoomsStorage {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
```

In `src/components/useRoomSession.ts`:
1. Delete the local `function browserStorage(): RoomsStorage { … }` (the try/catch around `window.localStorage`).
2. Change `import { newRoomId, ROOMS_KEY, type RoomsStorage } from '@/lib/room/rooms';` to `import { newRoomId, ROOMS_KEY } from '@/lib/room/rooms';`.
3. Add `import { browserStorage } from './browserStorage';` after the `scanStore` import.

Create `src/components/useUnits.ts`:
```ts
'use client';

import { useSyncExternalStore } from 'react';
import { defaultUnit, parseUnit, UNITS_KEY, type Unit } from '@/lib/room/units';
import { browserStorage } from './browserStorage';

let chosen: Unit | null = null; // this page's choice: it holds even where storage can't keep it
const listeners = new Set<() => void>();

function readUnit(): Unit {
  if (chosen) return chosen;
  let stored: string | null = null;
  try {
    stored = browserStorage()?.getItem(UNITS_KEY) ?? null;
  } catch {
    stored = null; // blocked storage: fall back to the language
  }
  return parseUnit(stored) ?? defaultUnit(navigator.language);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== UNITS_KEY && event.key !== null) return;
    chosen = null; // another tab chose: read it
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Show lengths in `unit` from now on, in every field on the page, and remember it in this browser. */
export function setUnit(unit: Unit): void {
  chosen = unit;
  try {
    browserStorage()?.setItem(UNITS_KEY, unit);
  } catch {
    // kept for this page only
  }
  listeners.forEach((listener) => listener());
}

/** The unit lengths are shown in, and its setter. Metres while prerendering; the browser's choice after hydration. */
export function useUnits(): [Unit, (unit: Unit) => void] {
  const unit = useSyncExternalStore(subscribe, readUnit, () => 'm' as const);
  return [unit, setUnit];
}
```

Create `src/components/Toggle.tsx` (the one two-option switch, R8; Task 6 moves the player and the landing demo onto it):
```tsx
'use client';

type ToggleProps = {
  /** What the pair chooses between, for screen readers: "Listen dry or in your room". */
  label: string;
  options: [string, string];
  /** False selects the first option, true the second. */
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
};

/** A two-option switch: a labelled group of two pressed/unpressed buttons, each at least 44 px tall. */
export function Toggle({ label, options, value, onChange, disabled = false }: ToggleProps) {
  return (
    <div role="group" aria-label={label} className={`inline-flex w-fit rounded-lg border border-neutral-700 p-0.5 ${disabled ? 'opacity-40' : ''}`}>
      {options.map((text, i) => {
        const selected = value === (i === 1);
        return (
          <button
            key={text}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(i === 1)}
            className={`min-h-11 rounded-md px-3 text-sm ${selected ? 'bg-white font-semibold text-neutral-950' : 'text-neutral-300'}`}
          >
            {text}
          </button>
        );
      })}
    </div>
  );
}
```
(`w-fit` matters: in a flex column the group would otherwise stretch to the full width.)

Create `src/components/LengthField.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { formatLength, parseLength, type Unit } from '@/lib/room/units';

/** The look of the app's text fields and selects: at least 44 px tall. */
export const inputClass = 'min-h-11 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1.5';

type LengthFieldProps = { label: string; metres: number; unit: Unit; onChange: (metres: number) => void };

/**
 * A length typed in the visitor's unit and kept in metres. While the field has focus it shows exactly what was typed,
 * so "12.55" doesn't jump to "12.6" mid-typing; the room only changes when the text does.
 */
export function LengthField({ label, metres, unit, onChange }: LengthFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Number.isFinite(metres) ? formatLength(metres, unit) : '';
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-neutral-400">
        {label} ({unit})
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft ?? shown}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseLength(e.target.value, unit) ?? Number.NaN); // NaN: the form shows the size or position error
        }}
        onBlur={() => setDraft(null)}
        className={`${inputClass} w-24`}
      />
    </label>
  );
}
```
Don't add an `onFocus` that copies the shown value into the draft: the first change already captures what was typed, and an `onFocus` draft fights a field cleared by script (or by a password manager) and appends to the old text.

- [ ] **Step 6: The form in the visitor's unit**

Replace `src/components/RoomForm.tsx` with:
```tsx
'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { LIMITS, RUG_SIZES } from '@/lib/room/constants';
import { findFreePanelSpot } from '@/lib/room/placement';
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
import { errorMessage, formatLength, type Unit } from '@/lib/room/units';
import { inputClass, LengthField } from './LengthField';
import { Toggle } from './Toggle';
import { useUnits } from './useUnits';

const SURFACE_LABELS: Record<SurfaceId, string> = {
  floor: 'Floor',
  ceiling: 'Ceiling',
  wallX0: 'Front wall',
  wallX1: 'Back wall',
  wallZ0: 'Right wall',
  wallZ1: 'Left wall',
};

const FURNISHING_LABELS: Record<Furnishing, string> = {
  bare: 'Bare (empty room)',
  some: 'Some (bed or sofa)',
  full: 'Full (bed, sofa, shelves, curtains)',
};

const RUG_NAMES: Record<RugSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };
/** "Medium 1.6 × 2.3 m": width × length, in the visitor's unit. */
const rugLabel = (size: RugSize, unit: Unit) =>
  `${RUG_NAMES[size]} ${formatLength(RUG_SIZES[size].z, unit)} × ${formatLength(RUG_SIZES[size].x, unit)} ${unit}`;

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
  const [unit, setUnit] = useUnits();
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
    update((r) => {
      const spot = findFreePanelSpot(r);
      return spot ? { ...r, fixes: [...r.fixes, spot] } : r;
    });

  return (
    <div className="flex flex-col gap-8">
      <Section title="Room size">
        <Toggle label="Units" options={['Metres', 'Feet']} value={unit === 'ft'} onChange={(feet) => setUnit(feet ? 'ft' : 'm')} />
        <div className="flex flex-wrap gap-3">
          <LengthField label="Length" metres={room.dims.length} unit={unit} onChange={(v) => setDim('length', v)} />
          <LengthField label="Width" metres={room.dims.width} unit={unit} onChange={(v) => setDim('width', v)} />
          <LengthField label="Ceiling height" metres={room.dims.height} unit={unit} onChange={(v) => setDim('height', v)} />
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

      <Section title="Speaker and listener">
        <p className="text-xs text-neutral-500">
          x runs from the front wall toward the back, z from the right wall toward the left (as you face the front wall), y is height.
        </p>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Speaker x" metres={room.speaker.x} unit={unit} onChange={(v) => setSpeaker('x', v)} />
          <LengthField label="Speaker y" metres={room.speaker.y} unit={unit} onChange={(v) => setSpeaker('y', v)} />
          <LengthField label="Speaker z" metres={room.speaker.z} unit={unit} onChange={(v) => setSpeaker('z', v)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Listener x" metres={room.listener.x} unit={unit} onChange={(v) => setListener('x', v)} />
          <LengthField label="Listener y" metres={room.listener.y} unit={unit} onChange={(v) => setListener('y', v)} />
          <LengthField label="Listener z" metres={room.listener.z} unit={unit} onChange={(v) => setListener('z', v)} />
        </div>
      </Section>

      <Section title="What if…">
        <div className="flex gap-3">
          <button
            onClick={addRug}
            disabled={rugCount >= LIMITS.maxRugs}
            className="min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40"
          >
            + Rug
          </button>
          <button
            onClick={addPanel}
            disabled={panelCount >= LIMITS.maxPanels || findFreePanelSpot(room) === null}
            className="min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40"
          >
            + Panel
          </button>
        </div>
        {room.fixes.map((fix, i) => {
          const rowLabel =
            fix.kind === 'rug' ? 'Rug' : `Panel ${room.fixes.slice(0, i + 1).filter((f) => f.kind === 'panel').length}`;
          return (
            <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={fix.on} onChange={(e) => setFix(i, { on: e.target.checked })} />
                {rowLabel}
              </label>
              {fix.kind === 'rug' ? (
                <>
                  <select
                    aria-label="Rug size"
                    value={fix.size}
                    onChange={(e) => setFix(i, { size: e.target.value as RugSize })}
                    className={inputClass}
                  >
                    {(['S', 'M', 'L'] as const).map((s) => (
                      <option key={s} value={s}>
                        {rugLabel(s, unit)}
                      </option>
                    ))}
                  </select>
                  <LengthField label={`${rowLabel} centre x`} metres={fix.x} unit={unit} onChange={(v) => setFix(i, { x: v })} />
                  <LengthField label={`${rowLabel} centre z`} metres={fix.z} unit={unit} onChange={(v) => setFix(i, { z: v })} />
                </>
              ) : (
                <>
                  <select
                    aria-label={`${rowLabel} wall`}
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
                  <LengthField label={`${rowLabel} along wall`} metres={fix.u} unit={unit} onChange={(v) => setFix(i, { u: v })} />
                  <LengthField label={`${rowLabel} height`} metres={fix.v} unit={unit} onChange={(v) => setFix(i, { v })} />
                </>
              )}
              <button
                onClick={() => removeFix(i)}
                aria-label={`Remove ${rowLabel.toLowerCase()}`}
                className="min-h-11 px-2 text-sm text-red-400"
              >
                Remove
              </button>
            </div>
          );
        })}
      </Section>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          {errors.map((e) => (
            <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
          ))}
          <li className="font-medium">Changes to this room aren&apos;t saved until this is fixed.</li>
        </ul>
      )}
    </div>
  );
}
```
What changed: every length is a `LengthField` (the old `NumberField` is gone); the "(metres)" in two section titles is gone; a Units toggle heads Room size; rug sizes and error messages follow the unit; buttons and fields are 44 px tall. The `text-neutral-500` note stays for now; Task 7's contrast guard changes it.

- [ ] **Step 7: Check and commit**

Run `npm test` (PASS, 523 tests), `npx tsc --noEmit` and `npm run lint` (both clean).
```powershell
git add -- src/lib/room/units.ts src/lib/room/units.test.ts src/components/browserStorage.ts src/components/useUnits.ts src/components/Toggle.tsx src/components/LengthField.tsx src/components/RoomForm.tsx src/components/useRoomSession.ts
git commit -m "feat: lengths in metres or feet, remembered per browser" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/room/units.ts src/lib/room/units.test.ts src/components/browserStorage.ts src/components/useUnits.ts src/components/Toggle.tsx src/components/LengthField.tsx src/components/RoomForm.tsx src/components/useRoomSession.ts
```

- [ ] **Step 8: Controller browser checks**

Run `npm run build`, serve `out/`, and open `/room` in Chrome on a room that already exists. (Until Task 4, a fresh profile still gets "My room" made for it.) Check:
- **Default unit:** with `navigator.language` en-US, the fields show feet (Length 13.1 ft for the default 4 m). In a profile set to English (UK), they show metres.
- **Toggle:** Units switches every field on the page, including rug and panel positions, without changing the room. Reload: the choice is kept.
- **Typing:** type "12.55" in Length (ft). The text stays "12.55" while focused and shows "12.6" after Tab.
- **Limits:** Length "5.0" ft gives no error. "4.9" gives "Length must be between 5.0 and 98.4 ft." and "Changes to this room aren't saved until this is fixed."
- **Rug sizes:** in feet the rug select reads "Medium 5.2 × 7.5 ft".
- No console errors.

---

### Task 2: The top view, and the room page without WebGL

**Files:**
- Create: `src/lib/room/labels.ts`, `src/lib/room/topView.ts`, `src/lib/room/topView.test.ts`, `src/components/useWebGL.ts`, `src/components/TopView.tsx`
- Modify: `src/components/RoomForm.tsx`, `src/components/RoomView.tsx`

**Interfaces:**
- Consumes: `Unit`, `formatLength` (Task 1); `useUnits` (Task 1); `applyDrag`, `DragTarget` from `./placement`; `listenerYaw` from `@/lib/acoustics/binaural`; `PANEL_SIZE`, `RUG_SIZES` from `./constants`; `MATERIAL_COLORS`, `SPEAKER_COLOR`, `LISTENER_COLOR` from `@/lib/scene/colors`.
- Produces:
  ```ts
  // src/lib/room/labels.ts
  SURFACE_LABELS: Record<SurfaceId, string>; FURNISHING_LABELS: Record<Furnishing, string>
  // src/lib/room/topView.ts
  PLAN_W = 320; PLAN_H = 240; PLAN_PAD = 28; PLAN_BAR_H = 20; NUDGE_M = 0.1
  type Plan = { scale: number; left: number; top: number };
  type Segment = { x1: number; y1: number; x2: number; y2: number };
  type PlanRect = { x: number; y: number; width: number; height: number };
  type Grab = { x: number; z: number };
  fitPlan(dims: Dims, widthPx: number, heightPx: number, padPx: number): Plan | null
  planFor(dims: Dims): Plan | null
  toPlan(plan: Plan, p: { x: number; z: number }): { px: number; py: number }
  fromPlan(plan: Plan, px: number, py: number): { x: number; z: number }
  clientToPlan(rect: { left; top; width; height }, clientX: number, clientY: number): { px: number; py: number } | null
  itemPosition(room: RoomState, target: DragTarget): { x: number; z: number } | null
  dragTo(room: RoomState, plan: Plan, target: DragTarget, px: number, py: number, grab?: Grab): RoomState
  nudge(room: RoomState, target: DragTarget, key: string): RoomState | null
  itemLabel(room: RoomState, target: DragTarget, unit: Unit): string
  nudgeHint(unit: Unit): string
  rugRect(plan: Plan, dims: Dims, rug: RugFix): PlanRect | null
  panelSegment(plan: Plan, dims: Dims, panel: PanelFix): Segment | null
  facingArrow(plan: Plan, room: RoomState, metres?: number): Segment | null
  arrowHead(segment: Segment, size?: number): string
  scaleBar(plan: Plan, unit: Unit): Segment & { label: string }
  // src/components
  useWebGL(): boolean; hasWebGL(): boolean; markWebGLUnavailable(): void   // useWebGL.ts
  TopView({ room: RoomState; onChange: (change: (room: RoomState) => RoomState) => void; unit: Unit; label: string })
  ```

What it does:
- **Orientation matches the 3D Top camera.** `cameraPreset(room, 'top')` in `src/lib/scene/layout.ts` looks straight down with three.js's default up vector and a +0.01 z offset. On screen, x runs right and z runs down. So the front wall (x = 0) is on the left, the back wall on the right, the right wall (z = 0) at the top and the left wall at the bottom.
- **What it draws:** the room with its walls named, the speaker (orange) and listener (blue) with a facing arrow, the rug cut to the floor, panels as thick lines on their walls, and a scale bar (1 m, or 3 ft in feet).
- **Moving things:** drag the speaker, listener or rug (pointer capture keeps a drag that leaves the drawing). Or focus one and use the arrow keys: 0.1 m a press, through `applyDrag`, so the usual clamping applies.
- **Panels can't be placed here.** "+ Panel" already finds a free spot, and the 3D view places one where you tap.
- **Accessible names** give distances from the front and right walls in the visitor's unit. A shared description says how to move the item.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/topView.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom, validateRoom } from './roomState';
import {
  arrowHead,
  clientToPlan,
  dragTo,
  facingArrow,
  fitPlan,
  fromPlan,
  itemLabel,
  nudge,
  nudgeHint,
  panelSegment,
  PLAN_BAR_H,
  PLAN_H,
  PLAN_PAD,
  PLAN_W,
  planFor,
  rugRect,
  scaleBar,
  toPlan,
} from './topView';
import type { RoomState, RugFix } from './types';

const room = (patch: Partial<RoomState> = {}): RoomState => ({ ...defaultRoom(), ...patch });
const rug = (patch: Partial<RugFix> = {}): RugFix => ({ kind: 'rug', size: 'M', x: 2, z: 1.75, on: true, ...patch });
const small = room({
  dims: { length: 1.5, width: 1.5, height: 2.4 },
  speaker: { x: 0.4, y: 1, z: 0.4 },
  listener: { x: 1.1, y: 1.1, z: 1.1, yaw: 'faceSpeaker' },
});
const SPEAKER = { kind: 'speaker' } as const;
const LISTENER = { kind: 'listener' } as const;

describe('fitPlan', () => {
  it('fits the floor inside the padding, keeps its shape and centres it', () => {
    const plan = fitPlan({ length: 4, width: 3.5, height: 2.6 }, 320, 240, 28)!;
    expect(plan.scale).toBeCloseTo(Math.min(264 / 4, 184 / 3.5), 12);
    const far = toPlan(plan, { x: 4, z: 3.5 });
    expect(plan.left).toBeGreaterThanOrEqual(28);
    expect(plan.top).toBeGreaterThanOrEqual(28);
    expect(far.px).toBeLessThanOrEqual(320 - 28 + 1e-9);
    expect(far.py).toBeLessThanOrEqual(240 - 28 + 1e-9);
    expect(plan.left + far.px).toBeCloseTo(320, 9); // centred across
    expect(plan.top + far.py).toBeCloseTo(240, 9); // and down
    expect((far.px - plan.left) / (far.py - plan.top)).toBeCloseTo(4 / 3.5, 12); // same shape as the floor
  });

  it('gives a usable plan for a long, narrow room', () => {
    const plan = planFor({ length: 30, width: 1.5, height: 2.4 })!;
    expect(plan.scale).toBeGreaterThan(0);
    expect(Number.isFinite(plan.left) && Number.isFinite(plan.top)).toBe(true);
    const back = fromPlan(plan, toPlan(plan, { x: 29.7, z: 1.2 }).px, toPlan(plan, { x: 29.7, z: 1.2 }).py);
    expect(back.x).toBeCloseTo(29.7, 9);
    expect(back.z).toBeCloseTo(1.2, 9);
  });

  it('gives no plan while a size is mid-edit', () => {
    expect(fitPlan({ length: Number.NaN, width: 3, height: 2.4 }, 320, 240, 28)).toBeNull();
    expect(fitPlan({ length: 4, width: 0, height: 2.4 }, 320, 240, 28)).toBeNull();
    expect(fitPlan({ length: 4, width: 3, height: 2.4 }, 40, 240, 28)).toBeNull(); // no room left inside the padding
  });

  it('leaves the bottom strip to the scale bar', () => {
    const plan = planFor({ length: 1.5, width: 3, height: 2.4 })!;
    expect(toPlan(plan, { x: 0, z: 3 }).py).toBeLessThanOrEqual(PLAN_H - PLAN_BAR_H - PLAN_PAD + 1e-9);
  });
});

describe('toPlan and fromPlan', () => {
  it('round-trip a floor point', () => {
    const plan = planFor(defaultRoom().dims)!;
    for (const p of [{ x: 0, z: 0 }, { x: 0.6, z: 1.4 }, { x: 4, z: 3.5 }, { x: -2, z: 9 }]) {
      const { px, py } = toPlan(plan, p);
      const back = fromPlan(plan, px, py);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.z).toBeCloseTo(p.z, 9);
    }
  });

  it('draw x to the right and z downward, as the 3D Top camera shows them', () => {
    const plan = planFor(defaultRoom().dims)!;
    const origin = toPlan(plan, { x: 0, z: 0 });
    expect(toPlan(plan, { x: 1, z: 0 }).px).toBeGreaterThan(origin.px);
    expect(toPlan(plan, { x: 0, z: 1 }).py).toBeGreaterThan(origin.py);
  });
});

describe('clientToPlan', () => {
  it('maps client pixels to drawing units', () => {
    const rect = { left: 10, top: 20, width: 640, height: 480 };
    expect(clientToPlan(rect, 10, 20)).toEqual({ px: 0, py: 0 });
    expect(clientToPlan(rect, 650, 500)).toEqual({ px: PLAN_W, py: PLAN_H });
  });

  it('gives nothing while the drawing has no size, so no NaN reaches the room', () => {
    expect(clientToPlan({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toBeNull();
  });
});

describe('dragTo', () => {
  it('moves the speaker to the pointer', () => {
    const plan = planFor(defaultRoom().dims)!;
    const { px, py } = toPlan(plan, { x: 2, z: 1 });
    const moved = dragTo(defaultRoom(), plan, SPEAKER, px, py);
    expect(moved.speaker.x).toBeCloseTo(2, 9);
    expect(moved.speaker.z).toBeCloseTo(1, 9);
    expect(moved.speaker.y).toBe(defaultRoom().speaker.y);
  });

  it('keeps the offset where the item was grabbed', () => {
    const plan = planFor(defaultRoom().dims)!;
    const { px, py } = toPlan(plan, { x: 2, z: 1 });
    const moved = dragTo(defaultRoom(), plan, SPEAKER, px, py, { x: 0.25, z: -0.1 });
    expect(moved.speaker.x).toBeCloseTo(2.25, 9);
    expect(moved.speaker.z).toBeCloseTo(0.9, 9);
  });

  it('keeps a drag that left the drawing 0.3 m inside the walls', () => {
    const plan = planFor(defaultRoom().dims)!;
    const corner = dragTo(defaultRoom(), plan, LISTENER, -5000, 99999);
    expect(corner.listener.x).toBeCloseTo(0.3, 9);
    expect(corner.listener.z).toBeCloseTo(defaultRoom().dims.width - 0.3, 9);
    const other = dragTo(defaultRoom(), plan, SPEAKER, 99999, -5000);
    expect(other.speaker.x).toBeCloseTo(defaultRoom().dims.length - 0.3, 9);
    expect(other.speaker.z).toBeCloseTo(0.3, 9);
  });

  it('keeps the rug on the floor', () => {
    const withRug = room({ fixes: [rug()] });
    const plan = planFor(withRug.dims)!;
    const moved = dragTo(withRug, plan, { kind: 'rug', index: 0 }, -1000, -1000);
    expect(moved.fixes[0]).toMatchObject({ x: 2.3 / 2, z: 1.6 / 2 });
  });

  it('ignores a pointer position that is not a number', () => {
    const plan = planFor(defaultRoom().dims)!;
    const before = defaultRoom();
    expect(dragTo(before, plan, SPEAKER, Number.NaN, 10)).toBe(before);
  });

  it('keeps every drag in the smallest room inside the walls', () => {
    const plan = planFor(small.dims)!;
    for (const [px, py] of [[0, 0], [PLAN_W, PLAN_H], [PLAN_W / 2, PLAN_H / 2], [-50, 400]]) {
      const moved = dragTo(small, plan, SPEAKER, px, py);
      expect(moved.speaker.x).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(moved.speaker.x).toBeLessThanOrEqual(1.2 + 1e-9);
      expect(moved.speaker.z).toBeGreaterThanOrEqual(0.3 - 1e-9);
      expect(moved.speaker.z).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });
});

describe('nudge', () => {
  it('moves 0.1 m the way the arrow points in the drawing', () => {
    const start = defaultRoom(); // speaker at x 0.6, z 1.4
    expect(nudge(start, SPEAKER, 'ArrowRight')!.speaker).toMatchObject({ x: 0.7, z: 1.4 });
    expect(nudge(start, SPEAKER, 'ArrowLeft')!.speaker).toMatchObject({ x: 0.5, z: 1.4 });
    expect(nudge(start, SPEAKER, 'ArrowDown')!.speaker).toMatchObject({ x: 0.6, z: 1.5 });
    expect(nudge(start, SPEAKER, 'ArrowUp')!.speaker).toMatchObject({ x: 0.6, z: 1.3 });
  });

  it('lands on whole millimetres after many presses', () => {
    let r = defaultRoom();
    for (let i = 0; i < 7; i++) r = nudge(r, LISTENER, 'ArrowLeft')!;
    expect(r.listener.x).toBe(2.3);
  });

  it('stops 0.3 m from the wall', () => {
    let r = small;
    for (let i = 0; i < 20; i++) r = nudge(r, SPEAKER, 'ArrowUp')!;
    expect(r.speaker.z).toBeCloseTo(0.3, 9);
  });

  it('moves the rug and keeps it on the floor', () => {
    let r = room({ fixes: [rug()] });
    r = nudge(r, { kind: 'rug', index: 0 }, 'ArrowRight')!;
    expect(r.fixes[0]).toMatchObject({ x: 2.1 });
    for (let i = 0; i < 30; i++) r = nudge(r, { kind: 'rug', index: 0 }, 'ArrowRight')!;
    expect(r.fixes[0]).toMatchObject({ x: 4 - 2.3 / 2 });
  });

  it('leaves other keys to the page', () => {
    for (const key of ['Enter', ' ', 'a', 'Tab', 'toString']) expect(nudge(defaultRoom(), SPEAKER, key)).toBeNull();
    expect(nudge(defaultRoom(), { kind: 'rug', index: 3 }, 'ArrowLeft')).toBeNull();
  });
});

describe('labels', () => {
  it('give distances from the front and right walls in the chosen unit', () => {
    expect(itemLabel(defaultRoom(), SPEAKER, 'm')).toBe('Speaker, 0.6 m from the front wall and 1.4 m from the right wall');
    expect(itemLabel(defaultRoom(), LISTENER, 'ft')).toBe('Listener, 9.8 ft from the front wall and 6.2 ft from the right wall');
    expect(itemLabel(room({ fixes: [rug()] }), { kind: 'rug', index: 0 }, 'm')).toBe(
      'Rug centre, 2 m from the front wall and 1.75 m from the right wall',
    );
  });

  it('say so when a position is mid-edit', () => {
    const editing = room({ speaker: { x: Number.NaN, y: 1, z: 1.4 } });
    expect(itemLabel(editing, SPEAKER, 'm')).toBe('Speaker, an unknown distance from the front wall and 1.4 m from the right wall');
  });

  it('give the arrow-key step in the chosen unit', () => {
    expect(nudgeHint('m')).toBe('Drag it, or use the arrow keys to move it 0.1 m at a time.');
    expect(nudgeHint('ft')).toBe('Drag it, or use the arrow keys to move it 0.3 ft at a time.');
  });
});

describe('fixes in the drawing', () => {
  it('draws a rug bigger than the room as the floor it covers', () => {
    const big = { ...small, fixes: [rug({ size: 'L', x: 0.75, z: 0.75 })] };
    expect(validateRoom(big).map((e) => e.message)).toContain('The rug must fit inside the floor.');
    const plan = planFor(big.dims)!;
    const rect = rugRect(plan, big.dims, big.fixes[0] as RugFix)!;
    const floor = toPlan(plan, { x: 1.5, z: 1.5 });
    expect(rect.x).toBeCloseTo(plan.left, 9);
    expect(rect.y).toBeCloseTo(plan.top, 9);
    expect(rect.x + rect.width).toBeCloseTo(floor.px, 9);
    expect(rect.y + rect.height).toBeCloseTo(floor.py, 9);
  });

  it('draws a rug that fits at its size', () => {
    const plan = planFor(defaultRoom().dims)!;
    const rect = rugRect(plan, defaultRoom().dims, rug())!;
    expect(rect.width).toBeCloseTo(2.3 * plan.scale, 9);
    expect(rect.height).toBeCloseTo(1.6 * plan.scale, 9);
  });

  it('skips a rug whose position is mid-edit', () => {
    const plan = planFor(defaultRoom().dims)!;
    expect(rugRect(plan, defaultRoom().dims, rug({ x: Number.NaN }))).toBeNull();
  });

  it('draws each panel along its own wall', () => {
    const dims = defaultRoom().dims; // 4 × 3.5
    const plan = planFor(dims)!;
    const at = (x: number, z: number) => toPlan(plan, { x, z });
    const seg = (wall: 'wallX0' | 'wallX1' | 'wallZ0' | 'wallZ1', u: number) =>
      panelSegment(plan, dims, { kind: 'panel', wall, u, v: 1.2, on: true })!;
    expect(seg('wallX0', 1)).toEqual({ x1: at(0, 0.7).px, y1: at(0, 0.7).py, x2: at(0, 1.3).px, y2: at(0, 1.3).py });
    expect(seg('wallX1', 1)).toEqual({ x1: at(4, 0.7).px, y1: at(4, 0.7).py, x2: at(4, 1.3).px, y2: at(4, 1.3).py });
    expect(seg('wallZ0', 2)).toEqual({ x1: at(1.7, 0).px, y1: at(1.7, 0).py, x2: at(2.3, 0).px, y2: at(2.3, 0).py });
    expect(seg('wallZ1', 2)).toEqual({ x1: at(1.7, 3.5).px, y1: at(1.7, 3.5).py, x2: at(2.3, 3.5).px, y2: at(2.3, 3.5).py });
  });
});

describe('facingArrow', () => {
  it('points from the listener toward the speaker when facing it', () => {
    const plan = planFor(defaultRoom().dims)!;
    const arrow = facingArrow(plan, defaultRoom())!;
    const listener = toPlan(plan, defaultRoom().listener);
    expect(arrow.x1).toBeCloseTo(listener.px, 9);
    expect(arrow.y1).toBeCloseTo(listener.py, 9);
    expect(arrow.x2).toBeLessThan(arrow.x1); // the speaker (x 0.6) is toward the front wall, on the left
    expect(Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1)).toBeCloseTo(0.5 * plan.scale, 9);
  });

  it('follows a set yaw', () => {
    const plan = planFor(defaultRoom().dims)!;
    const arrow = facingArrow(plan, room({ listener: { x: 2, y: 1.1, z: 2, yaw: Math.PI / 2 } }))!;
    expect(arrow.x2).toBeCloseTo(arrow.x1, 9);
    expect(arrow.y2).toBeGreaterThan(arrow.y1); // +z is down the drawing
  });

  it('draws no arrow while a position is mid-edit', () => {
    const plan = planFor(defaultRoom().dims)!;
    expect(facingArrow(plan, room({ speaker: { x: Number.NaN, y: 1, z: 1 } }))).toBeNull();
  });
});

describe('scaleBar', () => {
  it('is 1 m long in metres and 3 ft long in feet', () => {
    const plan = planFor(defaultRoom().dims)!;
    const metre = scaleBar(plan, 'm');
    expect(metre.label).toBe('1 m');
    expect(metre.x2 - metre.x1).toBeCloseTo(plan.scale, 9);
    const feet = scaleBar(plan, 'ft');
    expect(feet.label).toBe('3 ft');
    expect(feet.x2 - feet.x1).toBeCloseTo(0.9144 * plan.scale, 9);
    expect(metre.y1).toBeGreaterThan(PLAN_H - PLAN_BAR_H);
  });
});

describe('arrowHead', () => {
  it('puts the tip at the end of the arrow and the base behind it', () => {
    const points = arrowHead({ x1: 0, y1: 0, x2: 10, y2: 0 }, 7)
      .split(' ')
      .map((p) => p.split(',').map(Number));
    expect(points[0]).toEqual([10, 0]);
    expect(points[1][0]).toBeCloseTo(3, 9);
    expect(points[2][0]).toBeCloseTo(3, 9);
    expect(points[1][1]).toBeCloseTo(-points[2][1], 9); // the base is centred on the arrow
    expect(Math.abs(points[1][1] - points[2][1])).toBeCloseTo(2 * 7 * 0.6, 9);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/topView.test.ts`
Expected: FAIL. Vitest can't resolve `./topView`.

- [ ] **Step 3: Implement the plan geometry**

Create `src/lib/room/topView.ts`:
```ts
import { listenerYaw } from '@/lib/acoustics/binaural';
import { PANEL_SIZE, RUG_SIZES } from './constants';
import { applyDrag, type DragTarget } from './placement';
import type { Dims, PanelFix, RoomState, RugFix } from './types';
import { formatLength, type Unit } from './units';

/**
 * The top view: the floor plan as the 3D view's Top camera shows it. x (front wall to back wall) runs to the right and
 * z (right wall to left wall) runs down, so the front wall is on the left and the right wall at the top.
 */

/** The drawing's size in SVG units. The SVG scales to its column and keeps this 4:3 shape. */
export const PLAN_W = 320;
export const PLAN_H = 240;
/** Space around the room for the wall labels. */
export const PLAN_PAD = 28;
/** A strip along the bottom of the drawing for the scale bar, below the bottom wall's label. */
export const PLAN_BAR_H = 20;
/** How far one arrow-key press moves an item, in metres. */
export const NUDGE_M = 0.1;

/** Where the room sits in the drawing: `scale` units per metre, with the room's x = 0, z = 0 corner at (left, top). */
export type Plan = { scale: number; left: number; top: number };
export type Segment = { x1: number; y1: number; x2: number; y2: number };
export type PlanRect = { x: number; y: number; width: number; height: number };
/** Where an item was grabbed, relative to its centre, in metres: kept through the drag so the item doesn't jump. */
export type Grab = { x: number; z: number };

const usable = (d: number) => Number.isFinite(d) && d > 0;
const mm = (metres: number) => Math.round(metres * 1000) / 1000;

/** Fit the floor into a widthPx × heightPx drawing with padPx on every side, centred, keeping its shape. Null while a size is mid-edit. */
export function fitPlan(dims: Dims, widthPx: number, heightPx: number, padPx: number): Plan | null {
  const w = widthPx - 2 * padPx;
  const h = heightPx - 2 * padPx;
  if (!usable(dims.length) || !usable(dims.width) || !(w > 0) || !(h > 0)) return null;
  const scale = Math.min(w / dims.length, h / dims.width);
  return { scale, left: (widthPx - dims.length * scale) / 2, top: (heightPx - dims.width * scale) / 2 };
}

/** The top view's plan for a room: the floor fitted above the scale bar's strip. Null while a size is mid-edit. */
export function planFor(dims: Dims): Plan | null {
  return fitPlan(dims, PLAN_W, PLAN_H - PLAN_BAR_H, PLAN_PAD);
}

/** A floor point (metres) in the drawing. */
export function toPlan(plan: Plan, p: { x: number; z: number }): { px: number; py: number } {
  return { px: plan.left + p.x * plan.scale, py: plan.top + p.z * plan.scale };
}

/** A drawing point as a floor point (metres). Points outside the room come back outside it. */
export function fromPlan(plan: Plan, px: number, py: number): { x: number; z: number } {
  return { x: (px - plan.left) / plan.scale, z: (py - plan.top) / plan.scale };
}

/**
 * A pointer position (client pixels) in drawing units, for an SVG of PLAN_W × PLAN_H laid out in `rect`. Null while the
 * SVG has no size yet, so a pointer event can never turn into a NaN position.
 */
export function clientToPlan(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { px: number; py: number } | null {
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  return { px: ((clientX - rect.left) / rect.width) * PLAN_W, py: ((clientY - rect.top) / rect.height) * PLAN_H };
}

/** Where a draggable item is on the floor: the speaker, the listener or a rug's centre. Null for a rug that isn't there. */
export function itemPosition(room: RoomState, target: DragTarget): { x: number; z: number } | null {
  if (target.kind === 'speaker') return { x: room.speaker.x, z: room.speaker.z };
  if (target.kind === 'listener') return { x: room.listener.x, z: room.listener.z };
  const fix = room.fixes[target.index];
  return fix?.kind === 'rug' ? { x: fix.x, z: fix.z } : null;
}

/**
 * Move a dragged item to a drawing point, offset by where it was grabbed. A point outside the room (a drag that left the
 * drawing) is clamped by applyDrag like any other: 0.3 m from the walls, or the rug on the floor.
 */
export function dragTo(room: RoomState, plan: Plan, target: DragTarget, px: number, py: number, grab: Grab = { x: 0, z: 0 }): RoomState {
  if (![px, py, grab.x, grab.z].every(Number.isFinite)) return room;
  const p = fromPlan(plan, px, py);
  return applyDrag(room, target, { x: p.x + grab.x, y: 0, z: p.z + grab.z });
}

function arrowStep(key: string): { dx: number; dz: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -1, dz: 0 };
    case 'ArrowRight':
      return { dx: 1, dz: 0 };
    case 'ArrowUp':
      return { dx: 0, dz: -1 };
    case 'ArrowDown':
      return { dx: 0, dz: 1 };
    default:
      return null;
  }
}

/**
 * Move an item 0.1 m with an arrow key, the way it looks in the drawing (Up is toward the right wall). Rounded to the
 * millimetre so repeated presses don't gather float noise. Null for any other key, so the page can scroll as usual.
 */
export function nudge(room: RoomState, target: DragTarget, key: string): RoomState | null {
  const step = arrowStep(key);
  const at = itemPosition(room, target);
  if (!step || !at) return null;
  return applyDrag(room, target, { x: mm(at.x + step.dx * NUDGE_M), y: 0, z: mm(at.z + step.dz * NUDGE_M) });
}

const ITEM_NAMES: Record<DragTarget['kind'], string> = { speaker: 'Speaker', listener: 'Listener', rug: 'Rug centre' };

/** What a screen reader hears for a draggable item: its distances from the front and right walls, in `unit`. */
export function itemLabel(room: RoomState, target: DragTarget, unit: Unit): string {
  const name = ITEM_NAMES[target.kind];
  const at = itemPosition(room, target);
  if (!at) return name;
  const distance = (m: number) => (Number.isFinite(m) ? `${formatLength(m, unit)} ${unit}` : 'an unknown distance');
  return `${name}, ${distance(at.x)} from the front wall and ${distance(at.z)} from the right wall`;
}

/** The description every draggable item shares. */
export function nudgeHint(unit: Unit): string {
  return `Drag it, or use the arrow keys to move it ${formatLength(NUDGE_M, unit)} ${unit} at a time.`;
}

/** A rug's rectangle in the drawing, cut to the floor: a rug bigger than the room is drawn as the floor it covers. */
export function rugRect(plan: Plan, dims: Dims, rug: RugFix): PlanRect | null {
  const size = RUG_SIZES[rug.size];
  if (![rug.x, rug.z, dims.length, dims.width].every(Number.isFinite)) return null;
  const x0 = Math.max(0, rug.x - size.x / 2);
  const x1 = Math.min(dims.length, rug.x + size.x / 2);
  const z0 = Math.max(0, rug.z - size.z / 2);
  const z1 = Math.min(dims.width, rug.z + size.z / 2);
  const corner = toPlan(plan, { x: x0, z: z0 });
  return { x: corner.px, y: corner.py, width: Math.max(0, x1 - x0) * plan.scale, height: Math.max(0, z1 - z0) * plan.scale };
}

/** A panel as a thick line along its wall. (Panels are placed with "+ Panel" or in the 3D view; the top view only shows them.) */
export function panelSegment(plan: Plan, dims: Dims, panel: PanelFix): Segment | null {
  if (![panel.u, dims.length, dims.width].every(Number.isFinite)) return null;
  const a = panel.u - PANEL_SIZE.u / 2;
  const b = panel.u + PANEL_SIZE.u / 2;
  const [from, to] =
    panel.wall === 'wallX0'
      ? [{ x: 0, z: a }, { x: 0, z: b }]
      : panel.wall === 'wallX1'
        ? [{ x: dims.length, z: a }, { x: dims.length, z: b }]
        : panel.wall === 'wallZ0'
          ? [{ x: a, z: 0 }, { x: b, z: 0 }]
          : [{ x: a, z: dims.width }, { x: b, z: dims.width }];
  const p = toPlan(plan, from);
  const q = toPlan(plan, to);
  return { x1: p.px, y1: p.py, x2: q.px, y2: q.py };
}

/** The way the listener faces, as an arrow `metres` long from their position. Null while a position is mid-edit. */
export function facingArrow(plan: Plan, room: RoomState, metres = 0.5): Segment | null {
  const yaw = listenerYaw(room.listener, room.speaker);
  if (![yaw, room.listener.x, room.listener.z].every(Number.isFinite)) return null;
  const from = toPlan(plan, room.listener);
  const to = toPlan(plan, { x: room.listener.x + Math.cos(yaw) * metres, z: room.listener.z + Math.sin(yaw) * metres });
  return { x1: from.px, y1: from.py, x2: to.px, y2: to.py };
}

/** The corners of an arrowhead at the end of `segment`, `size` units long, as SVG polygon points ("x,y x,y x,y"). */
export function arrowHead(segment: Segment, size = 7): string {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const bx = segment.x2 - ux * size; // the middle of the head's base, `size` back along the arrow
  const by = segment.y2 - uy * size;
  const half = size * 0.6;
  return [
    [segment.x2, segment.y2],
    [bx - uy * half, by + ux * half],
    [bx + uy * half, by - ux * half],
  ]
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

/** The scale bar, in the strip along the bottom of the drawing: 1 m, or 3 ft when lengths are shown in feet. */
export function scaleBar(plan: Plan, unit: Unit): Segment & { label: string } {
  const metres = unit === 'ft' ? 3 * 0.3048 : 1;
  const y = PLAN_H - PLAN_BAR_H / 2;
  return { x1: PLAN_PAD, y1: y, x2: PLAN_PAD + metres * plan.scale, y2: y, label: unit === 'ft' ? '3 ft' : '1 m' };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/topView.test.ts`
Expected: PASS (31 tests).

- [ ] **Step 5: One set of surface labels**

Create `src/lib/room/labels.ts`:
```ts
import type { Furnishing, SurfaceId } from './types';

/**
 * The names the app gives the six surfaces, as you stand facing the front wall: x runs from the front wall (x = 0)
 * toward the back wall, z from the right wall (z = 0) toward the left wall. The form, the top view and the setup
 * wizard all use these, so they never disagree.
 */
export const SURFACE_LABELS: Record<SurfaceId, string> = {
  floor: 'Floor',
  ceiling: 'Ceiling',
  wallX0: 'Front wall',
  wallX1: 'Back wall',
  wallZ0: 'Right wall',
  wallZ1: 'Left wall',
};

export const FURNISHING_LABELS: Record<Furnishing, string> = {
  bare: 'Bare (empty room)',
  some: 'Some (bed or sofa)',
  full: 'Full (bed, sofa, shelves, curtains)',
};
```

In `src/components/RoomForm.tsx`:
1. Delete the local `SURFACE_LABELS` and `FURNISHING_LABELS` constants.
2. Add `import { FURNISHING_LABELS, SURFACE_LABELS } from '@/lib/room/labels';` after the `constants` import.
3. Remove `type SurfaceId,` from the `@/lib/room/types` import (nothing else uses it there).

- [ ] **Step 6: The WebGL probe, shared**

Create `src/components/useWebGL.ts`. It holds the probe that was inside `RoomView.tsx`, moved verbatim (the setup wizard needs it in Task 5):
```ts
'use client';

import { useSyncExternalStore } from 'react';

let webglSupport: boolean | undefined;
const webglListeners = new Set<() => void>();

function subscribeWebGL(listener: () => void) {
  webglListeners.add(listener);
  return () => {
    webglListeners.delete(listener);
  };
}

/** The renderer failed to start even though the probe passed: switch every view to its no-WebGL version. */
export function markWebGLUnavailable(): void {
  webglSupport = false;
  webglListeners.forEach((l) => l());
}

/** Probed once and cached: React calls this on every render, and browsers cap how many WebGL contexts can live. three.js needs WebGL 2. */
export function hasWebGL(): boolean {
  if (webglSupport === undefined) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webglSupport = gl !== null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/** Whether this browser can show the 3D view. True while prerendering, so the page's first paint matches most browsers. */
export function useWebGL(): boolean {
  return useSyncExternalStore(subscribeWebGL, hasWebGL, () => true);
}
```

- [ ] **Step 7: The TopView component**

Create `src/components/TopView.tsx`:
```tsx
'use client';

import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { SURFACE_LABELS } from '@/lib/room/labels';
import type { DragTarget } from '@/lib/room/placement';
import {
  arrowHead,
  clientToPlan,
  dragTo,
  facingArrow,
  fromPlan,
  itemLabel,
  itemPosition,
  nudge,
  nudgeHint,
  panelSegment,
  PLAN_H,
  PLAN_W,
  planFor,
  rugRect,
  scaleBar,
  toPlan,
  type Grab,
} from '@/lib/room/topView';
import type { RoomState } from '@/lib/room/types';
import type { Unit } from '@/lib/room/units';
import { LISTENER_COLOR, MATERIAL_COLORS, SPEAKER_COLOR } from '@/lib/scene/colors';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const HIT_R = 22; // a 44-unit circle: at least 44 px across at phone width
const DOT_R = 8;
const SPEAKER: DragTarget = { kind: 'speaker' };
const LISTENER: DragTarget = { kind: 'listener' };
const wallText = 'fill-neutral-400 text-[11px]';

type TopViewProps = {
  room: RoomState;
  /** Apply a change to the room: the store's `update`, or the wizard's. */
  onChange: (change: (room: RoomState) => RoomState) => void;
  unit: Unit;
  /** The drawing's accessible name. */
  label: string;
};

/**
 * The room from above, as the 3D view's Top camera shows it (front wall on the left, right wall at the top). Drag the
 * speaker, the listener or the rug, or focus one and use the arrow keys. Panels are shown, not placed: "+ Panel" finds
 * a free spot, and the 3D view places one where you tap.
 */
export function TopView({ room, onChange, unit, label }: TopViewProps) {
  const [drag, setDrag] = useState<{ target: DragTarget; pointerId: number; grab: Grab } | null>(null);
  const hintId = useId();
  const plan = planFor(room.dims);
  if (!plan) return <p className="text-sm text-neutral-400">Enter the room&apos;s size to see it from above.</p>;

  const corner = toPlan(plan, { x: 0, z: 0 });
  const far = toPlan(plan, { x: room.dims.length, z: room.dims.width });
  const middle = { x: (corner.px + far.px) / 2, y: (corner.py + far.py) / 2 };
  const placed = (p: { x: number; z: number }) => (Number.isFinite(p.x) && Number.isFinite(p.z) ? toPlan(plan, p) : null);
  const speaker = placed(room.speaker);
  const listener = placed(room.listener);
  const arrow = facingArrow(plan, room);
  const bar = scaleBar(plan, unit);

  function pointerPoint(e: PointerEvent<SVGGElement>) {
    const svg = e.currentTarget.ownerSVGElement;
    return svg ? clientToPlan(svg.getBoundingClientRect(), e.clientX, e.clientY) : null;
  }

  function startDrag(target: DragTarget, e: PointerEvent<SVGGElement>) {
    const point = pointerPoint(e);
    const at = itemPosition(room, target);
    if (!plan || !point || !at) return;
    const p = fromPlan(plan, point.px, point.py);
    e.currentTarget.setPointerCapture(e.pointerId); // moves outside the drawing keep coming here; applyDrag clamps them
    setDrag({ target, pointerId: e.pointerId, grab: { x: at.x - p.x, z: at.z - p.z } });
  }

  function moveDrag(e: PointerEvent<SVGGElement>) {
    const point = pointerPoint(e);
    if (!plan || !drag || drag.pointerId !== e.pointerId || !point) return;
    onChange((r) => dragTo(r, plan, drag.target, point.px, point.py, drag.grab));
  }

  function endDrag(e: PointerEvent<SVGGElement>) {
    if (drag?.pointerId === e.pointerId) setDrag(null);
  }

  function onKey(target: DragTarget, e: KeyboardEvent<SVGGElement>) {
    if (!nudge(room, target, e.key)) return; // not an arrow key: the page keeps it
    e.preventDefault();
    onChange((r) => nudge(r, target, e.key) ?? r);
  }

  /** What makes an item draggable, focusable and movable with the arrow keys. */
  const handle = (target: DragTarget) => ({
    role: 'button',
    tabIndex: 0,
    'aria-label': itemLabel(room, target, unit),
    'aria-describedby': hintId,
    className: 'group cursor-grab outline-none',
    onPointerDown: (e: PointerEvent<SVGGElement>) => startDrag(target, e),
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: endDrag,
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => onKey(target, e),
  });

  return (
    <div className="flex flex-col gap-2">
      <svg
        viewBox={`0 0 ${PLAN_W} ${PLAN_H}`}
        role="group"
        aria-label={label}
        className="block aspect-[4/3] w-full touch-none select-none rounded-xl border border-neutral-800 bg-neutral-950"
      >
        <rect
          x={corner.px}
          y={corner.py}
          width={far.px - corner.px}
          height={far.py - corner.py}
          className="fill-neutral-900 stroke-neutral-500"
          strokeWidth={1.5}
        />
        <text x={middle.x} y={corner.py - 8} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallZ0}
        </text>
        <text x={middle.x} y={far.py + 16} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallZ1}
        </text>
        <text transform={`translate(${corner.px - 8} ${middle.y}) rotate(-90)`} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallX0}
        </text>
        <text transform={`translate(${far.px + 8} ${middle.y}) rotate(90)`} textAnchor="middle" className={wallText}>
          {SURFACE_LABELS.wallX1}
        </text>

        {room.fixes.map((fix, index) => {
          if (fix.kind === 'panel') {
            const segment = panelSegment(plan, room.dims, fix);
            return (
              segment && (
                <line key={index} {...segment} stroke={hex(MATERIAL_COLORS.acousticPanel)} strokeWidth={5} strokeOpacity={fix.on ? 1 : 0.4} />
              )
            );
          }
          const rect = rugRect(plan, room.dims, fix);
          return (
            rect && (
              <g key={index} {...handle({ kind: 'rug', index })}>
                <rect {...rect} fill={hex(MATERIAL_COLORS.rug)} fillOpacity={fix.on ? 0.6 : 0.25} />
                <rect {...rect} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
              </g>
            )
          );
        })}

        {speaker && (
          <g {...handle(SPEAKER)}>
            <circle cx={speaker.px} cy={speaker.py} r={HIT_R} fill="transparent" />
            <circle cx={speaker.px} cy={speaker.py} r={DOT_R} fill={hex(SPEAKER_COLOR)} />
            <circle cx={speaker.px} cy={speaker.py} r={DOT_R + 5} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        )}
        {arrow && (
          <g pointerEvents="none">
            <line {...arrow} stroke={hex(LISTENER_COLOR)} strokeWidth={2} />
            <polygon points={arrowHead(arrow)} fill={hex(LISTENER_COLOR)} />
          </g>
        )}
        {listener && (
          <g {...handle(LISTENER)}>
            <circle cx={listener.px} cy={listener.py} r={HIT_R} fill="transparent" />
            <circle cx={listener.px} cy={listener.py} r={DOT_R} fill={hex(LISTENER_COLOR)} />
            <circle cx={listener.px} cy={listener.py} r={DOT_R + 5} fill="none" stroke="white" strokeWidth={2} className="opacity-0 group-focus-visible:opacity-100" />
          </g>
        )}

        <line x1={bar.x1} y1={bar.y1} x2={bar.x2} y2={bar.y2} className="stroke-neutral-300" strokeWidth={2} />
        <text x={bar.x2 + 6} y={bar.y1 + 4} className={wallText}>
          {bar.label}
        </text>
      </svg>
      <p id={hintId} className="sr-only">
        {nudgeHint(unit)}
      </p>
    </div>
  );
}
```
Notes for the implementer:
- **Keep the drag in state and get the SVG from `ownerSVGElement`.** A `useRef` read inside the handlers that `handle()` returns is flagged by `react-hooks/refs` ("Cannot access refs during render"), because `handle()` runs during render.
- **`touch-none` on the SVG** keeps a finger drag from scrolling the page. The drawing is about a third of a phone screen, so the page still scrolls from elsewhere.
- **Draw order:** the listener is drawn last, so its hit circle wins over the speaker's where they overlap.

- [ ] **Step 8: The room page without WebGL**

In `src/components/RoomView.tsx`:
1. Change `import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';` to `import { useEffect, useMemo, useRef, useState } from 'react';`.
2. After the `ScanController` import, add:
   ```tsx
   import { TopView } from './TopView';
   import { useUnits } from './useUnits';
   import { hasWebGL, markWebGLUnavailable, useWebGL } from './useWebGL';
   ```
3. Delete the module-level probe: everything from `let webglSupport: boolean | undefined;` through the closing brace of `function hasWebGL()` (it now lives in `useWebGL.ts`).
4. Replace `const webgl = useSyncExternalStore(subscribeWebGL, hasWebGL, () => true);` with:
   ```tsx
   const webgl = useWebGL();
   const [unit] = useUnits();
   ```
5. Replace the whole `if (!webgl) { return ( <p …>The 3D view needs WebGL… </p> ); }` block with:
   ```tsx
   if (!webgl) {
     return (
       <section aria-label="Top view of your room" className="flex flex-col gap-2">
         <p className="text-sm text-neutral-400">Your browser can&apos;t show the 3D view, so here&apos;s a top view.</p>
         <TopView room={room} onChange={update} unit={unit} label="Your room from above" />
       </section>
     );
   }
   ```
The scene effect's calls to `hasWebGL()` and `markWebGLUnavailable()` stay as they are; they now come from the import.

- [ ] **Step 9: Check and commit**

Run `npm test` (PASS, 554 tests), `npx tsc --noEmit` and `npm run lint` (both clean).
```powershell
git add -- src/lib/room/labels.ts src/lib/room/topView.ts src/lib/room/topView.test.ts src/components/useWebGL.ts src/components/TopView.tsx src/components/RoomForm.tsx src/components/RoomView.tsx
git commit -m "feat: a top view to place the speaker, listener and rug, shown when the browser has no WebGL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/room/labels.ts src/lib/room/topView.ts src/lib/room/topView.test.ts src/components/useWebGL.ts src/components/TopView.tsx src/components/RoomForm.tsx src/components/RoomView.tsx
```

- [ ] **Step 10: Controller browser checks**

Run `npm run build` and serve `out/`. Open `/room` once normally, then again with WebGL blocked. chrome-devtools `navigate_page` takes an `initScript`; use:
```js
const getContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
  return type === 'webgl2' || type === 'webgl' ? null : getContext.call(this, type, ...rest);
};
```
Check:
- **The notice:** "Your browser can't show the 3D view, so here's a top view." shows above the drawing.
- **Orientation:** the front wall is on the left, the back wall on the right, the right wall at the top. Compare with the 3D view's Top button (normal load): the speaker and listener sit in the same places.
- **Dragging:** dragging the speaker moves it. Dragging it far off the drawing, onto the page header, leaves it 0.3 m (1.0 ft) from both walls. The form's Speaker x and Speaker z fields follow.
- **Keyboard:** Tab reaches the speaker, listener and rug. Each shows a white focus ring. Arrow keys move it 0.1 m, and the accessible name updates ("Speaker, 0.7 m from the front wall …"). Other keys scroll the page as usual.
- **Rug and panels:** add a rug and a panel in the form. The rug is draggable; the panel shows as a green line on its wall. Make the room 1.5 × 1.5 m with a Large rug: the rug is drawn cut to the floor, and the form says "The rug must fit inside the floor."
- **Feet:** switch to feet. The scale bar reads "3 ft" and the names use ft.
- No console errors.

---

### Task 3: The tap-a-surface picker

**Files:**
- Create: `src/lib/room/surfaceDiagram.ts`, `src/lib/room/surfaceDiagram.test.ts`, `src/components/SurfacePicker.tsx`

**Interfaces:**
- Consumes: `SURFACE_LABELS` (Task 2); `MATERIALS` from `@/lib/acoustics/materials`; `MATERIAL_COLORS` from `@/lib/scene/colors`; `MATERIAL_IDS`, `SURFACE_IDS` from `@/lib/room/types`.
- Produces:
  ```ts
  // src/lib/room/surfaceDiagram.ts
  DIAGRAM_W = 320; DIAGRAM_H = 256
  type Point = [x: number, y: number];
  type DiagramShape = { surface: SurfaceId; points: Point[]; label: Point };
  surfaceDiagram(dims: Dims): DiagramShape[]   // six shapes, one per surface
  // src/components/SurfacePicker.tsx
  SurfacePicker({ room: RoomState; selected: SurfaceId; onSelect: (s: SurfaceId) => void; onMaterial: (s: SurfaceId, m: MaterialId) => void })
  ```

What it does:
- **The drawing** looks at the front wall from behind the back wall, which is cut away (see "Decided here" for why this isn't an oblique projection). The front wall is a rectangle, with the floor, ceiling and both side walls as trapezoids around it. The back wall ("behind you") is a dashed strip below.
- **Shape and colour:** the open end has the room's width-to-height shape, and a deeper room has a smaller front wall, both within limits. Each surface is tinted with its material's colour from `MATERIAL_COLORS`.
- **Choosing:** tapping a surface or its button in the list of six ("Floor: Wood floor" …) selects it. The radio group under the list sets the selected surface's material.
- **The drawing is `aria-hidden`.** Keyboard and screen-reader visitors use the list, which also meets the 44 px target as the drawing's equivalent control.
- **The picker has no page until Task 4,** so its browser checks run there.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/surfaceDiagram.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DIAGRAM_H, DIAGRAM_W, surfaceDiagram, type DiagramShape, type Point } from './surfaceDiagram';
import { SURFACE_IDS, type Dims, type SurfaceId } from './types';

const ROOMS: Dims[] = [
  { length: 4, width: 3.5, height: 2.6 }, // the default room
  { length: 30, width: 1.5, height: 15 }, // deep, narrow and tall
  { length: 1.5, width: 30, height: 2 }, // shallow and very wide
  { length: 30, width: 30, height: 2 },
  { length: 1.5, width: 1.5, height: 15 },
  { length: Number.NaN, width: 0, height: -1 }, // mid-edit
];

const shape = (shapes: DiagramShape[], surface: SurfaceId) => shapes.find((s) => s.surface === surface)!;
const xs = (s: DiagramShape) => s.points.map((p) => p[0]);
const ys = (s: DiagramShape) => s.points.map((p) => p[1]);
const widthOf = (s: DiagramShape) => Math.max(...xs(s)) - Math.min(...xs(s));
const heightOf = (s: DiagramShape) => Math.max(...ys(s)) - Math.min(...ys(s));

/** Shoelace area of a polygon. */
function area(points: Point[]): number {
  let sum = 0;
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  });
  return Math.abs(sum) / 2;
}

/** Whether a point is strictly inside a polygon (ray casting). */
function inside([x, y]: Point, points: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('surfaceDiagram', () => {
  it('draws each of the six surfaces once', () => {
    const surfaces = surfaceDiagram(ROOMS[0]).map((s) => s.surface);
    expect([...surfaces].sort()).toEqual([...SURFACE_IDS].sort());
  });

  it('stays inside the drawing for any room, even one mid-edit', () => {
    for (const dims of ROOMS) {
      for (const s of surfaceDiagram(dims)) {
        for (const [x, y] of s.points) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(DIAGRAM_W);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(DIAGRAM_H);
        }
      }
    }
  });

  it('puts each label inside its own surface and no other, so a tap lands on one surface', () => {
    for (const dims of ROOMS) {
      const shapes = surfaceDiagram(dims);
      for (const s of shapes) {
        expect(inside(s.label, s.points)).toBe(true);
        for (const other of shapes) if (other !== s) expect(inside(s.label, other.points)).toBe(false);
      }
    }
  });

  it('keeps every surface big enough to tap', () => {
    for (const dims of ROOMS) {
      for (const s of surfaceDiagram(dims)) {
        expect(Math.min(widthOf(s), heightOf(s))).toBeGreaterThanOrEqual(24);
        expect(area(s.points)).toBeGreaterThan(4000);
      }
    }
  });

  it("gives the front wall the room's width-to-height shape", () => {
    const front = shape(surfaceDiagram({ length: 4, width: 3.5, height: 2.6 }), 'wallX0');
    expect(widthOf(front) / heightOf(front)).toBeCloseTo(3.5 / 2.6, 9);
  });

  it('shows a deeper room with a smaller front wall', () => {
    const shallow = shape(surfaceDiagram({ length: 3, width: 3, height: 3 }), 'wallX0');
    const deep = shape(surfaceDiagram({ length: 6, width: 3, height: 3 }), 'wallX0');
    expect(widthOf(deep)).toBeLessThan(widthOf(shallow));
  });

  it('puts the left wall on the left and the right wall on the right, facing the front wall', () => {
    const shapes = surfaceDiagram(ROOMS[0]);
    expect(Math.max(...xs(shape(shapes, 'wallZ1')))).toBeLessThanOrEqual(Math.min(...xs(shape(shapes, 'wallX0'))) + 1e-9);
    expect(Math.min(...xs(shape(shapes, 'wallZ0')))).toBeGreaterThanOrEqual(Math.max(...xs(shape(shapes, 'wallX0'))) - 1e-9);
    expect(Math.min(...ys(shape(shapes, 'floor')))).toBeGreaterThanOrEqual(Math.min(...ys(shape(shapes, 'ceiling'))));
    expect(Math.min(...ys(shape(shapes, 'wallX1')))).toBeGreaterThan(Math.max(...ys(shape(shapes, 'floor')))); // the back wall's strip is below
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/surfaceDiagram.test.ts`
Expected: FAIL. Vitest can't resolve `./surfaceDiagram`.

- [ ] **Step 3: Implement the geometry**

Create `src/lib/room/surfaceDiagram.ts`:
```ts
import type { Dims, SurfaceId } from './types';

/** The surface picker's drawing size, in SVG units. The SVG scales to its column and keeps this shape. */
export const DIAGRAM_W = 320;
export const DIAGRAM_H = 256;

export type Point = [x: number, y: number];
/** One tappable surface: its outline, and a point inside it for its label. */
export type DiagramShape = { surface: SurfaceId; points: Point[]; label: Point };

const PAD = 8;
const STRIP_H = 44; // the back wall's strip is a full 44-unit touch target
const GAP = 8;
const BOX_H = DIAGRAM_H - 2 * PAD - STRIP_H - GAP; // the room's open end fits in (DIAGRAM_W − 2·PAD) × BOX_H
const FALLBACK: Dims = { length: 4, width: 3.5, height: 2.6 }; // the default room, for a size that is mid-edit

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const size = (value: number, fallback: number) => (Number.isFinite(value) && value > 0 ? value : fallback);

/**
 * The room drawn from behind its back wall, looking at the front wall, with the back wall cut away: the front wall ahead,
 * the left and right walls at the sides, the floor below and the ceiling above. The back wall is a strip under the
 * drawing. The open end has the room's width-to-height shape and the front wall shrinks with the room's depth, both
 * within limits that keep every surface at least 24 units across, so each stays big enough to tap.
 */
export function surfaceDiagram(dims: Dims): DiagramShape[] {
  const length = size(dims.length, FALLBACK.length);
  const width = size(dims.width, FALLBACK.width);
  const height = size(dims.height, FALLBACK.height);
  const aspect = clamp(width / height, 0.75, 2.4); // the open end's width ÷ height
  const across = Math.max(width, height);
  const depth = clamp(across / (across + length), 0.4, 0.6); // the front wall's size ÷ the open end's: deeper rooms recede more
  const openW = Math.min(DIAGRAM_W - 2 * PAD, BOX_H * aspect);
  const openH = openW / aspect;
  const cx = DIAGRAM_W / 2;
  const cy = PAD + BOX_H / 2;
  const near = { l: cx - openW / 2, r: cx + openW / 2, t: cy - openH / 2, b: cy + openH / 2 };
  const far = { l: cx - (openW * depth) / 2, r: cx + (openW * depth) / 2, t: cy - (openH * depth) / 2, b: cy + (openH * depth) / 2 };
  const stripTop = PAD + BOX_H + GAP;

  return [
    {
      surface: 'wallX0', // the front wall, straight ahead
      points: [[far.l, far.t], [far.r, far.t], [far.r, far.b], [far.l, far.b]],
      label: [cx, cy],
    },
    {
      surface: 'floor',
      points: [[near.l, near.b], [near.r, near.b], [far.r, far.b], [far.l, far.b]],
      label: [cx, (near.b + far.b) / 2],
    },
    {
      surface: 'ceiling',
      points: [[near.l, near.t], [far.l, far.t], [far.r, far.t], [near.r, near.t]],
      label: [cx, (near.t + far.t) / 2],
    },
    {
      surface: 'wallZ1', // the left wall, on your left as you face the front wall
      points: [[near.l, near.t], [near.l, near.b], [far.l, far.b], [far.l, far.t]],
      label: [(near.l + far.l) / 2, cy],
    },
    {
      surface: 'wallZ0', // the right wall
      points: [[near.r, near.t], [far.r, far.t], [far.r, far.b], [near.r, near.b]],
      label: [(near.r + far.r) / 2, cy],
    },
    {
      surface: 'wallX1', // the back wall, behind you: drawn as a strip of its own
      points: [[PAD, stripTop], [DIAGRAM_W - PAD, stripTop], [DIAGRAM_W - PAD, stripTop + STRIP_H], [PAD, stripTop + STRIP_H]],
      label: [cx, stripTop + STRIP_H / 2],
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/surfaceDiagram.test.ts`
Expected: PASS (7 tests). The "big enough to tap" test is what holds the clamps in place: without them, the deep, narrow and tall room's side walls shrink to a few units.

- [ ] **Step 5: The picker**

Create `src/components/SurfacePicker.tsx`:
```tsx
'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { SURFACE_LABELS } from '@/lib/room/labels';
import { DIAGRAM_H, DIAGRAM_W, surfaceDiagram } from '@/lib/room/surfaceDiagram';
import { MATERIAL_IDS, SURFACE_IDS, type MaterialId, type RoomState, type SurfaceId } from '@/lib/room/types';
import { MATERIAL_COLORS } from '@/lib/scene/colors';

const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

type SurfacePickerProps = {
  room: RoomState;
  selected: SurfaceId;
  onSelect: (surface: SurfaceId) => void;
  onMaterial: (surface: SurfaceId, material: MaterialId) => void;
};

/**
 * Pick a surface, then its material. The drawing (each surface tinted with its material) is for pointers; the list of
 * six buttons does the same for keyboards and screen readers, and both stay in step.
 */
export function SurfacePicker({ room, selected, onSelect, onMaterial }: SurfacePickerProps) {
  // The selected surface is drawn last, so its outline isn't painted over by its neighbours.
  const shapes = surfaceDiagram(room.dims).sort((a, b) => Number(a.surface === selected) - Number(b.surface === selected));
  return (
    <div className="flex flex-col gap-4">
      <svg viewBox={`0 0 ${DIAGRAM_W} ${DIAGRAM_H}`} aria-hidden="true" className="block w-full select-none">
        {shapes.map(({ surface, points, label }) => {
          const isSelected = surface === selected;
          return (
            <g key={surface} onClick={() => onSelect(surface)} className="cursor-pointer">
              <polygon
                points={points.map((p) => p.join(',')).join(' ')}
                fill={hex(MATERIAL_COLORS[room.surfaces[surface]])}
                fillOpacity={isSelected ? 0.95 : 0.6}
                stroke={isSelected ? 'white' : '#404040'}
                strokeWidth={isSelected ? 3 : 1}
                strokeDasharray={surface === 'wallX1' ? '6 4' : undefined}
              />
              <text
                x={label[0]}
                y={label[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={surface === 'wallZ0' || surface === 'wallZ1' ? `rotate(-90 ${label[0]} ${label[1]})` : undefined}
                stroke="#0a0a0a"
                strokeWidth={3}
                paintOrder="stroke"
                className="fill-white text-[11px] font-semibold"
              >
                {surface === 'wallX1' ? 'Back wall (behind you)' : SURFACE_LABELS[surface]}
              </text>
            </g>
          );
        })}
      </svg>

      <ul aria-label="Surfaces" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SURFACE_IDS.map((surface) => (
          <li key={surface}>
            <button
              type="button"
              aria-pressed={surface === selected}
              onClick={() => onSelect(surface)}
              className={`flex min-h-11 w-full items-center gap-2 rounded-md border px-3 text-left text-sm ${surface === selected ? 'border-white' : 'border-neutral-700'}`}
            >
              <span aria-hidden="true" className="size-3 shrink-0 rounded-sm" style={{ background: hex(MATERIAL_COLORS[room.surfaces[surface]]) }} />
              {SURFACE_LABELS[surface]}: {MATERIALS[room.surfaces[surface]].label}
            </button>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold">{SURFACE_LABELS[selected]}: what is it made of?</legend>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {MATERIAL_IDS.map((material) => (
            <label key={material} className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="radio"
                name="surface-material"
                checked={room.surfaces[selected] === material}
                onChange={() => onMaterial(selected, material)}
              />
              {MATERIALS[material].label}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
```
The labels on the drawing are white with a near-black halo (`paintOrder="stroke"`), so they read on light materials such as plaster and on dark ones such as carpet.

- [ ] **Step 6: Check and commit**

Run `npm test` (PASS, 561 tests), `npx tsc --noEmit` and `npm run lint` (both clean).
```powershell
git add -- src/lib/room/surfaceDiagram.ts src/lib/room/surfaceDiagram.test.ts src/components/SurfacePicker.tsx
git commit -m "feat: a tap-a-surface diagram for choosing materials" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/room/surfaceDiagram.ts src/lib/room/surfaceDiagram.test.ts src/components/SurfacePicker.tsx
```

- [ ] **Step 7: Controller browser checks**

None here: the picker has no page until Task 4, whose checks cover it.

---

### Task 4: The setup wizard, the first visit, and the ways in

**Files:**
- Create: `src/lib/room/wizard.ts`, `src/lib/room/wizard.test.ts`, `src/app/setup/page.tsx`, `src/components/MyRoomsLink.tsx`
- Modify: `src/lib/room/rooms.ts`, `src/lib/room/rooms.test.ts`, `src/lib/room/session.test.ts`, `src/components/useRoomSession.ts`, `src/app/page.tsx`, `src/components/RoomsMenu.tsx`

**Interfaces:**
- Consumes: `clampPosition` from `./placement`; `defaultRoom`, `validateRoom`, `RoomError` from `./roomState`; `encodeRoom` from `./urlCodec`; `loadRooms`, `uniqueName`, `ROOMS_KEY`, `RoomsStorage` from `./rooms`; `browserStorage`, `useUnits`, `Toggle`, `LengthField`, `inputClass` (Task 1); `errorMessage` (Task 1); `TopView` (Task 2); `FURNISHING_LABELS` (Task 2); `SurfacePicker` (Task 3).
- Produces:
  ```ts
  // src/lib/room/wizard.ts
  WIZARD_STEPS = ['size', 'surfaces', 'placement', 'scan'] as const; type WizardStep
  type WizardState = { step: WizardStep; room: RoomState; surface: SurfaceId };
  type WizardAction =
    | { type: 'update'; change: (room: RoomState) => RoomState }
    | { type: 'selectSurface'; surface: SurfaceId }
    | { type: 'next' }
    | { type: 'back' };
  startWizard(): WizardState
  stepNumber(step: WizardStep): number
  stepErrors(step: WizardStep, room: RoomState): RoomError[]
  readyToOpen(state: WizardState): boolean
  fitPositions(room: RoomState): RoomState
  wizardReducer(state: WizardState, action: WizardAction): WizardState
  // src/lib/room/rooms.ts
  hasRoomsFile(storage: RoomsStorage): boolean | null
  shouldRunSetup(storage: RoomsStorage, hash: string): boolean
  // src/components/MyRoomsLink.tsx
  MyRoomsLink()   // renders nothing without saved rooms
  ```
- The `/setup` route (`src/app/setup/page.tsx`).

What it does:
- **The steps:** Size (with the room name and the m/ft toggle) → Surfaces → Placement → Scan (optional). Back and Next, and "Step N of 4". Back always works. Next is disabled while its step has errors, which show under the step in the visitor's unit.
- **The starting room** is the app's default ("My room"). Leaving Size pulls the speaker and listener inside the new size.
- **"Open my room"** gives the room a name no saved room has, encodes it, and pushes `/room#v1.…`. The session imports it as a new room and clears the address bar. If encoding fails, the page says "Couldn't open your room. Try again." and keeps everything.
- **The first visit:** `/room` with no saved rooms and no link replaces itself with `/setup` before the session starts, so no "My room" is made first. With storage blocked, or with any link, the room page starts as before.
- **The ways in:** the landing page's "Try your room" goes to `/setup`, and a "My rooms" link appears next to it once rooms are saved. My rooms' "New room" goes to `/setup`. (`RoomSession.create()` stays, with its tests.)

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/wizard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';
import {
  readyToOpen,
  startWizard,
  stepErrors,
  stepNumber,
  wizardReducer,
  WIZARD_STEPS,
  type WizardAction,
  type WizardState,
} from './wizard';

const run = (state: WizardState, ...actions: WizardAction[]) => actions.reduce(wizardReducer, state);
const update = (change: (room: RoomState) => RoomState): WizardAction => ({ type: 'update', change });
const NEXT: WizardAction = { type: 'next' };
const BACK: WizardAction = { type: 'back' };
const setLength = (length: number) => update((r) => ({ ...r, dims: { ...r.dims, length } }));

describe('startWizard', () => {
  it('starts on the Size step with the default room, named My room', () => {
    const state = startWizard();
    expect(state.step).toBe('size');
    expect(state.room).toEqual(defaultRoom());
    expect(state.room.name).toBe('My room');
  });

  it('numbers the four steps', () => {
    expect(WIZARD_STEPS.map(stepNumber)).toEqual([1, 2, 3, 4]);
  });
});

describe('Next and Back', () => {
  it('walk through the steps in order and stop at the ends', () => {
    let state = startWizard();
    expect(wizardReducer(state, BACK)).toBe(state); // nothing before Size
    state = run(state, NEXT, NEXT, NEXT);
    expect(state.step).toBe('scan');
    expect(wizardReducer(state, NEXT)).toBe(state); // the last step opens the room instead
    expect(run(state, BACK, BACK, BACK).step).toBe('size');
  });

  it('keep every edit, on every step, through Back and Next', () => {
    const edited = run(
      startWizard(),
      update((r) => ({ ...r, name: 'Studio' })),
      setLength(5),
      NEXT,
      update((r) => ({ ...r, surfaces: { ...r.surfaces, floor: 'carpet' }, furnishing: 'full' })),
      { type: 'selectSurface', surface: 'ceiling' },
      NEXT,
      update((r) => ({ ...r, speaker: { ...r.speaker, x: 1.2, z: 0.8 } })),
    );
    const roundTrip = run(edited, BACK, BACK, NEXT, NEXT);
    expect(roundTrip.step).toBe('placement');
    expect(roundTrip.room).toEqual(edited.room);
    expect(roundTrip.surface).toBe('ceiling');
    expect(roundTrip.room).toMatchObject({ name: 'Studio', furnishing: 'full' });
    expect(roundTrip.room.dims.length).toBe(5);
    expect(roundTrip.room.surfaces.floor).toBe('carpet');
    expect(roundTrip.room.speaker).toMatchObject({ x: 1.2, z: 0.8 });
  });

  it("won't leave a step that has errors, and keeps what was typed", () => {
    const state = run(startWizard(), setLength(Number.NaN), NEXT);
    expect(state.step).toBe('size');
    expect(state.room.dims.length).toBeNaN();
    expect(stepErrors('size', state.room).map((e) => e.field)).toEqual(['dims.length']);
  });

  it('goes Back from a step with errors without losing them', () => {
    const atPlacement = run(startWizard(), NEXT, NEXT);
    const together = run(atPlacement, update((r) => ({ ...r, listener: { ...r.listener, x: 0.7, z: 1.4 } })));
    expect(stepErrors('placement', together.room)).toHaveLength(1);
    const back = run(together, BACK);
    expect(back.step).toBe('surfaces');
    expect(back.room.listener).toMatchObject({ x: 0.7, z: 1.4 });
    expect(run(back, NEXT, NEXT).step).toBe('placement'); // Surfaces has nothing wrong; Placement still does
  });

  it('pulls the speaker and listener inside a room made smaller', () => {
    const state = run(
      startWizard(),
      update((r) => ({ ...r, dims: { length: 1.5, width: 1.5, height: 2 } })),
      NEXT,
    );
    expect(state.step).toBe('surfaces');
    expect(stepErrors('placement', state.room)).toEqual([]);
    expect(state.room.listener).toMatchObject({ x: 1.2, z: 1.2, yaw: 'faceSpeaker' });
  });

  it("leaves positions alone when the size didn't push them out", () => {
    const placed = run(startWizard(), NEXT, NEXT, update((r) => ({ ...r, speaker: { ...r.speaker, x: 2.2 } })));
    expect(run(placed, BACK, BACK, NEXT).room.speaker.x).toBe(2.2);
  });
});

describe('stepErrors', () => {
  it('gives each step only its own errors', () => {
    const room: RoomState = { ...defaultRoom(), dims: { length: 40, width: 3.5, height: 2.6 } };
    expect(stepErrors('size', room).map((e) => e.field)).toEqual(['dims.length']);
    expect(stepErrors('surfaces', room)).toEqual([]);
    expect(stepErrors('placement', room)).toEqual([]);
    const misplaced: RoomState = { ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } };
    expect(stepErrors('size', misplaced)).toEqual([]);
    expect(stepErrors('placement', misplaced).map((e) => e.field)).toEqual(['speaker']);
  });
});

describe('readyToOpen', () => {
  it('is true only on the last step with a valid room', () => {
    expect(readyToOpen(startWizard())).toBe(false);
    const last = run(startWizard(), NEXT, NEXT, NEXT);
    expect(readyToOpen(last)).toBe(true);
    expect(readyToOpen(run(last, update((r) => ({ ...r, dims: { ...r.dims, height: 1 } }))))).toBe(false);
  });
});
```

In `src/lib/room/rooms.test.ts`:
1. Add `hasRoomsFile,` and `shouldRunSetup,` to the import from `./rooms` (alphabetical: `hasRoomsFile` after `findRoom`, `shouldRunSetup` after `serializeRooms`).
2. Append:
```ts
describe('the first visit', () => {
  it('knows whether a rooms file is stored, and when it cannot tell', () => {
    const storage = fakeStorage();
    expect(hasRoomsFile(storage)).toBe(false);
    storage.items.set(ROOMS_KEY, 'not even JSON'); // a file this build can't read is still a file
    expect(hasRoomsFile(storage)).toBe(true);
    expect(hasRoomsFile(fakeStorage(true))).toBeNull();
    expect(hasRoomsFile(null)).toBeNull();
  });

  it('sends a visitor with no rooms and no link to setup', () => {
    expect(shouldRunSetup(fakeStorage(), '')).toBe(true);
    expect(shouldRunSetup(fakeStorage(), '#')).toBe(true);
  });

  it('opens a link straight away, even on a first visit', () => {
    expect(shouldRunSetup(fakeStorage(), '#v1.abc')).toBe(false);
    expect(shouldRunSetup(fakeStorage(), '#garbage')).toBe(false); // the room page says the link couldn't be loaded
  });

  it('opens the room page for a visitor who has rooms', () => {
    const storage = fakeStorage();
    saveRooms(file(['a', 100, 'Studio']), storage);
    expect(shouldRunSetup(storage, '')).toBe(false);
  });

  it('starts as usual when storage is blocked or missing, so the visitor is never sent round in circles', () => {
    expect(shouldRunSetup(fakeStorage(true), '')).toBe(false);
    expect(shouldRunSetup(null, '')).toBe(false);
  });
});
```

In `src/lib/room/session.test.ts`, inside `describe('RoomSession start', …)`, add before `it('drops the link notice once a link loads', …)`:
```ts
  it('opens only the linked room on a first visit with a link, with no extra My room', async () => {
    const t = setup({ links: { code: named('From setup') } });
    t.setLink('code');
    await t.session.start();
    expect(t.saved().rooms.map((r) => r.state.name)).toEqual(['From setup']);
    expect(store().room.name).toBe('From setup');
    expect(store().notice).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to see which fail**

Run: `npx vitest run src/lib/room/wizard.test.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts`
Expected: FAIL for `wizard.test.ts` (Vitest can't resolve `./wizard`), and for the five new `rooms.test.ts` tests ("hasRoomsFile is not a function", "shouldRunSetup is not a function").

The new session test **passes already**. It pins the order in `RoomSession.start()` that the wizard depends on: a link is imported before `startRooms` would make a first room. If it fails, stop and report: the import path doesn't do what this plan assumes.

- [ ] **Step 3: Implement the wizard's reducer**

Create `src/lib/room/wizard.ts`:
```ts
import { clampPosition } from './placement';
import { defaultRoom, validateRoom, type RoomError } from './roomState';
import type { RoomState, SurfaceId } from './types';

/** The setup wizard's steps, in order. (Plan 2 adds a clap step between placement and scan.) */
export const WIZARD_STEPS = ['size', 'surfaces', 'placement', 'scan'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** Everything the wizard holds: the step, the room being set up, and the surface picked on the Surfaces step. */
export type WizardState = { step: WizardStep; room: RoomState; surface: SurfaceId };

export type WizardAction =
  | { type: 'update'; change: (room: RoomState) => RoomState }
  | { type: 'selectSurface'; surface: SurfaceId }
  | { type: 'next' }
  | { type: 'back' };

/** Which validation fields each step owns. */
const STEP_FIELDS: Record<WizardStep, (field: string) => boolean> = {
  size: (field) => field.startsWith('dims.'),
  surfaces: () => false,
  placement: (field) => field === 'speaker' || field === 'listener',
  scan: () => false,
};

/** The wizard's first state: the Size step, on the app's default room ("My room"). */
export function startWizard(): WizardState {
  return { step: 'size', room: defaultRoom(), surface: 'floor' };
}

/** The step's number, from 1: "Step 2 of 4". */
export function stepNumber(step: WizardStep): number {
  return WIZARD_STEPS.indexOf(step) + 1;
}

/** The room's validation errors that belong to this step. */
export function stepErrors(step: WizardStep, room: RoomState): RoomError[] {
  return validateRoom(room).filter((error) => STEP_FIELDS[step](error.field));
}

/** Whether the wizard can open its room: on the last step, with nothing wrong anywhere. */
export function readyToOpen(state: WizardState): boolean {
  return state.step === 'scan' && validateRoom(state.room).length === 0;
}

/** Keep the speaker and listener inside a room that was just resized: 0.3 m from every surface. */
export function fitPositions(room: RoomState): RoomState {
  return {
    ...room,
    speaker: clampPosition(room.dims, room.speaker),
    listener: { ...clampPosition(room.dims, room.listener), yaw: room.listener.yaw },
  };
}

/**
 * Back and Next never drop an edit: the room is one value the steps share. Next stays put while the step has errors;
 * leaving the Size step pulls the speaker and listener inside the new size. Back always works, errors or not.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  const index = WIZARD_STEPS.indexOf(state.step);
  switch (action.type) {
    case 'update':
      return { ...state, room: action.change(state.room) };
    case 'selectSurface':
      return { ...state, surface: action.surface };
    case 'back':
      return index > 0 ? { ...state, step: WIZARD_STEPS[index - 1] } : state;
    case 'next': {
      if (index === WIZARD_STEPS.length - 1 || stepErrors(state.step, state.room).length > 0) return state;
      const room = state.step === 'size' ? fitPositions(state.room) : state.room;
      return { ...state, step: WIZARD_STEPS[index + 1], room };
    }
  }
}
```

- [ ] **Step 4: The first-visit check**

Append to `src/lib/room/rooms.ts`:
```ts
/** Whether this browser has a saved-rooms file. Null when storage is missing or blocked, so it can't tell. */
export function hasRoomsFile(storage: RoomsStorage): boolean | null {
  if (!storage) return null;
  try {
    return storage.getItem(ROOMS_KEY) !== null;
  } catch {
    return null;
  }
}

/**
 * Whether the room page should send a visitor to setup first: a first visit, with no saved rooms and no link in the
 * address bar (`hash` is location.hash, '' or '#' for none). When storage can't be read the page starts as usual, so
 * blocked storage never sends a visitor round in circles.
 */
export function shouldRunSetup(storage: RoomsStorage, hash: string): boolean {
  return hash.length <= 1 && hasRoomsFile(storage) === false;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/wizard.test.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts`
Expected: PASS (10 wizard tests, 5 new rooms tests, 1 new session test).

- [ ] **Step 6: The setup page**

Before writing it, read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md`: `useRouter` comes from `next/navigation`, and `router.push`/`router.replace` take a path string.

Create `src/app/setup/page.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useReducer, useRef, useState } from 'react';
import { browserStorage } from '@/components/browserStorage';
import { inputClass, LengthField } from '@/components/LengthField';
import { SurfacePicker } from '@/components/SurfacePicker';
import { Toggle } from '@/components/Toggle';
import { TopView } from '@/components/TopView';
import { useUnits } from '@/components/useUnits';
import { FURNISHING_LABELS } from '@/lib/room/labels';
import { loadRooms, uniqueName } from '@/lib/room/rooms';
import type { Furnishing, RoomState } from '@/lib/room/types';
import { errorMessage } from '@/lib/room/units';
import { encodeRoom } from '@/lib/room/urlCodec';
import { readyToOpen, startWizard, stepErrors, stepNumber, WIZARD_STEPS, wizardReducer, type WizardStep } from '@/lib/room/wizard';

const TITLES: Record<WizardStep, string> = {
  size: 'How big is your room?',
  surfaces: 'What is each surface made of?',
  placement: 'Where are the speaker and you?',
  scan: 'Add a scan of your room (optional)',
};
const OPEN_ERROR = "Couldn't open your room. Try again.";
const buttonClass = 'min-h-11 rounded-lg border border-neutral-700 px-5 font-semibold disabled:opacity-40';
const primaryClass = 'min-h-11 rounded-lg bg-white px-5 font-semibold text-neutral-950 disabled:opacity-40';

/** Room setup: size, surfaces, placement and an optional scan. "Open my room" opens it through a share link. */
export default function SetupPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(wizardReducer, undefined, startWizard);
  const [unit, setUnit] = useUnits();
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(state.step);
  const { step, room } = state;
  const errors = stepErrors(step, room);
  const update = (change: (r: RoomState) => RoomState) => dispatch({ type: 'update', change });
  const setDim = (key: keyof RoomState['dims'], metres: number) => update((r) => ({ ...r, dims: { ...r.dims, [key]: metres } }));

  // A new step: focus its heading, so a screen reader says where the visitor is now. Not on the first render.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  async function openRoom() {
    setOpening(true);
    setOpenError(null);
    // A name no saved room has: the room then always opens as a new one, never as an identical saved room.
    const name = room.name.trim() ? uniqueName(loadRooms(browserStorage()), room.name) : room.name;
    try {
      const code = await encodeRoom({ ...room, name });
      router.push('/room#' + code);
    } catch {
      setOpenError(OPEN_ERROR);
      setOpening(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between gap-3 text-sm">
        <Link href="/" className="inline-flex min-h-11 items-center underline">
          Room Remix
        </Link>
        <p className="text-neutral-400">
          Step {stepNumber(step)} of {WIZARD_STEPS.length}
        </p>
      </header>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
        {TITLES[step]}
      </h1>

      {step === 'size' && (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-neutral-400">Room name</span>
            <input
              value={room.name}
              maxLength={80}
              placeholder="Untitled room"
              onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
              className={inputClass}
            />
          </label>
          <Toggle label="Units" options={['Metres', 'Feet']} value={unit === 'ft'} onChange={(feet) => setUnit(feet ? 'ft' : 'm')} />
          <div className="flex flex-wrap gap-3">
            <LengthField label="Length" metres={room.dims.length} unit={unit} onChange={(v) => setDim('length', v)} />
            <LengthField label="Width" metres={room.dims.width} unit={unit} onChange={(v) => setDim('width', v)} />
            <LengthField label="Ceiling height" metres={room.dims.height} unit={unit} onChange={(v) => setDim('height', v)} />
          </div>
          <p className="text-sm text-neutral-400">Measure wall to wall. Rough numbers are fine: you can change them later.</p>
        </div>
      )}

      {step === 'surfaces' && (
        <div className="flex flex-col gap-6">
          <SurfacePicker
            room={room}
            selected={state.surface}
            onSelect={(surface) => dispatch({ type: 'selectSurface', surface })}
            onMaterial={(surface, material) => update((r) => ({ ...r, surfaces: { ...r.surfaces, [surface]: material } }))}
          />
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-2 text-sm font-semibold">How much furniture is in it?</legend>
            {(Object.keys(FURNISHING_LABELS) as Furnishing[]).map((furnishing) => (
              <label key={furnishing} className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="furnishing"
                  checked={room.furnishing === furnishing}
                  onChange={() => update((r) => ({ ...r, furnishing }))}
                />
                {FURNISHING_LABELS[furnishing]}
              </label>
            ))}
          </fieldset>
        </div>
      )}

      {step === 'placement' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-neutral-300">
            Drag the speaker (orange) and the listener (blue) to where they are, or select one and use the arrow keys.
            The listener faces the speaker.
          </p>
          <TopView room={room} onChange={update} unit={unit} label="Your room from above" />
          <p className="text-sm text-neutral-400">You can set their heights, and try a rug or panels, once the room is open.</p>
        </div>
      )}

      {step === 'scan' && (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-neutral-300">
            If you&apos;ve scanned this room with an app such as Scaniverse or Polycam, you can add the scan from the 3D
            view once the room is open.
          </p>
          <p className="text-neutral-400">Open your room now to hear it.</p>
        </div>
      )}

      {/* Mounted all the time, so a screen reader announces an error when it appears. */}
      <div role="status" className="empty:sr-only">
        {errors.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
            {errors.map((e) => (
              <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
            ))}
          </ul>
        )}
      </div>

      <nav aria-label="Setup steps" className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => dispatch({ type: 'back' })} disabled={step === 'size'} className={buttonClass}>
          Back
        </button>
        {step === 'scan' ? (
          <button type="button" onClick={() => void openRoom()} disabled={opening || !readyToOpen(state)} className={primaryClass}>
            {opening ? 'Opening…' : 'Open my room'}
          </button>
        ) : (
          <button type="button" onClick={() => dispatch({ type: 'next' })} disabled={errors.length > 0} className={primaryClass}>
            Next
          </button>
        )}
      </nav>
      <p role="alert" className="text-sm text-red-400 empty:sr-only">
        {openError}
      </p>
    </main>
  );
}
```
Notes:
- **Refs:** `shownStep` and `headingRef` are only read inside the effect, which the lint allows.
- **Storage:** `loadRooms(browserStorage())` runs in the click handler, never during render or prerender. Blocked storage reads as no rooms, so the name is kept as typed.
- **The room name** may be left empty. The room page shows "Untitled room" for it, as it does today.

- [ ] **Step 7: The first visit goes to setup**

In `src/components/useRoomSession.ts`:
1. Add `import { useRouter } from 'next/navigation';` as the first import after `'use client';`.
2. Change `import { newRoomId, ROOMS_KEY } from '@/lib/room/rooms';` to `import { newRoomId, ROOMS_KEY, shouldRunSetup } from '@/lib/room/rooms';`.
3. In `useRoomSession`, add `const router = useRouter();` as the first line, change the effect's dependency list from `[]` to `[router]`, and make these the effect's first lines, before `const rooms = roomSession();`:
   ```ts
   // A first visit (no saved rooms, no link) sets the room up first, so no default room is made behind the visitor's back.
   if (shouldRunSetup(browserStorage(), window.location.hash)) {
     router.replace('/setup');
     return;
   }
   ```
`router.replace` keeps `/room` out of the history, so Back from setup goes back to wherever the visitor came from. The page shows "Opening your room…" for the moment before the redirect, because no room is open.

- [ ] **Step 8: The ways in**

Create `src/components/MyRoomsLink.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { hasRoomsFile, ROOMS_KEY } from '@/lib/room/rooms';
import { browserStorage } from './browserStorage';

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ROOMS_KEY || event.key === null) listener(); // another tab saved (or cleared) rooms
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

const hasRooms = () => hasRoomsFile(browserStorage()) === true;

/** "My rooms", for a visitor who has rooms saved in this browser. Nothing while prerendering or without saved rooms. */
export function MyRoomsLink() {
  const show = useSyncExternalStore(subscribe, hasRooms, () => false);
  if (!show) return null;
  return (
    <Link href="/room" className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-5 font-semibold">
      My rooms
    </Link>
  );
}
```

In `src/app/page.tsx`:
1. Add `import { MyRoomsLink } from '@/components/MyRoomsLink';` after the `ListenDemo` import.
2. Replace the "Try your room" `<Link …>…</Link>` with:
   ```tsx
   <div className="flex flex-wrap items-center gap-3">
     <Link href="/setup" className="inline-flex min-h-11 items-center rounded-lg bg-white px-5 py-3 font-semibold text-neutral-950">
       Try your room
     </Link>
     <MyRoomsLink />
   </div>
   ```
The page stays a Server Component; `MyRoomsLink` is the only client part. Leave the footer as it is (Task 7 changes it).

In `src/components/RoomsMenu.tsx`:
1. Add `import Link from 'next/link';` as the first import after `'use client';`.
2. Replace the "New room" `<button onClick={() => { roomSession().create(); close(); }} …>New room</button>` with:
   ```tsx
   <Link href="/setup" className={`${buttonClass} self-start`}>
     New room
   </Link>
   ```
Navigating away unmounts the room page; `useRoomSession`'s cleanup saves any pending edit first.

- [ ] **Step 9: Check, build and commit**

Run `npm test` (PASS, 577 tests), `npx tsc --noEmit`, `npm run lint` and `npm run build`. The build's route list must show `○ /setup` (static).
```powershell
git add -- src/lib/room/wizard.ts src/lib/room/wizard.test.ts src/lib/room/rooms.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts src/app/setup/page.tsx src/components/MyRoomsLink.tsx src/components/useRoomSession.ts src/app/page.tsx src/components/RoomsMenu.tsx
git commit -m "feat: a setup wizard for new rooms; the first visit starts there" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/room/wizard.ts src/lib/room/wizard.test.ts src/lib/room/rooms.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts src/app/setup/page.tsx src/components/MyRoomsLink.tsx src/components/useRoomSession.ts src/app/page.tsx src/components/RoomsMenu.tsx
```

- [ ] **Step 10: Controller browser checks**

Serve `out/`. Use a fresh isolated browser context (chrome-devtools `new_page` with `isolatedContext`) and a 375 × 812 mobile viewport. Check:
- **First visit:** `/room` turns into `/setup` ("Step 1 of 4"). The landing page shows no "My rooms" link yet.
- **Size:** in feet, Length "4.9" shows "Length must be between 5.0 and 98.4 ft." and disables Next. Back is disabled on step 1. "5.0" clears the error.
- **Focus:** Next moves focus to the new step's heading.
- **Surfaces:** the drawing shows the front wall ahead, the left and right walls at the sides, the floor and ceiling, and "Back wall (behind you)" below. Tapping the left wall in the drawing presses "Left wall: Glass / window" in the list, and the radios follow. Choosing Carpet re-tints that surface. The furnishing radios work.
- **Placement:** drag the speaker and the listener. The arrow keys move a focused item.
- **Back and Next:** go Back twice and Next twice. The size, materials and positions are all still there.
- **Open my room:** "Open my room" opens `/room` with a clean address bar, named "My room". My rooms lists exactly one room.
- **Second run:** the landing page now shows "My rooms". "Try your room" with all the defaults → "Open my room" opens "My room 2", a second room.
- **New room:** My rooms → New room goes to `/setup`.
- **Shared links:** in another fresh context, opening a share link (copied with Share link) goes straight to the room, with no setup, and makes one room.
- **Blocked storage:** in another fresh context, load `/room` with this `initScript`:
  ```js
  Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('The operation is insecure.', 'SecurityError'); } });
  ```
  The page stays on `/room`, opens "My room", and shows "This browser isn't keeping your rooms …". It does not go to setup.
- **Phone width:** no horizontal scroll on any step. No console errors.

---

### Task 5: A scan picked in setup arrives in the room

**Files:**
- Create: `src/components/pendingScan.ts`, `src/components/pendingScan.test.ts`
- Modify: `src/lib/room/session.ts`, `src/lib/room/session.test.ts`, `src/components/useRoomSession.ts`, `src/components/RoomView.tsx`, `src/app/setup/page.tsx`

**Interfaces:**
- Consumes: `ScanController.open(file, room)` and `roomKey` (5a); `useWebGL` (Task 2); the setup page and `useRoomSession` as left by Task 4.
- Produces:
  ```ts
  // src/components/pendingScan.ts
  setPendingScan(scan: { file: File; link: string } | null): void
  assignPendingScan(link: string, roomId: string): void
  pendingScanRoom(): string | null
  takePendingScan(roomId: string): File | null
  returnPendingScan(roomId: string, file: File): void
  subscribePendingScan(listener: () => void): () => void
  // src/lib/room/session.ts
  RoomSession.start(): Promise<string | null>   // the id of the room a link opened, else null
  ```

How the handoff works:
1. **Setup:** "Open my room" calls `setPendingScan({ file, link: code })`, then pushes `/room#<code>`. With no scan picked it calls `setPendingScan(null)`, which clears any earlier one.
2. **The room page:** `useRoomSession` reads the code from the address bar before `start()` takes it out. When `start()` resolves to the id of the room that link opened, it calls `assignPendingScan(code, id)`. A scan waiting for another link stays where it is.
3. **The 3D view:** `RoomView` watches `pendingScanRoom()` (a `useSyncExternalStore`). Once its `ScanController` is on that room, it takes the file and calls `scans.open(file, room)`, the 5a load path that stores the scan and offers "Align scan".
4. **A room page open earlier in the visit** first shows the room that was open before, then switches. The scan waits for the switch, because it belongs to the new room's id.
5. **A reload** loses module state. The visitor then loads the scan again from the 3D view; nothing else breaks.

- [ ] **Step 1: Write the failing tests**

Create `src/components/pendingScan.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignPendingScan,
  pendingScanRoom,
  returnPendingScan,
  setPendingScan,
  subscribePendingScan,
  takePendingScan,
} from './pendingScan';

const scan = (name = 'room.spz') => new File([new Uint8Array([1, 2, 3])], name);

beforeEach(() => {
  setPendingScan(null);
});

describe('pendingScan', () => {
  it('holds nothing to begin with', () => {
    expect(pendingScanRoom()).toBeNull();
    expect(takePendingScan('any')).toBeNull();
  });

  it("waits for its link, then for the room that link became, and is taken once", () => {
    const file = scan();
    setPendingScan({ file, link: 'v1.abc' });
    expect(pendingScanRoom()).toBeNull(); // the room isn't known yet
    assignPendingScan('v1.other', 'room-1'); // another link: not this scan's room
    expect(pendingScanRoom()).toBeNull();
    assignPendingScan('v1.abc', 'room-2');
    expect(pendingScanRoom()).toBe('room-2');
    expect(takePendingScan('room-1')).toBeNull(); // another room never gets it
    expect(takePendingScan('room-2')).toBe(file);
    expect(takePendingScan('room-2')).toBeNull();
    expect(pendingScanRoom()).toBeNull();
  });

  it('stays with the first room its link opened', () => {
    setPendingScan({ file: scan(), link: 'v1.abc' });
    assignPendingScan('v1.abc', 'room-1');
    assignPendingScan('v1.abc', 'room-2');
    expect(pendingScanRoom()).toBe('room-1');
  });

  it('is replaced by a newer scan, and cleared by null', () => {
    const newer = scan('newer.ply');
    setPendingScan({ file: scan(), link: 'v1.abc' });
    setPendingScan({ file: newer, link: 'v1.def' });
    assignPendingScan('v1.abc', 'room-1');
    expect(pendingScanRoom()).toBeNull();
    assignPendingScan('v1.def', 'room-1');
    expect(takePendingScan('room-1')).toBe(newer);
    setPendingScan({ file: scan(), link: 'v1.abc' });
    setPendingScan(null);
    assignPendingScan('v1.abc', 'room-1');
    expect(pendingScanRoom()).toBeNull();
  });

  it('takes back a scan a view could not load, unless a newer one waits', () => {
    const file = scan();
    returnPendingScan('room-1', file);
    expect(pendingScanRoom()).toBe('room-1');
    expect(takePendingScan('room-1')).toBe(file);
    const newer = scan('newer.ply');
    setPendingScan({ file: newer, link: 'v1.def' });
    returnPendingScan('room-1', file);
    assignPendingScan('v1.def', 'room-2');
    expect(takePendingScan('room-2')).toBe(newer);
  });

  it('tells subscribers about every change until they unsubscribe', () => {
    let calls = 0;
    const stop = subscribePendingScan(() => calls++);
    setPendingScan({ file: scan(), link: 'v1.abc' });
    assignPendingScan('v1.abc', 'room-1');
    takePendingScan('room-1');
    expect(calls).toBe(3);
    stop();
    setPendingScan(null);
    expect(calls).toBe(3);
  });
});
```
(`File` is a global in Node 20 and later, so this runs in Vitest's Node environment.)

In `src/lib/room/session.test.ts`, inside `describe('RoomSession start', …)`, add after the first-visit test from Task 4:
```ts
  it("gives the id of the room a link opened, and null when there wasn't one", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Mine']), links: { code: named('Shared') } });
    expect(await t.session.start()).toBeNull(); // no link: the usual room
    t.setLink('code');
    const opened = await t.session.start();
    expect(opened).toBe(store().roomId);
    expect(opened).not.toBe('a');
    t.session.open('a');
    t.setLink('code');
    expect(await t.session.start()).toBe(opened); // the same link again reuses its room
    t.setLink('garbage');
    expect(await t.session.start()).toBeNull(); // a link that can't be read opens nothing
  });

  it('gives null when My rooms is full and the link has no room', async () => {
    const storage = fakeStorage();
    const rooms = Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) }));
    saveRooms({ rooms, currentId: 'r3' }, storage);
    const t = setup({ storage, links: { code: named('Shared') } });
    t.setLink('code');
    expect(await t.session.start()).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/pendingScan.test.ts src/lib/room/session.test.ts`
Expected: FAIL. Vitest can't resolve `./pendingScan`, and both new session tests fail with "expected undefined to be null" (`start()` resolves to nothing yet).

- [ ] **Step 3: The handoff module**

Create `src/components/pendingScan.ts`:
```ts
/**
 * A room scan picked in the setup wizard, on its way to the room the wizard opens. A File can't travel in a share link,
 * so it waits here, in module state: that survives the client-side navigation to /room, not a reload (the visitor then
 * loads the scan again from the 3D view). It belongs to the wizard's link until the room page has opened that link as a
 * room, and to that room after.
 */
type Pending = { file: File; link: string; roomId: string | null };

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** The wizard is about to open its room through `link` (the share code, without '#'): carry `file` to it. Null clears it. */
export function setPendingScan(scan: { file: File; link: string } | null): void {
  pending = scan ? { ...scan, roomId: null } : null;
  changed();
}

/** The room page opened `link` as room `roomId`: a scan waiting for that link now waits for that room. */
export function assignPendingScan(link: string, roomId: string): void {
  if (!pending || pending.roomId !== null || pending.link !== link) return;
  pending = { ...pending, roomId };
  changed();
}

/** The room a scan is waiting to be loaded into, or null. */
export function pendingScanRoom(): string | null {
  return pending?.roomId ?? null;
}

/** The scan waiting for `roomId`, once: it is no longer pending afterwards. */
export function takePendingScan(roomId: string): File | null {
  if (!pending || pending.roomId !== roomId) return null;
  const { file } = pending;
  pending = null;
  changed();
  return file;
}

/**
 * Hand back a scan that was taken by a view that went away before it could load it (React's development double mount
 * disposes the first 3D view at once). A newer scan, if one is waiting, wins.
 */
export function returnPendingScan(roomId: string, file: File): void {
  if (pending) return;
  pending = { file, link: '', roomId };
  changed();
}

export function subscribePendingScan(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
```

- [ ] **Step 4: `start()` says which room a link opened**

In `src/lib/room/session.ts`, in `start()`:
1. In the doc comment above it, add a last line: ` * Resolves to the id of the room a link opened (added, or an identical saved room reused), else null.`
2. Change `async start(): Promise<void> {` to `async start(): Promise<string | null> {`.
3. Change `if (run !== this.starts) return; // a newer start …` to `if (run !== this.starts) return null; // a newer start …` (keep the comment).
4. Replace
   ```ts
       if (!target && useRoomStore.getState().roomId) return this.refresh(); // a room is open here already: stay in it
   ```
   with
   ```ts
       const opened = target; // the room the link opened, if it did
       if (!target && useRoomStore.getState().roomId) {
         this.refresh(); // a room is open here already: stay in it
         return null;
       }
   ```
5. Add `return opened;` as the method's last line, after the `pruneScans` block.

Nothing else calls `start()` for its value: `useRoomSession`'s other calls stay `void rooms.start()`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/pendingScan.test.ts src/lib/room/session.test.ts`
Expected: PASS (6 pendingScan tests; all session tests, two of them new).

- [ ] **Step 6: The room page assigns the scan**

In `src/components/useRoomSession.ts`:
1. Add `import { assignPendingScan } from './pendingScan';` after the `browserStorage` import.
2. Replace `void rooms.start();` (the first call in the effect, right after `const rooms = roomSession();`) with:
   ```ts
   const link = window.location.hash.slice(1); // read before start() takes it out of the address bar
   void rooms.start().then((opened) => {
     if (opened && link) assignPendingScan(link, opened); // a scan picked in setup belongs to the room its link opened
   });
   ```
Leave the `hashchange` handler's `void rooms.start()` as it is. A link pasted later never carries a setup scan.

- [ ] **Step 7: The 3D view loads it**

In `src/components/RoomView.tsx`:
1. Change the react import back to `import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';`.
2. Add `import { pendingScanRoom, returnPendingScan, subscribePendingScan, takePendingScan } from './pendingScan';` before the `TopView` import.
3. After `const roomId = useRoomStore((s) => s.roomId);` add:
   ```tsx
   const pendingFor = useSyncExternalStore(subscribePendingScan, pendingScanRoom, () => null);
   ```
4. Directly after the effect that calls `scans.switchRoom(roomId, opened)` (its dependencies are `[roomId, webgl]`), add:
   ```tsx
   // A scan picked in setup, once the session has opened setup's room. After the effect above, so the controller is
   // already on this room; open() takes over from switchRoom's restore of a scan the new room doesn't have.
   useEffect(() => {
     const scans = scanRef.current;
     if (!roomId || pendingFor !== roomId || !scans || scans.roomKey !== roomId) return;
     const file = takePendingScan(roomId);
     if (!file) return;
     void scans.open(file, useRoomStore.getState().room);
     // React's development double mount disposes this controller at once: hand the file back for the one that follows.
     return () =>
       queueMicrotask(() => {
         if (scanRef.current !== scans) returnPendingScan(roomId, file);
       });
   }, [roomId, pendingFor, webgl]);
   ```
Why it is safe:
- **Order:** the effect must come after the `switchRoom` effect. In a commit where the room changes and the scan is already assigned, `switchRoom` sets `roomKey` first.
- **The cleanup:** it runs when `pendingFor` goes back to null after the take, while the controller is still alive, so the scan isn't handed back then. It hands the scan back only when the controller was disposed (a real unmount, or the development double mount). On a real unmount the scan then waits for that room's next visit.
- **A new room** has no stored scan, so `open()` never meets a restore already loading. Each wizard room is new, thanks to `uniqueName`.

- [ ] **Step 8: The Scan step takes a file**

In `src/app/setup/page.tsx`:
1. Add the imports `import { setPendingScan } from '@/components/pendingScan';` (after the `LengthField` import) and `import { useWebGL } from '@/components/useWebGL';` (after the `useUnits` import).
2. After `const [unit, setUnit] = useUnits();` add:
   ```tsx
   const webgl = useWebGL();
   const [scan, setScan] = useState<File | null>(null);
   ```
3. In `openRoom`, between `const code = await encodeRoom({ ...room, name });` and `router.push('/room#' + code);`, add:
   ```tsx
   setPendingScan(scan ? { file: scan, link: code } : null);
   ```
4. Replace the whole `{step === 'scan' && ( … )}` block with:
   ```tsx
   {step === 'scan' && (
     <div className="flex flex-col gap-3 text-sm">
       <p className="text-neutral-300">
         If you&apos;ve scanned this room with an app such as Scaniverse or Polycam, add the .ply, .spz or .splat file
         it exported. You&apos;ll line it up with the room in the 3D view. The file stays on your device.
       </p>
       {webgl ? (
         <>
           <label className="inline-flex min-h-11 cursor-pointer items-center self-start rounded-lg border border-neutral-700 px-5 font-semibold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-neutral-300">
             {scan ? 'Choose another scan' : 'Choose a scan'}
             <input
               type="file"
               accept=".ply,.spz,.splat,.ksplat"
               className="sr-only"
               onChange={(e) => {
                 const file = e.target.files?.[0];
                 e.target.value = ''; // so picking the same file again still fires
                 if (file) setScan(file);
               }}
             />
           </label>
           {scan && (
             <p className="flex items-center gap-3">
               <span className="min-w-0 truncate">{scan.name}</span>
               <button type="button" onClick={() => setScan(null)} className="min-h-11 shrink-0 px-2 underline">
                 Remove
               </button>
             </p>
           )}
         </>
       ) : (
         <p className="text-neutral-400">This browser can&apos;t show 3D, so a scan can&apos;t be used here.</p>
       )}
       <p className="text-neutral-400">No scan? Open your room now. You can add one later from the 3D view.</p>
     </div>
   )}
   ```
The file is only read when the room page opens it. The wizard just holds the `File`.

- [ ] **Step 9: Check, build and commit**

Run `npm test` (PASS, 585 tests), `npx tsc --noEmit`, `npm run lint` and `npm run build`. Then confirm Spark is still only in its own lazy chunk, as in Plans 4 and 5a: search `out/_next/static/chunks` for `SparkRenderer` and check that neither `out/room.html` nor `out/setup.html` references that chunk.
```powershell
git add -- src/components/pendingScan.ts src/components/pendingScan.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/useRoomSession.ts src/components/RoomView.tsx src/app/setup/page.tsx
git commit -m "feat: a scan picked in setup loads in the new room" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/pendingScan.ts src/components/pendingScan.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/useRoomSession.ts src/components/RoomView.tsx src/app/setup/page.tsx
```

- [ ] **Step 10: Controller browser checks**

Serve `out/` and use a fresh isolated context. Check:
- **A scan from setup:** go through `/setup`, choose a sample `.spz` on the Scan step, and press "Open my room". The room opens and the scan status reads "<file>: … splats · not aligned yet". "Align scan" works. Reload: the scan comes back from storage.
- **A room page open earlier:** with a room already open in this tab, go My rooms → New room → pick a scan → Open my room. The new room gets the scan, and the room that was open before still has none.
- **No scan:** run setup again without a scan. The new room has no scan. The scan from the earlier run doesn't appear.
- **Remove:** choose a scan, press Remove, then Open my room. No scan loads.
- **No WebGL:** with the WebGL-blocking `initScript` from Task 2, the Scan step says "This browser can't show 3D, so a scan can't be used here."
- No console errors.

---

### Task 6: The player layout, the room card and Edit room

**Files:**
- Create: `src/lib/room/roomCard.ts`, `src/lib/room/roomCard.test.ts`, `src/components/RoomCard.tsx`, `src/components/ErrorList.tsx`, `src/components/WhatIf.tsx`, `src/components/EditRoom.tsx`
- Modify: `src/lib/audio/mix.ts`, `src/lib/audio/mix.test.ts`, `src/components/Player.tsx` (replaced whole), `src/components/RoomForm.tsx` (replaced whole), `src/app/room/page.tsx`, `src/components/ListenDemo.tsx`

**Interfaces:**
- Consumes: `Toggle`, `LengthField`, `inputClass`, `useUnits`, `errorMessage`, `formatLength` (Task 1); `SURFACE_LABELS`, `FURNISHING_LABELS` (Task 2); `predictRt60`, `withoutFixes`, `StereoIr` from `@/lib/acoustics/simulate`; `rateRt60` from `./rating`.
- Produces:
  ```ts
  // src/lib/audio/mix.ts
  silentIr(sampleRate: number): StereoIr
  // src/lib/room/roomCard.ts
  TARGET_NOTE = 'Living rooms and bedrooms sound best at 0.3–0.5 s.'
  type RoomCard = { now: string; withFixes: string | null; rating: string; target: string; measured: string | null; summary: string };
  describeRoom(rtNow: number, rtFixed: number | null, measured?: number): RoomCard
  roomCardFor(room: RoomState): RoomCard | null
  // src/components
  ErrorList({ errors: RoomError[]; unit: Unit }); isFixError(error: RoomError): boolean   // ErrorList.tsx
  RoomCard(); WhatIf(); EditRoom()   // each reads the store itself
  ```

The layout (R7):
- **Phones (below `lg`):**
  - The page reads top to bottom: the 3D view, then Listen (song picker and built-in clips), Your room's sound, What if…, and Edit room (folded).
  - The control bar is fixed to the bottom of the screen: Play/Pause, Dry ↔ In your room, Now ↔ With fixes, and a one-line summary.
  - `main` has `pb-48` so the end of the page clears the bar.
- **Wide screens (`lg` and up):** the same order sits in a 24 rem side column, and the bar is static, after Listen.
- **One `Player`** owns the engine and returns two sections: the song picker, and the control bar.
- **No fix on:** the "with fixes" slot gets a silent one-sample IR, made once per engine, as the landing demo does. Its convolver then costs nothing (5b follow-up).
- **Headings:** the room page's sections get h2s ("Listen", "Your room's sound", "What if…", "Edit room"); the h1 stays.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/roomCard.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { predictRt60 } from '@/lib/acoustics/simulate';
import { describeRoom, roomCardFor, TARGET_NOTE } from './roomCard';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';

describe('describeRoom', () => {
  it('describes a room with no fixes on', () => {
    expect(describeRoom(0.62, null)).toEqual({
      now: 'Reverb time now: 0.62 s',
      withFixes: null,
      rating: 'A bit echoey',
      target: TARGET_NOTE,
      measured: null,
      summary: '0.62 s · A bit echoey',
    });
  });

  it('shows what the fixes change', () => {
    const card = describeRoom(0.62, 0.41);
    expect(card.withFixes).toBe('With fixes: 0.41 s');
    expect(card.rating).toBe('A bit echoey → Balanced');
    expect(card.summary).toBe('0.62 → 0.41 s · A bit echoey → Balanced');
  });

  it("gives one rating when the fixes don't change it", () => {
    expect(describeRoom(0.95, 0.85).rating).toBe('Echoey');
  });

  it('shows a measurement only when there is one', () => {
    expect(describeRoom(0.62, null, 0.58).measured).toBe('Measured: 0.58 s');
    expect(describeRoom(0.62, null).measured).toBeNull();
    expect(describeRoom(0.62, null, Number.NaN).measured).toBeNull();
  });

  it('names the target', () => {
    expect(TARGET_NOTE).toBe('Living rooms and bedrooms sound best at 0.3–0.5 s.');
  });
});

describe('roomCardFor', () => {
  const withRug = (on: boolean): RoomState => ({ ...defaultRoom(), fixes: [{ kind: 'rug', size: 'L', x: 2, z: 1.75, on }] });

  it("predicts the room's reverb time", () => {
    const card = roomCardFor(defaultRoom())!;
    expect(card.now).toBe(`Reverb time now: ${predictRt60(defaultRoom()).mid.toFixed(2)} s`);
    expect(card.withFixes).toBeNull();
  });

  it('compares with fixes only when a fix is on', () => {
    expect(roomCardFor(withRug(false))!.withFixes).toBeNull();
    const card = roomCardFor(withRug(true))!;
    expect(card.withFixes).toBe(`With fixes: ${predictRt60(withRug(true)).mid.toFixed(2)} s`);
    expect(predictRt60(withRug(true)).mid).toBeLessThan(predictRt60(defaultRoom()).mid);
  });

  it('includes a clap measurement', () => {
    const measured: RoomState = { ...defaultRoom(), calibration: { factor: 1.1, measuredRt60: 0.7 } };
    expect(roomCardFor(measured)!.measured).toBe('Measured: 0.70 s');
  });

  it('gives no card while the room has errors', () => {
    expect(roomCardFor({ ...defaultRoom(), dims: { length: 0, width: 3, height: 2.4 } })).toBeNull();
  });
});
```

In `src/lib/audio/mix.test.ts`, change the import to `import { downmixToMono, modeGains, silentIr } from './mix';` and append:
```ts
describe('silentIr', () => {
  it('is one silent sample per ear at the given rate', () => {
    const ir = silentIr(44100);
    expect(ir.sampleRate).toBe(44100);
    expect(Array.from(ir.left)).toEqual([0]);
    expect(Array.from(ir.right)).toEqual([0]);
    expect(ir.left).not.toBe(ir.right); // two buffers: the engine copies each ear into its own channel
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/room/roomCard.test.ts src/lib/audio/mix.test.ts`
Expected: FAIL. Vitest can't resolve `./roomCard`, and the mix test fails with "silentIr is not a function".

- [ ] **Step 3: Implement**

Create `src/lib/room/roomCard.ts`:
```ts
import { predictRt60, withoutFixes } from '@/lib/acoustics/simulate';
import { rateRt60 } from './rating';
import { validateRoom } from './roomState';
import type { RoomState } from './types';

export const TARGET_NOTE = 'Living rooms and bedrooms sound best at 0.3–0.5 s.';

/** The room card's lines, ready to show. `withFixes` and `measured` are null when there is nothing to say. */
export type RoomCard = {
  now: string;
  withFixes: string | null;
  /** "A bit echoey", or "A bit echoey → Balanced" when the fixes change it. */
  rating: string;
  target: string;
  measured: string | null;
  /** The control bar's one line. */
  summary: string;
};

const seconds = (s: number) => `${s.toFixed(2)} s`;

/**
 * Describe a room's sound from its reverb times (RT60, mid bands): now, and with fixes when any fix is on (`rtFixed`,
 * else null). `measured` is the clap measurement, when there is one.
 */
export function describeRoom(rtNow: number, rtFixed: number | null, measured?: number): RoomCard {
  const before = rateRt60(rtNow);
  const after = rtFixed === null ? before : rateRt60(rtFixed);
  const rating = after === before ? before : `${before} → ${after}`;
  return {
    now: `Reverb time now: ${seconds(rtNow)}`,
    withFixes: rtFixed === null ? null : `With fixes: ${seconds(rtFixed)}`,
    rating,
    target: TARGET_NOTE,
    measured: measured !== undefined && Number.isFinite(measured) ? `Measured: ${seconds(measured)}` : null,
    summary: rtFixed === null ? `${seconds(rtNow)} · ${rating}` : `${rtNow.toFixed(2)} → ${seconds(rtFixed)} · ${rating}`,
  };
}

/** The card for a room, or null while the room has errors (there is nothing to predict). Only fixes switched on count. */
export function roomCardFor(room: RoomState): RoomCard | null {
  if (validateRoom(room).length > 0) return null;
  const hasFixes = room.fixes.some((fix) => fix.on);
  return describeRoom(
    predictRt60(withoutFixes(room)).mid,
    hasFixes ? predictRt60(room).mid : null,
    room.calibration.measuredRt60,
  );
}
```

In `src/lib/audio/mix.ts`, add `import type { StereoIr } from '@/lib/acoustics/simulate';` at the top and append:
```ts
/** A one-sample silent IR, for a slot with nothing to play: the engine runs a convolver per slot, and this one costs nothing. */
export const silentIr = (sampleRate: number): StereoIr => ({ left: new Float32Array(1), right: new Float32Array(1), sampleRate });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/room/roomCard.test.ts src/lib/audio/mix.test.ts`
Expected: PASS (9 roomCard tests; 7 mix tests, one new).

- [ ] **Step 5: The player's two sections**

Replace `src/components/Player.tsx` with:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import type { StereoIr } from '@/lib/acoustics/simulate';
import { DEMO_CLIPS, synthClip, type DemoClipId } from '@/lib/audio/demoClips';
import { AudioEngine } from '@/lib/audio/engine';
import { silentIr, type ListenMode } from '@/lib/audio/mix';
import { roomCardFor } from '@/lib/room/roomCard';
import { useRoomStore } from '@/lib/room/store';
import { Toggle } from './Toggle';
import { resultMatchesRate, type Simulation } from './useSimulation';

type PlayerProps = {
  sim: Simulation;
  mode: ListenMode;
  onModeChange: (mode: ListenMode) => void;
  onSampleRate: (rate: number) => void;
};

/**
 * Plays a song through the room, with one engine for two sections: the song picker, which sits in the page under the
 * 3D view, and the control bar, which is fixed to the bottom of the screen on phones and sits in the side column on
 * wide screens.
 */
export function Player({ sim, mode, onModeChange, onSampleRate }: PlayerProps) {
  const room = useRoomStore((s) => s.room);
  const engineRef = useRef<AudioEngine | null>(null);
  const silentRef = useRef<StereoIr | null>(null); // the "with fixes" IR while no fix is on: one per engine
  const [engineRate, setEngineRate] = useState<number | null>(null);
  const [songName, setSongName] = useState<string | null>(null);
  const [clipId, setClipId] = useState<DemoClipId | null>(null); // the built-in clip that is loaded, if any
  const pickRef = useRef(0); // counts picks, so the last one wins; read only in handlers
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = resultMatchesRate(sim.result, engineRate);
  const hasFixes = room.fixes.some((f) => f.on);
  const card = roomCardFor(room);
  const summary = !songName
    ? 'Pick a song or a built-in clip to play.'
    : !card
      ? 'Fix the room under Edit room to hear it.'
      : !ready
        ? 'Simulating your room…'
        : card.summary;

  useEffect(() => () => engineRef.current?.dispose(), []);

  // With no fix on, "with fixes" is the same room, and the mode never routes to it: a silent one-sample IR keeps that
  // slot's convolver from running a full room IR for nothing.
  useEffect(() => {
    const engine = engineRef.current;
    const result = sim.result;
    if (!engine || !resultMatchesRate(result, engineRate)) return;
    engine.setIrs(result.now.ir, hasFixes ? result.withFixes.ir : (silentRef.current ??= silentIr(engine.sampleRate)));
  }, [sim.result, engineRate, hasFixes]);

  useEffect(() => {
    engineRef.current?.setMode({ room: mode.room, fixes: mode.fixes && hasFixes });
  }, [mode, hasFixes]);

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

  async function pickSong(file: File) {
    const engine = ensureEngine();
    const pick = ++pickRef.current;
    setError(null);
    try {
      await engine.loadSong(file);
      if (pick !== pickRef.current) return; // a later pick (a clip, say) has replaced this song
      setSongName(file.name);
      setClipId(null);
      setPlaying(false);
    } catch {
      if (pick !== pickRef.current) return;
      setError("This file type isn't supported on your browser. Try MP3 or M4A.");
    }
  }

  function pickClip(id: DemoClipId, label: string) {
    const engine = ensureEngine();
    pickRef.current++;
    setError(null);
    engine.loadClip(synthClip(id, engine.sampleRate), engine.sampleRate);
    setSongName(label);
    setClipId(id);
    setPlaying(false);
  }

  async function togglePlay() {
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
    } else {
      try {
        await engine.play();
      } catch {
        setError("Couldn't start playback. Try picking the song again.");
      }
      setPlaying(engine.playing);
    }
  }

  return (
    <>
      <section aria-labelledby="listen-heading" className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 id="listen-heading" className="text-lg font-semibold">
          Listen
        </h2>
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
            className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-neutral-700 file:bg-transparent file:px-3 file:text-neutral-100"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-neutral-400">Or try a built-in clip:</span>
          {DEMO_CLIPS.map((clip) => (
            <button
              key={clip.id}
              aria-pressed={clipId === clip.id}
              onClick={() => pickClip(clip.id, clip.label)}
              className={`min-h-11 rounded-md border px-3 ${clipId === clip.id ? 'border-white bg-white text-neutral-950' : 'border-neutral-700'}`}
            >
              {clip.label}
            </button>
          ))}
        </div>
        {songName && <p className="truncate text-sm">{songName}</p>}
        <p role="alert" className="text-sm text-red-400 empty:sr-only">
          {error}
        </p>
      </section>

      <section
        aria-label="Player controls"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-800 bg-neutral-950/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur lg:static lg:z-auto lg:rounded-xl lg:border lg:bg-neutral-900/50 lg:p-4 lg:backdrop-blur-none"
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <button
            onClick={() => void togglePlay()}
            disabled={!songName || !ready}
            className="min-h-11 rounded-lg bg-white px-5 font-semibold text-neutral-950 disabled:opacity-40"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <Toggle
            label="Listen dry or in your room"
            options={['Dry', 'In your room']}
            value={mode.room}
            onChange={(inRoom) => onModeChange({ ...mode, room: inRoom })}
          />
          <Toggle
            label="Compare now and with fixes"
            options={['Now', 'With fixes']}
            value={mode.fixes}
            onChange={(fixes) => onModeChange({ ...mode, fixes })}
            disabled={!mode.room || !hasFixes}
          />
          <p className="min-w-0 flex-1 basis-40 truncate text-xs text-neutral-400">{summary}</p>
          {/* Mounted all the time, so a screen reader announces the error when it appears. */}
          <div role="status" className="w-full empty:sr-only">
            {sim.status === 'error' && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-red-400">
                Couldn&apos;t simulate this room. {sim.error}
                <button onClick={sim.retry} className="min-h-11 px-2 underline">
                  Retry
                </button>
              </p>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
```
What changed:
- **Two sections, in this order:** the song picker, then the control bar.
- **The summary** sits beside the second toggle when there is room (`basis-40`). It says what to do next: pick a song, fix the room, wait for the simulation, or the room's numbers.
- **Toggles:** the local `Toggle` is gone; the shared one gives each pair a label and `aria-pressed`.
- **Moved out:** the reverb lines moved to the room card. "Simulating…" and "Add a rug or panel to compare." are covered by the summary and the card.
- **Errors:** they're announced (`role="alert"` / `role="status"`, mounted all the time).

- [ ] **Step 6: The room card, What if… and Edit room**

Create `src/components/RoomCard.tsx`:
```tsx
'use client';

import { roomCardFor } from '@/lib/room/roomCard';
import { useRoomStore } from '@/lib/room/store';

/** "Your room's sound": the reverb time now and with fixes, the rating, the target, and a measurement if there is one. */
export function RoomCard() {
  const room = useRoomStore((s) => s.room);
  const card = roomCardFor(room);
  return (
    <section aria-labelledby="sound-heading" className="flex flex-col gap-1 rounded-xl border border-neutral-800 p-4 text-sm">
      <h2 id="sound-heading" className="mb-1 text-lg font-semibold">
        Your room&apos;s sound
      </h2>
      {card ? (
        <>
          <p className="text-base font-semibold">{card.rating}</p>
          <p>{card.now}</p>
          {card.withFixes && <p>{card.withFixes}</p>}
          {card.measured && <p>{card.measured}</p>}
          <p className="text-neutral-400">{card.target}</p>
          {!card.withFixes && (
            <p className="text-neutral-400">
              {room.fixes.length === 0 ? 'Add a rug or a panel below to compare.' : 'Switch a fix on to compare.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-neutral-400">Fix the room under Edit room to see how it sounds.</p>
      )}
    </section>
  );
}
```

Create `src/components/ErrorList.tsx`:
```tsx
import type { RoomError } from '@/lib/room/roomState';
import { errorMessage, type Unit } from '@/lib/room/units';

/** A room's problems in the visitor's unit, and that the room isn't saved until they're fixed. Nothing when there are none. */
export function ErrorList({ errors, unit }: { errors: RoomError[]; unit: Unit }) {
  if (errors.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
      {errors.map((e) => (
        <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
      ))}
      <li className="font-medium">Changes to this room aren&apos;t saved until this is fixed.</li>
    </ul>
  );
}

/** Whether an error belongs to the rug and panels (What if…) rather than the room itself (Edit room). */
export const isFixError = (error: RoomError) => error.field === 'fixes' || error.field.startsWith('fixes.');
```

Create `src/components/WhatIf.tsx` (the What if… section moved out of RoomForm, unchanged apart from its heading, intro line and error list):
```tsx
'use client';

import { LIMITS, RUG_SIZES } from '@/lib/room/constants';
import { SURFACE_LABELS } from '@/lib/room/labels';
import { findFreePanelSpot } from '@/lib/room/placement';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { WALL_IDS, type Fix, type RugSize, type WallId } from '@/lib/room/types';
import { formatLength, type Unit } from '@/lib/room/units';
import { ErrorList, isFixError } from './ErrorList';
import { inputClass, LengthField } from './LengthField';
import { useUnits } from './useUnits';

const RUG_NAMES: Record<RugSize, string> = { S: 'Small', M: 'Medium', L: 'Large' };
/** "Medium 1.6 × 2.3 m": width × length, in the visitor's unit. */
const rugLabel = (size: RugSize, unit: Unit) =>
  `${RUG_NAMES[size]} ${formatLength(RUG_SIZES[size].z, unit)} × ${formatLength(RUG_SIZES[size].x, unit)} ${unit}`;
const addButton = 'min-h-11 rounded-md border border-neutral-700 px-3 text-sm disabled:opacity-40';

/** "What if…": add a rug or panels, switch each on or off, and place them. Next to Now ↔ With fixes in the player column. */
export function WhatIf() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [unit] = useUnits();
  const rugCount = room.fixes.filter((f) => f.kind === 'rug').length;
  const panelCount = room.fixes.length - rugCount;

  const setFix = (index: number, patch: Partial<Fix>) =>
    update((r) => ({ ...r, fixes: r.fixes.map((f, i) => (i === index ? ({ ...f, ...patch } as Fix) : f)) }));
  const removeFix = (index: number) => update((r) => ({ ...r, fixes: r.fixes.filter((_, i) => i !== index) }));
  const addRug = () =>
    update((r) => ({
      ...r,
      fixes: [...r.fixes, { kind: 'rug', size: 'M', x: r.dims.length / 2, z: r.dims.width / 2, on: true }],
    }));
  const addPanel = () =>
    update((r) => {
      const spot = findFreePanelSpot(r);
      return spot ? { ...r, fixes: [...r.fixes, spot] } : r;
    });

  return (
    <section aria-labelledby="what-if-heading" className="flex flex-col gap-3">
      <h2 id="what-if-heading" className="text-lg font-semibold">
        What if…
      </h2>
      <p className="text-sm text-neutral-400">Add a rug or panels, then switch between Now and With fixes to hear the difference.</p>
      <div className="flex gap-3">
        <button onClick={addRug} disabled={rugCount >= LIMITS.maxRugs} className={addButton}>
          + Rug
        </button>
        <button onClick={addPanel} disabled={panelCount >= LIMITS.maxPanels || findFreePanelSpot(room) === null} className={addButton}>
          + Panel
        </button>
      </div>
      {room.fixes.map((fix, i) => {
        const rowLabel =
          fix.kind === 'rug' ? 'Rug' : `Panel ${room.fixes.slice(0, i + 1).filter((f) => f.kind === 'panel').length}`;
        return (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" checked={fix.on} onChange={(e) => setFix(i, { on: e.target.checked })} />
              {rowLabel}
            </label>
            {fix.kind === 'rug' ? (
              <>
                <select
                  aria-label="Rug size"
                  value={fix.size}
                  onChange={(e) => setFix(i, { size: e.target.value as RugSize })}
                  className={inputClass}
                >
                  {(['S', 'M', 'L'] as const).map((s) => (
                    <option key={s} value={s}>
                      {rugLabel(s, unit)}
                    </option>
                  ))}
                </select>
                <LengthField label={`${rowLabel} centre x`} metres={fix.x} unit={unit} onChange={(v) => setFix(i, { x: v })} />
                <LengthField label={`${rowLabel} centre z`} metres={fix.z} unit={unit} onChange={(v) => setFix(i, { z: v })} />
              </>
            ) : (
              <>
                <select
                  aria-label={`${rowLabel} wall`}
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
                <LengthField label={`${rowLabel} along wall`} metres={fix.u} unit={unit} onChange={(v) => setFix(i, { u: v })} />
                <LengthField label={`${rowLabel} height`} metres={fix.v} unit={unit} onChange={(v) => setFix(i, { v })} />
              </>
            )}
            <button onClick={() => removeFix(i)} aria-label={`Remove ${rowLabel.toLowerCase()}`} className="min-h-11 px-2 text-sm text-red-400">
              Remove
            </button>
          </div>
        );
      })}
      <ErrorList errors={validateRoom(room).filter(isFixError)} unit={unit} />
    </section>
  );
}
```

Create `src/components/EditRoom.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { isFixError } from './ErrorList';
import { RoomForm } from './RoomForm';

/**
 * "Edit room": the size, surfaces, furnishing and positions, folded away until wanted. Open from the start when the
 * room has a problem there, and opened again whenever a new one appears, so the error is never hidden.
 */
export function EditRoom() {
  const hasErrors = useRoomStore((s) => validateRoom(s.room).some((e) => !isFixError(e)));
  const [open, setOpen] = useState(hasErrors);
  const [hadErrors, setHadErrors] = useState(hasErrors);
  if (hasErrors !== hadErrors) {
    setHadErrors(hasErrors);
    if (hasErrors) setOpen(true);
  }
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl border border-neutral-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4">
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <h2 className="text-lg font-semibold">Edit room</h2>
      </summary>
      <div className="px-4 pb-4">
        <RoomForm />
      </div>
    </details>
  );
}
```
Notes:
- **The `hadErrors` check during render** is React's "adjust state when a prop changes" pattern, as `RoomView` uses for `shownRoomId`. It only opens the section; it never closes it under the visitor.
- **The selector returns a boolean,** so the component re-renders only when that boolean changes.

Replace `src/components/RoomForm.tsx` with (What if… now lives in `WhatIf`; section headings become h3 under "Edit room"):
```tsx
'use client';

import { MATERIALS } from '@/lib/acoustics/materials';
import { FURNISHING_LABELS, SURFACE_LABELS } from '@/lib/room/labels';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { MATERIAL_IDS, SURFACE_IDS, type Furnishing, type MaterialId, type RoomState } from '@/lib/room/types';
import { ErrorList, isFixError } from './ErrorList';
import { inputClass, LengthField } from './LengthField';
import { Toggle } from './Toggle';
import { useUnits } from './useUnits';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

/** The room itself: size, surfaces, furnishing, and where the speaker and listener are. Shown under "Edit room". */
export function RoomForm() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [unit, setUnit] = useUnits();

  const setDim = (key: keyof RoomState['dims'], value: number) =>
    update((r) => ({ ...r, dims: { ...r.dims, [key]: value } }));
  const setSpeaker = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, speaker: { ...r.speaker, [axis]: value } }));
  const setListener = (axis: 'x' | 'y' | 'z', value: number) =>
    update((r) => ({ ...r, listener: { ...r.listener, [axis]: value } }));

  return (
    <div className="flex flex-col gap-8">
      <Section title="Room size">
        <Toggle label="Units" options={['Metres', 'Feet']} value={unit === 'ft'} onChange={(feet) => setUnit(feet ? 'ft' : 'm')} />
        <div className="flex flex-wrap gap-3">
          <LengthField label="Length" metres={room.dims.length} unit={unit} onChange={(v) => setDim('length', v)} />
          <LengthField label="Width" metres={room.dims.width} unit={unit} onChange={(v) => setDim('width', v)} />
          <LengthField label="Ceiling height" metres={room.dims.height} unit={unit} onChange={(v) => setDim('height', v)} />
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

      <Section title="Speaker and listener">
        <p className="text-xs text-neutral-500">
          x runs from the front wall toward the back, z from the right wall toward the left (as you face the front wall), y is height.
        </p>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Speaker x" metres={room.speaker.x} unit={unit} onChange={(v) => setSpeaker('x', v)} />
          <LengthField label="Speaker y" metres={room.speaker.y} unit={unit} onChange={(v) => setSpeaker('y', v)} />
          <LengthField label="Speaker z" metres={room.speaker.z} unit={unit} onChange={(v) => setSpeaker('z', v)} />
        </div>
        <div className="flex flex-wrap gap-3">
          <LengthField label="Listener x" metres={room.listener.x} unit={unit} onChange={(v) => setListener('x', v)} />
          <LengthField label="Listener y" metres={room.listener.y} unit={unit} onChange={(v) => setListener('y', v)} />
          <LengthField label="Listener z" metres={room.listener.z} unit={unit} onChange={(v) => setListener('z', v)} />
        </div>
      </Section>

      <ErrorList errors={validateRoom(room).filter((e) => !isFixError(e))} unit={unit} />
    </div>
  );
}
```
(The `text-neutral-500` note is left for Task 7's guard, as before.)

- [ ] **Step 7: The page layout**

In `src/app/room/page.tsx`:
1. Replace `import { RoomForm } from '@/components/RoomForm';` with `import { EditRoom } from '@/components/EditRoom';`. Add `import { RoomCard } from '@/components/RoomCard';` after the `Player` import, and `import { WhatIf } from '@/components/WhatIf';` after the `useSimulation` import.
2. Give `<main>` this comment and class (bottom padding below `lg`, for the fixed bar):
   ```tsx
   // Below lg the player's control bar is fixed to the bottom of the screen: pb-48 keeps the page's end clear of it.
   <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-48 lg:pb-6">
   ```
   Put the comment as a JS comment inside `return (`, before `<main`.
3. In `RoomWorkspace`, change the doc comment to `/** The open room: 3D view, then the player column (song, controls, sound, What if…, Edit room). Shown once the saved rooms have been read. */`. Then replace everything after `</header>` (the `<div className="flex flex-col gap-6 lg:flex-row">…</div>` and `<RoomForm />`) with:
   ```tsx
   <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
     <div className="min-w-0 lg:flex-1">
       <RoomView mode={mode} />
     </div>
     <div className="flex flex-col gap-6 lg:w-96">
       <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
       <RoomCard />
       <WhatIf />
       <EditRoom />
     </div>
   </div>
   ```
Leave the notice's Dismiss button, the room-name field and the footer as they are; Task 7 sizes them.

- [ ] **Step 8: The landing demo on the shared pieces**

In `src/components/ListenDemo.tsx`:
1. Delete the local `const silentIr = …` and its doc comment, and the local `function Toggle(…) { … }`.
2. Add `import { silentIr } from '@/lib/audio/mix';` after the `engine` import, and `import { Toggle } from './Toggle';` after the `urlCodec` import.
3. Change `<Toggle options={['Dry', 'In the space']} value={inSpace} onChange={chooseMode} />` to `<Toggle label="Listen dry or in the space" options={['Dry', 'In the space']} value={inSpace} onChange={chooseMode} />`.
`StereoIr` stays imported: the component still uses the type.

- [ ] **Step 9: Check, build and commit**

Run `npm test` (PASS, 595 tests), `npx tsc --noEmit`, `npm run lint` and `npm run build`.
```powershell
git add -- src/lib/room/roomCard.ts src/lib/room/roomCard.test.ts src/lib/audio/mix.ts src/lib/audio/mix.test.ts src/components/Player.tsx src/components/RoomCard.tsx src/components/ErrorList.tsx src/components/WhatIf.tsx src/components/EditRoom.tsx src/components/RoomForm.tsx src/app/room/page.tsx src/components/ListenDemo.tsx
git commit -m "feat: a phone-first player: a fixed control bar, the room card, What if… beside it and a folded Edit room" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/lib/room/roomCard.ts src/lib/room/roomCard.test.ts src/lib/audio/mix.ts src/lib/audio/mix.test.ts src/components/Player.tsx src/components/RoomCard.tsx src/components/ErrorList.tsx src/components/WhatIf.tsx src/components/EditRoom.tsx src/components/RoomForm.tsx src/app/room/page.tsx src/components/ListenDemo.tsx
```

- [ ] **Step 10: Controller browser checks**

Serve `out/` and open a room. Check:
- **375 × 812, mobile:**
  - The bar is fixed at the bottom: Play, Dry ↔ In your room, Now ↔ With fixes, and the summary ("Pick a song or a built-in clip to play.").
  - Below the 3D view come Listen, Your room's sound, What if… and Edit room (folded), in that order.
  - Scrolled to the end, the footer link sits fully above the bar.
- **Playing:** pick "Drum loop" and press Play. The summary turns into the room's numbers ("0.xx s · Balanced" or similar).
- **With fixes:** + Rug enables Now ↔ With fixes. The card shows "With fixes: …" and a rating with an arrow when the class changes. Choosing With fixes changes the sound.
- **Errors under What if…:** set Length to 1.5 m (in Edit room) and the rug to Large. "The rug must fit inside the floor." shows under What if…, not only inside Edit room.
- **Edit room opens itself:** close Edit room, then drag the speaker onto the listener in the 3D view. Edit room opens with "The listener must be at least 0.5 m from the speaker.", and the bar says "Fix the room under Edit room to hear it."
- **1280 × 800:** a side column with Listen, the controls (not fixed), the card, What if… and Edit room. The 3D view takes the rest.
- **Landing page:** Dry ↔ In the space still switches while playing.
- **Headings:** the a11y tree (chrome-devtools `take_snapshot`) shows h1 "Your room", then h2 Listen, Your room's sound, What if… and Edit room.
- No console errors.

---

### Task 7: The accessibility pass

**Files:**
- Create: `src/components/contrast.test.ts`, `src/components/useReducedMotion.ts`
- Modify: `src/lib/room/rooms.ts`, `src/lib/room/rooms.test.ts`, `src/lib/room/session.ts`, `src/lib/room/session.test.ts`, `src/components/RoomsMenu.tsx` (replaced whole), `src/components/ShareButton.tsx`, `src/components/RoomView.tsx`, `src/components/ListenDemo.tsx`, `src/components/RoomForm.tsx`, `src/app/page.tsx`, `src/app/room/page.tsx`, `src/app/about/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: everything above; `roomSession()` from `useRoomSession.ts`.
- Produces:
  ```ts
  // src/lib/room/rooms.ts
  UNTITLED = 'Untitled room'
  displayName(name: string): string
  // src/components/useReducedMotion.ts
  useReducedMotion(): boolean
  ```

What it covers (R9; `Toggle` was Task 1):
- **Contrast:** no grey darker than `text-neutral-400` for text. `text-neutral-500` is about 4.2:1 on the near-black background, below WCAG AA's 4.5:1; neutral-400 is about 7:1. A Vitest guard keeps it that way.
- **Touch targets:** every remaining button, tab, link-button, camera button, dialog button and Dismiss is at least 44 px tall.
- **Headings:** a visible h2 above the landing page's player. (The room page's h2s came with Task 6.)
- **My rooms:**
  - after Delete for good, focus moves to the next room's Open button, else to New room;
  - "Delete for good" and "Keep" name the room;
  - a click on the backdrop closes the dialog;
  - pressing Delete focuses Keep, and Keep focuses Delete.
- **Share link:** "Sharing isn't supported in this browser" is announced, and the copy-by-hand field takes focus with its link selected.
- **Focus:** a global `:focus-visible` ring.
- **Reduced motion:** with `prefers-reduced-motion: reduce`, rays start hidden, and "Show rays" still shows them.
- **Empty names:** copying a room with no name gives "Untitled room copy", not " copy".

- [ ] **Step 1: Write the failing tests**

Create `src/components/contrast.test.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));
/**
 * Greys too dark for small text on the app's near-black background: below WCAG AA's 4.5:1. neutral-400 (about 7:1) is
 * the darkest grey for text. Dark text on a white button (neutral-950) is fine and isn't matched.
 */
const LOW_CONTRAST = /\btext-neutral-(?:500|600|700)\b/;

/** Every page and component source file under `dir`, tests left out. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('text contrast', () => {
  const files = ['app', 'components'].flatMap((dir) => sourceFiles(join(SRC, dir)));

  it('finds the pages and components to check', () => {
    expect(files.some((f) => f.endsWith('page.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('Player.tsx'))).toBe(true);
  });

  it('uses no grey darker than neutral-400 for text', () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (LOW_CONTRAST.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
```
The first test keeps the guard from passing by finding nothing, for example if the path were wrong.

In `src/lib/room/rooms.test.ts`, add `displayName,` to the import from `./rooms` (after `currentRoom`) and append:
```ts
describe('displayName', () => {
  it('names a room with no name Untitled room', () => {
    expect(displayName('')).toBe('Untitled room');
    expect(displayName('   ')).toBe('Untitled room');
    expect(displayName(' Den ')).toBe('Den');
  });
});
```

In `src/lib/room/session.test.ts`:
1. In `describe('RoomSession rooms', …)`, after `it('copies a room under a new name and opens the copy', …)`, add:
   ```ts
   it('names the copy of a room with no name "Untitled room copy"', async () => {
     const t = setup({ storage: storageWith('a', ['a', 100, '  ']) });
     await t.session.start();
     t.session.duplicate('a');
     expect(store().room.name).toBe('Untitled room copy');
   });
   ```
2. In `describe('RoomSession save', …)`, before `it("doesn't save its stale copy over another tab's newer one", …)`, add:
   ```ts
   it('names a conflict copy of a room with no name "Untitled room copy"', async () => {
     const t = setup({ storage: storageWith('a', ['a', 100, '']) });
     await t.session.start();
     saveRooms(upsertRoom(t.saved(), 'a', named('Renamed elsewhere'), 500), t.storage);
     store().update((r) => ({ ...r, furnishing: 'bare' }));
     t.session.save();
     expect(store().room.name).toBe('Untitled room copy');
   });
   ```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/contrast.test.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts`
Expected: FAIL.
- **The contrast guard** lists five lines:
  - `app\page.tsx` (the footer);
  - `app\room\page.tsx` (the footer);
  - `components\ListenDemo.tsx` ("Recorded in a real space");
  - `components\RoomForm.tsx` (the x/z note);
  - `components\RoomView.tsx` (the drag hint).
- **`displayName`:** "displayName is not a function".
- **The two copy tests** get "   copy" and " copy".

- [ ] **Step 3: Names for unnamed rooms**

In `src/lib/room/rooms.ts`, add just above `uniqueName`:
```ts
/** The name shown for a room that has none. */
export const UNTITLED = 'Untitled room';

/** A room's name as shown: "Untitled room" when it is empty or only spaces. */
export function displayName(name: string): string {
  return name.trim() || UNTITLED;
}
```
In `src/lib/room/session.ts`:
1. Add `displayName,` to the import from `./rooms` (after `addRoom`).
2. In `save()`, change `` uniqueName(file, `${room.name} copy`) `` to `` uniqueName(file, `${displayName(room.name)} copy`) ``.
3. In `duplicate()`, change `` uniqueName(file, `${source.state.name} copy`) `` to `` uniqueName(file, `${displayName(source.state.name)} copy`) ``.

- [ ] **Step 4: Fix the contrast**

Change `text-neutral-500` to `text-neutral-400` on exactly the five lines the guard listed: the `<footer>` in `src/app/page.tsx` and in `src/app/room/page.tsx`; "Recorded in a real space" in `src/components/ListenDemo.tsx`; the x/z note in `src/components/RoomForm.tsx`; the drag hint at the end of `src/components/RoomView.tsx`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/components/contrast.test.ts src/lib/room/rooms.test.ts src/lib/room/session.test.ts`
Expected: PASS.

- [ ] **Step 6: 44 px targets**

Make these class changes. Each is a `className` string; keep everything else on the element.
- `src/components/RoomView.tsx`:
  - `const buttonClass = 'rounded-md border border-neutral-700 px-3 py-1.5 disabled:opacity-40';` → `'inline-flex min-h-11 items-center rounded-md border border-neutral-700 px-3 disabled:opacity-40'`. `inline-flex` matters: the "Load scan" `<label>` uses this class, and `min-height` does nothing on an inline element.
  - The `HeightSelect` `<select>`: `"rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1"` → `"min-h-11 rounded-md border border-neutral-700 bg-neutral-900 px-2"`.
- `src/app/room/page.tsx`:
  - Dismiss: `"shrink-0 underline"` → `"min-h-11 shrink-0 px-2 underline"`.
  - The room-name `<input>`: put `min-h-11 ` at the start of its class.
  - The footer link: `"underline"` → `"inline-flex min-h-11 items-center underline"`.
- `src/app/page.tsx`: the footer link `"underline"` → `"inline-flex min-h-11 items-center underline"`.
- `src/app/about/page.tsx`: "Back to the home page", `"self-start underline"` → `"inline-flex min-h-11 items-center self-start underline"`. The Licence and Source links sit inside sentences, which WCAG 2.5.8 exempts.
- `src/components/ListenDemo.tsx`:
  - The tabs: `` `rounded-md px-3 py-1.5 text-sm ${…}` `` → `` `min-h-11 rounded-md px-3 text-sm ${…}` ``.
  - "Explore it in 3D": `"rounded-md border border-neutral-700 px-3 py-1.5"` → `"min-h-11 rounded-md border border-neutral-700 px-3"`.
  - The clip buttons: `` `rounded-md border px-2 py-1 ${…}` `` → `` `min-h-11 rounded-md border px-3 ${…}` ``.
  - Play: `"rounded-lg bg-white px-5 py-2 font-semibold text-neutral-950"` → `"min-h-11 rounded-lg bg-white px-5 font-semibold text-neutral-950"`.
- `src/components/ShareButton.tsx`:
  - The button: `"rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"` → `"min-h-11 rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-40"`.
  - The copy-by-hand `<input>`: `"rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"` → `"min-h-11 rounded-md border border-neutral-700 bg-neutral-950 px-2"`.
  - Done: `"self-end rounded-md border border-neutral-700 px-3 py-1"` → `"min-h-11 self-end rounded-md border border-neutral-700 px-3"`.

- [ ] **Step 7: A heading above the landing page's player**

In `src/components/ListenDemo.tsx`, change the section's opening tag and add the heading as its first child:
```tsx
<section aria-labelledby="listen-demo-heading" className="flex flex-col gap-4 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
  <h2 id="listen-demo-heading" className="text-xl font-semibold">
    Listen to a space
  </h2>
```
(It replaces `aria-label="Listen to a space"`. The heading carries the name now.)

- [ ] **Step 8: My rooms**

Replace `src/components/RoomsMenu.tsx` with:
```tsx
'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { roomSession } from '@/components/useRoomSession';
import { displayName, type SavedRoom } from '@/lib/room/rooms';
import { useRoomStore } from '@/lib/room/store';

const buttonClass = 'inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-40';
const smallButton = 'min-h-11 rounded-md border border-neutral-700 px-3 text-xs';

const nameOf = (room: SavedRoom) => displayName(room.state.name);
const trim = (metres: number) => Number(metres.toFixed(2)); // 3.6576 → 3.66, 4 → 4
const sizeOf = (room: SavedRoom) => {
  const { length, width, height } = room.state.dims;
  return `${trim(length)} × ${trim(width)} × ${trim(height)} m`;
};
const savedAt = (room: SavedRoom) => new Date(room.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The "My rooms" button and its dialog: open, add, copy and delete the rooms kept in this browser. */
export function RoomsMenu() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rooms = useRoomStore((s) => s.rooms);
  const roomId = useRoomStore((s) => s.roomId);
  const [confirming, setConfirming] = useState<string | null>(null); // the room whose Delete was pressed once
  const [focusTarget, setFocusTarget] = useState<{ key: string } | null>(null); // a fresh object each time, so the same key refocuses

  // Focus moves once the control it goes to has rendered: a Keep button, or the next room after a delete. Controls are
  // found by their data-focus key: 'new', 'open:<id>', 'delete:<id>' or 'keep:<id>'.
  useEffect(() => {
    if (!focusTarget) return;
    const targets = dialogRef.current?.querySelectorAll<HTMLElement>('[data-focus]') ?? [];
    Array.from(targets).find((element) => element.dataset.focus === focusTarget.key)?.focus();
  }, [focusTarget]);

  const close = () => dialogRef.current?.close();

  function deleteForGood(room: SavedRoom) {
    const index = rooms.findIndex((r) => r.id === room.id);
    const next = rooms[index + 1] ?? rooms[index - 1] ?? null; // the room below, else the one above
    roomSession().remove(room.id);
    setConfirming(null);
    setFocusTarget({ key: next ? `open:${next.id}` : 'new' });
  }

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={buttonClass}>
        My rooms
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="rooms-title"
        onClose={() => setConfirming(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // a click on the backdrop: the content fills the dialog box itself
        }}
        className="m-auto max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-0 text-neutral-100 backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="rooms-title" className="text-lg font-semibold">
              My rooms
            </h2>
            <button onClick={close} className={smallButton}>
              Close
            </button>
          </div>
          <p className="text-sm text-neutral-400">Your rooms are kept in this browser only. Nothing is uploaded.</p>
          <Link href="/setup" data-focus="new" className={`${buttonClass} self-start`}>
            New room
          </Link>
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => {
              const open = room.id === roomId;
              return (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 p-3">
                  <button
                    data-focus={`open:${room.id}`}
                    onClick={() => {
                      roomSession().open(room.id);
                      close();
                    }}
                    aria-current={open ? 'true' : undefined}
                    className="min-h-11 min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium">{nameOf(room)}</span>
                    <span className="block text-xs text-neutral-400">
                      {sizeOf(room)} · {open ? 'open now' : `saved ${savedAt(room)}`}
                    </span>
                  </button>
                  <div className="flex gap-2">
                    {confirming === room.id ? (
                      <>
                        <button
                          onClick={() => deleteForGood(room)}
                          aria-label={`Delete ${nameOf(room)} for good`}
                          className={`${smallButton} border-red-700 text-red-200`}
                        >
                          Delete for good
                        </button>
                        <button
                          data-focus={`keep:${room.id}`}
                          onClick={() => {
                            setConfirming(null);
                            setFocusTarget({ key: `delete:${room.id}` });
                          }}
                          aria-label={`Keep ${nameOf(room)}`}
                          className={smallButton}
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            roomSession().duplicate(room.id);
                            close();
                          }}
                          aria-label={`Duplicate ${nameOf(room)}`}
                          className={smallButton}
                        >
                          Duplicate
                        </button>
                        <button
                          data-focus={`delete:${room.id}`}
                          onClick={() => {
                            setConfirming(room.id);
                            setFocusTarget({ key: `keep:${room.id}` });
                          }}
                          aria-label={`Delete ${nameOf(room)}`}
                          className={smallButton}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
```
Notes:
- **Why `data-focus` and an effect:** a map of ref callbacks built during render is flagged by `react-hooks/refs`. Finding the element in an effect, after the render that created it, is allowed.
- **The backdrop:** the dialog now has `p-0` and its content a `p-4` wrapper, so the content fills the dialog box. A click whose target is the `<dialog>` itself can only be on the backdrop.
- **Names:** `nameOf` uses `displayName`, so the list and the copies agree on "Untitled room".

- [ ] **Step 9: Share link**

In `src/components/ShareButton.tsx`:
1. After `const copiedTimer = useRef<…>(undefined);` add:
   ```tsx
   const manualInput = useRef<HTMLInputElement>(null);

   // The copy-by-hand field takes focus with its link selected, ready for Ctrl+C or the phone's Copy.
   useEffect(() => {
     if (!manualLink) return;
     manualInput.current?.focus();
     manualInput.current?.select();
   }, [manualLink]);
   ```
2. Give the copy-by-hand `<input>` the prop `ref={manualInput}`.
3. Change the status span's text to `{copied ? 'Link copied' : unsupported ? "Sharing isn't supported in this browser" : ''}`, so the unsupported message is announced as well as shown on the button.

- [ ] **Step 10: A focus ring everywhere**

Replace `src/app/globals.css` with:
```css
@import "tailwindcss";

/* A visible focus ring on every control for keyboard users. Parts that draw their own ring (the top view) use outline-none. */
@layer base {
  :focus-visible {
    outline: 2px solid var(--color-neutral-300, #d4d4d4);
    outline-offset: 2px;
  }
}
```
It sits in the base layer, so utilities such as the setup heading's `outline-none` and the scan label's `has-focus-visible:outline-*` still win.

- [ ] **Step 11: Rays and reduced motion**

Create `src/components/useReducedMotion.ts`:
```ts
'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(listener: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}

const prefersReducedMotion = () => window.matchMedia(QUERY).matches;

/** Whether the visitor has asked their system for less motion. False while prerendering. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, () => false);
}
```
In `src/components/RoomView.tsx`:
1. Add `import { useReducedMotion } from './useReducedMotion';` after the `TopView` import.
2. Replace `const [raysOn, setRaysOn] = useState(true);` with:
   ```tsx
   const reducedMotion = useReducedMotion();
   const [raysChoice, setRaysChoice] = useState<boolean | null>(null); // null: the default, which is off for reduced motion
   const raysOn = raysChoice ?? !reducedMotion;
   ```
3. On the rays button, change `onClick={() => setRaysOn((v) => !v)}` to `onClick={() => setRaysChoice(!raysOn)}`.
The `setRaysVisible(raysOn)` effect stays as it is. `raysOn` is now derived, which needs no state change in an effect.

- [ ] **Step 12: Check, build and commit**

Run `npm test` (PASS, 600 tests), `npx tsc --noEmit`, `npm run lint` and `npm run build`.
```powershell
git add -- src/components/contrast.test.ts src/components/useReducedMotion.ts src/lib/room/rooms.ts src/lib/room/rooms.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/RoomsMenu.tsx src/components/ShareButton.tsx src/components/RoomView.tsx src/components/ListenDemo.tsx src/components/RoomForm.tsx src/app/page.tsx src/app/room/page.tsx src/app/about/page.tsx src/app/globals.css
git commit -m "fix: accessibility pass: 44 px targets, AA contrast, headings, focus in My rooms, announced sharing errors, rays off for reduced motion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- src/components/contrast.test.ts src/components/useReducedMotion.ts src/lib/room/rooms.ts src/lib/room/rooms.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/RoomsMenu.tsx src/components/ShareButton.tsx src/components/RoomView.tsx src/components/ListenDemo.tsx src/components/RoomForm.tsx src/app/page.tsx src/app/room/page.tsx src/app/about/page.tsx src/app/globals.css
```

- [ ] **Step 13: Controller browser checks**

Serve `out/` and set a 375 × 812 mobile viewport. Run this with chrome-devtools `evaluate_script` on `/`, on each `/setup` step, on `/room` (with Edit room open, then with My rooms open and one room's Delete pressed) and on `/about`. It returns every control smaller than 44 × 44 px and should return `[]` each time:
```js
() => {
  const MIN = 44;
  const selector = 'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])';
  const rows = [];
  for (const el of document.querySelectorAll(selector)) {
    if (el.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    if (el.matches('p a')) continue; // links inside a sentence are exempt (WCAG 2.5.8)
    // A checkbox, radio or visually hidden file input is reached through its label: measure the label.
    const label = el.matches('input, select, textarea') ? el.closest('label') : null;
    const hiddenControl = el.classList.contains('sr-only') || el.type === 'checkbox' || el.type === 'radio';
    const target = label && hiddenControl ? label : el;
    const box = target.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue; // not rendered: a closed dialog or folded section
    if (box.width < MIN - 0.5 || box.height < MIN - 0.5) {
      rows.push({
        element: target.tagName.toLowerCase(),
        name: (el.getAttribute('aria-label') || target.textContent || '').trim().slice(0, 40),
        width: Math.round(box.width),
        height: Math.round(box.height),
      });
    }
  }
  return rows;
}
```
To open the dialog and Edit room from the same call, prefix the body with `document.querySelector('details summary')?.click(); document.querySelector('dialog')?.showModal();`.

Then check:
- **Contrast:** no grey text looks dim next to the rest. The guard test covers the classes.
- **Focus ring:** Tab through `/room`. Every control shows a light outline, and the top view's items show their white ring instead.
- **My rooms:**
  - With three rooms, press Delete on the middle one: focus moves to Keep. Press Keep: focus returns to Delete.
  - Delete, then Delete for good: focus lands on the next room's name.
  - Delete the last room in the list: focus goes to the room above.
  - A screen-reader snapshot names the buttons "Delete <name> for good" and "Keep <name>".
  - Clicking the dark backdrop closes the dialog; clicking inside it doesn't.
- **Share link, unsupported:** load `/room` with the `initScript` `delete window.CompressionStream;` and press Share link. The button reads "Sharing isn't supported in this browser", and the a11y snapshot shows the same text in a status.
- **Share link, copy by hand:** load `/room` with `Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });` and press Share link. The copy-by-hand field appears focused, with the whole link selected.
- **Reduced motion:** this Windows machine's Chrome reports `prefers-reduced-motion: reduce`, so the 3D view starts with "Show rays", and pressing it shows the rays. To see the default for everyone else, reload with this `initScript`; the view then starts with "Hide rays":
  ```js
  const matchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => (query.includes('prefers-reduced-motion') ? { matches: false, media: query, addEventListener() {}, removeEventListener() {} } : matchMedia(query));
  ```
- **Untitled copies:** rename a room to nothing, then Duplicate it. The copy is "Untitled room copy".
- **Landing:** "Listen to a space" is a visible h2 above the tabs.
- No console errors.

---

## After the last task

- Run `npm test` (600 tests), `npx tsc --noEmit`, `npm run lint` and `npm run build`. Confirm again that Spark stays in its own lazy chunk (Task 5, Step 9).
- The controller walks the whole flow once more on a phone-sized viewport:
  - fresh profile → `/room` → setup → a scan → the room;
  - the bar, the card, What if… and Edit room;
  - share the room and open the link in a second fresh profile;
  - My rooms → New room → the second room.
- Then write `docs/superpowers/plans/2026-10-06-room-remix-plan-5c-followups.md` in the 5a/5b follow-ups format: what the browser checks confirmed, what wasn't checked by machine (screen readers, iOS Safari's safe area and fixed bar, a real touch drag on the top view), the items for 5d, and the decisions taken during execution.
