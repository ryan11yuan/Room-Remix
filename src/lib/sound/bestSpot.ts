import { absorptionArea, makeSurfaceLookup, type SurfaceLookup } from '@/lib/acoustics/absorption';
import { SPEED_OF_SOUND } from '@/lib/acoustics/bands';
import { computeImageSources } from '@/lib/acoustics/imageSource';
import { blockingBoxes, type Box } from '@/lib/acoustics/objects';
import { totalSurfaceArea } from '@/lib/acoustics/reverbTime';
import { predictRt60 } from '@/lib/acoustics/simulate';
import type { Dims, RoomObject, RoomState, Vec3 } from '@/lib/room/types';
import { SPEAKER_HEIGHT, SPEAKER_WALL_GAP } from './soundRoom';
import type { SpotMap } from './types';

export const SPEAKER_STEP = 0.4;
export const LISTENER_STEP = 0.6;
export const EAR_HEIGHT = 1.2; // seated
export const LISTENER_WALL_GAP = 0.5;
export const MIN_LISTENER_DISTANCE = 1;
export const FOOTPRINT_GROW = 0.2;
export const SPOT_ORDER = 2;
/** Spec 2026-10-07 sound §6; retune on the real room if the best spot isn't believable. */
export const WEIGHTS = { coverage: 0.4, clarity: 0.35, bass: 0.25 };
const EARLY_SECONDS = 0.05; // C50
const BASS_FROM = 30;
const BASS_TO = 150;
const BASS_STEPS_PER_OCTAVE = 12;
const MAX_MODE_HZ = 200;

