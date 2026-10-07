import type { UploadFailure } from './client';
import type { JobView } from './protocol';

/** What the phone shows for a room's video scan (spec 2026-10-06 §6). */
export type VideoScanState =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'building'; job: JobView; offline: boolean }
  | { kind: 'downloading' }
  | { kind: 'failed'; message: string; retry?: boolean; tips?: boolean };

export const KEEP_SCREEN_ON = 'Keep your screen on until the upload finishes.';
export const LOST_CONTACT = 'Lost contact with the laptop. Trying again…';
export const GONE = 'This build is no longer on the laptop.';
export const NOT_RUNNING = "The laptop's scan builder isn't running.";
export const DOWNLOAD_FAILED = "Couldn't fetch the finished room from the laptop.";
const BUILD_FAILED = 'Building the room failed.';

/** How to film a video COLMAP can work out: it needs the camera to move, and things to track. */
export const FILMING_TIPS: readonly string[] = [
  "Walk slowly around the edge of the room with the camera pointed across the room, toward the middle. Don't stand in one spot and turn.",
  'Take about a minute for one lap, and keep the video under 2 minutes.',
  'Keep furniture and objects in view, not a blank wall, a whiteboard, the ceiling or the floor.',
  "Turn the lights on, and don't point the camera at bright windows.",
  "Hold the phone steady with both hands so the frames aren't blurry.",
];
export const POLL_MS = 2000;
export const OFFLINE_POLL_MS = 5000;

export function uploadFailMessage(reason: Exclude<UploadFailure, 'aborted'>): string {
  switch (reason) {
    case 'too-large':
      return 'This video is too large.';
    case 'not-video':
      return "This file isn't a video we can read.";
    case 'stopped':
      return 'The upload stopped. Try again with the screen on.';
  }
}

const count = (n: number) => n.toLocaleString('en-US');

/** The progress row's words for a build. */
export function jobLine(job: JobView): string {
  switch (job.state) {
    case 'queued':
      if (!job.place) return 'Starting…';
      return job.place === 1 ? 'Waiting for the room before yours' : `Waiting for the ${job.place} rooms before yours`;
    case 'checking':
      return 'Checking the video';
    case 'frames':
      return 'Pulling frames';
    case 'cameras':
      return 'Finding camera positions';
    case 'training':
      return job.progress ? `Building your room, step ${count(job.progress.done)} of ${count(job.progress.total)}` : 'Building your room';
    case 'ready':
      return 'Ready';
    case 'failed':
      return job.error?.message ?? BUILD_FAILED;
    case 'canceled':
      return 'Canceled';
  }
}

/** What to show for a failed build. A video COLMAP couldn't work out gets the filming tips with it. */
export function buildFailure(job: JobView): Extract<VideoScanState, { kind: 'failed' }> {
  const failure: Extract<VideoScanState, { kind: 'failed' }> = { kind: 'failed', message: job.error?.message ?? BUILD_FAILED };
  if (job.error?.code === 'no-model') failure.tips = true;
  return failure;
}

/** The progress bar's fill, 0..1, or null for a step with nothing to measure. */
export function jobFraction(job: JobView): number | null {
  if (!job.progress || job.progress.total <= 0) return null;
  return Math.min(1, Math.max(0, job.progress.done / job.progress.total));
}
