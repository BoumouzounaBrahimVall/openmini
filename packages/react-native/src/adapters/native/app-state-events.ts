/**
 * Bridges React Native AppState changes to app.show/app.hide host events
 * (mapping lives in domain/app-state.ts). Consecutive duplicates are
 * suppressed so iOS's inactive->background double transition emits one
 * app.hide. Returns an unsubscribe; call it before host.destroy().
 */
import { AppState } from "react-native";
import { hostEventForAppState } from "../../domain/app-state.js";

export function bindAppStateEvents(host: {
  emitEvent(event: string, payload?: unknown): void;
}): () => void {
  let last: string | null = null;
  const subscription = AppState.addEventListener("change", (status) => {
    const event = hostEventForAppState(status);
    if (event !== null && event !== last) {
      last = event;
      host.emitEvent(event);
    }
  });
  return () => subscription.remove();
}
