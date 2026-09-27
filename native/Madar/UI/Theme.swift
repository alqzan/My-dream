import SwiftUI
import CoreText

extension Color {
    init(hex: UInt32) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: 1)
    }
    /// لونٌ بدرجتين: الداكنةُ الأصلية نهاراً، وأفتحُ منها ليلاً — الأخضرُ العميق
    /// على خلفيةٍ سوداء يضيع (زرّ «صفحتي» وشاراتُ «سجّل» كانت تكاد لا تُقرأ).
    init(light: UInt32, dark: UInt32) {
        func ui(_ h: UInt32) -> UIColor {
            UIColor(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255,
                    blue: CGFloat(h & 0xFF) / 255, alpha: 1)
        }
        let l = ui(light), d = ui(dark)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }
    init(hexString: String) {
        let s = hexString.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        self.init(hex: UInt32(s, radix: 16) ?? 0x888888)
    }
}

/// ألوان الأقسام — نفسُ ألوان الويب، والأسطحُ أسطحُ iOS الأصلية.
enum Theme {
    /// ألوانُ الأقسام بعد طبقة تصميم مدار في الويب: الذهبُ للعلامة والقرآن
    /// والمال، والطينيُّ للصلاة والتنبيه، والأزرقُ للمذكرات — والفيروزيّ
    /// يبقى لحالات الصلاة المؤدّاة كما في صفوف صفحة الصلاة.
    static let brand = Mdr.gold
    static let prayer = Mdr.teal
    static let journal = Mdr.blue
    static let quran = Mdr.gold
    static let finance = Mdr.gold
    static let danger = Mdr.clay
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
    func body(content: Content) -> some View { content.font(.mdrFootnote.weight(.semibold)) }
}

/// شارةٌ مستديرة ملوّنة (حالة، رقم).
struct Pill: View {
    let text: String
    let color: Color
    var filled = false
    var body: some View {
        Text(text)
            .font(Mdr.font(12, black: true))
            .padding(.horizontal, 10).padding(.vertical, 4)
            .foregroundStyle(filled ? .white : color)
            .background(filled ? color : Mdr.paper2, in: Capsule())
            .overlay(Capsule().strokeBorder(filled ? color : color.opacity(0.5)))
    }
}

/// حلقة تقدّم.
struct ProgressRing: View {
    let progress: Double
    let color: Color
    var lineWidth: CGFloat = 8
    var body: some View {
        ZStack {
            Circle().stroke(Mdr.line, lineWidth: lineWidth)
            Circle().trim(from: 0, to: max(0, min(1, progress)))
                .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .animation(.easeOut(duration: 0.4), value: progress)
        }
    }
}
