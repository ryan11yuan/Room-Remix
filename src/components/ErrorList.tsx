import { errorPlace, type ErrorPlace } from '@/lib/room/errorPlace';
import type { RoomError } from '@/lib/room/roomState';
import { errorMessage, type Unit } from '@/lib/room/units';

/**
 * A room's problems that are fixed in `place`, in the visitor's unit, and that the room isn't saved until they're fixed.
 * Its status region is mounted all the time, so a screen reader announces an error when it appears.
 */
export function ErrorList({ errors, place, unit }: { errors: RoomError[]; place: ErrorPlace; unit: Unit }) {
  const here = errors.filter((e) => errorPlace(e.field) === place);
  return (
    <div role="status" className="empty:sr-only">
      {here.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          {here.map((e) => (
            <li key={`${e.field}:${e.message}`}>{errorMessage(e, unit)}</li>
          ))}
          <li className="font-medium">Changes to this room aren&apos;t saved until this is fixed.</li>
        </ul>
      )}
    </div>
  );
}
