/** Minimal file operations the resolver needs; native adapters under adapters/native/. */
export interface FileStore {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string | null>;
  writeFile(path: string, content: Uint8Array | string): Promise<void>;
  /** Atomic within the same volume. */
  rename(from: string, to: string): Promise<void>;
  removeDir(path: string): Promise<void>;
}
