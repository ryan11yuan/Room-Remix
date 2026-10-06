import type { RoomError } from './roomState';

/** Where on the room page an error is fixed: the rug and panels under What if…, everything else under Edit room. */
export type ErrorPlace = 'edit' | 'whatIf';

/** The place for an error's `field`, as `validateRoom` reports it ('dims.length', 'speaker', 'fixes', 'fixes.0'…). */
export function errorPlace(field: string): ErrorPlace {
  return field === 'fixes' || field.startsWith('fixes.') ? 'whatIf' : 'edit';
}

/** The line that says where to fix a room before its changes can be heard, or null when it has no errors. */
export function fixPrompt(errors: RoomError[]): string | null {
  const places = new Set(errors.map((error) => errorPlace(error.field)));
  if (places.has('edit') && places.has('whatIf')) return 'Fix the room under Edit room and What if… to hear your changes.';
  if (places.has('edit')) return 'Fix the room under Edit room to hear your changes.';
  if (places.has('whatIf')) return 'Fix the rug or panels under What if… to hear your changes.';
  return null;
}
