import SwiftUI
import CoreText

/// **هويّةُ مدار** — نقلٌ حرفيّ لرموز التصميم في الويب (`globals.css`:
/// `--paper` · `--ink` · `--gold` … و`components/madar/primitives.tsx`).
/// ورقٌ كريميّ، حبرٌ بنيّ، ذهبٌ أندلسيّ، وخطُّ «ثمانية» السرفيّ. كلُّ لونٍ
/// بدرجتين (نهاراً/ليلاً) كما في كتلة `.dark` هناك.
enum Mdr {
    // MARK: الألوان
    static let paper = Color(light: 0xFBF7EE, dark: 0x15110D)
    static let paper2 = Color(light: 0xF3ECDF, dark: 0x1E1912)
    static let ink = Color(light: 0x241D16, dark: 0xF0E6D3)
    static let ink72 = Color(light: 0x241D16, lightAlpha: 0.72, dark: 0xF0E6D3, darkAlpha: 0.72)
    static let ink52 = Color(light: 0x241D16, lightAlpha: 0.62, dark: 0xF0E6D3, darkAlpha: 0.5)
    static let ink34 = Color(light: 0x241D16, lightAlpha: 0.34, dark: 0xF0E6D3, darkAlpha: 0.3)
    static let line = Color(light: 0x241D16, lightAlpha: 0.13, dark: 0xF0E6D3, darkAlpha: 0.14)
    static let gline = Color(light: 0xB9862F, lightAlpha: 0.34, dark: 0xD3A24D, darkAlpha: 0.3)
    static let gold = Color(light: 0x87551D, dark: 0xD3A24D)
    static let goldLight = Color(hex: 0xE8B15A)
    static let clay = Color(light: 0xC15A34, dark: 0xDD7D55)
    static let blue = Color(light: 0x3F6F8F, dark: 0x7EA9C7)
    static let teal = Color(light: 0x1F7A6C, dark: 0x3AA893)
    static let clayw = Color(light: 0xC15A34, lightAlpha: 0.13, dark: 0xD9764C, darkAlpha: 0.16)
    static let goldw = Color(light: 0xB9862F, lightAlpha: 0.13, dark: 0xDFAE5E, darkAlpha: 0.15)
    static let bluew = Color(light: 0x3F6F8F, lightAlpha: 0.13, dark: 0x6FA8C6, darkAlpha: 0.16)
    static let tealw = Color(light: 0x1F7A6C, lightAlpha: 0.12, dark: 0x3AA893, darkAlpha: 0.16)

    // MARK: الخطّ
    static let regularName = "thmanyahserifdisplay-Regular"
    static let blackName = "thmanyahserifdisplay-Black"

    /// الخطّان مضمَّنان في الحزمة ويُسجَّلان عند الإقلاع.
    static func registerFonts() {
        for n in ["ThmanyahSerif-Regular", "ThmanyahSerif-Black"] {
            if let url = Bundle.main.url(forResource: n, withExtension: "otf") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }

    static func font(_ size: CGFloat, black: Bool = false, relativeTo style: Font.TextStyle = .body) -> Font {
        .custom(black ? blackName : regularName, size: size, relativeTo: style)
    }

    static func uiFont(_ size: CGFloat, black: Bool = false) -> UIFont {
        UIFont(name: black ? blackName : regularName, size: size) ?? .systemFont(ofSize: size, weight: black ? .heavy : .regular)
    }

    /// مظهرُ UIKit العامّ: شريطُ التنقّل بعناوين الخطّ الأسود على الورق.
    static func applyAppearance() {
        let nav = UINavigationBarAppearance()
        nav.configureWithTransparentBackground()
        nav.backgroundColor = UIColor(paper)
        nav.titleTextAttributes = [.font: uiFont(17, black: true), .foregroundColor: UIColor(ink)]
        nav.largeTitleTextAttributes = [.font: uiFont(34, black: true), .foregroundColor: UIColor(ink)]
        UINavigationBar.appearance().standardAppearance = nav
        UINavigationBar.appearance().scrollEdgeAppearance = nav
        UINavigationBar.appearance().compactAppearance = nav
        let item = UITabBarItemAppearance()
        item.normal.titleTextAttributes = [.font: uiFont(10, black: true)]
        item.selected.titleTextAttributes = [.font: uiFont(10, black: true)]
        let tab = UITabBarAppearance()
        tab.configureWithDefaultBackground()
        tab.stackedLayoutAppearance = item
        tab.inlineLayoutAppearance = item
        tab.compactInlineLayoutAppearance = item
        UITabBar.appearance().standardAppearance = tab
        UISegmentedControl.appearance().setTitleTextAttributes([.font: uiFont(13, black: true)], for: .normal)
    }
}

extension Color {
    init(light: UInt32, lightAlpha: Double, dark: UInt32, darkAlpha: Double) {
        func ui(_ h: UInt32, _ a: Double) -> UIColor {
            UIColor(red: CGFloat((h >> 16) & 0xFF) / 255, green: CGFloat((h >> 8) & 0xFF) / 255,
                    blue: CGFloat(h & 0xFF) / 255, alpha: a)
        }
        let l = ui(light, lightAlpha), d = ui(dark, darkAlpha)
        self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? d : l })
    }
}

