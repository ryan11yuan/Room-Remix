import type { RoomState } from './types';
import { migrate } from './urlCodec';

/** A room kept in this browser's "My rooms". Its name is `state.name`. */
export type SavedRoom = { id: string; updatedAt: number; state: RoomState };
/** Everything "My rooms" stores: the rooms, and which one was open last. */
export type RoomsFile = {
  rooms: SavedRoom[];
  currentId: string | null;
  /** Stored entries this build can't read (a newer build's rooms, say). Kept as they are and written back; never shown. */
  unreadable?: unknown[];
};
/** The part of `localStorage` this module needs. Null where the browser has none or blocks it. */
export type RoomsStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

export const ROOMS_KEY = 'room-remix:rooms';
/** Where a stored file this build can't read at all is copied before it is written over. */
export const ROOMS_BACKUP_KEY = 'room-remix:rooms:backup';
export const MAX_ROOMS = 50;
export const EMPTY_ROOMS: RoomsFile = { rooms: [], currentId: null };
const NAME_LENGTH = 80; // what `migrate` keeps of a room's name

const empty = (): RoomsFile => ({ rooms: [], currentId: null }); // a fresh one each time: a caller may hold on to it
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * A state as text with its keys in the stored order, so two states compare equal whatever order their keys were written
 * in. A state that can't be stored (mid-edit) is given as it is.
 */
export function stateKey(state: RoomState): string {
  const plain: unknown = JSON.parse(JSON.stringify(state));
  return JSON.stringify(migrate(plain) ?? plain);
}
const sameState = (a: RoomState, b: RoomState) => stateKey(a) === stateKey(b);

/** The stored value as this version's rooms file, or null when it isn't one: broken, or written by another version. */
function readFile(json: string | null): { rooms: unknown[]; currentId: unknown } | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    return isRecord(raw) && raw.v === 1 && Array.isArray(raw.rooms) ? { rooms: raw.rooms as unknown[], currentId: raw.currentId } : null;
  } catch {
    return null;
  }
}

/**
 * Read a stored rooms file. A room this build can't read never costs the others: it is set aside in `unreadable` and
 * written back as it was. Entries that aren't rooms at all (no id, or an id already seen) are dropped.
 */
export function parseRooms(json: string | null): RoomsFile {
  const raw = readFile(json);
  if (!raw) return empty();
  const rooms: SavedRoom[] = [];
  const unreadable: unknown[] = [];
  const ids = new Set<string>();
  for (const entry of raw.rooms) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) continue;
    ids.add(entry.id);
    const state = migrate(entry.state);
    if (!state) {
      unreadable.push(entry); // every one: they only ever come from storage, so they can't pile up
      continue;
    }
    const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
    rooms.push({ id: entry.id, updatedAt, state });
  }
  const currentId = typeof raw.currentId === 'string' && rooms.some((room) => room.id === raw.currentId) ? raw.currentId : null;
  return unreadable.length > 0 ? { rooms, currentId, unreadable } : { rooms, currentId };
}

/** The ids of every room in the file: the readable ones, then the ones this build can't read (their data is kept). */
export function roomIds(file: RoomsFile): string[] {
  const kept = (file.unreadable ?? []).flatMap((entry) =>
    isRecord(entry) && typeof entry.id === 'string' ? [entry.id] : [],
  );
  return [...file.rooms.map((room) => room.id), ...kept];
}

export function serializeRooms(file: RoomsFile): string {
  return JSON.stringify({ v: 1, rooms: [...file.rooms, ...(file.unreadable ?? [])], currentId: file.currentId });
}

/** Whether a state will come back after being saved. Anything else must not be saved: it would be gone at the next load. */
export function isSavable(state: RoomState): boolean {
  return migrate(JSON.parse(JSON.stringify(state))) !== null;
}

/** The rooms, newest first. Of two saved at the same moment, the one added later comes first. */
export function sortedRooms(file: RoomsFile): SavedRoom[] {
  return file.rooms
    .map((room, index) => ({ room, index }))
    .sort((a, b) => b.room.updatedAt - a.room.updatedAt || b.index - a.index)
    .map(({ room }) => room);
}

export function findRoom(file: RoomsFile, id: string | null): SavedRoom | null {
  return file.rooms.find((room) => room.id === id) ?? null;
}

