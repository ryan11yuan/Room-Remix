/**
 * A room scan picked in the setup wizard, on its way to the room the wizard opens. A File can't travel in a share link,
 * so it waits here, in module state: that survives the client-side navigation to /room, not a reload (the visitor then
 * loads the scan again from the 3D view). It belongs to the wizard's link until the room page has opened that link as a
 * room, and to that room after.
 */
type Pending = { file: File; link: string; roomId: string | null };

let pending: Pending | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** The wizard is about to open its room through `link` (the share code, without '#'): carry `file` to it. Null clears it. */
export function setPendingScan(scan: { file: File; link: string } | null): void {
  pending = scan ? { ...scan, roomId: null } : null;
  changed();
}

/** The room page opened `link` as room `roomId`: a scan waiting for that link now waits for that room. */
export function assignPendingScan(link: string, roomId: string): void {
  if (!pending || pending.roomId !== null || pending.link !== link) return;
  pending = { ...pending, roomId };
  changed();
}

/** The room a scan is waiting to be loaded into, or null. */
export function pendingScanRoom(): string | null {
  return pending?.roomId ?? null;
}

/** The scan waiting for `roomId`, once: it is no longer pending afterwards. */
export function takePendingScan(roomId: string): File | null {
  if (!pending || pending.roomId !== roomId) return null;
  const { file } = pending;
  pending = null;
  changed();
  return file;
}

/**
 * Hand back a scan that was taken by a view that went away before it could load it (React's development double mount
 * disposes the first 3D view at once). A newer scan, if one is waiting, wins.
 */
export function returnPendingScan(roomId: string, file: File): void {
  if (pending) return;
  pending = { file, link: '', roomId };
  changed();
}

export function subscribePendingScan(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
