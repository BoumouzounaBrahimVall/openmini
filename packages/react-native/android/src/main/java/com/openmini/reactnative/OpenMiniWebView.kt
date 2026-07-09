package com.openmini.reactnative

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.File

/**
 * Embedded view serving a verified package dir via WebViewAssetLoader.
 * Fills its frame; never shows its own dialog/sheet (user decision 2026-07-09).
 */
@SuppressLint("SetJavaScriptEnabled")
class OpenMiniWebView(private val reactContext: ReactContext) : FrameLayout(reactContext) {
  var packagePath: String = ""
    set(value) { field = value; maybeLoad() }
  var entry: String = "index.html"
    set(value) { field = value; maybeLoad() }
  var bootstrapScript: String = ""
    set(value) { field = value; maybeLoad() }

  private var webView: WebView? = null

  private fun maybeLoad() {
    if (webView != null || packagePath.isEmpty() || bootstrapScript.isEmpty()) return
    val assetLoader = WebViewAssetLoader.Builder()
      .addPathHandler(
        "/app/",
        WebViewAssetLoader.InternalStoragePathHandler(reactContext, File(packagePath)),
      )
      .build()
    val view = WebView(reactContext)
    view.settings.javaScriptEnabled = true
    view.settings.allowFileAccess = false
    view.settings.domStorageEnabled = true
    view.webViewClient = object : WebViewClient() {
      override fun shouldInterceptRequest(v: WebView, request: WebResourceRequest): WebResourceResponse? {
        val response = assetLoader.shouldInterceptRequest(request.url)
        // Unhandled paths on OUR serving domain answer 404 (matches iOS) instead
        // of leaking a real network request to the reserved domain.
        if (response == null && request.url.host == "appassets.androidplatform.net") {
          return WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), null)
        }
        return response
      }

      override fun onPageStarted(v: WebView, url: String?, favicon: android.graphics.Bitmap?) {
        // Fallback when DOCUMENT_START_SCRIPT is unavailable: best effort, may
        // race with very fast pages — modern WebViews take the primary path.
        if (!documentStartSupported) v.evaluateJavascript(bootstrapScript, null)
      }

      override fun onPageFinished(v: WebView, url: String?) {
        // Host->app messages sent before the page existed would evaluate
        // against about:blank and vanish; deliver them now, in order.
        pageReady = true
        flushDown()
      }
    }
    val documentStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
    documentStartSupported = documentStart
    if (documentStart) {
      WebViewCompat.addDocumentStartJavaScript(view, bootstrapScript, setOf("https://appassets.androidplatform.net"))
    }
    view.addJavascriptInterface(BridgeInterface(), "OpenMiniNative")
    if ((reactContext.applicationContext.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
      WebView.setWebContentsDebuggingEnabled(true)
    }
    addView(view, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    webView = view
    view.loadUrl("https://appassets.androidplatform.net/app/$entry")
  }

  private var documentStartSupported = true
  private var pageReady = false
  private val pendingDown = mutableListOf<String>()
  private val pendingUp = mutableListOf<String>()
  private var upRetries = 0

  fun postMessage(raw: String) {
    webView?.post {
      if (!pageReady) pendingDown.add(raw) else evaluateDeliver(raw)
    }
  }

  private fun flushDown() {
    while (pendingDown.isNotEmpty()) evaluateDeliver(pendingDown.removeAt(0))
  }

  private fun evaluateDeliver(raw: String) {
    val escaped = org.json.JSONObject.quote(raw)
    webView?.evaluateJavascript("window.__openminiDeliver($escaped)", null)
  }

  // App->host events can fire before Fabric registers this view's event
  // dispatcher (a fast cached page beats the mount) — queue and retry
  // briefly instead of dropping the mini-app's first bridge calls.
  private fun drainUp() {
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id)
    if (dispatcher == null) {
      if (upRetries++ < 100) postDelayed({ drainUp() }, 50)
      return
    }
    upRetries = 0
    val surfaceId = UIManagerHelper.getSurfaceId(reactContext)
    while (pendingUp.isNotEmpty()) {
      dispatcher.dispatchEvent(BridgeMessageEvent(surfaceId, id, pendingUp.removeAt(0)))
    }
  }

  fun teardown() {
    webView?.destroy()
    webView = null
  }

  inner class BridgeInterface {
    @JavascriptInterface
    fun postMessage(raw: String) {
      // @JavascriptInterface runs on a WebView thread; hop to the UI thread.
      this@OpenMiniWebView.post {
        pendingUp.add(raw)
        drainUp()
      }
    }
  }
}

class BridgeMessageEvent(surfaceId: Int, viewId: Int, private val raw: String) :
  Event<BridgeMessageEvent>(surfaceId, viewId) {
  override fun getEventName() = "topBridgeMessage"

  // Fabric coalesces same-type events per view within a frame by default —
  // which silently swallowed every bridge call except the last when a page
  // fired several at startup. Each message is distinct protocol traffic.
  override fun canCoalesce() = false

  override fun getEventData() = Arguments.createMap().apply { putString("raw", raw) }
}
