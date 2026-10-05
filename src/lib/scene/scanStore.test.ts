import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Alignment } from './alignment';
import { deleteScan, loadScan, pruneScans, saveScan, updateScanAlignment, type StoredScan } from './scanStore';

const KEY = 'room-a';
const alignment: Alignment = { level: [0, 0, 0, 1], scale: 2, yaw: 0.5, offset: { x: 1, y: 0, z: -1 } };
const scan = (): StoredScan => ({ fileName: 'bedroom.spz', bytes: Uint8Array.of(1, 2, 3, 250).buffer, alignment: null, savedAt: 1 });

describe('scanStore', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadScan(KEY, new IDBFactory())).toBeNull();
  });

  it('round-trips the file bytes and name', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), KEY, factory);
    const loaded = await loadScan(KEY, factory);
    expect(loaded?.fileName).toBe('bedroom.spz');
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
    expect(loaded?.alignment).toBeNull();
  });

  it('updates the alignment without touching the bytes when the stored scan is the expected one', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), KEY, factory);
    expect(await updateScanAlignment(alignment, scan().savedAt, KEY, factory)).toBe(true);
    const loaded = await loadScan(KEY, factory);
    expect(loaded?.alignment).toEqual(alignment);
    expect(loaded?.savedAt).toBe(scan().savedAt);
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
  });

  it('skips the alignment update when a different scan is stored', async () => {
    const factory = new IDBFactory();
    await saveScan({ ...scan(), savedAt: 2 }, KEY, factory);
    expect(await updateScanAlignment(alignment, 1, KEY, factory)).toBe(false);
    const loaded = await loadScan(KEY, factory);
    expect(loaded?.alignment).toBeNull();
    expect(loaded?.savedAt).toBe(2);
  });

  it('skips the alignment update when nothing is stored, and stores nothing', async () => {
    const factory = new IDBFactory();
    expect(await updateScanAlignment(alignment, 1, KEY, factory)).toBe(false);
    expect(await loadScan(KEY, factory)).toBeNull();
  });

  it('rejects when the alignment cannot be written', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), KEY, factory);
    const unstorable = { level: [0, 0, 0, 1], scale: () => {}, yaw: 0, offset: { x: 0, y: 0, z: 0 } } as unknown as Alignment;
    const error = await updateScanAlignment(unstorable, 1, KEY, factory).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
  });

  it('deletes the scan', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), KEY, factory);
    await deleteScan(KEY, factory);
    expect(await loadScan(KEY, factory)).toBeNull();
  });

  it('keeps scans under different keys apart', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), 'a', factory);
    expect(await loadScan('b', factory)).toBeNull();
    expect((await loadScan('a', factory))?.fileName).toBe('bedroom.spz');
  });

  it('rejects with a real error when the data cannot be stored', async () => {
    const factory = new IDBFactory();
    const unstorable = { ...scan(), bytes: (() => {}) as unknown as ArrayBuffer };
    const error = await saveScan(unstorable, KEY, factory).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBeTruthy();
  });

  it('rejects with the real error when a write fails inside the transaction', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('room-remix', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('scans').createIndex('byName', 'fileName', { unique: true });
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
    await saveScan(scan(), 'a', factory);
    const error = await saveScan(scan(), 'b', factory).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe('ConstraintError');
  });

  it('prunes the scans of rooms that no longer exist', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), 'kept', factory);
    await saveScan(scan(), 'gone', factory);
    await saveScan(scan(), 'current', factory); // stored before scans were kept per room
    expect(await pruneScans(['kept', 'never-scanned'], factory)).toBe(2);
    expect(await loadScan('kept', factory)).not.toBeNull();
    expect(await loadScan('gone', factory)).toBeNull();
    expect(await loadScan('current', factory)).toBeNull();
  });

  it('prunes nothing from an empty store', async () => {
    expect(await pruneScans(['kept'], new IDBFactory())).toBe(0);
  });
});
