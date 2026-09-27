/**
 * Key-value storage on the phone: IndexedDB database "meubov" with one object
 * store per name, behind five functions, plus an in-memory twin for tests.
 *
 * Keys are explicit (no keyPath). The connection opens lazily on the first
 * call and is shared; each method runs in its own transaction and resolves
 * when that transaction completes, so a resolved `put` is on disk.
 */
export interface KeyValueStore<T> {
  get(key: string): Promise<T | undefined>;
  put(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<T[]>;
  clear(): Promise<void>;
}

export type StoreName = "snapshot" | "outbox" | "meta";

/** Thrown by every method where IndexedDB does not exist (server render, tests). */
export class NoIndexedDb extends Error {
  constructor() {
    super("IndexedDB is not available");
    this.name = "NoIndexedDb";
  }
}

const DB_NAME = "meubov";
const DB_VERSION = 1;
const STORE_NAMES: StoreName[] = ["snapshot", "outbox", "meta"];

let connection: Promise<IDBDatabase> | null = null;

/** The shared connection; a failed or closed one is reopened on the next call. */
function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new NoIndexedDb());
  if (!connection) {
    connection = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onclose = () => {
          connection = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    });
    connection.catch(() => {
      connection = null;
    });
  }
  return connection;
}

/** Runs one request in its own transaction and resolves with its result once committed. */
async function run<R>(
  name: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<R>
): Promise<R> {
  const db = await database();
  return new Promise<R>((resolve, reject) => {
    const tx = db.transaction(name, mode);
    const request = action(tx.objectStore(name));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openStore<T>(name: StoreName): KeyValueStore<T> {
  return {
    get: (key) => run(name, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>),
    put: async (key, value) => {
      await run(name, "readwrite", (s) => s.put(value, key));
    },
    delete: async (key) => {
      await run(name, "readwrite", (s) => s.delete(key));
    },
    list: () => run(name, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
    clear: async () => {
      await run(name, "readwrite", (s) => s.clear());
    },
  };
}

/** In-memory twin of `openStore`: copies values in and out as IndexedDB does. */
export function memoryStore<T>(): KeyValueStore<T> {
  const map = new Map<string, T>();
  return {
    get: async (key) => {
      const value = map.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    put: async (key, value) => {
      map.set(key, structuredClone(value));
    },
    delete: async (key) => {
      map.delete(key);
    },
    list: async () => [...map.values()].map((value) => structuredClone(value)),
    clear: async () => {
      map.clear();
    },
  };
}
