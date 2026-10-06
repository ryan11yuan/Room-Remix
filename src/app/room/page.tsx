'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EditRoom } from '@/components/EditRoom';
import { Player } from '@/components/Player';
import { RoomCard } from '@/components/RoomCard';
import { RoomsMenu } from '@/components/RoomsMenu';
import { RoomView } from '@/components/RoomView';
import { ShareButton } from '@/components/ShareButton';
import { useRoomSession } from '@/components/useRoomSession';
import { DEFAULT_SAMPLE_RATE, useSimulation } from '@/components/useSimulation';
import { WhatIf } from '@/components/WhatIf';
import type { ListenMode } from '@/lib/audio/mix';
import { useRoomStore } from '@/lib/room/store';
import type { RoomState } from '@/lib/room/types';

export default function RoomPage() {
  useRoomSession();
  const roomId = useRoomStore((s) => s.roomId);
  const notice = useRoomStore((s) => s.notice);
  const setNotice = useRoomStore((s) => s.setNotice);

  return (
    // Below lg the player's control bar is fixed to the bottom of the screen: pb-48 keeps the page's end clear of it.
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-48 lg:pb-6">
      {/* Mounted and in the accessibility tree all the time, so a screen reader announces a notice when it appears. */}
      <div role="status" className="empty:sr-only">
        {notice && (
          <p className="flex items-start justify-between gap-3 rounded-lg border border-amber-700 p-3 text-sm text-amber-200">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="min-h-11 shrink-0 px-2 underline">
              Dismiss
            </button>
          </p>
        )}
      </div>
      {roomId ? <RoomWorkspace /> : <p className="text-neutral-400">Opening your room…</p>}
      <footer className="text-xs text-neutral-400">
        <Link href="/about" className="inline-flex min-h-11 items-center underline">
          About and privacy
        </Link>
      </footer>
    </main>
  );
}

/** The open room: 3D view, then the player column (song, controls, sound, What if…, Edit room). Shown once the saved rooms have been read. */
function RoomWorkspace() {
  const room = useRoomStore((s) => s.room);
  const update = useRoomStore((s) => s.update);
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  // The simulation hears the room, not its name: renaming keeps the same object, so it isn't re-run.
  const { v, dims, surfaces, furnishing, speaker, listener, fixes, calibration } = room;
  const acoustic = useMemo<RoomState>(
    () => ({ v, name: '', dims, surfaces, furnishing, speaker, listener, fixes, calibration }), // every field but the name: TypeScript checks it
    [v, dims, surfaces, furnishing, speaker, listener, fixes, calibration],
  );
  const sim = useSimulation(acoustic, sampleRate);

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="sr-only">Your room</h1>
        <input
          aria-label="Room name"
          value={room.name}
          maxLength={80}
          placeholder="Untitled room"
          onChange={(e) => update((r) => ({ ...r, name: e.target.value }))}
          className="min-h-11 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 text-2xl font-bold hover:border-neutral-700 focus:border-neutral-500"
        />
        <div className="flex gap-2">
          <RoomsMenu />
          <ShareButton />
        </div>
      </header>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:flex-1">
          <RoomView mode={mode} />
        </div>
        <div className="flex flex-col gap-6 lg:w-96">
          <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
          <RoomCard />
          <WhatIf />
          <EditRoom />
        </div>
      </div>
    </>
  );
}
