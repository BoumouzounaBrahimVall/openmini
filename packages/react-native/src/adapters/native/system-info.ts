/**
 * system.getInfo adapter over React Native platform APIs. Returns a factory
 * so each call reflects CURRENT dimensions/theme (rotation, appearance
 * changes), not a mount-time snapshot.
 */
import { Appearance, Dimensions, Platform } from "react-native";
import { BRIDGE_VERSION, type SystemInfo } from "@openmini/runtime";
import { OPENMINI_REACT_NATIVE_VERSION } from "../../version.js";

export function rnSystemInfo(
  overrides: Partial<SystemInfo> = {},
): () => SystemInfo {
  return () => {
    const { width, height, scale } = Dimensions.get("window");
    let locale = "en-US";
    try {
      locale = new Intl.DateTimeFormat().resolvedOptions().locale || "en-US";
    } catch {
      // Hermes built without Intl: keep the fallback.
    }
    return {
      platform: Platform.OS === "ios" ? "ios" : "android",
      osVersion: String(Platform.Version),
      hostSdkVersion: OPENMINI_REACT_NATIVE_VERSION,
      bridgeVersion: BRIDGE_VERSION,
      locale,
      theme: Appearance.getColorScheme() === "dark" ? "dark" : "light",
      screen: { width, height, scale },
      // Real insets arrive with <MiniAppView>; override until then.
      safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      ...overrides,
    };
  };
}
