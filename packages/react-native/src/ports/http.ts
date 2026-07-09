export interface HttpClient {
  /** Returns null on 404 (missing app); throws on network failure. */
  getText(url: string): Promise<string | null>;
  getBytes(url: string): Promise<Uint8Array>;
}
