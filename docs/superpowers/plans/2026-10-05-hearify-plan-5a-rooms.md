# Hearify: Plan 5a, Rooms That Persist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rooms are saved in the browser as you edit ("My rooms"), come back after a reload, and can be opened, added, copied and deleted. A shared link opens as a room of its own. Each room's scan is stored with that room.

**Architecture:**
- **Saved-rooms file (`rooms.ts`):** pure functions over one value, `{ rooms, currentId }`, plus two functions that read and write it through a storage object passed in. One `localStorage` key holds it.
- **Session (`session.ts`):** one object per page that decides which room is open (a shared link's, the one open last, or a first room) and keeps it saved. It gets everything browser-specific (storage, the address bar, the clock) passed in, so it is tested in Node.
- **Store:** the zustand store gains `roomId`, the list for "My rooms", and a notice.
- **Scans:** `scanStore` already stores under a key. The key becomes the room's id, and `ScanController` learns to switch rooms without rebuilding the 3D scene.
- **UI:** the room page waits for the session, then shows the room. The header gets a room-name field and a **My rooms** dialog.

**Tech Stack:** Next.js 16 (static export), React 19, TypeScript, zustand, Vitest, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-10-04-hearify-design.md`: §9 "State, sharing and saving", §8 "Splat layer" (scans keyed by room id), §11 (storage errors). Also the "Fix with Plan 5" lists in `docs/superpowers/plans/*-followups.md`.

**Where this sits:** Plan 5 is split into four plans, run in order. This is the first.
- **5a (this plan):** rooms that persist.
- **5b:** presets from recorded impulse responses, demo clips, the landing page, About/Privacy.
- **5c:** the setup wizard, player layout, a 2D top view without WebGL, the accessibility pass.
- **5d:** end-to-end tests, cleanup, Cloudflare Pages setup.

**Decided here (where the spec left room, or this plan differs):**
- **A saved room is `{ id, updatedAt, state }`.** The spec lists a separate `name`; the name is `state.name`, so it isn't stored twice.
- **A shared link opens as its own room.** It never overwrites the room that was open. Opening the same link twice reuses the room, as long as it hasn't been edited.
- **The link leaves the address bar once read,** and **Share** no longer writes it there. Before, edits left a stale link in the address bar, and a reload would have re-imported it.
- **Only valid rooms are saved.** A room with a size field cleared keeps its last good saved version until the field is valid again.
- **Rooms switch in the page, without a reload,** so a song that is playing keeps playing while you compare two rooms.
- **At most 50 rooms.** Adding a 51st is refused with a message; nothing is dropped silently.
- **The scan stored before this plan** (under the key `'current'`) is deleted, not moved. Nothing has been published, so only test scans exist.
- **When storage is blocked or full,** the app still works for the visit. "My rooms" lives in memory, and one notice says the rooms won't be kept.

## Global Constraints

- Static export only. **No user data leaves the device.** Rooms live in `localStorage`, scans in IndexedDB. A share link carries the room's numbers and name only, never a scan or a song.
- Imports:
  - `src/lib/acoustics/**` and `src/lib/room/**` don't import three.js or Spark and don't touch the DOM, `window` or `localStorage`. Browser objects are passed in.
  - three.js stays in `src/lib/scene/**` and `src/components/**`.
  - Spark is imported only by `src/lib/scene/SplatLayer.ts`. Lint enforces this; never value-import `SplatLayer`.
- React (lint enforces these): no synchronous `setState` in effect bodies; no ref reads during render; no browser APIs during render or prerender.
- Next.js 16 may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next-specific code.
- The `localStorage` key for rooms is `hearify:rooms`. The existing key `hearify:restoring` stays.
- Shell is Windows PowerShell. Every commit message ends with the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`, passed as a second `-m`.

## Review Focus

1. **Two tabs.** A room is added, edited or deleted in one tab while another is open. Nothing crashes; a save in one tab never wipes a room the other added; the list in each tab catches up. Tests: Task 2 ("keeps a room another tab added").
2. **Storage that doesn't work** (private windows, blocked, full). The page still opens a room and works; one notice appears, once; "My rooms" works until the page closes. Tests: Task 2 ("without working storage").
3. **A reload mid-edit.** A size field is empty when the page closes. The last good version comes back, not a broken room. Tests: Task 2 ("leaves the last good version…").
4. **Switching rooms mid-action:** while a scan is loading or being aligned, or while walking. The other room never shows this room's scan; alignment and walk mode end. Tests: Task 3 (the "rooms" tests); Task 4 browser check.
5. **A shared link opened by someone who already has rooms.** Their open room isn't touched; the link becomes its own room; the address bar is clean; opening it again doesn't add a copy. Tests: Task 2.

---

## File Structure

```
src/lib/room/
  rooms.ts             NEW  SavedRoom, RoomsFile; parse/serialize; add, upsert, select, remove, import, start; load/save through a storage object
  rooms.test.ts        NEW
  session.ts           NEW  RoomSession: start, save, open, create, duplicate, remove, refresh
  session.test.ts      NEW
  store.ts             MOD  roomId, rooms, notice; openRoom, setRooms, setNotice
  store.test.ts        MOD
src/lib/scene/
  scanStore.ts         MOD  the key is required (a room id); pruneScans
  scanStore.test.ts    MOD
  ScanController.ts    MOD  one key per room; roomKey; switchRoom; the restore marker names its room
  ScanController.test.ts MOD
src/components/
  useRoomSession.ts    NEW  the browser's session (roomSession) and the hook that starts it and autosaves
  RoomsMenu.tsx        NEW  the "My rooms" dialog
  ShareButton.tsx      MOD  link made ahead of the click, copied without touching the address bar, manual-copy fallback
  RoomView.tsx         MOD  scans follow roomId; walk mode, panel placing and messages reset on a room switch
src/app/room/
  page.tsx             MOD  starts the session; waits for a room; header with the room name, My rooms and Share
```

---

### Task 1: The saved-rooms file

**Files:**
- Create: `src/lib/room/rooms.ts`, `src/lib/room/rooms.test.ts`

**Interfaces:**
- Consumes: `migrate(raw): RoomState | null` from `./urlCodec` (it validates a stored state); `RoomState` from `./types`.
- Produces:
  ```ts
  type SavedRoom = { id: string; updatedAt: number; state: RoomState };
  type RoomsFile = { rooms: SavedRoom[]; currentId: string | null };
  type RoomsStorage = Pick<Storage, 'getItem' | 'setItem'> | null;
  ROOMS_KEY = 'hearify:rooms'; MAX_ROOMS = 50; EMPTY_ROOMS: RoomsFile
  parseRooms(json: string | null): RoomsFile
  serializeRooms(file): string
  sortedRooms(file): SavedRoom[]                 // newest first
  findRoom(file, id: string | null): SavedRoom | null
  currentRoom(file): SavedRoom | null            // open last, else newest, else null
  upsertRoom(file, id, state, now): RoomsFile    // the same file object when nothing changed
  addRoom(file, id, state, now): RoomsFile | null   // null when full; the new room becomes the open one
  selectRoom(file, id): RoomsFile                // unknown id: the same file
  removeRoom(file, id): RoomsFile
  uniqueName(file, base): string
  importRoom(file, state, id, now): RoomsFile | null
  startRooms(file, id, fresh: RoomState, now): RoomsFile
  newRoomId(): string
  loadRooms(storage: RoomsStorage): RoomsFile
  saveRooms(file, storage: RoomsStorage): boolean
  ```
  Every function returns a new value; none changes its arguments.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/room/rooms.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import {
  addRoom,
  currentRoom,
  EMPTY_ROOMS,
  findRoom,
  importRoom,
  loadRooms,
  MAX_ROOMS,
  newRoomId,
  parseRooms,
  removeRoom,
  ROOMS_KEY,
  saveRooms,
  selectRoom,
  serializeRooms,
  sortedRooms,
  startRooms,
  uniqueName,
  upsertRoom,
  type RoomsFile,
} from './rooms';
import type { RoomState } from './types';

const named = (name: string): RoomState => ({ ...defaultRoom(), name });
/** A file from [id, updatedAt, name] rows, with no room marked open. */
const file = (...rows: Array<[id: string, updatedAt: number, name: string]>): RoomsFile => ({
  rooms: rows.map(([id, updatedAt, name]) => ({ id, updatedAt, state: named(name) })),
  currentId: null,
});
/** An in-memory stand-in for localStorage. `failing` makes every access throw, as blocked or full storage does. */
function fakeStorage(failing = false) {
  const items = new Map<string, string>();
  const guard = () => {
    if (failing) throw new Error('blocked');
  };
  return {
    items,
    getItem: (key: string) => (guard(), items.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void items.set(key, value)),
  };
}

describe('parseRooms and serializeRooms', () => {
  it('round-trips the rooms and which one is open', () => {
    const saved: RoomsFile = { ...file(['a', 100, 'Studio'], ['b', 200, 'Den']), currentId: 'b' };
    expect(parseRooms(serializeRooms(saved))).toEqual(saved);
  });

  it('gives no rooms for nothing stored, broken JSON or another shape', () => {
    for (const json of [null, '', '{', '[]', '"rooms"', '{"v":2,"rooms":[]}', '{"v":1,"rooms":{}}']) {
      expect(parseRooms(json)).toEqual(EMPTY_ROOMS);
    }
  });

  it("drops a room it can't read and keeps the others", () => {
    const broken = { ...named('Broken'), dims: { length: 0, width: 3, height: 2.4 } };
    const json = JSON.stringify({
      v: 1,
      currentId: 'a',
      rooms: [
        { id: 'a', updatedAt: 100, state: named('Good') },
        { id: 'b', updatedAt: 200, state: broken },
        { updatedAt: 300, state: named('No id') },
        { id: 'a', updatedAt: 400, state: named('Same id again') },
        'not a room',
      ],
    });
    const parsed = parseRooms(json);
    expect(parsed.rooms.map((r) => [r.id, r.state.name])).toEqual([['a', 'Good']]);
    expect(parsed.currentId).toBe('a');
  });

  it("forgets an open room that isn't in the list", () => {
    const json = JSON.stringify({ v: 1, currentId: 'gone', rooms: [{ id: 'a', updatedAt: 1, state: named('A') }] });
    expect(parseRooms(json).currentId).toBeNull();
  });

  it('treats a missing save time as the oldest', () => {
    const json = JSON.stringify({ v: 1, currentId: null, rooms: [{ id: 'a', updatedAt: 'yesterday', state: named('A') }] });
    expect(parseRooms(json).rooms[0].updatedAt).toBe(0);
  });
});

describe('picking a room', () => {
  const saved = file(['old', 100, 'Old'], ['new', 300, 'New'], ['mid', 200, 'Mid']);

  it('lists the newest first, without reordering the file', () => {
    expect(sortedRooms(saved).map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect(saved.rooms.map((r) => r.id)).toEqual(['old', 'new', 'mid']);
  });

  it('finds a room by id', () => {
    expect(findRoom(saved, 'mid')?.state.name).toBe('Mid');
    expect(findRoom(saved, 'nope')).toBeNull();
    expect(findRoom(saved, null)).toBeNull();
  });

  it('opens the room that was open last, else the newest, else none', () => {
    expect(currentRoom({ ...saved, currentId: 'old' })?.id).toBe('old');
    expect(currentRoom(saved)?.id).toBe('new');
    expect(currentRoom(EMPTY_ROOMS)).toBeNull();
  });
});

describe('changing the rooms', () => {
  it('saves a changed room with the time', () => {
    const saved = file(['a', 100, 'A']);
    const next = upsertRoom(saved, 'a', named('Renamed'), 500);
    expect(next.rooms).toEqual([{ id: 'a', updatedAt: 500, state: named('Renamed') }]);
    expect(saved.rooms[0].state.name).toBe('A'); // the argument is untouched
  });

  it('returns the same file when the room has not changed', () => {
    const saved = file(['a', 100, 'A']);
    expect(upsertRoom(saved, 'a', named('A'), 500)).toBe(saved);
  });

  it('adds a room it has not seen', () => {
    const next = upsertRoom(file(['a', 100, 'A']), 'b', named('B'), 500);
    expect(next.rooms.map((r) => r.id)).toEqual(['a', 'b']);
    expect(next.currentId).toBeNull(); // saving is not opening
  });

  it('adds a room as the open one, and refuses when My rooms is full', () => {
    const added = addRoom(file(['a', 100, 'A']), 'b', named('B'), 500);
    expect(added?.currentId).toBe('b');
    expect(added?.rooms).toHaveLength(2);
    const full: RoomsFile = {
      rooms: Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) })),
      currentId: 'r0',
    };
    expect(addRoom(full, 'extra', named('Extra'), 500)).toBeNull();
  });

  it('marks a saved room as the open one, and ignores an unknown id', () => {
    const saved = file(['a', 100, 'A'], ['b', 200, 'B']);
    expect(selectRoom(saved, 'a').currentId).toBe('a');
    expect(selectRoom(saved, 'nope')).toBe(saved);
  });

  it('opens the newest room that is left when the open one is deleted', () => {
    const saved: RoomsFile = { ...file(['a', 100, 'A'], ['b', 300, 'B'], ['c', 200, 'C']), currentId: 'b' };
    const next = removeRoom(saved, 'b');
    expect(next.rooms.map((r) => r.id)).toEqual(['a', 'c']);
    expect(next.currentId).toBe('c');
  });

  it('keeps the open room when another one is deleted, and leaves none open after the last', () => {
    const saved: RoomsFile = { ...file(['a', 100, 'A'], ['b', 300, 'B']), currentId: 'a' };
    expect(removeRoom(saved, 'b').currentId).toBe('a');
    expect(removeRoom(removeRoom(saved, 'b'), 'a')).toEqual(EMPTY_ROOMS);
  });

  it('finds a name no saved room has', () => {
    expect(uniqueName(file(['a', 1, 'Den']), 'My room')).toBe('My room');
    expect(uniqueName(file(['a', 1, 'My room']), 'My room')).toBe('My room 2');
    expect(uniqueName(file(['a', 1, 'My room'], ['b', 2, 'My room 2']), 'My room')).toBe('My room 3');
    const long = 'x'.repeat(80);
    expect(uniqueName(file(['a', 1, long]), long).length).toBeLessThanOrEqual(80);
  });
});

