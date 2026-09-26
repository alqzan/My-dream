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
                    Button { dismiss() } label: { Image(systemName: "xmark").font(.body.weight(.semibold)) }
                        .buttonStyle(.bordered).buttonBorderShape(.circle)
                    Spacer()
                    VStack(spacing: 0) {
                        Text(QuranMeta.pageTitle(page)).font(.headline)
                        Text("صفحة \(Fmt.count(page)) · الجزء \(Fmt.count(QuranMeta.juz(ofAyah: QuranMeta.pageRange(page).lowerBound)))")
                            .font(.caption).foregroundStyle(.secondary)
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
        let range = QuranMeta.pageRange(page)
        ScrollView {
            VStack(spacing: 14) {
                ForEach(groups(range), id: \.first) { ids in
                    let first = QuranMeta.surahAyah(ids[0])
                    if first.ayah == 1 { SurahBanner(surah: first.surah) }
                    Text(verseText(ids))
                        .font(QuranFont.font(fontSize))
                        .lineSpacing(fontSize * 0.55)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 70)
            .padding(.bottom, 110)
        }
        .environment(\.layoutDirection, .rightToLeft)
    }

    /// تقسيم آيات الوجه عند بداية كلّ سورة.
    private func groups(_ r: ClosedRange<Int>) -> [[Int]] {
        var out: [[Int]] = []
        for id in r {
            if QuranMeta.surahAyah(id).ayah == 1 || out.isEmpty { out.append([id]) } else { out[out.count - 1].append(id) }
        }
        return out
    }

    private func verseText(_ ids: [Int]) -> String {
        ids.map { id in
            let a = QuranMeta.surahAyah(id)
            var t = AyahText.text(id)
            // البسملة في أوّل السورة تُفصل في الشعار (عدا الفاتحة والتوبة).
            if a.ayah == 1, a.surah != 1, a.surah != 9, t.hasPrefix("بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ") {
                t = String(t.dropFirst("بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ ".count))
            }
            return "\(t) \u{FD3F}\(Digits.indic(String(a.ayah)))\u{FD3E}"
        }.joined(separator: " ")
    }
}

struct SurahBanner: View {
    let surah: Int
    var body: some View {
        VStack(spacing: 8) {
            Text("سورة \(QuranMeta.surahs[surah - 1].name)")
                .font(.headline)
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
        List {
            Picker("", selection: $mode) { Text("السور").tag(0); Text("الأجزاء").tag(1) }
                .pickerStyle(.segmented)
                .listRowBackground(Color.clear)
            if mode == 0 {
                ForEach(QuranMeta.surahs.filter { search.isEmpty || $0.name.contains(search) }) { s in
                    Button { open(QuranMeta.page(ofAyah: s.first)) } label: {
                        HStack {
                            Text(Fmt.count(s.num)).font(.caption).foregroundStyle(.secondary).frame(width: 30)
                            VStack(alignment: .leading) {
                                Text(s.name)
                                Text("\(s.meccan ? "مكية" : "مدنية") · \(Fmt.count(s.ayat)) آية").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(Fmt.count(QuranMeta.page(ofAyah: s.first))).font(.caption).foregroundStyle(.secondary)
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
