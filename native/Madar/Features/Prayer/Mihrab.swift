import SwiftUI

/// **المحراب** — قوسُ اليوم وعليه الفروضُ الخمسة (`components/madar/prayer/Mihrab.tsx`).
/// القوسُ الذهبيُّ يمتلئ بقدر ما سُجّل، وشمسٌ تجري عليه بالنسبة نفسِها، والضغطُ
/// على الفرض يفتح ورقتَه. الإحداثيّاتُ من التصميم: لوحةٌ ٣٠٠×٢٦٨، نصفُ قطر
/// العُقد ١١٤، أوّلُ زاويةٍ ١٥° وبينها ٣٧٫٥°.
struct Mihrab: View {
    let log: PrayerLog
    let onOpen: (Prayer) -> Void

    private static func angle(_ i: Int) -> Double { 15 + Double(i) * 37.5 }

    /// قوسٌ يعلو وترَه عند y=١٦٠ بين `cx±half`، ويهبط جانباه إلى `bottom` (إن وُجد).
    static func arch(half: Double, r: Double, bottom: Double?, from: Double = 0, to: Double = 1, scale s: Double) -> Path {
        let cy = 160 - (r * r - half * half).squareRoot()
        // زوايا الرياضيات (y للأعلى): الطرفُ الأيسر ثمّ فوق القمّة إلى الأيمن.
        let aL = Double.pi + atan2(160 - cy, half), aR = -atan2(160 - cy, half)
        let a0 = aL + (aR - aL) * from, a1 = aL + (aR - aL) * to
        var p = Path()
        func pt(_ a: Double) -> CGPoint { CGPoint(x: (150 + r * cos(a)) * s, y: (cy - r * sin(a)) * s) }
        if let b = bottom, from == 0 { p.move(to: CGPoint(x: (150 - half) * s, y: b * s)); p.addLine(to: pt(a0)) } else { p.move(to: pt(a0)) }
        let n = 64
        for i in 1...n { p.addLine(to: pt(a0 + (a1 - a0) * Double(i) / Double(n))) }
        if let b = bottom, to == 1 { p.addLine(to: CGPoint(x: (150 + half) * s, y: b * s)) }
        return p
    }

