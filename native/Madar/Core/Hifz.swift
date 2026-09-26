import Foundation

/// الحفظ المتتابع والمراجعة المتباعدة — نقلٌ لـ`hifz.ts` و`schedule.ts` و`intensity.ts`.
/// ثلاث قواعد لا تُكسر: (١) المراجعة قبل موعدها لا تُصعِّد — `applyRating` هي
/// القاعدة الوحيدة؛ (٢) التقييم لكلّ وجه؛ (٣) «مستحقّ» من الجدول وحده.
struct HifzState {
    var raw: RawObject

    struct Plan { var startId: Int; var unit: String; var amount: Int; var intensity: String }
    struct Event { var id: String; var date: String; var fromId: Int; var toId: Int; var rating: Int?; var at: Double?; var order: Int }

    var plan: Plan? {
        guard let p = raw.obj("plan"), let s = p.int("startId") else { return nil }
        return Plan(startId: s, unit: p.str("unit") ?? "page", amount: max(1, p.int("amount") ?? 1), intensity: p.str("intensity") ?? "balanced")
    }
    var frontierId: Int { raw.int("frontierId") ?? 0 }
    var lastTestDate: String? { raw.str("lastTestDate") }

    private func events(_ key: String) -> [RawObject] { raw.objects(key) }
    var sessions: [RawObject] { events("sessions") }
    var reviews: [RawObject] { events("reviews") }

    /// الجلسات والمراجعات معاً، `order` رتبةُ الحداثة (المصفوفتان الأحدثُ أوّلاً).
    func eventsByRecency() -> [Event] {
        func tag(_ list: [RawObject], _ base: Int) -> [Event] {
            list.enumerated().compactMap { i, o in
                guard let d = o.str("date"), let f = o.int("fromId"), let t = o.int("toId") else { return nil }
                return Event(id: o.str("id") ?? "", date: d, fromId: f, toId: t, rating: o.int("rating"), at: o.num("at"), order: base + list.count - 1 - i)
            }
        }
        return tag(sessions, 0) + tag(reviews, sessions.count)
    }
}

enum HifzPreset {
    struct P { let reps: Int, recentPages: Int, dailyReviewPages: Int, ladder: [Int], goodDays: Int, needsDays: Int }
    static let all: [String: P] = [
        "light": P(reps: 3, recentPages: 3, dailyReviewPages: 4, ladder: [10, 21, 45, 90], goodDays: 5, needsDays: 2),
        "balanced": P(reps: 5, recentPages: 5, dailyReviewPages: 7, ladder: [7, 14, 30, 60], goodDays: 3, needsDays: 1),
        "intense": P(reps: 7, recentPages: 8, dailyReviewPages: 12, ladder: [5, 10, 21, 45], goodDays: 2, needsDays: 1),
    ]
    static let labels: [(String, String, String)] = [
        ("light", "خفيف", "مراجعةٌ أوسع مباعدةً وحملٌ يوميّ أقل — للأيام المزدحمة."),
        ("balanced", "متوازن", "الإيقاع المعتاد: تكرارٌ خمس مرّات ومراجعةٌ متدرّجة."),
        ("intense", "مكثّف", "مددٌ أقصر وسقفٌ أعلى — إتقانٌ أسرع بجهدٍ أكبر."),
    ]
    static func of(_ s: HifzState) -> P { all[s.plan?.intensity ?? "balanced"] ?? all["balanced"]! }
}

enum Hifz {
    struct Portion: Equatable { var fromId: Int; var toId: Int }

    static let unitLabel = ["ayah": "آية", "quarter": "ربع وجه", "half": "نصف وجه", "page": "وجه"]

    static func portionEnd(_ start: Int, unit: String, amount: Int) -> Int {
        let amt = max(1, amount)
        if unit == "ayah" { return min(start + amt - 1, QuranMeta.totalAyat) }
        if unit == "page" {
            let target = min(QuranMeta.page(ofAyah: start) + amt - 1, QuranMeta.totalPages)
            return min(QuranMeta.pageRange(target).upperBound, QuranMeta.totalAyat)
        }
        let target = (unit == "half" ? 0.5 : 0.25) * Double(amt)
        var acc = 0.0, id = start
        while id <= QuranMeta.totalAyat {
            let pr = QuranMeta.pageRange(QuranMeta.page(ofAyah: id))
            acc += 1 / Double(pr.count)
            if acc >= target - 1e-9 { break }
            id += 1
        }
        return min(id, QuranMeta.totalAyat)
    }

    static func plannedPortion(_ s: HifzState) -> Portion? {
        guard let p = s.plan else { return nil }
        let start = s.frontierId + 1
        guard start <= QuranMeta.totalAyat else { return nil }
        return Portion(fromId: start, toId: portionEnd(start, unit: p.unit, amount: p.amount))
    }

