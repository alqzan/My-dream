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

    /// يرفع ملفّاً إلى R2 عبر الـWorker (نفس بروتوكول الويب `uploadMediaToR2`).
    static func upload(ref: String, kind: String) async -> Bool {
        guard let key = SyncKey.value, !workerURL.isEmpty, let h = MediaStore.hash(of: ref),
              let fileURL = MediaStore.url(for: ref), let data = try? Data(contentsOf: fileURL) else { return false }
        let ct = MediaStore.mime(forExt: fileURL.pathExtension)
        guard let url = URL(string: "\(workerURL)/v1/media/put?kind=\(kind)&hash=\(h)&ct=\(ct.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? ct)") else { return false }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(key)", forHTTPHeaderField: "Authorization")
        req.setValue(ct, forHTTPHeaderField: "Content-Type")
        req.setValue(BankParser.sha256Hex(data), forHTTPHeaderField: "X-Madar-Content-SHA256")
        req.httpBody = data
        guard let (_, r) = try? await URLSession.shared.data(for: req) else { return false }
        return (r as? HTTPURLResponse).map { (200..<300).contains($0.statusCode) } ?? false
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
    /// تعديلٌ محليّ لم يُرفع بعد.
    private var dirty = true
    /// آخر مراجعةٍ للسحابة تبنّيناها — إن لم تتغيّر ولا شيء محليّ فلا رحلة.
    private var lastRevision: Double? = UserDefaults.standard.object(forKey: "sync-last-revision") as? Double

    /// شرائح السحابة المعروفة: اسمُها ← (وقت تعديلها، محتواها). تُحفظ على القرص
    /// فلا يُنزَّل في كلّ مزامنة إلّا الشهرُ الذي تغيّر فعلاً.
    private struct ShardCache: Codable { var updateTime: String; var list: [JSONValue] }
    private var shardCache: [String: ShardCache] = SyncEngine.loadCache()
    nonisolated private static var cacheURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("sync-shards.json")
    }
    nonisolated private static func loadCache() -> [String: ShardCache] {
        (try? JSONDecoder().decode([String: ShardCache].self, from: Data(contentsOf: cacheURL))) ?? [:]
    }
    private func saveCache() {
        let snapshot = shardCache
        Task.detached(priority: .utility) {
            if let d = try? JSONEncoder().encode(snapshot) { try? d.write(to: SyncEngine.cacheURL, options: .atomic) }
        }
    }

    /// يقرأ مجموعة شرائح: أسماءٌ وأوقاتٌ أوّلاً، ثمّ ينزّل ما تغيّر وحده.
    private func loadShards(_ collection: String, field: String) async throws -> [String: (list: [RawObject], updateTime: String?)] {
        let metas = try await fs.list(collection, mask: ["writerVersion"])
        var out: [String: (list: [RawObject], updateTime: String?)] = [:]
        var fetched: [(String, String, [JSONValue])] = []
        let stale = metas.compactMap { m -> String? in
            let sid = String(m.name.split(separator: "/").last ?? "")
            if let c = shardCache["\(collection)/\(sid)"], c.updateTime == m.updateTime {
                out[sid] = (c.list.compactMap { if case .object(let o) = $0 { return o }; return nil }, m.updateTime)
                return nil
            }
            return sid
        }
        // الشرائح التي تغيّرت تُنزَّل على دفعاتٍ متوازية صغيرة.
        let client = fs
        for batch in stride(from: 0, to: stale.count, by: 6).map({ Array(stale[$0..<min($0 + 6, stale.count)]) }) {
            try await withThrowingTaskGroup(of: (String, String, [JSONValue]).self) { group in
                for sid in batch {
                    group.addTask {
                        let d = try await client.get("\(collection)/\(sid)")
                        return (sid, d?.updateTime ?? "", d?.fields.arr(field) ?? [])
                    }
                }
                for try await r in group { fetched.append(r) }
            }
        }
        for r in fetched {
            shardCache["\(collection)/\(r.0)"] = ShardCache(updateTime: r.1, list: r.2)
            out[r.0] = (r.2.compactMap { if case .object(let o) = $0 { return o }; return nil }, r.1)
        }
        saveCache()
        return out
    }

    init() { status = SyncKey.value == nil ? .off : .idle }

    var enabled: Bool { SyncKey.value != nil }

    func setKey(_ key: String?) {
        SyncKey.set(key?.trimmingCharacters(in: .whitespacesAndNewlines))
        status = enabled ? .idle : .off
        if enabled { Task { await sync() } }
    }

    /// مزامنةٌ مؤجّلة بعد تعديلٍ محليّ — تعديلاتٌ متتابعة تُجمع في رحلةٍ واحدة.
    func schedule() {
        dirty = true
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

    /// يرفع ما أُضيف على هذا الجهاز من صورٍ وصوت ولم يصل R2 بعد، ويسجّل بصمته
    /// في `photoRefs`/`audioRefs` فتصل المذكرةُ بوسائطها إلى الويب وأجهزتك.
    private func pushLocalMedia(_ store: Store) async -> [String: Set<String>] {
        var done: [String: Set<String>] = ["photos": [], "audios": []]
        var pending: [(entry: String, kind: String, ref: String)] = []
        for e in store.data.journalEntries {
            let pr = Set(e.raw.strings("photoRefs")), ar = Set(e.raw.strings("audioRefs"))
            for p in e.raw.strings("photos") where p.hasPrefix(MediaStore.prefix) {
                if let h = MediaStore.hash(of: p), !pr.contains(h) { pending.append((e.id, "photos", p)) }
            }
            for a in e.raw.strings("audios") where a.hasPrefix(MediaStore.prefix) {
                if let h = MediaStore.hash(of: a), !ar.contains(h) { pending.append((e.id, "audios", a)) }
            }
        }
        guard !pending.isEmpty, !RemoteMedia.workerURL.isEmpty else { return done }
        var uploaded: [(entry: String, kind: String, hash: String)] = []
        for item in pending.prefix(40) {
            if await RemoteMedia.upload(ref: item.ref, kind: item.kind), let h = MediaStore.hash(of: item.ref) {
                uploaded.append((item.entry, item.kind, h))
                done[item.kind, default: []].insert(h)
            }
        }
        guard !uploaded.isEmpty else { return done }
        store.adoptFromSync({
            var d = store.data
            for u in uploaded {
                guard let i = d.journalEntries.firstIndex(where: { $0.id == u.entry }) else { continue }
                let key = u.kind == "photos" ? "photoRefs" : "audioRefs"
                var refs = d.journalEntries[i].raw.strings(key)
                if !refs.contains(u.hash) { refs.append(u.hash) }
                d.journalEntries[i].raw.put(key, strings: refs)
            }
            return d
        }())
        return done
    }

    private func attempt(space: String, store: Store) async throws {
        let mainPath = "userData/\(space)"
        // فحصٌ خفيف أوّلاً: لا تغيّر في السحابة ولا تعديل محليّ ⇒ لا رحلة كاملة.
        if !dirty, let rev = lastRevision, let head = try await fs.get(mainPath, mask: ["revision"]), head.fields.num("revision") == rev { return }
        let newMedia = await pushLocalMedia(store)
        let main = try await fs.get(mainPath)
        let journalShards = try await loadShards("\(mainPath)/journal", field: "entries")
        let txShardsLoaded = (try? await loadShards("\(mainPath)/transactions", field: "transactions")) ?? [:]

        // لقطة السحابة كاملةً بصيغة AppData.
        var cloud = main?.fields ?? [:]
        var journalById: [String: RawObject] = [:]
        for e in cloud.objects("journalEntries") { if let id = e.str("id") { journalById[id] = e } }
        let cloudShards = journalShards
        for (_, v) in journalShards { for e in v.list { if let id = e.str("id") { journalById[id] = e } } }
        var txById: [String: RawObject] = [:]
        for t in cloud.objects("transactions") { if let id = t.str("id") { txById[id] = t } }
        let txShards = txShardsLoaded
        for (_, v) in txShards { for t in v.list { if let id = t.str("id") { txById[id] = t } } }
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
        // مانيفست الوسائط: ما رُفع للتوّ يُضاف إلى شرائحه (إضافةٌ لا حذف، كالويب).
        if main?.fields.str("mediaManifestMode") == "inline" {
            for (kind, hashes) in newMedia where !hashes.isEmpty {
                let k = kind == "photos" ? "photoManifest" : "audioManifest"
                mainFields.put(k, strings: Array(Set(mainFields.strings(k)).union(hashes)).sorted())
            }
        } else {
            for (kind, hashes) in newMedia where !hashes.isEmpty {
                let byShard = Dictionary(grouping: hashes) { h -> String in
                    let p = String(h.prefix(2)).lowercased()
                    return "\(kind)-\(p.range(of: "^[0-9a-f]{2}$", options: .regularExpression) != nil ? p : "other")"
                }
                for (sid, hs) in byShard {
                    let path = "\(mainPath)/mediaManifest/\(sid)"
                    let existing = try? await fs.get(path)
                    let union = Array(Set(existing?.fields.strings("hashes") ?? []).union(hs)).sorted()
                    writes.append(.init(path: path, fields: ["kind": .string(kind), "hashes": .array(union.map { .string($0) }), "writerVersion": .number(1)],
                                        updateTime: existing?.updateTime, mustNotExist: existing == nil))
                }
            }
        }
        var mainOld = main?.fields ?? [:]
        mainOld["revision"] = nil
        var mainNew = mainFields
        mainNew["revision"] = nil
        if !writes.isEmpty || mainOld != mainNew {
            let revision = (main?.fields.num("revision") ?? 0) + 1
            mainFields.put("revision", revision)
            writes.append(.init(path: mainPath, fields: mainFields, updateTime: main?.updateTime, mustNotExist: main == nil))
            try await fs.commit(writes)
            // ما كتبناه صار قديماً في المخبأ (أوقاتُه تغيّرت) — يُعاد تنزيله مرّةً ثمّ يثبت.
            for w in writes where w.path != mainPath { shardCache[w.path] = nil }
            lastRevision = revision
        } else {
            lastRevision = main?.fields.num("revision")
        }
        if let r = lastRevision { UserDefaults.standard.set(r, forKey: "sync-last-revision") }
        dirty = false
        UserDefaults.standard.set(Date(), forKey: "sync-last")
    }
}
