import SwiftUI

// قِطعُ البهو — نقلٌ لـ`components/madar/today/` في الويب (المزولة والأقواس
// الثلاثة) ولحلقة السنة في `app/page.tsx`. الرسمُ بإحداثيّات التصميم نفسِها
// (٣٢٠×٦٢ للمزولة و١٠٠×١٣٢ للقوس) مكبَّرةً إلى عرض الشاشة.

// MARK: - المزولة

/// **المزولة** — قوسُ النهار وشاخصٌ يرمي ظلَّه على ساعةِ الآن. تُقاد بمواقيت
/// الجهاز: النهارُ من الفجر إلى العشاء، والشمسُ بين شروقها ومغربها.
struct Sundial: View {
    let now: Date
    let times: [Prayer: Date]
    let sunrise: Date?
    let prayed: Int
    let dueLabel: String?
    let next: (Prayer, Date)?

    struct Geometry {
        var frac: Double
        var phase: String
        var sun: CGPoint
        var sunVisible: Bool
        var shadowTipX: Double
        var shadowOpacity: Double
        var gnomonOpacity: Double
        var nearTick: Int?
    }

    static let ticks: [(Double, Double)] = [(14, 40), (87, 43), (160, 40), (233, 43), (306, 40)]

    /// نسخةٌ من `dialGeometry` في `lib/sundial.ts`.
    static func geometry(frac: Double, rise: Double, set: Double) -> Geometry {
        let f = max(0, min(1, frac))
        let down = f < rise || f > set
        let u = max(0, min(1, (f - rise) / max(1e-6, set - rise)))
        let len = min(1, max(0.22, abs(u - 0.5) * 2.6))
        let dx = (u >= 0.5 ? 1.0 : -1.0) * len * 132
        let sunY = 44 - 112 * u * (1 - u)
        let alt = max(0, (47 - sunY) / 31)
        let op = down ? 0 : 0.07 + 0.34 * alt
        let tip = 160 + dx
        let near = ticks.indices.min { abs(ticks[$0].0 - tip) < abs(ticks[$1].0 - tip) }
        let phase: String
        if f < rise { phase = "الفجر" } else if f < rise + (set - rise) * 0.5 { phase = "الضحى" }
        else if f < set { phase = "العصر" } else if f < 1 { phase = "المغرب" } else { phase = "العشاء" }
        return Geometry(frac: f, phase: phase, sun: CGPoint(x: 306 - f * 292, y: sunY), sunVisible: !down,
                        shadowTipX: tip, shadowOpacity: op, gnomonOpacity: down ? 0.3 : 0.72,
                        nearTick: op > 0 ? near : nil)
    }

    private var geo: Geometry? {
        guard let fajr = times[.fajr], let isha = times[.isha], isha > fajr else { return nil }
        let span = isha.timeIntervalSince(fajr)
        let at = { (d: Date) in max(0, min(1, d.timeIntervalSince(fajr) / span)) }
        var rise = sunrise.map(at) ?? 0.1, set = times[.maghrib].map(at) ?? 0.88
        if set <= rise { rise = 0; set = 1 }
        return Self.geometry(frac: at(now), rise: rise, set: set)
    }

