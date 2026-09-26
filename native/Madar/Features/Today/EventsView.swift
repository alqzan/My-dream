import SwiftUI

/// بطاقة الأحداث المهمّة في «اليوم».
struct EventsCard: View {
    @EnvironmentObject var store: Store
    @Binding var managing: Bool
    let today: String

    var body: some View {
        let events = Countdown.visible(store.data.countdownEvents, from: today)
        if !events.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("أحداث قادمة", systemImage: "calendar.badge.clock").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.brand)
                    Spacer()
                    Button("إدارة") { managing = true }.font(.footnote)
                }
                ForEach(events.prefix(3)) { e in
                    let d = Countdown.daysUntil(e.date, from: today) ?? 0
                    HStack {
                        Text(e.emoji ?? "📅")
                        VStack(alignment: .leading, spacing: 0) {
                            Text(e.title)
                            if let c = Countdown.coarse(d) { Text(c).font(.caption2).foregroundStyle(.secondary) }
                        }
                        Spacer()
                        Text(Countdown.describe(d)).font(.subheadline.weight(.semibold)).foregroundStyle(d == 0 ? Theme.brand : .primary)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

struct EventsManager: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var emoji = "📅"
    @State private var date = Date().addingTimeInterval(86400 * 7)
    @State private var countUp = false

    var body: some View {
        NavigationStack {
            Form {
                Section("حدث جديد") {
                    HStack {
                        TextField("📅", text: $emoji).frame(width: 40)
                        TextField("اختبار، سفر، موعد…", text: $title)
                    }
                    DatePicker("التاريخ", selection: $date, displayedComponents: .date)
                    Toggle("يبقى بعد مروره ويُعدّ منه", isOn: $countUp)
                    Button("أضف") {
                        var e = CountdownEvent.new(title: title, date: DateKey.string(date), emoji: emoji.isEmpty ? nil : emoji)
                        e.countUpAfter = countUp
                        store.saveEvent(e)
                        title = ""
                    }
                    .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                Section("الأحداث") {
                    ForEach(store.data.countdownEvents.sorted { $0.date < $1.date }) { e in
                        HStack {
                            Text(e.emoji ?? "📅")
                            Text(e.title)
                            Spacer()
                            Text(Fmt.shortDate(key: e.date)).foregroundStyle(.secondary)
                        }
                        .swipeActions { Button(role: .destructive) { store.deleteEvent(e.id) } label: { Label("حذف", systemImage: "trash") } }
                    }
                }
            }
            .navigationTitle("الأحداث المهمّة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
        }
    }
}
