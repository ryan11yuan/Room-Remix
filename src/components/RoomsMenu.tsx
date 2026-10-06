'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { roomSession } from '@/components/useRoomSession';
import type { SavedRoom } from '@/lib/room/rooms';
import { useRoomStore } from '@/lib/room/store';

const buttonClass = 'rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40';
const smallButton = 'rounded-md border border-neutral-700 px-2 py-1 text-xs';

const nameOf = (room: SavedRoom) => room.state.name.trim() || 'Untitled room';
const trim = (metres: number) => Number(metres.toFixed(2)); // 3.6576 → 3.66, 4 → 4
const sizeOf = (room: SavedRoom) => {
  const { length, width, height } = room.state.dims;
  return `${trim(length)} × ${trim(width)} × ${trim(height)} m`;
};
const savedAt = (room: SavedRoom) => new Date(room.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** The "My rooms" button and its dialog: open, add, copy and delete the rooms kept in this browser. */
export function RoomsMenu() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rooms = useRoomStore((s) => s.rooms);
  const roomId = useRoomStore((s) => s.roomId);
  const [confirming, setConfirming] = useState<string | null>(null); // the room whose Delete was pressed once

  const close = () => dialogRef.current?.close();

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={buttonClass}>
        My rooms
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="rooms-title"
        onClose={() => setConfirming(null)}
        className="m-auto max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 text-neutral-100 backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="rooms-title" className="text-lg font-semibold">
              My rooms
            </h2>
            <button onClick={close} className={smallButton}>
              Close
            </button>
          </div>
          <p className="text-sm text-neutral-400">Your rooms are kept in this browser only. Nothing is uploaded.</p>
          <Link href="/setup" className={`${buttonClass} self-start`}>
            New room
          </Link>
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => {
              const open = room.id === roomId;
              return (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 p-3">
                  <button
                    onClick={() => {
                      roomSession().open(room.id);
                      close();
                    }}
                    aria-current={open ? 'true' : undefined}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block truncate font-medium">{nameOf(room)}</span>
                    <span className="block text-xs text-neutral-400">
                      {sizeOf(room)} · {open ? 'open now' : `saved ${savedAt(room)}`}
                    </span>
                  </button>
                  <div className="flex gap-2">
                    {confirming === room.id ? (
                      <>
                        <button
                          onClick={() => {
                            roomSession().remove(room.id);
                            setConfirming(null);
                          }}
                          className={`${smallButton} border-red-700 text-red-200`}
                        >
                          Delete for good
                        </button>
                        <button onClick={() => setConfirming(null)} className={smallButton}>
                          Keep
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            roomSession().duplicate(room.id);
                            close();
                          }}
                          aria-label={`Duplicate ${nameOf(room)}`}
                          className={smallButton}
                        >
                          Duplicate
                        </button>
                        <button onClick={() => setConfirming(room.id)} aria-label={`Delete ${nameOf(room)}`} className={smallButton}>
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </dialog>
    </>
  );
}
