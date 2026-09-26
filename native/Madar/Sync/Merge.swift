import Foundation

/// دمج لقطتين (الجهاز والسحابة) — نقلٌ لـ`mergeAppData` في `src/lib/merge.ts`
/// على مستوى JSON الخام، فيعمل على كلّ حقلٍ حتى ما لا تعرضه هذه النسخة.
/// القواعد نفسها: اتّحادٌ بالمعرّف، والتعديلُ الأحدث للعنصر يفوز بطابعه،
/// وشواهدُ الحذف تمنع القيامة، والصلاةُ تُحسم فرضاً فرضاً بطابعها.
enum Merge {
    static let tombstoneTTL: Double = 365 * 24 * 3600 * 1000

    static let idKeyed = [
        "transactions", "books", "readingLogs", "futureLetters", "categories", "quranReflections", "countdownEvents",
        "reconciles", "knowledgeSources", "benefits", "obligations", "observedBalances", "accounts",
        "settlementResolutions", "settlements", "inboxDecisions", "inboxEvents",
    ]
    static let singletons: [(String, JSONValue)] = [
        ("dailyBudget", .null), ("monthlyIncome", .null), ("salaryDay", .number(27)), ("budgetWindow", .string("salary")),
        ("autoOffset", .bool(true)), ("lastSalaryConfirm", .null), ("readingGoal", .null), ("frozenHabits", .array([])),
        ("qadaBacklog", .number(0)), ("ownerAliases", .array([])), ("ownerWallets", .array([])), ("ownerAccounts", .array([])),
        ("salaryPayers", .array([])), ("payerAliases", .object([:])), ("cashbackEnabled", .bool(false)), ("cashbackEnvelopeId", .null),
    ]

    private static func stamp(_ o: RawObject) -> Double { o.num("updatedAt") ?? 0 }

    static func unionOrdered(_ p: [RawObject], _ s: [RawObject], key: (RawObject) -> String?) -> [RawObject] {
        let seen = Set(p.compactMap(key))
        return p + s.filter { key($0).map { !seen.contains($0) } ?? false }
    }

    static func byIdNewer(_ p: [RawObject], _ s: [RawObject], alive: (RawObject) -> Bool) -> [RawObject] {
        var sById: [String: RawObject] = [:]
        for x in s { if let id = x.str("id") { sById[id] = x } }
        let merged = p.map { it -> RawObject in
            guard let id = it.str("id"), let other = sById[id] else { return it }
            return stamp(other) > stamp(it) ? other : it
        }
        return unionOrdered(merged, s) { $0.str("id") }.filter(alive)
    }

    private static func unionMax(_ a: RawObject?, _ b: RawObject?) -> RawObject {
        var out = a ?? [:]
        for (k, v) in b ?? [:] {
            if case .number(let n) = v { out[k] = .number(max(out.num(k) ?? 0, n)) }
        }
        return out
    }

