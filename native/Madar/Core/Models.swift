import Foundation

// نماذج «مدار» — نفس أسماء الحقول وقيمها في `src/lib/types.ts` حرفياً، فالنسخة
// الاحتياطية من الويب تُقرأ هنا وتُكتب من هنا بلا ترجمة. القيم العربية (حالة
// الصلاة، أسماء الفروض) تبقى نصوصاً كما هي في الويب.

// MARK: - الصلاة

enum Prayer: String, CaseIterable, Identifiable {
    case fajr = "الفجر", dhuhr = "الظهر", asr = "العصر", maghrib = "المغرب", isha = "العشاء"
    var id: String { rawValue }
    var symbol: String {
        switch self {
        case .fajr: return "sunrise"
        case .dhuhr: return "sun.max"
        case .asr: return "sun.min"
        case .maghrib: return "sunset"
        case .isha: return "moon.stars"
        }
    }
}

enum PrayerStatus: String, CaseIterable, Identifiable {
    case none = "لم", alone = "منفردة", jamaah = "جماعة", missed = "فائتة", qada = "قضاء"
    var id: String { rawValue }

    /// **البوّابة الوحيدة** لمعنى «أُدِّيت» — «قضاء» أداءٌ متأخّر فيُحتسب،
    /// و«فائتة» دَينٌ لا أداء (`isPrayedStatus` في الويب).
    var isPrayed: Bool { self == .alone || self == .jamaah || self == .qada }

    var label: String {
        switch self {
        case .none: return "لم تُصلَّ بعد"
        case .alone: return "منفرداً"
        case .jamaah: return "بالمسجد"
        case .missed: return "فاتتني"
        case .qada: return "قضيتُها"
        }
    }
    var colorHex: UInt32 {
        switch self {
        case .none: return 0xCBB894
        case .alone: return 0xDC9F3C
        case .jamaah: return 0x1F7A6C
        case .missed: return 0xC15A34
        case .qada: return 0x3F6F8F
        }
    }
}

enum Khushu: Int, CaseIterable, Identifiable {
    case distracted = 1, present = 2, humble = 3
    var id: Int { rawValue }
    var label: String { ["شارد", "حاضر", "خاشع"][rawValue - 1] }
    var hint: String { ["كنتُ في وادٍ آخر", "عرفتُ ما أقول", "وجدتُ لها أثرًا"][rawValue - 1] }
    var colorHex: UInt32 { [0xC15A34, 0xDC9F3C, 0x1F7A6C][rawValue - 1] }
}

struct PrayerLog: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    init(date: String) { raw = ["date": .string(date), "prayers": .object([:])] }

    var id: String { date }
    var date: String { raw.str("date") ?? "" }

    func status(_ p: Prayer) -> PrayerStatus {
        raw.obj("prayers")?.str(p.rawValue).flatMap(PrayerStatus.init(rawValue:)) ?? .none
    }

    /// درجة الخشوع تُقرأ من هنا وحدها (`khushuOf`): تسقط على فرضٍ لم يُؤدَّ وخارج ١..٣.
    func khushu(_ p: Prayer) -> Khushu? {
        guard status(p).isPrayed else { return nil }
        return raw.obj("khushu")?.int(p.rawValue).flatMap(Khushu.init(rawValue:))
    }

    /// تغيير الحالة يختم طابع الصلاة نفسها، ويمسح الخشوع حين لا تصير أداءً.
    mutating func setStatus(_ s: PrayerStatus, _ p: Prayer) {
        let now = DateKey.nowMs()
        var prayers = raw.obj("prayers") ?? [:]
        prayers.put(p.rawValue, s.rawValue)
        raw.put("prayers", prayers)
        var stamps = raw.obj("prayerUpdatedAt") ?? [:]
        stamps.put(p.rawValue, now)
        raw.put("prayerUpdatedAt", stamps)
        if !s.isPrayed, var k = raw.obj("khushu"), k[p.rawValue] != nil {
            k[p.rawValue] = nil
            raw.put("khushu", k)
            var ks = raw.obj("khushuUpdatedAt") ?? [:]
            ks.put(p.rawValue, now)
            raw.put("khushuUpdatedAt", ks)
        }
    }

    mutating func setKhushu(_ level: Khushu?, _ p: Prayer) {
        guard status(p).isPrayed else { return }
        var k = raw.obj("khushu") ?? [:]
        k[p.rawValue] = level.map { .number(Double($0.rawValue)) }
        raw.put("khushu", k)
        var ks = raw.obj("khushuUpdatedAt") ?? [:]
        ks.put(p.rawValue, DateKey.nowMs())
        raw.put("khushuUpdatedAt", ks)
    }

    var sunan: Int { raw.int("sunan") ?? 0 }
    mutating func setSunan(_ n: Int) {
        raw.put("sunan", max(0, n))
        raw.put("sunanUpdatedAt", DateKey.nowMs())
    }

    var qiyamRakaat: Int { raw.obj("qiyam")?.int("rakaat") ?? 0 }
    var witr: Bool { raw.obj("qiyam")?.bool("witr") ?? false }
    mutating func setQiyam(rakaat: Int, witr: Bool) {
        raw.put("qiyam", ["rakaat": .number(Double(max(0, rakaat))), "witr": .bool(witr)])
        raw.put("qiyamUpdatedAt", DateKey.nowMs())
    }

    var prayedCount: Int { Prayer.allCases.filter { status($0).isPrayed }.count }
}

