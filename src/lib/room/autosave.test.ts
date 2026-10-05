import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { watchEdits } from './autosave';
import { defaultRoom } from './roomState';
import { useRoomStore } from './store';

const edit = (name: string) => useRoomStore.getState().update((r) => ({ ...r, name }));

beforeEach(() => {
  vi.useFakeTimers();
  useRoomStore.setState({ roomId: 'a', room: defaultRoom(), rooms: [], notice: null });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('watchEdits', () => {
  it('saves once, a moment after the last of several edits', () => {
    const save = vi.fn();
    const edits = watchEdits(save, 400);
    edit('S');
    vi.advanceTimersByTime(300);
    edit('St');
    vi.advanceTimersByTime(300);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(save).toHaveBeenCalledTimes(1);
    edits.stop();
  });

  it("doesn't count opening another room as an edit", () => {
    const save = vi.fn();
    const edits = watchEdits(save, 400);
    useRoomStore.getState().openRoom('b', { ...defaultRoom(), name: 'Den' });
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
    edits.stop();
  });

  it('saves at once when flushed, and not again when the timer would have fired', () => {
    const save = vi.fn();
    const edits = watchEdits(save, 400);
    edit('Studio');
    edits.flush();
    expect(save).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(save).toHaveBeenCalledTimes(1);
    edits.stop();
  });

  it('stops: a pending save is dropped and later edits are ignored', () => {
    const save = vi.fn();
    const edits = watchEdits(save, 400);
    edit('Studio');
    edits.stop();
    edit('Den');
    vi.advanceTimersByTime(1000);
    expect(save).not.toHaveBeenCalled();
  });
});
