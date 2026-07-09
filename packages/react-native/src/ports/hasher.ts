export interface Hasher {
  sha256(bytes: Uint8Array): Promise<string> | string;
}