// MARK: - المذكرات

struct Mood: Identifiable {
    let value: Int, emoji: String, label: String
    var id: Int { value }
    static let all: [Mood] = [
        Mood(value: 1, emoji: "😔", label: "صعب"),
        Mood(value: 2, emoji: "🙁", label: "ثقيل"),
        Mood(value: 3, emoji: "😐", label: "عادي"),
        Mood(value: 4, emoji: "🙂", label: "جميل"),
        Mood(value: 5, emoji: "😄", label: "رائع"),
    ]
    static func of(_ v: Int?) -> Mood? { all.first { $0.value == v } }
}

struct JournalEntry: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    static func new(date: String) -> JournalEntry {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "HH:mm"
        var e = JournalEntry(raw: [:])
        e.raw.put("id", newID())
        e.raw.put("date", date)
        e.raw.put("time", f.string(from: Date()))
        e.raw.put("content", "")
        e.raw.put("source", "manual")
        return e
    }

    var date: String { get { raw.str("date") ?? "" } set { raw.put("date", newValue) } }
    var time: String? { raw.str("time") }
    var title: String {
        get { raw.str("title") ?? "" }
        set { raw.put("title", newValue.isEmpty ? nil : newValue) }
    }
    var content: String { get { raw.str("content") ?? "" } set { raw.put("content", newValue) } }
    var mood: Int? { get { raw.int("mood") } set { raw.put("mood", newValue) } }
    var starred: Bool {
        get { raw.bool("starred") ?? false }
        set { if newValue { raw.put("starred", true) } else { raw["starred"] = nil } }
    }
    var tags: [String] { raw.strings("tags") }
    var question: String? { raw.str("question") }
    var place: String? { raw.obj("location")?.str("place") }

    /// الصور: `photos` (الأحدث) أو `photo` المفردة القديمة. القيمة إمّا
    /// `data:` مضمّنة أو مرجع `media:<hash>` في مخزن الوسائط المحليّ.
    var photos: [String] {
        let list = raw.strings("photos")
        if !list.isEmpty { return list }
        return raw.str("photo").map { [$0] } ?? []
    }
    mutating func setPhotos(_ list: [String]) {
        raw.put("photos", strings: list.isEmpty ? nil : list)
        raw.put("photo", list.first)
    }

    var audios: [String] {
        let list = raw.strings("audios")
        if !list.isEmpty { return list }
        return raw.str("audio").map { [$0] } ?? []
    }
    mutating func setAudios(_ list: [String]) {
        raw.put("audios", strings: list.isEmpty ? nil : list)
        raw.put("audio", list.first)
    }

    var isEmpty: Bool { content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && title.isEmpty && photos.isEmpty && audios.isEmpty }
}

// MARK: - المال

