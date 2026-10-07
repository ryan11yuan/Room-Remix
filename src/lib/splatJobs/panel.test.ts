import { describe, expect, it } from 'vitest';
import { jobFraction, jobLine, uploadFailMessage } from './panel';
import type { JobView } from './protocol';

const job = (fields: Partial<JobView>): JobView => ({ id: 'j1', quality: 'quick', state: 'queued', ...fields });

describe('jobLine', () => {
  it('says where the build is, in the spec words', () => {
    expect(jobLine(job({ state: 'queued', place: 1 }))).toBe('Waiting for the room before yours');
    expect(jobLine(job({ state: 'queued', place: 2 }))).toBe('Waiting for the 2 rooms before yours');
    expect(jobLine(job({ state: 'queued', place: 0 }))).toBe('Starting…');
    expect(jobLine(job({ state: 'checking' }))).toBe('Checking the video');
    expect(jobLine(job({ state: 'frames' }))).toBe('Pulling frames');
    expect(jobLine(job({ state: 'cameras' }))).toBe('Finding camera positions');
    expect(jobLine(job({ state: 'training', progress: { done: 1200, total: 2000 } }))).toBe('Building your room, step 1,200 of 2,000');
    expect(jobLine(job({ state: 'training' }))).toBe('Building your room');
  });

  it('shows the error message of a failed build', () => {
    expect(jobLine(job({ state: 'failed', error: { code: 'training-failed', message: 'Building the room failed. Try Quick.' } }))).toBe(
      'Building the room failed. Try Quick.',
    );
  });
});

describe('jobFraction', () => {
  it('is the share done, clamped, or null where a step has no measure', () => {
    expect(jobFraction(job({ state: 'training', progress: { done: 500, total: 2000 } }))).toBe(0.25);
    expect(jobFraction(job({ state: 'cameras', progress: { done: 90, total: 80 } }))).toBe(1);
    expect(jobFraction(job({ state: 'frames' }))).toBeNull();
    expect(jobFraction(job({ state: 'training', progress: { done: 0, total: 0 } }))).toBeNull();
  });
});

describe('uploadFailMessage', () => {
  it('uses the spec words', () => {
    expect(uploadFailMessage('stopped')).toBe('The upload stopped. Try again with the screen on.');
    expect(uploadFailMessage('too-large')).toBe('This video is too large.');
    expect(uploadFailMessage('not-video')).toBe("This file isn't a video we can read.");
  });
});
