/** Mirrors the runtime's BootContext (bridge-protocol.md §1). */
export interface BootContext {
  appId: string;
  appVersion: string;
  initialPath?: string;
  params?: Record<string, string>;
}