    static func merge(local: RawObject, cloud: RawObject, now: Double = DateKey.nowMs()) -> RawObject {
        let localNewer = (local.str("lastUpdated") ?? "") >= (cloud.str("lastUpdated") ?? "")
        let primary = localNewer ? local : cloud
        let secondary = localNewer ? cloud : local
        var out = primary
        let cutoff = now - tombstoneTTL

        var deleted = unionMax(cloud.obj("deleted"), local.obj("deleted"))
        deleted = deleted.filter { ($0.value.numberValue ?? 0) >= cutoff }
        var deletedMedia = unionMax(cloud.obj("deletedMedia"), local.obj("deletedMedia"))
        deletedMedia = deletedMedia.filter { ($0.value.numberValue ?? 0) >= cutoff }
        let mediaTomb = Set(deletedMedia.keys)
        let fieldUpdatedAt = unionMax(cloud.obj("fieldUpdatedAt"), local.obj("fieldUpdatedAt"))

        func alive(_ x: RawObject) -> Bool {
            guard let id = x.str("id"), let t = deleted.num(id) else { return true }
            return stamp(x) > t
        }
        func pick(_ field: String, _ fallback: JSONValue?) -> JSONValue? {
            let pt = primary.obj("fieldUpdatedAt")?.num(field) ?? 0
            let st = secondary.obj("fieldUpdatedAt")?.num(field) ?? 0
            if pt == 0 && st == 0 { return fallback }
            return pt >= st ? primary[field] : secondary[field]
        }

        for k in idKeyed {
            let merged = byIdNewer(primary.objects(k), secondary.objects(k), alive: alive)
            if primary[k] != nil || secondary[k] != nil { out.put(k, objects: merged) }
        }

        // ترتيبُ الأقسام من الجهاز الذي رتّب آخراً.
        let orderSrc = (primary.obj("fieldUpdatedAt")?.num("categoriesOrder") ?? 0) >= (secondary.obj("fieldUpdatedAt")?.num("categoriesOrder") ?? 0)
            ? primary.objects("categories") : secondary.objects("categories")
        var rank: [String: Int] = [:]
        for (i, c) in orderSrc.enumerated() { if let id = c.str("id") { rank[id] = i } }
        let cats = out.objects("categories").enumerated().sorted {
            (rank[$0.element.str("id") ?? ""] ?? .max, $0.offset) < (rank[$1.element.str("id") ?? ""] ?? .max, $1.offset)
        }.map(\.element)
        if !cats.isEmpty { out.put("categories", objects: cats) }

        // العادات: سجلّات الأيام تتّحد ناقصَ ما أُلغي.
        let habits = byIdNewer(primary.objects("habits"), secondary.objects("habits"), alive: alive).map { h -> RawObject in
            let id = h.str("id") ?? ""
            let pl = primary.objects("habits").first { $0.str("id") == id }?.strings("logs") ?? []
            let sl = secondary.objects("habits").first { $0.str("id") == id }?.strings("logs") ?? []
            var h = h
            h.put("logs", strings: Array(Set(pl + sl)).filter { deleted["habitlog:\(id):\($0)"] == nil }.sorted())
            return h
        }
        if primary["habits"] != nil || secondary["habits"] != nil { out.put("habits", objects: habits) }

        // المظاريف: الإيداعات والرحلات تتّحد؛ إيداعُ المقاصة يُحسم بالأكبر، والمنتهيةُ تغلب الجارية.
        let pRes = primary.objects("reserves"), sRes = secondary.objects("reserves")
        var reserves = byIdNewer(pRes, sRes, alive: alive).map { f -> RawObject in
            let id = f.str("id") ?? ""
            let pDep = pRes.first { $0.str("id") == id }?.objects("deposits") ?? []
            let sDep = sRes.first { $0.str("id") == id }?.objects("deposits") ?? []
            var sById: [String: RawObject] = [:]
            for d in sDep { if let i = d.str("id") { sById[i] = d } }
            let deps = unionOrdered(pDep, sDep) { $0.str("id") }.map { d -> RawObject in
                guard let did = d.str("id"), did.hasPrefix("offset:"), let o = sById[did] else { return d }
                return abs(o.num("amount") ?? 0) > abs(d.num("amount") ?? 0) ? o : d
            }.filter { deleted["deposit:\($0.str("id") ?? "")"] == nil }
            let pT = pRes.first { $0.str("id") == id }?.objects("trips") ?? []
            let sT = sRes.first { $0.str("id") == id }?.objects("trips") ?? []
            var sTById: [String: RawObject] = [:]
            for t in sT { if let i = t.str("id") { sTById[i] = t } }
            let trips = unionOrdered(pT, sT) { $0.str("id") }.map { t -> RawObject in
                guard let tid = t.str("id"), let o = sTById[tid] else { return t }
                let ends = [t.str("endedAt"), o.str("endedAt")].compactMap { $0 }.sorted()
                var t = t
                if let e = ends.last { t.put("endedAt", e) }
                return t
            }
            var f = f
            f.put("deposits", objects: deps)
            if !trips.isEmpty { f.put("trips", objects: trips) }
            return f
        }
        reserves = settleRunningTrips(reserves)
        if pRes.count + sRes.count > 0 { out.put("reserves", objects: reserves) }
        let liveFunds = Set(reserves.compactMap { $0.str("id") })

        // المعاملات: حصّةٌ على مظروفٍ حُذف تعود للمصروف اليومي.
        if let txs = out.arr("transactions") {
            out.put("transactions", objects: txs.compactMap { v -> RawObject? in
                guard case .object(var t) = v else { return nil }
                let splits = t.objects("reserveSplits")
                if !splits.isEmpty {
                    let kept = splits.filter { liveFunds.contains($0.str("fundId") ?? "") }
                    t.put("reserveSplits", objects: kept.isEmpty ? nil : kept)
                }
                return t
            })
        }

        // السقوف: مفتاحُها القسم.
        do {
            let p = primary.objects("budgets"), s = secondary.objects("budgets")
            var sBy: [String: RawObject] = [:]
            for b in s { if let c = b.str("category") { sBy[c] = b } }
            let merged = p.map { b -> RawObject in
                guard let c = b.str("category"), let o = sBy[c] else { return b }
                return stamp(o) > stamp(b) ? o : b
            }
            let all = unionOrdered(merged, s) { $0.str("category") }.filter { deleted["budget:\($0.str("category") ?? "")"] == nil }
            if !p.isEmpty || !s.isEmpty { out.put("budgets", objects: all) }
        }

        out.put("prayerLogs", objects: mergePrayerLogs(primary.objects("prayerLogs"), secondary.objects("prayerLogs")))
        out.put("quranKhatma", mergeKhatma(primary, secondary, pick: pick, now: now))
        out.put("quranHifz", mergeHifz(primary.obj("quranHifz") ?? [:], secondary.obj("quranHifz") ?? [:], now: now))
        out.put("quranWird", strings: Array(Set(primary.strings("quranWird") + secondary.strings("quranWird")))
            .filter { deleted["wird:\($0)"] == nil }.sorted())

        out.put("journalEntries", objects: mergeJournal(primary.objects("journalEntries"), secondary.objects("journalEntries"),
                                                        alive: alive, mediaTomb: mediaTomb))
        for e in out.objects("journalEntries") {
            if let id = e.str("id"), let t = deleted.num(id), stamp(e) > t { deleted[id] = nil }
        }

        for (field, def) in singletons {
            let fallback = primary[field] ?? secondary[field] ?? def
            let v = pick(field, fallback)
            out[field] = v ?? .null
        }
        // المصروف اليومي يُطابَق مع إيداعات المقاصة المدموجة (`reconcileOffsetCredit`).
        if case .object(var b)? = out["dailyBudget"], let start = b.str("startDate") {
            let pickedFromPrimary = out["dailyBudget"] == primary["dailyBudget"]
            let before = offsetCredit(pickedFromPrimary ? pRes : sRes, start: start)
            let after = offsetCredit(reserves, start: start)
            var delta = 0.0
            for k in Set(before.keys).union(after.keys) { delta += (after[k] ?? 0) - (before[k] ?? 0) }
            delta = round2(delta)
            if delta != 0 {
                b.put("carryAdjust", round2((b.num("carryAdjust") ?? 0) - delta))
                out.put("dailyBudget", b)
            }
        }

        // قواعد التجّار: لكلّ مفتاحٍ طابعه.
        var rules = secondary.obj("merchantRules") ?? [:]
        for (k, v) in primary.obj("merchantRules") ?? [:] { rules[k] = v }
        for (k, v) in secondary.obj("merchantRules") ?? [:] where primary.obj("merchantRules")?[k] != nil {
            if (secondary.obj("fieldUpdatedAt")?.num("merchant:\(k)") ?? 0) > (primary.obj("fieldUpdatedAt")?.num("merchant:\(k)") ?? 0) { rules[k] = v }
        }
        out.put("merchantRules", rules)

        out.put("deleted", deleted)
        out.put("deletedMedia", deletedMedia)
        out.put("fieldUpdatedAt", fieldUpdatedAt)
        let lu = max(local.str("lastUpdated") ?? "", cloud.str("lastUpdated") ?? "")
        out.put("lastUpdated", lu.isEmpty ? nil : lu)
        return out
    }