    var body: some View {
        let prayed = log.prayedCount
        let left = 5 - prayed
        let frac = Double(prayed) / 5
        VStack(spacing: 0) {
            GeometryReader { geo in
                let w = geo.size.width
                let s = w / 300
                ZStack(alignment: .topLeading) {
                    Canvas { ctx, _ in
                        ctx.fill(Self.arch(half: 86.5, r: 92, bottom: 268, scale: s), with: .color(Mdr.paper2))
                        ctx.stroke(Self.arch(half: 86.5, r: 92, bottom: nil, scale: s), with: .color(Mdr.clay.opacity(0.9)),
                                   style: StrokeStyle(lineWidth: 16 * s, dash: [17.66 * s, 17.66 * s]))
                        ctx.stroke(Self.arch(half: 86.5, r: 92, bottom: 268, scale: s), with: .color(Mdr.gold.opacity(0.7)), lineWidth: 1.2)
                        ctx.stroke(Self.arch(half: 95, r: 100.5, bottom: 268, scale: s), with: .color(Mdr.gline), lineWidth: 1)
                        // الامتلاءُ يبدأ من الفجر (يمين القوس) — نرسمه من الطرف الأيمن.
                        if frac > 0 {
                            ctx.stroke(Self.arch(half: 86.5, r: 92, bottom: nil, from: 1 - frac, to: 1, scale: s),
                                       with: .color(Mdr.gold), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                        }
                        var ground = Path(); ground.move(to: CGPoint(x: 40 * s, y: 264 * s)); ground.addLine(to: CGPoint(x: 260 * s, y: 264 * s))
                        ctx.stroke(ground, with: .color(Mdr.ink34), lineWidth: 1.2)
                    }

                    // الشمسُ على موضعها من القوس
                    let sunA = (15 + frac * 150) * .pi / 180
                    Circle()
                        .fill(RadialGradient(colors: [Color(hex: 0xF6DCA8), Color(hex: 0xB9862F)], center: UnitPoint(x: 0.34, y: 0.3), startRadius: 1, endRadius: 16))
                        .frame(width: 26, height: 26)
                        .shadow(color: Color(hex: 0xB9862F).opacity(0.45), radius: 12)
                        .position(x: (150 + 114 * cos(sunA)) * s, y: (160 - 114 * sin(sunA)) * s)
                        .allowsHitTesting(false)

                    ForEach(Array(Prayer.allCases.enumerated()), id: \.offset) { i, p in
                        let a = Self.angle(i) * .pi / 180
                        let st = log.status(p)
                        let set = st != .none
                        Button { Haptic.tap(); onOpen(p) } label: {
                            HStack(spacing: 6) {
                                Text(String(p.rawValue.dropFirst(2))).font(Mdr.font(11, black: set))
                                    .foregroundStyle(set ? Mdr.ink : Mdr.ink52)
                                Star(size: 10, color: Self.dot(st))
                            }
                            .padding(.horizontal, 9)
                            .frame(minHeight: 34)
                            .background(Mdr.paper2, in: Capsule())
                            .overlay(Capsule().strokeBorder(set ? Mdr.gline : Mdr.line))
                            .fixedSize()
                        }
                        .buttonStyle(.plain)
                        .position(x: (150 + 114 * cos(a)) * s, y: (160 - 114 * sin(a)) * s)
                        .accessibilityLabel("\(p.rawValue) — \(set ? st.label : "لم تُسجَّل")")
                    }

                    VStack(spacing: 6) {
                        Text("اليوم").font(Mdr.font(10, black: true)).tracking(1.5).foregroundStyle(Mdr.ink34)
                        Text("\(Fmt.count(prayed)) من ٥").font(Mdr.font(32, black: true))
                        Text(lead(left)).font(Mdr.font(12, black: true)).foregroundStyle(Mdr.gold)
                            .multilineTextAlignment(.center)
                    }
                    .frame(width: 150)
                    .position(x: w / 2, y: 268 * s * 0.56)
                    .environment(\.layoutDirection, .rightToLeft)
                }
                .environment(\.layoutDirection, .leftToRight)
            }
            .aspectRatio(300 / 268, contentMode: .fit)
            Text("اضغط صلاةً على القوس لتسجيلها").font(Mdr.font(12)).foregroundStyle(Mdr.ink52)
                .padding(.top, 2).padding(.bottom, 10)
        }
        .padding(.top, 16).padding(.horizontal, 6).padding(.bottom, 6)
        .background(
            LinearGradient(stops: [.init(color: Color(hex: 0xB8502C).opacity(0.10), location: 0),
                                   .init(color: Color(hex: 0xB9862F).opacity(0.05), location: 0.62),
                                   .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom),
            in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 28, style: .continuous).strokeBorder(Mdr.gline))
        .animation(.mdr, value: prayed)
        .sensoryFeedback(.success, trigger: prayed)
    }

    private func lead(_ left: Int) -> String {
        switch left {
        case 0: return "الخمسُ مسجَّلةٌ اليوم."
        case 1: return "بقيت صلاةٌ واحدةٌ لم تُسجَّل."
        case 2: return "بقيت صلاتان لم تُسجَّلا."
        default: return "بقيت \(Fmt.count(left)) صلواتٍ لم تُسجَّل."
        }
    }

    static func dot(_ s: PrayerStatus) -> Color {
        switch s {
        case .jamaah: return Mdr.teal
        case .missed: return Mdr.clay
        case .qada: return Mdr.blue
        case .alone: return Mdr.gold
        default: return Mdr.line
        }
    }
}
