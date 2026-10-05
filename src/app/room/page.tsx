'use client';

import { useEffect, useState } from 'react';
import { Player } from '@/components/Player';
import { RoomForm } from '@/components/RoomForm';
import { RoomView } from '@/components/RoomView';
import { ShareButton } from '@/components/ShareButton';
import { DEFAULT_SAMPLE_RATE, useSimulation } from '@/components/useSimulation';
import type { ListenMode } from '@/lib/audio/mix';
import { useRoomStore } from '@/lib/room/store';
import { decodeRoom } from '@/lib/room/urlCodec';

export default function RoomPage() {
  const setRoom = useRoomStore((s) => s.setRoom);
  const room = useRoomStore((s) => s.room);
  const [sampleRate, setSampleRate] = useState(DEFAULT_SAMPLE_RATE);
  const [mode, setMode] = useState<ListenMode>({ room: true, fixes: false });
  const sim = useSimulation(room, sampleRate);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const code = window.location.hash.slice(1);
      if (!code) return;
      void decodeRoom(code).then((decoded) => {
        if (decoded) {
          setRoom(decoded);
          setNotice(null);
        } else {
          setNotice("This link couldn't be fully loaded.");
        }
      });
    };
    load();
    window.addEventListener('hashchange', load);
    return () => window.removeEventListener('hashchange', load);
  }, [setRoom]);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      {notice && <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">{notice}</p>}
      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 lg:flex-1">
          <RoomView mode={mode} />
        </div>
        <div className="lg:w-80">
          <Player sim={sim} mode={mode} onModeChange={setMode} onSampleRate={setSampleRate} />
        </div>
      </div>
      <RoomForm />
    </main>
  );
}
