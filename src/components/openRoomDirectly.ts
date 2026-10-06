import { importRoom, loadRooms, newRoomId, saveRooms, type RoomsStorage } from '@/lib/room/rooms';
import type { RoomState } from '@/lib/room/types';
import { browserStorage } from './browserStorage';
import { browserTabStorage, writeTabRoom, type TabStorage } from './tabRoom';

/**
 * Save `state` in My rooms and point this tab at it, so the room page opens it with no link. The way in for a browser
 * that can't make a share link (no CompressionStream('deflate-raw')). A saved room with the same contents is reused, as
 * opening the same link again would. The room's id, or null when it can't be saved: no storage, My rooms full, or a
 * failed write.
 */
export function openRoomDirectlyWith(storage: RoomsStorage, tabStorage: TabStorage, state: RoomState): string | null {
  if (!storage) return null;
  try {
    const opened = importRoom(loadRooms(storage), state, newRoomId(), Date.now()); // null when My rooms is full
    const id = opened?.currentId;
    if (!opened || !id || !saveRooms(opened, storage)) return null;
    // A known gap: with sessionStorage blocked but localStorage working, this write is lost. A fresh room page still
    // opens the new room (it is My rooms' open one), but if a room is already open from earlier in this visit, the
    // page stays in that one: the new room is saved, not opened. The two stores are almost always blocked together.
    writeTabRoom(tabStorage, id);
    return id;
  } catch {
    return null;
  }
}

/** `openRoomDirectlyWith` on this browser's storage. Browser only: call it from event handlers. */
export function openRoomDirectly(state: RoomState): string | null {
  return openRoomDirectlyWith(browserStorage(), browserTabStorage(), state);
}