/// أنماطُ النصّ بخطّ «ثمانية» — بدائلُ أنماط النظام بأحجامها نفسِها،
/// والعناوينُ بالوجه الأسود (Black) كما في الويب.
extension Font {
    static let mdrLargeTitle = Mdr.font(34, black: true, relativeTo: .largeTitle)
    static let mdrTitle = Mdr.font(28, black: true, relativeTo: .title)
    static let mdrTitle2 = Mdr.font(22, black: true, relativeTo: .title2)
    static let mdrTitle3 = Mdr.font(20, black: true, relativeTo: .title3)
    static let mdrHeadline = Mdr.font(17, black: true, relativeTo: .headline)
    static let mdrBody = Mdr.font(17, relativeTo: .body)
    static let mdrCallout = Mdr.font(16, relativeTo: .callout)
    static let mdrSubheadline = Mdr.font(15, relativeTo: .subheadline)
    static let mdrFootnote = Mdr.font(13, relativeTo: .footnote)
    static let mdrCaption = Mdr.font(12, relativeTo: .caption)
    static let mdrCaption2 = Mdr.font(11, relativeTo: .caption2)
}

// MARK: - العلامات

/// المعيَّنُ الصغير الذي يسبق كلَّ عنوانِ قسم.
struct Diamond: View {
    var size: CGFloat = 6
    var color: Color = Mdr.gold
    var body: some View {
        Rectangle().fill(color).frame(width: size, height: size).rotationEffect(.degrees(45))
    }
}

/// الشمسةُ الثمانية — نفسُ مضلّع `.mdr-star` في الويب.
struct EightStar: Shape {
    func path(in r: CGRect) -> Path {
        let pts: [(Double, Double)] = [(100, 50), (74.9, 39.7), (85.4, 14.6), (60.3, 25.1), (50, 0), (39.7, 25.1),
                                       (14.6, 14.6), (25.1, 39.7), (0, 50), (25.1, 60.3), (14.6, 85.4), (39.7, 74.9),
                                       (50, 100), (60.3, 74.9), (85.4, 85.4), (74.9, 60.3)]
        var p = Path()
        for (i, q) in pts.enumerated() {
            let pt = CGPoint(x: r.minX + r.width * q.0 / 100, y: r.minY + r.height * q.1 / 100)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        p.closeSubpath()
        return p
    }
}

struct Star: View {
    var size: CGFloat = 12
    var color: Color = Mdr.gold
    var body: some View { EightStar().fill(color).frame(width: size, height: size) }
}

// MARK: - ترويسةُ القسم

/// `◆ العنوان ───────── الحاشية`
struct SectionHead<Trailing: View>: View {
    let title: String
    var mark: Color = Mdr.gold
    var star = false
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 9) {
            if star { Star(size: 12, color: mark) } else { Diamond(size: 6, color: mark) }
            Text(title).font(Mdr.font(12, black: true)).tracking(1.6).foregroundStyle(Mdr.ink52)
            Rectangle().fill(Mdr.line).frame(height: 1)
            trailing()
        }
    }
}

extension SectionHead where Trailing == EmptyView {
    init(_ title: String, mark: Color = Mdr.gold, star: Bool = false) {
        self.init(title: title, mark: mark, star: star) { EmptyView() }
    }
}

