'use client';

import { useEffect, useState } from 'react';
import { Player } from '@/components/Player';
import { RoomForm } from '@/components/RoomForm';
import { ShareButton } from '@/components/ShareButton';
import { useRoomStore } from '@/lib/room/store';
import { decodeRoom } from '@/lib/room/urlCodec';

export default function RoomPage() {
  const setRoom = useRoomStore((s) => s.setRoom);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      const code = window.location.hash.slice(1);
      if (!code) return;
      void decodeRoom(code).then((room) => {
        if (room) {
          setRoom(room);
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
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your room</h1>
        <ShareButton />
      </header>
      {notice && <p className="rounded-lg border border-amber-700 p-3 text-sm text-amber-200">{notice}</p>}
      <div className="flex flex-col gap-8 md:flex-row">
        <div className="md:flex-1">
          <RoomForm />
        </div>
        <div className="md:w-80">
          <div className="md:sticky md:top-6">
            <Player />
          </div>
        </div>
      </div>
    </main>
  );
}
