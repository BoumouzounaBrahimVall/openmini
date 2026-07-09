/**
 * On-device conformance driver: runs the golden conformance suite IN the app against the
 * real RN bridge host — real AsyncStorage, real fetch, real system info.
 * Network fixtures hit the Metro origin: metro.config.js serves the echo
 * convention (GET /echo -> 200 {"ok":true}) on the same server that ships
 * the bundle, so no extra process is needed on either platform.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  bindAppStateEvents,
  createBridgeHost,
  rnSystemInfo,
  type BridgeHost,
  type BridgeHostAdapters,
} from '@openmini/react-native';
import { asyncStorageKv } from '@openmini/react-native/async-storage';
import { applyPlaceholders, runSuite } from '../../conformance/src/suite';
import { metroOrigin } from './metroOrigin';
import type {
  ConformanceAdapter,
  FixtureFile,
  HostEventName,
  Report,
  SessionManifest,
} from '../../conformance/src/types';

// Metro bundles these straight from the conformance package — the fixtures
// on device are byte-identical to the ones every other host is tested with.
const FIXTURES = [
  require('../../conformance/fixtures/envelope.json'),
  require('../../conformance/fixtures/host-custom.json'),
  require('../../conformance/fixtures/host-events.json'),
  require('../../conformance/fixtures/navigation-close.json'),
  require('../../conformance/fixtures/network-request.json'),
  require('../../conformance/fixtures/storage.json'),
  require('../../conformance/fixtures/system-info.json'),
  require('../../conformance/fixtures/ui-toast.json'),
] as FixtureFile[];

function callOnce(
  host: BridgeHost,
  api: string,
  payload: unknown,
): Promise<{ result?: { value?: string | null } }> {
  return new Promise(resolve => {
    host.onOutbound(raw => resolve(JSON.parse(raw)));
    host.handleMessage(
      JSON.stringify({ v: 1, type: 'bridge.call', id: 'iso', api, payload }),
    );
  });
}

export default function ConformanceScreen({ onBack }: { onBack: () => void }) {
  const [toast, setToast] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [isolation, setIsolation] = useState('…');
  const [lifecycle, setLifecycle] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runCounter = useRef(0);

  const showToast = useCallback((message: string, durationMs: number) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast(null),
      Math.min(durationMs, 2000),
    );
  }, []);

  const adapters = useCallback(
    (): BridgeHostAdapters => ({
      storage: asyncStorageKv(),
      showToast,
      systemInfo: rnSystemInfo(),
      close: () => showToast('navigation.close requested', 1200),
    }),
    [showToast],
  );

  // Long-lived demo host: AppState changes -> app.show/app.hide on screen,
  // unmount -> app.destroy (the AC's "view unmount" path).
  useEffect(() => {
    const host = createBridgeHost({
      appId: 'lifecycle-demo',
      manifest: { permissions: [], allowedDomains: [] },
      adapters: adapters(),
    });
    host.onOutbound(raw => {
      const msg = JSON.parse(raw) as { type?: string; event?: string };
      if (msg.type === 'host.event' && msg.event) {
        setLifecycle(prev => [...prev.slice(-4), msg.event as string]);
      }
    });
    host.emitEvent('app.show'); // initial mount fires first, per spec ordering
    const unbind = bindAppStateEvents(host);
    return () => {
      unbind();
      host.destroy();
    };
  }, [adapters]);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setReport(null);
    setIsolation('…');
    try {
      const origin = metroOrigin();
      if (!origin) {
        throw new Error('no Metro scriptURL — run a dev build from metro');
      }
      const runId = `run${++runCounter.current}`;
      let sessions = 0;
      const adapter: ConformanceAdapter = {
        name: 'react-native-host (on-device)',
        openSession(manifest: SessionManifest) {
          const host = createBridgeHost({
            appId: `conf-${runId}-${++sessions}`, // fresh storage namespace
            manifest,
            adapters: adapters(),
            customApis: { conformanceEcho: payload => payload ?? null },
          });
          return {
            send: (raw: string) => host.handleMessage(raw),
            onMessage: (cb: (raw: string) => void) => host.onOutbound(cb),
            triggerEvent: (event: HostEventName) => host.emitEvent(event),
            capabilities: ['customApis'],
            close: () => {},
          };
        },
      };
      const fixtures = applyPlaceholders(FIXTURES, {
        ALLOWED_ORIGIN: origin,
        BLOCKED_ORIGIN: 'https://blocked.test',
      });
      setReport(await runSuite(adapter, fixtures, { timeoutMs: 5000 }));

      // Cross-app isolation on the REAL AsyncStorage: iso-b must not see
      // what iso-a wrote under the same bare key.
      const mk = (appId: string) =>
        createBridgeHost({
          appId: `${appId}-${runId}`,
          manifest: { permissions: ['storage'], allowedDomains: [] },
          adapters: adapters(),
        });
      await callOnce(mk('iso-a'), 'storage.set', { key: 'k', value: 'secret' });
      const got = await callOnce(mk('iso-b'), 'storage.get', { key: 'k' });
      setIsolation(
        got.result?.value === null
          ? 'PASS — appIds cannot read each other'
          : `FAIL — leaked ${JSON.stringify(got.result?.value)}`,
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }, [adapters]);

  useEffect(() => {
    void run();
  }, [run]);

  const allGreen =
    report !== null && report.failed === 0 && report.skipped === 0;
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ back</Text>
        </Pressable>
        <Text style={styles.title}>bridge host conformance</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        {running && <Text style={styles.label}>running suite…</Text>}
        {error !== null && <Text style={styles.fail}>{error}</Text>}
        {report !== null && (
          <>
            <Text style={allGreen ? styles.pass : styles.fail}>
              {`PASSED ${report.passed} · FAILED ${report.failed} · SKIPPED ${report.skipped}`}
            </Text>
            {report.failures.map((f, i) => (
              <Text key={i} style={styles.fail}>
                {`${f.fixture} › ${f.test} [step ${f.step}]\n${f.message}`}
              </Text>
            ))}
            {report.skippedTests.map((s, i) => (
              <Text key={i} style={styles.warn}>
                {`skipped: ${s.fixture} › ${s.test} (${s.reason})`}
              </Text>
            ))}
          </>
        )}
        <Text style={styles.label}>storage isolation: {isolation}</Text>
        <Text style={styles.label}>
          lifecycle: {lifecycle.join(' → ') || '…'}
        </Text>
        <Text style={styles.hint}>
          background & reopen the app to see app.hide → app.show
        </Text>
        <Pressable
          style={styles.button}
          onPress={() => void run()}
          disabled={running}
        >
          <Text style={styles.buttonText}>run again</Text>
        </Pressable>
      </ScrollView>
      {toast !== null && (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
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
  body: { padding: 16, gap: 10 },
  label: { fontSize: 15, color: '#333' },
  hint: { fontSize: 12, color: '#889' },
  pass: { color: '#0a7d24', fontSize: 17, fontWeight: '700' },
  fail: { color: '#c1121f', fontSize: 14, fontWeight: '600' },
  warn: { color: '#b45309', fontSize: 14 },
  button: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  toast: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  toastText: { color: '#fff', fontSize: 14 },
});
