'use client';

import { useMemo, useState } from 'react';
import { Player } from '@/components/Player';
import { RoomForm } from '@/components/RoomForm';
import { RoomView } from '@/components/RoomView';
import { ShareButton } from '@/components/ShareButton';
import { useRoomSession } from '@/components/useRoomSession';
import { DEFAULT_SAMPLE_RATE, useSimulation } from '@/components/useSimulation';
import type { ListenMode } from '@/lib/audio/mix';
import { isSavable } from '@/lib/room/rooms';
import { useRoomStore } from '@/lib/room/store';

export default function RoomPage() {
  useRoomSession();
  const roomId = useRoomStore((s) => s.roomId);
  const notice = useRoomStore((s) => s.notice);
  const setNotice = useRoomStore((s) => s.setNotice);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      {/* Mounted and in the accessibility tree all the time, so a screen reader announces a notice when it appears. */}
      <div role="status" className="empty:sr-only">
        {notice && (
          <p className="flex items-start justify-between gap-3 rounded-lg border border-amber-700 p-3 text-sm text-amber-200">
            <span>{notice}</span>
            <button onClick={() => setNotice(null)} className="shrink-0 underline">
              Dismiss
            </button>
          </p>
        )}
      </div>
      {roomId ? <RoomWorkspace /> : <p className="text-neutral-400">Opening your room…</p>}
    </main>
  );
}

/** The open room: 3D view, player and form. Shown once the saved rooms have been read. */
function RoomWorkspace() {
  const room = useRoomStore((s) => s.room);
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const sim = useSimulation(room, sampleRate);
  const savable = useMemo(() => isSavable(room), [room]);

  return (
    <>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      <p role="status" className="text-sm text-amber-200 empty:sr-only">
        {savable ? '' : "Changes to this room aren't being saved until the problems listed below are fixed."}
      </p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:flex-1">
          <RoomView mode={mode} />
        </div>
        <div className="lg:w-80">
          <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
        </div>
      </div>
      <RoomForm />
    </>
  );
}
