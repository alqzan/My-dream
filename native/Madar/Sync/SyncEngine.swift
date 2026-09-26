import Foundation
import Security

/// مفتاح مساحة المزامنة في Keychain — سرٌّ لا يُكتب في الكود ولا في الإعدادات العادية.
enum SyncKey {
    private static let service = "com.alqzan.madar.native.sync"

    static var value: String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func set(_ v: String?) {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service]
        SecItemDelete(base as CFDictionary)
        guard let v, !v.isEmpty else { return }
        var add = base
        add[kSecValueData as String] = Data(v.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    /// نفس قاعدة الويب (`isValidSyncSpace`): مقطعُ مسارٍ صالح لا رابطٌ لُصق سهواً.
    static func isValid(_ s: String) -> Bool {
        let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
        return t.count >= 8 && t.count <= 1500 && !t.contains("/") && t != "." && t != ".." && !t.hasPrefix("__")
    }
}

/// جلب الوسائط من R2 عبر بوّابة الـWorker (نفس بروتوكول الويب).
enum RemoteMedia {
    static var workerURL: String {
        let saved = UserDefaults.standard.string(forKey: "r2-worker-url") ?? ""
        return (saved.isEmpty ? BuildConfig.r2WorkerURL : saved).trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
    }

    private static let inflight = InflightSet()

    /// ينزّل الملفّ إلى مخزن الوسائط ويُرجع مرجعه المحليّ.
    static func fetch(hash: String, kind: String = "photos") async -> String? {
        if let f = MediaStore.url(for: MediaStore.remotePrefix + hash) { return MediaStore.prefix + f.lastPathComponent }
        guard let key = SyncKey.value, !workerURL.isEmpty, let endpoint = URL(string: workerURL + "/v1/media/download-url"),
              await inflight.insert(hash) else { return nil }
        defer { Task { await inflight.remove(hash) } }
        var req = URLRequest(url: endpoint)
        req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["kind": kind, "hash": hash])
        guard let (d, r) = try? await URLSession.shared.data(for: req), (r as? HTTPURLResponse)?.statusCode == 200,
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any], let s = obj["url"] as? String,
              let u = URL(string: s), let (bytes, resp) = try? await URLSession.shared.data(from: u),
              (resp as? HTTPURLResponse)?.statusCode == 200 else { return nil }
        let mime = (resp as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Type")?.split(separator: ";").first.map(String.init)
        // الملفّ يُحفظ ببصمته السحابيّة (هي مرجع المذكرة)، والنوعُ من الردّ أو من البايتات.
        let ext = MediaStore.ext(forMime: mime ?? sniff(bytes))
        return MediaStore.write(bytes, hash: hash, ext: ext == "bin" ? MediaStore.ext(forMime: sniff(bytes)) : ext)
    }

    /// كثيراً ما يخزّن R2 النصَّ كما رفعه الويب: `data:...;base64,...`.
    private static func sniff(_ d: Data) -> String {
        let b = [UInt8](d.prefix(12))
        if b.starts(with: [0xFF, 0xD8]) { return "image/jpeg" }
        if b.starts(with: [0x89, 0x50]) { return "image/png" }
        if b.count >= 12, b[8...11] == [0x57, 0x45, 0x42, 0x50] { return "image/webp" }
        return "application/octet-stream"
    }
}

actor InflightSet {
    private var set: Set<String> = []
    func insert(_ s: String) -> Bool { set.insert(s).inserted }
    func remove(_ s: String) { set.remove(s) }
}

/// المزامنة مع السحابة المشتركة مع الويب: سحبٌ ← دمجٌ (`Merge`) ← رفعٌ ذرّيّ
/// بشرط أنّ السحابة لم تتغيّر منذ قُرئت. الترتيب ثابتٌ كالويب: يُدمج مع اللقطة
/// **وهي تحمل مراجع الوسائط**، ثمّ تُعرض الوسائط من الناتج.
@MainActor
final class SyncEngine: ObservableObject {
    enum Status: Equatable { case off, idle, syncing, ok(Date), failed(String) }
    @Published private(set) var status: Status = .off
    weak var store: Store?
    private let fs = Firestore()
    private var pending: Task<Void, Never>?

    init() { status = SyncKey.value == nil ? .off : .idle }

    var enabled: Bool { SyncKey.value != nil }

    func setKey(_ key: String?) {
        SyncKey.set(key?.trimmingCharacters(in: .whitespacesAndNewlines))
        status = enabled ? .idle : .off
        if enabled { Task { await sync() } }
    }

