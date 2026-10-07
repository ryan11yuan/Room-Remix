/** Shared by the phone app and the demo server (spec 2026-10-06 §4-§7). No DOM or Node imports. */

export type Quality = 'quick' | 'best';
export const QUALITIES: readonly Quality[] = ['quick', 'best'];
export const isQuality = (value: unknown): value is Quality => value === 'quick' || value === 'best';

export type JobState = 'queued' | 'checking' | 'frames' | 'cameras' | 'training' | 'ready' | 'failed' | 'canceled';
export const isFinished = (state: JobState): boolean => state === 'ready' || state === 'failed' || state === 'canceled';

export type JobErrorCode = 'too-long' | 'not-video' | 'no-model' | 'training-failed' | 'step-failed' | 'restarted';

export type JobView = {
  id: string;
  quality: Quality;
  state: JobState;
  /** While queued: how many jobs are ahead of this one (1: the one building now). */
  place?: number;
  progress?: { done: number; total: number };
  error?: { code: JobErrorCode; message: string };
};

export type PipelineHealth = 'ready' | 'no-docker' | 'no-image';
export type Health = { pipeline: PipelineHealth };

export const MAX_VIDEO_BYTES = 1024 ** 3;
export const MAX_VIDEO_SECONDS = 120;

export const JOB_ERROR_MESSAGES: Record<JobErrorCode, string> = {
  'too-long': 'This video is too long. Keep it under 2 minutes.',
  'not-video': "This file isn't a video we can read.",
  'no-model': "Couldn't work out the room from this video. Walk around the room instead of turning on the spot, and keep furniture in view.",
  'training-failed': 'Building the room failed. Try Quick.',
  'step-failed': "Something went wrong on the laptop. Its log is in the job's folder.",
  restarted: 'The laptop restarted while building. Start again.',
};

/** A finished room on the laptop (spec 2026-10-07 §3). */
export type RoomSummary = { id: string; quality: Quality; createdAt: number };

/** One video frame's camera, as OpenSplat's --output-cameras writes it, in the splat's frame (spec 2026-10-07 §4). */
export type CameraPose = {
  id: number;
  img_name: string;
  width: number;
  height: number;
  fx: number;
  fy: number;
  position: [number, number, number];
  rotation: [[number, number, number], [number, number, number], [number, number, number]];
};

/** One object the detector saw in one frame; `box` is [x0, y0, x1, y1] in that image's pixels (spec 2026-10-07 sound §3.1). */
export type Detection = { label: string; score: number; box: [number, number, number, number] };
export type FrameDetections = { img_name: string; width: number; height: number; detections: Detection[] };
export type DetectionsFile = { frames: FrameDetections[] };

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The objects file as the server sends it; malformed frames and detections are dropped. Null unless it has a frames array. */
export function readDetections(data: unknown): DetectionsFile | null {
  const frames = (data as { frames?: unknown } | null)?.frames;
  if (!Array.isArray(frames)) return null;
  const out: FrameDetections[] = [];
  for (const f of frames as Partial<FrameDetections>[]) {
    if (!f || typeof f.img_name !== 'string' || !finite(f.width) || !finite(f.height) || !Array.isArray(f.detections)) continue;
    const detections = f.detections.filter(
      (d): d is Detection =>
        !!d && typeof d.label === 'string' && finite(d.score) && Array.isArray(d.box) && d.box.length === 4 && d.box.every(finite),
    );
    out.push({ img_name: f.img_name, width: f.width, height: f.height, detections });
  }
  return { frames: out };
}
