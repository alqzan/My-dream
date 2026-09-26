import Foundation

/// لقطة بيانات «مدار» بصيغة `AppData` في الويب. المجموعات التي تعرضها هذه
/// النسخة مكتوبة؛ وكلُّ مفتاحٍ آخر (الكتب، العادات، سجلّات البنك، الرسائل…)
/// يبقى في `rest` كما جاء فيخرج في التصدير سليماً.
struct AppData: Codable, Equatable {
    var prayerLogs: [PrayerLog] = []
    var journalEntries: [JournalEntry] = []
    var transactions: [Transaction] = []
    var categories: [FinanceCategory] = FinanceCategory.defaults
    var budgets: [Budget] = []
    var reserves: [ReserveFund] = []
    var quranReflections: [QuranReflection] = []
    var rest: RawObject = [:]

    private static let typedKeys: Set<String> = [
        "prayerLogs", "journalEntries", "transactions", "categories", "budgets", "reserves", "quranReflections",
    ]

    init() {}

    init(raw input: RawObject) {
        var raw = input
        raw["__meta"] = nil
        prayerLogs = raw.objects("prayerLogs").map(PrayerLog.init(raw:)).filter { DateKey.isValid($0.date) }
        journalEntries = raw.objects("journalEntries").map(JournalEntry.init(raw:)).filter { !$0.id.isEmpty }
        transactions = raw.objects("transactions").map(Transaction.init(raw:)).filter { !$0.id.isEmpty }
        let cats = raw.objects("categories").map(FinanceCategory.init(raw:)).filter { !$0.id.isEmpty }
        categories = cats.isEmpty ? FinanceCategory.defaults : cats
        budgets = raw.objects("budgets").map(Budget.init(raw:)).filter { !$0.category.isEmpty }
        reserves = raw.objects("reserves").map(ReserveFund.init(raw:)).filter { !$0.id.isEmpty }
        quranReflections = raw.objects("quranReflections").map(QuranReflection.init(raw:)).filter { !$0.id.isEmpty }
        for k in Self.typedKeys { raw[k] = nil }
        rest = raw
    }

    var raw: RawObject {
        var o = rest
        o.put("prayerLogs", objects: prayerLogs.map(\.raw))
        o.put("journalEntries", objects: journalEntries.map(\.raw))
        o.put("transactions", objects: transactions.map(\.raw))
        o.put("categories", objects: categories.map(\.raw))
        o.put("budgets", objects: budgets.map(\.raw))
        o.put("reserves", objects: reserves.map(\.raw))
        o.put("quranReflections", objects: quranReflections.map(\.raw))
        return o
    }

    init(from decoder: Decoder) throws { self.init(raw: try RawObject(from: decoder)) }
    func encode(to encoder: Encoder) throws { try raw.encode(to: encoder) }

    // MARK: قيمٌ مفردة (تُختم في `fieldUpdatedAt` كما في الويب)

    private mutating func stampField(_ k: String) {
        var f = rest.obj("fieldUpdatedAt") ?? [:]
        f.put(k, DateKey.nowMs())
        rest.put("fieldUpdatedAt", f)
    }

    var qadaBacklog: Int {
        get { rest.int("qadaBacklog") ?? 0 }
        set { rest.put("qadaBacklog", max(0, newValue)); stampField("qadaBacklog") }
    }

    var monthlyIncome: Double? {
        get { rest.num("monthlyIncome") }
        set { rest[ "monthlyIncome"] = newValue.map(JSONValue.number) ?? .null; stampField("monthlyIncome") }
    }

    var salaryDay: Int {
        get { rest.int("salaryDay") ?? 27 }
        set { rest.put("salaryDay", min(max(newValue, 1), 31)); stampField("salaryDay") }
    }

    var lastSalaryConfirm: String? {
        get { rest.str("lastSalaryConfirm") }
        set { rest["lastSalaryConfirm"] = newValue.map(JSONValue.string) ?? .null; stampField("lastSalaryConfirm") }
    }

    var autoOffset: Bool {
        get { rest.bool("autoOffset") ?? true }
        set { rest.put("autoOffset", newValue); stampField("autoOffset") }
    }

