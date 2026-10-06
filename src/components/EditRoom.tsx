'use client';

import { useState } from 'react';
import { errorPlace } from '@/lib/room/errorPlace';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { RoomForm } from './RoomForm';

/**
 * "Edit room": the size, surfaces, furnishing and positions, folded away until wanted. Open from the start when the
 * room has a problem there, and opened again whenever a new one appears, so the error is never hidden.
 */
export function EditRoom() {
  const hasErrors = useRoomStore((s) => validateRoom(s.room).some((e) => errorPlace(e.field) === 'edit'));
  const [open, setOpen] = useState(hasErrors);
  const [hadErrors, setHadErrors] = useState(hasErrors);
  if (hasErrors !== hadErrors) {
    setHadErrors(hasErrors);
    if (hasErrors) setOpen(true);
  }
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="rounded-xl border border-neutral-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4">
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        <h2 className="text-lg font-semibold">Edit room</h2>
      </summary>
      <div className="px-4 pb-4">
        <RoomForm />
      </div>
    </details>
  );
}
