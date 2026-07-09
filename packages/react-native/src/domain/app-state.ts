/**
 * Pure mapping from React Native AppState statuses to bridge lifecycle
 * events (specs/bridge-protocol.md §host events). The initial `app.show`
 * on mount is the view's job, not AppState's — it fires before anything
 * else per the spec's ordering guarantee.
 */
export type HostLifecycleEvent = "app.show" | "app.hide";

export function hostEventForAppState(
  status: string,
): HostLifecycleEvent | null {
  if (status === "active") return "app.show";
  // "inactive" (covered: app switcher, incoming call) hides the mini-app
  // just like a full background transition.
  if (status === "background" || status === "inactive") return "app.hide";
  return null;
}
