import React
import UIKit
import WebKit

/// WKUserContentController retains its handlers strongly; break the cycle.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: WKScriptMessageHandler?
  init(_ target: WKScriptMessageHandler) { self.target = target }
  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    target?.userContentController(c, didReceive: m)
  }
}

/// Embedded view: fills its frame, never presents its own view controller
/// (user decision 2026-07-09 — page presentation belongs to the host app).
@objc(OpenMiniWebView)
final class OpenMiniWebView: UIView, WKScriptMessageHandler, WKNavigationDelegate {
  // Bridgeless-safe lookup: no RCTBridge/uiManager in the new architecture.
  static let instances = NSHashTable<OpenMiniWebView>.weakObjects()

  override init(frame: CGRect) {
    super.init(frame: frame)
    Self.instances.add(self)
  }

  required init?(coder: NSCoder) {
    super.init(coder: coder)
    Self.instances.add(self)
  }

  @objc var packagePath: NSString = "" { didSet { maybeLoad() } }
  @objc var entry: NSString = "index.html" { didSet { maybeLoad() } }
  @objc var bootstrapScript: NSString = "" { didSet { maybeLoad() } }
  @objc var onBridgeMessage: RCTDirectEventBlock?

  private var webView: WKWebView?
  private var pageReady = false
  private var pendingDown: [String] = []

  private func maybeLoad() {
    guard webView == nil, packagePath.length > 0, bootstrapScript.length > 0 else { return }
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(
      OpenMiniSchemeHandler(root: URL(fileURLWithPath: packagePath as String, isDirectory: true)),
      forURLScheme: OpenMiniSchemeHandler.scheme)
    config.userContentController.addUserScript(
      WKUserScript(source: bootstrapScript as String, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    config.userContentController.add(WeakMessageHandler(self), name: "openmini")
    let webView = WKWebView(frame: bounds, configuration: config)
    webView.navigationDelegate = self
    webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    #if DEBUG
      if #available(iOS 16.4, *) { webView.isInspectable = true }
    #endif
    addSubview(webView)
    self.webView = webView
    webView.load(URLRequest(url: URL(string: "\(OpenMiniSchemeHandler.scheme)://app/\(entry)")!))
  }

  func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "openmini", let raw = message.body as? String else { return }
    onBridgeMessage?(["raw": raw])
  }

  /// Host->app messages sent before the page finished loading would evaluate
  /// against a blank document and vanish; buffer and flush in order.
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    pageReady = true
    let queued = pendingDown
    pendingDown = []
    for raw in queued { evaluateDeliver(raw) }
  }

  @objc func postMessage(_ raw: String) {
    if !pageReady {
      pendingDown.append(raw)
      return
    }
    evaluateDeliver(raw)
  }

  private func evaluateDeliver(_ raw: String) {
    let escaped = String(
      data: try! JSONSerialization.data(withJSONObject: [raw]), encoding: .utf8)!
      .dropFirst().dropLast()  // ["…"] -> "…"
    webView?.evaluateJavaScript("window.__openminiDeliver(\(escaped))")
  }

  func teardown() {
    webView?.configuration.userContentController.removeScriptMessageHandler(forName: "openmini")
    webView?.stopLoading()
    webView?.removeFromSuperview()
    webView = nil
  }
}
