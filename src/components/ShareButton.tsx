'use client';

import { useState } from 'react';
import { validateRoom } from '@/lib/room/roomState';
import { useRoomStore } from '@/lib/room/store';
import { encodeRoom } from '@/lib/room/urlCodec';

export function ShareButton() {
  const room = useRoomStore((s) => s.room);
  const [copied, setCopied] = useState(false);

  async function share() {
    const code = await encodeRoom(room);
    window.history.replaceState(null, '', `#${code}`);
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={() => void share()}
      disabled={validateRoom(room).length > 0}
      className="rounded-lg border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
    >
      {copied ? 'Link copied' : 'Share link'}
    </button>
  );
}
