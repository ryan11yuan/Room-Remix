import type { Alignment } from './alignment';

/** A scan kept in this browser only. It is never uploaded. */
export type StoredScan = { fileName: string; bytes: ArrayBuffer; alignment: Alignment | null; savedAt: number };

export const CURRENT_SCAN = 'current';
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

export function saveScan(scan: StoredScan, key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.put(scan, key));
  });
}

export function loadScan(key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<StoredScan | null> {
  return withStore(factory, 'readonly', async (store) => ((await done(store.get(key))) as StoredScan | undefined) ?? null);
}

export function updateScanAlignment(
  alignment: Alignment | null,
  key = CURRENT_SCAN,
  factory: IDBFactory = browserIndexedDB(),
): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    const existing = (await done(store.get(key))) as StoredScan | undefined;
    if (existing) await done(store.put({ ...existing, alignment }, key));
  });
}

export function deleteScan(key = CURRENT_SCAN, factory: IDBFactory = browserIndexedDB()): Promise<void> {
  return withStore(factory, 'readwrite', async (store) => {
    await done(store.delete(key));
  });
}