// MARK: - الأسطح

/// البطاقةُ الورقية (`Panel` في الويب).
struct Panel<Content: View>: View {
    enum Tone { case plain, gold, wash(Color) }
    var tone: Tone = .plain
    var radius: CGFloat = 24
    var padding: CGFloat = 18
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(padding)
            .background(background, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(border, lineWidth: 1))
    }

    private var border: Color {
        if case .plain = tone { return Mdr.line }
        return Mdr.gline
    }

    private var background: AnyShapeStyle {
        switch tone {
        case .plain: return AnyShapeStyle(Mdr.paper2)
        case .gold: return AnyShapeStyle(LinearGradient(colors: [Mdr.goldw, Mdr.paper2.opacity(0.4)], startPoint: .topLeading, endPoint: .bottom))
        case .wash(let c): return AnyShapeStyle(LinearGradient(colors: [c, Mdr.paper2.opacity(0.3)], startPoint: .top, endPoint: .bottom))
        }
    }
}

// MARK: - الأزرار

/// زرُّ التصميم: `ink` حبرٌ ممتلئ · `ghost` حدٌّ رفيع · `gold` حدٌّ ونصٌّ ذهبيّ · `brand` بنّيٌّ ممتلئ.
struct MdrButtonStyle: ButtonStyle {
    enum Kind { case ink, ghost, gold, brand }
    var kind: Kind = .ghost
    var grow = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Mdr.font(15, black: true))
            .padding(.horizontal, 16)
            .frame(minHeight: 44)
            .frame(maxWidth: grow ? .infinity : nil)
            .foregroundStyle(fg)
            .background(bg, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(stroke, lineWidth: 1))
            .opacity(configuration.isPressed ? 0.75 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }

    private var fg: Color {
        switch kind {
        case .ink: return Mdr.paper
        case .brand: return .white
        case .ghost: return Mdr.ink
        case .gold: return Mdr.gold
        }
    }
    private var bg: Color {
        switch kind {
        case .ink: return Mdr.ink
        case .brand: return Mdr.gold
        case .ghost, .gold: return .clear
        }
    }
    private var stroke: Color {
        switch kind {
        case .ink, .brand: return .clear
        case .ghost: return Mdr.line
        case .gold: return Mdr.gline
        }
    }
}

extension ButtonStyle where Self == MdrButtonStyle {
    static func mdr(_ kind: MdrButtonStyle.Kind = .ghost, grow: Bool = false) -> MdrButtonStyle { MdrButtonStyle(kind: kind, grow: grow) }
}

/// شريطُ التبويبات: حبّةٌ داكنةٌ للنشط على أرضية الورق الثاني.
struct MdrTabs<T: Hashable>: View {
    let tabs: [(T, String)]
    @Binding var selection: T

    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs.indices, id: \.self) { i in
                let on = tabs[i].0 == selection
                Button { withAnimation(.snappy) { selection = tabs[i].0 } } label: {
                    Text(tabs[i].1).font(Mdr.font(13, black: true))
                        .frame(maxWidth: .infinity, minHeight: 42)
                        .foregroundStyle(on ? Mdr.paper : Mdr.ink52)
                        .background(on ? Mdr.ink : .clear, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(4)
        .background(Mdr.paper2, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Mdr.line, lineWidth: 1))
    }
}

// MARK: - القوائم

/// `List` على ورق مدار: الخلفيّةُ الكريمية، وصفوفٌ على الورق الثاني بفواصلَ خافتة.
struct MdrList<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        List {
            Group { content() }
                .listRowBackground(Mdr.paper2)
                .listRowSeparatorTint(Mdr.line)
        }
        .scrollContentBackground(.hidden)
        .background(Mdr.paper)
    }
}

struct MdrForm<Content: View>: View {
    @ViewBuilder var content: () -> Content
    var body: some View {
        Form {
            Group { content() }
                .listRowBackground(Mdr.paper2)
                .listRowSeparatorTint(Mdr.line)
        }
        .scrollContentBackground(.hidden)
        .background(Mdr.paper)
    }
}

extension View {
    /// ورقُ مدار خلفيةً لشاشةٍ كاملة.
    func mdrPage() -> some View { background(Mdr.paper.ignoresSafeArea()) }
}
