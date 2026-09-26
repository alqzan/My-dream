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
            List {
                Section { khatmaHero }
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())

                Section("الوِرد اليومي") { wirdRow }

                Section {
                    NavigationLink { HifzView() } label: {
                        Label("الحفظ والمراجعة", systemImage: "brain.head.profile")
                    }
                    NavigationLink { SurahIndex(open: { readerPage = ReaderTarget(page: $0) }) } label: {
                        Label("فهرس السور والأجزاء", systemImage: "list.bullet")
                    }
                }

                Section {
                    if store.data.quranReflections.isEmpty {
                        Text("آيةٌ استوقفتك؟ اكتب ما فهمته منها بعبارتك.").foregroundStyle(.secondary)
                    }
                    ForEach(store.data.quranReflections.sorted { $0.date > $1.date }.prefix(20)) { r in
                        Button { reflecting = r } label: { ReflectionRow(r: r) }.buttonStyle(.plain)
                            .swipeActions { Button(role: .destructive) { store.deleteReflection(r.id) } label: { Label("حذف", systemImage: "trash") } }
                    }
                } header: {
                    HStack {
                        Text("تدبّرات")
                        Spacer()
                        Button { reflecting = QuranReflection.new(surah: nil, from: nil, to: nil, text: "") } label: { Image(systemName: "plus") }
                    }
                }
            }
            .navigationTitle("القرآن")
            .fullScreenCover(item: $readerPage) { t in MushafReader(startPage: t.page) }
            .sheet(isPresented: $pageEditor) { KhatmaPageEditor() }
            .sheet(item: $reflecting) { r in ReflectionEditor(reflection: r) }
            .confirmationDialog("أتممتَ الختمة؟", isPresented: $confirmFinish, titleVisibility: .visible) {
                Button("نعم، اختمها وابدأ جديدة") { store.completeKhatma() }
            }
        }
    }

    private var khatmaHero: some View {
        let k = store.data.khatma
        let read = k.pagesRead(on: today)
        let eta = KhatmaMath.eta(page: k.page, startDate: k.startDate, today: today, log: k.pageLog)
        let juz = QuranMeta.juzCompleted(page: k.page)
        return VStack(spacing: 16) {
            HStack(spacing: 18) {
                ZStack {
                    JuzRing(completed: juz, progress: Double(k.page) / Double(QuranMeta.totalPages))
                    VStack(spacing: 0) {
                        Text(Fmt.count(k.page)).font(.title.bold()).contentTransition(.numericText())
                        Text("من ٦٠٤").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                .frame(width: 112, height: 112)
                VStack(alignment: .leading, spacing: 6) {
                    Text(k.page > 0 ? "وقفتَ في \(QuranMeta.pageTitle(k.page))" : "ابدأ ختمتك").font(.headline)
                    Text("الجزء \(Fmt.count(max(1, QuranMeta.juz(ofAyah: QuranMeta.pageRange(max(1, k.page)).upperBound))))")
                        .font(.subheadline).foregroundStyle(.secondary)
                    Text("اليوم \(Fmt.count(read)) من \(Fmt.count(k.dailyPageGoal)) صفحة")
                        .font(.subheadline).foregroundStyle(read >= k.dailyPageGoal ? Theme.quran : .secondary)
                    if let days = eta.daysLeft {
                        Text("على وتيرتك تختم بعد \(Fmt.count(days)) يوماً").font(.caption).foregroundStyle(.secondary)
                    }
                    if k.completed > 0 { Text("ختماتٌ سابقة: \(Fmt.count(k.completed))").font(.caption).foregroundStyle(.secondary) }
                }
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                Button { readerPage = ReaderTarget(page: max(1, k.page == 0 ? 1 : min(k.page + 1, 604))) } label: {
                    Label("تابع القراءة", systemImage: "book.pages").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).tint(Theme.quran)
                Button { pageEditor = true } label: { Label("صفحتي", systemImage: "bookmark").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered).tint(Theme.quran)
            }
            .controlSize(.large)
            if k.page >= QuranMeta.totalPages {
                Button("ختمتُ — ابدأ ختمةً جديدة") { confirmFinish = true }.tint(Theme.quran)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.vertical, 6)
    }

    private var wirdRow: some View {
        let done = store.data.quranWird.contains(today)
        let streak = PrayerLogic.streak(of: Set(store.data.quranWird), today: today)
        return Button { store.toggleWird(today) } label: {
            HStack {
                Image(systemName: done ? "checkmark.circle.fill" : "circle")
                    .font(.title2).foregroundStyle(done ? Theme.quran : .secondary)
                    .symbolEffect(.bounce, value: done)
                VStack(alignment: .leading) {
                    Text(done ? "أتممتَ وِرد اليوم" : "أتممتُ وِرد اليوم")
                    if streak > 1 { Text("\(Fmt.count(streak)) أيامٍ متتالية").font(.caption).foregroundStyle(.secondary) }
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
    }
}

/// ثلاثون قوساً — جزءٌ لكلّ قوس، يُضاء ما أُتمّ.
struct JuzRing: View {
    let completed: Int
    let progress: Double

    var body: some View {
        ZStack {
            ForEach(0..<30, id: \.self) { i in
                let gap = 0.004
                Circle()
                    .trim(from: Double(i) / 30 + gap, to: Double(i + 1) / 30 - gap)
                    .stroke(i < completed ? Theme.quran : Theme.quran.opacity(0.14),
                            style: StrokeStyle(lineWidth: 9, lineCap: .butt))
                    .rotationEffect(.degrees(-90))
            }
            Circle().trim(from: 0, to: progress)
                .stroke(Theme.brand, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(9)
        }
        .animation(.easeOut(duration: 0.5), value: completed)
    }
}

struct ReflectionRow: View {
    let r: QuranReflection
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let ref = r.reference { Text(Digits.indic(ref)).font(.caption.weight(.semibold)).foregroundStyle(Theme.quran) }
            Text(r.text).lineLimit(3)
            Text(Fmt.shortDate(key: r.date)).font(.caption2).foregroundStyle(.secondary)
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
            Form {
                Section {
                    Stepper(value: $page, in: 0...604) {
                        HStack { Text("الصفحة"); Spacer(); Text(Fmt.count(page)).monospacedDigit() }
                    }
                    Slider(value: Binding(get: { Double(page) }, set: { page = Int($0) }), in: 0...604, step: 1).tint(Theme.quran)
                    if page > 0 { Text("\(QuranMeta.pageTitle(page)) — الجزء \(Fmt.count(QuranMeta.juz(ofAyah: QuranMeta.pageRange(page).lowerBound)))").foregroundStyle(.secondary) }
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
            Form {
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
