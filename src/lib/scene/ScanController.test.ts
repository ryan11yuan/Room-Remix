import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { Dims, Vec3 } from '@/lib/room/types';
import type { Alignment } from './alignment';
import type { RoomScene } from './RoomScene';
import { ScanController, scanStatusParts, SPLAT_WARN_COUNT, type ScanStatus, type ScanUiStep } from './ScanController';
import { deleteScan, loadScan, saveScan, updateScanAlignment, type StoredScan } from './scanStore';

type Loaded = { count: number; min: Vec3; max: Vec3; centre: Vec3 };
type FakeLayer = { crops: Array<Dims | null>; alignments: Array<Alignment | null>; visible: boolean[]; disposed: boolean };

// Spark can't run in node, so the layer is a recorder; the controller reaches it only through a dynamic import.
const h = vi.hoisted(() => ({
  layers: [] as FakeLayer[],
  load: (async () => ({ count: 0, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, centre: { x: 0, y: 0, z: 0 } })) as (
    bytes: ArrayBuffer,
    name: string,
  ) => Promise<Loaded>,
}));
vi.mock('./SplatLayer', () => ({
  SplatLayer: class {
    group = { name: 'fake-layer' };
    targets = [{ name: 'fake-target' }];
    crops: Array<Dims | null> = [];
    alignments: Array<Alignment | null> = [];
    visible: boolean[] = [];
    disposed = false;
    constructor() {
      h.layers.push(this);
    }
    load(bytes: ArrayBuffer, name: string) {
      return h.load(bytes, name);
    }
    setAlignment(a: Alignment | null) {
      this.alignments.push(a);
    }
    setCrop(d: Dims | null) {
      this.crops.push(d);
    }
    setVisible(v: boolean) {
      this.visible.push(v);
    }
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.mock('./scanStore');

const room = defaultRoom(); // 4 x 3.5 x 2.6 m
const good: Loaded = { count: 1000, min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 2 }, centre: { x: 2, y: 1, z: 1 } };
const file = (name: string) => ({ name, arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as File;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const last = <T>(items: T[]): T => items[items.length - 1];
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** `onStatus` runs inside each status report, so a test can act at an exact moment (before the first await of a load, say). */
function setup(onStatus?: (status: ScanStatus, scans: ScanController) => void, key = 'room-a') {
  const scene = {
    renderer: {},
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    setShellStyle: vi.fn(),
    setRoomItemsVisible: vi.fn(),
    setScanTargets: vi.fn(),
    setTapMode: vi.fn(),
    frameBox: vi.fn(),
    setCameraPreset: vi.fn(),
  };
  const statuses: ScanStatus[] = [];
  const steps: Array<[ScanUiStep, number, string | null]> = [];
  const scans = new ScanController(
    scene as unknown as RoomScene,
    {
      status: (s) => {
        statuses.push(s);
        onStatus?.(s, scans);
      },
      step: (step, taps, hint) => steps.push([step, taps, hint]),
    },
    key,
  );
  return { scene, scans, statuses, steps };
}

/** Open a good scan and walk the three alignment steps (the room's right wall runs along the scan's x axis). */
async function alignedScan() {
  const t = setup();
  await t.scans.open(file('room.spz'), room);
  t.scans.startAlignment();
  for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) t.scans.tap(p, room);
  t.scans.tap({ x: 0, y: 0, z: 0 }, room);
  t.scans.tap({ x: 4, y: 0, z: 0 }, room);
  return t;
}

/** An in-memory localStorage (the tests run in node, which has none). `failing` makes every access throw, as a blocked one does. */
function fakeLocalStorage(failing = false) {
  const items = new Map<string, string>();
  const guard = () => {
    if (failing) throw new DOMException('blocked', 'SecurityError');
  };
  return {
    items,
    getItem: (k: string) => (guard(), items.get(k) ?? null),
    setItem: (k: string, v: string) => (guard(), void items.set(k, v)),
    removeItem: (k: string) => (guard(), void items.delete(k)),
  };
}
const RESTORING = 'room-remix:restoring';

let warn: MockInstance<typeof console.warn>;
let storage: ReturnType<typeof fakeLocalStorage>;
beforeEach(() => {
  vi.resetAllMocks();
  storage = fakeLocalStorage();
  vi.stubGlobal('localStorage', storage);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.layers.length = 0;
  h.load = async () => good;
  vi.mocked(loadScan).mockResolvedValue(null);
  vi.mocked(saveScan).mockResolvedValue(undefined);
  vi.mocked(updateScanAlignment).mockResolvedValue(true);
  vi.mocked(deleteScan).mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScanController opening a file', () => {
  it('shows the scan unaligned, keeps it, and leaves the room tinted', async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('room.spz'), room);
    expect(statuses[0]).toEqual({ kind: 'loading', fileName: 'room.spz' });
    expect(last(statuses)).toEqual({
      kind: 'ready',
      fileName: 'room.spz',
      count: 1000,
      aligned: false,
      stored: true,
      alignmentKept: true,
      visible: true,
    });
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'room.spz', alignment: null }), 'room-a');
    expect(h.layers[0].crops).toEqual([]); // unaligned: no crop
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
  });

  it('never reports the scan as unkept while the save is still running', async () => {
    const { scans, statuses } = setup();
    const save = deferred<void>();
    vi.mocked(saveScan).mockReturnValue(save.promise);
    const opening = scans.open(file('room.spz'), room);
    await flush();
    expect(last(statuses)).toMatchObject({ kind: 'ready', stored: true });
    save.resolve();
    await opening;
    expect(last(statuses)).toMatchObject({ kind: 'ready', stored: true });
  });

  it('keeps the scan for this session when storage fails, after clearing storage and retrying once', async () => {
    const { scans, statuses } = setup();
    vi.mocked(saveScan).mockRejectedValue(new Error('quota'));
    await scans.open(file('room.spz'), room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', stored: false });
    expect(saveScan).toHaveBeenCalledTimes(2);
    expect(deleteScan).toHaveBeenCalledTimes(1);
  });

  it('deletes the old stored scan and retries when a replacement fails to save', async () => {
    const { scans, statuses } = setup();
    vi.mocked(saveScan).mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    await scans.open(file('replacement.spz'), room);
    expect(deleteScan).toHaveBeenCalledTimes(1);
    expect(saveScan).toHaveBeenCalledTimes(2);
    const [firstSave, secondSave] = vi.mocked(saveScan).mock.invocationCallOrder;
    const [deleted] = vi.mocked(deleteScan).mock.invocationCallOrder;
    expect(deleteScan).toHaveBeenCalledWith('room-a');
    expect(saveScan).toHaveBeenLastCalledWith(expect.anything(), 'room-a'); // the retry too
    expect(firstSave).toBeLessThan(deleted);
    expect(deleted).toBeLessThan(secondSave);
    expect(last(statuses)).toMatchObject({ kind: 'ready', stored: true });
  });

  it('still retries when the delete fails too', async () => {
    const { scans, statuses } = setup();
    vi.mocked(saveScan).mockRejectedValueOnce(new Error('quota')).mockResolvedValue(undefined);
    vi.mocked(deleteScan).mockRejectedValue(new Error('blocked'));
    await scans.open(file('replacement.spz'), room);
    expect(saveScan).toHaveBeenCalledTimes(2);
    expect(last(statuses)).toMatchObject({ kind: 'ready', stored: true });
  });

  it('treats a file it cannot read like a scan Spark cannot read', async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('first.spz'), room);
    const unreadable = { name: 'gone.spz', arrayBuffer: () => Promise.reject(new Error('NotReadableError')) } as unknown as File;
    await scans.open(unreadable, room);
    expect(last(statuses)).toMatchObject({ kind: 'error' });
    expect(h.layers[0].disposed).toBe(true);
    expect(scene.removeLayer).toHaveBeenCalledTimes(1);
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
    expect(warn).toHaveBeenCalled();
  });

  it('reports a scan Spark cannot read and keeps the box view', async () => {
    const { scans, scene, statuses } = setup();
    h.load = async () => {
      throw new Error('Unable to determine file type');
    };
    await scans.open(file('notes.txt'), room);
    expect(last(statuses)).toEqual({ kind: 'error', message: "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export." });
    expect(h.layers[0].disposed).toBe(true);
    expect(saveScan).not.toHaveBeenCalled();
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
    expect(scene.setScanTargets).toHaveBeenLastCalledWith([]);
    expect(warn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ message: 'Unable to determine file type' }));
  });

  it.each([
    ['no splats', { ...good, count: 0 }],
    ['infinite bounds', { ...good, min: { x: Infinity, y: Infinity, z: Infinity } }],
    ['NaN bounds', { ...good, max: { x: NaN, y: 2, z: 2 } }],
    ['a NaN centre', { ...good, centre: { x: 2, y: NaN, z: 1 } }],
    ['an infinite centre', { ...good, centre: { x: 2, y: 1, z: Infinity } }],
  ])('treats a scan with %s as unreadable', async (_name, loaded) => {
    const { scans, scene, statuses } = setup();
    h.load = async () => loaded;
    await scans.open(file('empty.ply'), room);
    expect(last(statuses)).toMatchObject({ kind: 'error' });
    expect(saveScan).not.toHaveBeenCalled();
    expect(h.layers[0].disposed).toBe(true);
    scans.startAlignment(); // nothing to align
    expect(scene.setTapMode).not.toHaveBeenCalledWith('scan');
    expect(scene.frameBox).not.toHaveBeenCalled();
  });

  it('exposes the large-scan threshold from spec section 8', () => {
    expect(SPLAT_WARN_COUNT).toBe(1_500_000);
  });
});

