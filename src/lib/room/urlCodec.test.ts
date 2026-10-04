import { describe, expect, it } from 'vitest';
import { defaultRoom } from './roomState';
import type { RoomState } from './types';
import { decodeRoom, encodePayload, encodeRoom } from './urlCodec';

describe('share-link codec', () => {
  it('round-trips a room through a URL-safe code', async () => {
    const room: RoomState = {
      ...defaultRoom(),
      fixes: [
        { kind: 'rug', size: 'M', x: 2, z: 1.75, on: true },
        { kind: 'panel', wall: 'wallZ1', u: 2, v: 1.2, on: false },
      ],
      calibration: { factor: 1.3, measuredRt60: 0.48 },
    };
    const code = await encodeRoom(room);
    expect(code).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(await decodeRoom(code)).toEqual(room);
  });

  it('keeps the default room link short', async () => {
    expect((await encodeRoom(defaultRoom())).length).toBeLessThan(600);
  });

  it('returns null for garbage instead of throwing', async () => {
    for (const code of ['', 'hello', 'v1.', 'v1.%%%', 'v1.AAAA']) {
      expect(await decodeRoom(code)).toBeNull();
    }
  });

  it('returns null for other versions', async () => {
    expect(await decodeRoom(await encodePayload({ ...defaultRoom(), v: 2 }))).toBeNull();
  });

  it('returns null for wrong types', async () => {
    const room = defaultRoom();
    expect(await decodeRoom(await encodePayload({ ...room, dims: { ...room.dims, length: 'abc' } }))).toBeNull();
    expect(await decodeRoom(await encodePayload({ ...room, surfaces: { ...room.surfaces, floor: 'lava' } }))).toBeNull();
    expect(await decodeRoom(await encodePayload({ ...room, fixes: [{ kind: 'sofa' }] }))).toBeNull();
  });

  it('returns null for rooms that fail validation', async () => {
    const room = defaultRoom();
    expect(await decodeRoom(await encodePayload({ ...room, dims: { ...room.dims, length: 100 } }))).toBeNull();
  });

  it('drops unknown fields', async () => {
    const decoded = await decodeRoom(await encodePayload({ ...defaultRoom(), evil: '<script>' }));
    expect(decoded).toEqual(defaultRoom());
  });

  it('rejects links that are too long or inflate past the size cap', async () => {
    expect(await decodeRoom(`v1.${'A'.repeat(5000)}`)).toBeNull();
    const bomb = await encodePayload({ ...defaultRoom(), name: 'x'.repeat(100_000) });
    expect(bomb.length).toBeLessThan(4096);
    expect(await decodeRoom(bomb)).toBeNull();
  });
});
