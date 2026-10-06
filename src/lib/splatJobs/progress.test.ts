import { describe, expect, it } from 'vitest';
import { readProbe, stepProgress } from './progress';

const probe = (format: object, streams: object[]) => JSON.stringify({ format, streams }, null, 2);

describe('readProbe', () => {
  it('accepts a video up to 2 minutes long', () => {
    expect(readProbe(probe({ duration: '59.500000' }, [{ codec_type: 'audio' }, { codec_type: 'video' }]))).toEqual({ ok: true, seconds: 59.5 });
    expect(readProbe(probe({ duration: '120.000000' }, [{ codec_type: 'video' }])).ok).toBe(true);
  });

  it('falls back to the video stream duration', () => {
    expect(readProbe(probe({}, [{ codec_type: 'video', duration: '12.0' }]))).toEqual({ ok: true, seconds: 12 });
  });

  it('refuses a video longer than 2 minutes', () => {
    expect(readProbe(probe({ duration: '120.5' }, [{ codec_type: 'video' }]))).toEqual({ ok: false, code: 'too-long' });
  });

  it('refuses audio only, a photo (no duration) and output that is not JSON', () => {
    expect(readProbe(probe({ duration: '30' }, [{ codec_type: 'audio' }]))).toEqual({ ok: false, code: 'not-video' });
    expect(readProbe(probe({}, [{ codec_type: 'video' }]))).toEqual({ ok: false, code: 'not-video' });
    expect(readProbe('/job/video.mp4: Invalid data found when processing input')).toEqual({ ok: false, code: 'not-video' });
  });
});

describe('stepProgress', () => {
  it('reads OpenSplat step lines against the step count', () => {
    expect(stepProgress('training', 'Step 1200: 0.0312 [60%]', 0, 2000)).toEqual({ done: 1200, total: 2000 });
    expect(stepProgress('training', 'Using CUDA', 0, 2000)).toBeNull();
  });

  it('reads COLMAP registered image counts against the frame count', () => {
    expect(stepProgress('mapper', 'Registering image #37 (12)', 80, 2000)).toEqual({ done: 12, total: 80 });
    expect(stepProgress('mapper', 'Registering image #37 (12)', 0, 2000)).toBeNull();
  });

  it('never reports more than the total', () => {
    expect(stepProgress('training', 'Step 2010: 0.01 [100%]', 0, 2000)).toEqual({ done: 2000, total: 2000 });
    expect(stepProgress('mapper', 'Registering image #90 (91)', 80, 2000)).toEqual({ done: 80, total: 80 });
  });

  it('has no progress for the other steps', () => {
    expect(stepProgress('features', 'Processed file [3/80]', 80, 2000)).toBeNull();
    expect(stepProgress('frames', 'frame=   12', 80, 2000)).toBeNull();
  });
});
