import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { defaultRoom } from '@/lib/room/roomState';
import type { Dims, Vec3 } from '@/lib/room/types';
import type { Alignment } from './alignment';
import type { RoomScene } from './RoomScene';
import { ScanController, SPLAT_WARN_COUNT, type ScanStatus, type ScanUiStep } from './ScanController';
import { deleteScan, loadScan, saveScan, updateScanAlignment } from './scanStore';

type Loaded = { count: number; min: Vec3; max: Vec3 };
type FakeLayer = { crops: Array<Dims | null>; alignments: Array<Alignment | null>; visible: boolean[]; disposed: boolean };

// Spark can't run in node, so the layer is a recorder; the controller reaches it only through a dynamic import.
const h = vi.hoisted(() => ({
  layers: [] as FakeLayer[],
  load: (async () => ({ count: 0, min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } })) as (
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
const good: Loaded = { count: 1000, min: { x: 0, y: 0, z: 0 }, max: { x: 4, y: 2, z: 2 } };
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

function setup() {
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
  const scans = new ScanController(scene as unknown as RoomScene, {
    status: (s) => statuses.push(s),
    step: (step, taps, hint) => steps.push([step, taps, hint]),
  });
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

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  vi.resetAllMocks();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  h.layers.length = 0;
  h.load = async () => good;
  vi.mocked(loadScan).mockResolvedValue(null);
  vi.mocked(saveScan).mockResolvedValue(undefined);
  vi.mocked(updateScanAlignment).mockResolvedValue(undefined);
  vi.mocked(deleteScan).mockResolvedValue(undefined);
});

describe('ScanController opening a file', () => {
  it('shows the scan unaligned, keeps it, and leaves the room tinted', async () => {
    const { scans, scene, statuses } = setup();
    await scans.open(file('room.spz'), room);
    expect(statuses[0]).toEqual({ kind: 'loading', fileName: 'room.spz' });
    expect(last(statuses)).toEqual({ kind: 'ready', fileName: 'room.spz', count: 1000, aligned: false, stored: true, visible: true });
    expect(saveScan).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'room.spz', alignment: null }));
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
    expect(last(statuses)).toEqual({ kind: 'ready', fileName: 'kept.spz', count: 1000, aligned: true, stored: true, visible: true });
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
    expect(updateScanAlignment).toHaveBeenCalledWith(last(h.layers[0].alignments));
    expect(h.layers[0].crops).toEqual([room.dims]);
    expect(scene.setScanTargets).toHaveBeenLastCalledWith([]);
    expect(scene.setShellStyle).toHaveBeenLastCalledWith('outline');
    expect(scene.setTapMode).toHaveBeenLastCalledWith('none');
    expect(last(steps)).toEqual([null, 0, null]);
    expect(last(statuses)).toMatchObject({ kind: 'ready', aligned: true });
  });

  it('still applies the alignment this session when it cannot be saved, and says it is not kept', async () => {
    vi.mocked(updateScanAlignment).mockRejectedValue(new Error('quota'));
    const { scans, statuses } = await alignedScan();
    await scans.finish(room);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: false });
    expect(last(h.layers[0].alignments)).not.toBeNull();
  });

  it('shows the scan as aligned before it waits for the alignment to be saved', async () => {
    const { scans, statuses } = await alignedScan();
    const write = deferred<void>();
    vi.mocked(updateScanAlignment).mockReturnValue(write.promise);
    const finishing = scans.finish(room);
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true }); // nothing awaited yet
    write.resolve();
    await finishing;
    expect(last(statuses)).toMatchObject({ aligned: true, stored: true });
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
    expect(deleteScan).toHaveBeenCalled();
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
    expect(deleteScan).toHaveBeenCalled();
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
