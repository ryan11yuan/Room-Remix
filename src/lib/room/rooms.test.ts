import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRoom } from './roomState';
import {
  addRoom,
  currentRoom,
  EMPTY_ROOMS,
  findRoom,
  importRoom,
  isSavable,
  loadRooms,
  MAX_ROOMS,
  newRoomId,
  parseRooms,
  removeRoom,
  roomsReadable,
  roomIds,
  ROOMS_BACKUP_KEY,
  ROOMS_KEY,
  saveRooms,
  selectRoom,
  serializeRooms,
  sortedRooms,
  startRooms,
  stateKey,
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("keeps the rooms it can read when other entries are broken", () => {
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
    expect(parsed.unreadable).toHaveLength(1); // the room with a broken size is set aside, not thrown away
  });

  it("forgets an open room that isn't in the list", () => {
    const json = JSON.stringify({ v: 1, currentId: 'gone', rooms: [{ id: 'a', updatedAt: 1, state: named('A') }] });
    expect(parseRooms(json).currentId).toBeNull();
  });

  it('treats a missing save time as the oldest', () => {
    const json = JSON.stringify({ v: 1, currentId: null, rooms: [{ id: 'a', updatedAt: 'yesterday', state: named('A') }] });
    expect(parseRooms(json).rooms[0].updatedAt).toBe(0);
    const missing = JSON.stringify({ v: 1, currentId: null, rooms: [{ id: 'a', state: named('A') }] });
    expect(parseRooms(missing).rooms[0].updatedAt).toBe(0);
  });

  it("sets aside a room it can't read and writes it back untouched", () => {
    const fromNewerBuild = { id: 'n', updatedAt: 300, state: { ...named('Newer'), v: 2 } };
    const json = JSON.stringify({ v: 1, currentId: 'a', rooms: [{ id: 'a', updatedAt: 100, state: named('Good') }, fromNewerBuild] });
    const parsed = parseRooms(json);
    expect(parsed.rooms.map((r) => r.id)).toEqual(['a']);
    expect(parsed.unreadable).toEqual([fromNewerBuild]);
    const changed = addRoom(removeRoom(upsertRoom(selectRoom(parsed, 'a'), 'a', named('Renamed'), 500), 'nope'), 'b', named('B'), 600)!;
    expect(JSON.parse(serializeRooms(changed)).rooms).toContainEqual(fromNewerBuild);
    expect(parseRooms(serializeRooms(changed)).unreadable).toEqual([fromNewerBuild]);
    expect(parseRooms(serializeRooms(changed)).rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it("keeps every room it can't read, however many there are", () => {
    const entries = Array.from({ length: 60 }, (_, i) => ({ id: `n${i}`, updatedAt: i, state: { ...named(`Newer ${i}`), v: 2 } }));
    const parsed = parseRooms(JSON.stringify({ v: 1, currentId: null, rooms: entries }));
    expect(parsed.unreadable).toHaveLength(60);
    expect(parseRooms(serializeRooms(parsed)).unreadable).toHaveLength(60);
  });

  it('gives a fresh empty file each time', () => {
    expect(parseRooms(null)).not.toBe(parseRooms(null));
    expect(parseRooms(null)).not.toBe(EMPTY_ROOMS);
  });
});

describe('roomIds', () => {
  it('lists the readable rooms, then the unreadable ones that have an id', () => {
    const f: RoomsFile = { ...file(['a', 100, 'Studio']), unreadable: [{ id: 'n', state: 'new format' }, { id: 7 }, 'junk', null] };
    expect(roomIds(f)).toEqual(['a', 'n']);
    expect(roomIds(file(['a', 100, 'Studio'], ['b', 200, 'Den']))).toEqual(['a', 'b']);
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

  it('puts the room added later first when two were saved at the same moment', () => {
    expect(sortedRooms(file(['first', 5, 'A'], ['second', 5, 'B'], ['third', 5, 'C'])).map((r) => r.id)).toEqual(['third', 'second', 'first']);
    expect(currentRoom(file(['first', 5, 'A'], ['second', 5, 'B']))?.id).toBe('second');
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
    expect(uniqueName(file(['a', 1, 'Den']), `${long} copy`)).toBe(long); // a free name is cut to the 80 a room name holds
    expect(uniqueName(file(['a', 1, long]), `${long} copy`).length).toBeLessThanOrEqual(80);
    expect(uniqueName(file(['a', 1, long]), `${long} copy`)).not.toBe(long);
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

  it("keeps rooms it can't read when it makes the first room", () => {
    const stored: RoomsFile = { rooms: [], currentId: null, unreadable: [{ id: 'n', state: 'from a newer build' }] };
    const next = startRooms(stored, 'new', named('Fresh'), 500);
    expect(next.rooms).toHaveLength(1);
    expect(next.unreadable).toEqual(stored.unreadable);
  });
});

describe('newRoomId', () => {
  it('gives a different, non-empty id each time', () => {
    const a = newRoomId();
    const b = newRoomId();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });

  it('still gives different ids where the browser has no randomUUID', () => {
    vi.stubGlobal('crypto', undefined);
    const a = newRoomId();
    const b = newRoomId();
    expect(a).not.toBe('');
    expect(a).not.toBe(b);
  });
});

describe('isSavable', () => {
  it('accepts a normal room', () => {
    expect(isSavable(named('A'))).toBe(true);
  });

  it('refuses a room that would not come back from storage', () => {
    const room = named('A');
    expect(isSavable({ ...room, dims: { ...room.dims, length: Number.NaN } })).toBe(false);
    expect(isSavable({ ...room, listener: { ...room.listener, yaw: Number.NaN } })).toBe(false);
    expect(isSavable({ ...room, calibration: { factor: 0 } })).toBe(false);
    expect(isSavable({ ...room, calibration: { factor: 1, measuredRt60: Number.POSITIVE_INFINITY } })).toBe(false);
  });
});

describe('stateKey', () => {
  it('is the same for the same room whatever order its keys were written in', () => {
    const room = named('A');
    const reordered = { calibration: room.calibration, fixes: room.fixes, listener: room.listener, speaker: room.speaker } as RoomState;
    Object.assign(reordered, { furnishing: room.furnishing, surfaces: room.surfaces, dims: room.dims, name: room.name, v: room.v });
    expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(room));
    expect(stateKey(reordered)).toBe(stateKey(room));
  });

  it('differs when the room differs, and still works for a room that is mid-edit', () => {
    const room = named('A');
    expect(stateKey({ ...room, furnishing: 'bare' })).not.toBe(stateKey(room));
    const midEdit = { ...room, dims: { ...room.dims, length: Number.NaN } };
    expect(stateKey(midEdit)).not.toBe(stateKey(room));
  });
});

describe('roomsReadable', () => {
  it('is true when nothing is stored, or a readable file', () => {
    const storage = fakeStorage();
    expect(roomsReadable(storage)).toBe(true);
    expect(roomsReadable(null)).toBe(true);
    saveRooms({ rooms: [{ id: 'a', updatedAt: 1, state: named('A') }], currentId: 'a' }, storage);
    expect(roomsReadable(storage)).toBe(true);
  });

  it('is false for a value it cannot read, or when reading throws', () => {
    const newer = fakeStorage();
    newer.setItem(ROOMS_KEY, JSON.stringify({ v: 2, rooms: [], currentId: null }));
    expect(roomsReadable(newer)).toBe(false);
    const broken = fakeStorage();
    broken.setItem(ROOMS_KEY, '{broken');
    expect(roomsReadable(broken)).toBe(false);
    expect(roomsReadable(fakeStorage(true))).toBe(false);
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

  it("keeps a copy of stored data it can't read before writing over it", () => {
    for (const unreadable of ['{"v":2,"rooms":[{"id":"future"}]}', '{broken']) {
      const storage = fakeStorage();
      storage.items.set(ROOMS_KEY, unreadable);
      expect(loadRooms(storage)).toEqual(EMPTY_ROOMS);
      expect(saveRooms(file(['a', 100, 'A']), storage)).toBe(true);
      expect(storage.items.get(ROOMS_BACKUP_KEY)).toBe(unreadable);
      expect(loadRooms(storage).rooms).toHaveLength(1);
    }
  });

  it('makes no backup of a file it can read', () => {
    const storage = fakeStorage();
    saveRooms(file(['a', 100, 'A']), storage);
    saveRooms(file(['a', 100, 'A'], ['b', 200, 'B']), storage);
    expect(storage.items.has(ROOMS_BACKUP_KEY)).toBe(false);
  });

  it('reports a write that storage refused, and leaves what was stored', () => {
    const storage = fakeStorage();
    saveRooms(file(['a', 100, 'A']), storage);
    const full = {
      getItem: storage.getItem,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(saveRooms(file(['a', 100, 'A'], ['b', 200, 'B']), full)).toBe(false);
    expect(loadRooms(full).rooms).toHaveLength(1);
  });
});
