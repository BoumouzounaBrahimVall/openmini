import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "OpenMiniSpike",
      in: window,
      launchOptions: launchOptions
    )

    SpikeLauncher.present(over: window)
    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

// ===== OpenMini ticket-03 spike (throwaway) =====
// Serves a local folder into a WKWebView via WKURLSchemeHandler and proves a
// JS<->native echo round-trip. Site files are written to Documents first,
// because production serves from an arbitrary cache dir, not the app bundle.
import WebKit

enum SpikeSite {
  static let files: [String: String] = [
    "index.html": #"""
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenMini spike</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body>
    <h1>OpenMini WebView spike</h1>
    <p id="origin">origin: ?</p>
    <ul>
      <li id="check-scheme">scheme serving &hellip;</li>
      <li id="check-css">css asset &hellip;</li>
      <li id="check-fetch">relative fetch &hellip;</li>
      <li id="check-echo">native echo &hellip;</li>
    </ul>
    <script src="./app.js"></script>
  </body>
</html>
"""#,
    "style.css": #"""
body {
  --spike-css: loaded;
  font-family: -apple-system, Roboto, sans-serif;
  background: #f5f7fb;
  padding: 24px;
}
li { font-size: 18px; margin: 10px 0; list-style: none; }
.pass { color: #0a7d24; font-weight: 700; }
.fail { color: #c1121f; font-weight: 700; }
#origin { color: #555; font-size: 13px; word-break: break-all; }
"""#,
    "app.js": #"""
function set(id, ok, detail) {
  var el = document.getElementById(id);
  var label = id.replace("check-", "");
  el.textContent = (ok ? "PASS" : "FAIL") + " — " + label + (detail ? " (" + detail + ")" : "");
  el.className = ok ? "pass" : "fail";
}
document.getElementById("origin").textContent = "origin: " + location.href;
var viaScheme = location.protocol === "openmini:";
var viaLoader = location.host === "appassets.androidplatform.net";
set("check-scheme", viaScheme || viaLoader, location.protocol + "//" + location.host);
set("check-css", getComputedStyle(document.body).getPropertyValue("--spike-css").trim() === "loaded", "");
fetch("./data.json")
  .then(function (r) { return r.json(); })
  .then(function (d) { set("check-fetch", d.hello === "openmini", JSON.stringify(d)); })
  .catch(function (e) { set("check-fetch", false, String(e)); });
window.__onNativeEcho = function (msg) { set("check-echo", msg === "echo:ping", msg); };
setTimeout(function () {
  try {
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.spike) {
      window.webkit.messageHandlers.spike.postMessage("ping");
    } else if (window.SpikeNative) {
      window.SpikeNative.echo("ping");
    } else {
      set("check-echo", false, "no native bridge found");
    }
  } catch (e) { set("check-echo", false, String(e)); }
}, 300);
"""#,
    "data.json": #"""
{ "hello": "openmini", "via": "relative fetch" }
"""#,
  ]

  static func install() -> URL {
    let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("spike-site", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    for (name, content) in files {
      try? content.data(using: .utf8)?.write(to: dir.appendingPathComponent(name))
    }
    return dir
  }
}

final class SpikeSchemeHandler: NSObject, WKURLSchemeHandler {
  private let root: URL
  init(root: URL) { self.root = root }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    var path = url.path
    if path.isEmpty || path == "/" { path = "/index.html" }
    let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    // Path-traversal guard: resolved file must stay inside the site root.
    guard file.path.hasPrefix(root.standardizedFileURL.path + "/") || file.path == root.standardizedFileURL.path,
          let data = FileManager.default.contents(atPath: file.path)
    else {
      task.didReceive(HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: [:])!)
      task.didReceive(Data())
      task.didFinish()
      return
    }
    let headers = [
      "Content-Type": Self.mime(file.pathExtension),
      "Content-Length": "\(data.count)",
      "Access-Control-Allow-Origin": "*",
    ]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

  private static func mime(_ ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "png": return "image/png"
    case "svg": return "image/svg+xml"
    default: return "application/octet-stream"
    }
  }
}

final class SpikeWebViewController: UIViewController, WKScriptMessageHandler {
  private var webView: WKWebView!

  override func viewDidLoad() {
    super.viewDidLoad()
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(SpikeSchemeHandler(root: SpikeSite.install()), forURLScheme: "openmini")
    config.userContentController.add(self, name: "spike")
    webView = WKWebView(frame: view.bounds, configuration: config)
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    if #available(iOS 16.4, *) { webView.isInspectable = true }
    view.addSubview(webView)
    webView.load(URLRequest(url: URL(string: "openmini://app/index.html")!))
  }

  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.name == "spike", let body = message.body as? String else { return }
    let escaped = ("echo:" + body)
      .replacingOccurrences(of: "\\", with: "\\\\")
      .replacingOccurrences(of: "\"", with: "\\\"")
    webView.evaluateJavaScript("window.__onNativeEcho(\"\(escaped)\")")
  }
}

enum SpikeLauncher {
  static func present(over window: UIWindow?) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      window?.rootViewController?.present(SpikeWebViewController(), animated: true)
    }
  }
}
