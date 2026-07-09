/**
 * Native-module verification screen: a full-screen PAGE (no sheet) hosting
 * OpenMiniWebView over a locally installed test site. Exercises the native
 * files module, scheme serving, MIME, traversal guard, and the message
 * channel in both directions (RN echoes bridge messages back).
 */
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  nativeCacheDir,
  nativeFileStore,
  OpenMiniWebView,
  type OpenMiniWebViewHandle,
} from '@openmini/react-native';

const SITE: Record<string, string> = {
  'index.html': `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>openmini-checks</title><link rel="stylesheet" href="./style.css"/></head>
<body><h1>OpenMini native module</h1><p id="origin"></p><ul>
<li id="check-scheme">scheme ...</li><li id="check-css">css ...</li>
<li id="check-fetch">relative fetch ...</li><li id="check-traversal">traversal guard ...</li>
<li id="check-echo">bridge echo ...</li></ul>
<script src="./app.js"></script></body></html>`,
  'style.css': `body{--t13:loaded;font-family:system-ui;background:#f5f7fb;padding:24px}
li{font-size:17px;margin:10px 0;list-style:none}
.pass{color:#0a7d24;font-weight:700}.fail{color:#c1121f;font-weight:700}
#origin{color:#556;font-size:12px;word-break:break-all}`,
  'app.js': `function set(id, ok, detail) {
  var el = document.getElementById(id);
  el.textContent = (ok ? "PASS" : "FAIL") + " - " + id.replace("check-", "") + (detail ? " (" + detail + ")" : "");
  el.className = ok ? "pass" : "fail";
}
document.getElementById("origin").textContent = location.href;
set("check-scheme", location.protocol === "openmini:" || location.host === "appassets.androidplatform.net", location.protocol + "//" + location.host);
set("check-css", getComputedStyle(document.body).getPropertyValue("--t13").trim() === "loaded", "");
fetch("./data.json").then(function (r) { return r.json(); }).then(function (d) {
  set("check-fetch", d.hello === "openmini", JSON.stringify(d));
}).catch(function (e) { set("check-fetch", false, String(e)); });
fetch("../../../etc/passwd").then(function (r) {
  set("check-traversal", r.status === 404 || !r.ok, "status " + r.status);
}).catch(function () { set("check-traversal", true, "request refused"); });
window.__OPENMINI_ONMESSAGE__ = function (raw) { set("check-echo", raw === "echo:ping", raw); };
setTimeout(function () {
  try { window.__OPENMINI_HOST__.postMessage("ping"); }
  catch (e) { set("check-echo", false, String(e)); }
}, 300);`,
  'data.json': `{"hello":"openmini"}`,
};

export default function NativeModuleScreen({ onBack }: { onBack: () => void }) {
  const [sitePath, setSitePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const webRef = useRef<OpenMiniWebViewHandle>(null);

  useEffect(() => {
    (async () => {
      try {
        // Exercises the OpenMiniFiles module: the site is served from a real
        // app-data directory, exactly like a resolved package would be.
        const base = await nativeCacheDir();
        const dir = `${base}/native-checks-site`;
        for (const [name, content] of Object.entries(SITE)) {
          await nativeFileStore.writeFile(`${dir}/${name}`, content);
        }
        setSitePath(dir);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  let body;
  if (error) {
    body = <Text style={styles.error}>{error}</Text>;
  } else if (!sitePath) {
    body = <Text>installing test site…</Text>;
  }
  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ back</Text>
        </Pressable>
        <Text style={styles.title}>native module checks</Text>
      </View>
      {body ? (
        <View style={styles.center}>{body}</View>
      ) : (
        <OpenMiniWebView
          ref={webRef}
          packagePath={sitePath as string}
          boot={{ appId: 'com.example.checks', appVersion: '0.0.0' }}
          onBridgeMessage={raw => {
            console.log('[playground] bridge message up:', raw);
            webRef.current?.postMessage(`echo:${raw}`);
          }}
          style={styles.web}
        />
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
  web: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  error: { color: '#c1121f' },
});
