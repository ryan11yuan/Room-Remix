'use client';

import { roomCardFor } from '@/lib/room/roomCard';
import { useRoomStore } from '@/lib/room/store';

/** "Your room's sound": the reverb time now and with fixes, the rating, the target, and a measurement if there is one. */
export function RoomCard() {
  const room = useRoomStore((s) => s.room);
  const card = roomCardFor(room);
  return (
    <section aria-labelledby="sound-heading" className="flex flex-col gap-1 rounded-xl border border-neutral-800 p-4 text-sm">
      <h2 id="sound-heading" className="mb-1 text-lg font-semibold">
        Your room&apos;s sound
      </h2>
      {card ? (
        <>
          <p className="text-base font-semibold">{card.rating}</p>
          <p>{card.now}</p>
          {card.withFixes && <p>{card.withFixes}</p>}
          {card.measured && <p>{card.measured}</p>}
          <p className="text-neutral-400">{card.target}</p>
          {!card.withFixes && (
            <p className="text-neutral-400">
              {room.fixes.length === 0 ? 'Add a rug or a panel below to compare.' : 'Switch a fix on to compare.'}
            </p>
          )}
        </>
      ) : (
        <p className="text-neutral-400">Fix the room under Edit room to see how it sounds.</p>
      )}
    </section>
  );
}
