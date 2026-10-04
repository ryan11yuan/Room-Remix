import { create } from 'zustand';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';

type RoomStore = {
  room: RoomState;
  setRoom: (room: RoomState) => void;
  update: (fn: (room: RoomState) => RoomState) => void;
};

export const useRoomStore = create<RoomStore>()((set) => ({
  room: defaultRoom(),
  setRoom: (room) => set({ room }),
  update: (fn) => set((state) => ({ room: fn(state.room) })),
}));
