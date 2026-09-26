import SwiftUI

/// يومٌ واحد كاملاً: صلواته، ومذكراته، وقرآنه، ومصاريفه — لأيّ تاريخ.
struct DayView: View {
    @EnvironmentObject var store: Store
    @State var date: String
    @State private var editingPrayers = false
    @State private var editingEntry: JournalEntry?

    var body: some View {
        let log = PrayerLogic.log(store.data.prayerLogs, date)
        let entries = store.data.journalEntries.filter { $0.date == date }
        let txs = store.data.transactions.filter { $0.date == date }
        let quran = Nudges.quranDates(store.data).contains(date)
        List {
            Section {
                DatePicker("اليوم", selection: Binding(get: { DateKey.date(date) ?? Date() }, set: { date = DateKey.string($0) }),
                           in: ...Date(), displayedComponents: .date)
                    .environment(\.locale, Fmt.arabicLocale)
                if let d = DateKey.date(date) { Text(Fmt.hijri(d)).foregroundStyle(.secondary) }
            }
            Section {
                Button { editingPrayers = true } label: {
                    HStack(spacing: 8) {
                        ForEach(Prayer.allCases) { p in
                            let s = log?.status(p) ?? .none
                            VStack(spacing: 4) {
                                Circle().fill(s == .none ? Color(.tertiarySystemFill) : Color(hex: s.colorHex)).frame(width: 16, height: 16)
                                Text(p.rawValue).font(.caption2).foregroundStyle(.secondary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                    }
                }
                .buttonStyle(.plain)
            } header: { Text("الصلاة") }
            Section("المذكرات") {
                if entries.isEmpty { Text("لم يُكتب هذا اليوم.").foregroundStyle(.secondary) }
                ForEach(entries) { e in Button { editingEntry = e } label: { JournalRow(entry: e) }.buttonStyle(.plain) }
            }
            Section("القرآن") {
                Label(quran ? "كان لك فيه وِردٌ أو حفظ أو قراءة" : "لا أثر للقرآن مسجّلاً", systemImage: quran ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(quran ? Theme.quran : .secondary)
            }
            Section {
                if txs.isEmpty { Text("لا مصاريف.").foregroundStyle(.secondary) }
                ForEach(txs) { t in TransactionRow(t: t) }
            } header: {
                HStack { Text("المال"); Spacer(); Text(Fmt.amount(txs.reduce(0) { $0 + BudgetEngine.cashOut($1) })).monospacedDigit() }
            }
        }
        .navigationTitle(DateKey.date(date).map(Fmt.dayMonth) ?? date)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editingPrayers) { PrayerDayEditor(date: date) }
        .sheet(item: $editingEntry) { JournalEditor(entry: $0) }
    }
}
