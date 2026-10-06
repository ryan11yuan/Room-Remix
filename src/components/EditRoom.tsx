'use client';

import { useState } from 'react';
import { errorPlace, fixPrompt } from '@/lib/room/errorPlace';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { RoomForm } from './RoomForm';

/**
 * "Edit room": the size, surfaces, furnishing and positions, folded away until wanted. Open from the start when the
 * room has a problem there, and opened again whenever a new one appears, so the error is never hidden.
 */
export function EditRoom() {
  // "Fix the room under Edit room…" while the room has a problem here, else null. A string, so the store compares it by value.
  const prompt = useRoomStore((s) => fixPrompt(validateRoom(s.room).filter((e) => errorPlace(e.field) === 'edit')));
  const hasErrors = prompt !== null;
  const [open, setOpen] = useState(hasErrors);
  const [hadErrors, setHadErrors] = useState(hasErrors);
  if (hasErrors !== hadErrors) {
    setHadErrors(hasErrors);
    if (hasErrors) setOpen(true);
  }
  return (
    <>
      {/* Outside the details and mounted all the time: a screen reader hears a new problem even while Edit room is
          folded (the list inside is hidden until the details opens, which may be too late to be announced). */}
      <p role="status" className="sr-only">
        {prompt}
      </p>
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl border border-neutral-800">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4">
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          <h2 className="text-lg font-semibold">Edit room</h2>
        </summary>
        <div className="px-4 pb-4">
          <RoomForm />
        </div>
      </details>
    </>
  );
}
