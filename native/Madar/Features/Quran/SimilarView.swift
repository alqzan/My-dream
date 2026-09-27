import SwiftUI

/// مقارنة آيةٍ بنظائرها: الكلماتُ المختلفة مُبرزة — موضعُ انزلاق الذاكرة.
struct SimilarView: View {
    let ayah: Int

    var body: some View {
        MdrList {
            ForEach(Mutashabihat.similar(ayah), id: \.self) { other in
                let d = Mutashabihat.diff(AyahText.text(ayah), AyahText.text(other))
                Section {
                    block(ayah, d.a)
                    block(other, d.b)
                }
            }
        }
        .navigationTitle("المتشابهات")
    }

    private func block(_ id: Int, _ words: [Mutashabihat.Word]) -> some View {
        let a = QuranMeta.surahAyah(id)
        return VStack(alignment: .leading, spacing: 6) {
            Text("\(QuranMeta.surahs[a.surah - 1].name) \(Fmt.count(a.ayah))").font(.mdrCaption.weight(.semibold)).foregroundStyle(Theme.quran)
            FlowLayout(spacing: 6, lineSpacing: 10) {
                ForEach(words) { w in
                    Text(w.text).font(QuranFont.font(22))
                        .foregroundStyle(w.same ? Mdr.ink : Theme.danger)
                        .padding(.horizontal, w.same ? 0 : 3)
                        .background(w.same ? Color.clear : Theme.danger.opacity(0.12), in: RoundedRectangle(cornerRadius: 4))
                }
            }
            .environment(\.layoutDirection, .rightToLeft)
        }
        .padding(.vertical, 4)
    }
}
