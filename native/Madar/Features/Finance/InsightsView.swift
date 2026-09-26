import SwiftUI
import Charts

/// تحليل الصرف: أسبوع · شهر · سنة، مقابل الفترة السابقة، بالأقسام، وجملٌ صادقة
/// لا تُقال إلّا حين في البيانات ما يُقال (`finance/insights` في الويب).
struct InsightsView: View {
    @EnvironmentObject var store: Store
    @State private var period = "شهر"
    private var today: String { DateKey.today() }

    private struct Range { let start: String; let end: String; let prevStart: String; let prevEnd: String; let label: String; let prevLabel: String }

    private var range: Range {
        switch period {
        case "أسبوع":
            return Range(start: DateKey.adding(days: -6, to: today), end: today,
                         prevStart: DateKey.adding(days: -13, to: today), prevEnd: DateKey.adding(days: -7, to: today),
                         label: "آخر ٧ أيام", prevLabel: "الأسبوع اللي قبله")
        case "سنة":
            let y = Int(today.prefix(4)) ?? 2026
            return Range(start: "\(y)-01-01", end: today, prevStart: "\(y - 1)-01-01", prevEnd: "\(y - 1)\(today.dropFirst(4))",
                         label: "سنة \(Fmt.count(y)) حتى اليوم", prevLabel: "نفس الفترة من السنة الماضية")
        default:
            let start = String(today.prefix(7)) + "-01"
            let prevMonthStart = DateKey.calendar.date(byAdding: .month, value: -1, to: DateKey.date(start) ?? Date()).map(DateKey.string) ?? start
            let day = Int(today.suffix(2)) ?? 1
            let prevEnd = min(DateKey.adding(days: day - 1, to: prevMonthStart), DateKey.adding(days: -1, to: start))
            return Range(start: start, end: today, prevStart: prevMonthStart, prevEnd: prevEnd,
                         label: "\(DateKey.date(today).map(Fmt.monthYear) ?? "") حتى اليوم", prevLabel: "نفس الفترة من الشهر الماضي")
        }
    }

    private func txs(_ a: String, _ b: String) -> [Transaction] {
        store.data.transactions.filter { $0.date >= a && $0.date <= b && BudgetEngine.cashOut($0) > 0 }
    }

    private struct Bar: Identifiable { let id: String; let label: String; let value: Double; let daily: Double }

