import Foundation
import CryptoKit
import UIKit

/// الوسائط (صور المذكرات وصوتها) خارج ملفّ البيانات: كلُّ ملفٍّ باسم بصمته
/// (`media:<sha256>.<ext>`). ملفُّ البيانات يحمل المرجع وحده، فيبقى صغيراً
/// ويُحفظ سريعاً — تضمينُ الصور فيه كان سيجعل كلَّ ضغطةٍ تعيد كتابة ميغابايتات.
enum MediaStore {
    static let prefix = "media:"

    static var directory: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("media", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func url(for ref: String) -> URL? {
        guard ref.hasPrefix(prefix) else { return nil }
        let name = String(ref.dropFirst(prefix.count))
        guard !name.contains("/") else { return nil }
        return directory.appendingPathComponent(name)
    }

    /// يحفظ البايتات ويُرجع مرجعها. نفسُ المحتوى ⇒ نفسُ المرجع، فلا تكرار.
    static func save(_ data: Data, ext: String) -> String {
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        let name = "\(hash).\(ext)"
        let url = directory.appendingPathComponent(name)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? data.write(to: url, options: .atomic)
        }
        return prefix + name
    }

    /// `data:image/webp;base64,...` → ملفّ ومرجع. أيُّ قيمةٍ أخرى تُرجع كما هي.
    static func externalize(_ value: String) -> String {
        guard value.hasPrefix("data:"), let comma = value.firstIndex(of: ",") else { return value }
        let header = value[value.index(value.startIndex, offsetBy: 5)..<comma]
        guard header.hasSuffix(";base64"),
              let data = Data(base64Encoded: String(value[value.index(after: comma)...]), options: .ignoreUnknownCharacters)
        else { return value }
        let mime = header.replacingOccurrences(of: ";base64", with: "")
        return save(data, ext: ext(forMime: String(mime)))
    }

    /// العكس للتصدير: مرجعٌ → `data:` مضمّنة، كما تقرؤها نسخة الويب.
    static func inline(_ value: String) -> String {
        guard let url = url(for: value), let data = try? Data(contentsOf: url) else { return value }
        return "data:\(mime(forExt: url.pathExtension));base64,\(data.base64EncodedString())"
    }

    static func data(_ value: String) -> Data? {
        if let url = url(for: value) { return try? Data(contentsOf: url) }
        if value.hasPrefix("data:"), let comma = value.firstIndex(of: ",") {
            return Data(base64Encoded: String(value[value.index(after: comma)...]), options: .ignoreUnknownCharacters)
        }
        return nil
    }

    static func image(_ value: String) -> UIImage? { data(value).flatMap(UIImage.init(data:)) }

    private static let mimeToExt: [String: String] = [
        "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/gif": "gif",
        "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/ogg": "ogg",
        "audio/x-m4a": "m4a", "audio/wav": "wav",
    ]
    static func ext(forMime m: String) -> String { mimeToExt[m.lowercased()] ?? "bin" }
    static func mime(forExt e: String) -> String {
        mimeToExt.first { $0.value == e.lowercased() }?.key ?? "application/octet-stream"
    }
}
