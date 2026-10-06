import { describe, expect, it } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import { loadRooms, MAX_ROOMS, saveRooms } from '@/lib/room/rooms';
import type { RoomState } from '@/lib/room/types';
import { openRoomDirectlyWith } from './openRoomDirectly';
import { readTabRoom, TAB_ROOM_KEY } from './tabRoom';

const named = (name: string): RoomState => ({ ...defaultRoom(), name });

/** An in-memory stand-in for localStorage or sessionStorage. */
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

describe('openRoomDirectlyWith', () => {
  it('adds the room to My rooms, makes it the open one, and points this tab at it', () => {
    const storage = fakeStorage();
    saveRooms({ rooms: [{ id: 'a', updatedAt: 1, state: named('Den') }], currentId: 'a' }, storage);
    const tab = fakeStorage();
    const id = openRoomDirectlyWith(storage, tab, named('Studio'));
    expect(id).not.toBeNull();
    const saved = loadRooms(storage);
    expect(saved.rooms.map((r) => r.state.name)).toEqual(['Den', 'Studio']);
    expect(saved.currentId).toBe(id);
    expect(saved.rooms.find((r) => r.id === id)?.state.name).toBe('Studio');
    expect(tab.items.get(TAB_ROOM_KEY)).toBe(id);
    expect(readTabRoom(tab)).toBe(id);
  });

  it('reuses a saved room with the same contents, as opening the same link again would', () => {
    const storage = fakeStorage();
    const tab = fakeStorage();
    const first = openRoomDirectlyWith(storage, tab, named('Demo bedroom'));
    const second = openRoomDirectlyWith(storage, tab, named('Demo bedroom'));
    expect(second).toBe(first);
    expect(loadRooms(storage).rooms).toHaveLength(1);
  });

  it('gives null, and changes nothing, when My rooms is full', () => {
    const storage = fakeStorage();
    const rooms = Array.from({ length: MAX_ROOMS }, (_, i) => ({ id: `r${i}`, updatedAt: i, state: named(`Room ${i}`) }));
    saveRooms({ rooms, currentId: 'r3' }, storage);
    const tab = fakeStorage();
    expect(openRoomDirectlyWith(storage, tab, named('One more'))).toBeNull();
    expect(loadRooms(storage).rooms).toHaveLength(MAX_ROOMS);
    expect(loadRooms(storage).currentId).toBe('r3');
    expect(tab.items.size).toBe(0);
  });

  it('gives null when there is no storage, or it refuses the write', () => {
    expect(openRoomDirectlyWith(null, fakeStorage(), named('Studio'))).toBeNull();
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const tab = fakeStorage();
    expect(openRoomDirectlyWith(refusing, tab, named('Studio'))).toBeNull();
    expect(tab.items.size).toBe(0);
  });

  it('still opens the room when this tab cannot remember it', () => {
    const storage = fakeStorage();
    const id = openRoomDirectlyWith(storage, null, named('Studio'));
    expect(id).not.toBeNull();
    expect(loadRooms(storage).currentId).toBe(id); // the room page opens the room open last
  });
});
