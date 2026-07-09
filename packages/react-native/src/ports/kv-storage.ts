/**
 * Raw string key-value storage under the host. Namespacing
 * (`openmini:<appId>:<key>`) is applied by the bridge host use-case, so
 * adapters stay dumb and swappable (AsyncStorage, MMKV, in-memory tests).
 */
export interface KvStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}