describe('ScanController one load at a time', () => {
  it('ignores a second file while one is loading', async () => {
    const { scans, statuses } = setup();
    const gate = deferred<Loaded>();
    const load = vi.fn(() => gate.promise);
    h.load = load;
    const first = scans.open(file('a.spz'), room);
    await flush();
    await scans.open(file('b.spz'), room);
    expect(load).toHaveBeenCalledTimes(1);
    gate.resolve(good);
    await first;
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'a.spz' });
    expect(h.layers).toHaveLength(1);
  });

  it('ignores a file while aligning', async () => {
    const { scans } = setup();
    const load = vi.fn(async () => good);
    h.load = load;
    await scans.open(file('a.spz'), room);
    scans.startAlignment();
    await scans.open(file('b.spz'), room);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('stays quiet when a newer load or dispose overtakes a load', async () => {
    const { scans, scene, statuses } = setup();
    h.load = async () => {
      throw new Error('Scan load superseded');
    };
    await scans.open(file('a.spz'), room);
    expect(last(statuses)).toEqual({ kind: 'loading', fileName: 'a.spz' }); // no error, no dispose: the newer load owns the layer
    expect(h.layers[0].disposed).toBe(false);
    expect(scene.removeLayer).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('reports nothing after it is disposed', async () => {
    const { scans, statuses } = setup();
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const opening = scans.open(file('a.spz'), room);
    await flush();
    const before = statuses.length;
    scans.dispose();
    gate.resolve(good);
    await opening;
    expect(statuses).toHaveLength(before);
    expect(saveScan).not.toHaveBeenCalled();
    expect(h.layers[0].disposed).toBe(true);
  });
});

describe('ScanController restore', () => {
  it('brings back a stored scan with its alignment, cropped to the room', async () => {
    const alignment: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };
    vi.mocked(loadScan).mockResolvedValue({ fileName: 'kept.spz', bytes: new ArrayBuffer(8), alignment, savedAt: 1 });
    const { scans, scene, statuses } = setup();
    await scans.restore(room);
    expect(loadScan).toHaveBeenCalledWith('room-a');
    expect(last(statuses)).toEqual({
      kind: 'ready',
      fileName: 'kept.spz',
      count: 1000,
      aligned: true,
      stored: true,
      alignmentKept: true,
      visible: true,
    });
    expect(h.layers[0].alignments).toEqual([alignment]);
    expect(h.layers[0].crops).toEqual([room.dims]);
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('outline');
  });

  it('reports nothing synchronously, so a view can start it from an effect', () => {
    const { scans, statuses, steps } = setup();
    void scans.restore(room);
    expect(statuses).toEqual([]);
    expect(steps).toEqual([]);
  });

  it('starts empty when nothing usable is stored', async () => {
    vi.mocked(loadScan).mockRejectedValue(new Error('blocked'));
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(statuses).toEqual([]);
  });

  it('does not overwrite a file the user opened while it was reading', async () => {
    const read = deferred<Awaited<ReturnType<typeof loadScan>>>();
    vi.mocked(loadScan).mockReturnValue(read.promise);
    const load = vi.fn(async () => good);
    h.load = load;
    const { scans, statuses } = setup();
    const restoring = scans.restore(room);
    await scans.open(file('new.spz'), room);
    read.resolve({ fileName: 'old.spz', bytes: new ArrayBuffer(8), alignment: null, savedAt: 1 });
    await restoring;
    expect(load).toHaveBeenCalledTimes(1);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'new.spz' });
  });

  it('shows nothing if it is disposed while reading', async () => {
    const read = deferred<Awaited<ReturnType<typeof loadScan>>>();
    vi.mocked(loadScan).mockReturnValue(read.promise);
    const { scans, statuses } = setup();
    const restoring = scans.restore(room);
    scans.dispose();
    read.resolve({ fileName: 'old.spz', bytes: new ArrayBuffer(8), alignment: null, savedAt: 1 });
    await restoring;
    expect(statuses).toEqual([]);
    expect(h.layers).toHaveLength(0);
  });
});

