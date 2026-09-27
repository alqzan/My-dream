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
                ScrollView {
                    VStack(spacing: 0) {
                        HStack(spacing: 10) {
                            Text("الصلاة").font(Mdr.font(30, black: true))
                            Spacer()
                            if let n = pos.next, let t = times[n] {
                                Text("\(n.rawValue) بعد \(remaining(from: now, to: t))")
                                    .font(Mdr.font(13, black: true)).foregroundStyle(Mdr.teal)
                            }
                        }
                        .padding(.top, 8)
                        Mihrab(log: log) { answering = $0 }
                            .padding(.top, 14)
                        VStack(spacing: 7) {
                            ForEach(Prayer.allCases) { p in
                                row(p, time: times[p], log: log, now: now)
                            }
                        }
                        .padding(.top, 14)

                        SectionHead("السننُ وقيامُ الليل").padding(.top, 26).padding(.bottom, 12)
                        Panel { VStack(spacing: 12) { extras(log) } }

                        SectionHead("الفوائتُ والقضاء").padding(.top, 26).padding(.bottom, 12)
                        Panel { VStack(alignment: .leading, spacing: 12) { qadaSection } }

                        VStack(spacing: 10) {
                            Button { showHistory = true } label: {
                                Label("السجلّ وتعديل الأيام الماضية", systemImage: "calendar")
                            }
                            .buttonStyle(.mdr(.ghost, grow: true))
                            if location.isFallback {
                                Button { location.request() } label: {
                                    Label("المواقيت على الرياض — استعمل موقعي", systemImage: "location")
                                }
                                .buttonStyle(.mdr(.gold, grow: true))
                            }
                        }
                        .padding(.top, 22)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 30)
                }
                .mdrPage()
            }
            .toolbar(.hidden, for: .navigationBar)
            .sheet(item: $answering) { p in
                AnswerSheet(prayer: p, date: today)
                    .presentationDetents([.medium])
                    .presentationDragIndicator(.visible)
            }
            .sheet(isPresented: $showHistory) { PrayerHistoryView() }
            .sheet(isPresented: $backlogEditor) { BacklogEditor() }
        }
    }

    private func remaining(from now: Date, to t: Date) -> String {
        let mins = max(0, Int(t.timeIntervalSince(now) / 60))
        let h = mins / 60, m = mins % 60
        if h == 0 { return "\(Fmt.count(m)) دقيقة" }
        return m == 0 ? "\(Fmt.count(h)) ساعة" : "\(Fmt.count(h)) س و\(Fmt.count(m)) د"
    }

    /// صفُّ الفرض كما في الويب (`PrayerRows`): مربّعُ الحالة بحرفها، الاسمُ والوقت،
    /// نقطةُ الخشوع، ثمّ الحالةُ نصّاً. الصفُّ كلُّه يفتح ورقة التسجيل.
    private func row(_ p: Prayer, time: Date?, log: PrayerLog, now: Date) -> some View {
        let s = log.status(p)
        let tone = Self.tone(s)
        let bg: Color = s == .jamaah ? Mdr.tealw : s == .alone ? Mdr.goldw : s == .missed ? Mdr.clayw : s == .qada ? Mdr.bluew : Mdr.paper2
        let bd: Color = s == .jamaah ? Mdr.teal.opacity(0.34) : s != .none ? Mdr.gline : Mdr.line
        let future = (time ?? now) > now
        return Button { answering = p } label: {
            HStack(spacing: 10) {
                Text(Self.glyph(s)).font(Mdr.font(11, black: true))
                    .foregroundStyle(s == .jamaah ? Mdr.paper : tone)
                    .frame(width: 22, height: 22)
                    .background(s == .jamaah ? tone : .clear, in: RoundedRectangle(cornerRadius: 7))
                    .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(s == .none ? Mdr.line : tone, lineWidth: 1.5))
                VStack(alignment: .leading, spacing: 2) {
                    Text(p.rawValue).font(Mdr.font(16, black: true))
                    if let t = time {
                        Text(future ? "\(Fmt.clock(t)) · \(remainingShort(from: now, to: t))" : Fmt.clock(t))
                            .font(Mdr.font(11)).foregroundStyle(Mdr.ink34)
                    }
                }
                Spacer()
                if let k = log.khushu(p) {
                    HStack(spacing: 5) {
                        Circle().fill(Color(hex: k.colorHex)).frame(width: 5, height: 5)
                        Text(k.label)
                    }
                    .font(Mdr.font(11, black: true)).foregroundStyle(Color(hex: k.colorHex))
                    .padding(.horizontal, 9).padding(.vertical, 3)
                    .overlay(Capsule().strokeBorder(Color(hex: k.colorHex)))
                }
                Text(s == .alone ? "وحدي" : s == .none ? "لم تُسجَّل" : s.label)
                    .font(Mdr.font(13, black: true)).foregroundStyle(s == .none ? Mdr.ink34 : tone)
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 60)
            .background(bg, in: RoundedRectangle(cornerRadius: 19, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 19, style: .continuous).strokeBorder(bd))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .contextMenu {
            Button { store.setPrayer(p, .jamaah, on: today) } label: { Label("جماعة", systemImage: "person.3") }
            Button { store.setPrayer(p, .alone, on: today) } label: { Label("وحدي", systemImage: "person") }
        }
    }

    static func tone(_ s: PrayerStatus) -> Color {
        switch s {
        case .jamaah: return Mdr.teal
        case .alone: return Mdr.gold
        case .missed: return Mdr.clay
        case .qada: return Mdr.blue
        default: return Mdr.ink34
        }
    }

    static func glyph(_ s: PrayerStatus) -> String {
        switch s {
        case .jamaah: return "ج"
        case .alone: return "م"
        case .missed: return "ف"
        case .qada: return "ق"
        default: return ""
        }
    }

    private func remainingShort(from now: Date, to t: Date) -> String {
        let mins = max(0, Int(t.timeIntervalSince(now) / 60))
        if mins < 60 { return "بعد \(Fmt.count(mins)) د" }
        let h = Int((Double(mins) / 60).rounded())
        return h == 1 ? "بعد ساعة" : h == 2 ? "بعد ساعتين" : h <= 10 ? "بعد \(Fmt.count(h)) ساعات" : "بعد \(Fmt.count(h)) ساعة"
    }

    @ViewBuilder private func extras(_ log: PrayerLog) -> some View {
        Stepper(value: Binding(get: { log.sunan }, set: { v in store.editPrayerLog(today) { $0.setSunan(v) } }), in: 0...12, step: 2) {
            HStack { Text("السنن الرواتب"); Spacer(); Text("\(Fmt.count(log.sunan)) ركعة").foregroundStyle(.secondary) }
        }
        Stepper(value: Binding(get: { log.qiyamRakaat }, set: { v in store.editPrayerLog(today) { $0.setQiyam(rakaat: min(v, 21), witr: $0.witr) } }), in: 0...21, step: 2) {
            HStack { Text("قيام الليل"); Spacer(); Text("\(Fmt.count(log.qiyamRakaat)) ركعة").foregroundStyle(.secondary) }
        }
        Toggle("الوتر", isOn: Binding(get: { log.witr }, set: { v in store.editPrayerLog(today) { $0.setQiyam(rakaat: $0.qiyamRakaat, witr: v) } }))
        qiyamNights
    }

    /// آخر ثلاثين ليلة: عمودٌ لكلّ ليلة بطول ركعاتها، ونقطةٌ للوتر.
    private var qiyamNights: some View {
        let days = (0..<30).map { DateKey.adding(days: -(29 - $0), to: today) }
        let logs = Dictionary(store.data.prayerLogs.map { ($0.date, $0) }, uniquingKeysWith: { a, _ in a })
        let nights = days.filter { (logs[$0]?.qiyamRakaat ?? 0) > 0 || (logs[$0]?.witr ?? false) }.count
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(days, id: \.self) { d in
                    let r = logs[d]?.qiyamRakaat ?? 0
                    VStack(spacing: 2) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(r > 0 ? Mdr.teal : Mdr.line)
                            .frame(height: max(3, CGFloat(r) / 21 * 40))
                        Circle().fill((logs[d]?.witr ?? false) ? Theme.brand : Color.clear).frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 50, alignment: .bottom)
            Text("\(Fmt.count(nights)) ليلةً من آخر ثلاثين").font(.mdrCaption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private var qadaSection: some View {
        let owed = PrayerLogic.qadaOwed(store.data.prayerLogs, backlog: store.data.qadaBacklog)
        let doneToday = PrayerLogic.qadaDone(store.data.prayerLogs, on: today)
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(owed == 0 ? "لا فوائت عليك" : "عليك \(Fmt.count(owed)) فائتة").font(.mdrBody.weight(.medium))
                if doneToday > 0 { Text("قضيتَ اليوم \(Fmt.count(doneToday))").font(.mdrCaption).foregroundStyle(.secondary) }
            }
            Spacer()
            if owed > 0 {
                Button("اقضِ واحدة") { store.doQada() }
                    .buttonStyle(.mdr(.ink))
            }
        }
        Button { backlogEditor = true } label: {
            Text("دَينٌ سابق قبل التسجيل: \(Fmt.count(store.data.qadaBacklog))").font(.mdrSubheadline)
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
        .presentationBackground(Mdr.paper)
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
            MdrForm {
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
