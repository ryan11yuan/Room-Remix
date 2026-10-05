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

  it("doesn't save a room that wouldn't come back from storage", async () => {
    const t = setup();
    await t.session.start();
    store().update((r) => ({ ...r, name: 'Bad', calibration: { factor: 0 } })); // passes validateRoom, fails the stored-room check
    t.session.save();
    expect(t.saved().rooms[0].state.name).toBe('My room');
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
