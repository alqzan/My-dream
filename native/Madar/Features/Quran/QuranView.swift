import SwiftUI

struct QuranView: View {
    @EnvironmentObject var store: Store
    @State private var readerPage: ReaderTarget?
    @State private var pageEditor = false
    @State private var reflecting: QuranReflection?
    @State private var confirmFinish = false

    struct ReaderTarget: Identifiable { let page: Int; var id: Int { page } }

    private var today: String { DateKey.today() }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header
                    khatmaPanel.padding(.top, 16)

                    SectionHead("الوِردُ اليومي").padding(.top, 26).padding(.bottom, 12)
                    wirdRow

                    VStack(spacing: 0) {
                        NavigationLink { HifzView() } label: { linkRow("الحفظ والمراجعة", "brain.head.profile") }
                        Rectangle().fill(Mdr.line).frame(height: 1).padding(.horizontal, 18)
                        NavigationLink { SurahIndex(open: { readerPage = ReaderTarget(page: $0) }) } label: {
                            linkRow("فهرس السور والأجزاء", "list.bullet")
                        }
                    }
                    .buttonStyle(.plain)
                    .background(Mdr.paper2, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Mdr.line))
                    .padding(.top, 14)

                    SectionHead(title: "تدبّرات") {
                        Button { reflecting = QuranReflection.new(surah: nil, from: nil, to: nil, text: "") } label: {
                            Image(systemName: "plus").font(.system(size: 15, weight: .semibold)).foregroundStyle(Mdr.gold)
                                .frame(width: 32, height: 32)
                        }
                        .accessibilityLabel("تدبّرٌ جديد")
                    }
                    .padding(.top, 26).padding(.bottom, 12)
                    reflections

                    ayahCard.padding(.top, 26)
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 30)
            }
            .scrollIndicators(.hidden)
            .mdrPage()
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(item: $readerPage) { t in MushafReader(startPage: t.page) }
            .sheet(isPresented: $pageEditor) { KhatmaPageEditor() }
            .sheet(item: $reflecting) { r in ReflectionEditor(reflection: r) }
            .confirmationDialog("أتممتَ الختمة؟", isPresented: $confirmFinish, titleVisibility: .visible) {
                Button("نعم، اختمها وابدأ جديدة") { store.completeKhatma() }
            }
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "book").font(.system(size: 18)).foregroundStyle(Mdr.gold)
                .frame(width: 44, height: 44)
                .background(Mdr.goldw, in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text("القرآن").font(Mdr.font(30, black: true))
                Text("الختمة والحفظ والتدبّر").font(Mdr.font(13)).foregroundStyle(Mdr.ink52)
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private func linkRow(_ title: String, _ icon: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).foregroundStyle(Mdr.gold).frame(width: 26)
            Text(title).font(Mdr.font(16, black: true))
            Spacer()
            Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold)).foregroundStyle(Mdr.ink34)
        }
        .padding(.horizontal, 18).frame(minHeight: 58)
        .contentShape(Rectangle())
    }

    /// «مدار الختمة» — حلقةُ الأجزاء الثلاثين وتحتها وتيرتُك وهدفُ يومك.
    private var khatmaPanel: some View {
        let k = store.data.khatma
        let read = k.pagesRead(on: today)
        let eta = KhatmaMath.eta(page: k.page, startDate: k.startDate, today: today, log: k.pageLog)
        let juz = QuranMeta.juzCompleted(page: k.page)
        let goal = max(1, k.dailyPageGoal)
        return Panel(tone: .gold) {
            VStack(spacing: 14) {
                HStack {
                    Star(size: 13)
                    Text("مدار الختمة").font(Mdr.font(17, black: true))
                    Spacer()
                    if k.completed > 0 {
                        Text("أتممتَ \(Fmt.count(k.completed)) ختمات 🌙").font(Mdr.font(12, black: true))
                            .padding(.horizontal, 12).padding(.vertical, 5)
                            .background(Mdr.goldw, in: Capsule())
                    }
                }
                ZStack {
                    JuzRing(completed: juz, progress: Double(k.page) / Double(QuranMeta.totalPages))
                    VStack(spacing: 2) {
                        Text(Fmt.count(k.page)).font(Mdr.font(40, black: true)).contentTransition(.numericText())
                        Text("من ٦٠٤ صفحة").font(Mdr.font(12)).foregroundStyle(Mdr.ink52)
                    }
                }
                .frame(width: 210, height: 210)
                .frame(maxWidth: .infinity)
                VStack(spacing: 4) {
                    Text(k.page > 0 ? "وقفتَ في \(QuranMeta.pageTitle(k.page)) · الجزء \(Fmt.count(max(1, juz + 1 > 30 ? 30 : juz + 1)))" : "ابدأ ختمتك")
                        .font(Mdr.font(15, black: true))
                    if let days = eta.daysLeft {
                        Text("على وتيرتك تختم خلال \(Fmt.count(days)) يوماً").font(Mdr.font(12, black: true)).foregroundStyle(Mdr.gold)
                    }
                }
                .frame(maxWidth: .infinity)
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("هدف اليوم: \(Fmt.count(goal)) صفحة").font(Mdr.font(13, black: true))
                        Spacer()
                        Button("عدّل") { pageEditor = true }.font(Mdr.font(12, black: true)).foregroundStyle(Mdr.gold)
                    }
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Mdr.line)
                            Capsule().fill(Mdr.gold).frame(width: g.size.width * min(1, Double(read) / Double(goal)))
                        }
                    }
                    .frame(height: 6)
                    .environment(\.layoutDirection, .rightToLeft)
                    Text("قرأتَ اليوم \(Fmt.count(read)) من \(Fmt.count(goal)) صفحة").font(Mdr.font(11)).foregroundStyle(Mdr.ink52)
                }
                .padding(14)
                .background(Mdr.paper, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Mdr.gline))
                HStack(spacing: 10) {
                    Button { readerPage = ReaderTarget(page: max(1, k.page == 0 ? 1 : min(k.page + 1, 604))) } label: {
                        Label("تابع القراءة", systemImage: "book.pages")
                    }
                    .buttonStyle(.mdr(.brand, grow: true))
                    .accessibilityIdentifier("quran.continue")
                    Button { pageEditor = true } label: { Label("صفحتي", systemImage: "bookmark") }
                        .buttonStyle(.mdr(.gold, grow: true))
                }
                if k.page >= QuranMeta.totalPages {
                    Button("ختمتُ — ابدأ ختمةً جديدة") { confirmFinish = true }.buttonStyle(.mdr(.ink, grow: true))
                }
            }
        }
    }

    private var wirdRow: some View {
        let done = store.data.quranWird.contains(today)
        let streak = PrayerLogic.streak(of: Set(store.data.quranWird), today: today)
        return Button { Haptic.tap(); store.toggleWird(today) } label: {
            HStack(spacing: 12) {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 26)).foregroundStyle(done ? Mdr.teal : Mdr.ink34)
                    .symbolEffect(.bounce, value: done)
                VStack(alignment: .leading, spacing: 2) {
                    Text(done ? "أتممتَ وِرد اليوم" : "أتممتُ وِرد اليوم").font(Mdr.font(16, black: true))
                    if streak > 1 { Text("\(Fmt.count(streak)) أيامٍ متتالية").font(Mdr.font(12)).foregroundStyle(Mdr.ink52) }
                }
                Spacer()
            }
            .padding(16)
            .background(done ? Mdr.tealw : Mdr.paper2, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(done ? Mdr.teal.opacity(0.34) : Mdr.line))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("quran.wird")
    }

    @ViewBuilder private var reflections: some View {
        let list = store.data.quranReflections.sorted { $0.date > $1.date }.prefix(20)
        if list.isEmpty {
            Text("آيةٌ استوقفتك؟ اكتب ما فهمته منها بعبارتك.").font(Mdr.font(14)).foregroundStyle(Mdr.ink52)
        }
        VStack(spacing: 10) {
            ForEach(Array(list)) { r in
                Button { reflecting = r } label: { Panel(padding: 14) { ReflectionRow(r: r) } }
                    .buttonStyle(.plain)
                    .contextMenu {
                        Button(role: .destructive) { store.deleteReflection(r.id) } label: { Label("حذف", systemImage: "trash") }
                    }
            }
        }
    }

    /// خاتمةُ الصفحة كما في الويب: آيةٌ في إطارٍ ودعاء.
    private var ayahCard: some View {
        let id = QuranMeta.id(surah: 54, ayah: 17)
        let text = AyahText.text(id)
        return VStack(spacing: 12) {
            Text("سورة القمر").font(Mdr.font(12, black: true))
                .padding(.horizontal, 16).padding(.vertical, 5)
                .overlay(Capsule().strokeBorder(Mdr.gold, lineWidth: 1.2))
            Text(text.isEmpty ? "وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ فَهَلْ مِن مُّدَّكِرٍ" : text)
                .font(QuranFont.font(24)).multilineTextAlignment(.center)
            HStack(spacing: 8) {
                Rectangle().fill(Mdr.gline).frame(height: 1)
                Diamond(size: 6)
                Rectangle().fill(Mdr.gline).frame(height: 1)
            }
            Text("اللهم اجعل القرآن ربيع قلبي").font(Mdr.font(14, black: true))
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(Mdr.paper2, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Mdr.gline))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Mdr.gline).padding(8))
    }
}