    private static func offsetCredit(_ reserves: [RawObject], start: String) -> [String: Double] {
        var m: [String: Double] = [:]
        for f in reserves {
            for d in f.objects("deposits") {
                if let id = d.str("id"), id.hasPrefix("offset:"), (d.str("date") ?? "") >= start { m[id] = abs(d.num("amount") ?? 0) }
            }
        }
        return m
    }

    /// رحلةٌ جاريةٌ واحدة بعد الدمج: الأحدثُ بدءاً تبقى، والباقيات تُنهى يوم بدئها.
    static func settleRunningTrips(_ reserves: [RawObject]) -> [RawObject] {
        var running: [(fund: String, trip: String, start: String)] = []
        for f in reserves {
            for t in f.objects("trips") where t.str("endedAt") == nil {
                if let fid = f.str("id"), let tid = t.str("id"), let s = t.str("startedAt") { running.append((fid, tid, s)) }
            }
        }
        guard running.count > 1 else { return reserves }
        let winner = running.max { ($0.start, $0.fund) < ($1.start, $1.fund) }!
        return reserves.map { f in
            var f = f
            f.put("trips", objects: f.objects("trips").map { t in
                var t = t
                if t.str("endedAt") == nil, t.str("id") != winner.trip { t.put("endedAt", t.str("startedAt")) }
                return t
            })
            return f
        }
    }