    var dailyBudget: DailyBudget? {
        get { rest.obj("dailyBudget").flatMap(DailyBudget.init(raw:)) }
        set { rest["dailyBudget"] = newValue.map { .object($0.raw) } ?? .null; stampField("dailyBudget") }
    }

    var quranWird: [String] {
        get { rest.strings("quranWird") }
        set { rest.put("quranWird", strings: Array(Set(newValue)).sorted()) }
    }

    var khatma: Khatma {
        get { Khatma(raw: rest.obj("quranKhatma") ?? ["juz": .number(0), "completed": .number(0)]) }
        set { rest.put("quranKhatma", newValue.raw); stampField("quranKhatma") }
    }

    var hifz: RawObject {
        get { rest.obj("quranHifz") ?? [:] }
        set { rest.put("quranHifz", newValue) }
    }

    // MARK: الحذف

    /// شاهد حذفٍ بمعرّف العنصر (`deleted` في الويب) — كي لا يُعيده دمجٌ لاحق.
    mutating func tombstone(_ id: String) {
        guard !id.isEmpty else { return }
        var d = rest.obj("deleted") ?? [:]
        d.put(id, DateKey.nowMs())
        rest.put("deleted", d)
    }

    mutating func touch() {
        let f = ISO8601DateFormatter()
        rest.put("lastUpdated", f.string(from: Date()))
    }
}

/// الميزانية اليومية التراكمية (`DailyBudget` في الويب).
struct DailyBudget: Equatable {
    var raw: RawObject
    init?(raw: RawObject) {
        guard raw.num("amount") != nil, raw.str("startDate") != nil else { return nil }
        self.raw = raw
    }
    init(amount: Double, startDate: String) {
        raw = ["amount": .number(round2(amount)), "startDate": .string(startDate)]
    }
    var amount: Double { raw.num("amount") ?? 0 }
    var startDate: String { raw.str("startDate") ?? DateKey.today() }
    var carryAdjust: Double { get { raw.num("carryAdjust") ?? 0 } set { raw.put("carryAdjust", round2(newValue)) } }
    var fundingPerDay: Double { get { raw.num("fundingPerDay") ?? 0 } set { raw.put("fundingPerDay", round2(newValue)) } }
}

/// الختمة الجارية (`KhatmaState`).
struct Khatma: Equatable {
    var raw: RawObject
    var page: Int {
        get { raw.int("page") ?? ((raw.int("juz") ?? 0) * 20) }
        set {
            let p = min(max(newValue, 0), QuranMeta.totalPages)
            raw.put("page", p)
            raw.put("juz", QuranMeta.juzCompleted(page: p))
        }
    }
    var completed: Int { get { raw.int("completed") ?? 0 } set { raw.put("completed", newValue) } }
    var startDate: String? { get { raw.str("startDate") } set { raw.put("startDate", newValue) } }
    var lastReadDate: String? { get { raw.str("lastReadDate") } set { raw.put("lastReadDate", newValue) } }
    var dailyPageGoal: Int { get { raw.int("dailyPageGoal") ?? 20 } set { raw.put("dailyPageGoal", max(1, newValue)) } }

    var pageLog: [(date: String, page: Int)] {
        raw.objects("pageLog").compactMap { o in
            guard let d = o.str("date"), let p = o.int("page") else { return nil }
            return (d, p)
        }
    }

    /// يسجّل الصفحة التي بلغها اليوم: نقطةٌ واحدة لكلّ تاريخ، ومحدودٌ بآخر ٤٥ يوماً.
    mutating func record(page p: Int, on day: String) {
        if startDate == nil { startDate = day }
        page = p
        lastReadDate = day
        var log = pageLog.filter { $0.date != day }
        log.append((day, page))
        let cutoff = DateKey.adding(days: -45, to: day)
        log = log.filter { $0.date >= cutoff }.sorted { $0.date < $1.date }
        raw.put("pageLog", objects: log.map { ["date": .string($0.date), "page": .number(Double($0.page))] })
    }

    /// صفحاتُ اليوم (`pagesReadOn`): الصفحة الحالية ناقص آخر نقطةٍ قبل اليوم.
    func pagesRead(on day: String) -> Int {
        guard lastReadDate == day else { return 0 }
        return KhatmaMath.pagesRead(log: pageLog, on: day, currentPage: page)
    }
}
