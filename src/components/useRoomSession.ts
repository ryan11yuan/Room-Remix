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
