/**
 * MiniAppView demo: the public API end to end. <MiniAppView> resolves
 * com.example.todo from the Metro-served static registry (download → verify
 * → cache), renders it as a full-screen PAGE, and wires the bridge host —
 * storage on real AsyncStorage, one demo custom API, onClose popping back.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  defineHostApi,
  MiniAppProvider,
  MiniAppView,
} from '@openmini/react-native';
import { asyncStorageKv } from '@openmini/react-native/async-storage';
import { z } from 'zod';
import { metroOrigin } from './metroOrigin';

// Schema-validated host API: bad requests reach the mini-app as
// INVALID_PAYLOAD; in dev builds the response is checked too.
const CUSTOM_APIS = [
  defineHostApi({
    name: 'hostGreeting',
    request: z.object({ who: z.string() }),
    response: z.object({ message: z.string() }),
    handler: ({ who }) => ({ message: `hello ${who}, from the playground` }),
  }),
];

export default function MiniAppScreen({ onBack }: { onBack: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const origin = metroOrigin();
  if (origin === null) {
    return (
      <SafeAreaView style={styles.page}>
        <Text style={styles.error}>
          no Metro scriptURL — run a dev build from metro
        </Text>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.page} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ back</Text>
        </Pressable>
        <Text style={styles.title}>MiniAppView (todo)</Text>
      </View>
      {status !== null && <Text style={styles.status}>{status}</Text>}
      <MiniAppProvider
        registryUrl={`${origin}/registry`}
        storage={asyncStorageKv()}
        customApis={CUSTOM_APIS}
      >
        <MiniAppView
          appId="com.example.todo"
          onClose={onBack}
          onError={error => setStatus(String(error))}
          style={styles.mini}
        />
      </MiniAppProvider>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7fb' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { color: '#2563eb', fontSize: 17 },
  title: { fontSize: 15, fontWeight: '600', color: '#333' },
  status: { color: '#c1121f', paddingHorizontal: 16, paddingBottom: 6 },
  error: { color: '#c1121f', padding: 24 },
  mini: { flex: 1 },
});