describe('importRoom', () => {
  it('adds a shared room as the open one', () => {
    const next = importRoom({ ...file(['a', 100, 'Mine']), currentId: 'a' }, named('Shared'), 'new', 500);
    expect(next?.currentId).toBe('new');
    expect(next?.rooms.map((r) => r.state.name)).toEqual(['Mine', 'Shared']);
  });

  it('reuses the saved room when the same room is shared again', () => {
    const saved: RoomsFile = { ...file(['a', 100, 'Mine'], ['b', 200, 'Shared']), currentId: 'a' };
    const next = importRoom(saved, named('Shared'), 'new', 500);
    expect(next?.currentId).toBe('b');
    expect(next?.rooms).toHaveLength(2);
  });

  it('refuses when My rooms is full', () => {
    const full: RoomsFile = {
      rooms: Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) })),
      currentId: 'r0',
    };
    expect(importRoom(full, named('Shared'), 'new', 500)).toBeNull();
  });
});

describe('startRooms', () => {
  it('keeps the room that was open', () => {
    const saved: RoomsFile = { ...file(['a', 100, 'A'], ['b', 200, 'B']), currentId: 'a' };
    expect(startRooms(saved, 'new', named('Fresh'), 500)).toBe(saved);
  });

  it('opens the newest room when none is marked open', () => {
    const next = startRooms(file(['a', 100, 'A'], ['b', 200, 'B']), 'new', named('Fresh'), 500);
    expect(next.currentId).toBe('b');
    expect(next.rooms).toHaveLength(2);
  });

  it('makes a first room when there is none', () => {
    expect(startRooms(EMPTY_ROOMS, 'new', named('Fresh'), 500)).toEqual({
      rooms: [{ id: 'new', updatedAt: 500, state: named('Fresh') }],
      currentId: 'new',
    });
  });
});

