/** The sessionStorage key for this tab's own room: kept across a reload of the tab; another tab has its own. */
export const TAB_ROOM_KEY = 'room-remix:tab-room';

/** The part of `sessionStorage` the tab room needs. Null where the browser blocks it. */
export type TabStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

/** This tab's sessionStorage, or null where it is blocked (reading the property itself throws there). Browser only. */
export function browserTabStorage(): TabStorage {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The room this tab had open last, or null. */
export function readTabRoom(storage: TabStorage): string | null {
  try {
    return storage?.getItem(TAB_ROOM_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Remember `id` as this tab's room. */
export function writeTabRoom(storage: TabStorage, id: string): void {
  try {
    storage?.setItem(TAB_ROOM_KEY, id);
  } catch {
    // this tab just won't remember its room across a reload
  }
}
