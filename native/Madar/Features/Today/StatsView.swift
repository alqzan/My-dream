import SwiftUI
import Charts

/// الحصيلة: قراءةٌ سريعة لآخر ثلاثين يوماً، والسلاسل، وسنةُ الصلاة، والصرف شهراً بشهر.
struct StatsView: View {
    @EnvironmentObject var store: Store
    private var today: String { DateKey.today() }

    private struct Window {
        var days: [String] = []
        var prayed = 0, jamaah = 0, wroteDays = 0, quranDays = 0
        var spend = 0.0
    }

    private var window: Window {
        var w = Window()
        w.days = (0..<30).map { DateKey.adding(days: -$0, to: today) }.reversed()
        let set = Set(w.days)
        for l in store.data.prayerLogs where set.contains(l.date) {
            w.prayed += l.prayedCount
            w.jamaah += Prayer.allCases.filter { l.status($0) == .jamaah }.count
        }
        w.wroteDays = Set(store.data.journalEntries.map(\.date)).intersection(set).count
        w.quranDays = Nudges.quranDates(store.data).intersection(set).count
        w.spend = store.data.transactions.filter { set.contains($0.date) }.reduce(0) { $0 + BudgetEngine.cashOut($1) }
        return w
    }

    private func longest(_ dates: Set<String>) -> Int {
        var best = 0, run = 0
        var prev: String?
        for d in dates.sorted() {
            run = (prev.map { DateKey.adding(days: 1, to: $0) == d } ?? false) ? run + 1 : 1
            best = max(best, run); prev = d
        }
        return best
    }