/// ثلاثون قوساً — جزءٌ لكلّ قوس، يُضاء ما أُتمّ.
struct JuzRing: View {
    let completed: Int
    let progress: Double

    var body: some View {
        ZStack {
            ForEach(0..<30, id: \.self) { i in
                let gap = 0.009
                Circle()
                    .trim(from: Double(i) / 30 + gap, to: Double(i + 1) / 30 - gap)
                    .stroke(i < completed ? Mdr.goldLight : Mdr.line,
                            style: StrokeStyle(lineWidth: 14, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            }
            Circle().trim(from: 0, to: progress)
                .stroke(Mdr.gold, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(16)
        }
        .animation(.easeOut(duration: 0.5), value: completed)
    }
}

struct ReflectionRow: View {
    let r: QuranReflection
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let ref = r.reference { Text(Digits.indic(ref)).font(.mdrCaption.weight(.semibold)).foregroundStyle(Theme.quran) }
            Text(r.text).lineLimit(3)
            Text(Fmt.shortDate(key: r.date)).font(.mdrCaption2).foregroundStyle(Mdr.ink52)
        }
        .padding(.vertical, 2)
    }
}

struct KhatmaPageEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var page = 0
    @State private var goal = 20

    var body: some View {
        NavigationStack {
            MdrForm {
                Section {
                    Stepper(value: $page, in: 0...604) {
                        HStack { Text("الصفحة"); Spacer(); Text(Fmt.count(page)).monospacedDigit() }
                    }
                    Slider(value: Binding(get: { Double(page) }, set: { page = Int($0) }), in: 0...604, step: 1).tint(Theme.quran)
                    if page > 0 { Text("\(QuranMeta.pageTitle(page)) — الجزء \(Fmt.count(QuranMeta.juz(ofAyah: QuranMeta.pageRange(page).lowerBound)))").foregroundStyle(Mdr.ink52) }
                } header: { Text("قرأتُ حتى") }
                Section {
                    Stepper(value: $goal, in: 1...604) {
                        HStack { Text("هدف اليوم"); Spacer(); Text("\(Fmt.count(goal)) صفحة") }
                    }
                } footer: {
                    Text("على \(Fmt.count(goal)) صفحة يومياً تختم كلّ \(Fmt.count(Int((604.0 / Double(goal)).rounded(.up)))) يوماً.")
                }
            }
            .navigationTitle("الختمة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        if page != store.data.khatma.page { store.setKhatmaPage(page) }
                        if goal != store.data.khatma.dailyPageGoal { store.setKhatmaGoal(goal) }
                        dismiss()
                    }
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear { page = store.data.khatma.page; goal = store.data.khatma.dailyPageGoal }
        }
        .presentationDetents([.medium, .large])
    }
}

