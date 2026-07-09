package com.openminispike

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import java.io.File

/**
 * Ticket-03 spike (throwaway): serve a local folder into a WebView via
 * WebViewAssetLoader and prove a JS<->native message round-trip.
 * The test site is copied out of assets into filesDir first, because the
 * production case serves from an arbitrary cache directory, not from assets.
 */
class SpikeWebViewActivity : Activity() {
  private lateinit var webView: WebView
  private val mainHandler = Handler(Looper.getMainLooper())

  @SuppressLint("SetJavaScriptEnabled")
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val siteDir = installTestSite()
    val assetLoader =
        WebViewAssetLoader.Builder()
            .addPathHandler("/app/", WebViewAssetLoader.InternalStoragePathHandler(this, siteDir))
            .build()
    webView = WebView(this)
    webView.settings.javaScriptEnabled = true
    webView.settings.allowFileAccess = false
    webView.webViewClient =
        object : WebViewClient() {
          override fun shouldInterceptRequest(
              view: WebView,
              request: WebResourceRequest
          ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)
        }
    webView.addJavascriptInterface(SpikeBridge(), "SpikeNative")
    WebView.setWebContentsDebuggingEnabled(true)
    setContentView(webView)
    webView.loadUrl("https://appassets.androidplatform.net/app/index.html")
  }

  private fun installTestSite(): File {
    val dir = File(filesDir, "spike-site")
    dir.mkdirs()
    for (name in assets.list("spike-site").orEmpty()) {
      assets.open("spike-site/$name").use { input ->
        File(dir, name).outputStream().use { output -> input.copyTo(output) }
      }
    }
    return dir
  }

  inner class SpikeBridge {
    @JavascriptInterface
    fun echo(message: String) {
      mainHandler.post {
        webView.evaluateJavascript("window.__onNativeEcho(${jsString("echo:$message")})", null)
      }
    }
  }

  private fun jsString(s: String): String =
      "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
}
