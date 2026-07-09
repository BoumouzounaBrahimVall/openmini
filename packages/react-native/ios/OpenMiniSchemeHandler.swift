import Foundation
import WebKit

/// Serves files from a verified package directory over openmini://app/…
/// Streams in 1 MiB chunks (spike constraint), guards path traversal, and
/// answers plain 404s for anything missing — never crashes the page.
final class OpenMiniSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "openmini"
  private let root: URL
  private var stopped = Set<ObjectIdentifier>()

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else { return }
    var path = url.path
    if path.isEmpty || path == "/" { path = "/index.html" }
    let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL

    guard file.path.hasPrefix(root.path + "/"),
      let handle = FileHandle(forReadingAtPath: file.path),
      let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size]) as? NSNumber
    else {
      respond(task, url: url, status: 404, headers: [:])
      task.didFinish()
      return
    }
    respond(
      task, url: url, status: 200,
      headers: [
        "Content-Type": Self.mime(file.pathExtension),
        "Content-Length": size.stringValue,
        "Access-Control-Allow-Origin": "*",
      ])
    let id = ObjectIdentifier(task)
    while let chunk = try? handle.read(upToCount: 1 << 20), !chunk.isEmpty {
      if stopped.contains(id) { break }
      task.didReceive(chunk)
    }
    try? handle.close()
    if !stopped.contains(id) { task.didFinish() }
    stopped.remove(id)
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {
    stopped.insert(ObjectIdentifier(task))
  }

  private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, headers: [String: String]) {
    if let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers) {
      task.didReceive(response)
      if status != 200 { task.didReceive(Data()) }
    }
  }

  static func mime(_ ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json", "map": return "application/json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    case "jpg", "jpeg": return "image/jpeg"
    case "webp": return "image/webp"
    case "gif": return "image/gif"
    case "ico": return "image/x-icon"
    case "woff2": return "font/woff2"
    case "woff": return "font/woff"
    case "ttf": return "font/ttf"
    case "wasm": return "application/wasm"
    case "txt": return "text/plain; charset=utf-8"
    default: return "application/octet-stream"
    }
  }
}
