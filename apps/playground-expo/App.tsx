/**
 * Expo playground: proves @openmini/react-native works in an
 * Expo dev build after `expo prebuild` — the config plugin applies whatever
 * native config the module needs (today: nothing beyond autolinking).
 * Renders the todo example from the Metro-served static registry, exactly
 * like the bare-RN playground.
 */
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { NativeModules, StyleSheet, Text, View } from "react-native";
import {
  defineHostApi,
  MiniAppProvider,
  MiniAppView,
} from "@openmini/react-native";
import { asyncStorageKv } from "@openmini/react-native/async-storage";
import { z } from "zod";

function metroOrigin(): string | null {
  const scriptURL: string | undefined =
    NativeModules?.SourceCode?.getConstants?.()?.scriptURL;
  const match = scriptURL ? /^https?:\/\/[^/]+/.exec(scriptURL) : null;
  return match ? match[0] : null;
}

const CUSTOM_APIS = [
  defineHostApi({
    name: "hostGreeting",
    request: z.object({ who: z.string() }),
    response: z.object({ message: z.string() }),
    handler: ({ who }) => ({ message: `hello ${who}, from the EXPO host` }),
  }),
];

export default function App() {
  const [status, setStatus] = useState<string | null>(null);
  const origin = metroOrigin();
  return (
    <View style={styles.page}>
      <StatusBar style="auto" />
      <Text style={styles.title}>OpenMini Expo playground</Text>
      {status !== null && <Text style={styles.error}>{status}</Text>}
      {origin === null ? (
        <Text style={styles.error}>
          no Metro scriptURL — run a dev build (npx expo run:android/ios)
        </Text>
      ) : (
        <MiniAppProvider
          registryUrl={`${origin}/registry`}
          storage={asyncStorageKv()}
          customApis={CUSTOM_APIS}
        >
          <MiniAppView
            appId="com.example.todo"
            onClose={() => setStatus("mini-app closed")}
            onError={(error) => setStatus(String(error))}
            style={styles.mini}
          />
        </MiniAppProvider>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f5f7fb", paddingTop: 56 },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  error: { color: "#c1121f", paddingHorizontal: 16, paddingBottom: 6 },
  mini: { flex: 1 },
});
