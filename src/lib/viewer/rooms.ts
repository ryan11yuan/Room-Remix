import type { RoomSummary } from '@/lib/splatJobs/protocol';

const ROOM_HASH = /^#room=([0-9a-f-]{8,64})$/i;

/** The room the viewer shows (`#room=<job id>`); null for anything else, so a hand-edited hash fetches nothing. */
export function roomFromHash(hash: string): string | null {
  return ROOM_HASH.exec(hash)?.[1] ?? null;
}

export const roomHash = (id: string) => `#room=${id}`;

/** "Oct 7, 2026, 12:38 AM · Best": when it was made (local time by default) and its quality. */
export function roomLabel(room: RoomSummary, format: { locale?: string; timeZone?: string } = {}): string {
  const when = new Date(room.createdAt).toLocaleString(format.locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: format.timeZone,
  });
  return `${when} · ${room.quality === 'best' ? 'Best' : 'Quick'}`;
}
