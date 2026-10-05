import type { RoomState } from '@/lib/room/types';
import { absorptionArea, makeSurfaceLookup } from './absorption';
import { NUM_BANDS, SPEED_OF_SOUND, type Bands } from './bands';
import { earResponse, listenerYaw } from './binaural';
import { diffuseBounceFactor, diffuseGains } from './diffuse';
import { applyBandMasks, bandMasks, bandNoise, highPass, nextPow2 } from './dsp';
import { computeImageSources, type Arrival } from './imageSource';
import { toRayPath, type RayPath } from './rays';
import { eyring, midRt60, roomVolume, totalSurfaceArea } from './reverbTime';

export const MAX_IR_SECONDS = 4;
export const IR_MAX_ORDER = 10;
export const MAX_PATHS = 200;
/** The modelled speaker's bass limit. It also removes the image model's coherent DC build-up. */
export const SPEAKER_LOW_CUT_HZ = 40;

const MAX_TRANSITION_SECONDS = 0.08;
const TAIL_FADE_SECONDS = 0.005;
const FILTER_PAD = 4096;
const NOISE_SEED = { left: 1, right: 2 };
const LN_1000 = 6.907755; // 60 dB decay in nepers

export type StereoIr = { left: Float32Array; right: Float32Array; sampleRate: number };
export type AcousticsResult = { ir: StereoIr; paths: RayPath[]; rt60: { bands: Bands; mid: number } };

export const withoutFixes = (room: RoomState): RoomState => ({ ...room, fixes: [] });

export function predictRt60(room: RoomState): { bands: Bands; mid: number } {
  const bands = eyring(roomVolume(room.dims), totalSurfaceArea(room.dims), absorptionArea(room));
  return { bands, mid: midRt60(bands) };
}

export function simulateBoth(room: RoomState, sampleRate: number) {
  return { now: simulateRoom(withoutFixes(room), sampleRate), withFixes: simulateRoom(room, sampleRate) };
}

export function simulateRoom(room: RoomState, sampleRate: number): AcousticsResult {
  const rt60 = predictRt60(room);
  const bounce = diffuseBounceFactor(room);
  const arrivals = computeImageSources({
    dims: room.dims,
    source: room.speaker,
    listener: room.listener,
    maxOrder: IR_MAX_ORDER,
    lookup: makeSurfaceLookup(room),
  });

  let transition = MAX_TRANSITION_SECONDS;
  for (const a of arrivals) if (a.order === IR_MAX_ORDER) transition = Math.min(transition, a.delay);
  // Scale gains without mutating the arrivals; a path never reflects more than 100 % (calibration < 1).
  const inEarly = arrivals.filter((a) => a.delay < transition);
  const early = inEarly.map((a) => ({ ...a, gains: diffuseGains(a, bounce) }));

  const seconds = Math.min(MAX_IR_SECONDS, transition + 1.5 * Math.max(...rt60.bands));
  const length = Math.ceil(seconds * sampleRate);
  const left = new Float32Array(length);
  const right = new Float32Array(length);

  renderEarly(early, listenerYaw(room.listener, room.speaker), transition, sampleRate, left, right);
  addTail(rt60.bands, roomVolume(room.dims), transition, sampleRate, left, right);
  highPass(left, sampleRate, SPEAKER_LOW_CUT_HZ);
  highPass(right, sampleRate, SPEAKER_LOW_CUT_HZ);

  const paths = inEarly
    .map((a) => toRayPath(a, bounce))
    .sort((p, q) => q.energy - p.energy)
    .slice(0, MAX_PATHS);

  return { ir: { left, right, sampleRate }, paths, rt60 };
}

function renderEarly(
  arrivals: Arrival[],
  yaw: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const span = Math.ceil((transition + 0.002) * sampleRate);
  const fftSize = nextPow2(span + 2 * FILTER_PAD);
  const bandsLeft = Array.from({ length: NUM_BANDS }, () => new Float64Array(fftSize));
  const bandsRight = Array.from({ length: NUM_BANDS }, () => new Float64Array(fftSize));

  for (const a of arrivals) {
    const ear = earResponse(a.direction, yaw);
    addImpulse(bandsLeft, (a.delay + ear.delayLeft) * sampleRate, a.gains, ear.gainLeft);
    addImpulse(bandsRight, (a.delay + ear.delayRight) * sampleRate, a.gains, ear.gainRight);
  }

  const masks = bandMasks(fftSize, sampleRate);
  const outLeft = applyBandMasks(bandsLeft, masks);
  const outRight = applyBandMasks(bandsRight, masks);
  const keep = Math.min(left.length, span + FILTER_PAD);
  for (let i = 0; i < keep; i++) {
    left[i] += outLeft[i];
    right[i] += outRight[i];
  }
}

function addImpulse(bands: Float64Array[], position: number, gains: Bands, earGains: Bands): void {
  const i0 = Math.floor(position);
  const frac = position - i0;
  for (let b = 0; b < NUM_BANDS; b++) {
    const v = gains[b] * earGains[b];
    bands[b][i0] += v * (1 - frac);
    bands[b][i0 + 1] += v * frac;
  }
}

function addTail(
  rt: Bands,
  volume: number,
  transition: number,
  sampleRate: number,
  left: Float32Array,
  right: Float32Array,
): void {
  const sigma0 = Math.sqrt((4 * Math.PI * SPEED_OF_SOUND) / (volume * sampleRate));
  const start = Math.floor(transition * sampleRate);
  const fade = Math.max(1, Math.round(TAIL_FADE_SECONDS * sampleRate));
  const noiseLength = Math.ceil(MAX_IR_SECONDS * sampleRate);

  for (const [out, seed] of [
    [left, NOISE_SEED.left],
    [right, NOISE_SEED.right],
  ] as const) {
    const noise = bandNoise(noiseLength, sampleRate, seed);
    for (let b = 0; b < NUM_BANDS; b++) {
      const decay = Math.exp(-LN_1000 / (rt[b] * sampleRate));
      let envelope = sigma0 * Math.exp((-LN_1000 * start) / (rt[b] * sampleRate));
      const band = noise[b];
      for (let i = start; i < out.length; i++) {
        const ramp = i - start < fade ? 0.5 * (1 - Math.cos((Math.PI * (i - start)) / fade)) : 1;
        out[i] += band[i] * envelope * ramp;
        envelope *= decay;
      }
    }
  }
}