describe('ScanController aligning', () => {
  it('hides the room, frames the scan and takes scan taps', async () => {
    const { scans, scene, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('hidden');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(false);
    expect(scene.setTapMode).toHaveBeenLastCalledWith('scan');
    expect(scene.setScanTargets).toHaveBeenLastCalledWith([{ name: 'fake-target' }]);
    expect(scene.frameBox).toHaveBeenCalledWith(good.min, good.max);
    expect(last(steps)).toEqual(['floor', 0, null]);
  });

  it('shows a hidden scan, and the status says so', async () => {
    const { scans, statuses } = setup();
    await scans.open(file('room.spz'), room);
    scans.setVisible(false);
    expect(last(statuses)).toMatchObject({ visible: false });
    scans.startAlignment();
    expect(last(statuses)).toMatchObject({ kind: 'ready', visible: true });
    expect(last(h.layers[0].visible)).toBe(true);
  });

  it('keeps the step and gives a hint for a tap it cannot use', async () => {
    const { scans, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 1, y: 0, z: 0 }, room);
    scans.tap({ x: 2, y: 0, z: 0 }, room); // all in a line
    expect(last(steps)).toEqual(['floor', 2, expect.stringContaining('in a line')]);
    scans.tap({ x: 0, y: 0, z: 2 }, room); // a good third point carries on
    expect(last(steps)).toEqual(['corners', 0, null]);
  });

  it('restarts the corner taps after the wrong wall', async () => {
    const { scans, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room); // back corner first: the room comes out on the wrong side
    expect(last(steps)).toEqual(['corners', 0, expect.stringContaining('wrong side')]);
  });

  it('applies the alignment live on the third step and puts the camera on Corner', async () => {
    const { scans, scene, steps } = await alignedScan();
    expect(last(steps)).toEqual(['nudge', 0, null]);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('outline');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(true);
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(scene.setCameraPreset).toHaveBeenCalledWith(room, 'corner');
    expect(last(h.layers[0].alignments)).not.toBeNull();
    expect(h.layers[0].crops).toEqual([]); // the whole scan stays visible while lining up
    scans.tap({ x: 1, y: 0, z: 1 }, room); // taps no longer count
    expect(last(steps)).toEqual(['nudge', 0, null]);
  });

  it('nudges the live alignment', async () => {
    const { scans } = await alignedScan();
    const before = last(h.layers[0].alignments);
    scans.nudge({ yaw: Math.PI / 180 }, room);
    const after = last(h.layers[0].alignments);
    expect(after?.yaw).toBeCloseTo((before?.yaw ?? 0) + Math.PI / 180, 9);
  });

  it('saves the alignment on Done, crops to the room and keeps the outline', async () => {
    const { scans, scene, steps, statuses } = await alignedScan();
    await scans.finish(room);
    const savedAt = vi.mocked(saveScan).mock.calls[0][0].savedAt; // the write is for the record this scan was saved as
    expect(updateScanAlignment).toHaveBeenCalledWith(last(h.layers[0].alignments), savedAt, 'room-a');
    expect(h.layers[0].crops).toEqual([room.dims]);
    expect(scene.setScanTargets).toHaveBeenLastCalledWith([]);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('outline');
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(last(steps)).toEqual([null, 0, null]);
    expect(last(statuses)).toMatchObject({ kind: 'ready', aligned: true });
  });

  it('still applies the alignment this session when it cannot be saved, and says only the alignment is not kept', async () => {
    vi.mocked(updateScanAlignment).mockRejectedValue(new Error('quota'));
    const { scans, statuses } = await alignedScan();
    await scans.finish(room);
    // The scan itself is in storage; only its alignment isn't.
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true, alignmentKept: false });
    expect(last(h.layers[0].alignments)).not.toBeNull();
  });

  it('says the alignment is not kept when the compare-and-set skipped it (a different scan is stored)', async () => {
    vi.mocked(updateScanAlignment).mockResolvedValue(false);
    const { scans, statuses } = await alignedScan();
    await scans.finish(room);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true, alignmentKept: false });
    expect(last(h.layers[0].alignments)).not.toBeNull();
  });

  it('says the alignment is kept again once a later Done writes it', async () => {
    vi.mocked(updateScanAlignment).mockRejectedValueOnce(new Error('quota'));
    const { scans, statuses } = await alignedScan();
    await scans.finish(room);
    expect(last(statuses)).toMatchObject({ alignmentKept: false });
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true, alignmentKept: true });
  });

  it('shows the scan as aligned before it waits for the alignment to be saved', async () => {
    const { scans, statuses } = await alignedScan();
    const write = deferred<boolean>();
    vi.mocked(updateScanAlignment).mockReturnValue(write.promise);
    const finishing = scans.finish(room);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true, alignmentKept: true }); // nothing awaited yet
    write.resolve(true);
    await finishing;
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true, alignmentKept: true });
  });

  it('does not write an alignment onto a stored scan that is not the one on screen', async () => {
    vi.mocked(saveScan).mockRejectedValue(new Error('quota')); // the replacement never made it into storage
    const { scans, statuses } = await alignedScan();
    expect(last(statuses)).toMatchObject({ stored: false });
    await scans.finish(room);
    expect(updateScanAlignment).not.toHaveBeenCalled();
    expect(last(statuses)).toMatchObject({ aligned: true, stored: false });
    expect(h.layers[0].crops).toEqual([room.dims]);
  });

  it('writes the alignment of a restored scan', async () => {
    vi.mocked(loadScan).mockResolvedValue({ fileName: 'kept.spz', bytes: new ArrayBuffer(8), alignment: null, savedAt: 1 });
    const { scans } = setup();
    await scans.restore(room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledTimes(1);
  });

  it('stops writing alignments once a replacement scan is on screen that was not saved', async () => {
    const { scans } = await alignedScan();
    await scans.finish(room);
    vi.mocked(updateScanAlignment).mockClear();
    vi.mocked(saveScan).mockRejectedValue(new Error('quota'));
    await scans.open(file('replacement.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(updateScanAlignment).not.toHaveBeenCalled();
  });

  it('saves an alignment finished while the scan was still being saved once the save lands', async () => {
    const save = deferred<void>();
    vi.mocked(saveScan).mockReturnValue(save.promise);
    const { scans, statuses } = setup();
    const opening = scans.open(file('room.spz'), room);
    await flush();
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(updateScanAlignment).not.toHaveBeenCalled(); // the scan isn't in storage yet
    save.resolve();
    await opening;
    expect(updateScanAlignment).toHaveBeenCalledTimes(1);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true });
  });

  it('does not let a save that finishes late mark a newer scan as stored', async () => {
    const firstSave = deferred<void>();
    vi.mocked(saveScan).mockReturnValueOnce(firstSave.promise).mockRejectedValue(new Error('quota'));
    const { scans, statuses } = setup();
    const first = scans.open(file('a.spz'), room);
    await flush();
    await scans.open(file('b.spz'), room); // replaced while a.spz was still saving; b.spz can't be saved
    firstSave.resolve();
    await first;
    expect(last(statuses)).toMatchObject({ fileName: 'b.spz', stored: false });
  });

  it('goes back to no alignment on Cancel and restores the tinted room', async () => {
    const { scans, scene, steps, statuses } = await alignedScan();
    scans.cancelAlignment(room);
    expect(last(h.layers[0].alignments)).toBeNull();
    expect(h.layers[0].crops).toEqual([]);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('tinted');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(true);
    expect(last(steps)).toEqual([null, 0, null]);
    expect(last(statuses)).toMatchObject({ aligned: false });
    expect(updateScanAlignment).not.toHaveBeenCalled();
  });

  it.each([
    ['floor', 0],
    ['corners', 3],
  ])('puts the camera back on the room when Cancel comes during the %s step', async (_step, floorTaps) => {
    const { scans, scene } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }].slice(0, floorTaps)) scans.tap(p, room);
    expect(scene.setCameraPreset).not.toHaveBeenCalled();
    scans.cancelAlignment(room);
    expect(scene.setCameraPreset).toHaveBeenCalledTimes(1);
    expect(scene.setCameraPreset).toHaveBeenCalledWith(room, 'corner');
  });

  it('does not move the camera again when Cancel comes during the nudge step', async () => {
    const { scans, scene } = await alignedScan();
    expect(scene.setCameraPreset).toHaveBeenCalledTimes(1); // entering the nudge step
    scans.cancelAlignment(room);
    expect(scene.setCameraPreset).toHaveBeenCalledTimes(1);
  });

  it('leaves the camera alone on Cancel while the room size is mid-edit', async () => {
    const { scans, scene } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    scans.cancelAlignment({ ...room, dims: { ...room.dims, length: NaN } });
    expect(scene.setCameraPreset).not.toHaveBeenCalled();
  });

  it('returns to the previous alignment when a re-alignment is cancelled', async () => {
    const { scans, scene } = await alignedScan();
    await scans.finish(room);
    const kept = last(h.layers[0].alignments);
    scans.startAlignment();
    expect(last(h.layers[0].alignments)).toBeNull();
    expect(last(h.layers[0].crops)).toBeNull(); // uncropped while picking points
    scans.cancelAlignment(room);
    expect(last(h.layers[0].alignments)).toEqual(kept);
    expect(last(h.layers[0].crops)).toEqual(room.dims);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('outline');
  });

  it('ignores Done and nudges outside the nudge step', async () => {
    const { scans } = setup();
    await scans.open(file('room.spz'), room);
    await scans.finish(room);
    scans.nudge({ yaw: 1 }, room);
    expect(updateScanAlignment).not.toHaveBeenCalled();
    expect(h.layers[0].alignments).toEqual([null]);
  });
});

