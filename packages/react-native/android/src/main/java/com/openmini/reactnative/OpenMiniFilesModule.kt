package com.openmini.reactnative

import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.security.MessageDigest

/** Native half of the resolver's FileStore/Hasher ports. */
class OpenMiniFilesModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {
  override fun getName() = "OpenMiniFiles"

  @ReactMethod
  fun getCacheDir(promise: Promise) {
    val dir = File(context.filesDir, "openmini")
    dir.mkdirs()
    promise.resolve(dir.absolutePath)
  }

  @ReactMethod
  fun exists(path: String, promise: Promise) = promise.resolve(File(path).exists())

  @ReactMethod
  fun readText(path: String, promise: Promise) {
    val file = File(path)
    promise.resolve(if (file.isFile) file.readText() else null)
  }

  @ReactMethod
  fun writeFileBase64(path: String, base64: String, promise: Promise) {
    try {
      val file = File(path)
      file.parentFile?.mkdirs()
      file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("EIO", "write failed: $path", e)
    }
  }

  @ReactMethod
  fun rename(from: String, to: String, promise: Promise) {
    if (File(from).renameTo(File(to))) promise.resolve(null)
    else promise.reject("EIO", "rename failed: $from -> $to", null)
  }

  @ReactMethod
  fun removeDir(path: String, promise: Promise) {
    File(path).deleteRecursively()
    promise.resolve(null)
  }

  @ReactMethod
  fun sha256Base64(base64: String, promise: Promise) {
    try {
      val digest = MessageDigest.getInstance("SHA-256").digest(Base64.decode(base64, Base64.DEFAULT))
      promise.resolve(digest.joinToString("") { "%02x".format(it) })
    } catch (e: Exception) {
      promise.reject("EARG", "invalid base64", e)
    }
  }
}
