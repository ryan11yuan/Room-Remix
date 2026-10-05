import type { RayPath } from '@/lib/acoustics/rays';

export type RayBuffers = {
  positions: Float32Array; // 2 vertices per leg
  arc: Float32Array; // metres travelled from the speaker, per vertex
  energy: Float32Array; // energy left on the leg, per vertex
  strength: Float32Array; // path strength relative to the strongest, 0..1, per vertex
  maxArc: number; // longest path, metres
};

const RANGE_DB = 30;

export function buildRayBuffers(paths: RayPath[]): RayBuffers {
  const legs = paths.reduce((n, p) => n + p.points.length - 1, 0);
  const positions = new Float32Array(legs * 6);
  const arc = new Float32Array(legs * 2);
  const energy = new Float32Array(legs * 2);
  const strength = new Float32Array(legs * 2);
  const strongest = paths.reduce((m, p) => Math.max(m, p.energy), 0);

  let leg = 0;
  let maxArc = 0;
  for (const path of paths) {
    const db = strongest > 0 && path.energy > 0 ? 10 * Math.log10(path.energy / strongest) : -Infinity;
    const relative = Math.min(1, Math.max(0, 1 + db / RANGE_DB));
    let travelled = 0;
    for (let i = 0; i < path.points.length - 1; i++) {
      const a = path.points[i];
      const b = path.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], leg * 6);
      arc[leg * 2] = travelled;
      arc[leg * 2 + 1] = travelled + length;
      energy[leg * 2] = energy[leg * 2 + 1] = path.vertexEnergy[i];
      strength[leg * 2] = strength[leg * 2 + 1] = relative;
      travelled += length;
      leg++;
    }
    maxArc = Math.max(maxArc, travelled);
  }
  return { positions, arc, energy, strength, maxArc };
}
