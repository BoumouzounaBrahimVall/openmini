/**
 * <MiniAppView> — the developer-facing way to run a mini-app:
 *
 * ```tsx
 * <MiniAppProvider registryUrl="https://miniapps.example.com">
 *   <MiniAppView appId="com.example.todo" onClose={() => nav.goBack()} />
 * </MiniAppProvider>
 * ```
 *
 * Composition: resolver (download → verify → cache) → OpenMiniWebView
 * (scheme-served, CSP-enforced) → bridge host (permissions, host.* APIs).
 * This is a PLAIN EMBEDDED VIEW on both platforms — it never presents its
 * own sheet or modal (user decision 2026-07-09); page-style presentation
 * belongs to the host app's navigation.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { AppManifest } from "../domain/app-manifest.js";
import { parseAppManifest } from "../domain/app-manifest.js";
import { ResolverError } from "../domain/errors.js";
import { bindAppStateEvents } from "../adapters/native/app-state-events.js";
import { rnSystemInfo } from "../adapters/native/system-info.js";
import {
  OpenMiniWebView,
  type OpenMiniWebViewHandle,
} from "../adapters/native/webview.js";
import { createBridgeHost, type BridgeHost } from "../usecases/bridge-host.js";
import { resolvePackage } from "../usecases/resolve-package.js";
import { useMiniAppContext } from "./provider.js";

/**
 * Resolve/verify failures arrive as ResolverError (typed `code`:
 * FETCH_FAILED, APP_NOT_FOUND, HASH_MISMATCH, BAD_PACKAGE, …); anything
 * else (load/runtime) as a plain Error.
 */
export type MiniAppError = ResolverError | Error;

export interface MiniAppViewProps {
  /** Registry app id, e.g. "com.example.todo". */
  appId: string;
  /** Exact version, a channel name, or "latest" (default). */
  version?: string;
  /** Path the mini-app opens on (available as boot context, bridge §1). */
  initialPath?: string;
  /** Launch parameters handed to the mini-app's boot context. */
  params?: Record<string, string>;
  /** Fires when the mini-app calls `mini.navigation.close()`. */
  onClose?: () => void;
  /** Fires once per failure to resolve, verify, or load the package. */
  onError?: (error: MiniAppError) => void;
  style?: StyleProp<ViewStyle>;
}

type Phase =
  | { name: "loading" }
  | { name: "error"; error: MiniAppError }
  | { name: "ready"; appDir: string; manifest: AppManifest; version: string };

export function MiniAppView({
  appId,
  version = "latest",
  initialPath,
  params,
  onClose,
  onError,
  style,
}: MiniAppViewProps) {
  const context = useMiniAppContext();
  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [toast, setToast] = useState<string | null>(null);
  const webRef = useRef<OpenMiniWebViewHandle>(null);
  const hostRef = useRef<BridgeHost | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Callbacks live in refs so a new inline prop doesn't tear the host down.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const showToast = useCallback((message: string, durationMs: number) => {
    setToast(message);
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), durationMs);
  }, []);

  // Resolve → verify → cache → read manifest.
  useEffect(() => {
    let cancelled = false;
    setPhase({ name: "loading" });
    (async () => {
      const cacheDir = await context.cacheDir();
      const resolved = await resolvePackage({
        registryUrl: context.registryUrl,
        appId,
        ref: version,
        cacheDir,
        http: context.http,
        files: context.files,
        hasher: context.hasher,
      });
      const manifest = parseAppManifest(
        await context.files.readText(`${resolved.appDir}/manifest.json`),
        `${appId}@${resolved.version}`,
      );
      if (cancelled) return;
      setPhase({
        name: "ready",
        appDir: resolved.appDir,
        manifest,
        version: resolved.version,
      });
    })().catch((cause: unknown) => {
      if (cancelled) return;
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setPhase({ name: "error", error });
      onErrorRef.current?.(error);
    });
    return () => {
      cancelled = true;
    };
  }, [appId, version, context]);

  // Bridge host lifecycle, tied to the resolved package.
  useEffect(() => {
    if (phase.name !== "ready") return;
    const host = createBridgeHost({
      appId,
      manifest: {
        permissions: phase.manifest.permissions,
        allowedDomains: phase.manifest.allowedDomains,
      },
      adapters: {
        storage: context.storage,
        showToast,
        systemInfo: rnSystemInfo(),
        close: () => onCloseRef.current?.(),
      },
      customApis: context.customApis,
    });
    hostRef.current = host;
    host.onOutbound((raw) => webRef.current?.postMessage(raw));
    host.emitEvent("app.show"); // fires before any other event (bridge spec)
    const unbind = bindAppStateEvents(host);
    return () => {
      unbind();
      host.destroy(); // final app.destroy, then the channel goes quiet
      hostRef.current = null;
    };
  }, [phase, appId, context, showToast]);

  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );

  if (phase.name === "loading") {
    return (
      <View style={[styles.center, style]}>
        <ActivityIndicator />
      </View>
    );
  }
  if (phase.name === "error") {
    return (
      <View style={[styles.center, style]}>
        <Text style={styles.error}>
          {phase.error instanceof ResolverError
            ? `${phase.error.code}: ${phase.error.message}`
            : phase.error.message}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.container, style]}>
      <OpenMiniWebView
        ref={webRef}
        packagePath={phase.appDir}
        entry={phase.manifest.entry}
        boot={{
          appId,
          appVersion: phase.version,
          ...(initialPath !== undefined ? { initialPath } : {}),
          ...(params !== undefined ? { params } : {}),
        }}
        onBridgeMessage={(raw) => hostRef.current?.handleMessage(raw)}
        style={styles.web}
      />
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  web: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#c1121f", padding: 16, textAlign: "center" },
  toast: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.85)",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: "#fff", fontSize: 14 },
});
