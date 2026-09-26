import Foundation

/// المواقيت الخمسة محلياً بلا شبكة — نقلٌ حرفيّ لـ`computePrayerTimes` في الويب:
/// اصطلاح أمّ القرى (الفجر ١٨٫٥°، العشاء بعد المغرب بتسعين دقيقة، العصر بظلّ
/// المثل). يُرجع nil قرب القطبين.
enum PrayerTimes {
    static let fallback = (lat: 24.7136, lng: 46.6753) // الرياض

    private static let rad = Double.pi / 180

    private static func solar(_ date: Date) -> (eqTime: Double, decl: Double) {
        let cal = Calendar(identifier: .gregorian)
        let dayOfYear = Double(cal.ordinality(of: .day, in: .year, for: date) ?? 1)
        let hour = Double(cal.component(.hour, from: date))
        let g = (2 * Double.pi / 365) * (dayOfYear - 1 + (hour - 12) / 24)
        let eq = 229.18 * (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g))
        let decl = 0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2 * g)
            + 0.000907 * sin(2 * g) - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g)
        return (eq, decl)
    }

    private static func hourAngle(_ zenith: Double, _ lat: Double, _ decl: Double) -> Double? {
        let c = (cos(zenith * rad) - sin(lat * rad) * sin(decl)) / (cos(lat * rad) * cos(decl))
        guard c >= -1, c <= 1 else { return nil }
        return acos(c) / rad
    }

    private static func utc(_ date: Date, minutes: Double) -> Date {
        var cal = Calendar(identifier: .gregorian)
        let local = cal.dateComponents([.year, .month, .day], from: date)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let dayStart = cal.date(from: local) ?? date
        return dayStart.addingTimeInterval(minutes * 60)
    }

    /// `date` يُفسَّر يوماً محلياً (منتصف ليله).
    static func compute(for date: Date, lat: Double, lng: Double) -> [Prayer: Date]? {
        let (eq, decl) = solar(date)
        let noon = 720 - 4 * lng - eq
        guard let haSunset = hourAngle(90.833, lat, decl), let haFajr = hourAngle(90 + 18.5, lat, decl) else { return nil }
        let noonAlt = abs(lat * rad - decl)
        let asrAlt = atan(1 / (1 + tan(noonAlt)))
        guard let haAsr = hourAngle(90 - asrAlt / rad, lat, decl) else { return nil }
        let maghrib = noon + 4 * haSunset
        return [
            .fajr: utc(date, minutes: noon - 4 * haFajr),
            .dhuhr: utc(date, minutes: noon),
            .asr: utc(date, minutes: noon + 4 * haAsr),
            .maghrib: utc(date, minutes: maghrib),
            .isha: utc(date, minutes: maghrib + 90),
        ]
    }

    static func sunrise(for date: Date, lat: Double, lng: Double) -> Date? {
        let (eq, decl) = solar(date)
        guard let ha = hourAngle(90.833, lat, decl) else { return nil }
        return utc(date, minutes: 720 - 4 * lng - eq - 4 * ha)
    }

    /// الصلاة الحاضرة الآن (آخر ما دخل وقته) والتالية.
    static func current(_ times: [Prayer: Date], now: Date = Date()) -> (current: Prayer?, next: Prayer?) {
        let ordered = Prayer.allCases.compactMap { p in times[p].map { (p, $0) } }
        let past = ordered.filter { $0.1 <= now }
        return (past.last?.0, ordered.first { $0.1 > now }?.0)
    }
}
