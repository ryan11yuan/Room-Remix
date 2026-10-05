import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import type { Alignment } from './alignment';
import { deleteScan, loadScan, saveScan, updateScanAlignment, type StoredScan } from './scanStore';

const alignment: Alignment = { level: [0, 0, 0, 1], scale: 2, yaw: 0.5, offset: { x: 1, y: 0, z: -1 } };
const scan = (): StoredScan => ({ fileName: 'bedroom.spz', bytes: Uint8Array.of(1, 2, 3, 250).buffer, alignment: null, savedAt: 1 });

describe('scanStore', () => {
  it('returns null when nothing is stored', async () => {
    expect(await loadScan(undefined, new IDBFactory())).toBeNull();
  });

  it('round-trips the file bytes and name', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    const loaded = await loadScan(undefined, factory);
    expect(loaded?.fileName).toBe('bedroom.spz');
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
    expect(loaded?.alignment).toBeNull();
  });

  it('updates the alignment without touching the bytes', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    await updateScanAlignment(alignment, undefined, factory);
    const loaded = await loadScan(undefined, factory);
    expect(loaded?.alignment).toEqual(alignment);
    expect(Array.from(new Uint8Array(loaded!.bytes))).toEqual([1, 2, 3, 250]);
  });

  it('ignores an alignment update when nothing is stored', async () => {
    const factory = new IDBFactory();
    await updateScanAlignment(alignment, undefined, factory);
    expect(await loadScan(undefined, factory)).toBeNull();
  });

  it('deletes the scan', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);
    await deleteScan(undefined, factory);
    expect(await loadScan(undefined, factory)).toBeNull();
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
    const error = await saveScan(unstorable, undefined, factory).then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBeTruthy();
  });

  it('rejects with a real error on constraint violation inside a transaction', async () => {
    const factory = new IDBFactory();
    await saveScan(scan(), undefined, factory);

    const forceConstraintError = async (): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        const request = factory.open('room-remix', 1);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('scans', 'readwrite');
          const store = tx.objectStore('scans');
          const addRequest = store.add(scan(), 'current');
          addRequest.onerror = () => reject(addRequest.error);
          addRequest.onsuccess = () => reject(new Error('Should have failed'));
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('Storage was aborted'));
          tx.oncomplete = () => resolve(null);
        };
        request.onerror = () => reject(request.error);
      });
    };

    const error = await forceConstraintError().then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBeTruthy();
  });
});
