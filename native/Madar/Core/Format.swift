import Foundation

/// منسّقات العرض. نظامُ الأرقام مثبّتٌ هندياً في كلّ منسّق (`@numbers=arab`)
/// والتقويمُ ميلاديّ صراحةً — كقاعدة الويب.
enum Fmt {
    static let arabicLocale = Locale(identifier: "ar@numbers=arab")

    private static let amountFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = arabicLocale
        f.numberStyle = .decimal
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 2
        return f
    }()

    static func amount(_ v: Double) -> String {
        amountFormatter.string(from: NSNumber(value: v)) ?? Digits.indic(String(v))
    }

    static func count(_ n: Int) -> String { Digits.indic(String(n)) }

    private static func formatter(_ template: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = arabicLocale
        f.calendar = Calendar(identifier: .gregorian)
        f.setLocalizedDateFormatFromTemplate(template)
        return f
    }

    private static let clockF = formatter("jmm")
    private static let dayMonthF = formatter("EEEEdMMMM")
    private static let shortDateF = formatter("dMMMy")
    private static let monthYearF = formatter("MMMMy")

    static func clock(_ d: Date) -> String { clockF.string(from: d) }
    static func dayMonth(_ d: Date) -> String { dayMonthF.string(from: d) }
    static func shortDate(_ d: Date) -> String { shortDateF.string(from: d) }
    static func monthYear(_ d: Date) -> String { monthYearF.string(from: d) }

    static func shortDate(key: String) -> String {
        DateKey.date(key).map(shortDate) ?? Digits.indic(key)
    }

    static func hijri(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = arabicLocale
        f.calendar = Calendar(identifier: .islamicUmmAlQura)
        f.setLocalizedDateFormatFromTemplate("dMMMMy")
        return f.string(from: d)
    }
}

/// تقريبٌ عند الحدود لمبالغ المال — `round2` في الويب.
func round2(_ v: Double) -> Double { (v * 100).rounded() / 100 }
