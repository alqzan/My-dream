import SwiftUI

/// سجلّ الشهر: خليّةٌ لكلّ يوم بعدد ما أُدّي، والضغط يفتح اليوم لتعديله.
struct PrayerHistoryView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var month = DateKey.calendar.date(from: DateKey.calendar.dateComponents([.year, .month], from: Date())) ?? Date()
    @State private var editing: String?

    private let cols = Array(repeating: GridItem(.flexible(), spacing: 6), count: 7)

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    HStack {
                        Button { shift(-1) } label: { Image(systemName: "chevron.right") }
                        Spacer()
                        Text(Fmt.monthYear(month)).font(.headline)
                        Spacer()
                        Button { shift(1) } label: { Image(systemName: "chevron.left") }
                            .disabled(isCurrentMonth)
                    }
                    .padding(.horizontal)

                    LazyVGrid(columns: cols, spacing: 6) {
                        ForEach(weekdayNames, id: \.self) { Text($0).font(.caption2).foregroundStyle(.secondary) }
                        ForEach(0..<leadingBlanks, id: \.self) { _ in Color.clear.frame(height: 44) }
                        ForEach(days, id: \.self) { key in dayCell(key) }
                    }
                    .padding(.horizontal)

                    summary
                }
                .padding(.vertical)
            }
            .navigationTitle("سجلّ الصلاة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
            .sheet(item: Binding(get: { editing.map(DayRef.init) }, set: { editing = $0?.id })) { ref in
                PrayerDayEditor(date: ref.id)
            }
        }
    }

    private struct DayRef: Identifiable { let id: String }

    private var isCurrentMonth: Bool {
        DateKey.calendar.isDate(month, equalTo: Date(), toGranularity: .month)
    }

    private func shift(_ n: Int) {
        if let d = DateKey.calendar.date(byAdding: .month, value: n, to: month) { month = d }
    }

    private var days: [String] {
        guard let range = DateKey.calendar.range(of: .day, in: .month, for: month) else { return [] }
        return range.compactMap { DateKey.calendar.date(byAdding: .day, value: $0 - 1, to: month).map(DateKey.string) }
    }

    /// الأسبوع يبدأ بالأحد كما في تقويم الخليج.
    private var leadingBlanks: Int { (DateKey.calendar.component(.weekday, from: month) - 1) % 7 }
    private let weekdayNames = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"]

    private func dayCell(_ key: String) -> some View {
        let log = PrayerLogic.log(store.data.prayerLogs, key)
        let n = log?.prayedCount ?? 0
        let missed = Prayer.allCases.filter { log?.status($0) == .missed }.count
        let future = key > DateKey.today()
        let color: Color = missed > 0 ? Theme.danger : Theme.prayer
        return Button { if !future { editing = key } } label: {
            VStack(spacing: 2) {
                Text(Fmt.count(DateKey.calendar.component(.day, from: DateKey.date(key) ?? Date())))
                    .font(.subheadline.weight(key == DateKey.today() ? .bold : .regular))
                Text(future || log == nil ? " " : Fmt.count(n)).font(.caption2)
            }
            .frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(n == 5 ? .white : .primary)
            .background(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(n == 5 ? color : color.opacity(Double(n) / 5 * 0.35 + (log == nil ? 0 : 0.05)))
            )
            .opacity(future ? 0.35 : 1)
        }
        .buttonStyle(.plain)
        .disabled(future)
    }

    private var summary: some View {
        let logs = store.data.prayerLogs
        let cons = PrayerLogic.consistency(logs, lastDays: 30)
        let avg = PrayerLogic.khushuAverage(logs, lastDays: 30)
        let mosque = PrayerLogic.streak(logs, mosqueOnly: true)
        return VStack(alignment: .leading, spacing: 10) {
            Text("آخر ثلاثين يوماً").font(.headline)
            ForEach(Prayer.allCases) { p in
                HStack {
                    Text(p.rawValue).frame(width: 60, alignment: .leading)
                    ProgressView(value: cons[p] ?? 0).tint(Theme.prayer)
                    Text("\(Fmt.count(Int(((cons[p] ?? 0) * 100).rounded())))٪").font(.caption).frame(width: 44)
                }
            }
            if let a = avg {
                let level = Khushu(rawValue: Int(a.rounded())) ?? .present
                Text("حضور القلب في المتوسّط: \(level.label)").font(.subheadline).foregroundStyle(Color(hex: level.colorHex))
            }
            if mosque > 1 { Text("سلسلة الجماعة: \(Fmt.count(mosque)) يوماً").font(.subheadline) }
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal)
    }
}

/// محرّرُ يومٍ مضى: السؤالان لكلّ فرض من المصدر الواحد `PrayerAnswer`.
struct PrayerDayEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let date: String

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    let log = store.prayerLog(date)
                    ForEach(Prayer.allCases) { p in
                        PrayerAnswer(prayer: p, status: log.status(p), khushu: log.khushu(p),
                                     onStatus: { store.setPrayer(p, $0, on: date) },
                                     onKhushu: { store.setKhushu(p, $0, on: date) })
                        Divider()
                    }
                }
                .padding()
            }
            .navigationTitle(Fmt.shortDate(key: date))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
        }
    }
}