    /// مزامنةٌ مؤجّلة بعد تعديلٍ محليّ — تعديلاتٌ متتابعة تُجمع في رحلةٍ واحدة.
    func schedule() {
        guard enabled else { return }
        pending?.cancel()
        pending = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            await self?.sync()
        }
    }

    private func shardId(_ date: String?) -> String {
        guard let d = date, d.count >= 7, d.prefix(7).range(of: #"^\d{4}-\d{2}$"#, options: .regularExpression) != nil else { return "misc" }
        return String(d.prefix(7))
    }

    /// المذكرة بصيغة السحابة: بلا بايتات ولا مراجع محليّة، والصور بصماتٌ في `photoRefs`.
    private func cloudEntry(_ e: RawObject) -> RawObject {
        var o = e
        let localPhotos = (e.strings("photos") + [e.str("photo")].compactMap { $0 })
        let localAudios = (e.strings("audios") + [e.str("audio")].compactMap { $0 })
        var pr = e.strings("photoRefs"), ar = e.strings("audioRefs")
        // صورةٌ من نسخةٍ احتياطية لها بصمةٌ سحابيّة معروفة تُحفظ مرجعاً؛ وما أُضيف
        // على هذا الجهاز ولم يُرفع بعد يبقى محليّاً (لا يُرسل مرجعٌ لا ملفّ له في R2).
        for p in localPhotos { if let h = MediaStore.hash(of: p), p.hasPrefix(MediaStore.remotePrefix), !pr.contains(h) { pr.append(h) } }
        for a in localAudios { if let h = MediaStore.hash(of: a), a.hasPrefix(MediaStore.remotePrefix), !ar.contains(h) { ar.append(h) } }
        for k in ["photos", "photo", "audios", "audio", "photoOrder", "audioOrder"] { o[k] = nil }
        if !pr.isEmpty { o.put("photoRefs", strings: pr) } else { o["photoRefs"] = nil }
        if !ar.isEmpty { o.put("audioRefs", strings: ar) } else { o["audioRefs"] = nil }
        return o.filter { if case .null = $0.value { return false }; return true }
    }

    private func canon(_ list: [RawObject]) -> String {
        let sorted = list.sorted { ($0.str("id") ?? "") < ($1.str("id") ?? "") }
        let enc = JSONEncoder()
        enc.outputFormatting = [.sortedKeys]
        return (try? String(data: enc.encode(sorted.map { JSONValue.object($0) }), encoding: .utf8)) ?? ""
    }

    func sync() async {
        guard let space = SyncKey.value, let store, status != .syncing else { return }
        status = .syncing
        do {
            try await attempt(space: space, store: store)
            status = .ok(Date())
        } catch Firestore.Failure.precondition {
            do { try await attempt(space: space, store: store); status = .ok(Date()) }
            catch { status = .failed(error.localizedDescription) }
        } catch {
            status = .failed(error.localizedDescription)
        }
    }

    private func attempt(space: String, store: Store) async throws {
        let mainPath = "userData/\(space)"
        let main = try await fs.get(mainPath)
        async let jDocs = fs.list("\(mainPath)/journal")
        async let tDocs = fs.list("\(mainPath)/transactions")
        let journalDocs = try await jDocs
        let txDocs = (try? await tDocs) ?? []

        // لقطة السحابة كاملةً بصيغة AppData.
        var cloud = main?.fields ?? [:]
        var journalById: [String: RawObject] = [:]
        for e in cloud.objects("journalEntries") { if let id = e.str("id") { journalById[id] = e } }
        var cloudShards: [String: (list: [RawObject], updateTime: String?)] = [:]
        for d in journalDocs {
            let sid = String(d.name.split(separator: "/").last ?? "")
            let entries = d.fields.objects("entries")
            cloudShards[sid] = (entries, d.updateTime)
            for e in entries { if let id = e.str("id") { journalById[id] = e } }
        }
        var txById: [String: RawObject] = [:]
        for t in cloud.objects("transactions") { if let id = t.str("id") { txById[id] = t } }
        var txShards: [String: (list: [RawObject], updateTime: String?)] = [:]
        for d in txDocs {
            let sid = String(d.name.split(separator: "/").last ?? "")
            let list = d.fields.objects("transactions")
            txShards[sid] = (list, d.updateTime)
            for t in list { if let id = t.str("id") { txById[id] = t } }
        }
        cloud.put("journalEntries", objects: Array(journalById.values))
        cloud.put("transactions", objects: Array(txById.values))

        // أوّل مزامنة: نسخةٌ من السحابة كما هي قبل أيّ كتابة — شبكة أمان.
        if main != nil, !UserDefaults.standard.bool(forKey: "sync-cloud-backup-done") {
            let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            if let bytes = try? JSONEncoder().encode(cloud) {
                try? bytes.write(to: dir.appendingPathComponent("cloud-before-first-sync.json"), options: .atomic)
                UserDefaults.standard.set(true, forKey: "sync-cloud-backup-done")
            }
        }

        let localRaw = store.data.raw
        let merged = main == nil ? localRaw : Merge.merge(local: localRaw, cloud: cloud)

        // حارسٌ ضدّ المسح: دمجٌ يُسقط كثيراً ممّا في السحابة بلا شواهد حذف علّةٌ لا قرار.
        let deleted = merged.obj("deleted") ?? [:]
        for k in ["journalEntries", "transactions", "prayerLogs"] {
            let cloudIds = Set(cloud.objects(k).compactMap { $0.str("id") ?? $0.str("date") })
            let mergedIds = Set(merged.objects(k).compactMap { $0.str("id") ?? $0.str("date") })
            let lost = cloudIds.subtracting(mergedIds).filter { deleted[$0] == nil }
            if lost.count > 5 { throw Firestore.Failure.http(0, "توقّفت المزامنة: الدمج كان سيُسقط \(lost.count) عنصراً من «\(k)» بلا حذف.") }
        }

        // تبنّي الناتج محليّاً (مع بقاء الوسائط المحليّة على كلّ مذكرة).
        let adopted = AppData(raw: merged)
        if adopted != store.data { store.adoptFromSync(adopted) }

        // الرفع: شرائح المذكرات والمعاملات التي تغيّرت، ثمّ المستند الرئيسيّ — ذرّياً.
        var writes: [Firestore.Write] = []
        var jBy: [String: [RawObject]] = [:]
        for e in merged.objects("journalEntries") { jBy[shardId(e.str("date")), default: []].append(cloudEntry(e)) }
        for sid in Set(jBy.keys).union(cloudShards.keys) {
            let list = jBy[sid] ?? []
            let remote = cloudShards[sid]
            if let r = remote, canon(r.list.map(cloudEntry)) == canon(list) { continue }
            if remote == nil && list.isEmpty { continue }
            writes.append(.init(path: "\(mainPath)/journal/\(sid)", fields: ["entries": .array(list.map { .object($0) }), "writerVersion": .number(2)],
                                updateTime: remote?.updateTime, mustNotExist: remote == nil))
        }
        let txSharded = !txShards.isEmpty || cloud["transactions"] == nil || main == nil || (main?.fields["transactions"] == nil)
        var mainFields = merged
        mainFields["journalEntries"] = nil
        if txSharded {
            var tBy: [String: [RawObject]] = [:]
            for t in merged.objects("transactions") { tBy[shardId(t.str("date")), default: []].append(t) }
            for sid in Set(tBy.keys).union(txShards.keys) {
                let list = tBy[sid] ?? []
                let remote = txShards[sid]
                if let r = remote, canon(r.list) == canon(list) { continue }
                if remote == nil && list.isEmpty { continue }
                writes.append(.init(path: "\(mainPath)/transactions/\(sid)", fields: ["transactions": .array(list.map { .object($0) }), "writerVersion": .number(1)],
                                    updateTime: remote?.updateTime, mustNotExist: remote == nil))
            }
            mainFields["transactions"] = nil
        }
        // ما يخصّ السحابة وحدها (مانيفست الوسائط وأخواته) يبقى كما هو.
        for k in ["mediaManifestMode", "mediaManifestVersion", "photoManifest", "audioManifest"] { if let v = main?.fields[k] { mainFields[k] = v } }
        var mainOld = main?.fields ?? [:]
        mainOld["revision"] = nil
        var mainNew = mainFields
        mainNew["revision"] = nil
        if !writes.isEmpty || mainOld != mainNew {
            let revision = (main?.fields.num("revision") ?? 0) + 1
            mainFields.put("revision", revision)
            writes.append(.init(path: mainPath, fields: mainFields, updateTime: main?.updateTime, mustNotExist: main == nil))
            try await fs.commit(writes)
        }
        UserDefaults.standard.set(Date(), forKey: "sync-last")
    }
}
