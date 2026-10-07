import { MAX_VIDEO_SECONDS } from './protocol';
import type { StepName } from './settings';

export type ProbeResult = { ok: true; seconds: number } | { ok: false; code: 'not-video' | 'too-long' };

type Probe = { format?: { duration?: string }; streams?: { codec_type?: string; duration?: string }[] };

/** Reads `ffprobe -print_format json -show_format -show_streams` output. A photo has a video stream but no duration. */
export function readProbe(json: string, maxSeconds = MAX_VIDEO_SECONDS): ProbeResult {
  let data: Probe;
  // Stray stderr (a Docker warning, an ffprobe note) may surround the JSON: parse from the first { to the last }.
  const start = json.indexOf('{');
  const end = json.lastIndexOf('}');
  if (start < 0 || end < start) return { ok: false, code: 'not-video' };
  try {
    data = JSON.parse(json.slice(start, end + 1)) as Probe;
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
 * COLMAP's mapper prints "Registering image #37 (12)", 12 being the number registered so far, and its feature extractor
 * and matcher print "[N/M]" counters. Other steps have none.
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
  if (step === 'features' || step === 'matching') {
    // COLMAP prints "Processed file [3/80]" while extracting features and "Matching image [12/80]" while matching.
    if (!line.includes(step === 'features' ? 'Processed file' : 'Matching image')) return null;
    const match = /\[(\d+)\/(\d+)\]/.exec(line);
    return match ? { done: Math.min(Number(match[1]), Number(match[2])), total: Number(match[2]) } : null;
  }
  return null;
}
