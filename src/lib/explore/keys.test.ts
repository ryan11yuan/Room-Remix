import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRepeater, keyAction, REPEAT_MS, type KeyLike } from './keys';
import type { Action } from './session';

const key = (code: string, mods: Partial<KeyLike> = {}): KeyLike => ({ code, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...mods });

describe('keyAction', () => {
  it('maps W A S D, Space, Tab, Enter, Esc and H', () => {
    expect(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'Enter', 'Escape', 'KeyH'].map((c) => keyAction(key(c)))).toEqual([
      'forward', 'back', 'left', 'right', 'scan', 'go', 'stop', 'help',
    ]);
    expect(keyAction(key('Tab'))).toBe('next');
    expect(keyAction(key('Tab', { shiftKey: true }))).toBe('previous');
  });

  it('leaves arrows and keys with Ctrl, Alt or Cmd to the browser', () => {
    expect(keyAction(key('ArrowUp'))).toBeNull();
    expect(keyAction(key('Tab', { ctrlKey: true }))).toBeNull();
    expect(keyAction(key('Tab', { altKey: true }))).toBeNull();
    expect(keyAction(key('KeyW', { metaKey: true }))).toBeNull();
    expect(keyAction(key('KeyR', { ctrlKey: true }))).toBeNull();
  });
});

describe('createRepeater', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('acts on press, repeats walking and turning every 0.5 s while held, and stops on release', () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    expect(keys.press(key('KeyW'))).toBe(true);
    vi.advanceTimersByTime(REPEAT_MS * 2);
    expect(ran).toEqual(['forward', 'forward', 'forward']);
    keys.release('KeyW');
    vi.advanceTimersByTime(REPEAT_MS * 2);
    expect(ran).toHaveLength(3);
  });

  it("ignores the browser's own key repeat, and never repeats Space", () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    keys.press(key('Space'));
    keys.press({ ...key('Space'), repeat: true });
    vi.advanceTimersByTime(REPEAT_MS * 3);
    expect(ran).toEqual(['scan']);
    keys.release('Space');
    keys.press(key('Space'));
    expect(ran).toEqual(['scan', 'scan']);
  });

  it('stops everything when the window loses focus mid-walk', () => {
    const ran: Action[] = [];
    const keys = createRepeater((a) => ran.push(a));
    keys.press(key('KeyW'));
    keys.press(key('KeyD'));
    keys.releaseAll();
    vi.advanceTimersByTime(REPEAT_MS * 3);
    expect(ran).toEqual(['forward', 'right']);
  });

  it('reports keys it does not use as unhandled', () => {
    const keys = createRepeater(() => {});
    expect(keys.press(key('ArrowUp'))).toBe(false);
  });
});
