import { describe, expect, it } from 'vitest';
import { DEMO_ROOM } from './demoRoom';
import { validateRoom } from './roomState';

describe('DEMO_ROOM', () => {
  it('is a valid room that passes validation', () => {
    expect(validateRoom(DEMO_ROOM)).toEqual([]);
    expect(DEMO_ROOM.name).toBe('Demo bedroom');
  });
});
