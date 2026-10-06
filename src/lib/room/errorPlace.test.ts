import { describe, expect, it } from 'vitest';
import { errorPlace, fixPrompt } from './errorPlace';
import { defaultRoom, validateRoom } from './roomState';
import type { Fix, RoomState } from './types';

const rug = (x: number, z: number): Fix => ({ kind: 'rug', size: 'M', x, z, on: true });

/** Rooms that each break one rule, keyed by the field `validateRoom` reports. */
const broken: Record<string, (room: RoomState) => RoomState> = {
  'dims.length': (r) => ({ ...r, dims: { ...r.dims, length: Number.NaN } }),
  'dims.width': (r) => ({ ...r, dims: { ...r.dims, width: 0.5 } }),
  'dims.height': (r) => ({ ...r, dims: { ...r.dims, height: 40 } }),
  speaker: (r) => ({ ...r, speaker: { ...r.speaker, x: 0 } }),
  listener: (r) => ({ ...r, listener: { ...r.listener, x: r.speaker.x, y: r.speaker.y, z: r.speaker.z } }),
  fixes: (r) => ({ ...r, fixes: [rug(2, 1.75), rug(2, 1.75)] }),
  'fixes.0': (r) => ({ ...r, fixes: [rug(0.2, 1.75)] }), // half off the floor
};

const fieldsOf = (room: RoomState) => validateRoom(room).map((e) => e.field);

describe('errorPlace', () => {
  it('puts every field validateRoom reports in exactly one place: the fixes under What if…, the rest under Edit room', () => {
    const seen = new Set<string>();
    for (const [field, breakIt] of Object.entries(broken)) {
      const fields = fieldsOf(breakIt(defaultRoom()));
      expect(fields).toContain(field); // the room really does break that rule
      fields.forEach((f) => seen.add(f));
    }
    expect([...seen].sort()).toEqual(Object.keys(broken).sort()); // and these are all the fields there are
    for (const field of seen) {
      const place = errorPlace(field);
      expect(['edit', 'whatIf']).toContain(place);
      expect(place).toBe(field === 'fixes' || field.startsWith('fixes.') ? 'whatIf' : 'edit');
    }
    expect(errorPlace('fixes')).toBe('whatIf');
    expect(errorPlace('fixes.0')).toBe('whatIf');
    expect(errorPlace('fixes.7')).toBe('whatIf');
    expect(errorPlace('speaker')).toBe('edit');
  });
});

describe('fixPrompt', () => {
  it('says where to fix the room', () => {
    expect(fixPrompt(validateRoom(defaultRoom()))).toBeNull();
    expect(fixPrompt(validateRoom(broken.speaker(defaultRoom())))).toBe('Fix the room under Edit room to hear your changes.');
    expect(fixPrompt(validateRoom(broken['fixes.0'](defaultRoom())))).toBe(
      'Fix the rug or panels under What if… to hear your changes.',
    );
    expect(fixPrompt(validateRoom(broken.speaker(broken['fixes.0'](defaultRoom()))))).toBe(
      'Fix the room under Edit room and What if… to hear your changes.',
    );
  });
});