    static func mergePrayerLogs(_ p: [RawObject], _ s: [RawObject]) -> [RawObject] {
        var sBy: [String: RawObject] = [:]
        for l in s { if let d = l.str("date") { sBy[d] = l } }
        return unionOrdered(p, s) { $0.str("date") }.map { pl in
            guard let d = pl.str("date"), let sm = sBy[d], sm != pl else { return pl }
            var out = pl
            func mergeMap(_ valKey: String, _ stampKey: String) {
                var vals = sm.obj(valKey) ?? [:]
                for (k, v) in pl.obj(valKey) ?? [:] { vals[k] = v }
                var stamps = sm.obj(stampKey) ?? [:]
                for (k, v) in pl.obj(stampKey) ?? [:] { stamps[k] = v }
                for name in vals.keys {
                    let pt = pl.obj(stampKey)?.num(name) ?? 0
                    let st = sm.obj(stampKey)?.num(name) ?? 0
                    let winner = st > pt ? sm : pl
                    vals[name] = winner.obj(valKey)?[name]
                    let newest = max(pt, st)
                    if newest > 0 { stamps[name] = .number(newest) }
                }
                if vals.isEmpty { out[valKey] = valKey == "prayers" ? .object([:]) : nil } else { out.put(valKey, vals) }
                if !stamps.isEmpty { out.put(stampKey, stamps) }
            }
            mergeMap("prayers", "prayerUpdatedAt")
            mergeMap("khushu", "khushuUpdatedAt")
            for (v, st) in [("sunan", "sunanUpdatedAt"), ("qiyam", "qiyamUpdatedAt")] {
                let pt = pl.num(st) ?? 0, s2 = sm.num(st) ?? 0
                let w = s2 > pt ? sm : pl
                out[v] = w[v]
                let newest = max(pt, s2)
                if newest > 0 { out.put(st, newest) }
            }
            return out
        }
    }

