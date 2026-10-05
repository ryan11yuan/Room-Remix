import { create } from 'zustand';
import { defaultRoom } from './roomState';
import type { SavedRoom } from './rooms';
import type { RoomState } from './types';

type RoomStore = {
  /** The saved room being edited. Null until the saved rooms have been read, and always while prerendering. */
  roomId: string | null;
  room: RoomState;
  /** "My rooms", newest first. */
  rooms: SavedRoom[];
  /** Something the user should know: a link that didn't load, rooms that aren't being kept. */
  notice: string | null;
  setRoom: (room: RoomState) => void;
  update: (fn: (room: RoomState) => RoomState) => void;
  /** Switch to a saved room: its id and state change together. */
  openRoom: (id: string, room: RoomState) => void;
  setRooms: (rooms: SavedRoom[]) => void;
  setNotice: (notice: string | null) => void;
};

export const useRoomStore = create<RoomStore>()((set) => ({
  roomId: null,
  room: defaultRoom(),
  rooms: [],
  notice: null,
  setRoom: (room) => set({ room }),
  update: (fn) => set((state) => ({ room: fn(state.room) })),
  openRoom: (roomId, room) => set({ roomId, room }),
  setRooms: (rooms) => set({ rooms }),
  setNotice: (notice) => set({ notice }),
}));
