import SwiftUI

/// قارئ المصحف: وجهٌ لكلّ صفحة (٦٠٤) بخطّ حفص، يُقلَّب يميناً ويساراً كالمصحف.
/// «وقفتُ هنا» يسجّل الصفحة في الختمة.
struct MushafReader: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var page: Int
    @State private var chrome = true
    @AppStorage("mushaf-font") private var fontSize: Double = 24

    init(startPage: Int) { _page = State(initialValue: min(max(startPage, 1), 604)) }

    var body: some View {
        ZStack(alignment: .top) {
            Color(.systemBackground).ignoresSafeArea()
            TabView(selection: $page) {
                ForEach(1...604, id: \.self) { p in
                    MushafPage(page: p, fontSize: fontSize)
                        .tag(p)
                        .onTapGesture { withAnimation(.easeInOut(duration: 0.2)) { chrome.toggle() } }
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .ignoresSafeArea(edges: .bottom)

            if chrome {
                HStack {
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.mdrBody.weight(.semibold)) }
                        .buttonStyle(.bordered).buttonBorderShape(.circle)
                    Spacer()
                    VStack(spacing: 0) {
                        Text(QuranMeta.pageTitle(page)).font(.mdrHeadline)
                        Text("صفحة \(Fmt.count(page)) · الجزء \(Fmt.count(QuranMeta.juz(ofAyah: QuranMeta.pageRange(page).lowerBound)))")
                            .font(.mdrCaption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Menu {
                        Button("تكبير الخط") { fontSize = min(40, fontSize + 2) }
                        Button("تصغير الخط") { fontSize = max(16, fontSize - 2) }
                    } label: { Image(systemName: "textformat.size") }
                        .buttonStyle(.bordered).buttonBorderShape(.circle)
                }
                .padding(.horizontal)
                .padding(.vertical, 8)
                .background(.bar)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            if chrome {
                VStack {
                    Spacer()
                    let marked = store.data.khatma.page == page
                    Button {
                        store.setKhatmaPage(page)
                        Haptic.success()
                    } label: {
                        Label(marked ? "هنا وقفتَ" : "وقفتُ هنا", systemImage: marked ? "bookmark.fill" : "bookmark")
                            .padding(.horizontal, 8)
                    }
                    .buttonStyle(.borderedProminent).tint(Theme.quran).controlSize(.large)
                    .padding(.bottom, 24)
                }
                .transition(.opacity)
            }
        }
        .statusBarHidden(!chrome)
    }
}

struct MushafPage: View {
    let page: Int
    let fontSize: Double

    var body: some View {
        if let lines = MushafLayout.lines(page: page) {
            GeometryReader { geo in
                let width = min(geo.size.width - 28, 520)
                let size = width * MushafLayout.baseFont / MushafLayout.lineWidth
                let height = size * (lines.count <= 8 ? 2.6 : 2.15)
                ScrollView {
                    VStack(spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { item in
                            lineView(item.element, width: width, size: size)
                                .frame(width: width, height: height, alignment: item.element.stretch == MushafLayout.centered ? .center : .trailing)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.top, 72)
                    .padding(.bottom, 110)
                }
            }
            .environment(\.layoutDirection, .rightToLeft)
        } else {
            FlowingPage(page: page, fontSize: fontSize)
        }
    }

    @ViewBuilder
    private func lineView(_ line: MushafLayout.Line, width: Double, size: Double) -> some View {
        let isHeader = line.runs.count == 1 && line.runs[0].id == MushafLayout.suraHeader
        if isHeader {
            Text(line.runs[0].text)
                .font(.system(size: size * 0.95, weight: .semibold))
                .foregroundStyle(Theme.quran)
                .frame(width: width, height: size * 1.9)
                .background(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.quran.opacity(0.45), lineWidth: 1))
        } else {
            let text = line.runs.map { r in r.num > 0 ? "\(r.text)\u{FD3F}\(Digits.indic(String(r.num)))\u{FD3E}" : r.text }.joined()
            Text(text)
                .font(QuranFont.font(size))
                .lineLimit(1)
                .fixedSize()
                .scaleEffect(x: line.stretch > 0 ? line.stretch : 1, y: 1, anchor: .trailing)
        }
    }
}

/// الاحتياط حين لا تخطيط للوجه: نصّ الآيات متّصلاً.
struct FlowingPage: View {
    let page: Int
    let fontSize: Double

    var body: some View {
        let range = QuranMeta.pageRange(page)
        ScrollView {
            Text(range.map { "\(AyahText.text($0)) \u{FD3F}\(Digits.indic(String(QuranMeta.surahAyah($0).ayah)))\u{FD3E}" }.joined(separator: " "))
                .font(QuranFont.font(fontSize))
                .lineSpacing(fontSize * 0.55)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 18)
                .padding(.top, 70)
                .padding(.bottom, 110)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

struct SurahBanner: View {
    let surah: Int
    var body: some View {
        VStack(spacing: 8) {
            Text("سورة \(QuranMeta.surahs[surah - 1].name)")
                .font(.mdrHeadline)
                .foregroundStyle(Theme.quran)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.quran.opacity(0.4), lineWidth: 1))
            if surah != 1 && surah != 9 {
                Text("بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ").font(QuranFont.font(22))
            }
        }
        .padding(.top, 6)
    }
}

struct SurahIndex: View {
    let open: (Int) -> Void
    @State private var mode = 0
    @State private var search = ""

    var body: some View {
        MdrList {
            Picker("", selection: $mode) { Text("السور").tag(0); Text("الأجزاء").tag(1) }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            if mode == 0 {
                ForEach(QuranMeta.surahs.filter { search.isEmpty || $0.name.contains(search) }) { s in
                    Button { open(QuranMeta.page(ofAyah: s.first)) } label: {
                        HStack {
                            Text(Fmt.count(s.num)).font(.mdrCaption).foregroundStyle(.secondary).frame(width: 30)
                            VStack(alignment: .leading) {
                                Text(s.name)
                                Text("\(s.meccan ? "مكية" : "مدنية") · \(Fmt.count(s.ayat)) آية").font(.mdrCaption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(Fmt.count(QuranMeta.page(ofAyah: s.first))).font(.mdrCaption).foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                }
            } else {
                ForEach(1...30, id: \.self) { j in
                    Button { open(QuranMeta.juzStartPage(j)) } label: {
                        HStack {
                            Text("الجزء \(Fmt.count(j))")
                            Spacer()
                            Text(QuranMeta.pageTitle(QuranMeta.juzStartPage(j))).foregroundStyle(.secondary)
                        }
                    }
                    .foregroundStyle(.primary)
                }
            }
        }
        .searchable(text: $search, prompt: "ابحث عن سورة")
        .navigationTitle("الفهرس")
    }
}
