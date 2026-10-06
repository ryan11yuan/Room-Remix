import { describe, expect, it } from 'vitest';
import { defaultRoom, validateRoom } from './roomState';
import type { RoomState } from './types';
import {
  defaultUnit,
  errorMessage,
  FOOT,
  formatLength,
  formatNumber,
  fromUnit,
  parseLength,
  parseUnit,
  toUnit,
  unitBounds,
} from './units';

const withLength = (length: number): RoomState => ({ ...defaultRoom(), dims: { ...defaultRoom().dims, length } });
const withHeight = (height: number): RoomState => ({ ...defaultRoom(), dims: { ...defaultRoom().dims, height } });
/** The room's size errors only: a small room also puts the default speaker and listener outside it. */
const sizeErrors = (room: RoomState) => validateRoom(room).filter((e) => e.field.startsWith('dims.'));

describe('converting', () => {
  it('uses the exact foot', () => {
    expect(FOOT).toBe(0.3048);
    expect(toUnit(3.048, 'ft')).toBeCloseTo(10, 12);
    expect(fromUnit(10, 'ft')).toBeCloseTo(3.048, 12);
    expect(toUnit(3.5, 'm')).toBe(3.5);
    expect(fromUnit(3.5, 'm')).toBe(3.5);
  });

  it('round-trips any length through feet', () => {
    for (const m of [1.5, 2.6, 3.6576, 29.99]) expect(fromUnit(toUnit(m, 'ft'), 'ft')).toBeCloseTo(m, 12);
  });
});

describe('formatting', () => {
  it('shows feet to one decimal and metres to at most two, without trailing zeros', () => {
    expect(formatLength(3.048, 'ft')).toBe('10.0');
    expect(formatLength(3.81, 'ft')).toBe('12.5');
    expect(formatLength(4, 'm')).toBe('4');
    expect(formatLength(3.5, 'm')).toBe('3.5');
    expect(formatLength(3.6576, 'm')).toBe('3.66');
    expect(formatNumber(5, 'ft')).toBe('5.0');
  });
});

describe('parsing', () => {
  it('reads decimals in either unit, with a point or a comma', () => {
    expect(parseLength('12.5', 'ft')).toBeCloseTo(3.81, 12);
    expect(parseLength(' 3,5 ', 'm')).toBe(3.5);
    expect(parseLength('4', 'm')).toBe(4);
    expect(parseLength('.5', 'm')).toBe(0.5);
    expect(parseLength('12.', 'ft')).toBeCloseTo(3.6576, 12);
  });

  it("gives null for anything that isn't a plain number", () => {
    for (const text of ['', ' ', 'abc', '12 ft', "12'6\"", '1e3', '1.2.3', '-', '.', 'Infinity']) {
      expect(parseLength(text, 'm')).toBeNull();
    }
  });

  it('shows what was typed in feet the way it was typed', () => {
    const m = parseLength('12.5', 'ft')!;
    expect(formatLength(m, 'ft')).toBe('12.5');
  });
});

describe('limits in each unit', () => {
  it('are the spec limits in metres', () => {
    expect(unitBounds('m')).toEqual({ minLengthWidth: 1.5, maxLengthWidth: 30, minHeight: 2, maxHeight: 15 });
  });

  it('are rounded inward in feet', () => {
    expect(unitBounds('ft')).toEqual({ minLengthWidth: 5, maxLengthWidth: 98.4, minHeight: 6.6, maxHeight: 49.2 });
  });

  it('accept a value typed at a shown limit', () => {
    const b = unitBounds('ft');
    expect(sizeErrors(withLength(parseLength(formatNumber(b.minLengthWidth, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withLength(parseLength(formatNumber(b.maxLengthWidth, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withHeight(parseLength(formatNumber(b.minHeight, 'ft'), 'ft')!))).toEqual([]);
    expect(sizeErrors(withHeight(parseLength(formatNumber(b.maxHeight, 'ft'), 'ft')!))).toEqual([]);
  });

  it('refuse a value just outside a shown limit, and say so in feet', () => {
    const errors = sizeErrors(withLength(parseLength('4.9', 'ft')!));
    expect(errors.map((e) => errorMessage(e, 'ft'))).toEqual(['Length must be between 5.0 and 98.4 ft.']);
  });
});

describe('errorMessage', () => {
  it('leaves the metre messages as validateRoom words them', () => {
    const errors = [
      ...validateRoom(withLength(1)),
      ...validateRoom({ ...defaultRoom(), dims: { length: 4, width: 40, height: 1 } }),
      ...validateRoom({ ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } }),
    ];
    expect(errors.length).toBeGreaterThan(3);
    for (const e of errors) expect(errorMessage(e, 'm')).toBe(e.message);
  });

  it('gives every size message in feet', () => {
    const errors = validateRoom({ ...defaultRoom(), dims: { length: 1, width: 40, height: 1 } });
    expect(errors.map((e) => errorMessage(e, 'ft'))).toEqual([
      'Length must be between 5.0 and 98.4 ft.',
      'Width must be between 5.0 and 98.4 ft.',
      'Height must be between 6.6 and 49.2 ft.',
    ]);
  });

  it('turns the distances in other messages into feet', () => {
    const tooClose = validateRoom({ ...defaultRoom(), speaker: { x: 0.1, y: 1, z: 1 } });
    expect(errorMessage(tooClose[0], 'ft')).toBe('The speaker must be at least 1.0 ft from the walls, floor and ceiling.');
    const together = validateRoom({ ...defaultRoom(), listener: { x: 0.7, y: 1.0, z: 1.4, yaw: 'faceSpeaker' } });
    expect(errorMessage(together[0], 'ft')).toBe('The listener must be at least 1.6 ft from the speaker.');
  });
});

describe('the unit preference', () => {
  it('reads only a unit back from storage', () => {
    expect(parseUnit('ft')).toBe('ft');
    expect(parseUnit('m')).toBe('m');
    expect(parseUnit(null)).toBeNull();
    expect(parseUnit('feet')).toBeNull();
  });

  it('starts in feet for US English and in metres otherwise', () => {
    expect(defaultUnit('en-US')).toBe('ft');
    expect(defaultUnit('en-us')).toBe('ft');
    expect(defaultUnit('en-GB')).toBe('m');
    expect(defaultUnit('de')).toBe('m');
    expect(defaultUnit(undefined)).toBe('m');
  });
});
