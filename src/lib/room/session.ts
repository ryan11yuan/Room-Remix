import { defaultRoom } from './roomState';
import {
  addRoom,
  findRoom,
  importRoom,
  isSavable,
  loadRooms,
  MAX_ROOMS,
  removeRoom,
  roomIds,
  saveRooms,
  selectRoom,
  sortedRooms,
  startRooms,
  stateKey,
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
export const CONFLICT_NOTICE = 'This room was also changed in another tab. Your version was saved as a copy in My rooms.';

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
  /** The room this tab had open last. It survives a reload of the tab; another tab has its own. */
  tabRoom: () => string | null;
  setTabRoom: (id: string) => void;
  /** Delete a room's stored scan. Fire and forget. */
  dropScan: (roomId: string) => void;
  /** Delete the stored scans of every room not listed. Fire and forget. */
  pruneScans: (roomIds: string[]) => void;
};

/**
 * "My rooms" for one page: which saved room is open, and keeping it saved. It reads and writes the saved-rooms file and
 * puts the open room into the store. Every change re-reads the file first, so another tab's rooms aren't overwritten.
 */
export class RoomSession {
  private unsaved: RoomsFile | null = null; // the rooms while storage can't be written: they last until the page closes
  private warned = false; // UNSAVED_NOTICE has been shown
  private seen: string | null = null; // the open room as this tab last read it from, or wrote it to, the saved rooms
  private starts = 0; // start() calls so far: of two that overlap, the newer one wins

  constructor(private readonly env: SessionEnv) {}

  /**
   * Open a room: the shared link's if the address bar has one, else the one this tab had open, else the one open last,
   * else a first room. Safe to call again: with a room already open, only a link changes which room that is.
   */
  async start(): Promise<void> {
    const run = ++this.starts;
    const code = this.env.readLink();
    let linked: RoomState | null = null;
    if (code) {
      try {
        linked = await this.env.decode(code);
      } catch {
        linked = null; // a link that can't be decoded is a link that can't be read
      }
      if (run !== this.starts) return; // a newer start (another link) took over while this one was decoding
      try {
        this.env.clearLink(); // read once: later edits mustn't leave a stale link in the address bar
      } catch {
        // the address bar can't be changed here (a sandboxed frame): the link stays, and opens the same room again
      }
    }
    this.save();
    let file = this.read();
    let target: string | null = null;
    if (linked) {
      const imported = importRoom(file, linked, this.env.newId(), this.env.now());
      if (imported) {
        file = imported;
        target = imported.currentId;
        this.clearNotice(LINK_NOTICE); // an earlier link's failure no longer applies
      } else {
        this.notify(FULL_NOTICE);
      }
    } else if (code) {
      this.notify(LINK_NOTICE);
    }
    if (!target && useRoomStore.getState().roomId) return this.refresh(); // a room is open here already: stay in it
    if (!target) {
      // This tab's own room first (it was reloaded), then the room open last in any tab, then a first room.
      const mine = findRoom(file, this.env.tabRoom());
      file = mine ? selectRoom(file, mine.id) : startRooms(file, this.env.newId(), defaultRoom(), this.env.now());
      target = file.currentId;
    }
    this.write(file);
    // Scans whose room is gone (deleted in another tab, or stored before scans were kept per room) are dropped.
    // Not when the rooms couldn't be saved: then they may not have been read either, and the list would be incomplete.
    if (!this.unsaved) this.env.pruneScans(roomIds(file)); // rooms this build can't read keep their scans too
    this.show(file, target);
  }

