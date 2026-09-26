import SwiftUI

/// «اليوم»: نظرةٌ واحدة على الأقسام الأربعة، وكلُّ بطاقةٍ تفتح قسمها.
struct TodayView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var location: LocationProvider
    @State private var settings = false
    @State private var answering: Prayer?
    @State private var writing: JournalEntry?
    @State private var managingEvents = false

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { ctx in
                let now = ctx.date
                let today = DateKey.today(now)
                ScrollView {
                    VStack(spacing: 14) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Fmt.dayMonth(now)).font(.title2.bold())
                            Text(Fmt.hijri(now)).foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        prayerCard(now: now, today: today)
                        nudgeCard(now: now, today: today)
                        ramadanCard(now: now, today: today)
                        EventsCard(managing: $managingEvents, today: today)
                        journalCard(today: today)
                        quranCard(today: today)
                        financeCard(today: today)
                    }
                    .padding()
                }
                .background(Color(.systemGroupedBackground))
            }
            .navigationTitle("مدار")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { settings = true } label: { Image(systemName: "gearshape") }.accessibilityLabel("الإعدادات")
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { StatsView() } label: { Image(systemName: "chart.bar.xaxis") }.accessibilityLabel("الحصيلة")
                }
                ToolbarItem(placement: .topBarLeading) {
                    NavigationLink { DayView(date: DateKey.adding(days: -1, to: DateKey.today())) } label: { Image(systemName: "calendar") }
                        .accessibilityLabel("يومٌ مضى")
                }
            }
            .sheet(isPresented: $settings) { SettingsView() }
            .sheet(item: $answering) { p in
                AnswerSheet(prayer: p, date: DateKey.today()).presentationDetents([.medium])
            }
            .sheet(item: $writing) { e in JournalEditor(entry: e) }
            .sheet(isPresented: $managingEvents) { EventsManager() }
        }
    }

    private func card<C: View>(_ title: String, _ icon: String, _ color: Color, @ViewBuilder content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: icon).font(.subheadline.weight(.semibold)).foregroundStyle(color)
            content()
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func prayerCard(now: Date, today: String) -> some View {
        let log = store.prayerLog(today)
        let day = DateKey.date(today) ?? now
        let times = location.times(for: day) ?? [:]
        let pos = PrayerTimes.current(times, now: now)
        // أوّلُ فرضٍ دخل وقته ولم يُسجَّل — هو ما يُسأل عنه الآن.
        let pending = Prayer.allCases.first { p in log.status(p) == .none && (times[p] ?? .distantFuture) <= now }
        return VStack(alignment: .leading, spacing: 6) {
            DayOrbit(now: now, times: times, sunrise: PrayerTimes.sunrise(for: day, lat: location.lat, lng: location.lng),
                     log: log, onTap: { answering = $0 })
            HStack {
                if let p = pending {
                    Button { answering = p } label: { Label("صلَّيتَ \(p.rawValue)؟", systemImage: "hand.raised") }
                        .buttonStyle(.borderedProminent).tint(Theme.prayer)
                } else if let n = pos.next, let t = times[n] {
                    Text("\(n.rawValue) \(Fmt.clock(t))").font(.headline).foregroundStyle(Theme.prayer)
                } else {
                    Text("تمّت صلوات اليوم").font(.headline).foregroundStyle(.secondary)
                }
                Spacer()
                Text("\(Fmt.count(log.prayedCount)) من ٥").font(.subheadline).foregroundStyle(.secondary)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    @ViewBuilder private func nudgeCard(now: Date, today: String) -> some View {
        let hour = Calendar.current.component(.hour, from: now)
        if let n = Nudges.build(store.data, today: today, hour: hour, prayed: store.prayerLog(today).prayedCount) {
            VStack(alignment: .leading, spacing: 10) {
                Text(n.title).font(.headline)
                ForEach(n.lines) { line in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: line.done ? "checkmark.circle.fill" : "circle")
                            .foregroundStyle(line.done ? Theme.quran : .secondary)
                            .padding(.top, 2)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.text)
                            if let p = line.place { Text(p).font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                }
                Text(n.closing).font(.footnote).foregroundStyle(.secondary).padding(.top, 2)
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    /// رمضان وحده: يومُه، وموعدا الإمساك والإفطار من مواقيت الجهاز. لا أثر لها بقيّة العام.
    @ViewBuilder private func ramadanCard(now: Date, today: String) -> some View {
        let hijri = Calendar(identifier: .islamicUmmAlQura)
        let comps = hijri.dateComponents([.month, .day], from: now)
        if comps.month == 9, let day = comps.day {
            let times = location.times(for: DateKey.date(today) ?? now) ?? [:]
            HStack(spacing: 14) {
                Image(systemName: "moon.stars.fill").font(.title).foregroundStyle(Theme.brand)
                VStack(alignment: .leading, spacing: 4) {
                    Text("رمضان — اليوم \(Fmt.count(day))").font(.headline)
                    HStack(spacing: 14) {
                        if let f = times[.fajr] { Text("الإمساك \(Fmt.clock(f))") }
                        if let m = times[.maghrib] { Text("الإفطار \(Fmt.clock(m))") }
                    }
                    .font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding()
            .background(Theme.brand.opacity(0.1), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func journalCard(today: String) -> some View {
        let todays = store.data.journalEntries.filter { $0.date == today }
        return card("المذكرات", "book.closed", Theme.journal) {
            if let e = todays.first {
                Text(e.title.isEmpty ? String(e.content.prefix(120)) : e.title).lineLimit(2)
                Button("أضف إلى مذكرة اليوم") { writing = e }.font(.subheadline)
            } else {
                Text("لم تكتب اليوم بعد.").foregroundStyle(.secondary)
                Button { writing = JournalEntry.new(date: today) } label: { Text("اكتب مذكرة اليوم").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).tint(Theme.journal)
            }
        }
    }

    private func quranCard(today: String) -> some View {
        let k = store.data.khatma
        let read = k.pagesRead(on: today)
        let wirdDone = store.data.quranWird.contains(today)
        return card("القرآن", "book", Theme.quran) {
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("وقفتَ عند صفحة \(Fmt.count(k.page)) — \(k.page > 0 ? QuranMeta.pageTitle(k.page) : "لم تبدأ")")
                    Text("اليوم \(Fmt.count(read)) من \(Fmt.count(k.dailyPageGoal)) صفحة").font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer()
                ProgressRing(progress: Double(read) / Double(max(1, k.dailyPageGoal)), color: Theme.quran, lineWidth: 6)
                    .frame(width: 40, height: 40)
            }
            Button {
                store.toggleWird(today)
            } label: {
                Label(wirdDone ? "أتممتَ وِرد اليوم" : "أتممتُ وِرد اليوم", systemImage: wirdDone ? "checkmark.circle.fill" : "circle")
            }
            .tint(Theme.quran)
        }
    }

    private func financeCard(today: String) -> some View {
        let status = BudgetEngine.status(store.data, today: today)
        return card("المال", "wallet.pass", Theme.finance) {
            if let s = status {
                HStack(alignment: .firstTextBaseline) {
                    Text(Fmt.amount(s.available)).font(.title.bold()).foregroundStyle(s.available < 0 ? Theme.danger : .primary)
                    Text("ر.س متاحة اليوم").foregroundStyle(.secondary)
                }
                Text("المصروف اليومي \(Fmt.amount(s.rate)) · صرفتَ اليوم \(Fmt.amount(s.spentToday))").font(.subheadline).foregroundStyle(.secondary)
            } else {
                Text("اضبط مصروفك اليومي من قسم المال.").foregroundStyle(.secondary)
            }
        }
    }
}
