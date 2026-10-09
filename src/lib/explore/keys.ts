import type { Action } from './session';

/** Held W/S/A/D act again every half second: about 1 m/s walking (spec 2026-10-08 §7.2). */
export const REPEAT_MS = 500;

export type KeyLike = { code: string; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean; repeat?: boolean };

const KEYS: Record<string, Action> = {
  KeyW: 'forward',
  KeyS: 'back',
  KeyA: 'left',
  KeyD: 'right',
  Space: 'scan',
  Enter: 'go',
  NumpadEnter: 'go',
  Escape: 'stop',
  KeyH: 'help',
};
const REPEATS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD']);

/** The explore action for a key, or null. Keys with Ctrl, Alt or Cmd stay with the browser and the OS. */
export function keyAction(e: KeyLike): Action | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (e.code === 'Tab') return e.shiftKey ? 'previous' : 'next';
  return KEYS[e.code] ?? null;
}

type Timers = { set: (run: () => void, ms: number) => ReturnType<typeof setInterval>; clear: (id: ReturnType<typeof setInterval>) => void };
const realTimers: Timers = { set: (run, ms) => setInterval(run, ms), clear: (id) => clearInterval(id) };

/**
 * Key presses to actions, acting on the first press and repeating held walking and turning keys on our own clock (the
 * browser's repeat is ignored). `press` returns true for keys it used, so the caller can prevent the browser's default.
 */
export function createRepeater(run: (action: Action) => void, timers: Timers = realTimers) {
  const held = new Map<string, ReturnType<typeof setInterval>>();
  return {
    press(e: KeyLike): boolean {
      const action = keyAction(e);
      if (!action) return false;
      if (e.repeat || held.has(e.code)) return true;
      run(action);
      if (REPEATS.has(e.code)) held.set(e.code, timers.set(() => run(action), REPEAT_MS));
      return true;
    },
    release(code: string): void {
      const id = held.get(code);
      if (id === undefined) return;
      timers.clear(id);
      held.delete(code);
    },
    /** The window lost focus: its keyups will never come. */
    releaseAll(): void {
      for (const id of held.values()) timers.clear(id);
      held.clear();
    },
  };
}
