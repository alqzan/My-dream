import SwiftUI

/// **سؤالا تسجيل الصلاة — المصدر الوحيد** (كـ`PrayerAnswer` في الويب):
/// «صلَّيتَ الفجر؟» بحالاتها الأربع، ثمّ «وكيف كان قلبُك فيها؟». يُستعمل في
/// صفحة الصلاة ومحرّر الأيام الماضية واليوم، فلا تُكتب نسخةٌ ثانية.
struct PrayerAnswer: View {
    let prayer: Prayer
    var when: String? = nil
    var timeLabel: String? = nil
    let status: PrayerStatus
    let khushu: Khushu?
    let onStatus: (PrayerStatus) -> Void
    let onKhushu: (Khushu?) -> Void

    struct Choice: Identifiable { let status: PrayerStatus, label: String, hint: String; var id: String { status.rawValue } }
    static let states: [Choice] = [
        Choice(status: .jamaah, label: "في جماعة", hint: "مع الناس"),
        Choice(status: .alone, label: "وحدي", hint: "في وقتها"),
        Choice(status: .qada, label: "قضاءً", hint: "بعد وقتها"),
        Choice(status: .missed, label: "فاتتني", hint: "تُعَدُّ عليك"),
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("صلَّيتَ \(prayer.rawValue)\(when.map { " \($0)" } ?? "")؟").font(Mdr.font(20, black: true))
                Spacer()
                if let t = timeLabel { Text(t).font(.mdrSubheadline).foregroundStyle(Mdr.ink52) }
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                ForEach(Self.states) { choice in
                    let on = status == choice.status
                    let c = PrayerView.tone(choice.status)
                    Button {
                        onStatus(on ? .none : choice.status)
                    } label: {
                        VStack(spacing: 2) {
                            Text(choice.label).font(.mdrSubheadline.weight(.semibold))
                            Text(choice.hint).font(.mdrCaption2).opacity(0.8)
                        }
                        .frame(maxWidth: .infinity, minHeight: 52)
                        .foregroundStyle(on ? .white : Mdr.ink)
                        .background(on ? c : Mdr.paper2, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(on ? c : Mdr.line))
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(on ? .isSelected : [])
                    .accessibilityIdentifier("status.\(String(describing: choice.status))")
                }
            }
            if status.isPrayed {
                VStack(alignment: .leading, spacing: 8) {
                    Text("وكيف كان قلبُك فيها؟").font(.mdrSubheadline).foregroundStyle(Mdr.ink52)
                    HStack(spacing: 8) {
                        ForEach(Khushu.allCases) { k in
                            let on = khushu == k
                            let c = Color(hex: k.colorHex)
                            Button { onKhushu(on ? nil : k) } label: {
                                VStack(spacing: 2) {
                                    Text(k.label).font(.mdrSubheadline.weight(.semibold))
                                    Text(k.hint).font(.mdrCaption2).lineLimit(1).minimumScaleFactor(0.8).opacity(0.8)
                                }
                                .frame(maxWidth: .infinity, minHeight: 48)
                                .foregroundStyle(on ? .white : c)
                                .background(on ? c : Mdr.paper2, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(on ? c : c.opacity(0.5)))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("khushu.\(k.rawValue)")
                        }
                    }
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .animation(.snappy, value: status)
    }
}