struct ReflectionEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State var reflection: QuranReflection
    @State private var surah = 0
    @State private var from = 1
    @State private var to = 1

    var body: some View {
        NavigationStack {
            MdrForm {
                Section("الآية") {
                    Picker("السورة", selection: $surah) {
                        Text("بلا مرجع").tag(0)
                        ForEach(QuranMeta.surahs) { s in Text("\(Fmt.count(s.num)). \(s.name)").tag(s.num) }
                    }
                    if let s = QuranMeta.surah(surah) {
                        Stepper("من الآية \(Fmt.count(from))", value: $from, in: 1...s.ayat)
                        Stepper("إلى الآية \(Fmt.count(max(from, to)))", value: $to, in: from...s.ayat)
                        let text = (QuranMeta.id(surah: surah, ayah: from)...QuranMeta.id(surah: surah, ayah: max(from, to))).prefix(5)
                            .map { AyahText.text($0) }.joined(separator: " ۝ ")
                        if !text.isEmpty {
                            Text(text).font(QuranFont.font(22)).lineSpacing(10).frame(maxWidth: .infinity, alignment: .trailing)
                        }
                    }
                }
                Section("ما فهمتُه") {
                    TextField("اكتب بعبارتك", text: $reflection.text, axis: .vertical).lineLimit(4...12)
                }
            }
            .navigationTitle("تدبّر")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") { save(); dismiss() }.disabled(reflection.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                surah = reflection.surah ?? 0
                from = reflection.fromAyah ?? 1
                to = reflection.toAyah ?? from
            }
        }
    }

    private func save() {
        var r = QuranReflection.new(surah: surah == 0 ? nil : surah, from: surah == 0 ? nil : from, to: surah == 0 ? nil : max(from, to), text: reflection.text)
        r.raw.put("id", reflection.id)
        if let d = reflection.raw.str("date") { r.raw.put("date", d) }
        var merged = reflection.raw
        for (k, v) in r.raw { merged[k] = v }
        if surah == 0 { merged["surah"] = nil; merged["fromAyah"] = nil; merged["toAyah"] = nil; merged["reference"] = nil }
        store.saveReflection(QuranReflection(raw: merged))
    }
}
