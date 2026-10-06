import type { RoomsStorage } from '@/lib/room/rooms';

/** This browser's localStorage, or null where it is blocked (reading the property itself throws there). Browser only. */
export function browserStorage(): RoomsStorage {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
