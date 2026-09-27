import SwiftUI

/// بطاقة الأحداث المهمّة في «اليوم».
struct EventsCard: View {
    @EnvironmentObject var store: Store
    @Binding var managing: Bool
    let today: String

    var body: some View {
        let events = Countdown.visible(store.data.countdownEvents, from: today)
        if !events.isEmpty {
            Panel {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "calendar.badge.clock").foregroundStyle(Mdr.gold)
                        Text("العدّ التنازلي").font(Mdr.font(16, black: true))
                        Spacer()
                        Button("إدارة") { managing = true }.font(Mdr.font(12)).foregroundStyle(Mdr.ink52)
                    }
                    ForEach(events.prefix(3)) { e in
                        let d = Countdown.daysUntil(e.date, from: today) ?? 0
                        HStack(spacing: 12) {
                            Text(e.emoji ?? "📅").font(.system(size: 22))
                                .frame(width: 40, height: 40)
                                .background(Mdr.paper, in: Circle())
                                .overlay(Circle().strokeBorder(Mdr.line))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(Mdr.font(15, black: true))
                                if let c = Countdown.coarse(d) { Text(c).font(Mdr.font(11)).foregroundStyle(Mdr.ink34) }
                            }
                            Spacer()
                            Text(Countdown.describe(d)).font(Mdr.font(14, black: true))
                                .foregroundStyle(d == 0 ? Mdr.gold : Mdr.ink)
                        }
                    }
                }
            }
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
            MdrForm {
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
                            Text(Fmt.shortDate(key: e.date)).foregroundStyle(Mdr.ink52)
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
