'use client';

import { useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { encodeRoom } from '@/lib/room/urlCodec';

const LABELS = { idle: 'Share link', copied: 'Link copied', failed: 'Copy the link from the address bar' } as const;

export function ShareButton() {
  const room = useRoomStore((s) => s.room);
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function share() {
    const code = await encodeRoom(room);
    window.history.replaceState(null, '', `#${code}`);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
    setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <button
      onClick={() => void share()}
      disabled={validateRoom(room).length > 0}
      className="rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
    >
      {LABELS[status]}
    </button>
  );
}
