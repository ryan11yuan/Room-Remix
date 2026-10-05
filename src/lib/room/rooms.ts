import type { RoomState } from './types';
import { migrate } from './urlCodec';

/** A room kept in this browser's "My rooms". Its name is `state.name`. */
export type SavedRoom = { id: string; updatedAt: number; state: RoomState };
/** Everything "My rooms" stores: the rooms, and which one was open last. */
export type RoomsFile = { rooms: SavedRoom[]; currentId: string | null };
/** The part of `localStorage` this module needs. Null where the browser has none or blocks it. */
export type RoomsStorage = Pick<Storage, 'getItem' | 'setItem'> | null;

export const ROOMS_KEY = 'room-remix:rooms';
export const MAX_ROOMS = 50;
export const EMPTY_ROOMS: RoomsFile = { rooms: [], currentId: null };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const sameState = (a: RoomState, b: RoomState) => JSON.stringify(a) === JSON.stringify(b);

/** Read a stored rooms file. Unreadable rooms are dropped one by one, so a bad entry never costs the others. */
export function parseRooms(json: string | null): RoomsFile {
  if (!json) return EMPTY_ROOMS;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return EMPTY_ROOMS;
  }
  if (!isRecord(raw) || raw.v !== 1 || !Array.isArray(raw.rooms)) return EMPTY_ROOMS;
  const rooms: SavedRoom[] = [];
  const ids = new Set<string>();
  for (const entry of raw.rooms as unknown[]) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id === '' || ids.has(entry.id)) continue;
    const state = migrate(entry.state);
    if (!state) continue;
    const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
    rooms.push({ id: entry.id, updatedAt, state });
    ids.add(entry.id);
  }
  const currentId = typeof raw.currentId === 'string' && ids.has(raw.currentId) ? raw.currentId : null;
  return { rooms, currentId };
}

export function serializeRooms(file: RoomsFile): string {
  return JSON.stringify({ v: 1, rooms: file.rooms, currentId: file.currentId });
}

/** The rooms, newest first. */
export function sortedRooms(file: RoomsFile): SavedRoom[] {
  return [...file.rooms].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function findRoom(file: RoomsFile, id: string | null): SavedRoom | null {
  return file.rooms.find((room) => room.id === id) ?? null;
}

/** The room to open at the start: the one open last, else the newest, else none. */
export function currentRoom(file: RoomsFile): SavedRoom | null {
  return findRoom(file, file.currentId) ?? sortedRooms(file)[0] ?? null;
}

/** Save a room's state. Returns the same file when nothing changed, so the caller can skip the write. */
export function upsertRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile {
  const existing = findRoom(file, id);
  if (existing && sameState(existing.state, state)) return file;
  const saved: SavedRoom = { id, updatedAt: now, state };
  return { ...file, rooms: existing ? file.rooms.map((room) => (room.id === id ? saved : room)) : [...file.rooms, saved] };
}

/** Add a room and make it the open one. Null when "My rooms" is full. */
export function addRoom(file: RoomsFile, id: string, state: RoomState, now: number): RoomsFile | null {
  if (file.rooms.length >= MAX_ROOMS) return null;
  return { rooms: [...file.rooms, { id, updatedAt: now, state }], currentId: id };
}

/** Make a saved room the open one. An unknown id changes nothing. */
export function selectRoom(file: RoomsFile, id: string): RoomsFile {
  return findRoom(file, id) ? { ...file, currentId: id } : file;
}

/** Delete a room. If it was the open one, the newest room that is left becomes the open one. */
export function removeRoom(file: RoomsFile, id: string): RoomsFile {
  const rooms = file.rooms.filter((room) => room.id !== id);
  const currentId = file.currentId === id ? (sortedRooms({ rooms, currentId: null })[0]?.id ?? null) : file.currentId;
  return { rooms, currentId };
}

/** A name no saved room has yet: "My room", then "My room 2", "My room 3"… */
export function uniqueName(file: RoomsFile, base: string): string {
  const taken = new Set(file.rooms.map((room) => room.state.name));
  if (!taken.has(base)) return base;
  const stem = base.slice(0, 72); // a room name holds 80 characters: leave space for the number
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
  if (!open) return { rooms: [{ id, updatedAt: now, state: fresh }], currentId: id };
  return open.id === file.currentId ? file : { ...file, currentId: open.id };
}

export function newRoomId(): string {
  // randomUUID needs a secure context: plain http on a LAN address (testing on a phone) has none.
  return globalThis.crypto?.randomUUID?.() ?? `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** The saved rooms, or none when storage is missing, blocked or unreadable. */
export function loadRooms(storage: RoomsStorage): RoomsFile {
  try {
    return parseRooms(storage?.getItem(ROOMS_KEY) ?? null);
  } catch {
    return EMPTY_ROOMS;
  }
}

/** Write the rooms. False when storage is missing, blocked or full: the rooms then last only until the page closes. */
export function saveRooms(file: RoomsFile, storage: RoomsStorage): boolean {
  if (!storage) return false;
  try {
    storage.setItem(ROOMS_KEY, serializeRooms(file));
    return true;
  } catch {
    return false;
  }
}