describe('ScanController room size mid-edit', () => {
  const broken = (dims: Partial<Record<keyof typeof room.dims, number>>) => ({ ...room, dims: { ...room.dims, ...dims } });

  it.each([[{ length: NaN }], [{ width: 0 }], [{ height: -1 }], [{ length: Infinity }]])(
    'asks for the size instead of tapping with %j',
    async (dims) => {
      const { scans, steps } = setup();
      await scans.open(file('room.spz'), room);
      scans.startAlignment();
      scans.tap({ x: 0, y: 0, z: 0 }, broken(dims));
      expect(last(steps)).toEqual(['floor', 0, "Enter the room's size first."]);
      scans.tap({ x: 0, y: 0, z: 0 }, room); // the size is back: the tap counts
      expect(last(steps)).toEqual(['floor', 1, null]);
    },
  );

  it('asks for the size in the corner step too, and keeps the taps so far', async () => {
    const { scans, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, broken({ width: NaN }));
    expect(last(steps)).toEqual(['corners', 1, "Enter the room's size first."]);
  });

  it('ignores nudges and Done until the size is valid', async () => {
    const { scans, steps } = await alignedScan();
    const before = h.layers[0].alignments.length;
    scans.nudge({ yaw: 0.1 }, broken({ length: NaN }));
    expect(h.layers[0].alignments).toHaveLength(before);
    await scans.finish(broken({ height: 0 }));
    expect(updateScanAlignment).not.toHaveBeenCalled();
    expect(last(steps)[0]).toBe('nudge'); // still lining up
    await scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledTimes(1);
  });

  it('never applies or stores an alignment with a non-finite number in it', async () => {
    const { scans } = await alignedScan();
    const before = h.layers[0].alignments.length;
    scans.nudge({ scale: NaN }, room);
    scans.nudge({ yaw: Infinity }, room);
    expect(h.layers[0].alignments).toHaveLength(before);
    await scans.finish(room);
    const saved = vi.mocked(updateScanAlignment).mock.calls[0][0]!;
    expect([...saved.level, saved.scale, saved.yaw, saved.offset.x, saved.offset.y, saved.offset.z].every(Number.isFinite)).toBe(true);
  });

  it('refuses Done on an alignment that came out non-finite', async () => {
    const { scans, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: NaN, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(updateScanAlignment).not.toHaveBeenCalled();
    expect(last(steps)).toEqual(['nudge', 0, expect.stringContaining("can't be used")]);
  });

  it('keeps the crop on the last good size while the size is edited', async () => {
    const { scans } = await alignedScan();
    await scans.finish(room);
    scans.setRoom(broken({ length: NaN }));
    expect(h.layers[0].crops).toEqual([room.dims]);
  });
});

describe('ScanController crop and visibility', () => {
  it('re-crops only when the room size really changes', async () => {
    const { scans } = await alignedScan();
    await scans.finish(room);
    expect(h.layers[0].crops).toHaveLength(1);
    for (let i = 0; i < 5; i++) scans.setRoom({ ...room, speaker: { ...room.speaker, x: 1 + i / 10 } }); // drag frames
    expect(h.layers[0].crops).toHaveLength(1);
    const bigger = { ...room.dims, length: 5 };
    scans.setRoom({ ...room, dims: bigger });
    scans.setRoom({ ...room, dims: { ...bigger } });
    expect(h.layers[0].crops).toEqual([room.dims, bigger]);
  });

  it('keeps the previous crop while a size is being edited', async () => {
    const { scans } = await alignedScan();
    await scans.finish(room);
    scans.setRoom({ ...room, dims: { ...room.dims, length: NaN } });
    scans.setRoom({ ...room, dims: { ...room.dims, width: 0 } });
    expect(h.layers[0].crops).toEqual([room.dims]);
  });

  it('leaves the crop alone until the scan is aligned, and while aligning', async () => {
    const { scans } = setup();
    await scans.open(file('room.spz'), room);
    scans.setRoom({ ...room, dims: { ...room.dims, length: 5 } });
    expect(h.layers[0].crops).toEqual([]);
    scans.startAlignment();
    scans.setRoom(room);
    expect(h.layers[0].crops).toEqual([]);
  });

  it('crops a scan that finishes loading to the room as it is by then', async () => {
    const alignment: Alignment = { level: [0, 0, 0, 1], scale: 1, yaw: 0, offset: { x: 0, y: 0, z: 0 } };
    vi.mocked(loadScan).mockResolvedValue({ fileName: 'kept.spz', bytes: new ArrayBuffer(8), alignment, savedAt: 1 });
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans } = setup();
    scans.setRoom(room);
    const restoring = scans.restore(room);
    await flush();
    const resized = { ...room.dims, length: 6 };
    scans.setRoom({ ...room, dims: resized }); // the shared room arrived while the scan was parsing
    gate.resolve(good);
    await restoring;
    expect(h.layers[0].crops).toEqual([resized]);
  });

  it('hides and shows the scan, and the outline follows what is on screen', async () => {
    const { scans, scene, statuses } = await alignedScan();
    await scans.finish(room);
    scans.setVisible(false);
    expect(last(h.layers[0].visible)).toBe(false);
    expect(last(statuses)).toMatchObject({ visible: false });
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('tinted');
    scans.setVisible(true);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('outline');
  });
});

