import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import { useRoomStore } from './store';

describe('useRoomStore', () => {
  it('starts with the default room', () => {
    expect(useRoomStore.getState().room).toEqual(defaultRoom());
  });

  it('updates and replaces the room', () => {
    useRoomStore.getState().update((r) => ({ ...r, name: 'Studio' }));
    expect(useRoomStore.getState().room.name).toBe('Studio');
    useRoomStore.getState().setRoom(defaultRoom());
    expect(useRoomStore.getState().room.name).toBe('My room');
  });
});
