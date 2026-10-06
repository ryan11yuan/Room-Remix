import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('../', import.meta.url));
/**
 * Greys too dark for small text on the app's near-black background: below WCAG AA's 4.5:1. neutral-400 (about 7:1) is
 * the darkest grey for text. Dark text on a white button (neutral-950) is fine and isn't matched.
 */
const LOW_CONTRAST = /\btext-neutral-(?:500|600|700)\b/;

/** Every page and component source file under `dir`, tests left out. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('text contrast', () => {
  const files = ['app', 'components'].flatMap((dir) => sourceFiles(join(SRC, dir)));

  it('finds the pages and components to check', () => {
    expect(files.some((f) => f.endsWith('page.tsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('Player.tsx'))).toBe(true);
  });

  it('uses no grey darker than neutral-400 for text', () => {
    const offenders = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (LOW_CONTRAST.test(line) ? [`${relative(SRC, file)}:${i + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});
