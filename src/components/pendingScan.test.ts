import { beforeEach, describe, expect, it } from 'vitest';
import {
  assignPendingScan,
  pendingScanRoom,
  returnPendingScan,
  setPendingScan,
  setPendingScanForRoom,
  subscribePendingScan,
  takePendingScan,
} from './pendingScan';

const scan = (name = 'room.spz') => new File([new Uint8Array([1, 2, 3])], name);

beforeEach(() => {
  setPendingScan(null);
});

describe('pendingScan', () => {
  it('holds nothing to begin with', () => {
    expect(pendingScanRoom()).toBeNull();
    expect(takePendingScan('any')).toBeNull();
  });

  it("waits for its link, then for the room that link became, and is taken once", () => {
    const file = scan();
    setPendingScan({ file, link: 'v1.abc' });
    expect(pendingScanRoom()).toBeNull(); // the room isn't known yet
    assignPendingScan('v1.other', 'room-1'); // another link: not this scan's room
    expect(pendingScanRoom()).toBeNull();
    assignPendingScan('v1.abc', 'room-2');
    expect(pendingScanRoom()).toBe('room-2');
    expect(takePendingScan('room-1')).toBeNull(); // another room never gets it
    expect(takePendingScan('room-2')).toBe(file);
    expect(takePendingScan('room-2')).toBeNull();
    expect(pendingScanRoom()).toBeNull();
  });

  it('stays with the first room its link opened', () => {
    setPendingScan({ file: scan(), link: 'v1.abc' });
    assignPendingScan('v1.abc', 'room-1');
    assignPendingScan('v1.abc', 'room-2');
    expect(pendingScanRoom()).toBe('room-1');
  });

  it('is replaced by a newer scan, and cleared by null', () => {
    const newer = scan('newer.ply');
    setPendingScan({ file: scan(), link: 'v1.abc' });
    setPendingScan({ file: newer, link: 'v1.def' });
    assignPendingScan('v1.abc', 'room-1');
    expect(pendingScanRoom()).toBeNull();
    assignPendingScan('v1.def', 'room-1');
    expect(takePendingScan('room-1')).toBe(newer);
    setPendingScan({ file: scan(), link: 'v1.abc' });
    setPendingScan(null);
    assignPendingScan('v1.abc', 'room-1');
    expect(pendingScanRoom()).toBeNull();
  });

  it('waits for a room opened without a link, is taken once, and only by that room', () => {
    const file = scan();
    setPendingScanForRoom(file, 'room-1');
    expect(pendingScanRoom()).toBe('room-1');
    assignPendingScan('', 'room-2'); // no link to match: it stays with its room
    expect(takePendingScan('room-2')).toBeNull();
    expect(takePendingScan('room-1')).toBe(file);
    expect(takePendingScan('room-1')).toBeNull();
    expect(pendingScanRoom()).toBeNull();
  });

  it('is cleared by a room opened without a link and without a scan', () => {
    setPendingScan({ file: scan(), link: 'v1.abc' });
    setPendingScanForRoom(null, 'room-1');
    assignPendingScan('v1.abc', 'room-1');
    expect(pendingScanRoom()).toBeNull();
    expect(takePendingScan('room-1')).toBeNull();
  });

  it('takes back a scan a view could not load, unless a newer one waits', () => {
    const file = scan();
    returnPendingScan('room-1', file);
    expect(pendingScanRoom()).toBe('room-1');
    expect(takePendingScan('room-1')).toBe(file);
    const newer = scan('newer.ply');
    setPendingScan({ file: newer, link: 'v1.def' });
    returnPendingScan('room-1', file);
    assignPendingScan('v1.def', 'room-2');
    expect(takePendingScan('room-2')).toBe(newer);
  });

  it('tells subscribers about every change until they unsubscribe', () => {
    let calls = 0;
    const stop = subscribePendingScan(() => calls++);
    setPendingScan({ file: scan(), link: 'v1.abc' });
    assignPendingScan('v1.abc', 'room-1');
    takePendingScan('room-1');
    expect(calls).toBe(3);
    stop();
    setPendingScan(null);
    expect(calls).toBe(3);
  });
});