describe('ScanController remove', () => {
  it('drops the scan, deletes it from the device and restores the room', async () => {
    const { scans, scene, statuses } = await alignedScan();
    await scans.finish(room);
    await scans.remove();
    expect(h.layers[0].disposed).toBe(true);
    expect(scene.removeLayer).toHaveBeenCalledTimes(1);
    expect(deleteScan).toHaveBeenCalledWith('room-a');
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('tinted');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(true);
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(scene.setScanTargets).toHaveBeenLastCalledWith([]);
  });

  it('clears what is in storage even after an unreadable replacement left no scan on screen', async () => {
    const { scans, statuses } = setup();
    await scans.open(file('a.spz'), room);
    h.load = async () => {
      throw new Error('Unable to determine file type');
    };
    await scans.open(file('notes.txt'), room);
    expect(last(statuses)).toMatchObject({ kind: 'error' });
    await scans.remove();
    expect(deleteScan).toHaveBeenCalledWith('room-a');
    expect(last(statuses)).toEqual({ kind: 'none' });
  });

  it('can open another scan afterwards on a fresh layer', async () => {
    const { scans, statuses } = setup();
    await scans.open(file('a.spz'), room);
    await scans.remove();
    await scans.open(file('b.spz'), room);
    expect(h.layers).toHaveLength(2);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });
});

