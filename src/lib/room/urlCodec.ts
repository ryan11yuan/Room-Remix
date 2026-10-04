import { validateRoom } from './roomState';
import {
  MATERIAL_IDS,
  SURFACE_IDS,
  WALL_IDS,
  type Fix,
  type Furnishing,
  type MaterialId,
  type RoomState,
  type RugSize,
  type SurfaceId,
  type Vec3,
  type WallId,
} from './types';

const PREFIX = 'v1.';
const MAX_CODE_LENGTH = 4096; // a real room encodes to well under 1 000 characters
const MAX_JSON_BYTES = 16 * 1024; // a real room is about 1.3 KB of JSON

export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return PREFIX + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export const encodeRoom = (room: RoomState) => encodePayload(room);

export async function decodeRoom(code: string): Promise<RoomState | null> {
  if (!code.startsWith(PREFIX) || code.length > MAX_CODE_LENGTH) return null;
  try {
    const bytes = await inflateCapped(fromBase64Url(code.slice(PREFIX.length)), MAX_JSON_BYTES);
    if (!bytes) return null;
    return migrate(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

export function migrate(raw: unknown): RoomState | null {
  if (!isRecord(raw) || raw.v !== 1 || typeof raw.name !== 'string') return null;

  const dims = isRecord(raw.dims)
    ? { length: num(raw.dims.length), width: num(raw.dims.width), height: num(raw.dims.height) }
    : null;
  if (!dims || dims.length === null || dims.width === null || dims.height === null) return null;

  if (!isRecord(raw.surfaces)) return null;
  const surfaces = {} as Record<SurfaceId, MaterialId>;
  for (const s of SURFACE_IDS) {
    const m = raw.surfaces[s];
    if (!oneOf(MATERIAL_IDS, m)) return null;
    surfaces[s] = m;
  }

  if (!oneOf(['bare', 'some', 'full'] as const, raw.furnishing)) return null;
  const furnishing: Furnishing = raw.furnishing;

  const speaker = vec(raw.speaker);
  const listenerPos = vec(raw.listener);
  if (!speaker || !listenerPos || !isRecord(raw.listener)) return null;
  const yaw = raw.listener.yaw === 'faceSpeaker' ? 'faceSpeaker' : num(raw.listener.yaw);
  if (yaw === null) return null;

  if (!Array.isArray(raw.fixes)) return null;
  const fixes = raw.fixes.map(fix);
  if (fixes.some((f) => f === null)) return null;

  if (!isRecord(raw.calibration)) return null;
  const factor = num(raw.calibration.factor);
  if (factor === null || factor <= 0) return null;
  const measured = raw.calibration.measuredRt60 === undefined ? undefined : num(raw.calibration.measuredRt60);
  if (measured === null) return null;

  const room: RoomState = {
    v: 1,
    name: raw.name.slice(0, 80),
    dims: { length: dims.length, width: dims.width, height: dims.height },
    surfaces,
    furnishing,
    speaker,
    listener: { ...listenerPos, yaw },
    fixes: fixes as Fix[],
    calibration: measured === undefined ? { factor } : { factor, measuredRt60: measured },
  };
  return validateRoom(room).length === 0 ? room : null;
}

function fix(raw: unknown): Fix | null {
  if (!isRecord(raw) || typeof raw.on !== 'boolean') return null;
  if (raw.kind === 'rug') {
    const x = num(raw.x);
    const z = num(raw.z);
    if (x === null || z === null || !oneOf(['S', 'M', 'L'] as const, raw.size)) return null;
    return { kind: 'rug', size: raw.size as RugSize, x, z, on: raw.on };
  }
  if (raw.kind === 'panel') {
    const u = num(raw.u);
    const v = num(raw.v);
    if (u === null || v === null || !oneOf(WALL_IDS, raw.wall)) return null;
    return { kind: 'panel', wall: raw.wall as WallId, u, v, on: raw.on };
  }
  return null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const oneOf = <T extends string>(options: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (options as readonly string[]).includes(v);

function vec(raw: unknown): Vec3 | null {
  if (!isRecord(raw)) return null;
  const x = num(raw.x);
  const y = num(raw.y);
  const z = num(raw.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

/** Inflates, giving up as soon as the output passes `limit` bytes so a tiny link can't expand into a huge payload. */
async function inflateCapped(bytes: Uint8Array<ArrayBuffer>, limit: number): Promise<Uint8Array | null> {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
