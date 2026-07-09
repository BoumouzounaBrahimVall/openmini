/**
 * Non-persistent KvStorage — the provider's fallback so a host renders
 * mini-apps without extra dependencies. Data dies with the JS context;
 * production hosts should pass asyncStorageKv() (or their own adapter).
 */
import type { KvStorage } from "../ports/kv-storage.js";

export function memoryKvStorage(): KvStorage {
  const store = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(store.get(key) ?? null),
    set: (key, value) => {
      store.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      store.delete(key);
      return Promise.resolve();
    },
  };
}
