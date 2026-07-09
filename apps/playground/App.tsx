/**
 * Playground home: one entry per verification screen. Mini-apps present as
 * full-screen PAGES on both platforms (user decision 2026-07-09), so each
 * screen simply replaces the home view.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import ConformanceScreen from './ConformanceScreen';
import NativeModuleScreen from './NativeModuleScreen';
import MiniAppScreen from './MiniAppScreen';

type Screen = 'home' | 'native' | 'conformance' | 'miniapp';

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  let content;
  if (screen === 'native') {
    content = <NativeModuleScreen onBack={() => setScreen('home')} />;
  } else if (screen === 'conformance') {
    content = <ConformanceScreen onBack={() => setScreen('home')} />;
  } else if (screen === 'miniapp') {
    content = <MiniAppScreen onBack={() => setScreen('home')} />;
  } else {
    content = (
      <SafeAreaView style={styles.page}>
        <Text style={styles.title}>OpenMini playground</Text>
        <Pressable style={styles.item} onPress={() => setScreen('miniapp')}>
          <Text style={styles.itemText}>MiniAppView (todo)</Text>
        </Pressable>
        <Pressable style={styles.item} onPress={() => setScreen('conformance')}>
          <Text style={styles.itemText}>bridge host conformance</Text>
        </Pressable>
        <Pressable style={styles.item} onPress={() => setScreen('native')}>
          <Text style={styles.itemText}>native module checks</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  return <SafeAreaProvider>{content}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f5f7fb', padding: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12, color: '#111' },
  item: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d5dae3',
  },
  itemText: { fontSize: 16, color: '#2563eb', fontWeight: '600' },
});
