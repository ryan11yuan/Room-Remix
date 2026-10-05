'use client';

import { useEffect } from 'react';
import { watchEdits } from '@/lib/room/autosave';
import { newRoomId, ROOMS_KEY, type RoomsStorage } from '@/lib/room/rooms';
import { RoomSession } from '@/lib/room/session';
import { decodeRoom } from '@/lib/room/urlCodec';

const AUTOSAVE_MS = 400;
const TAB_ROOM_KEY = 'room-remix:tab-room'; // sessionStorage: this tab's own room, kept across a reload

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
    tabRoom: () => {
      try {
        return window.sessionStorage.getItem(TAB_ROOM_KEY);
      } catch {
        return null;
      }
    },
    setTabRoom: (id) => {
      try {
        window.sessionStorage.setItem(TAB_ROOM_KEY, id);
      } catch {
        // this tab just won't remember its room across a reload
      }
    },
  });
  return session;
}

/** Start the room session for this page: open the right room, follow pasted links, and save edits once they settle. */
export function useRoomSession(): void {
  useEffect(() => {
    const rooms = roomSession();
    void rooms.start();
    const edits = watchEdits(() => rooms.save(), AUTOSAVE_MS);
    const onLink = () => {
      if (window.location.hash.length > 1) void rooms.start(); // a link pasted into the address bar while the page is open
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') edits.flush(); // the last chance on phones, where pagehide may not fire
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === ROOMS_KEY) rooms.refresh(); // another tab changed (or cleared) the rooms
    };
    window.addEventListener('hashchange', onLink);
    window.addEventListener('pagehide', edits.flush);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('storage', onStorage);
    return () => {
      edits.flush();
      edits.stop();
      window.removeEventListener('hashchange', onLink);
      window.removeEventListener('pagehide', edits.flush);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
