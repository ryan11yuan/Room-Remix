import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Detection } from '@/lib/splatJobs/protocol';
import { cleanDetections, createObjectFinder, DETECTIONS_FILE, FRAME_COUNT, pickFrames, type DetectFrame } from './detect';

describe('pickFrames', () => {
  it('spreads the picks evenly, first and last included, in numeric order', () => {
    const names = Array.from({ length: 102 }, (_, i) => `${String(i + 1).padStart(4, '0')}.jpg`).reverse();
    const picked = pickFrames(names, 12);
    expect(picked).toHaveLength(12);
    expect(picked[0]).toBe('0001.jpg');
    expect(picked[11]).toBe('0102.jpg');
    expect([...picked].sort()).toEqual(picked);
  });
  it('keeps every image when there are fewer than asked, and ignores other files', () => {
    expect(pickFrames(['2.jpg', 'notes.txt', '10.jpg', '1.jpg'], 12)).toEqual(['1.jpg', '2.jpg', '10.jpg']);
  });
  it('picks 24 frames by default', () => {
    const names = Array.from({ length: 200 }, (_, i) => `${String(i + 1).padStart(4, '0')}.jpg`);
    expect(FRAME_COUNT).toBe(24);
    expect(pickFrames(names)).toHaveLength(24);
  });
});

describe('cleanDetections', () => {
  const d = (label: string, score: number, box: Detection['box']): Detection => ({ label, score, box });
  it('maps prompts to names, keeps one name per box, applies thresholds and class-agnostic NMS', () => {
    const out = cleanDetections([
      d('desk', 0.5, [0, 0, 100, 100]),
      d('bed', 0.35, [0, 0, 100, 100]), // same box, lower score: dropped
      d('chair', 0.4, [5, 5, 100, 100]), // overlaps the table box: NMS drops it
      d('chair', 0.25, [300, 300, 400, 400]), // under 0.3: dropped
      d('whiteboard', 0.18, [500, 0, 700, 200]), // whiteboard's threshold is 0.15: kept
      d('doorway', 0.4, [800, 0, 900, 300]), // found as a door
      d('lamp', 0.9, [0, 500, 50, 600]), // not a prompt: dropped
    ]);
    expect(out).toEqual([d('table', 0.5, [0, 0, 100, 100]), d('door', 0.4, [800, 0, 900, 300]), d('whiteboard', 0.18, [500, 0, 700, 200])]);
  });
});

describe('cleanDetections containment', () => {
  const d = (label: string, score: number, box: Detection['box']): Detection => ({ label, score, box });
  it('drops a box mostly inside a better one of the same group only', () => {
    expect(cleanDetections([d('table', 0.5, [0, 0, 200, 100]), d('table', 0.35, [10, 10, 100, 90])])).toEqual([d('table', 0.5, [0, 0, 200, 100])]);
    expect(cleanDetections([d('television', 0.5, [0, 0, 100, 100]), d('whiteboard', 0.2, [5, 5, 95, 95])])).toEqual([d('tv', 0.5, [0, 0, 100, 100])]);
    expect(cleanDetections([d('table', 0.5, [0, 0, 200, 100]), d('chair', 0.4, [10, 10, 100, 90])])).toHaveLength(2);
  });
});

describe('createObjectFinder', () => {
  it('detects once, shares a concurrent run, saves detections.json and reads it afterwards', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    for (const name of ['0001.jpg', '0002.jpg', '0003.jpg']) await writeFile(path.join(dir, 'images', name), '');
    let calls = 0;
    const detectFrame: DetectFrame = async () => {
      calls++;
      return { width: 1600, height: 900, detections: [{ label: 'chair', score: 0.5, box: [1, 2, 3, 4] }] };
    };
    const find = createObjectFinder(detectFrame);
    const [a, b] = await Promise.all([find(dir), find(dir)]);
    expect(calls).toBe(3);
    expect(a).toEqual(b);
    expect(a.frames.map((f) => f.img_name)).toEqual(['0001.jpg', '0002.jpg', '0003.jpg']);
    expect(JSON.parse(await readFile(path.join(dir, DETECTIONS_FILE), 'utf8'))).toEqual(a);
    await find(dir);
    expect(calls).toBe(3);
  });
  it('a failed run rejects and the next call tries again', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    await writeFile(path.join(dir, 'images', '0001.jpg'), '');
    let fail = true;
    const find = createObjectFinder(async () => {
      if (fail) throw new Error('model broke');
      return { width: 10, height: 10, detections: [] };
    });
    await expect(find(dir)).rejects.toThrow('model broke');
    fail = false;
    await expect(find(dir)).resolves.toEqual({ frames: [{ img_name: '0001.jpg', width: 10, height: 10, detections: [] }] });
  });
  it('ignores a detections.json saved under the old furniture labels', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'rr-detect-'));
    await mkdir(path.join(dir, 'images'));
    await writeFile(path.join(dir, 'images', '0001.jpg'), '');
    await writeFile(path.join(dir, 'detections.json'), JSON.stringify({ frames: [] }));
    let calls = 0;
    const find = createObjectFinder(async () => {
      calls++;
      return { width: 10, height: 10, detections: [] };
    });
    await find(dir);
    expect(calls).toBe(1);
    expect(DETECTIONS_FILE).toBe('detections-v2.json');
    expect(JSON.parse(await readFile(path.join(dir, 'detections-v2.json'), 'utf8')).frames).toHaveLength(1);
  });
});