    static func recentBand(_ s: HifzState) -> Portion? {
        let from = s.plan?.startId ?? 1
        guard s.frontierId >= from else { return nil }
        let pages = HifzPreset.of(s).recentPages
        let startPage = max(1, QuranMeta.page(ofAyah: s.frontierId) - pages + 1)
        return Portion(fromId: max(QuranMeta.pageRange(startPage).lowerBound, from), toId: s.frontierId)
    }

    static func progressPct(_ s: HifzState) -> Double {
        let start = s.plan?.startId ?? 1
        let span = s.frontierId >= start ? s.frontierId - start + 1 : 0
        let target = QuranMeta.totalAyat - start + 1
        return target > 0 ? min(1, Double(span) / Double(target)) : 0
    }

    static func streak(_ s: HifzState, today: String) -> Int {
        PrayerLogic.streak(of: Set(s.sessions.compactMap { $0.str("date") }), today: today)
    }

    // MARK: الجدول

    static let easeMin = 0.6, easeMax = 1.4, earlyFraction = 0.8

    static func clampEase(_ v: Double) -> Double {
        guard v.isFinite, v > 0 else { return 1 }
        return min(easeMax, max(easeMin, (v * 100).rounded() / 100))
    }

    static func nextEase(_ prev: Double, _ r: Int) -> Double {
        let step = [1: 0.82, 2: 0.95, 3: 1.06][r] ?? 1
        return clampEase((prev > 0 ? prev : 1) * step)
    }

    private static func rungOf(_ ladder: [Int], _ days: Double) -> Int {
        guard days > 0, days >= Double(ladder[0]) * 0.75 else { return -1 }
        var best = 0
        for i in 1..<ladder.count where abs(Double(ladder[i]) - days) < abs(Double(ladder[best]) - days) { best = i }
        return best
    }

    static func nextInterval(_ prev: Int, _ r: Int, _ p: HifzPreset.P, ease e: Double, elapsed: Int) -> Int {
        let ease = clampEase(e)
        if r == 1 { return max(1, p.needsDays) }
        if r == 2 { return max(1, Int((Double(p.goodDays) * ease).rounded())) }
        let baseline = Double(prev) / ease
        if prev <= 0 || baseline < Double(p.goodDays) * 0.75 { return max(1, Int((Double(p.goodDays) * ease).rounded())) }
        let idx = rungOf(p.ladder, baseline)
        let rung = idx < 0 ? p.ladder[0] : p.ladder[min(idx + 1, p.ladder.count - 1)]
        let base = elapsed > rung ? min(elapsed, rung * 2) : rung
        let ceiling = Int((Double(p.ladder.last!) * easeMax).rounded())
        return max(1, min(Int((Double(base) * ease).rounded()), ceiling))
    }

    struct Cursor { var interval: Int; var ease: Double; var lastDate: String? }

    /// **القاعدة الوحيدة** لأثر التقييم.
    static func applyRating(_ c: Cursor, _ r: Int, _ date: String, _ p: HifzPreset.P) -> (interval: Int, ease: Double, early: Bool) {
        let elapsed = c.lastDate.map { max(0, DateKey.days(from: $0, to: date)) } ?? 0
        let early = r == 3 && c.interval > 0 && Double(elapsed) < Double(c.interval) * earlyFraction
        if early { return (c.interval, c.ease, true) }
        let ease = nextEase(c.ease, r)
        return (nextInterval(c.interval, r, p, ease: ease, elapsed: elapsed), ease, false)
    }

    struct PageSchedule: Identifiable {
        var page: Int, interval: Int, ease: Double, lastReviewed: String?, dueDate: String?
        var overdue: Int, lapses: Int, mistakes: Int, risk: Double, due: Bool
        var id: Int { page }
    }

    static func risk(interval: Int, overdue: Int, lapses: Int, mistakes: Int, last: String?) -> Double {
        let m = Double(mistakes) * 0.5
        if last == nil { return ((2.5 + m) * 100).rounded() / 100 }
        let ratio = interval > 0 ? Double(overdue) / Double(interval) : Double(overdue)
        return ((ratio * 2 + Double(lapses) * 0.6 + m) * 100).rounded() / 100
    }

    private struct Rated { var fromPage: Int, toPage: Int, date: String, rating: Int, at: Double?, order: Int }

    private static func before(_ a: Rated, _ b: Rated) -> Bool {
        if a.date != b.date { return a.date < b.date }
        let aa = a.at ?? -.infinity, bb = b.at ?? -.infinity
        if aa != bb { return aa < bb }
        return a.order < b.order
    }