describe('ScanController which way is up and which side is in', () => {
  it('takes "up" from the mean splat centre, not the middle of the scan box', async () => {
    // The box reaches far below the floor (its middle is under it) while most splats, and so the mean, are above it.
    h.load = async () => ({ ...good, min: { x: -5, y: -10, z: 0 }, max: { x: 9, y: 2, z: 2 }, centre: { x: 2, y: 1, z: 1 } });
    const { steps } = await alignedScan();
    expect(last(steps)).toEqual(['nudge', 0, null]);
    expect(last(h.layers[0].alignments)?.level[3]).toBeCloseTo(1, 9); // already level: the floor normal kept pointing up
  });

  it('accepts perfect taps in a scan whose box reaches 20 m beyond the right wall', async () => {
    h.load = async () => ({ ...good, min: { x: 0, y: 0, z: -20 }, max: { x: 4, y: 2, z: 2 }, centre: { x: 2, y: 1, z: 1 } });
    const { scans, steps } = await alignedScan();
    expect(last(steps)).toEqual(['nudge', 0, null]);
    await scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledTimes(1);
  });

  it('still refuses the back corner tapped first', async () => {
    h.load = async () => ({ ...good, min: { x: 0, y: 0, z: -20 }, max: { x: 4, y: 2, z: 2 } });
    const { scans, steps } = setup();
    await scans.open(file('room.spz'), room);
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    expect(last(steps)).toEqual(['corners', 0, expect.stringContaining('wrong side')]);
  });
});

describe('ScanController storage follows the scan on screen', () => {
  const quota = () => new Error('quota');

  it('stops retrying once the scan being saved is Removed', async () => {
    const firstSave = deferred<void>();
    vi.mocked(saveScan).mockReturnValueOnce(firstSave.promise);
    const { scans } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush();
    await scans.remove(); // the user took the scan away while its first save was still running
    expect(deleteScan).toHaveBeenCalledTimes(1); // remove() own delete
    firstSave.reject(quota());
    await opening;
    expect(deleteScan).toHaveBeenCalledTimes(1); // keep() did not delete again
    expect(saveScan).toHaveBeenCalledTimes(1); // and did not store the removed scan again
  });

  it('does not let a failing save of A touch storage after B replaced it, and writes the alignment of B onto B', async () => {
    const now = vi.spyOn(Date, 'now');
    const firstSave = deferred<void>();
    vi.mocked(saveScan).mockReturnValueOnce(firstSave.promise).mockResolvedValue(undefined);
    const { scans, statuses } = setup();
    now.mockReturnValueOnce(1000);
    const openingA = scans.open(file('a.spz'), room);
    await flush();
    now.mockReturnValueOnce(2000);
    await scans.open(file('b.spz'), room); // replaced while the first save is still running; B is saved fine
    expect(vi.mocked(saveScan).mock.calls.map(([s]) => [s.fileName, s.savedAt])).toEqual([['a.spz', 1000], ['b.spz', 2000]]);
    firstSave.reject(quota()); // now the save of A fails
    await openingA;
    expect(deleteScan).not.toHaveBeenCalled(); // keep() of A left storage alone: it would have deleted B
    expect(saveScan).toHaveBeenCalledTimes(2); // and did not store A again
    expect(last(statuses)).toMatchObject({ fileName: 'b.spz', stored: true });
    // Done on B writes its alignment, matched on the savedAt of B
    scans.startAlignment();
    for (const p of [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 0, y: 0, z: 2 }]) scans.tap(p, room);
    scans.tap({ x: 0, y: 0, z: 0 }, room);
    scans.tap({ x: 4, y: 0, z: 0 }, room);
    await scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledTimes(1);
    expect(updateScanAlignment).toHaveBeenCalledWith(expect.objectContaining({ scale: expect.any(Number) }), 2000, 'room-a');
    now.mockRestore();
  });

  it('lets the save finish when the page is left mid-save (dispose does not move the storage intent)', async () => {
    const firstSave = deferred<void>();
    vi.mocked(saveScan).mockReturnValueOnce(firstSave.promise).mockResolvedValue(undefined);
    const { scans, statuses } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush();
    const before = statuses.length;
    scans.dispose();
    firstSave.reject(quota());
    await opening;
    expect(deleteScan).toHaveBeenCalledTimes(1);
    expect(saveScan).toHaveBeenCalledTimes(2); // the retry landed
    expect(statuses).toHaveLength(before); // and nothing was reported to the view that has gone
  });

  it('stops before the retry save when the scan is Removed while the delete is running', async () => {
    const deleting = deferred<void>();
    vi.mocked(saveScan).mockRejectedValueOnce(quota());
    vi.mocked(deleteScan).mockReturnValueOnce(deleting.promise);
    const { scans } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush(); // the first save failed and keep() is waiting on the delete
    await scans.remove();
    deleting.resolve();
    await opening;
    expect(saveScan).toHaveBeenCalledTimes(1); // no retry: that would put the removed scan back
  });

  it('still runs the retry for the scan that is on screen', async () => {
    vi.mocked(saveScan).mockRejectedValueOnce(quota()).mockResolvedValue(undefined);
    const { scans, statuses } = setup();
    await scans.open(file('a.spz'), room);
    expect(deleteScan).toHaveBeenCalledTimes(1);
    expect(saveScan).toHaveBeenCalledTimes(2);
    expect(last(statuses)).toMatchObject({ stored: true });
  });
});

