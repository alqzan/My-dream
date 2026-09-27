import SwiftUI

/// التبديلُ بين الأقسام من داخلها (أقواسُ البهو تفتح أقسامها كالشريط السفلي).
private struct SelectTabKey: EnvironmentKey { static let defaultValue: (String) -> Void = { _ in } }
extension EnvironmentValues {
    var selectTab: (String) -> Void {
        get { self[SelectTabKey.self] }
        set { self[SelectTabKey.self] = newValue }
    }
}

/// **البهو** — على إيقاع مدار في الويب (`app/page.tsx`): تحيّةٌ وحلقةُ السنة،
/// المزولة، الأقواسُ الثلاثة، ثمّ لمحاتٌ قصيرةٌ من كلّ قسم.
struct TodayView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var location: LocationProvider
    @Environment(\.selectTab) private var selectTab
    @State private var settings = false
    @State private var answering: Prayer?
    @State private var writing: JournalEntry?
    @State private var managingEvents = false
    @State private var adding: Transaction?

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 60)) { ctx in
                let now = ctx.date
                let today = DateKey.today(now)
                ScrollView {
                    VStack(spacing: 14) {
                        header
                        hero(now: now, today: today)
                        rhythm(now: now, today: today)
                        nudgeCard(now: now, today: today)
                        ramadanCard(now: now, today: today)
                        dayCard(today: today)
                        EventsCard(managing: $managingEvents, today: today)
                        weekCard(today: today)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 90)
                }
                .mdrPage()
            }
            .toolbar(.hidden, for: .navigationBar)
            .overlay(alignment: .bottomTrailing) { fab }
            .sheet(isPresented: $settings) { SettingsView() }
            .sheet(item: $answering) { p in
                AnswerSheet(prayer: p, date: DateKey.today()).presentationDetents([.medium])
            }
            .sheet(item: $writing) { e in JournalEditor(entry: e) }
            .sheet(isPresented: $managingEvents) { EventsManager() }
            .sheet(item: $adding) { t in ExpenseEditor(transaction: t) }
        }
    }

    // MARK: الترويسة

    private var header: some View {
        HStack(spacing: 10) {
            BrandMark()
            Text("مدار").font(Mdr.font(22, black: true))
            Spacer()
            NavigationLink { DayView(date: DateKey.adding(days: -1, to: DateKey.today())) } label: { headerIcon("calendar") }
                .accessibilityLabel("يومٌ مضى")
            NavigationLink { StatsView() } label: { headerIcon("chart.bar.xaxis") }
                .accessibilityLabel("الحصيلة")
            Button { settings = true } label: { headerIcon("gearshape") }
                .accessibilityLabel("الإعدادات")
        }
        .padding(.top, 6)
    }

    private func headerIcon(_ name: String) -> some View {
        Image(systemName: name).font(.system(size: 17, weight: .regular))
            .foregroundStyle(Mdr.gold)
            .frame(width: 40, height: 40)
            .contentShape(Rectangle())
    }

    private func hero(now: Date, today: String) -> some View {
        VStack(spacing: 14) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("مدار اليوم").font(Mdr.font(11, black: true)).foregroundStyle(Mdr.ink52)
                    Text(greeting(now)).font(Mdr.font(34, black: true))
                    HStack(spacing: 8) {
                        Text(Fmt.hijri(now))
                        Diamond(size: 5)
                        Text(Fmt.shortDate(now))
                    }
                    .font(Mdr.font(13)).foregroundStyle(Mdr.ink72)
                }
                Spacer()
                YearRing(pct: yearPct(today))
            }
            Rectangle().fill(Mdr.line).frame(height: 1)
        }
        .padding(.top, 8)
    }

    private func greeting(_ now: Date) -> String {
        let h = Calendar.current.component(.hour, from: now)
        return h < 5 ? "طاب سهرك" : h < 12 ? "صباح النور" : h < 17 ? "مساء الخير" : "مساء النور"
    }

    private func yearPct(_ today: String) -> Int {
        guard let d = DateKey.date(today) else { return 0 }
        let cal = Calendar.current
        let y = cal.component(.year, from: d)
        guard let s = cal.date(from: DateComponents(year: y, month: 1, day: 1)),
              let e = cal.date(from: DateComponents(year: y + 1, month: 1, day: 1)) else { return 0 }
        return max(0, min(100, Int((d.timeIntervalSince(s) / e.timeIntervalSince(s) * 100).rounded())))
    }

    // MARK: المزولة والأقواس

    private func rhythm(now: Date, today: String) -> some View {
        let log = store.prayerLog(today)
        let day = DateKey.date(today) ?? now
        let times = location.times(for: day) ?? [:]
        let pending = Prayer.allCases.filter { p in log.status(p) == .none && (times[p] ?? .distantFuture) <= now }
        let nextP = Prayer.allCases.first { (times[$0] ?? .distantPast) > now }
        let next = nextP.flatMap { p in times[p].map { (p, $0) } }
        let prayed = log.prayedCount

        let k = store.data.khatma
        let read = k.pagesRead(on: today)
        let quranDone = store.data.quranWird.contains(today) || read > 0
        let goal = max(1, k.dailyPageGoal)
        let status = BudgetEngine.status(store.data, today: today)
        let overspent = (status?.balance ?? 0) < 0

        let due: String? = !pending.isEmpty ? "salah" : !quranDone ? "quran" : overspent ? "mal" : nil
        let dueLabel = ["salah": "الصلاة", "quran": "القرآن", "mal": "المال"][due ?? ""]

        let salahSub: String = pending.count == 1 ? "حان \(pending[0].rawValue)"
            : pending.count > 1 ? "\(Fmt.count(pending.count)) تنتظر تسجيلك"
            : next.map { "\($0.0.rawValue) \(Fmt.clock($0.1))" } ?? (prayed == 5 ? "يومٌ كامل" : "سُجِّل يومُك")

        let arcs = [
            ArcSpec(id: "salah", label: "الصلاة", big: Fmt.count(prayed), unit: "من ٥", sub: salahSub,
                    ratio: Double(prayed) / 5, color: Mdr.clay, wash: Mdr.clayw) {
                if let p = pending.first { answering = p } else { selectTab("prayer") }
            },
            ArcSpec(id: "quran", label: "القرآن", big: quranDone ? "تمَّ" : Fmt.count(max(0, goal - read)),
                    unit: quranDone ? "وِردك اليوم" : "صفحة", sub: quranDone ? "وردك مقروء" : "وِردُك ينتظرك",
                    ratio: quranDone ? 1 : Double(read) / Double(goal), color: Mdr.gold, wash: Mdr.goldw) { selectTab("quran") },
            ArcSpec(id: "mal", label: "المال",
                    big: status.map { Fmt.amount(abs($0.balance).rounded()) } ?? "—",
                    unit: status.map { $0.balance < 0 ? "تجاوزتَ" : "ريالًا" } ?? "بلا ميزانية",
                    sub: status.map { $0.balance < 0 ? "راجِع صرفك" : "يكفيك اليوم" } ?? "اضبِط ميزانيتك",
                    ratio: status.map { $0.rate > 0 ? max(0, min(1, $0.balance / $0.rate)) : 0 } ?? 0,
                    color: Mdr.blue, wash: Mdr.bluew) { selectTab("finance") },
        ]
        return VStack(spacing: 14) {
            Sundial(now: now, times: times, sunrise: PrayerTimes.sunrise(for: day, lat: location.lat, lng: location.lng),
                    prayed: prayed, dueLabel: dueLabel, next: next)
            ThreeArcs(arcs: arcs, due: due)
        }
    }

    // MARK: التذكير

    @ViewBuilder private func nudgeCard(now: Date, today: String) -> some View {
        let hour = Calendar.current.component(.hour, from: now)
        if let n = Nudges.build(store.data, today: today, hour: hour, prayed: store.prayerLog(today).prayedCount) {
            Panel(tone: .gold) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: "sunrise").foregroundStyle(Mdr.gold)
                        Text(n.title).font(Mdr.font(16, black: true))
                    }
                    ForEach(n.lines) { line in
                        HStack(alignment: .top, spacing: 10) {
                            Circle().fill(line.done ? Mdr.teal : Mdr.ink34).frame(width: 6, height: 6).padding(.top, 8)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(line.text).font(Mdr.font(15))
                                if let p = line.place { Text(p).font(Mdr.font(12)).foregroundStyle(Mdr.ink52) }
                            }
                        }
                    }
                    Rectangle().fill(Mdr.gline).frame(height: 1)
                    Text(n.closing).font(Mdr.font(12)).foregroundStyle(Mdr.ink52)
                }
            }
        }
    }

    /// رمضان وحده: يومُه، وموعدا الإمساك والإفطار من مواقيت الجهاز.
    @ViewBuilder private func ramadanCard(now: Date, today: String) -> some View {
        let hijri = Calendar(identifier: .islamicUmmAlQura)
        let comps = hijri.dateComponents([.month, .day], from: now)
        if comps.month == 9, let day = comps.day {
            let times = location.times(for: DateKey.date(today) ?? now) ?? [:]
            Panel(tone: .wash(Mdr.goldw)) {
                HStack(spacing: 14) {
                    Image(systemName: "moon.stars.fill").font(.system(size: 26)).foregroundStyle(Mdr.gold)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("رمضان — اليوم \(Fmt.count(day))").font(Mdr.font(17, black: true))
                        HStack(spacing: 14) {
                            if let f = times[.fajr] { Text("الإمساك \(Fmt.clock(f))") }
                            if let m = times[.maghrib] { Text("الإفطار \(Fmt.clock(m))") }
                        }
                        .font(Mdr.font(13)).foregroundStyle(Mdr.ink52)
                    }
                    Spacer()
                }
            }
        }
    }

    // MARK: اليوم

    private func dayCard(today: String) -> some View {
        let entry = store.data.journalEntries.first { $0.date == today }
        let k = store.data.khatma
        let read = k.pagesRead(on: today)
        let wird = store.data.quranWird.contains(today)
        let done = (entry != nil ? 1 : 0) + (wird || read > 0 ? 1 : 0)
        return Panel(padding: 0) {
            VStack(spacing: 0) {
                HStack {
                    Text("اليوم").font(Mdr.font(20, black: true))
                    Spacer()
                    Text("\(Fmt.count(done)) من ٢").font(Mdr.font(13, black: true))
                        .padding(.horizontal, 14).padding(.vertical, 6)
                        .background(Mdr.goldw, in: Capsule())
                        .overlay(Capsule().strokeBorder(Mdr.gold.opacity(0.5)))
                }
                .padding(18)
                Rectangle().fill(Mdr.line).frame(height: 1)
                dayRow(icon: "book.closed", tint: Mdr.blue, title: "المذكرة",
                       status: entry == nil ? "لم تكتب مذكرة اليوم" : "مذكرتك محفوظة",
                       hint: entry.map { $0.title.isEmpty ? String($0.content.prefix(40)) : $0.title } ?? "اكتب فكرةً سريعة",
                       done: entry != nil) {
                    writing = entry ?? JournalEntry.new(date: today)
                }
                Rectangle().fill(Mdr.line).frame(height: 1).padding(.horizontal, 18)
                dayRow(icon: "leaf", tint: Mdr.gold, title: "القرآن",
                       status: wird || read > 0 ? "أنجزتَ القرآن اليوم" : "لم تفتح المصحف اليوم",
                       hint: "وقفتَ عند صفحة \(Fmt.count(k.page))\(k.page > 0 ? " — " + QuranMeta.pageTitle(k.page) : "")",
                       done: wird || read > 0) {
                    Haptic.tap(); store.toggleWird(today)
                }
            }
        }
    }

    private func dayRow(icon: String, tint: Color, title: String, status: String, hint: String, done: Bool,
                        action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 17)).foregroundStyle(tint)
                    .frame(width: 44, height: 44)
                    .background(tint.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Mdr.font(16, black: true))
                    Text(status).font(Mdr.font(13, black: true)).foregroundStyle(done ? Mdr.teal : Mdr.clay)
                    Text(hint).font(Mdr.font(11)).foregroundStyle(Mdr.ink52).lineLimit(1)
                }
                Spacer()
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 24)).foregroundStyle(done ? Mdr.teal : Mdr.ink34)
            }
            .padding(.horizontal, 18).padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    // MARK: لمحة الأسبوع

    private func weekCard(today: String) -> some View {
        let days = (0..<7).map { DateKey.adding(days: -$0, to: today) }
        let set = Set(days)
        let prayers = store.data.prayerLogs.filter { set.contains($0.date) }.reduce(0) { $0 + $1.prayedCount }
        let quranDays = days.filter { store.data.quranWird.contains($0) || store.data.khatma.pagesRead(on: $0) > 0 }.count
        let wrote = Set(store.data.journalEntries.map(\.date)).intersection(set).count
        let spendDays = Set(store.data.transactions.map(\.date)).intersection(set).count
        return Panel {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("لمحة الأسبوع").font(Mdr.font(11, black: true)).foregroundStyle(Mdr.clay)
                        Text("خطواتك الأخيرة").font(Mdr.font(19, black: true))
                    }
                    Spacer()
                    Text("\(Fmt.shortDate(key: days.last ?? today)) — \(Fmt.shortDate(key: today))")
                        .font(Mdr.font(10)).foregroundStyle(Mdr.ink52)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    tile("\(Fmt.count(prayers))/\(Fmt.count(35))", "صلوات مسجّلة", Mdr.clay)
                    tile("\(Fmt.count(quranDays))/\(Fmt.count(7))", "أيام قرآن", Mdr.gold)
                    tile("\(Fmt.count(wrote))/\(Fmt.count(7))", "أيام كتبت", Mdr.blue)
                    tile("\(Fmt.count(spendDays))/\(Fmt.count(7))", "أيام سجّلت صرفها", Mdr.teal)
                }
            }
        }
    }

    private func tile(_ value: String, _ label: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(value).font(Mdr.font(20, black: true)).foregroundStyle(color)
            Text(label).font(Mdr.font(11)).foregroundStyle(Mdr.ink52)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Mdr.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Mdr.line))
    }

    // MARK: زرّ المصروف السريع

    private var fab: some View {
        Button {
            Haptic.tap()
            adding = Transaction.new(date: DateKey.today(), amount: 0, category: store.data.categories.first?.id ?? "", note: "")
        } label: {
            Image(systemName: "plus").font(.system(size: 22, weight: .semibold)).foregroundStyle(.white)
                .frame(width: 58, height: 58)
                .background(Mdr.gold, in: Circle())
                .shadow(color: Mdr.gold.opacity(0.35), radius: 10, y: 4)
        }
        .padding(.trailing, 18).padding(.bottom, 16)
        .accessibilityLabel("سجّل مصروفاً سريعاً")
    }
}
