'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { hasRoomsFile, ROOMS_KEY } from '@/lib/room/rooms';
import { browserStorage } from './browserStorage';

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ROOMS_KEY || event.key === null) listener(); // another tab saved (or cleared) rooms
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

const hasRooms = () => hasRoomsFile(browserStorage()) === true;

/** "My rooms", for a visitor who has rooms saved in this browser. Nothing while prerendering or without saved rooms. */
export function MyRoomsLink() {
  const show = useSyncExternalStore(subscribe, hasRooms, () => false);
  if (!show) return null;
  return (
    <Link href="/room" className="inline-flex min-h-11 items-center rounded-lg border border-neutral-700 px-5 font-semibold">
      My rooms
    </Link>
  );
}
