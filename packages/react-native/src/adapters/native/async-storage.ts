/**
 * KvStorage over @react-native-async-storage/async-storage (an OPTIONAL
 * peer). Exposed only through the "./async-storage" subpath export so hosts
 * that bring their own storage never bundle — or install — the dependency.
 * Keys arrive already namespaced by the bridge host.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KvStorage } from "../../ports/kv-storage.js";

export function asyncStorageKv(): KvStorage {
  return {
    get: (key) => AsyncStorage.getItem(key),
    set: async (key, value) => {
      await AsyncStorage.setItem(key, value);
    },
    remove: async (key) => {
      await AsyncStorage.removeItem(key);
    },
  };
}
