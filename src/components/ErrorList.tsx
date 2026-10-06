import type { RoomError } from '@/lib/room/roomState';
import { errorMessage, type Unit } from '@/lib/room/units';

/** A room's problems in the visitor's unit, and that the room isn't saved until they're fixed. Nothing when there are none. */
export function ErrorList({ errors, unit }: { errors: RoomError[]; unit: Unit }) {
  if (errors.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
      {errors.map((e) => (
        <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
      ))}
      <li className="font-medium">Changes to this room aren&apos;t saved until this is fixed.</li>
    </ul>
  );
}

/** Whether an error belongs to the rug and panels (What if…) rather than the room itself (Edit room). */
export const isFixError = (error: RoomError) => error.field === 'fixes' || error.field.startsWith('fixes.');