  /**
   * Save the open room now, if it can be stored. A room that is mid-edit isn't saved: its last good version stays.
   * If another tab saved this room in the meantime, nothing of theirs is overwritten: with no edits here this tab takes
   * their version; with edits here, this tab's version is saved as a copy and the tab carries on in the copy.
   */
  save(): void {
    const { roomId, room } = useRoomStore.getState();
    if (!roomId || !isSavable(room)) return;
    const file = this.read();
    const local = stateKey(room);
    const stored = findRoom(file, roomId);
    const theirs = stored ? stateKey(stored.state) : null;
    if (!stored && local === this.seen) return; // deleted in another tab and not changed here since: it stays deleted
    if (stored && theirs !== null && this.seen !== null && theirs !== this.seen && theirs !== local) {
      if (local === this.seen) return this.adopt(stored.state, theirs);
      const copy = addRoom(file, this.env.newId(), { ...room, name: uniqueName(file, `${room.name} copy`) }, this.env.now());
      if (copy) {
        this.write(copy);
        this.notify(CONFLICT_NOTICE);
        return this.show(copy, copy.currentId);
      }
      // "My rooms" is full, so no copy can be made: say so, and save this tab's version over the other tab's, below.
      this.notify(FULL_NOTICE);
    }
    const next = upsertRoom(file, roomId, room, this.env.now());
    if (next !== file) this.write(next);
    this.seen = local;
  }

  /** Open another saved room. */
  open(id: string): void {
    this.save();
    const file = selectRoom(this.read(), id);
    if (file.currentId !== id) return this.refresh(); // deleted in another tab meanwhile
    this.write(file);
    this.show(file, id);
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

  /**
   * Delete a saved room. Deleting the open one opens another: the one open last in any tab, else the newest, else a
   * fresh room. Deleting any other room leaves this tab where it is.
   */
  remove(id: string): void {
    const wasOpen = useRoomStore.getState().roomId === id;
    if (!wasOpen) this.save();
    let file = removeRoom(this.read(), id);
    if (wasOpen) file = startRooms(file, this.env.newId(), defaultRoom(), this.env.now()); // never leave this tab without a room
    this.write(file);
    if (wasOpen) this.show(file, file.currentId);
    this.env.dropScan(id);
  }

  /**
   * Another tab changed the saved rooms: re-read the list. If it changed the open room and nothing was changed here,
   * this tab takes that version; otherwise the open room is left alone (save() sorts it out).
   */
  refresh(): void {
    const file = this.read();
    const store = useRoomStore.getState();
    store.setRooms(sortedRooms(file));
    const stored = findRoom(file, store.roomId);
    if (!stored || this.seen === null) return;
    const theirs = stateKey(stored.state);
    if (theirs !== this.seen && stateKey(store.room) === this.seen) this.adopt(stored.state, theirs);
  }

  private add(make: (file: RoomsFile) => RoomState | null): void {
    this.save();
    const file = this.read();
    const state = make(file);
    if (!state) return;
    const added = addRoom(file, this.env.newId(), state, this.env.now());
    if (!added) return this.notify(FULL_NOTICE);
    this.write(added);
    this.show(added, added.currentId);
  }

  private read(): RoomsFile {
    return this.unsaved ?? loadRooms(this.env.storage);
  }

  private write(file: RoomsFile): void {
    const kept = saveRooms(file, this.env.storage);
    this.unsaved = kept ? null : file;
    useRoomStore.getState().setRooms(sortedRooms(file));
    if (!kept && !this.warned) {
      this.warned = true;
      this.notify(UNSAVED_NOTICE);
    }
  }

  /** Put a saved room into the store, unless it is the room already open: its unsaved edits must survive. */
  private show(file: RoomsFile, id: string | null): void {
    const room = findRoom(file, id);
    if (!room || room.id === useRoomStore.getState().roomId) return;
    this.seen = stateKey(room.state);
    this.env.setTabRoom(room.id);
    useRoomStore.getState().openRoom(room.id, room.state);
  }

  /** Take another tab's version of the open room. */
  private adopt(state: RoomState, key: string): void {
    this.seen = key;
    useRoomStore.getState().setRoom(state);
  }

  /** Add a message to the notice. Messages add up until the user dismisses them, so one never hides another. */
  private notify(message: string): void {
    const store = useRoomStore.getState();
    if (store.notice?.includes(message)) return;
    store.setNotice(store.notice ? `${store.notice} ${message}` : message);
  }

  private clearNotice(message: string): void {
    const store = useRoomStore.getState();
    if (!store.notice?.includes(message)) return;
    store.setNotice(store.notice.replace(message, '').trim() || null);
  }
}
