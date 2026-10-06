import { describe, expect, it } from 'vitest';
import { DEMO_ROOM } from './demoRoom';
import { isSavable } from './rooms';
import { validateRoom } from './roomState';

describe('DEMO_ROOM', () => {
  it('is a valid room that can be saved and shared', () => {
    expect(validateRoom(DEMO_ROOM)).toEqual([]);
    expect(isSavable(DEMO_ROOM)).toBe(true);
    expect(DEMO_ROOM.name).toBe('Demo bedroom');
  });
});
