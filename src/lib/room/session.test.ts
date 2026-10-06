import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { addRoom, loadRooms, MAX_ROOMS, removeRoom, ROOMS_KEY, saveRooms, selectRoom, upsertRoom, type RoomsFile } from './rooms';
import { CONFLICT_NOTICE, FULL_NOTICE, LINK_NOTICE, RoomSession, UNSAVED_NOTICE, type SessionEnv } from './session';
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

/**
 * A session over fakes. `links` maps share codes to the rooms they decode to (any other code is unreadable), or `decode`
 * replaces decoding altogether. `tabRoom` is the room this tab had open before; `stuckLink` makes clearing the address bar throw.
 */
function setup(
  options: {
    storage?: ReturnType<typeof fakeStorage> | null;
    links?: Record<string, RoomState>;
    decode?: SessionEnv['decode'];
    tabRoom?: string;
    stuckLink?: boolean;
    pruneScans?: SessionEnv['pruneScans'];
  } = {},
) {
  const storage = options.storage === undefined ? fakeStorage() : options.storage;
  let link = '';
  let tab: string | null = options.tabRoom ?? null;
  let clock = 1000;
  let ids = 0;
  const dropped: string[] = [];
  const pruned: string[][] = [];
  const env: SessionEnv = {
    storage,
    readLink: () => link,
    clearLink: () => {
      if (options.stuckLink) throw new Error('SecurityError');
      link = '';
    },
    decode: options.decode ?? (async (code) => options.links?.[code] ?? null),
    now: () => ++clock,
    newId: () => `id-${++ids}`,
    tabRoom: () => tab,
    setTabRoom: (id) => {
      tab = id;
    },
    dropScan: (roomId) => void dropped.push(roomId),
    pruneScans: options.pruneScans ?? ((roomIds) => void pruned.push([...roomIds].sort())),
  };
  return {
    session: new RoomSession(env),
    storage,
    saved: () => loadRooms(storage),
    link: () => link,
    setLink: (code: string) => {
      link = code;
    },
    tab: () => tab,
    setTab: (id: string) => {
      tab = id;
    },
    dropped,
    pruned,
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

  it('reopens the room this tab had open before a reload, not the one another tab opened last', async () => {
    const t = setup({ storage: storageWith('b', ['a', 100, 'Studio'], ['b', 200, 'Den']), tabRoom: 'a' });
    await t.session.start();
    expect(store().roomId).toBe('a');
  });

  it("opens the usual room when this tab's old room is gone", async () => {
    const t = setup({ storage: storageWith('b', ['a', 100, 'Studio'], ['b', 200, 'Den']), tabRoom: 'deleted' });
    await t.session.start();
    expect(store().roomId).toBe('b');
  });

  it('stays in its room when started again after another tab opened a different one', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    saveRooms(selectRoom(t.saved(), 'b'), t.storage); // another tab opens b
    await t.session.start(); // this page's view mounts again
    expect(store().roomId).toBe('a');
  });

  it('opens the room this tab was pointed at since, where no link could be made (setup in a browser without one)', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    store().update((r) => ({ ...r, furnishing: 'full' })); // an edit not saved yet
    saveRooms(addRoom(t.saved(), 'new', named('From setup'), 300)!, t.storage); // what setup saves
    t.setTab('new'); // and where it points this tab
    expect(await t.session.start()).toBeNull(); // no link opened it
    expect(store().roomId).toBe('new');
    expect(store().room.name).toBe('From setup');
    expect(t.saved().rooms.find((r) => r.id === 'a')?.state.furnishing).toBe('full'); // the room left behind was saved
  });

  it('stays in its room when this tab was pointed at a room that is gone', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    saveRooms(selectRoom(t.saved(), 'b'), t.storage); // another tab opens b
    t.setTab('deleted');
    await t.session.start();
    expect(store().roomId).toBe('a');
  });

  it('treats a link that fails to decode as one it cannot read', async () => {
    const t = setup({
      storage: storageWith('a', ['a', 100, 'Mine']),
      decode: async () => {
        throw new Error('corrupt');
      },
    });
    t.setLink('code');
    await t.session.start();
    expect(store().notice).toBe(LINK_NOTICE);
    expect(store().roomId).toBe('a');
    expect(t.link()).toBe('');
  });

  it("still opens the linked room when the address bar can't be changed", async () => {
    const t = setup({ links: { code: named('Shared') }, stuckLink: true });
    t.setLink('code');
    await t.session.start();
    expect(store().room.name).toBe('Shared');
  });

  it('lets the newest of two overlapping starts win', async () => {
    const waiting: Record<string, (room: RoomState | null) => void> = {};
    const t = setup({
      decode: (code) =>
        new Promise((resolve) => {
          waiting[code] = resolve;
        }),
    });
    t.setLink('one');
    const first = t.session.start();
    t.setLink('two');
    const second = t.session.start();
    waiting.two(named('Two'));
    waiting.one(named('One'));
    await Promise.all([first, second]);
    expect(store().room.name).toBe('Two');
    expect(t.saved().rooms.map((r) => r.state.name)).toEqual(['Two']);
  });

  it('opens only the linked room on a first visit with a link, with no extra My room', async () => {
    const t = setup({ links: { code: named('From setup') } });
    t.setLink('code');
    await t.session.start();
    expect(t.saved().rooms.map((r) => r.state.name)).toEqual(['From setup']);
    expect(store().room.name).toBe('From setup');
    expect(store().notice).toBeNull();
  });

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

  it('drops the link notice once a link loads', async () => {
    const t = setup({ links: { code: named('Shared') } });
    t.setLink('garbage');
    await t.session.start();
    expect(store().notice).toBe(LINK_NOTICE);
    t.setLink('code');
    await t.session.start();
    expect(store().notice).toBeNull();
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

  it('keeps both versions when another tab changed the room too', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    saveRooms(upsertRoom(t.saved(), 'a', named('Renamed elsewhere'), 500), t.storage); // another tab renames it
    store().update((r) => ({ ...r, furnishing: 'bare' }));
    t.session.save();
    expect(store().roomId).not.toBe('a');
    expect(store().room.name).toBe('Studio copy');
    expect(store().room.furnishing).toBe('bare');
    expect(store().notice).toBe(CONFLICT_NOTICE);
    expect(t.saved().rooms.map((r) => r.state.name).sort()).toEqual(['Renamed elsewhere', 'Studio copy']);
  });

  it('names a conflict copy of a room with no name "Untitled room copy"', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, '']) });
    await t.session.start();
    saveRooms(upsertRoom(t.saved(), 'a', named('Renamed elsewhere'), 500), t.storage);
    store().update((r) => ({ ...r, furnishing: 'bare' }));
    t.session.save();
    expect(store().room.name).toBe('Untitled room copy');
  });

  it("doesn't save its stale copy over another tab's newer one", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    saveRooms(upsertRoom(t.saved(), 'a', named('Renamed elsewhere'), 500), t.storage);
    t.session.save(); // the page is closing, say: nothing was changed here
    expect(t.saved().rooms[0].state.name).toBe('Renamed elsewhere');
    expect(store().room.name).toBe('Renamed elsewhere');
    expect(store().roomId).toBe('a');
    expect(store().notice).toBeNull();
  });

  it("doesn't bring back a room another tab deleted when nothing was changed here", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    saveRooms(removeRoom(t.saved(), 'a'), t.storage); // another tab deletes the room that is open here
    t.session.save(); // this tab closes without having changed anything
    expect(t.saved().rooms.map((r) => r.id)).toEqual(['b']);
  });

  it('saves the room again when it was edited here after another tab deleted it', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    saveRooms(removeRoom(t.saved(), 'a'), t.storage);
    store().update((r) => ({ ...r, name: 'Still wanted' }));
    t.session.save();
    expect(t.saved().rooms.map((r) => r.state.name).sort()).toEqual(['Den', 'Still wanted']);
  });

  it('says so when both tabs changed the room and no copy can be made', async () => {
    const storage = fakeStorage();
    const rooms = Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) }));
    saveRooms({ rooms, currentId: 'r3' }, storage);
    const t = setup({ storage });
    await t.session.start();
    saveRooms(upsertRoom(t.saved(), 'r3', named('Renamed elsewhere'), 500), t.storage);
    store().update((r) => ({ ...r, furnishing: 'bare' }));
    t.session.save();
    expect(store().notice).toBe(FULL_NOTICE);
    expect(store().roomId).toBe('r3');
    expect(t.saved().rooms).toHaveLength(MAX_ROOMS);
    expect(t.saved().rooms.find((r) => r.id === 'r3')?.state.furnishing).toBe('bare');
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

  it('names the copy of a room with no name "Untitled room copy"', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, '  ']) });
    await t.session.start();
    t.session.duplicate('a');
    expect(store().room.name).toBe('Untitled room copy');
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

  it('remembers the open room for this tab', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den']) });
    await t.session.start();
    expect(t.tab()).toBe('a');
    t.session.open('b');
    expect(t.tab()).toBe('b');
  });

  it('stays in its room when a third room is deleted while another tab has a different one open', async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio'], ['b', 200, 'Den'], ['c', 300, 'Loft']) });
    await t.session.start();
    saveRooms(selectRoom(t.saved(), 'b'), t.storage); // another tab opens b
    t.session.remove('c');
    expect(store().roomId).toBe('a');
    expect(t.saved().rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it("follows another tab's edit to the open room when nothing was changed here", async () => {
    const t = setup({ storage: storageWith('a', ['a', 100, 'Studio']) });
    await t.session.start();
    saveRooms(upsertRoom(t.saved(), 'a', named('Renamed elsewhere'), 500), t.storage);
    t.session.refresh();
    expect(store().room.name).toBe('Renamed elsewhere');
    expect(store().roomId).toBe('a');
  });
});

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

  it("doesn't prune when the stored rooms couldn't be read", async () => {
    for (const stored of [JSON.stringify({ v: 2, rooms: [{ id: 'x', updatedAt: 1, state: {} }], currentId: 'x' }), '{broken']) {
      const storage = fakeStorage();
      storage.items.set(ROOMS_KEY, stored);
      const t = setup({ storage });
      await t.session.start();
      expect(store().roomId).not.toBeNull(); // a fresh room is made, the old file is backed up
      expect(t.pruned).toEqual([]);
    }
  });

  it("doesn't prune on a later start either, once the unreadable rooms are only in the backup", async () => {
    const storage = fakeStorage();
    storage.items.set(ROOMS_KEY, JSON.stringify({ v: 2, rooms: [{ id: 'x', updatedAt: 1, state: {} }], currentId: 'x' }));
    const first = setup({ storage });
    await first.session.start();
    useRoomStore.setState({ roomId: null, room: defaultRoom(), rooms: [], notice: null }); // a new page
    const second = setup({ storage });
    await second.session.start();
    expect(first.pruned).toEqual([]);
    expect(second.pruned).toEqual([]);
  });

  it('still prunes when nothing is stored yet', async () => {
    const t = setup();
    await t.session.start();
    expect(t.pruned).toHaveLength(1);
  });

  it('opens a room even when scan cleanup throws', async () => {
    const t = setup({
      storage: storageWith('a', ['a', 100, 'Studio']),
      pruneScans: () => {
        throw new Error('idb');
      },
    });
    await t.session.start();
    expect(store().roomId).toBe('a');
  });
});

describe('RoomSession and unreadable rooms', () => {
  it("keeps the scan of a room this build can't read when pruning", async () => {
    const storage = fakeStorage();
    storage.items.set(
      ROOMS_KEY,
      JSON.stringify({ v: 1, currentId: 'a', rooms: [{ id: 'a', updatedAt: 1, state: named('Studio') }, { id: 'n', updatedAt: 2, state: { v: 99 } }] }),
    );
    const t = setup({ storage });
    await t.session.start();
    expect(t.pruned).toEqual([['a', 'n']]);
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

  it('shows the storage warning together with a link problem', async () => {
    const t = setup({ storage: fakeStorage(true) });
    t.setLink('garbage');
    await t.session.start();
    expect(store().notice).toContain(UNSAVED_NOTICE);
    expect(store().notice).toContain(LINK_NOTICE);
  });
});
