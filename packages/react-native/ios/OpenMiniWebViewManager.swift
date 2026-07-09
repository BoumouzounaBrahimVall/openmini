import Foundation
import React

@objc(OpenMiniWebViewManager)
final class OpenMiniWebViewManager: RCTViewManager {
  override static func requiresMainQueueSetup() -> Bool { true }

  override func view() -> UIView! { OpenMiniWebView() }

  // Invoked by UIManager.dispatchViewManagerCommand via the interop layer;
  // resolves the view WITHOUT the legacy bridge (nil under bridgeless arch).
  @objc func postMessage(_ reactTag: NSNumber, raw: String) {
    DispatchQueue.main.async {
      for case let view in OpenMiniWebView.instances.allObjects where view.reactTag == reactTag {
        view.postMessage(raw)
      }
    }
  }
}
