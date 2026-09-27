import SwiftUI

extension Store {
    /// يحدّد خطأً في كلمة (أو يتراجع عنه في اليوم نفسه) — `toggleMistakeWord`.
    func toggleMistake(ayah: Int, word: Int?, text: String?) {
        let t = DateKey.today()
        update { d in
            var h = d.hifz
            var list = h.objects("mistakes")
            if let i = list.firstIndex(where: { $0.int("ayahId") == ayah && $0.int("wordIndex") == word }) {
                var m = list[i]
                var hits = m.strings("hits")
                if hits.last == t {
                    hits.removeLast()
                    if hits.isEmpty {
                        let id = m.str("id") ?? ""
                        list.remove(at: i)
                        var tomb = h.obj("deletedRecords") ?? [:]
                        tomb.put(id, DateKey.nowMs())
                        h.put("deletedRecords", tomb)
                    } else { m.put("hits", strings: hits); m.put("updatedAt", t); list[i] = m }
                } else {
                    hits.append(t)
                    m.put("hits", strings: hits); m.put("resolved", false); m.put("okStreak", 0); m.put("updatedAt", t)
                    list[i] = m
                }
            } else {
                var m: RawObject = ["id": .string(UUID().uuidString.lowercased()), "ayahId": .number(Double(ayah)),
                                    "wordIndex": word.map { JSONValue.number(Double($0)) } ?? JSONValue.null, "hits": .array([.string(t)]),
                                    "resolved": .bool(false), "updatedAt": .string(t)]
                m.put("word", text)
                list.insert(m, at: 0)
            }
            h.put("mistakes", objects: list)
            d.hifz = h
        }
        Haptic.tap()
    }

    /// نتيجة اختبار الموضع: نجاحان متتاليان يُغلقانه، والخطأ يصفّره ويضيف ضربة اليوم.
    func drillMistake(_ id: String, ok: Bool) {
        let t = DateKey.today()
        update { d in
            var h = d.hifz
            h.put("mistakes", objects: h.objects("mistakes").map { m in
                guard m.str("id") == id else { return m }
                var m = m
                if ok {
                    let streak = (m.int("okStreak") ?? 0) + 1
                    m.put("okStreak", streak); m.put("resolved", streak >= 2)
                } else {
                    var hits = m.strings("hits")
                    if hits.last != t { hits.append(t) }
                    m.put("hits", strings: hits); m.put("okStreak", 0); m.put("resolved", false)
                }
                m.put("lastDrill", t); m.put("updatedAt", t)
                return m
            })
            d.hifz = h
        }
        ok ? Haptic.success() : Haptic.tap()
    }
}

/// كلماتُ آياتِ مقطعٍ قابلةٌ للضغط: الضغطُ يسجّل خطأً في الكلمة.
struct MarkableAyat: View {
    @EnvironmentObject var store: Store
    let portion: Hifz.Portion
    let fontSize: Double

    var body: some View {
        let open = Dictionary(grouping: Hifz.openMistakes(store.hifz), by: { "\($0.int("ayahId") ?? 0):\($0.int("wordIndex") ?? -1)" })
        FlowLayout(spacing: 6, lineSpacing: fontSize * 0.5) {
            ForEach(Array(portion.fromId...portion.toId), id: \.self) { id in
                let words = AyahText.text(id).split(separator: " ").map(String.init)
                ForEach(Array(words.enumerated()), id: \.offset) { pair in
                    let i = pair.offset, w = pair.element
                    let marked = open["\(id):\(i)"] != nil
                    Text(w)
                        .font(QuranFont.font(fontSize))
                        .foregroundStyle(marked ? Theme.danger : .primary)
                        .underline(marked, color: Theme.danger)
                        .onTapGesture { store.toggleMistake(ayah: id, word: i, text: w) }
                }
                Text("\u{FD3F}\(Digits.indic(String(QuranMeta.surahAyah(id).ayah)))\u{FD3E}")
                    .font(QuranFont.font(fontSize * 0.8)).foregroundStyle(Theme.quran)
            }
        }
        .environment(\.layoutDirection, .rightToLeft)
    }
}

/// لوحة المواضع: الأكثر تكراراً أوّلاً، واختبارٌ يطمس الكلمة ويسألك عنها.
struct MistakesView: View {
    private struct Row: Identifiable { let raw: RawObject; var id: String { raw.str("id") ?? "" } }
    @EnvironmentObject var store: Store
    @State private var revealed: Set<String> = []

    var body: some View {
        let list = Hifz.openMistakes(store.hifz).sorted { $0.strings("hits").count > $1.strings("hits").count }.map(Row.init(raw:))
        MdrList {
            if list.isEmpty {
                ContentUnavailableView("لا مواضع مفتوحة", systemImage: "checkmark.seal",
                                       description: Text("اضغط كلمةً أخطأتَ فيها أثناء التسميع لتُحفظ هنا وتُختبر."))
            }
            ForEach(list) { row in
                let m = row.raw
                let id = row.id
                let ayah = m.int("ayahId") ?? 1
                let a = QuranMeta.surahAyah(ayah)
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("\(QuranMeta.surahs[a.surah - 1].name) \(Fmt.count(a.ayah))").font(.mdrSubheadline.weight(.semibold))
                        Spacer()
                        Pill(text: "\(Fmt.count(m.strings("hits").count)) مرّة", color: Theme.danger)
                    }
                    Text(masked(ayah, word: m.int("wordIndex"), reveal: revealed.contains(id)))
                        .font(QuranFont.font(22)).lineSpacing(10)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .onTapGesture { revealed.insert(id) }
                    HStack {
                        Button("أصبتُ") { store.drillMistake(id, ok: true); revealed.remove(id) }
                            .buttonStyle(.borderedProminent).tint(Theme.quran)
                        Button("أخطأتُ") { store.drillMistake(id, ok: false); revealed.insert(id) }
                            .buttonStyle(.bordered).tint(Theme.danger)
                        Spacer()
                        if (m.int("okStreak") ?? 0) > 0 { Text("نجاح \(Fmt.count(m.int("okStreak") ?? 0)) من ٢").font(.mdrCaption).foregroundStyle(.secondary) }
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle("مواضع الخطأ")
    }

    private func masked(_ ayah: Int, word: Int?, reveal: Bool) -> String {
        let words = AyahText.text(ayah).split(separator: " ").map(String.init)
        guard let w = word, words.indices.contains(w), !reveal else { return words.joined(separator: " ") }
        var out = words
        out[w] = String(repeating: "ـ", count: max(3, words[w].count / 2))
        return out.joined(separator: " ")
    }
}