    var body: some View {
        let w = window
        let fullPrayer = Set(store.data.prayerLogs.filter { $0.prayedCount == 5 }.map(\.date))
        let journal = Set(store.data.journalEntries.map(\.date))
        let quran = Nudges.quranDates(store.data)
        MdrList {
            Section {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    kpi("الصلوات المسجّلة", "\(Fmt.count(Int((Double(w.prayed) / 150 * 100).rounded())))٪", "\(Fmt.count(w.jamaah)) في جماعة", Theme.prayer)
                    kpi("أيامٌ كتبتَها", "\(Fmt.count(w.wroteDays))/\(Fmt.count(30))", w.wroteDays >= 20 ? "انتظام" : "متقطّع", Theme.journal)
                    kpi("أيام القرآن", "\(Fmt.count(w.quranDays))/\(Fmt.count(30))", "وِرد أو حفظ أو قراءة", Theme.quran)
                    kpi("الصرف", Fmt.amount(w.spend), "ر.س في ثلاثين يوماً", Theme.finance)
                }
                .padding(.vertical, 6)
                Text(insight(w)).font(.mdrSubheadline).foregroundStyle(Mdr.ink52).padding(.vertical, 4)
            } header: { Text("آخر ثلاثين يوماً") }

            Section("السلاسل") {
                streakRow("الصلوات الخمس", PrayerLogic.streak(of: fullPrayer, today: today), longest(fullPrayer), Theme.prayer)
                streakRow("المذكرات", PrayerLogic.streak(of: journal, today: today), longest(journal), Theme.journal)
                streakRow("القرآن", PrayerLogic.streak(of: quran, today: today), longest(quran), Theme.quran)
            }

            Section("سنة الصلاة") { YearGrid(logs: store.data.prayerLogs, today: today) }

            Section("الصرف شهراً بشهر") { spendChart }
        }
        .navigationTitle("الحصيلة")
    }

    private func kpi(_ label: String, _ value: String, _ note: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.mdrCaption).foregroundStyle(Mdr.ink52)
            Text(value).font(.mdrTitle2.bold()).foregroundStyle(color).minimumScaleFactor(0.7).lineLimit(1)
            Text(note).font(.mdrCaption2).foregroundStyle(Mdr.ink52)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func streakRow(_ label: String, _ current: Int, _ best: Int, _ color: Color) -> some View {
        HStack {
            Circle().fill(color).frame(width: 8, height: 8)
            Text(label)
            Spacer()
            VStack(alignment: .trailing, spacing: 0) {
                Text("\(Fmt.count(current)) يوم").font(.mdrHeadline).monospacedDigit()
                Text("الأطول \(Fmt.count(best))").font(.mdrCaption2).foregroundStyle(Mdr.ink52)
            }
        }
    }

    private func insight(_ w: Window) -> String {
        if w.prayed == 0 && w.wroteDays == 0 { return "ابدأ بيومٍ واحدٍ كاملٍ تُسجِّل فيه كلَّ شيء، وستقرأ هنا نمطَك بعد أسبوع." }
        if w.wroteDays >= 20 && w.prayed >= 120 { return "شهرٌ ثابت: كتبتَ أكثرَ أيامه وحافظتَ على أكثرِ فرائضه. الثباتُ أنفعُ من الوثبة." }
        if w.wroteDays < 8 { return "كتبتَ \(Fmt.count(w.wroteDays)) من \(Fmt.count(30)) يوماً. الأيامُ التي لا تُكتب لا تُستعاد." }
        return "\(Fmt.count(w.jamaah)) فرضاً في جماعة هذا الشهر — وهو أكثرُ ما يثبت البقيّة."
    }

    private struct MonthSpend: Identifiable { let id: String; let label: String; let total: Double }

    private var spendChart: some View {
        let cal = DateKey.calendar
        let now = Date()
        var months: [MonthSpend] = []
        for i in stride(from: 5, through: 0, by: -1) {
            guard let d = cal.date(byAdding: .month, value: -i, to: now) else { continue }
            let key = String(DateKey.string(d).prefix(7))
            let total = store.data.transactions.filter { $0.date.hasPrefix(key) }.reduce(0) { $0 + BudgetEngine.cashOut($1) }
            let f = DateFormatter(); f.locale = Fmt.arabicLocale; f.dateFormat = "MMM"
            months.append(MonthSpend(id: key, label: f.string(from: d), total: total))
        }
        return Chart(months) { m in
            BarMark(x: .value("الشهر", m.label), y: .value("الصرف", m.total))
                .foregroundStyle(Theme.finance.gradient)
                .cornerRadius(6)
                .annotation(position: .top) {
                    if m.total > 0 { Text(Fmt.amount(m.total.rounded())).font(.mdrCaption2).foregroundStyle(Mdr.ink52) }
                }
        }
        .chartYAxis(.hidden)
        .frame(height: 180)
        .padding(.vertical, 8)
    }
}

/// شبكة السنة: خليّةٌ لكلّ يوم بعدد ما أُدّي من الخمس.
struct YearGrid: View {
    let logs: [PrayerLog]
    let today: String

    var body: some View {
        let counts = Dictionary(logs.map { ($0.date, $0.prayedCount) }, uniquingKeysWith: max)
        let days = (0..<182).map { DateKey.adding(days: -$0, to: today) }.reversed()
        let columns = Array(days).chunked(7)
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 3) {
                ForEach(columns.indices, id: \.self) { c in
                    VStack(spacing: 3) {
                        ForEach(columns[c], id: \.self) { d in
                            let n = counts[d] ?? 0
                            RoundedRectangle(cornerRadius: 2.5)
                                .fill(n == 0 ? Mdr.line : Theme.prayer.opacity(0.2 + Double(n) / 5 * 0.8))
                                .frame(width: 12, height: 12)
                        }
                    }
                }
            }
            .padding(.vertical, 6)
        }
        .defaultScrollAnchor(.leading)
    }
}

extension Array {
    func chunked(_ n: Int) -> [[Element]] {
        stride(from: 0, to: count, by: n).map { Array(self[$0..<Swift.min($0 + n, count)]) }
    }
}
