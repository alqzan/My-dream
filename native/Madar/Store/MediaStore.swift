import Foundation
import CryptoKit
import UIKit

/// الوسائط (صور المذكرات وصوتها) خارج ملفّ البيانات. كلُّ ملفٍّ باسم **بصمة
/// الويب** (`photoHash`: أوّل ٣٢ حرفاً من SHA-256 لنصّ الـ`data:` URL)، فالصورة
/// نفسُها لها المرجعُ نفسه هنا وفي السحابة وR2.
///
/// أشكال المرجع في المذكرة:
///  • `media:<hash>.<ext>` — ملفٌّ على هذا الجهاز.
///  • `r2:<hash>` — صورةٌ في السحابة لم تُنزَّل بعد (تُجلب عند العرض).
///  • `data:...` — مضمّنة (من نسخةٍ قديمة) وتُخرج إلى ملفّ عند الاستيراد.
enum MediaStore {
    static let prefix = "media:"
    static let remotePrefix = "r2:"

    static var directory: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("media", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private static let lock = NSLock()
    private static var index: [String: String]?

    /// بصمة → اسم الملف، تُبنى مرّةً من المجلّد.
    private static func fileName(forHash h: String) -> String? {
        lock.lock(); defer { lock.unlock() }
        if index == nil {
            var m: [String: String] = [:]
            for f in (try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? [] {
                m[String(f.split(separator: ".").first ?? "")] = f
            }
            index = m
        }
        return index?[h]
    }

    private static func remember(_ h: String, _ file: String) {
        lock.lock(); index?[h] = file; lock.unlock()
    }

    static func webHash(_ dataURL: String) -> String {
        SHA256.hash(data: Data(dataURL.utf8)).map { String(format: "%02x", $0) }.joined().prefix(32).description
    }

    static func hash(of ref: String) -> String? {
        if ref.hasPrefix(prefix) { return String(ref.dropFirst(prefix.count).split(separator: ".").first ?? "") }
        if ref.hasPrefix(remotePrefix) { return String(ref.dropFirst(remotePrefix.count)) }
        if ref.hasPrefix("data:") { return webHash(ref) }
        return nil
    }

    static func url(for ref: String) -> URL? {
        guard let h = hash(of: ref), !ref.hasPrefix("data:"), let f = fileName(forHash: h) else { return nil }
        return directory.appendingPathComponent(f)
    }

    static func isLocal(_ ref: String) -> Bool { ref.hasPrefix("data:") || url(for: ref) != nil }

    /// يحفظ `data:` URL في ملفٍّ ويُرجع مرجعه — نفسُ المحتوى ⇒ نفسُ المرجع.
    static func save(dataURL: String) -> String? {
        guard let comma = dataURL.firstIndex(of: ","), dataURL.hasPrefix("data:") else { return nil }
        let header = dataURL[dataURL.index(dataURL.startIndex, offsetBy: 5)..<comma]
        guard header.hasSuffix(";base64"),
              let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...]), options: .ignoreUnknownCharacters)
        else { return nil }
        let mime = String(header.dropLast(";base64".count))
        let h = webHash(dataURL)
        return write(data, hash: h, ext: ext(forMime: mime))
    }

    static func save(_ data: Data, mime: String) -> String {
        let h = webHash("data:\(mime);base64,\(data.base64EncodedString())")
        return write(data, hash: h, ext: ext(forMime: mime))
    }

    @discardableResult
    static func write(_ data: Data, hash h: String, ext: String) -> String {
        let name = "\(h).\(ext)"
        let url = directory.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: url.path) { try? data.write(to: url, options: .atomic) }
        remember(h, name)
        return prefix + name
    }

    static func externalize(_ value: String) -> String {
        value.hasPrefix("data:") ? (save(dataURL: value) ?? value) : value
    }

    /// العكس للتصدير: مرجعٌ محليّ → `data:` مضمّنة، كما تقرؤها نسخة الويب.
    static func inline(_ value: String) -> String {
        guard let url = url(for: value), let data = try? Data(contentsOf: url) else { return value }
        return "data:\(mime(forExt: url.pathExtension));base64,\(data.base64EncodedString())"
    }

    static func data(_ value: String) -> Data? {
        if value.hasPrefix("data:"), let comma = value.firstIndex(of: ",") {
            return Data(base64Encoded: String(value[value.index(after: comma)...]), options: .ignoreUnknownCharacters)
        }
        if let url = url(for: value) { return try? Data(contentsOf: url) }
        return nil
    }

    static func image(_ value: String) -> UIImage? { data(value).flatMap(UIImage.init(data:)) }

    private static let mimeToExt: [String: String] = [
        "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/gif": "gif",
        "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/ogg": "ogg",
        "audio/x-m4a": "m4a", "audio/wav": "wav", "application/pdf": "pdf",
    ]
    static func ext(forMime m: String) -> String { mimeToExt[m.lowercased()] ?? "bin" }
    static func mime(forExt e: String) -> String {
        mimeToExt.first { $0.value == e.lowercased() }?.key ?? "application/octet-stream"
    }
}