describe('newRoomId', () => {
  it('gives a different, non-empty id each time', () => {
    const a = newRoomId();
    const b = newRoomId();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});

describe('loadRooms and saveRooms', () => {
  it('reads back what was written, under the rooms key', () => {
    const storage = fakeStorage();
    const saved: RoomsFile = { ...file(['a', 100, 'A']), currentId: 'a' };
    expect(saveRooms(saved, storage)).toBe(true);
    expect(storage.items.has(ROOMS_KEY)).toBe(true);
    expect(loadRooms(storage)).toEqual(saved);
  });

  it('gives no rooms when there is no storage, or it throws', () => {
    expect(loadRooms(null)).toEqual(EMPTY_ROOMS);
    expect(loadRooms(fakeStorage(true))).toEqual(EMPTY_ROOMS);
  });

  it('reports a write that did not happen', () => {
    expect(saveRooms(file(['a', 100, 'A']), null)).toBe(false);
    expect(saveRooms(file(['a', 100, 'A']), fakeStorage(true))).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/room/rooms.test.ts`
Expected: FAIL. Vitest can't resolve `./rooms`.

- [ ] **Step 3: Implement**

Create `src/lib/room/rooms.ts`:
```ts
import type { RoomState } from './types';
import { migrate } from './urlCodec';

/** A room kept in this browser's "My rooms". Its name is `state.name`. */
export type SavedRoom = { id: string; updatedAt: number; state: RoomState };
/** Everything "My rooms" stores: the rooms, and which one was open last. */
export type RoomsFile = { rooms: SavedRoom[]; currentId: string | null };
/** The part of `localStorage` this module needs. Null where the browser has none or blocks it. */
export type RoomsStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

export const ROOMS_KEY = 'hearify:rooms';
export const MAX_ROOMS = 50;
export const EMPTY_ROOMS: RoomsFile = { rooms: [], currentId: null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sameState = (a: RoomState, b: RoomState) => JSON.stringify(a) === JSON.stringify(b);

/** Read a stored rooms file. Unreadable rooms are dropped one by one, so a bad entry never costs the others. */
export function parseRooms(json: string | null): RoomsFile {
  if (!json) return EMPTY_ROOMS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return EMPTY_ROOMS;
  }
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.rooms)) return EMPTY_ROOMS;
  const rooms: SavedRoom[] = [];
  const ids = new Set<string>();
  for (const entry of raw.rooms as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) continue;
    const state = migrate(entry.state);
    if (!state) continue;
    const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
    rooms.push({ id: entry.id, updatedAt, state });
    ids.add(entry.id);
  }
  const currentId = typeof raw.currentId === 'string' && ids.has(raw.currentId) ? raw.currentId : null;
  return { rooms, currentId };
}

export function serializeRooms(file: RoomsFile): string {
  return JSON.stringify({ v: 1, rooms: file.rooms, currentId: file.currentId });
}

/** The rooms, newest first. */
export function sortedRooms(file: RoomsFile): SavedRoom[] {
  return [...file.rooms].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findRoom(file: RoomsFile, id: string | null): SavedRoom | null {
  return file.rooms.find((room) => room.id === id) ?? null;
}

/** The room to open at the start: the one open last, else the newest, else none. */
export function currentRoom(file: RoomsFile): SavedRoom | null {
  return findRoom(file, file.currentId) ?? sortedRooms(file)[0] ?? null;
}

/** Save a room's state. Returns the same file when nothing changed, so the caller can skip the write. */
export function upsertRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile {
  const existing = findRoom(file, id);
  if (existing && sameState(existing.state, state)) return file;
  const saved: SavedRoom = { id, updatedAt: now, state };
  return { ...file, rooms: existing ? file.rooms.map((room) => (room.id === id ? saved : room)) : [...file.rooms, saved] };
}

/** Add a room and make it the open one. Null when "My rooms" is full. */
export function addRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile | null {
  if (file.rooms.length >= MAX_ROOMS) return null;
  return { rooms: [...file.rooms, { id, updatedAt: now, state }], currentId: id };
}

/** Make a saved room the open one. An unknown id changes nothing. */
export function selectRoom(file: RoomsFile, id: string): RoomsFile {
  return findRoom(file, id) ? { ...file, currentId: id } : file;
}

/** Delete a room. If it was the open one, the newest room that is left becomes the open one. */
export function removeRoom(file: RoomsFile, id: string): RoomsFile {
  const rooms = file.rooms.filter((room) => room.id !== id);
  const currentId = file.currentId === id ? (sortedRooms({ rooms, currentId: null })[0]?.id ?? null) : file.currentId;
  return { rooms, currentId };
}

/** A name no saved room has yet: "My room", then "My room 2", "My room 3"… */
export function uniqueName(file: RoomsFile, base: string): string {
  const taken = new Set(file.rooms.map((room) => room.state.name));
  if (!taken.has(base)) return base;
  const stem = base.slice(0, 72); // a room name holds 80 characters: leave space for the number
  for (let n = 2; ; n++) {
    const name = `${stem} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Open a shared room as a room of its own. A saved room with exactly that state is reused, so opening the same link
 * twice doesn't pile up copies. Null when "My rooms" is full.
 */
export function importRoom(file: RoomsFile, state: RoomState, id: string, now: number): RoomsFile | null {
  const same = file.rooms.find((room) => sameState(room.state, state));
  return same ? { ...file, currentId: same.id } : addRoom(file, id, state, now);
}

/** Make sure a room is open: the one open last, else the newest, else a first room made from `fresh`. */
export function startRooms(file: RoomsFile, id: string, fresh: RoomState, now: number): RoomsFile {
  const open = currentRoom(file);
  if (!open) return { rooms: [{ id, updatedAt: now, state: fresh }], currentId: id };
  return open.id === file.currentId ? file : { ...file, currentId: open.id };
}

export function newRoomId(): string {
  // randomUUID needs a secure context: plain http on a LAN address (testing on a phone) has none.
  return globalThis.crypto?.randomUUID?.() ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** The saved rooms, or none when storage is missing, blocked or unreadable. */
export function loadRooms(storage: RoomsStorage): RoomsFile {
  try {
    return parseRooms(storage?.getItem(ROOMS_KEY) ?? null);
  } catch {
    return EMPTY_ROOMS;
  }
}

/** Write the rooms. False when storage is missing, blocked or full: the rooms then last only until the page closes. */
export function saveRooms(file: RoomsFile, storage: RoomsStorage): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ROOMS_KEY, serializeRooms(file));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests, check and commit**

Run `npx vitest run src/lib/room/rooms.test.ts` (PASS, 26 tests). Then run `npm test`, `npx tsc --noEmit` and `npm run lint`.
```powershell
git add src/lib/room/rooms.ts src/lib/room/rooms.test.ts
git commit -m "feat: the saved-rooms file: parse, add, save, open, delete and import rooms" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The room session: open the right room and keep it saved

**Files:**
- Create: `src/lib/room/session.ts`, `src/lib/room/session.test.ts`, `src/components/useRoomSession.ts`
- Modify: `src/lib/room/store.ts`, `src/lib/room/store.test.ts`, `src/app/room/page.tsx`, `src/components/ShareButton.tsx`

**Interfaces:**
- Consumes: everything Task 1 produces; `defaultRoom`, `validateRoom` from `./roomState`; `decodeRoom`, `encodeRoom` from `./urlCodec`.
- Produces:
  - Store: `roomId: string | null`, `rooms: SavedRoom[]`, `notice: string | null`, `openRoom(id, room)`, `setRooms(rooms)`, `setNotice(notice)`. `room`, `setRoom` and `update` stay as they are.
  - `session.ts`:
    ```ts
    type SessionEnv = {
      storage: RoomsStorage;
      readLink: () => string;        // the share code in the address bar, '' for none
      clearLink: () => void;
      decode: (code: string) => Promise<RoomState | null>;
      now: () => number;
      newId: () => string;
    };
    LINK_NOTICE, FULL_NOTICE, UNSAVED_NOTICE: string
    class RoomSession {
      constructor(env: SessionEnv);
      start(): Promise<void>;        // safe to call again
      save(): void;                  // the open room, if valid
      open(id: string): void;
      create(): void;
      duplicate(id: string): void;
      remove(id: string): void;
      refresh(): void;               // re-read the list (another tab changed it)
    }
    ```
  - `useRoomSession.ts`: `roomSession(): RoomSession` (the page's one session; browser only) and `useRoomSession(): void`.

What it does:
- **Start:**
  - A share code in the address bar is decoded and taken out of the address bar.
  - A readable one opens as its own room. An unreadable one shows `LINK_NOTICE`.
  - With no link, the room open last opens, else the newest, else a first room is made and saved.
- **Save:** only a valid open room is saved. Every change re-reads the file first, so another tab's rooms survive.
- **Storage that can't be written:** the rooms are kept in memory for the page, and `UNSAVED_NOTICE` shows once.
- **The page** shows "Opening your room…" until a room is open, so the 3D view never mounts on the placeholder room.
- **Share** makes the link ahead of the click and copies it without changing the address bar. If copying fails, it shows the link in a field to copy by hand.

- [ ] **Step 1: Write the failing tests**

In `src/lib/room/store.test.ts`, replace the whole file with:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { useRoomStore } from './store';

beforeEach(() => {
  useRoomStore.setState({ roomId: null, room: defaultRoom(), rooms: [], notice: null });
});

describe('useRoomStore', () => {
  it('starts with the default room, not yet a saved one', () => {
    const state = useRoomStore.getState();
    expect(state.room).toEqual(defaultRoom());
    expect(state.roomId).toBeNull();
    expect(state.rooms).toEqual([]);
    expect(state.notice).toBeNull();
  });

  it('updates and replaces the room', () => {
    useRoomStore.getState().update((r) => ({ ...r, name: 'Studio' }));
    expect(useRoomStore.getState().room.name).toBe('Studio');
    useRoomStore.getState().setRoom(defaultRoom());
    expect(useRoomStore.getState().room.name).toBe('My room');
  });

  it('opens a saved room: its id and state together', () => {
    const studio = { ...defaultRoom(), name: 'Studio' };
    useRoomStore.getState().openRoom('room-1', studio);
    expect(useRoomStore.getState().roomId).toBe('room-1');
    expect(useRoomStore.getState().room).toBe(studio);
  });

  it('holds the rooms list and a notice', () => {
    const saved = [{ id: 'a', updatedAt: 1, state: defaultRoom() }];
    useRoomStore.getState().setRooms(saved);
    useRoomStore.getState().setNotice('Something to know');
    expect(useRoomStore.getState().rooms).toBe(saved);
    expect(useRoomStore.getState().notice).toBe('Something to know');
    useRoomStore.getState().setNotice(null);
    expect(useRoomStore.getState().notice).toBeNull();
  });
});
```

Create `src/lib/room/session.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { addRoom, loadRooms, MAX_ROOMS, ROOMS_KEY, saveRooms, type RoomsFile } from './rooms';
import { FULL_NOTICE, LINK_NOTICE, RoomSession, UNSAVED_NOTICE, type SessionEnv } from './session';
import { useRoomStore } from './store';
import type { RoomState } from './types';

const named = (name: string): RoomState => ({ ...defaultRoom(), name });
const store = () => useRoomStore.getState();

/** An in-memory stand-in for localStorage that counts writes. `failing` makes every access throw. */
function fakeStorage(failing = false) {
  const items = new Map<string, string>();
  const counts = { writes: 0 };
  const guard = () => {
    if (failing) throw new Error('blocked');
  };
  return {
    items,
    counts,
    getItem: (key: string) => (guard(), items.get(key) ?? null),
    setItem: (key: string, value: string) => {
      guard();
      counts.writes++;
      items.set(key, value);
    },
  };
}

/** A session over fakes. `links` maps share codes to the rooms they decode to; any other code is unreadable. */
function setup(options: { storage?: ReturnType<typeof fakeStorage> | null; links?: Record<string, RoomState> } = {}) {
  const storage = options.storage === undefined ? fakeStorage() : options.storage;
  let link = '';
  let clock = 1000;
  let ids = 0;
  const env: SessionEnv = {
    storage,
    readLink: () => link,
    clearLink: () => {
      link = '';
    },
    decode: async (code) => options.links?.[code] ?? null,
    now: () => ++clock,
    newId: () => `id-${++ids}`,
  };
  return {
    session: new RoomSession(env),
    storage,
    saved: () => loadRooms(storage),
    link: () => link,
    setLink: (code: string) => {
      link = code;
    },
  };
}

/** Storage that already holds these rooms, [id, updatedAt, name], with `currentId` open. */
function storageWith(currentId: string | null, ...rows: Array<[string, number, string]>) {
  const storage = fakeStorage();
  const file: RoomsFile = { rooms: rows.map(([id, updatedAt, name]) => ({ id, updatedAt, state: named(name) })), currentId };
  saveRooms(file, storage);
  storage.counts.writes = 0;
  return storage;
}

beforeEach(() => {
  useRoomStore.setState({ roomId: null, room: defaultRoom(), rooms: [], notice: null });
});

describe('RoomSession start', () => {
  it('makes and saves a first room when nothing is saved', async () => {
    const t = setup();
    await t.session.start();
    expect(t.saved().rooms).toHaveLength(1);
    expect(store().roomId).toBe(t.saved().currentId);
    expect(store().room).toEqual(defaultRoom());
    expect(store().rooms).toHaveLength(1);
    expect(store().notice).toBeNull();
  });

  it('opens the room that was open last', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    expect(store().roomId).toBe('a');
    expect(store().room.name).toBe('Studio');
    expect(store().rooms.map((r) => r.id)).toEqual(['b', 'a']); // the list is newest first
  });

  it('opens the newest room when none was marked open', async () => {
    const t = setup({ storage: storageWith(null, ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    expect(store().roomId).toBe('b');
    expect(t.saved().currentId).toBe('b');
  });

  it('opens a shared link as a room of its own and takes the link out of the address bar', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Mine']), links: { code: named('Shared') } });
    t.setLink('code');
    await t.session.start();
    expect(t.link()).toBe('');
    expect(store().room.name).toBe('Shared');
    expect(store().roomId).not.toBe('a');
    expect(t.saved().rooms.map((r) => r.state.name)).toEqual(['Mine', 'Shared']);
    expect(t.saved().currentId).toBe(store().roomId);
    expect(store().notice).toBeNull();
  });

  it('reuses the room when the same link is opened again', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Mine']), links: { code: named('Shared') } });
    t.setLink('code');
    await t.session.start();
    const first = store().roomId;
    t.session.open('a');
    t.setLink('code');
    await t.session.start();
    expect(store().roomId).toBe(first);
    expect(t.saved().rooms).toHaveLength(2);
  });

  it("says so when a link can't be read, and opens the usual room", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Mine']) });
    t.setLink('garbage');
    await t.session.start();
    expect(store().notice).toBe(LINK_NOTICE);
    expect(store().roomId).toBe('a');
    expect(t.link()).toBe('');
    expect(t.saved().rooms).toHaveLength(1);
  });

  it('refuses a shared link when My rooms is full', async () => {
    const storage = fakeStorage();
    const rooms = Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) }));
    saveRooms({ rooms, currentId: 'r3' }, storage);
    const t = setup({ storage, links: { code: named('Shared') } });
    t.setLink('code');
    await t.session.start();
    expect(store().notice).toBe(FULL_NOTICE);
    expect(store().roomId).toBe('r3');
    expect(t.saved().rooms).toHaveLength(MAX_ROOMS);
  });

  it("keeps the open room's unfinished edit when started again", async () => {
    const t = setup();
    await t.session.start();
    store().update((r) => ({ ...r, dims: { ...r.dims, length: Number.NaN } })); // a size field cleared
    await t.session.start();
    expect(store().room.dims.length).toBeNaN();
  });
});

describe('RoomSession save', () => {
  it("saves the open room's edits and brings the list up to date", async () => {
    const t = setup();
    await t.session.start();
    const before = t.saved().rooms[0].updatedAt;
    store().update((r) => ({ ...r, name: 'Studio' }));
    t.session.save();
    expect(t.saved().rooms[0].state.name).toBe('Studio');
    expect(t.saved().rooms[0].updatedAt).toBeGreaterThan(before);
    expect(store().rooms[0].state.name).toBe('Studio');
  });

  it('leaves the last good version when the room is mid-edit', async () => {
    const t = setup();
    await t.session.start();
    store().update((r) => ({ ...r, name: 'Good' }));
    t.session.save();
    store().update((r) => ({ ...r, name: 'Bad', dims: { ...r.dims, length: Number.NaN } }));
    t.session.save();
    expect(t.saved().rooms[0].state.name).toBe('Good');
    expect(t.saved().rooms[0].state.dims.length).toBe(4);
  });

  it('does not write when nothing changed', async () => {
    const t = setup();
    await t.session.start();
    const writes = t.storage!.counts.writes;
    t.session.save();
    t.session.save();
    expect(t.storage!.counts.writes).toBe(writes);
  });

  it('keeps a room another tab added', async () => {
    const t = setup();
    await t.session.start();
    const mine = store().roomId;
    saveRooms(addRoom(t.saved(), 'other-tab', named('Other tab'), 5)!, t.storage); // another tab adds and opens a room
    store().update((r) => ({ ...r, name: 'Edited here' }));
    t.session.save();
    expect(t.saved().rooms.map((r) => r.state.name).sort()).toEqual(['Edited here', 'Other tab']);
    expect(store().roomId).toBe(mine);
  });

  it('saves nothing before a room is open', () => {
    const t = setup();
    t.session.save();
    expect(t.storage!.items.has(ROOMS_KEY)).toBe(false);
  });
});

describe('RoomSession rooms', () => {
  it('adds a new room with its own name and opens it, saving the room being left first', async () => {
    const t = setup();
    await t.session.start();
    const first = store().roomId;
    store().update((r) => ({ ...r, furnishing: 'bare' }));
    t.session.create();
    expect(store().roomId).not.toBe(first);
    expect(store().room.name).toBe('My room 2');
    expect(t.saved().rooms).toHaveLength(2);
    expect(t.saved().currentId).toBe(store().roomId);
    expect(t.saved().rooms.find((r) => r.id === first)?.state.furnishing).toBe('bare');
  });

  it('says so when My rooms is full', async () => {
    const storage = fakeStorage();
    const rooms = Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) }));
    saveRooms({ rooms, currentId: 'r3' }, storage);
    const t = setup({ storage });
    await t.session.start();
    t.session.create();
    expect(store().notice).toBe(FULL_NOTICE);
    expect(store().roomId).toBe('r3');
    expect(t.saved().rooms).toHaveLength(MAX_ROOMS);
  });

  it('opens another saved room and remembers it as the open one', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    t.session.open('b');
    expect(store().roomId).toBe('b');
    expect(store().room.name).toBe('Den');
    expect(t.saved().currentId).toBe('b');
  });

  it('stays where it is when the room to open is gone', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    t.session.open('deleted-elsewhere');
    expect(store().roomId).toBe('a');
  });

  it('copies a room under a new name and opens the copy', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    t.session.duplicate('a');
    expect(store().room.name).toBe('Studio copy');
    expect(store().roomId).not.toBe('a');
    expect(t.saved().rooms).toHaveLength(2);
  });

  it('deletes another room and stays in the open one', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    t.session.remove('b');
    expect(store().roomId).toBe('a');
    expect(t.saved().rooms.map((r) => r.id)).toEqual(['a']);
    expect(store().rooms.map((r) => r.id)).toEqual(['a']);
  });

  it('opens the newest room that is left when the open one is deleted', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den'], ['c', 300, 'Loft']) });
    await t.session.start();
    t.session.remove('a');
    expect(store().roomId).toBe('c');
    expect(t.saved().rooms.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('opens a fresh room when the only room is deleted', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    t.session.remove('a');
    expect(store().roomId).not.toBe('a');
    expect(store().room).toEqual(defaultRoom());
    expect(t.saved().rooms).toHaveLength(1);
  });

  it('re-reads the list without touching the open room', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    store().update((r) => ({ ...r, name: 'Unsaved edit' }));
    saveRooms(addRoom(t.saved(), 'other-tab', named('Other tab'), 500)!, t.storage);
    t.session.refresh();
    expect(store().rooms.map((r) => r.id)).toEqual(['other-tab', 'a']);
    expect(store().roomId).toBe('a');
    expect(store().room.name).toBe('Unsaved edit');
  });
});

