import SwiftUI

/// خريطة المحفوظ: وجهٌ لكلّ خليّة. **حالةُ «مستحقّ» من الجدول وحده** — لا فاصلَ ثابتاً ثانياً.
struct HifzMap: View {
    let schedules: [Hifz.PageSchedule]
    private let cols = Array(repeating: GridItem(.flexible(), spacing: 3), count: 12)

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            LazyVGrid(columns: cols, spacing: 3) {
                ForEach(schedules) { p in
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color(p))
                        .aspectRatio(1, contentMode: .fit)
                        .accessibilityLabel("وجه \(p.page)")
                }
            }
            HStack(spacing: 12) {
                legend(Theme.quran, "راسخ")
                legend(Theme.quran.opacity(0.45), "يُثبَّت")
                legend(Theme.brand, "مستحقّ")
                legend(Theme.danger, "متعثّر")
            }
            .font(.mdrCaption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func color(_ p: Hifz.PageSchedule) -> Color {
        if p.due && p.lapses > 0 { return Theme.danger }
        if p.due { return Theme.brand }
        return p.interval >= 14 ? Theme.quran : Theme.quran.opacity(0.45)
    }

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 4) { RoundedRectangle(cornerRadius: 2).fill(c).frame(width: 10, height: 10); Text(t) }
    }
}
