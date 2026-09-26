import Foundation

/// مفاتيح التاريخ `YYYY-MM-DD` بالتقويم الميلاديّ والمنطقة المحلية — مثل
/// `toDateStr`/`parseDate`/`today` في الويب. لا `ISO8601`/UTC: يزيح اليوم في الخليج.
enum DateKey {
    static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }()

    static func string(_ date: Date) -> String {
        let p = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", p.year ?? 0, p.month ?? 0, p.day ?? 0)
    }

    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    static func today(_ now: Date = Date()) -> String { string(now) }

    static func adding(days: Int, to key: String) -> String {
        guard let d = date(key), let r = calendar.date(byAdding: .day, value: days, to: d) else { return key }
        return string(r)
    }

    /// عدد الأيام من `a` إلى `b` (موجبٌ إن كان `b` بعد `a`).
    static func days(from a: String, to b: String) -> Int {
        guard let da = date(a), let db = date(b) else { return 0 }
        return calendar.dateComponents([.day], from: da, to: db).day ?? 0
    }

    static func isValid(_ key: String) -> Bool {
        guard key.count == 10, let d = date(key) else { return false }
        return string(d) == key
    }

    static func nowMs() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }
}
