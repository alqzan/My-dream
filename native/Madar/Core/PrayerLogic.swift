import Foundation

/// حساباتُ الصلاة النقيّة (`prayerExtras.ts` و`getPrayerStreak`).
enum PrayerLogic {
    static func log(_ logs: [PrayerLog], _ date: String) -> PrayerLog? { logs.first { $0.date == date } }

    /// ما عليك من الفوائت = «فائتة» المسجّلة + دَينٌ سابق لتسجيلك.
    static func qadaOwed(_ logs: [PrayerLog], backlog: Int) -> Int {
        var n = max(0, backlog)
        for l in logs { for p in Prayer.allCases where l.status(p) == .missed { n += 1 } }
        return n
    }

    static func qadaDone(_ logs: [PrayerLog], on date: String) -> Int {
        guard let l = log(logs, date) else { return 0 }
        return Prayer.allCases.filter { l.status($0) == .qada }.count
    }

    /// أقدمُ فائتةٍ لم تُقضَ — داخل اليوم بترتيب الفروض.
    static func oldestMissed(_ logs: [PrayerLog]) -> (date: String, prayer: Prayer)? {
        let days = logs.filter { l in Prayer.allCases.contains { l.status($0) == .missed } }.sorted { $0.date < $1.date }
        guard let d = days.first, let p = Prayer.allCases.first(where: { d.status($0) == .missed }) else { return nil }
        return (d.date, p)
    }

    /// سلسلةُ الأيام المتتالية التي أُدّيت فيها الخمسُ كلُّها (`calcStreak`):
    /// اليومُ الجاري إن لم يكتمل بعد لا يكسرها.
    static func streak(_ logs: [PrayerLog], today: String = DateKey.today(), mosqueOnly: Bool = false) -> Int {
        let full = Set(logs.filter { l in
            Prayer.allCases.allSatisfy { mosqueOnly ? l.status($0) == .jamaah : l.status($0).isPrayed }
        }.map(\.date))
        return streak(of: full, today: today)
    }

    static func streak(of days: Set<String>, today: String) -> Int {
        var cursor = today
        var n = 0
        for i in 0..<(days.count + 2) {
            if days.contains(cursor) { n += 1 }
            else if i != 0 { break }
            cursor = DateKey.adding(days: -1, to: cursor)
        }
        return n
    }

    /// نسبةُ أداء كلّ فرضٍ على آخر `days` يوماً مسجّلاً.
    static func consistency(_ logs: [PrayerLog], lastDays: Int, today: String = DateKey.today()) -> [Prayer: Double] {
        let from = DateKey.adding(days: -(lastDays - 1), to: today)
        let window = logs.filter { $0.date >= from && $0.date <= today }
        var r: [Prayer: Double] = [:]
        for p in Prayer.allCases {
            r[p] = window.isEmpty ? 0 : Double(window.filter { $0.status(p).isPrayed }.count) / Double(lastDays)
        }
        return r
    }

    /// متوسّط الخشوع (١..٣) على نافذة، أو nil بلا درجات.
    static func khushuAverage(_ logs: [PrayerLog], lastDays: Int, today: String = DateKey.today()) -> Double? {
        let from = DateKey.adding(days: -(lastDays - 1), to: today)
        var sum = 0, n = 0
        for l in logs where l.date >= from && l.date <= today {
            for p in Prayer.allCases { if let k = l.khushu(p) { sum += k.rawValue; n += 1 } }
        }
        return n == 0 ? nil : Double(sum) / Double(n)
    }
}

extension Store {
    func prayerLog(_ date: String) -> PrayerLog { PrayerLogic.log(data.prayerLogs, date) ?? PrayerLog(date: date) }

    func editPrayerLog(_ date: String, _ change: (inout PrayerLog) -> Void) {
        update { d in
            if let i = d.prayerLogs.firstIndex(where: { $0.date == date }) {
                change(&d.prayerLogs[i])
            } else {
                var l = PrayerLog(date: date)
                change(&l)
                d.prayerLogs.append(l)
            }
        }
    }

    func setPrayer(_ p: Prayer, _ s: PrayerStatus, on date: String) {
        editPrayerLog(date) { $0.setStatus(s, p) }
        if s.isPrayed { Haptic.success() } else { Haptic.tap() }
    }

    func setKhushu(_ p: Prayer, _ k: Khushu?, on date: String) {
        editPrayerLog(date) { $0.setKhushu(k, p) }
        Haptic.tap()
    }

    /// «اقضِ واحدة»: تُفضَّل الفائتة المسجّلة (تحمل يومها وفرضها) على الدَّين المجرّد.
    @discardableResult
    func doQada() -> Bool {
        if let t = PrayerLogic.oldestMissed(data.prayerLogs) {
            editPrayerLog(t.date) { $0.setStatus(.qada, t.prayer) }
            Haptic.success()
            return true
        }
        if data.qadaBacklog > 0 {
            update { $0.qadaBacklog -= 1 }
            Haptic.success()
            return true
        }
        return false
    }
}
