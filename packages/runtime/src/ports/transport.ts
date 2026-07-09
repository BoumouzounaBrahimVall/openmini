/**
 * The runtime's ONLY window to the outside world (specs/architecture.md).
 * Host bindings (WebView, dev server, tests) implement this.
 */
export interface Transport {
  send(raw: string): void;
  onMessage(cb: (raw: string) => void): void;
}

/** Provided by the host binding before the mini-app mounts (bridge spec §1). */
export interface BootContext {
  appId: string;
  appVersion: string;
  initialPath?: string;
  params?: Record<string, string>;
}
