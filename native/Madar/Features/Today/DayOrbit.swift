import SwiftUI

/// **مدار اليوم** — العنصر اللافت الوحيد في التطبيق.
/// قوسٌ من الفجر إلى العشاء (يومُ المصلّي لا يومُ الفلكيّ)، خرزاتُ الفروض
/// الخمسة في مواقيتها الحقيقية ملوّنةٌ بحالتها، والشمسُ في موضعها الآن.
/// الضغطُ على خرزةٍ يسأل عن صلاتها.
struct DayOrbit: View {
    let now: Date
    let times: [Prayer: Date]
    let sunrise: Date?
    let log: PrayerLog
    let onTap: (Prayer) -> Void

    private var fajr: Date? { times[.fajr] }
    private var isha: Date? { times[.isha] }

    /// أقلُّ مسافةٍ بين خرزتين (نسبةً من القوس): المغربُ والعشاءُ بينهما ساعةٌ ونصف
    /// فقط، فبمواقيتهما الحرفية تتراكبان. نُبعد الخرزات قليلاً ونطوي الزمن بينها
    /// خطّياً، فتبقى الشمسُ بين الفرضين اللذين هي بينهما فعلاً.
    private static let minGap = 0.17

    /// عُقدُ الطيّ: (وقتٌ حقيقيّ، موضعٌ على القوس) لكلّ فرضٍ معروف الوقت.
    private struct Knot { let time: Date; let pos: Double }
    private var knots: [Knot] {
        let ps = Prayer.allCases.compactMap { p in times[p].map { (p, $0) } }
        guard let f = fajr, let i = isha, i > f, ps.count >= 2 else { return [] }
        let raw = ps.map { max(0, min(1, $0.1.timeIntervalSince(f) / i.timeIntervalSince(f))) }
        var w = raw
        for k in 1..<w.count { w[k] = max(w[k], w[k - 1] + Self.minGap) }
        w[w.count - 1] = 1
        for k in stride(from: w.count - 2, through: 0, by: -1) { w[k] = min(w[k], w[k + 1] - Self.minGap) }
        w[0] = 0
        return zip(ps, w).map { pair, pos in Knot(time: pair.1, pos: pos) }
    }

    /// موضعُ لحظةٍ على القوس [٠، ١] بعد الطيّ.
    private func frac(_ d: Date) -> Double {
        let k = knots
        guard let first = k.first, let last = k.last else { return 0 }
        if d <= first.time { return 0 }
        if d >= last.time { return 1 }
        for j in 1..<k.count where d <= k[j].time {
            let a = k[j - 1], b = k[j]
            let span = b.time.timeIntervalSince(a.time)
            let t = span > 0 ? d.timeIntervalSince(a.time) / span : 0
            return a.pos + (b.pos - a.pos) * t
        }
        return 1
    }

    /// نقطةٌ على نصف قطعٍ ناقص: الفجر على اليمين (بداية القراءة العربية) والعشاء يساراً.
    /// `inset` يُقرّب النقطة نحو المركز — للتسميات داخل القوس فلا تخرج من الإطار.
    private func point(_ t: Double, in size: CGSize, inset: CGFloat = 0) -> CGPoint {
        let a = Double.pi * t
        let cx = size.width / 2, rx = size.width / 2 - 22 - inset
        let base = size.height - 18, ry = size.height - 40 - inset
        return CGPoint(x: cx + rx * cos(a), y: base - ry * sin(a))
    }

    var body: some View {
        let nowF = frac(now)
        let beforeDawn = fajr.map { now < $0 } ?? true
        let afterIsha = isha.map { now > $0 } ?? false
        GeometryReader { geo in
            let size = geo.size
            ZStack {
                // الأرض
                Path { p in
                    p.move(to: CGPoint(x: 8, y: size.height - 18))
                    p.addLine(to: CGPoint(x: size.width - 8, y: size.height - 18))
                }
                .stroke(Color.secondary.opacity(0.25), style: StrokeStyle(lineWidth: 1, dash: [2, 4]))

                // المدار كاملاً ثمّ ما مضى منه
                orbitPath(from: 0, to: 1, size: size)
                    .stroke(Theme.prayer.opacity(0.15), style: StrokeStyle(lineWidth: 3, lineCap: .round))
                orbitPath(from: 0, to: nowF, size: size)
                    .stroke(LinearGradient(colors: [Theme.prayer.opacity(0.5), Theme.brand], startPoint: .trailing, endPoint: .leading),
                            style: StrokeStyle(lineWidth: 3, lineCap: .round))

                // الشمس
                if !beforeDawn && !afterIsha {
                    let s = point(nowF, in: size)
                    Circle()
                        .fill(RadialGradient(colors: [Theme.brand, Theme.brand.opacity(0)], center: .center, startRadius: 2, endRadius: 22))
                        .frame(width: 44, height: 44)
                        .position(s)
                    Circle().fill(Theme.brand).frame(width: 14, height: 14).position(s)
                }

                // خرزات الفروض
                ForEach(Prayer.allCases) { p in
                    if let t = times[p] {
                        let pt = point(frac(t), in: size)
                        let st = log.status(p)
                        let due = t <= now && st == .none
                        Button { onTap(p) } label: {
                            ZStack {
                                Circle().fill(Color(.systemBackground)).frame(width: 30, height: 30)
                                Circle()
                                    .fill(st == .none ? Color.clear : Color(hex: st.colorHex))
                                    .overlay(Circle().stroke(st == .none ? (due ? Theme.prayer : Color.secondary.opacity(0.4)) : .clear,
                                                             style: StrokeStyle(lineWidth: 2, dash: due ? [] : [3, 3])))
                                    .frame(width: 22, height: 22)
                                if st.isPrayed { Image(systemName: "checkmark").font(.system(size: 10, weight: .bold)).foregroundStyle(.white) }
                            }
                            .contentShape(Circle().inset(by: -8))
                        }
                        .buttonStyle(.plain)
                        .position(pt)
                        .accessibilityLabel("\(p.rawValue): \(st.label)")
                        Text(p.rawValue)
                            .font(.caption2.weight(due ? .bold : .regular))
                            .foregroundStyle(due ? Theme.prayer : .secondary)
                            .fixedSize()
                            .position(point(frac(t), in: size, inset: 34))
                    }
                }
            }
        }
        // الإحداثياتُ هنا حرفية (الفجر يميناً)؛ بيئةُ RTL كانت تعكسها فيصير الفجرُ يساراً.
        .environment(\.layoutDirection, .leftToRight)
        .frame(height: 170)
        .animation(.easeInOut(duration: 0.6), value: log.prayedCount)
    }

    private func orbitPath(from a: Double, to b: Double, size: CGSize) -> Path {
        Path { p in
            guard b > a else { return }
            let steps = 60
            for i in 0...steps {
                let t = a + (b - a) * Double(i) / Double(steps)
                let pt = point(t, in: size)
                if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
            }
        }
    }
}