    static func mergeKhatma(_ primary: RawObject, _ secondary: RawObject, pick: (String, JSONValue?) -> JSONValue?, now: Double) -> RawObject {
        let pk = primary.obj("quranKhatma") ?? ["juz": .number(0), "completed": .number(0)]
        let sk = secondary.obj("quranKhatma") ?? ["juz": .number(0), "completed": .number(0)]
        var base: RawObject = {
            if case .object(let o)? = pick("quranKhatma", .object(pk)) { return o }
            return pk
        }()
        let gp = primary.obj("fieldUpdatedAt")?.num("khatmaGoal") ?? 0
        let gs = secondary.obj("fieldUpdatedAt")?.num("khatmaGoal") ?? 0
        if !(gp == 0 && gs == 0) { base["dailyPageGoal"] = gp >= gs ? pk["dailyPageGoal"] : sk["dailyPageGoal"] }
        var byDate: [String: Double] = [:]
        for e in pk.objects("pageLog") + sk.objects("pageLog") {
            if let d = e.str("date") { byDate[d] = max(byDate[d] ?? 0, e.num("page") ?? 0) }
        }
        let cutoff = DateKey.string(Date(timeIntervalSince1970: (now - 45 * 86400000) / 1000))
        let log = byDate.filter { $0.key >= cutoff }.sorted { $0.key < $1.key }
            .map { ["date": JSONValue.string($0.key), "page": .number($0.value)] as RawObject }
        base.put("completed", max(pk.num("completed") ?? 0, sk.num("completed") ?? 0))
        if !log.isEmpty { base.put("pageLog", objects: log) }
        return base
    }

    private static func hifzGen(_ h: RawObject) -> String {
        if let id = h.str("planId") { return id }
        if let p = h.obj("plan") { return "l:\(p.int("startId") ?? 0):\(p.str("createdAt") ?? "")" }
        return "l:none"
    }

    static func mergeHifz(_ a: RawObject, _ b: RawObject, now: Double) -> RawObject {
        let ga = hifzGen(a), gb = hifzGen(b)
        let aAt = a.num("planUpdatedAt") ?? 0, bAt = b.num("planUpdatedAt") ?? 0
        let cutoff = now - tombstoneTTL
        if ga != gb {
            let aWins = aAt != bAt ? aAt > bAt : ga > gb
            var win = aWins ? a : b
            win.put("planId", hifzGen(win))
            return win
        }
        let tomb = unionMax(a.obj("deletedRecords"), b.obj("deletedRecords")).filter { ($0.value.numberValue ?? 0) >= cutoff }
        func records(_ k: String) -> [RawObject] {
            var byId: [String: RawObject] = [:]
            for r in a.objects(k) + b.objects(k) {
                guard let id = r.str("id") else { continue }
                if let prev = byId[id] {
                    if (r.num("updatedAt") ?? r.num("at") ?? 0) > (prev.num("updatedAt") ?? prev.num("at") ?? 0) { byId[id] = r }
                } else { byId[id] = r }
            }
            return byId.values.filter { tomb[$0.str("id") ?? ""] == nil }.sorted {
                (($0.str("date") ?? ""), ($0.num("at") ?? 0), ($0.str("id") ?? "")) > (($1.str("date") ?? ""), ($1.num("at") ?? 0), ($1.str("id") ?? ""))
            }
        }
        let sessions = records("sessions"), reviews = records("reviews")
        var bM: [String: RawObject] = [:]
        for m in b.objects("mistakes") { if let id = m.str("id") { bM[id] = m } }
        let mistakes = unionOrdered(a.objects("mistakes"), b.objects("mistakes")) { $0.str("id") }
            .filter { tomb[$0.str("id") ?? ""] == nil }
            .map { m -> RawObject in
                guard let id = m.str("id"), let y = bM[id], y != m else { return m }
                var newer = (m.str("updatedAt") ?? "") >= (y.str("updatedAt") ?? "") ? m : y
                newer.put("hits", strings: Array(Set(m.strings("hits") + y.strings("hits"))).sorted())
                return newer
            }
        let floor = Double((a.obj("plan")?.int("startId") ?? b.obj("plan")?.int("startId") ?? 1) - 1)
        let sessMax = sessions.reduce(floor) { max($0, $1.num("toId") ?? 0) }
        let newestSession = sessions.reduce(0.0) { max($0, $1.num("at") ?? 0) }
        let fa = a.num("frontierUpdatedAt") ?? 0, fb = b.num("frontierUpdatedAt") ?? 0
        let mf = max(fa, fb)
        let mfVal = (fa != fb ? fa > fb : (a.num("frontierId") ?? 0) >= (b.num("frontierId") ?? 0)) ? (a.num("frontierId") ?? 0) : (b.num("frontierId") ?? 0)
        let frontier = mf > newestSession ? mfVal : max(mfVal, sessMax)
        let planSide = aAt != bAt ? (aAt > bAt ? a : b) : (a.obj("plan") != nil ? a : b)
        var out: RawObject = [:]
        out["plan"] = planSide["plan"] ?? .null
        out.put("frontierId", frontier)
        out.put("sessions", objects: sessions)
        out.put("reviews", objects: reviews)
        out.put("mistakes", objects: mistakes)
        let lt = max(a.str("lastTestDate") ?? "", b.str("lastTestDate") ?? "")
        if !lt.isEmpty { out.put("lastTestDate", lt) }
        out.put("planId", a.str("planId") ?? b.str("planId") ?? ga)
        if max(aAt, bAt) > 0 { out.put("planUpdatedAt", max(aAt, bAt)) }
        if mf > 0 { out.put("frontierUpdatedAt", mf) }
        if !tomb.isEmpty { out.put("deletedRecords", tomb) }
        return out
    }

