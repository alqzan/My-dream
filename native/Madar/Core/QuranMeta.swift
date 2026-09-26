import Foundation

/// بنية المصحف: ١١٤ سورة، ٣٠ جزءاً، ٦٠٤ وجهاً، ٦٢٣٦ آية — معرّفٌ عامّ ١..٦٢٣٦
/// بترتيب المصحف (منقولٌ من `src/lib/quran/meta.ts`).
enum QuranMeta {
    static let totalAyat = 6236
    static let totalPages = 604
    static let totalJuz = 30

    struct Surah: Identifiable { let num: Int, name: String, ayat: Int, first: Int, meccan: Bool; var id: Int { num } }

    static let surahs: [Surah] = QuranData.surahs.enumerated().map {
        Surah(num: $0.offset + 1, name: $0.element.name, ayat: $0.element.ayat, first: $0.element.first, meccan: $0.element.meccan)
    }
    private static let surahFirsts = surahs.map(\.first)

    static func surah(_ n: Int) -> Surah? { (1...114).contains(n) ? surahs[n - 1] : nil }

    /// أكبر فهرس `i` بحيث `starts[i] <= id`.
    static func lastLE(_ starts: [Int], _ id: Int) -> Int {
        var lo = 0, hi = starts.count - 1, ans = 0
        while lo <= hi {
            let mid = (lo + hi) / 2
            if starts[mid] <= id { ans = mid; lo = mid + 1 } else { hi = mid - 1 }
        }
        return ans
    }

    static func id(surah n: Int, ayah: Int) -> Int { (QuranMeta.surah(n)?.first ?? 1) + ayah - 1 }
    static func surahAyah(_ id: Int) -> (surah: Int, ayah: Int) {
        let s = surahs[lastLE(surahFirsts, id)]
        return (s.num, id - s.first + 1)
    }
    static func juz(ofAyah id: Int) -> Int { lastLE(QuranData.juzStarts, id) + 1 }
    static func page(ofAyah id: Int) -> Int { lastLE(QuranData.pageStarts, id) + 1 }

    static func pageRange(_ p: Int) -> ClosedRange<Int> {
        let p = min(max(p, 1), totalPages)
        let start = QuranData.pageStarts[p - 1]
        let end = p < totalPages ? QuranData.pageStarts[p] - 1 : totalAyat
        return start...end
    }
    static func juzStartPage(_ j: Int) -> Int { page(ofAyah: QuranData.juzStarts[min(max(j, 1), 30) - 1]) }

    /// عدد الأجزاء التي يُضيئها بلوغُ صفحة — جزءُ آخر آيةٍ فيها (`khatmaJuzForPage`).
    static func juzCompleted(page: Int) -> Int {
        guard page > 0 else { return 0 }
        return juz(ofAyah: pageRange(page).upperBound)
    }

    static func describe(_ start: Int, _ end: Int) -> String {
        let a = surahAyah(start), b = surahAyah(end)
        let na = surahs[a.surah - 1].name
        if a.surah == b.surah {
            let s = surahs[a.surah - 1]
            if a.ayah == 1 && b.ayah == s.ayat { return s.name }
            return a.ayah == b.ayah ? "\(na) \(Fmt.count(a.ayah))" : "\(na) \(Fmt.count(a.ayah))–\(Fmt.count(b.ayah))"
        }
        return "\(na) \(Fmt.count(a.ayah)) – \(surahs[b.surah - 1].name) \(Fmt.count(b.ayah))"
    }

    /// اسمُ أوّل سورةٍ في الوجه — عنوانُ الصفحة.
    static func pageTitle(_ p: Int) -> String {
        surahs[surahAyah(pageRange(p).lowerBound).surah - 1].name
    }
}

/// تقدير إتمام الختمة على الوتيرة الأخيرة (`khatmaEta`): آخر ١٤ يوماً، ثمّ ٣٠،
/// ثمّ منذ البداية.
enum KhatmaMath {
    static func eta(page: Int, startDate: String?, today: String, log: [(date: String, page: Int)]) -> (perDay: Double, daysLeft: Int?) {
        guard page > 0 else { return (0, nil) }
        func pace(_ window: Int, _ minDays: Int) -> Double? {
            let cutoff = DateKey.adding(days: -window, to: today)
            let within = log.filter { $0.date >= cutoff && $0.date <= today }.sorted { $0.date < $1.date }
            guard let base = within.first else { return nil }
            let days = DateKey.days(from: base.date, to: today)
            let delta = page - base.page
            guard days >= minDays, delta > 0 else { return nil }
            return Double(delta) / Double(days)
        }
        var perDay = pace(14, 3) ?? pace(30, 5) ?? 0
        if perDay == 0, let s = startDate {
            let days = max(1, DateKey.days(from: s, to: today) + 1)
            if days >= 3 && page >= 10 { perDay = Double(page) / Double(days) }
        }
        let enough = perDay > 0 && page >= 10
        let remaining = QuranMeta.totalPages - min(page, QuranMeta.totalPages)
        return (perDay, enough && remaining > 0 ? Int((Double(remaining) / perDay).rounded(.up)) : nil)
    }

    static func pagesRead(log: [(date: String, page: Int)], on day: String, currentPage: Int) -> Int {
        let prior = log.filter { $0.date < day }.max { $0.date < $1.date }?.page ?? 0
        return max(0, currentPage - prior)
    }
}

/// نصّ الآيات (رسمٌ عثمانيّ) من `ayahText.json` — يُحمَّل مرّةً عند أوّل طلب.
enum AyahText {
    private static let all: [String] = {
        guard let url = Bundle.main.url(forResource: "ayahText", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let list = try? JSONDecoder().decode([String].self, from: data) else { return [] }
        return list
    }()
    static func text(_ id: Int) -> String { all.indices.contains(id) ? all[id] : "" }
    static var isAvailable: Bool { all.count > QuranMeta.totalAyat }
}
