package com.openmini.reactnative

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.common.MapBuilder
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.annotations.ReactProp

class OpenMiniWebViewManager : SimpleViewManager<OpenMiniWebView>() {
  override fun getName() = "OpenMiniWebView"

  override fun createViewInstance(context: ThemedReactContext) = OpenMiniWebView(context)

  @ReactProp(name = "packagePath")
  fun setPackagePath(view: OpenMiniWebView, value: String?) {
    view.packagePath = value ?: ""
  }

  @ReactProp(name = "entry")
  fun setEntry(view: OpenMiniWebView, value: String?) {
    view.entry = value ?: "index.html"
  }

  @ReactProp(name = "bootstrapScript")
  fun setBootstrapScript(view: OpenMiniWebView, value: String?) {
    view.bootstrapScript = value ?: ""
  }

  override fun receiveCommand(view: OpenMiniWebView, commandId: String, args: ReadableArray?) {
    if (commandId == "postMessage") view.postMessage(args?.getString(0) ?: "")
  }

  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> =
    MapBuilder.of("topBridgeMessage", MapBuilder.of("registrationName", "onBridgeMessage"))

  override fun onDropViewInstance(view: OpenMiniWebView) {
    view.teardown()
    super.onDropViewInstance(view)
  }
}
