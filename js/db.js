/* Thin promise wrapper over IndexedDB.
   Deliberately dumb: no query logic lives here. Record counts for a home aquarium
   stay in the thousands, so store.js keeps everything in memory and filters in JS.
   Swapping this file for a network-backed implementation is all that a future
   cloud-sync mode should require. */

const DB_NAME = 'reef-log';
// v2 added equipment, supplements, tasks and activities.
// v3 added photos. The upgrade handler creates whatever is missing, so bumping
// this is all a new store needs.
const DB_VERSION = 3;

/** Object store name -> key path. */
export const STORES = {
  tanks: 'id',
  params: 'id',
  readings: 'id',
  livestock: 'id',
  expenses: 'id',
  equipment: 'id',
  supplements: 'id',
  tasks: 'id',
  activities: 'id',
  // Full-size image Blobs, keyed by the livestock id they belong to. Kept out of
  // the record itself so the log stays small enough to back up and restore.
  photos: 'id',
  meta: 'key',
};

export const STORE_NAMES = Object.keys(STORES);

let dbPromise = null;

export function open() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support IndexedDB, which Reef Log uses to store your data.'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath });
        }
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Another tab is upgrading the schema: let go of this handle so it can proceed.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };

    req.onerror = () => reject(req.error || new Error('Could not open the local database.'));
    req.onblocked = () => reject(new Error('Reef Log is open in another tab that is blocking a database update. Close it and reload.'));
  });

  // Don't cache a rejected promise; a retry should get a fresh attempt.
  dbPromise.catch(() => { dbPromise = null; });

  return dbPromise;
}

/** Run a readwrite transaction; resolves once the transaction actually commits. */
function write(storeNames, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted.'));
    try {
      fn(tx);
    } catch (err) {
      try { tx.abort(); } catch { /* already aborting */ }
      reject(err);
    }
  }));
}

export function getAll(storeName) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
    tx.onabort = () => reject(tx.error || new Error('Database read aborted.'));
  }));
}

export function put(storeName, value) {
  return write(storeName, (tx) => { tx.objectStore(storeName).put(value); }).then(() => value);
}

export function putMany(storeName, values) {
  if (!values || !values.length) return Promise.resolve([]);
  return write(storeName, (tx) => {
    const store = tx.objectStore(storeName);
    for (const v of values) store.put(v);
  }).then(() => values);
}

export function remove(storeName, key) {
  return write(storeName, (tx) => { tx.objectStore(storeName).delete(key); }).then(() => key);
}

export function removeMany(storeName, keys) {
  if (!keys || !keys.length) return Promise.resolve([]);
  return write(storeName, (tx) => {
    const store = tx.objectStore(storeName);
    for (const k of keys) store.delete(k);
  }).then(() => keys);
}

export function clearAll() {
  return write(STORE_NAMES, (tx) => {
    for (const name of STORE_NAMES) tx.objectStore(name).clear();
  });
}

/**
 * Replace the contents of the named stores in one atomic transaction (used by
 * import). Only stores present as keys in `data` are touched: clearing every
 * store would also wipe ones the payload knows nothing about — restoring a
 * backup, which carries no photos, used to delete every stored photo this way.
 */
export function replaceAll(data) {
  const names = STORE_NAMES.filter((n) => Array.isArray(data[n]));
  if (!names.length) return Promise.resolve();

  return write(names, (tx) => {
    for (const name of names) {
      const store = tx.objectStore(name);
      store.clear();
      for (const row of data[name]) store.put(row);
    }
  });
}