struct Transaction: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    static func new(date: String, amount: Double, category: String, note: String) -> Transaction {
        var t = Transaction(raw: [:])
        t.raw.put("id", newID())
        t.raw.put("date", date)
        t.raw.put("amount", round2(amount))
        t.raw.put("category", category)
        t.raw.put("note", note)
        return t
    }

    var date: String { get { raw.str("date") ?? "" } set { raw.put("date", newValue) } }
    var amount: Double { get { raw.num("amount") ?? 0 } set { raw.put("amount", round2(newValue)) } }
    var category: String { get { raw.str("category") ?? "" } set { raw.put("category", newValue) } }
    var note: String { get { raw.str("note") ?? "" } set { raw.put("note", newValue) } }
    var offBudget: Bool {
        get { raw.bool("offBudget") ?? false }
        set { if newValue { raw.put("offBudget", true) } else { raw["offBudget"] = nil } }
    }
    var direction: String? { raw.str("direction") }
    var kind: String? { raw.str("kind") }

    /// حصص المظاريف: `[{fundId, pct}]` — الباقي حتى ١٠٠٪ على المصروف اليومي.
    var reserveSplits: [(fundId: String, pct: Double)] {
        raw.objects("reserveSplits").compactMap { o in
            guard let f = o.str("fundId"), let p = o.num("pct") else { return nil }
            return (f, p)
        }
    }
    mutating func setReserveSplits(_ splits: [(fundId: String, pct: Double)]) {
        raw.put("reserveSplits", objects: splits.isEmpty ? nil : splits.map { ["fundId": .string($0.fundId), "pct": .number($0.pct)] })
    }
}

struct FinanceCategory: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    init(id: String, label: String, icon: String, color: String, parentId: String? = nil, allowSubs: Bool = false) {
        raw = [:]
        raw.put("id", id); raw.put("label", label); raw.put("icon", icon); raw.put("color", color)
        raw.put("parentId", parentId)
        if allowSubs { raw.put("allowSubs", true) }
    }

    var label: String { get { raw.str("label") ?? "" } set { raw.put("label", newValue) } }
    var icon: String { get { raw.str("icon") ?? "📌" } set { raw.put("icon", newValue) } }
    var color: String { raw.str("color") ?? "#888888" }
    var parentId: String? { raw.str("parentId") }

    static let defaults: [FinanceCategory] = [
        .init(id: "cat-essentials", label: "أساسيات", icon: "🧺", color: "#c1663f", allowSubs: true),
        .init(id: "cat-luxuries", label: "كماليات", icon: "✨", color: "#c9852a", allowSubs: true),
        .init(id: "cat-investment", label: "استثمار", icon: "📊", color: "#3d9640"),
        .init(id: "cat-charity", label: "صدقة", icon: "🤲", color: "#1f7a6c"),
        .init(id: "cat-others", label: "للآخرين", icon: "🎁", color: "#8a6fb0"),
    ]
    static let unknown = FinanceCategory(id: "", label: "غير مصنف", icon: "📌", color: "#888888")
}

struct Budget: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    var id: String { category }
    var category: String { raw.str("category") ?? "" }
    var limit: Double? { raw.num("limit") }
    var pct: Double? { raw.num("pct") }

    /// السقف الفعليّ: النسبة من الدخل تغلب المبلغ الثابت حين يوجد الاثنان.
    func effectiveLimit(monthlyIncome: Double?) -> Double? {
        if let p = pct, let inc = monthlyIncome, inc > 0 { return round2(inc * p / 100) }
        return limit
    }
}