    var body: some View {
        if let g = geo {
            VStack(spacing: 0) {
                dial(g)
                    .aspectRatio(320 / 62, contentMode: .fit)
                    .environment(\.layoutDirection, .leftToRight)
                HStack {
                    Text("الفجر \(times[.fajr].map(Fmt.clock) ?? "")")
                    Spacer()
                    Text("\(g.phase) · مضى \(Fmt.count(Int((g.frac * 100).rounded())))٪ من نهارك")
                    Spacer()
                    Text("العشاء \(times[.isha].map(Fmt.clock) ?? "")")
                }
                .font(Mdr.font(10)).foregroundStyle(Mdr.ink34)
                .padding(.top, 2)
                Rectangle().fill(Mdr.line).frame(height: 1).padding(.top, 9)
                HStack(spacing: 7) {
                    Star(size: 9)
                    Text(status).font(Mdr.font(11, black: true)).foregroundStyle(Mdr.ink72)
                    Spacer()
                    Text("\(Fmt.count(prayed)) من ٥").font(Mdr.font(10)).foregroundStyle(Mdr.ink34)
                }
                .padding(.top, 9)
            }
            .padding(.horizontal, 14).padding(.top, 12).padding(.bottom, 9)
            .background(Mdr.paper2, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Mdr.gline, lineWidth: 1))
        }
    }

    private var status: String {
        if let d = dueLabel { return "القوسُ المستحقُّ الآن: \(d)" }
        if let n = next { return "لا شيءَ مستحقٌّ الآن · \(n.0.rawValue) \(Fmt.clock(n.1))" }
        return "يومُك في حاله"
    }

    private func dial(_ g: Geometry) -> some View {
        Canvas { ctx, size in
            let s = size.width / 320
            func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            var arc = Path(); arc.move(to: pt(14, 44)); arc.addQuadCurve(to: pt(306, 44), control: pt(160, -12))
            ctx.stroke(arc, with: .color(Mdr.gline), style: StrokeStyle(lineWidth: 1, dash: [2.5 * s, 5 * s]))
            var ground = Path(); ground.move(to: pt(14, 47)); ground.addLine(to: pt(306, 47))
            ctx.stroke(ground, with: .color(Mdr.gline), lineWidth: 1.2)
            for (i, t) in Self.ticks.enumerated() {
                var p = Path()
                if i == g.nearTick {
                    p.move(to: pt(t.0, 47)); p.addLine(to: pt(t.0, t.1 - 4))
                    ctx.stroke(p, with: .color(Mdr.gold), style: StrokeStyle(lineWidth: 2, lineCap: .round))
                } else {
                    p.move(to: pt(t.0, 47)); p.addLine(to: pt(t.0, t.1))
                    ctx.stroke(p, with: .color(Mdr.gline), lineWidth: 1)
                }
            }
            var shadow = Path()
            shadow.move(to: pt(160, 43.5)); shadow.addLine(to: pt(160, 50.5))
            shadow.addLine(to: pt(g.shadowTipX, 49)); shadow.addLine(to: pt(g.shadowTipX, 46)); shadow.closeSubpath()
            ctx.fill(shadow, with: .color(Mdr.ink.opacity(g.shadowOpacity)))
            var gnomon = Path(); gnomon.move(to: pt(160, 47)); gnomon.addLine(to: pt(160, 22))
            ctx.stroke(gnomon, with: .color(Mdr.ink.opacity(g.gnomonOpacity)), style: StrokeStyle(lineWidth: 2.8, lineCap: .round))
            var base = Path(); base.move(to: pt(154, 47)); base.addLine(to: pt(166, 47))
            ctx.stroke(base, with: .color(Mdr.ink.opacity(g.gnomonOpacity)), style: StrokeStyle(lineWidth: 2.4, lineCap: .round))
            if g.sunVisible {
                let c = pt(g.sun.x, g.sun.y)
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 7 * s, y: c.y - 7 * s, width: 14 * s, height: 14 * s)), with: .color(Mdr.gold.opacity(0.18)))
                ctx.fill(Path(ellipseIn: CGRect(x: c.x - 3.4 * s, y: c.y - 3.4 * s, width: 6.8 * s, height: 6.8 * s)), with: .color(Mdr.gold))
            }
        }
    }
}

// MARK: - القوس (المحراب)

/// محيطُ المحراب في لوحة ١٠٠×١٣٢: جانبان قائمان وقوسٌ يعلو فوق الوتر.
struct ArchShape: Shape {
    /// نصفُ عرض الوتر ونصفُ القطر (الداخلي ٢٥/٢٨، والخارجي ٣٠/٣٣).
    var half: Double = 25
    var radius: Double = 28
    var closed = true
    var arcOnly = false

    func path(in rect: CGRect) -> Path {
        let s = rect.width / 100
        let cy = 60 - (radius * radius - half * half).squareRoot()
        let a0 = atan2(60 - cy, -half), a1 = atan2(60 - cy, half) + 2 * .pi
        func pt(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: rect.minX + x * s, y: rect.minY + y * s) }
        var p = Path()
        if arcOnly { p.move(to: pt(50 - half, 60)) } else { p.move(to: pt(50 - half, 132)); p.addLine(to: pt(50 - half, 60)) }
        let n = 48
        for i in 1...n {
            let a = a0 + (a1 - a0) * Double(i) / Double(n)
            p.addLine(to: pt(50 + radius * cos(a), cy + radius * sin(a)))
        }
        if !arcOnly { p.addLine(to: pt(50 + half, 132)) }
        if closed && !arcOnly { p.closeSubpath() }
        return p
    }
}

struct ArcSpec: Identifiable {
    let id: String
    let label: String
    let big: String
    let unit: String
    let sub: String
    let ratio: Double
    let color: Color
    let wash: Color
    let action: () -> Void
}

