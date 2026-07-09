function set(id, ok, detail) {
  var el = document.getElementById(id);
  var label = id.replace('check-', '');
  el.textContent =
    (ok ? 'PASS' : 'FAIL') +
    ' — ' +
    label +
    (detail ? ' (' + detail + ')' : '');
  el.className = ok ? 'pass' : 'fail';
}
document.getElementById('origin').textContent = 'origin: ' + location.href;

// 1. served via custom scheme (iOS) or asset-loader domain (Android)
var viaScheme = location.protocol === 'openmini:';
var viaLoader = location.host === 'appassets.androidplatform.net';
set(
  'check-scheme',
  viaScheme || viaLoader,
  location.protocol + '//' + location.host,
);

// 2. css file loaded through the same channel
set(
  'check-css',
  getComputedStyle(document.body).getPropertyValue('--spike-css').trim() ===
    'loaded',
  '',
);

// 3. relative fetch resolves through the handler (no CORS/file:// failure)
fetch('./data.json')
  .then(function (r) {
    return r.json();
  })
  .then(function (d) {
    set('check-fetch', d.hello === 'openmini', JSON.stringify(d));
  })
  .catch(function (e) {
    set('check-fetch', false, String(e));
  });

// 4. JS -> native -> JS echo round-trip
window.__onNativeEcho = function (msg) {
  set('check-echo', msg === 'echo:ping', msg);
};
setTimeout(function () {
  try {
    if (
      window.webkit &&
      window.webkit.messageHandlers &&
      window.webkit.messageHandlers.spike
    ) {
      window.webkit.messageHandlers.spike.postMessage('ping');
    } else if (window.SpikeNative) {
      window.SpikeNative.echo('ping');
    } else {
      set('check-echo', false, 'no native bridge found');
    }
  } catch (e) {
    set('check-echo', false, String(e));
  }
}, 300);