/** The room to open at the start: the one open last, else the newest, else none. */
export function currentRoom(file: RoomsFile): SavedRoom | null {
  return findRoom(file, file.currentId) ?? sortedRooms(file)[0] ?? null;
}

/**
 * Save a room's state. Returns the same file when nothing changed, so the caller can skip the write. A room that isn't
 * in the file is added: a room deleted in another tab while it is still being edited here comes back at its next save.
 */
export function upsertRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile {
  const existing = findRoom(file, id);
  if (existing && sameState(existing.state, state)) return file;
  const saved: SavedRoom = { id, updatedAt: now, state };
  return { ...file, rooms: existing ? file.rooms.map((room) => (room.id === id ? saved : room)) : [...file.rooms, saved] };
}

/** Add a room and make it the open one. `id` must be new. Null when "My rooms" is full. */
export function addRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile | null {
  if (file.rooms.length >= MAX_ROOMS) return null;
  return { ...file, rooms: [...file.rooms, { id, updatedAt: now, state }], currentId: id };
}

/** Make a saved room the open one. An unknown id changes nothing. */
export function selectRoom(file: RoomsFile, id: string): RoomsFile {
  return findRoom(file, id) ? { ...file, currentId: id } : file;
}

/** Delete a room. If it was the open one, the newest room that is left becomes the open one. */
export function removeRoom(file: RoomsFile, id: string): RoomsFile {
  const rooms = file.rooms.filter((room) => room.id !== id);
  const currentId = file.currentId === id ? (sortedRooms({ rooms, currentId: null })[0]?.id ?? null) : file.currentId;
  return { ...file, rooms, currentId };
}

/** A name no saved room has yet, at most 80 characters: "My room", then "My room 2", "My room 3"… */
export function uniqueName(file: RoomsFile, base: string): string {
  const taken = new Set(file.rooms.map((room) => room.state.name));
  const whole = base.slice(0, NAME_LENGTH);
  if (!taken.has(whole)) return whole;
  const stem = base.slice(0, NAME_LENGTH - 8); // leave space for the number
  for (let n = 2; ; n++) {
    const name = `${stem} ${n}`;
    if (!taken.has(name)) return name;
  }
}

/**
 * Open a shared room as a room of its own. A saved room with exactly that state is reused, so opening the same link
 * twice doesn't pile up copies. Null when "My rooms" is full.
 */
export function importRoom(file: RoomsFile, state: RoomState, id: string, now: number): RoomsFile | null {
  const same = file.rooms.find((room) => sameState(room.state, state));
  return same ? { ...file, currentId: same.id } : addRoom(file, id, state, now);
}

/** Make sure a room is open: the one open last, else the newest, else a first room made from `fresh`. */
export function startRooms(file: RoomsFile, id: string, fresh: RoomState, now: number): RoomsFile {
  const open = currentRoom(file);
  if (!open) return { ...file, rooms: [{ id, updatedAt: now, state: fresh }], currentId: id };
  return open.id === file.currentId ? file : { ...file, currentId: open.id };
}

export function newRoomId(): string {
  // randomUUID needs a secure context: plain http on a LAN address (testing on a phone) has none.
  return globalThis.crypto?.randomUUID?.() ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Whether the stored rooms are safe to treat as complete: nothing stored, or a file this build can read. */
export function roomsReadable(storage: RoomsStorage): boolean {
  try {
    const stored = storage?.getItem(ROOMS_KEY) ?? null;
    return !stored || readFile(stored) !== null;
  } catch {
    return false;
  }
}

/** The saved rooms, or none when storage is missing, blocked or unreadable. */
export function loadRooms(storage: RoomsStorage): RoomsFile {
  try {
    return parseRooms(storage?.getItem(ROOMS_KEY) ?? null);
  } catch {
    return empty();
  }
}

/** Write the rooms. False when storage is missing, blocked or full: the rooms then last only until the page closes. */
export function saveRooms(file: RoomsFile, storage: RoomsStorage): boolean {
  if (!storage) return false;
  try {
    const stored = storage.getItem(ROOMS_KEY);
    // Never write over what this build can't read (broken, or a newer build's) without keeping a copy.
    if (stored && !readFile(stored)) storage.setItem(ROOMS_BACKUP_KEY, stored);
    storage.setItem(ROOMS_KEY, serializeRooms(file));
    return true;
  } catch {
    return false;
  }
}
