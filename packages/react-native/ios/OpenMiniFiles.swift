import CryptoKit
import Foundation
import React

/// Native half of the resolver's FileStore/Hasher ports.
@objc(OpenMiniFiles)
final class OpenMiniFiles: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  private let fm = FileManager.default

  @objc func getCacheDir(_ resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      let base = try fm.url(for: .cachesDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        .appendingPathComponent("openmini", isDirectory: true)
      try fm.createDirectory(at: base, withIntermediateDirectories: true)
      resolve(base.path)
    } catch {
      reject("EIO", "cannot create cache dir", error)
    }
  }

  @objc func exists(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve(fm.fileExists(atPath: path))
  }

  @objc func readText(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    resolve((try? String(contentsOfFile: path, encoding: .utf8)) ?? NSNull())
  }

  @objc func writeFileBase64(_ path: String, base64: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let data = Data(base64Encoded: base64) else {
      reject("EARG", "invalid base64", nil)
      return
    }
    do {
      try fm.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
      try data.write(to: URL(fileURLWithPath: path))
      resolve(nil)
    } catch {
      reject("EIO", "write failed: \(path)", error)
    }
  }

  @objc func rename(_ from: String, to: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    do {
      try fm.moveItem(atPath: from, toPath: to)
      resolve(nil)
    } catch {
      reject("EIO", "rename failed", error)
    }
  }

  @objc func removeDir(_ path: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    if fm.fileExists(atPath: path) { try? fm.removeItem(atPath: path) }
    resolve(nil)
  }

  @objc func sha256Base64(_ base64: String, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    guard let data = Data(base64Encoded: base64) else {
      reject("EARG", "invalid base64", nil)
      return
    }
    resolve(SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
  }
}
