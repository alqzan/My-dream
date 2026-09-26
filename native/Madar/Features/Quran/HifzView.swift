import SwiftUI

struct HifzView: View {
    @EnvironmentObject var store: Store
    @State private var session: HifzSessionTarget?
    @State private var setup = false
    @State private var confirmClear = false

    struct HifzSessionTarget: Identifiable {
        let kind: Store.GradedKind
        let title: String
        let portion: Hifz.Portion
        var id: String { "\(title)-\(portion.fromId)-\(portion.toId)" }
    }

    private var today: String { DateKey.today() }

    var body: some View {
        let h = store.hifz
        List {
            if let plan = h.plan {
                Section { header(h, plan) }
                Section("جلسة اليوم") { todaySession(h) }
                Section("المستحقّ للمراجعة") { dueSection(h) }
                Section("السجلّ") { logSection(h) }
                Section {
                    Button("تعديل الخطة") { setup = true }
                    Button("مسح الخطة وكلّ التقدّم", role: .destructive) { confirmClear = true }
                }
            } else {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("احفظ متتابعاً من حيث تختار").font(.headline)
                        Text("وردٌ يوميّ بقدرٍ تحدّده، ومراجعةٌ متباعدة تعيد إليك كلَّ وجهٍ قبل أن يفلت.")
                            .foregroundStyle(.secondary)
                        Button { setup = true } label: { Text("ابدأ خطة الحفظ").frame(maxWidth: .infinity) }
                            .buttonStyle(.borderedProminent).tint(Theme.quran).controlSize(.large)
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .navigationTitle("الحفظ")
        .sheet(item: $session) { t in HifzSessionView(target: t) }
        .sheet(isPresented: $setup) { HifzSetup() }
        .confirmationDialog("مسح خطة الحفظ؟", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("امسح كلّ التقدّم", role: .destructive) { store.clearHifz() }
        } message: { Text("صدّر نسخةً احتياطية أولاً إن أردت الرجوع.") }
    }

    private func header(_ h: HifzState, _ plan: HifzState.Plan) -> some View {
        let pct = Hifz.progressPct(h)
        let streak = Hifz.streak(h, today: today)
        return HStack(spacing: 16) {
            ZStack {
                ProgressRing(progress: pct, color: Theme.quran, lineWidth: 8)
                Text("\(Fmt.count(Int((pct * 100).rounded())))٪").font(.headline)
            }
            .frame(width: 72, height: 72)
            VStack(alignment: .leading, spacing: 4) {
                if h.frontierId >= plan.startId {
                    Text("بلغتَ \(QuranMeta.describe(h.frontierId, h.frontierId))").font(.headline)
                } else {
                    Text("تبدأ من \(QuranMeta.describe(plan.startId, plan.startId))").font(.headline)
                }
                Text("الورد: \(Fmt.count(plan.amount)) \(Hifz.unitLabel[plan.unit] ?? "")").font(.subheadline).foregroundStyle(.secondary)
                if streak > 1 { Text("\(Fmt.count(streak)) أيامٍ متتالية").font(.caption).foregroundStyle(.secondary) }
            }
        }
        .padding(.vertical, 6)
    }

    @ViewBuilder private func todaySession(_ h: HifzState) -> some View {
        let didMemorize = h.sessions.contains { $0.str("date") == today }
        if let p = Hifz.plannedPortion(h) {
            row(icon: "sparkles", title: "الورد الجديد", detail: QuranMeta.describe(p.fromId, p.toId), done: didMemorize) {
                session = HifzSessionTarget(kind: .memorize, title: "الورد الجديد", portion: p)
            }
        } else {
            Text("أتممتَ المصحف — ما شاء الله.").foregroundStyle(.secondary)
        }
        if let band = Hifz.recentBand(h) {
            let reviewedBand = h.reviews.contains { $0.str("date") == today && $0.int("toId") == band.toId }
            row(icon: "arrow.triangle.2.circlepath", title: "المراجعة القريبة", detail: QuranMeta.describe(band.fromId, band.toId), done: reviewedBand) {
                session = HifzSessionTarget(kind: .review, title: "المراجعة القريبة", portion: band)
            }
        }
    }

    @ViewBuilder private func dueSection(_ h: HifzState) -> some View {
        let q = Hifz.dueQueue(h, today: today)
        if q.pages.isEmpty {
            Text("لا شيء مستحقّ اليوم.").foregroundStyle(.secondary)
        }
        ForEach(q.pages) { p in
            let portion = Hifz.portion(ofPage: p.page, h)
            row(icon: p.lapses > 0 ? "exclamationmark.triangle" : "doc.text",
                title: "وجه \(Fmt.count(p.page)) — \(QuranMeta.pageTitle(p.page))",
                detail: p.lastReviewed == nil ? "لم يُراجَع بعد" : (p.overdue > 0 ? "متأخّر \(Fmt.count(p.overdue)) يوماً" : "مستحقّ اليوم"),
                done: false) {
                session = HifzSessionTarget(kind: .review, title: "مراجعة وجه \(Fmt.count(p.page))", portion: portion)
            }
        }
        if q.total > q.pages.count {
            Text("و\(Fmt.count(q.total - q.pages.count)) أوجهٍ أخرى تُوزَّع على الأيام القادمة.").font(.caption).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func logSection(_ h: HifzState) -> some View {
        let events = h.eventsByRecency().sorted { ($0.date, $0.at ?? 0) > ($1.date, $1.at ?? 0) }.prefix(15)
        if events.isEmpty { Text("لا جلسات بعد.").foregroundStyle(.secondary) }
        ForEach(Array(events), id: \.id) { e in
            HStack {
                VStack(alignment: .leading) {
                    Text(QuranMeta.describe(e.fromId, e.toId))
                    Text(Fmt.shortDate(key: e.date)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if let r = e.rating { RatingBadge(rating: r) }
            }
            .swipeActions { Button(role: .destructive) { store.deleteHifzEvent(e.id) } label: { Label("حذف", systemImage: "trash") } }
        }
    }

    private func row(icon: String, title: String, detail: String, done: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: done ? "checkmark.circle.fill" : icon)
                    .foregroundStyle(done ? Theme.quran : .secondary).frame(width: 26)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                    Text(detail).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.left").font(.caption).foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

struct RatingBadge: View {
    let rating: Int
    static let meta: [Int: (String, UInt32)] = [1: ("يحتاج إتقاناً", 0xC15A34), 2: ("جيّد", 0xDC9F3C), 3: ("متقن", 0x1B6B4C)]
    var body: some View {
        let m = Self.meta[rating] ?? ("", 0x888888)
        Pill(text: m.0, color: Color(hex: m.1))
    }
}

/// جلسة تسميع: نصّ المقطع وجهاً وجهاً، وتقييمٌ لكلّ وجه.
struct HifzSessionView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let target: HifzView.HifzSessionTarget
    @State private var ratings: [Int: Int] = [:]
    @State private var hidden = false
    @AppStorage("mushaf-font") private var fontSize: Double = 24

    var body: some View {
        let parts = Hifz.pageParts(target.portion)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Toggle("إخفاء النصّ للتسميع", isOn: $hidden).tint(Theme.quran)
                    ForEach(parts, id: \.fromId) { part in
                        VStack(alignment: .leading, spacing: 12) {
                            Text("وجه \(Fmt.count(QuranMeta.page(ofAyah: part.fromId))) — \(QuranMeta.describe(part.fromId, part.toId))")
                                .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.quran)
                            Text((part.fromId...part.toId).map { "\(AyahText.text($0)) \u{FD3F}\(Digits.indic(String(QuranMeta.surahAyah($0).ayah)))\u{FD3E}" }.joined(separator: " "))
                                .font(QuranFont.font(fontSize))
                                .lineSpacing(fontSize * 0.5)
                                .multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity)
                                .blur(radius: hidden ? 9 : 0)
                                .onTapGesture { if hidden { withAnimation { hidden = false } } }
                            HStack(spacing: 8) {
                                ForEach([1, 2, 3], id: \.self) { r in
                                    let on = ratings[part.fromId] == r
                                    let m = RatingBadge.meta[r]!
                                    Button { ratings[part.fromId] = r; Haptic.tap() } label: {
                                        VStack(spacing: 2) {
                                            Text(m.0).font(.subheadline.weight(.semibold))
                                            Text("بعد \(Fmt.count(Hifz.nextDueDays(store.hifz, part, r, today: DateKey.today()))) يوم").font(.caption2).opacity(0.8)
                                        }
                                        .frame(maxWidth: .infinity, minHeight: 50)
                                        .foregroundStyle(on ? .white : Color(hex: m.1))
                                        .background(on ? Color(hex: m.1) : Color(hex: m.1).opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                        Divider()
                    }
                }
                .padding()
            }
            .navigationTitle(target.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("سجّل") {
                        let graded = parts.compactMap { p in ratings[p.fromId].map { (p, $0) } }
                        store.recordGraded(target.kind, parts: graded)
                        dismiss()
                    }
                    .disabled(ratings.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
    }
}

struct HifzSetup: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var surah = 114
    @State private var ayah = 1
    @State private var unit = "half"
    @State private var amount = 1
    @State private var intensity = "balanced"

    var body: some View {
        let editing = store.hifz.plan != nil
        NavigationStack {
            Form {
                if !editing {
                    Section("نقطة البداية") {
                        Picker("السورة", selection: $surah) {
                            ForEach(QuranMeta.surahs) { s in Text("\(Fmt.count(s.num)). \(s.name)").tag(s.num) }
                        }
                        Stepper("الآية \(Fmt.count(ayah))", value: $ayah, in: 1...(QuranMeta.surah(surah)?.ayat ?? 1))
                    }
                }
                Section("الورد اليوميّ") {
                    Picker("الوحدة", selection: $unit) {
                        ForEach(["ayah", "quarter", "half", "page"], id: \.self) { Text(Hifz.unitLabel[$0] ?? $0).tag($0) }
                    }
                    Stepper("المقدار: \(Fmt.count(amount))", value: $amount, in: 1...40)
                }
                Section {
                    Picker("الشدّة", selection: $intensity) {
                        ForEach(HifzPreset.labels, id: \.0) { Text($0.1).tag($0.0) }
                    }
                    .pickerStyle(.segmented)
                } header: { Text("شدّة التمرين") } footer: {
                    Text(HifzPreset.labels.first { $0.0 == intensity }?.2 ?? "")
                }
            }
            .navigationTitle(editing ? "تعديل الخطة" : "خطة الحفظ")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(editing ? "حفظ" : "ابدأ") {
                        if editing { store.updateHifzPlan(unit: unit, amount: amount, intensity: intensity) }
                        else { store.startHifzPlan(startId: QuranMeta.id(surah: surah, ayah: ayah), unit: unit, amount: amount, intensity: intensity) }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                if let p = store.hifz.plan { unit = p.unit; amount = p.amount; intensity = p.intensity }
            }
            .onChange(of: surah) { _, _ in ayah = 1 }
        }
    }
}