describe('RoomSession without working storage', () => {
  it('still opens a room, warns once, and keeps My rooms for the page', async () => {
    const t = setup({ storage: fakeStorage(true) });
    await t.session.start();
    expect(store().roomId).not.toBeNull();
    expect(store().notice).toBe(UNSAVED_NOTICE);
    store().setNotice(null); // dismissed
    const first = store().roomId!;
    t.session.create();
    expect(store().rooms).toHaveLength(2);
    expect(store().notice).toBeNull(); // not shown a second time
    t.session.open(first);
    expect(store().roomId).toBe(first);
  });

  it('works with no storage at all', async () => {
    const t = setup({ storage: null });
    await t.session.start();
    expect(store().roomId).not.toBeNull();
    expect(store().notice).toBe(UNSAVED_NOTICE);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/room/store.test.ts src/lib/room/session.test.ts`
Expected: FAIL. `./session` doesn't exist, and the store has no `roomId`.

- [ ] **Step 3: The store**

Replace `src/lib/room/store.ts` with:
```ts
import { create } from 'zustand';
import { defaultRoom } from './roomState';
import type { SavedRoom } from './rooms';
import type { RoomState } from './types';

type RoomStore = {
  /** The saved room being edited. Null until the saved rooms have been read, and always while prerendering. */
  roomId: string | null;
  room: RoomState;
  /** "My rooms", newest first. */
  rooms: SavedRoom[];
  /** Something the user should know: a link that didn't load, rooms that aren't being kept. */
  notice: string | null;
  setRoom: (room: RoomState) => void;
  update: (fn: (room: RoomState) => RoomState) => void;
  /** Switch to a saved room: its id and state change together. */
  openRoom: (id: string, room: RoomState) => void;
  setRooms: (rooms: SavedRoom[]) => void;
  setNotice: (notice: string | null) => void;
};

export const useRoomStore = create<RoomStore>()((set) => ({
  roomId: null,
  room: defaultRoom(),
  rooms: [],
  notice: null,
  setRoom: (room) => set({ room }),
  update: (fn) => set((state) => ({ room: fn(state.room) })),
  openRoom: (roomId, room) => set({ roomId, room }),
  setRooms: (rooms) => set({ rooms }),
  setNotice: (notice) => set({ notice }),
}));
```

- [ ] **Step 4: The session**

Create `src/lib/room/session.ts`:
```ts
import { defaultRoom, validateRoom } from './roomState';
import {
  addRoom,
  findRoom,
  importRoom,
  loadRooms,
  MAX_ROOMS,
  removeRoom,
  saveRooms,
  selectRoom,
  sortedRooms,
  startRooms,
  uniqueName,
  upsertRoom,
  type RoomsFile,
  type RoomsStorage,
} from './rooms';
import { useRoomStore } from './store';
import type { RoomState } from './types';

export const LINK_NOTICE = "This link couldn't be fully loaded.";
export const FULL_NOTICE = `You have ${MAX_ROOMS} saved rooms. Delete one to add another.`;
export const UNSAVED_NOTICE =
  "This browser isn't keeping your rooms (its storage is blocked or full). They will be gone when you close this page.";

/** What a session needs from the browser, so tests can stand in for it. */
export type SessionEnv = {
  storage: RoomsStorage;
  /** The share code in the address bar ('' when there is none). */
  readLink: () => string;
  /** Take the share code out of the address bar. */
  clearLink: () => void;
  decode: (code: string) => Promise<RoomState | null>;
  now: () => number;
  newId: () => string;
};

/**
 * "My rooms" for one page: which saved room is open, and keeping it saved. It reads and writes the saved-rooms file and
 * puts the open room into the store. Every change re-reads the file first, so another tab's rooms aren't overwritten.
 */
export class RoomSession {
  private unsaved: RoomsFile | null = null; // the rooms while storage can't be written: they last until the page closes
  private warned = false; // UNSAVED_NOTICE has been shown

  constructor(private readonly env: SessionEnv) {}

  /**
   * Open a room: the shared link's if the address bar has one, else the one open last, else a first room.
   * Safe to call again: a link pasted into the address bar later opens the same way.
   */
  async start(): Promise<void> {
    const code = this.env.readLink();
    const linked = code ? await this.env.decode(code) : null;
    if (code) this.env.clearLink(); // read once: later edits mustn't leave a stale link in the address bar
    this.save();
    let file = this.read();
    let notice: string | null = code && !linked ? LINK_NOTICE : null;
    if (linked) {
      const imported = importRoom(file, linked, this.env.newId(), this.env.now());
      if (imported) file = imported;
      else notice = FULL_NOTICE;
    }
    file = startRooms(file, this.env.newId(), defaultRoom(), this.env.now());
    this.write(file);
    if (notice) useRoomStore.getState().setNotice(notice);
    this.show(file);
  }

  /** Save the open room now, if it is valid. A room that is mid-edit isn't saved: its last good version stays. */
  save(): void {
    const { roomId, room } = useRoomStore.getState();
    if (!roomId || validateRoom(room).length > 0) return;
    const file = this.read();
    const next = upsertRoom(file, roomId, room, this.env.now());
    if (next !== file) this.write(next);
  }

  /** Open another saved room. */
  open(id: string): void {
    this.save();
    const file = selectRoom(this.read(), id);
    if (file.currentId !== id) return this.refresh(); // deleted in another tab meanwhile
    this.write(file);
    this.show(file);
  }

  /** Add a fresh room and open it. */
  create(): void {
    this.add((file) => ({ ...defaultRoom(), name: uniqueName(file, defaultRoom().name) }));
  }

  /** Copy a saved room and open the copy. */
  duplicate(id: string): void {
    this.add((file) => {
      const source = findRoom(file, id);
      return source && { ...source.state, name: uniqueName(file, `${source.state.name} copy`) };
    });
  }

  /** Delete a saved room. Deleting the open one opens the newest that is left, or a fresh room when none is. */
  remove(id: string): void {
    if (useRoomStore.getState().roomId !== id) this.save();
    const file = startRooms(removeRoom(this.read(), id), this.env.newId(), defaultRoom(), this.env.now());
    this.write(file);
    this.show(file);
  }

  /** Re-read the saved rooms for the list (another tab changed them). The open room is left alone. */
  refresh(): void {
    useRoomStore.getState().setRooms(sortedRooms(this.read()));
  }

  private add(make: (file: RoomsFile) => RoomState | null): void {
    this.save();
    const file = this.read();
    const state = make(file);
    if (!state) return;
    const added = addRoom(file, this.env.newId(), state, this.env.now());
    if (!added) return useRoomStore.getState().setNotice(FULL_NOTICE);
    this.write(added);
    this.show(added);
  }

  private read(): RoomsFile {
    return this.unsaved ?? loadRooms(this.env.storage);
  }

  private write(file: RoomsFile): void {
    const kept = saveRooms(file, this.env.storage);
    this.unsaved = kept ? null : file;
    const store = useRoomStore.getState();
    store.setRooms(sortedRooms(file));
    if (!kept && !this.warned) {
      this.warned = true;
      store.setNotice(UNSAVED_NOTICE);
    }
  }

  /** Put the file's open room into the store, unless it is the room already open: its unsaved edits must survive. */
  private show(file: RoomsFile): void {
    const room = findRoom(file, file.currentId);
    if (room && room.id !== useRoomStore.getState().roomId) useRoomStore.getState().openRoom(room.id, room.state);
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/lib/room/store.test.ts src/lib/room/session.test.ts`
Expected: PASS (4 + 24 tests).

- [ ] **Step 6: The browser's session and the hook**

Create `src/components/useRoomSession.ts`:
```ts
'use client';

import { useEffect } from 'react';
import { newRoomId, ROOMS_KEY, type RoomsStorage } from '@/lib/room/rooms';
import { RoomSession } from '@/lib/room/session';
import { useRoomStore } from '@/lib/room/store';
import { decodeRoom } from '@/lib/room/urlCodec';

const AUTOSAVE_MS = 400;

function browserStorage(): RoomsStorage {
  try {
    return window.localStorage; // reading the property itself throws where storage is blocked
  } catch {
    return null;
  }
}

let session: RoomSession | null = null;

/** The page's room session. Browser only: call it from effects and event handlers, never while rendering. */
export function roomSession(): RoomSession {
  session ??= new RoomSession({
    storage: browserStorage(),
    readLink: () => window.location.hash.slice(1),
    clearLink: () => window.history.replaceState(null, '', window.location.pathname + window.location.search),
    decode: decodeRoom,
    now: Date.now,
    newId: newRoomId,
  });
  return session;
}

/** Start the room session for this page: open the right room, follow pasted links, and save edits once they settle. */
export function useRoomSession(): void {
  useEffect(() => {
    const rooms = roomSession();
    void rooms.start();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveNow = () => {
      clearTimeout(timer);
      timer = undefined;
      rooms.save();
    };
    const unsubscribe = useRoomStore.subscribe((state, previous) => {
      if (state.room === previous.room || state.roomId !== previous.roomId) return; // opening a room isn't an edit
      clearTimeout(timer);
      timer = setTimeout(saveNow, AUTOSAVE_MS);
    });
    const onLink = () => void rooms.start(); // a link pasted into the address bar while the page is open
    const onHidden = () => {
      if (document.visibilityState === 'hidden') saveNow(); // the last chance on phones, where pagehide may not fire
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === ROOMS_KEY) rooms.refresh(); // another tab changed the rooms
    };
    window.addEventListener('hashchange', onLink);
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('storage', onStorage);
    return () => {
      saveNow();
      unsubscribe();
      window.removeEventListener('hashchange', onLink);
      window.removeEventListener('pagehide', saveNow);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
```

- [ ] **Step 7: The page waits for a room**

Replace `src/app/room/page.tsx` with:
```tsx
'use client';

import { useState } from 'react';
import { Player } from '@/components/Player';
import { RoomForm } from '@/components/RoomForm';
import { RoomView } from '@/components/RoomView';
import { ShareButton } from '@/components/ShareButton';
import { useRoomSession } from '@/components/useRoomSession';
import { DEFAULT_SAMPLE_RATE, useSimulation } from '@/components/useSimulation';
import type { ListenMode } from '@/lib/audio/mix';
import { useRoomStore } from '@/lib/room/store';

export default function RoomPage() {
  useRoomSession();
  const roomId = useRoomStore((s) => s.roomId);
  const notice = useRoomStore((s) => s.notice);
  const setNotice = useRoomStore((s) => s.setNotice);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      {/* Mounted all the time, so a screen reader announces a notice when it appears. */}
      <div role="status" className="empty:hidden">
        {notice && (
          <p className="flex items-start justify-between gap-3 rounded-lg border border-amber-700 p-3 text-sm text-amber-200">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}
      </div>
      {roomId ? <RoomWorkspace /> : <p className="text-neutral-400">Opening your room…</p>}
    </main>
  );
}

/** The open room: 3D view, player and form. Shown once the saved rooms have been read. */
function RoomWorkspace() {
  const room = useRoomStore((s) => s.room);
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const sim = useSimulation(room, sampleRate);

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:flex-1">
          <RoomView mode={mode} />
        </div>
        <div className="lg:w-80">
          <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
        </div>
      </div>
      <RoomForm />
    </>
  );
}
```

- [ ] **Step 8: Share without the address bar**

Replace `src/components/ShareButton.tsx` with:
```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import type { RoomState } from '@/lib/room/types';
import { encodeRoom } from '@/lib/room/urlCodec';

const PREPARE_MS = 300; // the room changes on every drag frame: make the link once it settles
const COPIED_MS = 3000;
const linkFor = (code: string) => `${window.location.origin}${window.location.pathname}#${code}`;

export function ShareButton() {
  const room = useRoomStore((s) => s.room);
  const valid = validateRoom(room).length === 0;
  // The link for `room`, made ahead of the click: Safari only lets a click copy when nothing is awaited first.
  const [prepared, setPrepared] = useState<{ room: RoomState; code: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null); // shown to copy by hand when the browser won't copy
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    const wait = setTimeout(() => {
      void encodeRoom(room).then((code) => {
        if (!cancelled) setPrepared({ room, code });
      });
    }, PREPARE_MS);
    return () => {
      cancelled = true;
      clearTimeout(wait);
    };
  }, [room, valid]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  function copy(code: string) {
    const link = linkFor(code);
    const showCopied = () => {
      setManualLink(null);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    };
    // navigator.clipboard is missing on plain-http pages, and the write is refused without permission.
    const written = navigator.clipboard?.writeText(link);
    if (written) written.then(showCopied, () => setManualLink(link));
    else setManualLink(link);
  }

  function share() {
    if (prepared?.room === room) copy(prepared.code);
    else void encodeRoom(room).then(copy); // clicked before the link was ready
  }

  return (
    <div className="relative">
      <button onClick={share} disabled={!valid} className="rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40">
        {copied ? 'Link copied' : 'Share link'}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Link copied' : ''}
      </span>
      {manualLink && (
        <div className="absolute right-0 top-full z-10 mt-2 flex w-72 flex-col gap-2 rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm">
          <label className="flex flex-col gap-1">
            <span>Copy this link:</span>
            <input
              readOnly
              value={manualLink}
              onFocus={(e) => e.target.select()}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5"
            />
          </label>
          <button onClick={() => setManualLink(null)} className="self-end rounded-md border border-neutral-700 px-3 py-1">
            Done
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Check, build and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. All must be clean. Serve `out/` (`npx --yes serve@latest out -l 4173`), confirm `/room` returns 200, then stop the server and confirm port 4173 is free.
```powershell
git add src/lib/room/store.ts src/lib/room/store.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/useRoomSession.ts src/components/ShareButton.tsx src/app/room/page.tsx
git commit -m "feat: rooms are saved as you edit and reopen after a reload; shared links open as their own room" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Each room keeps its own scan

**Files:**
- Modify: `src/lib/scene/scanStore.ts`, `src/lib/scene/scanStore.test.ts`, `src/lib/scene/ScanController.ts`, `src/lib/scene/ScanController.test.ts`, `src/lib/room/session.ts`, `src/lib/room/session.test.ts`, `src/components/useRoomSession.ts`, `src/components/RoomView.tsx`

**Interfaces:**
- Consumes: the store's `roomId` (Task 2); `RoomSession` and `SessionEnv` (Task 2).
- Produces:
  - `scanStore.ts`:
    - The `key` argument of `saveScan`, `loadScan`, `updateScanAlignment` and `deleteScan` is required. It is the room's id. `CURRENT_SCAN` is removed.
    - `pruneScans(keep: readonly string[], factory?): Promise<number>` deletes every stored scan whose key isn't in `keep`, and resolves how many it deleted.
  - `ScanController`:
    - `constructor(scene, report, key: string)`.
    - `get roomKey(): string`.
    - `switchRoom(key: string, room: RoomState): Promise<void>`: takes this room's scan off the screen (it stays stored), ends any alignment, and restores the other room's scan. Switching to the same key does nothing.
    - The restore marker (`hearify:restoring`) holds the room's key, so a crash while opening one room's scan only stops that room's scan from reopening.
  - `SessionEnv` gains `dropScan(roomId: string): void` and `pruneScans(roomIds: string[]): void`. The session calls `dropScan` when a room is deleted, and `pruneScans` after each start, with the ids of every saved room.

- [ ] **Step 1: Write the failing tests**

**`src/lib/scene/scanStore.test.ts`:**
- Add `pruneScans` to the import from `./scanStore`.
- Add `const KEY = 'room-a';` under the imports, and replace every `undefined` passed as a key with `KEY`.
- Add inside `describe('scanStore')`:
```ts
  it('prunes the scans of rooms that no longer exist', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), 'kept', factory);
    await saveScan(scan(), 'gone', factory);
    await saveScan(scan(), 'current', factory); // stored before scans were kept per room
    expect(await pruneScans(['kept', 'never-scanned'], factory)).toBe(2);
    expect(await loadScan('kept', factory)).not.toBeNull();
    expect(await loadScan('gone', factory)).toBeNull();
    expect(await loadScan('current', factory)).toBeNull();
  });

  it('prunes nothing from an empty store', async () => {
    expect(await pruneScans(['kept'], new IDBFactory())).toBe(0);
  });
```

**`src/lib/scene/ScanController.test.ts`:**
- Add `type StoredScan` to the import from `./scanStore`.
- Change the `setup` helper's signature to `function setup(onStatus?: (status: ScanStatus, scans: ScanController) => void, key = 'room-a')`, and pass `key` as the third argument of `new ScanController(...)`.
- The existing tests now see the key in storage calls. Update their expectations:
  - `saveScan` is called with `(scan, 'room-a')`.
  - `updateScanAlignment` is called with `(alignment, savedAt, 'room-a')`.
  - `deleteScan` and `loadScan` are called with `('room-a')`.
  - Where a test sets the restore marker, its value is now `'room-a'`, not `'1'`.
- Add at the end of the file, before `describe('scanStatusParts')`:
```ts
describe('ScanController rooms', () => {
  const saved = (fileName: string): StoredScan => ({ fileName, bytes: new ArrayBuffer(8), alignment: null, savedAt: 5 });

  it("keeps an opened scan under its room's key", async () => {
    const { scans } = setup();
    await scans.open(file('room.spz'), room);
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'room.spz' }), 'room-a');
  });

  it("restores its own room's scan", async () => {
    const { scans, statuses } = setup(undefined, 'room-b');
    vi.mocked(loadScan).mockImplementation(async (key) => (key === 'room-b' ? saved('b.spz') : null));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });

  it("takes the scan off the screen without deleting it when another room opens, and shows that room's scan", async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('a.spz'), room);
    vi.mocked(loadScan).mockImplementation(async (key) => (key === 'room-b' ? saved('b.spz') : null));
    await scans.switchRoom('room-b', room);
    expect(h.layers[0].disposed).toBe(true);
    expect(deleteScan).not.toHaveBeenCalled();
    expect(statuses).toContainEqual({ kind: 'none' });
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
    expect(scans.roomKey).toBe('room-b');
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
  });

  it('shows the plain box when the other room has no scan', async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('a.spz'), room);
    await scans.switchRoom('room-b', room);
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
  });

  it('does nothing when the same room is opened again', async () => {
    const { scans, statuses } = setup();
    await scans.open(file('a.spz'), room);
    const before = statuses.length;
    await scans.switchRoom('room-a', room);
    expect(statuses.length).toBe(before);
    expect(h.layers[0].disposed).toBe(false);
  });

  it('never shows a scan that was still loading for the room that was left', async () => {
    const { scans, statuses } = setup();
    const loading = deferred<Loaded>();
    h.load = () => loading.promise;
    const opening = scans.open(file('slow.spz'), room);
    await flush();
    await scans.switchRoom('room-b', room);
    loading.resolve(good);
    await opening;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(statuses.some((s) => s.kind === 'ready')).toBe(false);
    expect(saveScan).not.toHaveBeenCalled();
  });

  it('ends an alignment that was in progress', async () => {
    const { scans, scene, steps } = setup();
    await scans.open(file('a.spz'), room);
    scans.startAlignment();
    await scans.switchRoom('room-b', room);
    expect(last(steps)).toEqual([null, 0, null]);
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(true);
  });

  it("removes only the open room's scan", async () => {
    const { scans } = setup();
    await scans.switchRoom('room-b', room);
    await scans.open(file('b.spz'), room);
    await scans.remove();
    expect(deleteScan).toHaveBeenCalledTimes(1);
    expect(deleteScan).toHaveBeenCalledWith('room-b');
  });

  it("writes a finished alignment to its own room's record", async () => {
    const t = await alignedScan();
    await t.scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'room-a');
  });

  it("is not stopped by a crash that happened while opening another room's scan", async () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup(undefined, 'room-b');
    vi.mocked(loadScan).mockResolvedValue(saved('b.spz'));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });

  it("doesn't reopen a scan whose last open never finished", async () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup();
    vi.mocked(loadScan).mockResolvedValue(saved('a.spz'));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'error' });
    expect(loadScan).not.toHaveBeenCalled();
  });
});
```

**`src/lib/room/session.test.ts`:**
- In `setup`, record the two new calls. Add `const dropped: string[] = [];` and `const pruned: string[][] = [];` before `env`, add these two fields to `env`, and return `dropped` and `pruned`:
```ts
    dropScan: (roomId) => void dropped.push(roomId),
    pruneScans: (roomIds) => void pruned.push([...roomIds].sort()),
