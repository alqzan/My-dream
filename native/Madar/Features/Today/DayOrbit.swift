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

    /// نسبة موضعٍ زمنيّ من مدى الفجر→العشاء.
    private func frac(_ d: Date) -> Double {
        guard let f = fajr, let i = isha, i > f else { return 0 }
        return max(0, min(1, d.timeIntervalSince(f) / i.timeIntervalSince(f)))
    }

    /// نقطةٌ على نصف قطعٍ ناقص: الفجر على اليمين (بداية القراءة العربية) والعشاء يساراً.
    private func point(_ t: Double, in size: CGSize) -> CGPoint {
        let a = Double.pi * t
        let cx = size.width / 2, rx = size.width / 2 - 22
        let base = size.height - 18, ry = size.height - 40
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
                            .position(x: pt.x, y: pt.y + 24)
                    }
                }
            }
        }
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