struct ReserveFund: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    static func new(name: String, icon: String, target: Double?) -> ReserveFund {
        var f = ReserveFund(raw: [:])
        f.raw.put("id", newID())
        f.raw.put("name", name)
        f.raw.put("icon", icon)
        f.raw.put("color", "#1f7a6c")
        f.raw.put("role", "custom")
        f.raw.put("target", target)
        f.raw.put("deposits", objects: [])
        f.raw.put("createdAt", DateKey.today())
        return f
    }

    var name: String { get { raw.str("name") ?? "" } set { raw.put("name", newValue) } }
    var icon: String { get { raw.str("icon") ?? "💰" } set { raw.put("icon", newValue) } }
    var target: Double? { get { raw.num("target") } set { raw.put("target", newValue) } }

    /// الدور ثابتٌ للنظام؛ السجلّات القديمة بلا `role` تُطبَّع من اسمها المحجوز.
    var role: String {
        if let r = raw.str("role") { return r }
        if name == "الفوائض" { return "surplus" }
        if name == "عام" { return "general" }
        return "custom"
    }

    var deposits: [(id: String, date: String, amount: Double, note: String?)] {
        raw.objects("deposits").compactMap { o in
            guard let d = o.str("date"), let a = o.num("amount") else { return nil }
            return (o.str("id") ?? "", d, a, o.str("note"))
        }
    }
    mutating func addDeposit(amount: Double, date: String, note: String?) {
        var list = raw.objects("deposits")
        var o: RawObject = [:]
        o.put("id", ReserveFund.newID()); o.put("date", date); o.put("amount", round2(amount)); o.put("note", note)
        list.append(o)
        raw.put("deposits", objects: list)
    }
    mutating func removeDeposit(id: String) {
        raw.put("deposits", objects: raw.objects("deposits").filter { $0.str("id") != id })
    }

    var fundingPerCycle: Double? { raw.obj("funding")?.num("perCycle") }
    var fundingSource: String? { raw.obj("funding")?.str("source") }
    var fundingStop: String? { raw.obj("funding")?.str("stop") }
    mutating func setFunding(perCycle: Double?, source: String, stop: String?) {
        guard let p = perCycle, p > 0 else { raw["funding"] = nil; return }
        var o: RawObject = ["perCycle": .number(round2(p)), "source": .string(source)]
        o.put("stop", stop)
        raw.put("funding", o)
    }

    var runningTrip: (id: String, startedAt: String)? {
        for o in raw.objects("trips") where o.str("endedAt") == nil {
            if let id = o.str("id"), let s = o.str("startedAt") { return (id, s) }
        }
        return nil
    }
    var trips: [(id: String, startedAt: String, endedAt: String?)] {
        raw.objects("trips").compactMap { o in
            guard let id = o.str("id"), let s = o.str("startedAt") else { return nil }
            return (id, s, o.str("endedAt"))
        }
    }
    mutating func startTrip(on day: String) {
        var list = raw.objects("trips")
        list.append(["id": .string(ReserveFund.newID()), "startedAt": .string(day)])
        raw.put("trips", objects: list)
    }
    mutating func endTrip(on day: String) {
        raw.put("trips", objects: raw.objects("trips").map { o in
            var o = o
            if o.str("endedAt") == nil { o.put("endedAt", max(day, o.str("startedAt") ?? day)) }
            return o
        })
    }
}

// MARK: - القرآن

struct QuranReflection: RawRecord {
    var raw: RawObject
    init(raw: RawObject) { self.raw = raw }
    init(from decoder: Decoder) throws { raw = try RawObject(from: decoder) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    static func new(surah: Int?, from: Int?, to: Int?, text: String) -> QuranReflection {
        var r = QuranReflection(raw: [:])
        let today = DateKey.today()
        r.raw.put("id", newID())
        r.raw.put("date", today)
        r.raw.put("createdAt", today)
        r.raw.put("surah", surah)
        r.raw.put("fromAyah", from)
        r.raw.put("toAyah", to ?? from)
        r.raw.put("text", text)
        if let s = surah, let meta = QuranMeta.surah(s) {
            var ref = meta.name
            if let f = from {
                ref += " \(f)"
                if let t = to, t != f { ref += "-\(t)" }
            }
            r.raw.put("reference", ref)
        }
        return r
    }

    var date: String { raw.str("date") ?? "" }
    var text: String { get { raw.str("text") ?? "" } set { raw.put("text", newValue) } }
    var surah: Int? { raw.int("surah") }
    var fromAyah: Int? { raw.int("fromAyah") }
    var toAyah: Int? { raw.int("toAyah") }
    var reference: String? { raw.str("reference") }
}