```
- Add a new block:
```ts
describe('RoomSession and scans', () => {
  it("drops a deleted room's scan", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    t.session.remove('b');
    t.session.remove('a');
    expect(t.dropped).toEqual(['b', 'a']);
  });

  it('prunes scans at the start, keeping those of every saved room', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    expect(t.pruned).toEqual([['a', 'b']]);
  });

  it("doesn't prune when the rooms couldn't be saved: the list may be incomplete", async () => {
    const t = setup({ storage: fakeStorage(true) });
    await t.session.start();
    expect(t.pruned).toEqual([]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/scene/scanStore.test.ts src/lib/scene/ScanController.test.ts src/lib/room/session.test.ts`
Expected: FAIL. `pruneScans`, `switchRoom` and `roomKey` don't exist; the constructor takes no key; `SessionEnv` has no `dropScan`.

- [ ] **Step 3: The scan store**

In `src/lib/scene/scanStore.ts`:
1. Change the comment on `StoredScan` to `/** A scan kept in this browser only, one per room, under the room's id. It is never uploaded. */`.
2. Delete `export const CURRENT_SCAN = 'current';`.
3. Make `key` required in all four functions. Change `key = CURRENT_SCAN` to `key: string` in `saveScan`, `loadScan`, `updateScanAlignment` and `deleteScan`.
4. Add at the end:
```ts
/** Delete every stored scan whose key isn't in `keep`: the scans of rooms that no longer exist. Resolves how many went. */
export function pruneScans(keep: readonly string[], factory: IDBFactory = browserIndexedDB()): Promise<number> {
  return withStore(factory, 'readwrite', async (store) => {
    const keys = await done(store.getAllKeys());
    const stale = keys.filter((key) => typeof key !== 'string' || !keep.includes(key));
    await Promise.all(stale.map((key) => done(store.delete(key))));
    return stale.length;
  });
}
```

- [ ] **Step 4: The scan controller**

In `src/lib/scene/ScanController.ts`:

1. **Restore marker.** Replace `setRestoreMarker` and `takeRestoreMarker` (keep `clearRestoreMarker`) with:
   ```ts
   function setRestoreMarker(key: string): void {
     try {
       localStorage.setItem(RESTORING_KEY, key);
     } catch {
       // no marker: a crash loop can't be detected here
     }
   }
   /**
    * Whether the last restore of this room's scan never finished. Clears the marker, so the start after this one tries
    * again. A marker left by another room stays for that room.
    */
   function takeRestoreMarker(key: string): boolean {
     try {
       if (localStorage.getItem(RESTORING_KEY) !== key) return false;
       localStorage.removeItem(RESTORING_KEY);
       return true;
     } catch {
       return false;
     }
   }
   ```
   Change the comment on `RESTORING_KEY` to: `/** Holds the key of the room whose stored scan is being opened. Still there at the next start means the tab died (or was closed) mid-open. */`.

2. **Constructor and key.** Replace the constructor with:
   ```ts
   constructor(
     private readonly scene: RoomScene,
     private readonly report: Report,
     private key: string, // the open room's id: its scan is stored under it
   ) {}

   /** The room whose scan this controller shows and stores. */
   get roomKey(): string {
     return this.key;
   }
   ```

3. **`restore`.** Read the key once and use it for the marker and the load:
   - Add `const key = this.key;` as the first line.
   - `takeRestoreMarker()` becomes `takeRestoreMarker(key)`.
   - `loadScan()` becomes `loadScan(key)`.
   - `setRestoreMarker()` becomes `setRestoreMarker(key)`.

4. **`open`.**
   - Add `const key = this.key;` right after the "One load at a time" guard.
   - `this.keep(keepGen, { … })` becomes `this.keep(keepGen, key, { … })`.
   - `this.writeAlignment(this.alignment, savedAt)` becomes `this.writeAlignment(this.alignment, savedAt, key)`.

5. **`finish`.**
   - `this.writeAlignment(alignment, this.storedAt)` becomes `this.writeAlignment(alignment, this.storedAt, this.key)`.
   - Change the comment above the `storedAt === null` check to `// Only the stored scan gets the alignment: while a scan that couldn't be saved is on screen, storage holds none for it.`

6. **`remove` and `switchRoom`.** Replace `remove` with these three methods:
   ```ts
   async remove(): Promise<void> {
     this.storeGen++; // a save still retrying stops, and a load still running is abandoned
     this.clearScreen();
     try {
       await deleteScan(this.key);
     } catch {
       // the scan stays in storage and comes back the next time the page loads
     }
   }

   /**
    * Another room was opened: take this room's scan off the screen (it stays stored) and show the other room's, if it has
    * one. An alignment in progress ends. A load or save still running for the room being left no longer touches the screen.
    */
   async switchRoom(key: string, room: RoomState): Promise<void> {
     if (key === this.key) return;
     this.key = key;
     this.storeGen++;
     this.latestDims = room.dims;
     this.clearScreen();
     await this.restore(room);
   }

   /** No scan on screen: the plain room, with nothing being aligned. Storage is not touched. */
   private clearScreen(): void {
     this.align = null;
     this.alignment = null;
     this.bounds = null;
     this.disposeLayer();
     this.scene.setTapMode('none');
     this.scene.setRoomItemsVisible(true);
     this.setStatus({ kind: 'none' });
     this.applyShell();
     this.reportStep(null);
   }
   ```

7. **`keep` and `writeAlignment`** take the key they were started with, so a save that began in one room never lands in another:
   - `private async keep(gen: number, key: string, scan: StoredScan)`: both `saveScan(scan)` calls become `saveScan(scan, key)`, and `deleteScan()` becomes `deleteScan(key)`.
   - `private async writeAlignment(alignment: Alignment, savedAt: number, key: string)`: `updateScanAlignment(alignment, savedAt)` becomes `updateScanAlignment(alignment, savedAt, key)`.

- [ ] **Step 5: The session drops and prunes scans**

In `src/lib/room/session.ts`:
1. Add to `SessionEnv`:
   ```ts
   /** Delete a room's stored scan. Fire and forget. */
   dropScan: (roomId: string) => void;
   /** Delete the stored scans of every room not listed. Fire and forget. */
   pruneScans: (roomIds: string[]) => void;
   ```
2. In `start()`, right after `this.write(file);`, add:
   ```ts
   // Scans whose room is gone (deleted in another tab, or stored before scans were kept per room) are dropped.
   // Not when the rooms couldn't be saved: then they may not have been read either, and the list would be incomplete.
   if (!this.unsaved) this.env.pruneScans(file.rooms.map((room) => room.id));
   ```
3. In `remove()`, add as the last line: `this.env.dropScan(id);`

In `src/components/useRoomSession.ts`:
1. Add the import `import { deleteScan, pruneScans } from '@/lib/scene/scanStore';`.
2. Add to the object passed to `new RoomSession({ … })`:
   ```ts
   dropScan: (roomId) => void deleteScan(roomId).catch(() => {}), // a scan that can't be dropped now is pruned at a later start
   pruneScans: (roomIds) => void pruneScans(roomIds).catch(() => {}),
   ```

- [ ] **Step 6: The view follows the open room**

In `src/components/RoomView.tsx`:

1. **Read the open room's id.** After `const update = useRoomStore((s) => s.update);` add:
   ```tsx
   const roomId = useRoomStore((s) => s.roomId);
   ```

2. **Start each room clean.** Right after the `alignStep` state declaration, add:
   ```tsx
   // Another room was opened: walk mode, panel placing and any message stay behind with the room they belonged to.
   const [shownRoomId, setShownRoomId] = useState(roomId);
   if (roomId !== shownRoomId) {
     setShownRoomId(roomId);
     setWalking(false);
     setPlacing(false);
     setMessage(null);
   }
   ```

3. **Give the controller its room.** In the first effect, replace the `new ScanController(scene, { … })` call with:
   ```tsx
   const scans = new ScanController(
     scene,
     {
       status: setScanStatus,
       step: (step, taps, hint) => setAlignStep({ step, taps, hint }),
     },
     useRoomStore.getState().roomId ?? 'unsaved', // the page shows this view only once a room is open
   );
   ```

4. **Switch scans with the room.** Add this effect right after the effect that calls `sceneRef.current?.setWalking(walking)`. Its position matters: walk mode must be off before the camera is framed.
   ```tsx
   useEffect(() => {
     const scans = scanRef.current;
     if (!roomId || !scans || scans.roomKey === roomId) return; // the first room's scan is restored where the controller is made
     const opened = useRoomStore.getState().room;
     sceneRef.current?.setCameraPreset(opened, 'corner'); // a different room: frame it afresh
     void scans.switchRoom(roomId, opened);
   }, [roomId, webgl]);
   ```

- [ ] **Step 7: Run tests, check and commit**

Run `npx vitest run src/lib/scene src/lib/room` (PASS), then `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. After the build, confirm Spark is still only in its own lazy chunk, as in Plan 4: search `out/_next/static/chunks` for `SparkRenderer` and check that `out/room.html` doesn't reference that chunk.
```powershell
git add src/lib/scene/scanStore.ts src/lib/scene/scanStore.test.ts src/lib/scene/ScanController.ts src/lib/scene/ScanController.test.ts src/lib/room/session.ts src/lib/room/session.test.ts src/components/useRoomSession.ts src/components/RoomView.tsx
git commit -m "feat: each room keeps its own scan; scans of deleted rooms are dropped" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: My rooms and the room's name

**Files:**
- Create: `src/components/RoomsMenu.tsx`
- Modify: `src/app/room/page.tsx`

**Interfaces:**
- Consumes: `roomSession()` (Task 2); the store's `rooms`, `roomId`, `room.name` and `update`; `SavedRoom` (Task 1).
- Produces: `RoomsMenu` (a **My rooms** button and its dialog). The page header shows the room's name as an editable field, then **My rooms**, then **Share link**.

There are no unit tests for this task: it is markup over the tested session. The controller checks it in the browser (Step 4).

- [ ] **Step 1: The dialog**

Create `src/components/RoomsMenu.tsx`:
```tsx
'use client';

import { useRef, useState } from 'react';
import { roomSession } from '@/components/useRoomSession';
import type { SavedRoom } from '@/lib/room/rooms';
import { useRoomStore } from '@/lib/room/store';

const buttonClass = 'rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40';
const smallButton = 'rounded-md border border-neutral-700 px-2 py-1 text-xs';

const nameOf = (room: SavedRoom) => room.state.name.trim() || 'Untitled room';
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

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={buttonClass}>
        My rooms
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="rooms-title"
        onClose={() => setConfirming(null)}
        className="m-auto max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="rooms-title" className="text-lg font-semibold">
              My rooms
            </h2>
            <button onClick={close} className={smallButton}>
              Close
            </button>
          </div>
          <p className="text-sm text-neutral-400">Your rooms are kept in this browser only. Nothing is uploaded.</p>
          <button
            onClick={() => {
              roomSession().create();
              close();
            }}
            className={`${buttonClass} self-start`}
          >
            New room
          </button>
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => {
              const open = room.id === roomId;
              return (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 p-3">
                  <button
                    onClick={() => {
                      roomSession().open(room.id);
                      close();
                    }}
                    aria-current={open ? 'true' : undefined}
                    className="min-w-0 flex-1 text-left"
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
                          onClick={() => {
                            roomSession().remove(room.id);
                            setConfirming(null);
                          }}
                          className={`${smallButton} border-red-700 text-red-200`}
                        >
                          Delete for good
                        </button>
                        <button onClick={() => setConfirming(null)} className={smallButton}>
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
                        <button onClick={() => setConfirming(room.id)} aria-label={`Delete ${nameOf(room)}`} className={smallButton}>
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

- [ ] **Step 2: The header**

In `src/app/room/page.tsx`:
1. Add the import `import { RoomsMenu } from '@/components/RoomsMenu';`.
2. In `RoomWorkspace`, add `const update = useRoomStore((s) => s.update);` after the `room` line.
3. Replace the `<header>…</header>` block with:
   ```tsx
   <header className="flex flex-wrap items-center justify-between gap-3">
     <h1 className="sr-only">Your room</h1>
     <input
       aria-label="Room name"
       value={room.name}
       maxLength={80}
       placeholder="Untitled room"
       onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
       className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-2xl font-bold hover:border-neutral-700 focus:border-neutral-500"
     />
     <div className="flex gap-2">
       <RoomsMenu />
       <ShareButton />
     </div>
   </header>
   ```

- [ ] **Step 3: Check, build and commit**

Run `npm test`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. Serve `out/`, confirm `/room` returns 200, then stop the server.
```powershell
git add src/components/RoomsMenu.tsx src/app/room/page.tsx
git commit -m "feat: My rooms dialog and an editable room name" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Browser walk-through (controller)**

Serve `out/` on port 4173 and open `/room` in Chrome with a fresh profile. Check:
- **First visit:** "My room" opens. Reload: the same room opens.
- **Autosave:**
  - Set the length to 5 and drag the speaker. Reload: both persist.
  - Clear the Length field and reload: 5 comes back.
- **Name:** rename the room to "Studio". Reload: the name persists, and **My rooms** lists it.
- **My rooms:**
  - **New room** opens "My room".
  - Opening "Studio" brings its size back.
  - **Duplicate** opens "Studio copy".
  - **Delete** asks a second time.
  - Deleting the open room opens another.
  - Deleting the last room opens a fresh one.
  - Escape closes the dialog.
- **Share:** **Share link** copies the link (or shows it to copy by hand), and the address bar shows no `#…`.
- **Shared links:**
  - Opening a copied link in the same browser opens it as a room; the address bar is cleared, and opening it again adds no copy.
  - `/room#v1.garbage` shows the notice, and **Dismiss** hides it.
- **Scans:**
  - Load a sample `.spz` in one room and align it.
  - Switch to another room: there is no scan there, and the box is tinted.
  - Switch back: the scan and its alignment return.
  - Delete the room: IndexedDB no longer holds its scan.
- **Switching while busy:** with walk mode on, open another room. Walk mode ends and the view is on Corner.
- **Two tabs:** add a room in a second tab. The first tab's **My rooms** shows it.
- No console errors.
