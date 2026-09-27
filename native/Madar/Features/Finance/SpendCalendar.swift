import SwiftUI

/// تقويم الصرف: خليّةٌ لكلّ يوم، لونُها بقدر ما صُرف مقابل المصروف اليومي.
struct SpendCalendar: View {
    @EnvironmentObject var store: Store
    let month: Date
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 4), count: 7)

    var body: some View {
        let cal = DateKey.calendar
        let start = cal.date(from: cal.dateComponents([.year, .month], from: month)) ?? month
        let days = (cal.range(of: .day, in: .month, for: start) ?? 1..<31).compactMap { cal.date(byAdding: .day, value: $0 - 1, to: start).map(DateKey.string) }
        let lead = (cal.component(.weekday, from: start) - 1) % 7
        let rate = BudgetEngine.status(store.data)?.rate ?? 0
        var daily: [String: Double] = [:]
        for t in store.data.transactions where t.date.hasPrefix(String(DateKey.string(start).prefix(7))) { daily[t.date, default: 0] += BudgetEngine.dailyShare(t) }
        let today = DateKey.today()
        return LazyVGrid(columns: cols, spacing: 4) {
            ForEach(["ح", "ن", "ث", "ر", "خ", "ج", "س"], id: \.self) { Text($0).font(.mdrCaption2).foregroundStyle(.secondary) }
            ForEach(0..<lead, id: \.self) { _ in Color.clear.frame(height: 38) }
            ForEach(days, id: \.self) { d in
                let v = daily[d] ?? 0
                let over = rate > 0 && v > rate
                VStack(spacing: 1) {
                    Text(Fmt.count(Int(d.suffix(2)) ?? 0)).font(.mdrCaption2.weight(d == today ? .bold : .regular))
                    if v > 0 { Text(Fmt.amount(v.rounded())).font(.system(size: 8)).lineLimit(1).minimumScaleFactor(0.6) }
                }
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .fill(v == 0 ? Color(.tertiarySystemFill).opacity(d > today ? 0.3 : 1) : (over ? Theme.danger : Theme.finance).opacity(min(0.85, 0.2 + (rate > 0 ? v / rate : 0.5) * 0.35))))
                .foregroundStyle(v > 0 && (rate > 0 ? v / rate > 1.4 : false) ? .white : .primary)
            }
        }
    }
}
