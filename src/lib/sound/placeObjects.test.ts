import { describe, expect, it } from 'vitest';
import type { CameraPose, DetectionsFile } from '@/lib/splatJobs/protocol';
import { placeObjects, project } from './placeObjects';

const camera = (name: string, x: number): CameraPose => ({
  id: 0, img_name: name, width: 1000, height: 1000, fx: 500, fy: 500, position: [x, 0, 0],
  rotation: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], // right +x, down +y, forward +z
});
/** A 1 m cube of points at z 4–5, and a wall behind it at z = 10. */
function scene(): Float32Array {
  const out: number[] = [];
  for (let x = -0.5; x <= 0.5001; x += 0.05) for (let y = -0.5; y <= 0.5001; y += 0.05) for (let z = 4; z <= 5.0001; z += 0.05) out.push(x, y, z);
  for (let x = -3; x <= 3.0001; x += 0.05) for (let y = -3; y <= 3.0001; y += 0.05) out.push(x, y, 10);
  return new Float32Array(out);
}
const identity = (x: number, y: number, z: number) => ({ x, y, z });
const file = (frames: [string, number, number, number, number, string, number][]): DetectionsFile => ({
  frames: frames.map(([img_name, x0, y0, x1, y1, label, score]) => ({ img_name, width: 1000, height: 1000, detections: [{ label, score, box: [x0, y0, x1, y1] }] })),
});

describe('project', () => {
  it('maps a point ahead to pixels and drops points behind', () => {
    expect(project(camera('a', 0), 0.5, 0, 4)).toEqual({ u: 562.5, v: 500, depth: 4 });
    expect(project(camera('a', 0), 0, 0, -1)).toBeNull();
  });
});

describe('placeObjects', () => {
  const cameras = [camera('0001.jpg', 0), camera('0002.jpg', 0.2)];
  it('finds the cube, not the wall behind it, from two frames', () => {
    const objects = placeObjects(
      file([['0001.jpg', 430, 430, 570, 570, 'chair', 0.5], ['0002.jpg', 408, 430, 548, 570, 'chair', 0.5]]),
      cameras, scene(), identity, 1,
    );
    expect(objects).toHaveLength(1);
    const [o] = objects;
    expect(o.label).toBe('chair');
    expect((o.min.x + o.max.x) / 2).toBeCloseTo(0, 0);
    expect((o.min.z + o.max.z) / 2).toBeGreaterThan(4.2);
    expect((o.min.z + o.max.z) / 2).toBeLessThan(4.8);
    expect(o.max.z).toBeLessThan(5.2); // the wall at z = 10 was left out
  });
  it('drops objects seen in only one frame, labels that are not names, and frames with no camera', () => {
    expect(placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    expect(placeObjects(file([['9999.jpg', 430, 430, 570, 570, 'chair', 0.5], ['9998.jpg', 430, 430, 570, 570, 'chair', 0.5]]), cameras, scene(), identity, 1)).toEqual([]);
    const desks = placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'desk', 0.5], ['0002.jpg', 408, 430, 548, 570, 'desk', 0.5]]), cameras, scene(), identity, 1);
    expect(desks).toEqual([]); // the server maps "desk" to "table"; placement only takes names
    const doors = placeObjects(file([['0001.jpg', 430, 430, 570, 570, 'door', 0.5], ['0002.jpg', 408, 430, 548, 570, 'door', 0.5]]), cameras, scene(), identity, 1);
    expect(doors.map((o) => o.label)).toEqual(['door']);
  });
});