/// **الأقواسُ الثلاثة** — الصلاةُ والقرآنُ والمال. كلُّ قوسٍ يمتلئ بقدر حاله،
/// وواحدٌ منها على الأكثر يُطوَّق بالذهب: المستحقُّ الآن.
struct ThreeArcs: View {
    let arcs: [ArcSpec]
    let due: String?

    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            ForEach(arcs) { a in
                Button(action: { Haptic.tap(); a.action() }) {
                    VStack(spacing: 0) {
                        arch(a)
                        Text(a.label).font(Mdr.font(14, black: true)).padding(.top, 7)
                        Text(a.sub).font(Mdr.font(11)).foregroundStyle(Mdr.ink52).lineLimit(1).minimumScaleFactor(0.8).padding(.top, 2)
                    }
                    .padding(.bottom, 6)
                    .frame(maxWidth: .infinity)
                    .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(due == a.id ? Mdr.gold : .clear, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(a.label): \(a.big) \(a.unit) — \(a.sub)")
            }
        }
    }

    private func arch(_ a: ArcSpec) -> some View {
        GeometryReader { geo in
            let w = geo.size.width
            let h = w * 1.32
            let fillTop = (1 - max(0, min(1, a.ratio))) * h
            ZStack(alignment: .topLeading) {
                Canvas { ctx, size in
                    let r = CGRect(origin: .zero, size: size)
                    let inner = ArchShape().path(in: r)
                    let unit = size.width / 100
                    ctx.fill(inner, with: .color(a.wash))
                    var clipped = ctx
                    clipped.clip(to: inner)
                    clipped.fill(Path(CGRect(x: 0, y: fillTop, width: size.width, height: size.height - fillTop)),
                                 with: .color(a.color.opacity(0.62)))
                    if a.ratio > 0.02 && a.ratio < 0.99 {
                        clipped.fill(Path(CGRect(x: 0, y: fillTop - 1, width: size.width, height: 2)), with: .color(a.color))
                    }
                    ctx.stroke(ArchShape(half: 30, radius: 33, closed: false).path(in: r), with: .color(Mdr.paper), lineWidth: 8 * unit)
                    ctx.stroke(ArchShape(half: 30, radius: 33, arcOnly: true).path(in: r), with: .color(a.color),
                               style: StrokeStyle(lineWidth: 8 * unit, dash: [8.4 * unit, 8.4 * unit]))
                    ctx.stroke(ArchShape(half: 30, radius: 33, closed: false).path(in: r), with: .color(Mdr.gline), lineWidth: 1)
                }
                .frame(width: w, height: h)
                .environment(\.layoutDirection, .leftToRight)
                VStack(spacing: 3) {
                    Text(a.big).font(Mdr.font(bigSize(a.big), black: true)).foregroundStyle(a.color)
                        .lineLimit(1).minimumScaleFactor(0.5)
                        .contentTransition(.numericText())
                    Text(a.unit).font(Mdr.font(10)).foregroundStyle(Mdr.ink52).lineLimit(1)
                }
                .frame(width: w * 0.6)
                .position(x: w / 2, y: h * 0.52)
            }
            .frame(width: w, height: h)
        }
        .aspectRatio(100 / 132, contentMode: .fit)
        .animation(.mdr, value: a.ratio)
        .animation(.mdr, value: a.big)
    }

    /// `bigFitSize` في الويب: المقاسُ يتبع الطولَ بعد إسقاط الحركات.
    private func bigSize(_ t: String) -> CGFloat {
        let n = t.unicodeScalars.filter { !(0x064B...0x0652).contains($0.value) }.count
        return n <= 2 ? 29 : n <= 3 ? 24 : n <= 4 ? 21 : n <= 5 ? 18 : 16
    }
}

// MARK: - حلقة السنة وعلامة مدار

struct YearRing: View {
    let pct: Int
    var body: some View {
        ZStack {
            Circle().stroke(Mdr.line, lineWidth: 4)
            Circle().trim(from: 0, to: Double(pct) / 100)
                .stroke(Mdr.goldLight, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Fmt.count(pct))٪").font(Mdr.font(15, black: true))
        }
        .padding(4)
        .frame(width: 72, height: 72)
        .accessibilityLabel("\(Fmt.count(pct))٪ من السنة مضت")
    }
}

/// علامةُ مدار: مدارٌ ذهبيٌّ حول نقطة.
struct BrandMark: View {
    var size: CGFloat = 26
    var body: some View {
        ZStack {
            Circle().fill(Mdr.goldw)
            Circle().stroke(Mdr.goldLight, lineWidth: 1.4).padding(size * 0.2)
            Circle().fill(Mdr.goldLight).frame(width: size * 0.2, height: size * 0.2)
        }
        .frame(width: size, height: size)
    }
}
