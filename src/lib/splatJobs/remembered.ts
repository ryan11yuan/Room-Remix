/** The build each room is waiting for, kept in localStorage so a reload (or coming back to the room) picks it up again. */
const key = (roomId: string) => `room-remix:video-scan:${roomId}`;

export function rememberJob(roomId: string, jobId: string): void {
  try {
    localStorage.setItem(key(roomId), jobId);
  } catch {
    // not remembered: a reload loses track of this build, which still finishes on the laptop
  }
}

export function recallJob(roomId: string): string | null {
  try {
    return localStorage.getItem(key(roomId));
  } catch {
    return null;
  }
}

export function forgetJob(roomId: string): void {
  try {
    localStorage.removeItem(key(roomId));
  } catch {
    // nothing to forget
  }
}