describe('ScanController Remove while a scan is loading', () => {
  it('leaves a clean "none" state and never shows the scan that was loading', async () => {
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans, scene, statuses } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush();
    expect(last(statuses)).toMatchObject({ kind: 'loading' });
    await scans.remove();
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(h.layers[0].disposed).toBe(true);
    gate.resolve(good); // the in-flight load finishes anyway
    await opening;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(saveScan).not.toHaveBeenCalled();
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
    expect(warn).not.toHaveBeenCalled();
  });

  it('stays silent when the load it abandoned then fails', async () => {
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans, statuses } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush();
    await scans.remove();
    gate.reject(new Error('Unable to determine file type'));
    await opening;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows nothing when Remove comes while the file is still being read', async () => {
    const read = deferred<ArrayBuffer>();
    const slow = { name: 'a.spz', arrayBuffer: () => read.promise } as unknown as File;
    const { scans, statuses } = setup();
    const opening = scans.open(slow, room);
    expect(last(statuses)).toMatchObject({ kind: 'loading' });
    await scans.remove();
    read.resolve(new ArrayBuffer(8));
    await opening;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(h.layers).toHaveLength(0);
    expect(saveScan).not.toHaveBeenCalled();
  });

  it('shows nothing, and leaves no layer behind, when Remove comes before Spark has even been fetched', async () => {
    // The first scan fetches Spark's chunk with a dynamic import: Remove has no layer to dispose yet.
    let loadings = 0;
    let removing: Promise<void> | undefined;
    const { scans, scene, statuses } = setup((status, controller) => {
      if (status.kind === 'loading' && ++loadings === 2) removing = controller.remove(); // 2nd report: show() has started
    });
    await scans.open(file('a.spz'), room);
    await removing;
    expect(h.layers).toHaveLength(0);
    expect(scene.addLayer).not.toHaveBeenCalled();
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(saveScan).not.toHaveBeenCalled();
  });

  it('can open another scan afterwards, and the abandoned load landing late changes nothing', async () => {
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans, statuses } = setup();
    const opening = scans.open(file('a.spz'), room);
    await flush();
    await scans.remove();
    h.load = async () => good;
    await scans.open(file('b.spz'), room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
    gate.resolve(good);
    await opening;
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });

  it('abandons a restore that is still loading', async () => {
    vi.mocked(loadScan).mockResolvedValue({ fileName: 'kept.spz', bytes: new ArrayBuffer(8), alignment: null, savedAt: 1 });
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans, statuses } = setup();
    const restoring = scans.restore(room);
    await flush();
    expect(last(statuses)).toMatchObject({ kind: 'loading', fileName: 'kept.spz' });
    await scans.remove();
    gate.resolve(good);
    await restoring;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(deleteScan).toHaveBeenCalledWith('room-a');
    expect(storage.items.has(RESTORING)).toBe(false);
  });
});

describe('ScanController restore after a crash', () => {
  const stored = { fileName: 'kept.spz', bytes: new ArrayBuffer(8), alignment: null, savedAt: 1 };

  it('marks the restore as running while the stored scan opens, and clears the mark when it is ready', async () => {
    vi.mocked(loadScan).mockResolvedValue(stored);
    let markedWhileOpening: string | undefined;
    h.load = async () => {
      markedWhileOpening = storage.items.get(RESTORING);
      return good;
    };
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(markedWhileOpening).toBe('room-a');
    expect(storage.items.has(RESTORING)).toBe(false);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'kept.spz' });
  });

  it('clears the mark when the stored scan cannot be read, and says so in its own words', async () => {
    vi.mocked(loadScan).mockResolvedValue(stored);
    h.load = async () => {
      throw new Error('Unable to determine file type');
    };
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(storage.items.has(RESTORING)).toBe(false);
    expect(last(statuses)).toEqual({ kind: 'error', message: "Couldn't read your saved scan. Load it again or remove it." });
  });

  it('keeps the file-picking message for a file the user picks', async () => {
    h.load = async () => {
      throw new Error('Unable to determine file type');
    };
    const { scans, statuses } = setup();
    await scans.open(file('notes.txt'), room);
    expect(last(statuses)).toEqual({ kind: 'error', message: "Couldn't read this scan. Use a .ply, .spz, .splat or .ksplat export." });
  });

  it('clears the mark when the page is left mid-restore', async () => {
    vi.mocked(loadScan).mockResolvedValue(stored);
    const gate = deferred<Loaded>();
    h.load = () => gate.promise;
    const { scans } = setup();
    const restoring = scans.restore(room);
    await flush();
    expect(storage.items.get(RESTORING)).toBe('room-a');
    scans.dispose();
    gate.resolve(good);
    await restoring;
    expect(storage.items.has(RESTORING)).toBe(false);
  });

  it('does not restore when the last restore never finished, says so, and clears the mark', async () => {
    storage.items.set(RESTORING, 'room-a'); // a tab that died while opening the stored scan
    vi.mocked(loadScan).mockResolvedValue(stored);
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(loadScan).not.toHaveBeenCalled();
    expect(h.layers).toHaveLength(0);
    expect(last(statuses)).toEqual({ kind: 'error', message: "Your saved scan didn't open last time. Load it again or remove it." });
    expect(storage.items.has(RESTORING)).toBe(false);
  });

  it('tries again at the start after that, and Remove still works from the notice', async () => {
    storage.items.set(RESTORING, 'room-a');
    vi.mocked(loadScan).mockResolvedValue(stored);
    const first = setup();
    await first.scans.restore(room);
    const second = setup();
    await second.scans.restore(room);
    expect(last(second.statuses)).toMatchObject({ kind: 'ready', fileName: 'kept.spz' });
    await first.scans.remove();
    expect(deleteScan).toHaveBeenCalledWith('room-a');
    expect(last(first.statuses)).toEqual({ kind: 'none' });
  });

  it('still reports nothing synchronously when it finds the mark', () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup();
    void scans.restore(room);
    expect(statuses).toEqual([]);
  });

  it('leaves a file opened meanwhile alone when it finds the mark', async () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup();
    const restoring = scans.restore(room);
    await scans.open(file('new.spz'), room);
    await restoring;
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'new.spz' });
  });

  it('works as before when localStorage is blocked', async () => {
    vi.stubGlobal('localStorage', fakeLocalStorage(true));
    vi.mocked(loadScan).mockResolvedValue(stored);
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'kept.spz' });
  });

  it('works as before when there is no localStorage at all', async () => {
    vi.stubGlobal('localStorage', undefined);
    vi.mocked(loadScan).mockResolvedValue(stored);
    const { scans, statuses } = setup();
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'kept.spz' });
  });

  it('does not set the mark when there is nothing stored', async () => {
    const { scans } = setup();
    await scans.restore(room);
    expect(storage.items.has(RESTORING)).toBe(false);
  });
});

