import { describe, expect, it } from 'vitest';
import { DIAGRAM_H, DIAGRAM_W, surfaceDiagram, type DiagramShape, type Point } from './surfaceDiagram';
import { SURFACE_IDS, type Dims, type SurfaceId } from './types';

const ROOMS: Dims[] = [
  { length: 4, width: 3.5, height: 2.6 }, // the default room
  { length: 30, width: 1.5, height: 15 }, // deep, narrow and tall
  { length: 1.5, width: 30, height: 2 }, // shallow and very wide
  { length: 30, width: 30, height: 2 },
  { length: 1.5, width: 1.5, height: 15 },
  { length: Number.NaN, width: 0, height: -1 }, // mid-edit
];

const shape = (shapes: DiagramShape[], surface: SurfaceId) => shapes.find((s) => s.surface === surface)!;
const xs = (s: DiagramShape) => s.points.map((p) => p[0]);
const ys = (s: DiagramShape) => s.points.map((p) => p[1]);
const widthOf = (s: DiagramShape) => Math.max(...xs(s)) - Math.min(...xs(s));
const heightOf = (s: DiagramShape) => Math.max(...ys(s)) - Math.min(...ys(s));

/** Shoelace area of a polygon. */
function area(points: Point[]): number {
  let sum = 0;
  points.forEach(([x1, y1], i) => {
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  });
  return Math.abs(sum) / 2;
}

/** Whether a point is strictly inside a polygon (ray casting). */
function inside([x, y]: Point, points: Point[]): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

describe('surfaceDiagram', () => {
  it('draws each of the six surfaces once', () => {
    const surfaces = surfaceDiagram(ROOMS[0]).map((s) => s.surface);
    expect([...surfaces].sort()).toEqual([...SURFACE_IDS].sort());
  });

  it('stays inside the drawing for any room, even one mid-edit', () => {
    for (const dims of ROOMS) {
      for (const s of surfaceDiagram(dims)) {
        for (const [x, y] of s.points) {
          expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(DIAGRAM_W);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(DIAGRAM_H);
        }
      }
    }
  });

  it('puts each label inside its own surface and no other, so a tap lands on one surface', () => {
    for (const dims of ROOMS) {
      const shapes = surfaceDiagram(dims);
      for (const s of shapes) {
        expect(inside(s.label, s.points)).toBe(true);
        for (const other of shapes) if (other !== s) expect(inside(s.label, other.points)).toBe(false);
      }
    }
  });

  it('keeps every surface big enough to tap', () => {
    for (const dims of ROOMS) {
      for (const s of surfaceDiagram(dims)) {
        expect(Math.min(widthOf(s), heightOf(s))).toBeGreaterThanOrEqual(24);
        expect(area(s.points)).toBeGreaterThan(4000);
      }
    }
  });

  it("gives the front wall the room's width-to-height shape", () => {
    const front = shape(surfaceDiagram({ length: 4, width: 3.5, height: 2.6 }), 'wallX0');
    expect(widthOf(front) / heightOf(front)).toBeCloseTo(3.5 / 2.6, 9);
  });

  it('shows a deeper room with a smaller front wall', () => {
    const shallow = shape(surfaceDiagram({ length: 3, width: 3, height: 3 }), 'wallX0');
    const deep = shape(surfaceDiagram({ length: 6, width: 3, height: 3 }), 'wallX0');
    expect(widthOf(deep)).toBeLessThan(widthOf(shallow));
  });

  it('puts the left wall on the left and the right wall on the right, facing the front wall', () => {
    const shapes = surfaceDiagram(ROOMS[0]);
    expect(Math.max(...xs(shape(shapes, 'wallZ1')))).toBeLessThanOrEqual(Math.min(...xs(shape(shapes, 'wallX0'))) + 1e-9);
    expect(Math.min(...xs(shape(shapes, 'wallZ0')))).toBeGreaterThanOrEqual(Math.max(...xs(shape(shapes, 'wallX0'))) - 1e-9);
    expect(Math.min(...ys(shape(shapes, 'floor')))).toBeGreaterThanOrEqual(Math.min(...ys(shape(shapes, 'ceiling'))));
    expect(Math.min(...ys(shape(shapes, 'wallX1')))).toBeGreaterThan(Math.max(...ys(shape(shapes, 'floor')))); // the back wall's strip is below
  });
});