    private static func rated(_ s: HifzState) -> [Rated] {
        let list = s.eventsByRecency().compactMap { e -> Rated? in
            guard let r = e.rating, (1...3).contains(r) else { return nil }
            return Rated(fromPage: QuranMeta.page(ofAyah: e.fromId), toPage: QuranMeta.page(ofAyah: e.toId), date: e.date, rating: r, at: e.at, order: e.order)
        }.sorted(by: before)
        var latest: [String: Rated] = [:]
        for e in list {
            let k = "\(e.date):\(e.fromPage):\(e.toPage)"
            if let cur = latest[k], !before(cur, e) { continue }
            latest[k] = e
        }
        return latest.values.sorted(by: before)
    }

    static func openMistakes(_ s: HifzState) -> [RawObject] {
        s.raw.objects("mistakes").filter { !($0.bool("resolved") ?? false) && !$0.strings("hits").isEmpty }
    }

    static func schedules(_ s: HifzState, today: String) -> [PageSchedule] {
        let from = s.plan?.startId ?? 1
        guard s.plan != nil, s.frontierId >= from else { return [] }
        let first = QuranMeta.page(ofAyah: from), last = QuranMeta.page(ofAyah: s.frontierId)
        let p = HifzPreset.of(s)
        var byPage = Array(repeating: [Rated](), count: last - first + 1)
        for e in rated(s) {
            let a = max(first, e.fromPage), b = min(last, e.toPage)
            if a <= b { for pg in a...b { byPage[pg - first].append(e) } }
        }
        var mistakes: [Int: Int] = [:]
        for m in openMistakes(s) { if let a = m.int("ayahId") { mistakes[QuranMeta.page(ofAyah: a), default: 0] += 1 } }
        var out: [PageSchedule] = []
        for pg in first...last {
            let hits = byPage[pg - first]
            let mk = mistakes[pg] ?? 0
            if hits.isEmpty {
                out.append(PageSchedule(page: pg, interval: 0, ease: 1, lastReviewed: nil, dueDate: nil, overdue: 0, lapses: 0,
                                        mistakes: mk, risk: risk(interval: 0, overdue: 0, lapses: 0, mistakes: mk, last: nil), due: true))
                continue
            }
            var c = Cursor(interval: 0, ease: 1, lastDate: nil)
            var lapses = 0
            for e in hits {
                let n = applyRating(c, e.rating, e.date, p)
                c = Cursor(interval: n.interval, ease: n.ease, lastDate: e.date)
                if e.rating == 1 { lapses += 1 }
            }
            let lastR = hits.last!.date
            let dueDate = DateKey.adding(days: c.interval, to: lastR)
            let overdue = max(0, DateKey.days(from: dueDate, to: today))
            out.append(PageSchedule(page: pg, interval: c.interval, ease: c.ease, lastReviewed: lastR, dueDate: dueDate, overdue: overdue,
                                    lapses: lapses, mistakes: mk, risk: risk(interval: c.interval, overdue: overdue, lapses: lapses, mistakes: mk, last: lastR),
                                    due: dueDate <= today))
        }
        return out
    }

    static func nextDueDays(_ s: HifzState, _ portion: Portion, _ r: Int, today: String) -> Int {
        let pg = QuranMeta.page(ofAyah: portion.fromId)
        let cur = schedules(s, today: today).first { $0.page == pg }
        return applyRating(Cursor(interval: cur?.interval ?? 0, ease: cur?.ease ?? 1, lastDate: cur?.lastReviewed), r, today, HifzPreset.of(s)).interval
    }

    static func consistency(_ s: HifzState, today: String) -> Double {
        let start = DateKey.adding(days: -13, to: today)
        let days = Set((s.sessions + s.reviews).compactMap { $0.str("date") }.filter { $0 >= start && $0 <= today })
        return min(1, Double(days.count) / 14)
    }

    static func dueQueue(_ s: HifzState, today: String) -> (pages: [PageSchedule], total: Int) {
        let band = recentBand(s).map { (QuranMeta.page(ofAyah: $0.fromId), QuranMeta.page(ofAyah: $0.toId)) }
        let all = schedules(s, today: today)
            .filter { $0.due }
            .filter { band == nil || $0.page < band!.0 || $0.page > band!.1 }
            .sorted { ($0.risk, $0.overdue, -$0.page) > ($1.risk, $1.overdue, -$1.page) }
        let cap = max(2, Int((Double(HifzPreset.of(s).dailyReviewPages) * (0.7 + consistency(s, today: today) * 0.8)).rounded()))
        return (Array(all.prefix(cap)), all.count)
    }

    static func portion(ofPage pg: Int, _ s: HifzState) -> Portion {
        let r = QuranMeta.pageRange(pg)
        return Portion(fromId: max(r.lowerBound, s.plan?.startId ?? 1), toId: min(r.upperBound, s.frontierId))
    }

