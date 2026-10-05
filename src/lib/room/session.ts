import { defaultRoom } from './roomState';
import {
  addRoom,
  findRoom,
  importRoom,
  isSavable,
  loadRooms,
  MAX_ROOMS,
  removeRoom,
  saveRooms,
  selectRoom,
  sortedRooms,
  startRooms,
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
};

/**
 * "My rooms" for one page: which saved room is open, and keeping it saved. It reads and writes the saved-rooms file and
 * puts the open room into the store. Every change re-reads the file first, so another tab's rooms aren't overwritten.
 */
export class RoomSession {
  private unsaved: RoomsFile | null = null; // the rooms while storage can't be written: they last until the page closes
  private warned = false; // UNSAVED_NOTICE has been shown

  constructor(private readonly env: SessionEnv) {}

  /**
   * Open a room: the shared link's if the address bar has one, else the one open last, else a first room.
   * Safe to call again: a link pasted into the address bar later opens the same way.
   */
  async start(): Promise<void> {
    const code = this.env.readLink();
    const linked = code ? await this.env.decode(code) : null;
    if (code) this.env.clearLink(); // read once: later edits mustn't leave a stale link in the address bar
    this.save();
    let file = this.read();
    let notice: string | null = code && !linked ? LINK_NOTICE : null;
    if (linked) {
      const imported = importRoom(file, linked, this.env.newId(), this.env.now());
      if (imported) file = imported;
      else notice = FULL_NOTICE;
    }
    file = startRooms(file, this.env.newId(), defaultRoom(), this.env.now());
    this.write(file);
    if (notice) useRoomStore.getState().setNotice(notice);
    this.show(file);
  }

  /** Save the open room now, if it will come back from storage. A room that is mid-edit isn't saved: its last good version stays. */
  save(): void {
    const { roomId, room } = useRoomStore.getState();
    if (!roomId || !isSavable(room)) return;
    const file = this.read();
    const next = upsertRoom(file, roomId, room, this.env.now());
    if (next !== file) this.write(next);
  }

  /** Open another saved room. */
  open(id: string): void {
    this.save();
    const file = selectRoom(this.read(), id);
    if (file.currentId !== id) return this.refresh(); // deleted in another tab meanwhile
    this.write(file);
    this.show(file);
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

  /** Delete a saved room. Deleting the open one opens the newest that is left, or a fresh room when none is. */
  remove(id: string): void {
    if (useRoomStore.getState().roomId !== id) this.save();
    const file = startRooms(removeRoom(this.read(), id), this.env.newId(), defaultRoom(), this.env.now());
    this.write(file);
    this.show(file);
  }

  /** Re-read the saved rooms for the list (another tab changed them). The open room is left alone. */
  refresh(): void {
    useRoomStore.getState().setRooms(sortedRooms(this.read()));
  }

  private add(make: (file: RoomsFile) => RoomState | null): void {
    this.save();
    const file = this.read();
    const state = make(file);
    if (!state) return;
    const added = addRoom(file, this.env.newId(), state, this.env.now());
    if (!added) return useRoomStore.getState().setNotice(FULL_NOTICE);
    this.write(added);
    this.show(added);
  }

  private read(): RoomsFile {
    return this.unsaved ?? loadRooms(this.env.storage);
  }

  private write(file: RoomsFile): void {
    const kept = saveRooms(file, this.env.storage);
    this.unsaved = kept ? null : file;
    const store = useRoomStore.getState();
    store.setRooms(sortedRooms(file));
    if (!kept && !this.warned) {
      this.warned = true;
      store.setNotice(UNSAVED_NOTICE);
    }
  }

  /** Put the file's open room into the store, unless it is the room already open: its unsaved edits must survive. */
  private show(file: RoomsFile): void {
    const room = findRoom(file, file.currentId);
    if (room && room.id !== useRoomStore.getState().roomId) useRoomStore.getState().openRoom(room.id, room.state);
  }
}
