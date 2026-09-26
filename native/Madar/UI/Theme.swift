import SwiftUI
import CoreText

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: 1)
    }
    init(hexString: String) {
        let s = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(s, radix: 16) ?? 0x888888)
    }
}

/// ألوان الأقسام — نفسُ ألوان الويب، والأسطحُ أسطحُ iOS الأصلية.
enum Theme {
    static let brand = Color(hex: 0xC9852A)
    static let prayer = Color(hex: 0x1F7A6C)
    static let journal = Color(hex: 0x8A6FB0)
    static let quran = Color(hex: 0x1B6B4C)
    static let finance = Color(hex: 0x3D9640)
    static let danger = Color(hex: 0xC15A34)
}

enum QuranFont {
    static let name = "KFGQPCHAFSUthmanicScript-Regula"

    /// الخطُّ مضمَّنٌ في الحزمة ويُسجَّل عند الإقلاع — لا إعدادٌ في Info.plist.
    static func register() {
        guard let url = Bundle.main.url(forResource: "MushafHafs", withExtension: "ttf") else { return }
        CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }

    static func font(_ size: CGFloat) -> Font { .custom(name, size: size) }
}

/// زرُّ اهتزازٍ خفيف عند فعلٍ مُرضٍ.
enum Haptic {
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
}

struct SectionHeaderStyle: ViewModifier {
    func body(content: Content) -> some View { content.font(.footnote.weight(.semibold)) }
}

/// شارةٌ مستديرة ملوّنة (حالة، رقم).
struct Pill: View {
    let text: String
    let color: Color
    var filled = false
    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .foregroundStyle(filled ? .white : color)
            .background(filled ? color : color.opacity(0.14), in: Capsule())
    }
}

/// حلقة تقدّم.
struct ProgressRing: View {
    let progress: Double
    let color: Color
    var lineWidth: CGFloat = 8
    var body: some View {
        ZStack {
            Circle().stroke(color.opacity(0.15), lineWidth: lineWidth)
            Circle().trim(from: 0, to: max(0, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.4), value: progress)
        }
    }
}
