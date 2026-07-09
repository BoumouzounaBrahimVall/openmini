/**
 * Ticket-03 spike shell. The native WebView screen (Swift/Kotlin) opens
 * automatically on launch; this RN screen sits behind it.
 */
import React from 'react';
import { SafeAreaView, StyleSheet, Text } from 'react-native';

export default function App(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.root}>
      <Text style={styles.title}>OpenMini spike host</Text>
      <Text style={styles.body}>
        The native WebView test screen opens automatically on launch.
        {'\n\n'}iOS: swipe the sheet down to come back here.
        {'\n'}Android: use the back button.
        {'\n\n'}Relaunch the app to run the checks again.
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  body: { fontSize: 15, lineHeight: 22, color: '#333' },
});
