import { beforeEach, describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { useRoomStore } from './store';

beforeEach(() => {
  useRoomStore.setState({ roomId: null, room: defaultRoom(), rooms: [], notice: null });
});

describe('useRoomStore', () => {
  it('starts with the default room, not yet a saved one', () => {
    const state = useRoomStore.getState();
    expect(state.room).toEqual(defaultRoom());
    expect(state.roomId).toBeNull();
    expect(state.rooms).toEqual([]);
    expect(state.notice).toBeNull();
  });

  it('updates and replaces the room', () => {
    useRoomStore.getState().update((r) => ({ ...r, name: 'Studio' }));
    expect(useRoomStore.getState().room.name).toBe('Studio');
    useRoomStore.getState().setRoom(defaultRoom());
    expect(useRoomStore.getState().room.name).toBe('My room');
  });

  it('opens a saved room: its id and state together', () => {
    const studio = { ...defaultRoom(), name: 'Studio' };
    useRoomStore.getState().openRoom('room-1', studio);
    expect(useRoomStore.getState().roomId).toBe('room-1');
    expect(useRoomStore.getState().room).toBe(studio);
  });

  it('holds the rooms list and a notice', () => {
    const saved = [{ id: 'a', updatedAt: 1, state: defaultRoom() }];
    useRoomStore.getState().setRooms(saved);
    useRoomStore.getState().setNotice('Something to know');
    expect(useRoomStore.getState().rooms).toBe(saved);
    expect(useRoomStore.getState().notice).toBe('Something to know');
    useRoomStore.getState().setNotice(null);
    expect(useRoomStore.getState().notice).toBeNull();
  });
});
