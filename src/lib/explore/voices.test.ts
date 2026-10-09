import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeWav } from '@/lib/audio/wav';
import { CLIPS } from './names';

const VOICES = fileURLToPath(new URL('../../../public/voices/', import.meta.url));

describe('voice clips', () => {
  it('has a short, audible clip for every name, plural and wall', () => {
    for (const id of CLIPS.keys()) {
      const file = `${VOICES}${id}.wav`;
      expect(existsSync(file), id).toBe(true);
      const { samples, sampleRate } = decodeWav(new Uint8Array(readFileSync(file)));
      const seconds = samples.length / sampleRate;
      expect(seconds, id).toBeGreaterThan(0.1);
      expect(seconds, id).toBeLessThan(2);
      expect(samples.reduce((m, s) => Math.max(m, Math.abs(s)), 0), id).toBeGreaterThan(0.05);
    }
  });
});
