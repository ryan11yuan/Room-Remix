import type { Alignment } from './alignment';

/** A scan kept in this browser only, one per room, under the room's id. It is never uploaded. */
export type StoredScan = { fileName: string; bytes: ArrayBuffer; alignment: Alignment | null; savedAt: number };

const DB_NAME = 'room-remix';
const DB_VERSION = 1;
const STORE = 'scans';

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Storage was aborted'));
  });
}

function open(factory: IDBFactory): Promise<IDBDatabase> {
  const request = factory.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  return done(request);
}

async function withStore<T>(
  factory: IDBFactory,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const db = await open(factory);
  try {
    const tx = db.transaction(STORE, mode);
    const [result] = await Promise.all([work(tx.objectStore(STORE)), finished(tx)]);
    return result;
  } finally {
    db.close();
  }
}

const browserIndexedDB = () => globalThis.indexedDB;

export function saveScan(scan: StoredScan, key: string, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.put(scan, key));
  });
}

export function loadScan(key: string, factory: IDBFactory = browserIndexedDB()): Promise<StoredScan | null> {
  return withStore(factory, 'readonly', async (store) => ((await done(store.get(key))) as StoredScan | undefined) ?? null);
}

/**
 * Give the stored scan an alignment, but only if it is the scan the caller means: its `savedAt` must equal
 * `expectedSavedAt`. Reads and writes in one transaction, so a scan saved in between can't receive the old one's alignment.
 * Resolves true when written, false when skipped (nothing stored, or a different scan); rejects when storage fails.
 */
export function updateScanAlignment(
  alignment: Alignment | null,
  expectedSavedAt: number,
  key: string,
  factory: IDBFactory = browserIndexedDB(),
): Promise<boolean> {
  return withStore(factory, 'readwrite', async (store) => {
    const existing = (await done(store.get(key))) as StoredScan | undefined;
    if (!existing || existing.savedAt !== expectedSavedAt) return false;
    await done(store.put({ ...existing, alignment }, key));
    return true;
  });
}

export function deleteScan(key: string, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.delete(key));
  });
}

/** Delete every stored scan whose key isn't in `keep`: the scans of rooms that no longer exist. Resolves how many went. */
export function pruneScans(keep: readonly string[], factory: IDBFactory = browserIndexedDB()): Promise<number> {
  return withStore(factory, 'readwrite', async (store) => {
    const keys = await done(store.getAllKeys());
    const stale = keys.filter((key) => typeof key !== 'string' || !keep.includes(key));
    await Promise.all(stale.map((key) => done(store.delete(key))));
    return stale.length;
  });
}