    /// المذكرات: النصّ من الأحدث تعديلاً، والوسائط لا تضيع من الطرف الآخر،
    /// والسطور السريعة التي لم يرها الفائز تُلحق بنصّه.
    static func mergeJournal(_ p: [RawObject], _ s: [RawObject], alive: (RawObject) -> Bool, mediaTomb: Set<String>) -> [RawObject] {
        var sBy: [String: RawObject] = [:]
        for e in s { if let id = e.str("id") { sBy[id] = e } }
        let merged = p.map { e -> RawObject in
            guard let id = e.str("id"), let other = sBy[id] else { return e }
            var base = stamp(other) > stamp(e) ? other : e
            let from = base == e ? other : e
            // السطور السريعة
            let known = Set(base.objects("quickLines").compactMap { $0.str("id") })
            let unseen = from.objects("quickLines").filter { ($0.str("id")).map { !known.contains($0) } ?? false }
            if !unseen.isEmpty {
                var content = base.str("content") ?? ""
                for q in unseen {
                    guard let t = q.str("text"), !content.components(separatedBy: "\n\n").contains(t) else { continue }
                    content = content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? t : content.replacingOccurrences(of: "\\s+$", with: "", options: .regularExpression) + "\n\n" + t
                }
                base.put("content", content)
                base.put("quickLines", objects: base.objects("quickLines") + unseen)
            }
            // الوسائط: تُملأ حين يخلو الفائز، والمراجع تتّحد.
            if base.strings("photos").isEmpty && base.str("photo") == nil && (!from.strings("photos").isEmpty || from.str("photo") != nil) {
                base["photos"] = from["photos"]; base["photo"] = from["photo"]
            }
            if base.strings("audios").isEmpty && base.str("audio") == nil && (!from.strings("audios").isEmpty || from.str("audio") != nil) {
                base["audios"] = from["audios"]; base["audio"] = from["audio"]
            }
            for k in ["photoRefs", "audioRefs"] {
                let u = Array(Set(base.strings(k) + from.strings(k))).sorted()
                if !u.isEmpty { base.put(k, strings: u) }
            }
            return base
        }
        return unionOrdered(merged, s) { $0.str("id") }.filter(alive).map { e in
            guard !mediaTomb.isEmpty, let id = e.str("id") else { return e }
            var e = e
            for (k, kind) in [("photoRefs", "photos"), ("audioRefs", "audios")] where e[k] != nil {
                e.put(k, strings: e.strings(k).filter { !mediaTomb.contains("\(id):\(kind):\($0)") })
            }
            return e
        }
    }
}

extension JSONValue {
    var numberValue: Double? { if case .number(let n) = self { return n }; return nil }
}
