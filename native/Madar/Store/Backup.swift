import Foundation
import CryptoKit
import CommonCrypto

/// قراءة النسخة الاحتياطية من الويب وكتابتها بصيغتها:
/// كائنُ `AppData` مسطّح ومعه `__meta`، أو غلافٌ مشفّر `madar-enc-v1/v2`
/// (AES-GCM بمفتاح PBKDF2-SHA256، والدورات من الغلاف نفسه).
enum Backup {
    enum Failure: LocalizedError {
        case notJSON, needsPassword, wrongPassword, notMadar
        var errorDescription: String? {
            switch self {
            case .notJSON: return "الملف ليس نسخةً احتياطية مقروءة."
            case .needsPassword: return "النسخة مشفّرة — أدخل كلمة مرورها."
            case .wrongPassword: return "كلمة المرور غير صحيحة، أو الملف تالف."
            case .notMadar: return "الملف لا يحمل بيانات «مدار»."
            }
        }
    }

    private static let iterations: [String: UInt32] = ["madar-enc-v1": 150_000, "madar-enc-v2": 600_000]

    static func isEncrypted(_ data: Data) -> Bool {
        guard let o = try? JSONDecoder().decode(RawObject.self, from: data), let m = o.str("__madar_enc") else { return false }
        return iterations[m] != nil
    }

    static func read(_ data: Data, password: String?) throws -> AppData {
        guard var obj = try? JSONDecoder().decode(RawObject.self, from: data) else { throw Failure.notJSON }
        if let magic = obj.str("__madar_enc"), let rounds = iterations[magic] {
            guard let pw = password, !pw.isEmpty else { throw Failure.needsPassword }
            guard let salt = obj.str("salt").flatMap({ Data(base64Encoded: $0) }),
                  let iv = obj.str("iv").flatMap({ Data(base64Encoded: $0) }),
                  let cipher = obj.str("data").flatMap({ Data(base64Encoded: $0) }),
                  cipher.count > 16 else { throw Failure.notJSON }
            let key = pbkdf2(password: pw, salt: salt, rounds: rounds)
            do {
                let box = try AES.GCM.SealedBox(nonce: AES.GCM.Nonce(data: iv),
                                                ciphertext: cipher.dropLast(16), tag: cipher.suffix(16))
                let plain = try AES.GCM.open(box, using: key)
                guard let inner = try? JSONDecoder().decode(RawObject.self, from: plain) else { throw Failure.notJSON }
                obj = inner
            } catch let e as Failure { throw e } catch { throw Failure.wrongPassword }
        }
        let known = ["prayerLogs", "journalEntries", "transactions", "reserves", "quranKhatma", "lastUpdated"]
        guard known.contains(where: { obj[$0] != nil }) else { throw Failure.notMadar }
        return AppData(raw: obj)
    }

    private static func pbkdf2(password: String, salt: Data, rounds: UInt32) -> SymmetricKey {
        var out = [UInt8](repeating: 0, count: 32)
        let pw = Array(password.utf8)
        _ = salt.withUnsafeBytes { saltPtr in
            CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
                                 pw.map { Int8(bitPattern: $0) }, pw.count,
                                 saltPtr.bindMemory(to: UInt8.self).baseAddress, salt.count,
                                 CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256), rounds,
                                 &out, out.count)
        }
        return SymmetricKey(data: out)
    }

    /// نسخةٌ بصيغة الويب (غير مشفّرة) — الوسائط مضمّنةٌ `data:` فتستوردها نسخة الويب كما هي.
    static func export(_ data: AppData) throws -> Data {
        var d = data
        for i in d.journalEntries.indices {
            let e = d.journalEntries[i]
            if !e.photos.isEmpty { d.journalEntries[i].setPhotos(e.photos.map(MediaStore.inline)) }
            if !e.audios.isEmpty { d.journalEntries[i].setAudios(e.audios.map(MediaStore.inline)) }
        }
        var raw = d.raw
        let iso = ISO8601DateFormatter()
        raw.put("__meta", ["app": .string("madar"), "createdAt": .string(iso.string(from: Date())), "source": .string("native")])
        let enc = JSONEncoder()
        enc.outputFormatting = [.withoutEscapingSlashes]
        return try enc.encode(raw)
    }
}
