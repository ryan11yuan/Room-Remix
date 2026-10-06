import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PRESETS } from './presets';

describe('PRESETS', () => {
  it('offers the cathedral and the parking garage', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['cathedral', 'garage']);
  });

  it('points every preset at a file that ships with the site', () => {
    for (const preset of PRESETS) {
      expect(preset.file.startsWith('/ir/')).toBe(true);
      expect(existsSync(`public${preset.file}`)).toBe(true);
    }
  });

  it('credits every recording under a licence that allows commercial use', () => {
    for (const preset of PRESETS) {
      expect(preset.credit.text.length).toBeGreaterThan(10);
      expect(['CC BY 4.0', 'CC0 1.0']).toContain(preset.credit.licence);
      expect(preset.credit.licenceUrl.startsWith('https://creativecommons.org/')).toBe(true);
      expect(preset.credit.sourceUrl.startsWith('https://')).toBe(true);
    }
  });
});