type Mode = { l: number; m: number; n: number; omega2: number; average: number };
type Context = {
  dims: Dims;
  lookup: SurfaceLookup;
  blockers: Box[];
  eRev: number;
  lateFraction: number;
  modes: Mode[];
  omegas: number[];
  delta: number;
  listeners: Vec3[];
  objects: RoomObject[];
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const std = (v: number[]) => {
  const m = mean(v);
  return Math.sqrt(mean(v.map((x) => (x - m) ** 2)));
};

function gridAxis(size: number, gap: number, step: number): number[] {
  if (size < 2 * gap) return [size / 2];
  const out: number[] = [];
  for (let v = gap; v <= size - gap + 1e-9; v += step) out.push(v);
  return out;
}

/** On something you can't stand or put a speaker on (rugs don't count). */
function onFootprint(objects: RoomObject[], x: number, z: number, grow: number): boolean {
  return objects.some(
    (o) => o.label !== 'rug' && x >= o.min.x - grow && x <= o.max.x + grow && z >= o.min.z - grow && z <= o.max.z + grow,
  );
}

function roomModes(dims: Dims): Mode[] {
  const modes: Mode[] = [];
  const c = SPEED_OF_SOUND;
  const max = (size: number) => Math.floor((2 * MAX_MODE_HZ * size) / c);
  for (let l = 0; l <= max(dims.length); l++)
    for (let m = 0; m <= max(dims.height); m++)
      for (let n = 0; n <= max(dims.width); n++) {
        if (l + m + n === 0) continue;
        const f = (c / 2) * Math.hypot(l / dims.length, m / dims.height, n / dims.width);
        if (f > MAX_MODE_HZ) continue;
        const nonZero = Number(l > 0) + Number(m > 0) + Number(n > 0);
        modes.push({ l, m, n, omega2: (2 * Math.PI * f) ** 2, average: 0.5 ** nonZero });
      }
  return modes;
}

const shape = (mode: Mode, dims: Dims, p: Vec3) =>
  Math.cos((mode.l * Math.PI * p.x) / dims.length) * Math.cos((mode.m * Math.PI * p.y) / dims.height) * Math.cos((mode.n * Math.PI * p.z) / dims.width);

function context(room: RoomState): Context {
  const { dims } = room;
  const objects = room.objects ?? [];
  const rt = predictRt60(room).bands;
  const area = absorptionArea(room);
  const aMid = (area[2] + area[3]) / 2;
  const alphaMid = Math.min(aMid / totalSurfaceArea(dims), 0.99);
  const roomConstant = aMid / (1 - alphaMid);
  const rtMid = (rt[2] + rt[3]) / 2;
  const omegas: number[] = [];
  for (let k = 0; BASS_FROM * 2 ** (k / BASS_STEPS_PER_OCTAVE) <= BASS_TO; k++) omegas.push(2 * Math.PI * BASS_FROM * 2 ** (k / BASS_STEPS_PER_OCTAVE));
  const listeners: Vec3[] = [];
  const y = Math.min(EAR_HEIGHT, dims.height - LISTENER_WALL_GAP);
  for (const z of gridAxis(dims.width, LISTENER_WALL_GAP, LISTENER_STEP))
    for (const x of gridAxis(dims.length, LISTENER_WALL_GAP, LISTENER_STEP)) if (!onFootprint(objects, x, z, 0)) listeners.push({ x, y, z });
  return {
    dims,
    lookup: makeSurfaceLookup(room),
    blockers: blockingBoxes(objects),
    eRev: (16 * Math.PI) / roomConstant, // reverberant energy in the image model's units (gain² = 1/r²)
    lateFraction: Math.exp((-13.82 * EARLY_SECONDS) / rtMid),
    modes: roomModes(dims),
    omegas,
    delta: 6.91 / rt[0],
    listeners,
    objects,
  };
}

/** dB spread across 30–150 Hz of the modal response between two points. */
function bassSpread(ctx: Context, shapesS: number[], r: Vec3): number {
  const shapesR = ctx.modes.map((mode) => shape(mode, ctx.dims, r));
  const levels = ctx.omegas.map((w) => {
    let re = 0;
    let im = 0;
    ctx.modes.forEach((mode, i) => {
      const a = mode.omega2 - w * w;
      const b = 2 * ctx.delta * w;
      const k = (shapesS[i] * shapesR[i]) / (a * a + b * b);
      re += k * a;
      im -= k * b;
    });
    return 10 * Math.log10(re * re + im * im + 1e-30);
  });
  return std(levels);
}

export type SpotBreakdown = { coverage: number; clarity: number; bass: number; boost: number; score: number };

function breakdown(ctx: Context, s: Vec3): SpotBreakdown | null {
  const listeners = ctx.listeners.filter((r) => Math.hypot(r.x - s.x, r.y - s.y, r.z - s.z) >= MIN_LISTENER_DISTANCE);
  if (listeners.length < 2) return null;
  const shapesS = ctx.modes.map((mode) => shape(mode, ctx.dims, s));
  const boost = 10 * Math.log10(shapesS.reduce((sum, v) => sum + v * v, 0) / ctx.modes.reduce((sum, m) => sum + m.average, 0));
  const levels: number[] = [];
  const clarity: number[] = [];
  const spreads: number[] = [];
  for (const r of listeners) {
    const arrivals = computeImageSources({ dims: ctx.dims, source: s, listener: r, maxOrder: SPOT_ORDER, lookup: ctx.lookup, blockers: ctx.blockers });
    const direct = Math.hypot(r.x - s.x, r.y - s.y, r.z - s.z) / SPEED_OF_SOUND;
    let early = 0;
    let total = 0;
    for (const a of arrivals) {
      const e = (a.gains[2] ** 2 + a.gains[3] ** 2) / 2;
      total += e;
      if (a.delay <= direct + EARLY_SECONDS) early += e;
    }
    levels.push(10 * Math.log10(total + ctx.eRev));
    clarity.push(10 * Math.log10(early / (ctx.eRev * ctx.lateFraction)));
    spreads.push(bassSpread(ctx, shapesS, r));
  }
  const coverage = clamp01(1 - std(levels) / 6);
  const clear = clamp01((mean(clarity) + 5) / 10);
  const bass = clamp01((12 - mean(spreads) - Math.max(0, boost)) / 9);
  return { coverage, clarity: clear, bass, boost, score: 100 * (WEIGHTS.coverage * coverage + WEIGHTS.clarity * clear + WEIGHTS.bass * bass) };
}

export function scoreSpeakerAt(room: RoomState, speaker: Vec3): number | null {
  return breakdown(context(room), speaker)?.score ?? null;
}

/** Sub-scores for one spot (diagnostics and tuning). */
export function breakdownAt(room: RoomState, speaker: Vec3): SpotBreakdown | null {
  return breakdown(context(room), speaker);
}

/** Every speaker spot on a 0.4 m floor grid, scored for everyone in the room (spec §6). */
export function findBestSpots(room: RoomState): SpotMap {
  const ctx = context(room);
  const xs = gridAxis(room.dims.length, SPEAKER_WALL_GAP, SPEAKER_STEP);
  const zs = gridAxis(room.dims.width, SPEAKER_WALL_GAP, SPEAKER_STEP);
  const y = Math.min(SPEAKER_HEIGHT, room.dims.height - SPEAKER_WALL_GAP);
  const scores: (number | null)[] = [];
  let best: SpotMap['best'] = null;
  for (const z of zs)
    for (const x of xs) {
      const score = onFootprint(ctx.objects, x, z, FOOTPRINT_GROW) ? null : breakdown(ctx, { x, y, z })?.score ?? null;
      scores.push(score);
      if (score !== null && (!best || score > best.score)) best = { x, z, score };
    }
  return { x0: xs[0], z0: zs[0], step: SPEAKER_STEP, nx: xs.length, nz: zs.length, scores, best };
}
