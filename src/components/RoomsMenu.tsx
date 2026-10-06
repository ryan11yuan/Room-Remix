'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { roomSession } from '@/components/useRoomSession';
import { displayName, type SavedRoom } from '@/lib/room/rooms';
import { useRoomStore } from '@/lib/room/store';

const buttonClass = 'inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-4 text-sm disabled:opacity-40';
const smallButton = 'min-h-11 rounded-md border border-neutral-700 px-3 text-xs';

const nameOf = (room: SavedRoom) => displayName(room.state.name);
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
  const [focusTarget, setFocusTarget] = useState<{ key: string } | null>(null); // a fresh object each time, so the same key refocuses

  // Focus moves once the control it goes to has rendered: a Keep button, or the next room after a delete. Controls are
  // found by their data-focus key: 'new', 'open:<id>', 'delete:<id>' or 'keep:<id>'.
  useEffect(() => {
    if (!focusTarget) return;
    const targets = dialogRef.current?.querySelectorAll<HTMLElement>('[data-focus]') ?? [];
    Array.from(targets).find((element) => element.dataset.focus === focusTarget.key)?.focus();
  }, [focusTarget]);

  const close = () => dialogRef.current?.close();

  function deleteForGood(room: SavedRoom) {
    const index = rooms.findIndex((r) => r.id === room.id);
    const next = rooms[index + 1] ?? rooms[index - 1] ?? null; // the room below, else the one above
    roomSession().remove(room.id);
    setConfirming(null);
    setFocusTarget({ key: next ? `open:${next.id}` : 'new' });
  }

  return (
    <>
      <button onClick={() => dialogRef.current?.showModal()} className={buttonClass}>
        My rooms
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="rooms-title"
        onClose={() => setConfirming(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) close(); // a click on the backdrop: the content fills the dialog box itself
        }}
        className="m-auto max-h-[85vh] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900 p-0 text-neutral-100 backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="rooms-title" className="text-lg font-semibold">
              My rooms
            </h2>
            <button onClick={close} className={smallButton}>
              Close
            </button>
          </div>
          <p className="text-sm text-neutral-400">Your rooms are kept in this browser only. Nothing is uploaded.</p>
          <Link href="/setup" data-focus="new" className={`${buttonClass} self-start`}>
            New room
          </Link>
          <ul className="flex flex-col gap-2">
            {rooms.map((room) => {
              const open = room.id === roomId;
              return (
                <li key={room.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 p-3">
                  <button
                    data-focus={`open:${room.id}`}
                    onClick={() => {
                      roomSession().open(room.id);
                      close();
                    }}
                    aria-current={open ? 'true' : undefined}
                    className="min-h-11 min-w-0 flex-1 text-left"
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
                          onClick={() => deleteForGood(room)}
                          aria-label={`Delete ${nameOf(room)} for good`}
                          className={`${smallButton} border-red-700 text-red-200`}
                        >
                          Delete for good
                        </button>
                        <button
                          data-focus={`keep:${room.id}`}
                          onClick={() => {
                            setConfirming(null);
                            setFocusTarget({ key: `delete:${room.id}` });
                          }}
                          aria-label={`Keep ${nameOf(room)}`}
                          className={smallButton}
                        >
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
                        <button
                          data-focus={`delete:${room.id}`}
                          onClick={() => {
                            setConfirming(room.id);
                            setFocusTarget({ key: `keep:${room.id}` });
                          }}
                          aria-label={`Delete ${nameOf(room)}`}
                          className={smallButton}
                        >
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
