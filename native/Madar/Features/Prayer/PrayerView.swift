import SwiftUI

struct PrayerView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var location: LocationProvider
    @State private var answering: Prayer?
    @State private var showHistory = false
    @State private var backlogEditor = false

    private var today: String { DateKey.today() }

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 30)) { ctx in
                let now = ctx.date
                let times = location.times(for: DateKey.date(DateKey.today(now)) ?? now) ?? [:]
                let log = store.prayerLog(DateKey.today(now))
                let pos = PrayerTimes.current(times, now: now)
                List {
                    Section {
                        header(now: now, times: times, next: pos.next, log: log)
                    }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())

                    Section("صلوات اليوم") {
                        ForEach(Prayer.allCases) { p in
                            row(p, time: times[p], log: log, isCurrent: pos.current == p, isFuture: (times[p] ?? now) > now)
                        }
                    }

                    Section("السنن وقيام الليل") { extras(log) }

                    Section("الفوائت والقضاء") { qadaSection }

                    Section {
                        Button { showHistory = true } label: {
                            Label("سجلّ الشهر وتعديل الأيام الماضية", systemImage: "calendar")
                        }
                        if location.isFallback {
                            Button { location.request() } label: {
                                Label("المواقيت على الرياض — استعمل موقعي", systemImage: "location")
                            }
                        }
                    }
                }
            }
            .navigationTitle("الصلاة")
            .sheet(item: $answering) { p in
                AnswerSheet(prayer: p, date: today)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showHistory) { PrayerHistoryView() }
            .sheet(isPresented: $backlogEditor) { BacklogEditor() }
        }
    }

    private func header(now: Date, times: [Prayer: Date], next: Prayer?, log: PrayerLog) -> some View {
        let streak = PrayerLogic.streak(store.data.prayerLogs, today: DateKey.today(now))
        return HStack(spacing: 16) {
            ZStack {
                ProgressRing(progress: Double(log.prayedCount) / 5, color: Theme.prayer, lineWidth: 9)
                VStack(spacing: 0) {
                    Text(Fmt.count(log.prayedCount)).font(.title.bold())
                    Text("من ٥").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .frame(width: 78, height: 78)
            VStack(alignment: .leading, spacing: 4) {
                Text(Fmt.dayMonth(now)).font(.headline)
                Text(Fmt.hijri(now)).font(.subheadline).foregroundStyle(.secondary)
                if let n = next, let t = times[n] {
                    Text("\(n.rawValue) بعد \(remaining(from: now, to: t))")
                        .font(.subheadline.weight(.medium)).foregroundStyle(Theme.prayer)
                } else {
                    Text("انتهت صلوات اليوم").font(.subheadline).foregroundStyle(.secondary)
                }
                if streak > 1 {
                    Text("السلسلة: \(Fmt.count(streak)) يوماً بالخمس كاملة").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding()
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.vertical, 6)
    }

    private func remaining(from now: Date, to t: Date) -> String {
        let mins = max(0, Int(t.timeIntervalSince(now) / 60))
        let h = mins / 60, m = mins % 60
        if h == 0 { return "\(Fmt.count(m)) دقيقة" }
        return m == 0 ? "\(Fmt.count(h)) ساعة" : "\(Fmt.count(h)) س و\(Fmt.count(m)) د"
    }

    private func row(_ p: Prayer, time: Date?, log: PrayerLog, isCurrent: Bool, isFuture: Bool) -> some View {
        let s = log.status(p)
        return Button { answering = p } label: {
            HStack(spacing: 12) {
                Image(systemName: p.symbol)
                    .font(.title3)
                    .foregroundStyle(isCurrent ? Theme.prayer : .secondary)
                    .frame(width: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.rawValue).font(.body.weight(isCurrent ? .semibold : .regular))
                    if let t = time { Text(Fmt.clock(t)).font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
                if s != .none {
                    HStack(spacing: 6) {
                        if let k = log.khushu(p) { Text(k.label).font(.caption).foregroundStyle(Color(hex: k.colorHex)) }
                        Pill(text: s.label, color: Color(hex: s.colorHex), filled: true)
                    }
                } else if !isFuture {
                    Pill(text: "سجّل", color: Theme.prayer)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .leading) {
            Button { store.setPrayer(p, .jamaah, on: today) } label: { Label("جماعة", systemImage: "person.3") }.tint(Color(hex: PrayerStatus.jamaah.colorHex))
            Button { store.setPrayer(p, .alone, on: today) } label: { Label("وحدي", systemImage: "person") }.tint(Color(hex: PrayerStatus.alone.colorHex))
        }
    }

    @ViewBuilder private func extras(_ log: PrayerLog) -> some View {
        Stepper(value: Binding(get: { log.sunan }, set: { v in store.editPrayerLog(today) { $0.setSunan(v) } }), in: 0...12, step: 2) {
            HStack { Text("السنن الرواتب"); Spacer(); Text("\(Fmt.count(log.sunan)) ركعة").foregroundStyle(.secondary) }
        }
        Stepper(value: Binding(get: { log.qiyamRakaat }, set: { v in store.editPrayerLog(today) { $0.setQiyam(rakaat: min(v, 21), witr: $0.witr) } }), in: 0...21, step: 2) {
            HStack { Text("قيام الليل"); Spacer(); Text("\(Fmt.count(log.qiyamRakaat)) ركعة").foregroundStyle(.secondary) }
        }
        Toggle("الوتر", isOn: Binding(get: { log.witr }, set: { v in store.editPrayerLog(today) { $0.setQiyam(rakaat: $0.qiyamRakaat, witr: v) } }))
    }

    @ViewBuilder private var qadaSection: some View {
        let owed = PrayerLogic.qadaOwed(store.data.prayerLogs, backlog: store.data.qadaBacklog)
        let doneToday = PrayerLogic.qadaDone(store.data.prayerLogs, on: today)
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(owed == 0 ? "لا فوائت عليك" : "عليك \(Fmt.count(owed)) فائتة").font(.body.weight(.medium))
                if doneToday > 0 { Text("قضيتَ اليوم \(Fmt.count(doneToday))").font(.caption).foregroundStyle(.secondary) }
            }
            Spacer()
            if owed > 0 {
                Button("اقضِ واحدة") { store.doQada() }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(hex: PrayerStatus.qada.colorHex))
            }
        }
        Button { backlogEditor = true } label: {
            Text("دَينٌ سابق قبل التسجيل: \(Fmt.count(store.data.qadaBacklog))").font(.subheadline)
        }
    }
}

/// ورقة السؤالين لصلاةٍ في يومٍ ما.
struct AnswerSheet: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var location: LocationProvider
    @Environment(\.dismiss) private var dismiss
    let prayer: Prayer
    let date: String

    var body: some View {
        let log = store.prayerLog(date)
        let time = DateKey.date(date).flatMap { location.times(for: $0)?[prayer] }
        ScrollView {
            PrayerAnswer(
                prayer: prayer,
                when: whenLabel,
                timeLabel: time.map(Fmt.clock),
                status: log.status(prayer),
                khushu: log.khushu(prayer),
                onStatus: { s in
                    store.setPrayer(prayer, s, on: date)
                    if !s.isPrayed { dismiss() }
                },
                onKhushu: { k in
                    store.setKhushu(prayer, k, on: date)
                    dismiss()
                }
            )
            .padding()
        }
    }

    private var whenLabel: String? {
        let diff = DateKey.days(from: date, to: DateKey.today())
        switch diff {
        case 0: return nil
        case 1: return "أمس"
        case 2: return "قبل يومين"
        default: return "يوم \(Fmt.shortDate(key: date))"
        }
    }
}

struct BacklogEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var value = 0

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper(value: $value, in: 0...100_000) {
                        Text("\(Fmt.count(value)) فرضاً")
                    }
                } footer: {
                    Text("فروضٌ تعرف أنّها عليك من قبل أن تستعمل «مدار»، ولا يوم مسجّلاً لها. ما يفوتك من الآن يُسجَّل «فاتتني» في يومه.")
                }
            }
            .navigationTitle("الدَّين السابق")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") { store.update { $0.qadaBacklog = value }; dismiss() }
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear { value = store.data.qadaBacklog }
        }
    }
}
