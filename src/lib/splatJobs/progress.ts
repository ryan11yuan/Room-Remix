import { MAX_VIDEO_SECONDS } from './protocol';
import type { StepName } from './settings';

export type ProbeResult = { ok: true; seconds: number } | { ok: false; code: 'not-video' | 'too-long' };

type Probe = { format?: { duration?: string }; streams?: { codec_type?: string; duration?: string }[] };

/** Reads `ffprobe -print_format json -show_format -show_streams` output. A photo has a video stream but no duration. */
export function readProbe(json: string, maxSeconds = MAX_VIDEO_SECONDS): ProbeResult {
  let data: Probe;
  try {
    data = JSON.parse(json) as Probe;
  } catch {
    return { ok: false, code: 'not-video' };
  }
  const video = data.streams?.find((s) => s.codec_type === 'video');
  if (!video) return { ok: false, code: 'not-video' };
  const seconds = Number(data.format?.duration ?? video.duration);
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, code: 'not-video' };
  if (seconds > maxSeconds) return { ok: false, code: 'too-long' };
  return { ok: true, seconds };
}

/**
 * Progress within a step, from one line of its output: OpenSplat prints "Step 1200: 0.03 [60%]" every 10 steps, and
 * COLMAP's mapper prints "Registering image #37 (12)", 12 being the number registered so far. Other steps have none.
 */
export function stepProgress(step: StepName, line: string, frames: number, steps: number): { done: number; total: number } | null {
  if (step === 'training') {
    const match = /^Step (\d+):/.exec(line.trim());
    return match ? { done: Math.min(Number(match[1]), steps), total: steps } : null;
  }
  if (step === 'mapper' && frames > 0) {
    const match = /Registering image #\d+ \((\d+)\)/.exec(line);
    return match ? { done: Math.min(Number(match[1]), frames), total: frames } : null;
  }
  return null;
}
