import { useRoomStore } from './store';

/**
 * Save shortly after the open room stops changing. `flush` saves at once (the page is going away); `stop` ends it.
 * Opening another room isn't an edit: only changes to the room that stays open lead to a save.
 */
export function watchEdits(save: () => void, delayMs: number): { flush: () => void; stop: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    save();
  };
  const unsubscribe = useRoomStore.subscribe((state, previous) => {
    if (state.room === previous.room || state.roomId !== previous.roomId) return;
    clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
  });
  return {
    flush,
    stop: () => {
      clearTimeout(timer);
      timer = undefined;
      unsubscribe();
    },
  };
}
