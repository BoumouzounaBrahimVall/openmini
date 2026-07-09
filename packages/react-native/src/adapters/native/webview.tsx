/**
 * Embedded native WebView serving a verified package directory through
 * platform scheme handlers (specs/webview-serving.md). This is a plain view:
 * it fills its frame and NEVER presents its own sheet/modal (user decision
 * 2026-07-09) - page-style presentation belongs to the host app's navigation.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import {
  findNodeHandle,
  Platform,
  requireNativeComponent,
  UIManager,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { BootContext } from "../../domain/boot.js";
import { buildBootstrapScript } from "./bootstrap.js";

interface NativeProps {
  packagePath: string;
  entry: string;
  bootstrapScript: string;
  onBridgeMessage?: (event: NativeSyntheticEvent<{ raw: string }>) => void;
  style?: StyleProp<ViewStyle>;
}

const NativeView = requireNativeComponent<NativeProps>("OpenMiniWebView");

export interface OpenMiniWebViewHandle {
  /** Host -> mini-app delivery (bridge results and host events). */
  postMessage(raw: string): void;
}

export interface OpenMiniWebViewProps {
  /** Directory of a VERIFIED, extracted package (resolver output). */
  packagePath: string;
  boot: BootContext;
  entry?: string;
  onBridgeMessage?: (raw: string) => void;
  style?: StyleProp<ViewStyle>;
}

export const OpenMiniWebView = forwardRef<
  OpenMiniWebViewHandle,
  OpenMiniWebViewProps
>(function OpenMiniWebViewComponent(
  { packagePath, boot, entry = "index.html", onBridgeMessage, style },
  ref,
) {
  const nativeRef = useRef<React.ElementRef<typeof NativeView>>(null);
  useImperativeHandle(ref, () => ({
    postMessage(raw: string) {
      const tag = findNodeHandle(nativeRef.current);
      if (tag === null) return;
      // Interop-supported command dispatch on BOTH platforms (NativeModules
      // view-manager lookup does not exist under the bridgeless new arch).
      UIManager.dispatchViewManagerCommand(tag, "postMessage", [raw]);
    },
  }));
  return (
    <NativeView
      ref={nativeRef}
      packagePath={packagePath}
      entry={entry}
      bootstrapScript={buildBootstrapScript(
        Platform.OS === "ios" ? "ios" : "android",
        boot,
      )}
      onBridgeMessage={
        onBridgeMessage ? (e) => onBridgeMessage(e.nativeEvent.raw) : undefined
      }
      style={style}
    />
  );
});
