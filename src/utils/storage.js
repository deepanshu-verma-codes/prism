const DB_NAME = 'lumina-recorder';
const DB_VERSION = 1;
const STORE = 'recordings';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(storeMode, callback) {
  return openDatabase().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, storeMode);
    const store = tx.objectStore(STORE);
    const request = callback(store);
    tx.oncomplete = () => {
      db.close();
      resolve(request?.result);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  }));
}

export function saveRecording(recording) {
  return transaction('readwrite', (store) => store.put(recording));
}

export function getRecording(id) {
  return transaction('readonly', (store) => store.get(id));
}

export function deleteRecording(id) {
  return transaction('readwrite', (store) => store.delete(id));
}

export function listRecordings() {
  return transaction('readonly', (store) => {
    const request = store.getAll();
    request.onsuccess = () => {
      request.result.sort((a, b) => b.createdAt - a.createdAt);
    };
    return request;
  });
}