describe('ScanController rooms', () => {
  const saved = (fileName: string): StoredScan => ({ fileName, bytes: new ArrayBuffer(8), alignment: null, savedAt: 5 });

  it("keeps an opened scan under its room's key", async () => {
    const { scans } = setup();
    await scans.open(file('room.spz'), room);
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'room.spz' }), 'room-a');
  });

  it("restores its own room's scan", async () => {
    const { scans, statuses } = setup(undefined, 'room-b');
    vi.mocked(loadScan).mockImplementation(async (key) => (key === 'room-b' ? saved('b.spz') : null));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });

  it("takes the scan off the screen without deleting it when another room opens, and shows that room's scan", async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('a.spz'), room);
    vi.mocked(loadScan).mockImplementation(async (key) => (key === 'room-b' ? saved('b.spz') : null));
    await scans.switchRoom('room-b', room);
    expect(h.layers[0].disposed).toBe(true);
    expect(deleteScan).not.toHaveBeenCalled();
    expect(statuses).toContainEqual({ kind: 'none' });
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
    expect(scans.roomKey).toBe('room-b');
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
  });

  it('shows the plain box when the other room has no scan', async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('a.spz'), room);
    await scans.switchRoom('room-b', room);
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(last(scene.setShellStyle.mock.calls)[0]).toBe('tinted');
  });

  it('does nothing when the same room is opened again', async () => {
    const { scans, statuses } = setup();
    await scans.open(file('a.spz'), room);
    const before = statuses.length;
    await scans.switchRoom('room-a', room);
    expect(statuses.length).toBe(before);
    expect(h.layers[0].disposed).toBe(false);
  });

  it('never shows a scan that was still loading for the room that was left', async () => {
    const { scans, statuses } = setup();
    const loading = deferred<Loaded>();
    h.load = () => loading.promise;
    const opening = scans.open(file('slow.spz'), room);
    await flush();
    await scans.switchRoom('room-b', room);
    loading.resolve(good);
    await opening;
    expect(last(statuses)).toEqual({ kind: 'none' });
    expect(statuses.some((s) => s.kind === 'ready')).toBe(false);
    expect(saveScan).not.toHaveBeenCalled();
  });

  it('ends an alignment that was in progress', async () => {
    const { scans, scene, steps } = setup();
    await scans.open(file('a.spz'), room);
    scans.startAlignment();
    await scans.switchRoom('room-b', room);
    expect(last(steps)).toEqual([null, 0, null]);
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(scene.setRoomItemsVisible).toHaveBeenLastCalledWith(true);
  });

  it("removes only the open room's scan", async () => {
    const { scans } = setup();
    await scans.switchRoom('room-b', room);
    await scans.open(file('b.spz'), room);
    await scans.remove();
    expect(deleteScan).toHaveBeenCalledTimes(1);
    expect(deleteScan).toHaveBeenCalledWith('room-b');
  });

  it("writes a finished alignment to its own room's record", async () => {
    const t = await alignedScan();
    await t.scans.finish(room);
    expect(updateScanAlignment).toHaveBeenCalledWith(expect.anything(), expect.any(Number), 'room-a');
  });

  it("is not stopped by a crash that happened while opening another room's scan", async () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup(undefined, 'room-b');
    vi.mocked(loadScan).mockResolvedValue(saved('b.spz'));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'ready', fileName: 'b.spz' });
  });

  it("doesn't reopen a scan whose last open never finished", async () => {
    storage.items.set(RESTORING, 'room-a');
    const { scans, statuses } = setup();
    vi.mocked(loadScan).mockResolvedValue(saved('a.spz'));
    await scans.restore(room);
    expect(last(statuses)).toMatchObject({ kind: 'error' });
    expect(loadScan).not.toHaveBeenCalled();
  });
});

describe('scanStatusParts', () => {
  const ready: Extract<ScanStatus, { kind: 'ready' }> = {
    kind: 'ready',
    fileName: 'room.spz',
    count: 1234,
    aligned: true,
    stored: true,
    alignmentKept: true,
    visible: true,
  };

  it('says nothing for no scan, and names the file while it loads', () => {
    expect(scanStatusParts({ kind: 'none' })).toEqual({ text: '', warning: null });
    expect(scanStatusParts({ kind: 'loading', fileName: 'room.spz' })).toEqual({ text: 'Loading room.spz…', warning: null });
  });

  it('has no warning when the scan and its alignment are kept', () => {
    expect(scanStatusParts(ready)).toEqual({ text: `room.spz: ${(1234).toLocaleString()} splats`, warning: null });
  });

  it('says the scan is only kept for this page when it is not stored', () => {
    expect(scanStatusParts({ ...ready, stored: false }).warning).toBe(' · only kept until you leave this page');
  });

  it('says only the alignment is not kept when the scan is stored but its alignment is not', () => {
    expect(scanStatusParts({ ...ready, alignmentKept: false }).warning).toBe(' · alignment only kept until you leave this page');
  });

  it('does not repeat itself when neither is kept: the scan warning covers it', () => {
    expect(scanStatusParts({ ...ready, stored: false, alignmentKept: false }).warning).toBe(' · only kept until you leave this page');
  });

  it('keeps "not aligned yet" in the main text, not the warning', () => {
    expect(scanStatusParts({ ...ready, aligned: false })).toEqual({
      text: `room.spz: ${(1234).toLocaleString()} splats · not aligned yet`,
      warning: null,
    });
  });

  it('passes an error message through', () => {
    expect(scanStatusParts({ kind: 'error', message: 'No.' })).toEqual({ text: 'No.', warning: null });
  });
});
