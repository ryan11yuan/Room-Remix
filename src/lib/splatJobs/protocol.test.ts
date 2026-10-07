import { describe, expect, it } from 'vitest';
import { isFinished, isQuality, JOB_ERROR_MESSAGES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from './protocol';

describe('protocol', () => {
  it('knows which job states are final', () => {
    expect(['ready', 'failed', 'canceled'].every((s) => isFinished(s as never))).toBe(true);
    expect(['queued', 'checking', 'frames', 'cameras', 'training'].some((s) => isFinished(s as never))).toBe(false);
  });

  it('accepts only the two qualities', () => {
    expect(isQuality('quick')).toBe(true);
    expect(isQuality('best')).toBe(true);
    expect(isQuality('fast')).toBe(false);
    expect(isQuality(null)).toBe(false);
  });

  it('uses the spec messages and limits', () => {
    expect(JOB_ERROR_MESSAGES['no-model']).toBe(
      "Couldn't work out the room from this video. Walk around the room instead of turning on the spot, and keep furniture in view.",
    );
    expect(JOB_ERROR_MESSAGES.restarted).toBe('The laptop restarted while building. Start again.');
    expect(JOB_ERROR_MESSAGES['too-long']).toBe('This video is too long. Keep it under 2 minutes.');
    expect(MAX_VIDEO_SECONDS).toBe(120);
    expect(MAX_VIDEO_BYTES).toBe(1024 ** 3);
  });
});