    /// أجزاءٌ مقيّمة لكلّ وجه — التقييم لا يُنسخ على المقطع كلّه.
    static func pageParts(_ p: Portion) -> [Portion] {
        var out: [Portion] = []
        var id = p.fromId
        while id <= p.toId {
            let r = QuranMeta.pageRange(QuranMeta.page(ofAyah: id))
            let end = min(r.upperBound, p.toId)
            out.append(Portion(fromId: id, toId: end))
            id = end + 1
        }
        return out
    }
}

extension Store {
    var hifz: HifzState { HifzState(raw: data.hifz) }

    private func editHifz(_ change: (inout RawObject) -> Void) {
        update { d in var h = d.hifz; change(&h); d.hifz = h }
    }

    func startHifzPlan(startId: Int, unit: String, amount: Int, intensity: String) {
        let now = DateKey.nowMs()
        update { d in
            var plan: RawObject = [:]
            plan.put("startId", startId); plan.put("unit", unit); plan.put("amount", max(1, amount))
            plan.put("createdAt", DateKey.today()); plan.put("intensity", intensity)
            d.hifz = ["plan": .object(plan), "frontierId": .number(Double(max(0, startId - 1))),
                      "sessions": .array([]), "reviews": .array([]), "mistakes": .array([]),
                      "planId": .string(UUID().uuidString.lowercased()), "planUpdatedAt": .number(now), "frontierUpdatedAt": .number(now)]
        }
    }

    func updateHifzPlan(unit: String? = nil, amount: Int? = nil, intensity: String? = nil) {
        editHifz { h in
            guard var p = h.obj("plan") else { return }
            if let u = unit { p.put("unit", u) }
            if let a = amount { p.put("amount", max(1, a)) }
            if let i = intensity { p.put("intensity", i) }
            h.put("plan", p)
            h.put("planUpdatedAt", DateKey.nowMs())
        }
    }

    func clearHifz() {
        editHifz { h in
            h = ["plan": .null, "frontierId": .number(0), "sessions": .array([]), "reviews": .array([]), "mistakes": .array([]),
                 "planId": .string(UUID().uuidString.lowercased()), "planUpdatedAt": .number(DateKey.nowMs())]
        }
    }

    enum GradedKind { case memorize, review, test }

    func recordGraded(_ kind: GradedKind, parts: [(Hifz.Portion, Int)]) {
        let now = DateKey.nowMs()
        let date = DateKey.today()
        let sorted = parts.sorted { $0.0.fromId < $1.0.fromId }
        editHifz { h in
            if kind == .memorize {
                var frontier = h.int("frontierId") ?? 0
                var added: [RawObject] = []
                for (p, r) in sorted {
                    let from = frontier + 1
                    let to = min(max(p.toId, from), QuranMeta.totalAyat)
                    guard to >= from else { continue }
                    let at = now + Double(added.count)
                    added.append(["id": .string(UUID().uuidString.lowercased()), "date": .string(date), "fromId": .number(Double(from)),
                                  "toId": .number(Double(to)), "rating": .number(Double(r)), "at": .number(at), "updatedAt": .number(at)])
                    frontier = to
                }
                guard !added.isEmpty else { return }
                h.put("frontierId", frontier)
                h.put("sessions", objects: added.reversed() + h.objects("sessions"))
            } else {
                let logs: [RawObject] = sorted.enumerated().map { i, pr in
                    ["id": .string(UUID().uuidString.lowercased()), "date": .string(date), "fromId": .number(Double(pr.0.fromId)),
                     "toId": .number(Double(pr.0.toId)), "rating": .number(Double(pr.1)), "at": .number(now + Double(i)), "updatedAt": .number(now + Double(i))]
                }
                guard !logs.isEmpty else { return }
                h.put("reviews", objects: logs.reversed() + h.objects("reviews"))
                if kind == .test { h.put("lastTestDate", date) }
            }
        }
        Haptic.success()
    }

    func setFrontier(_ id: Int) {
        editHifz { h in
            h.put("frontierId", min(max(id, 0), QuranMeta.totalAyat))
            h.put("frontierUpdatedAt", DateKey.nowMs())
        }
    }

    func deleteHifzEvent(_ id: String) {
        editHifz { h in
            let sessions = h.objects("sessions").filter { $0.str("id") != id }
            let reviews = h.objects("reviews").filter { $0.str("id") != id }
            if sessions.count != h.objects("sessions").count {
                let floor = max(0, (h.obj("plan")?.int("startId") ?? 1) - 1)
                h.put("frontierId", sessions.compactMap { $0.int("toId") }.max().map { max($0, floor) } ?? floor)
                h.put("frontierUpdatedAt", DateKey.nowMs())
            }
            h.put("sessions", objects: sessions)
            h.put("reviews", objects: reviews)
            var tomb = h.obj("deletedRecords") ?? [:]
            tomb.put(id, DateKey.nowMs())
            h.put("deletedRecords", tomb)
        }
    }
}
