import { fadeTail, highPass } from './dsp';
import { normalizeLoudness } from './loudness';
import { SPEAKER_LOW_CUT_HZ, TAIL_FADE_SECONDS, type StereoIr } from './simulate';

export { TAIL_FADE_SECONDS };
/** Recorded spaces ring far longer than a room; this much is kept. Long tails cost phones a lot to convolve. */
export const PRESET_MAX_SECONDS = 6;
const ONSET_LEVEL = 0.02; // the sound starts where a channel first reaches this fraction of the peak
const LEAD_SECONDS = 0.001; // kept before the onset, so its rise isn't cut

/**
 * Make a recorded impulse response fit the player, as simulated rooms already do: no silence before the sound, at most
 * `maxSeconds` long (faded if cut), the same 40 Hz speaker roll-off, and loudness-matched to dry. Returns new arrays.
 */
export function prepareIr(ir: StereoIr, maxSeconds = PRESET_MAX_SECONDS): StereoIr {
  const { sampleRate } = ir;
  const total = Math.min(ir.left.length, ir.right.length);
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(ir.left[i]), Math.abs(ir.right[i]));
  if (!(peak > 0)) throw new Error('This recording is silent.');
  let onset = 0;
  while (Math.abs(ir.left[onset]) < peak * ONSET_LEVEL && Math.abs(ir.right[onset]) < peak * ONSET_LEVEL) onset++;
  const start = Math.max(0, onset - Math.round(LEAD_SECONDS * sampleRate));
  const end = Math.min(total, start + Math.round(maxSeconds * sampleRate));
  const left = ir.left.slice(start, end);
  const right = ir.right.slice(start, end);
  highPass(left, sampleRate, SPEAKER_LOW_CUT_HZ);
  highPass(right, sampleRate, SPEAKER_LOW_CUT_HZ);
  if (end < total) {
    fadeTail(left, sampleRate, TAIL_FADE_SECONDS);
    fadeTail(right, sampleRate, TAIL_FADE_SECONDS);
  }
  return normalizeLoudness({ left, right, sampleRate });
}