    var body: some View {
        let r = range
        let current = txs(r.start, r.end)
        let prev = txs(r.prevStart, r.prevEnd)
        let total = current.reduce(0) { $0 + BudgetEngine.cashOut($1) }
        let prevTotal = prev.reduce(0) { $0 + BudgetEngine.cashOut($1) }
        let bars = makeBars(current, r)
        let byMain = rollup(current)
        List {
            Section {
                Picker("الفترة", selection: $period) {
                    ForEach(["أسبوع", "شهر", "سنة"], id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            }
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(r.label).font(.subheadline).foregroundStyle(.secondary)
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(Fmt.amount(total.rounded())).font(.system(size: 40, weight: .bold, design: .rounded))
                        Text("ر.س").foregroundStyle(.secondary)
                    }
                    if prevTotal > 0 {
                        let delta = (total - prevTotal) / prevTotal * 100
                        Label("\(delta >= 0 ? "أكثر" : "أقلّ") بـ\(Fmt.count(Int(abs(delta).rounded())))٪ من \(r.prevLabel)",
                              systemImage: delta >= 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.footnote).foregroundStyle(delta > 10 ? Theme.danger : Theme.finance)
                    }
                }
                Chart(bars) { b in
                    BarMark(x: .value("اليوم", b.label), y: .value("الصرف", b.value))
                        .foregroundStyle(b.daily > rate && rate > 0 && period != "سنة" ? Theme.danger.gradient : Theme.finance.gradient)
                        .cornerRadius(4)
                    if rate > 0 && period != "سنة" {
                        RuleMark(y: .value("المصروف اليومي", rate))
                            .lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                            .foregroundStyle(Theme.brand)
                    }
                }
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 7)) }
                .frame(height: 180)
            }

            if !insights(current, bars: bars, byMain: byMain, total: total).isEmpty {
                Section("ما يقوله صرفك") {
                    ForEach(insights(current, bars: bars, byMain: byMain, total: total), id: \.self) { Text($0).font(.subheadline) }
                }
            }

            Section("بالأقسام") {
                ForEach(byMain) { row in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("\(row.main.icon) \(row.main.label)")
                            Spacer()
                            Text(Fmt.amount(row.total.rounded())).monospacedDigit()
                            Text("\(Fmt.count(Int((row.total / max(1, total) * 100).rounded())))٪").font(.caption).foregroundStyle(.secondary).frame(width: 40)
                        }
                        ProgressView(value: row.total / max(1, total)).tint(Color(hexString: row.main.color))
                    }
                }
            }
        }
        .navigationTitle("تحليل الصرف")
    }

    private var rate: Double { BudgetEngine.status(store.data)?.rate ?? 0 }

    private func makeBars(_ list: [Transaction], _ r: Range) -> [Bar] {
        if period == "سنة" {
            let y = String(today.prefix(4))
            return (1...12).map { m in
                let key = "\(y)-\(String(format: "%02d", m))"
                let v = list.filter { $0.date.hasPrefix(key) }.reduce(0) { $0 + BudgetEngine.cashOut($1) }
                let f = DateFormatter(); f.locale = Fmt.arabicLocale; f.dateFormat = "MMM"
                return Bar(id: key, label: DateKey.date(key + "-01").map(f.string) ?? key, value: v, daily: 0)
            }
        }
        var out: [Bar] = []
        var d = r.start
        while d <= r.end {
            let dayTx = list.filter { $0.date == d }
            let label = period == "أسبوع" ? (DateKey.date(d).map { Self.weekday.string(from: $0) } ?? d) : Fmt.count(Int(d.suffix(2)) ?? 0)
            out.append(Bar(id: d, label: label, value: dayTx.reduce(0) { $0 + BudgetEngine.cashOut($1) },
                           daily: dayTx.reduce(0) { $0 + BudgetEngine.dailyShare($1) }))
            d = DateKey.adding(days: 1, to: d)
        }
        return out
    }

    private static let weekday: DateFormatter = {
        let f = DateFormatter(); f.locale = Fmt.arabicLocale; f.dateFormat = "EEE"; return f
    }()

    private struct CatTotal: Identifiable { let main: FinanceCategory; let total: Double; var id: String { main.id } }

    private func rollup(_ list: [Transaction]) -> [CatTotal] {
        var m: [String: Double] = [:]
        for t in list { m[BudgetEngine.mainCategory(store.data.categories, t.category).id, default: 0] += BudgetEngine.cashOut(t) }
        return m.map { CatTotal(main: BudgetEngine.mainCategory(store.data.categories, $0.key), total: $0.value) }.sorted { $0.total > $1.total }
    }

    private func insights(_ list: [Transaction], bars: [Bar], byMain: [CatTotal], total: Double) -> [String] {
        guard !list.isEmpty else { return [] }
        var out: [String] = []
        if let top = bars.max(by: { $0.value < $1.value }), top.value > 0 {
            out.append(period == "سنة" ? "📅 أعلى شهر صرفاً: \(top.label) بـ\(Fmt.amount(top.value.rounded())) ر.س." : "📅 أعلى يوم صرفاً: \(top.label) بـ\(Fmt.amount(top.value.rounded())) ر.س.")
        }
        if let first = byMain.first, total > 0 {
            out.append("\(first.main.icon) «\(first.main.label)» ياخذ \(Fmt.count(Int((first.total / total * 100).rounded())))٪ من صرفك.")
        }
        if rate > 0 && period != "سنة" {
            let tracked = bars.filter { $0.id <= today }
            let over = tracked.filter { $0.daily > rate }.count
            out.append(over == 0 ? "🟢 كل أيام الفترة ضمن مصروفك اليومي (\(Fmt.amount(rate)) ر.س)." : "🔴 \(Fmt.count(over)) من \(Fmt.count(tracked.count)) يوم تجاوزت فيها مصروفك اليومي.")
        }
        let fromFunds = list.reduce(0) { s, t in s + store.data.reserves.reduce(0) { $0 + BudgetEngine.reserveShare(t, $1.id) } }
        if fromFunds > 0 { out.append("🪺 \(Fmt.amount(fromFunds.rounded())) ر.س من صرف الفترة تحمّلتها مظاريفك بدل مصروفك اليومي.") }
        if let big = list.max(by: { BudgetEngine.cashOut($0) < BudgetEngine.cashOut($1) }), total > 0, BudgetEngine.cashOut(big) / total > 0.25 {
            out.append("💸 أكبر مصروف واحد (\(big.note.isEmpty ? BudgetEngine.mainCategory(store.data.categories, big.category).label : big.note)) = \(Fmt.amount(BudgetEngine.cashOut(big))) ر.س — ربع صرفك أو أكثر.")
        }
        if period == "شهر", let day = Int(today.suffix(2)), day >= 3,
           let days = DateKey.calendar.range(of: .day, in: .month, for: DateKey.date(today) ?? Date())?.count, day < days {
            out.append("📈 على وتيرتك الحالية، متوقّع تصرف \(Fmt.amount((total / Double(day) * Double(days)).rounded())) ر.س بنهاية الشهر.")
        }
        return out
    }
}
