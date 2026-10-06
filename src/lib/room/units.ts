import { LIMITS } from './constants';
import type { RoomError } from './roomState';

/** How lengths are shown and typed. Rooms are always stored in metres. */
export type Unit = 'm' | 'ft';

/** One foot, in metres (exact by definition). */
export const FOOT = 0.3048;
/** The localStorage key for the visitor's choice. */
export const UNITS_KEY = 'room-remix:units';

/** A length in metres, in `unit`. */
export function toUnit(m: number, unit: Unit): number {
  return unit === 'ft' ? m / FOOT : m;
}

/** A length in `unit`, in metres. */
export function fromUnit(value: number, unit: Unit): number {
  return unit === 'ft' ? value * FOOT : value;
}

/** A number already in `unit`, as fields show it: feet to one decimal ("12.5"), metres to at most two ("3.5", "4"). */
export function formatNumber(value: number, unit: Unit): string {
  return unit === 'ft' ? value.toFixed(1) : String(Number(value.toFixed(2)));
}

/** A length in metres, as fields show it in `unit` (without the unit). */
export function formatLength(m: number, unit: Unit): string {
  return formatNumber(toUnit(m, unit), unit);
}

const DECIMAL = /^-?(\d+([.,]\d*)?|[.,]\d+)$/;

/** What was typed into a length field, in metres. Null when it isn't a plain decimal number. A comma works as the point. */
export function parseLength(text: string, unit: Unit): number | null {
  const trimmed = text.trim();
  if (!DECIMAL.test(trimmed)) return null;
  return fromUnit(Number(trimmed.replace(',', '.')), unit);
}

export type UnitBounds = { minLengthWidth: number; maxLengthWidth: number; minHeight: number; maxHeight: number };

/**
 * The size limits in `unit`, rounded inward to the precision fields show, so a value typed at a shown limit is valid:
 * 1.5 m is 4.92 ft, shown as 5.0 (4.9 ft would be too small); 30 m is 98.43 ft, shown as 98.4.
 */
export function unitBounds(unit: Unit): UnitBounds {
  const steps = unit === 'ft' ? 10 : 100; // feet show one decimal, metres two
  const up = (m: number) => Math.ceil(toUnit(m, unit) * steps - 1e-9) / steps;
  const down = (m: number) => Math.floor(toUnit(m, unit) * steps + 1e-9) / steps;
  return {
    minLengthWidth: up(LIMITS.minLengthWidth),
    maxLengthWidth: down(LIMITS.maxLengthWidth),
    minHeight: up(LIMITS.minHeight),
    maxHeight: down(LIMITS.maxHeight),
  };
}

/** A validation message with its lengths in `unit`. Size limits use the rounded-inward bounds above. */
export function errorMessage(error: RoomError, unit: Unit): string {
  const bounds = unitBounds(unit);
  const n = (value: number) => formatNumber(value, unit);
  switch (error.field) {
    case 'dims.length':
      return `Length must be between ${n(bounds.minLengthWidth)} and ${n(bounds.maxLengthWidth)} ${unit}.`;
    case 'dims.width':
      return `Width must be between ${n(bounds.minLengthWidth)} and ${n(bounds.maxLengthWidth)} ${unit}.`;
    case 'dims.height':
      return `Height must be between ${n(bounds.minHeight)} and ${n(bounds.maxHeight)} ${unit}.`;
  }
  if (unit === 'm') return error.message;
  return error.message.replace(/(\d+(?:\.\d+)?) m\b/g, (_, metres: string) => `${formatLength(Number(metres), 'ft')} ft`);
}

/** A stored choice, or null when nothing (or something else) is stored. */
export function parseUnit(stored: string | null): Unit | null {
  return stored === 'm' || stored === 'ft' ? stored : null;
}

/** The unit to start with before the visitor chooses: feet for US English, metres everywhere else. */
export function defaultUnit(language: string | undefined): Unit {
  return language?.toLowerCase() === 'en-us' ? 'ft' : 'm';
}
