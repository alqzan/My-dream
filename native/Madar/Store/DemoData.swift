import Foundation

/// بياناتٌ تجريبية لالتقاط صور الواجهة في CI (`-demo`). لا تُكتب أبداً فوق
/// بيانات المالك: المتجر في هذا الوضع يحفظ في ملفٍّ مؤقّت.
enum DemoData {
    static var isOn: Bool { ProcessInfo.processInfo.arguments.contains("-demo") }

    static func make(today: String = DateKey.today()) -> AppData {
        var d = AppData()
        let statuses: [PrayerStatus] = [.jamaah, .alone, .jamaah, .qada, .jamaah]
        for back in 0..<40 {
            let day = DateKey.adding(days: -back, to: today)
            var l = PrayerLog(date: day)
            for (i, p) in Prayer.allCases.enumerated() {
                if back == 0 && i >= 3 { continue }
                let s: PrayerStatus = (back % 9 == 4 && i == 0) ? .missed : statuses[(i + back) % statuses.count]
                l.setStatus(s, p)
                if s.isPrayed { l.setKhushu(Khushu(rawValue: 1 + (i + back) % 3), p) }
            }
            if back % 2 == 0 { l.setSunan(8) }
            d.prayerLogs.append(l)
        }
        let notes = ["يومٌ هادئ. قرأتُ في الصباح ومشيتُ بعد العصر مع أبي، وتحدّثنا عن السفر القادم.",
                     "اجتماعٌ طويل، لكنّ المساء كان جميلاً: عشاءٌ مع الأصدقاء في الحيّ القديم.",
                     "بدأتُ كتاباً جديداً عن العادات. فكرةٌ واحدة بقيت معي: ابدأ صغيراً جداً.",
                     "زيارة الجدّة، وقهوةٌ على السطح وقت الغروب."]
        for i in 0..<12 {
            var e = JournalEntry.new(date: DateKey.adding(days: -i * 2, to: today))
            e.title = ["مشيٌ بعد العصر", "عشاء الأصدقاء", "كتابٌ جديد", "عند الجدّة"][i % 4]
            e.content = notes[i % notes.count]
            e.mood = [4, 5, 3, 4][i % 4]
            e.tags = i % 3 == 0 ? ["عائلة"] : ["يومي"]
            d.journalEntries.append(e)
        }
        d.dailyBudget = DailyBudget(amount: 120, startDate: DateKey.adding(days: -9, to: today))
        d.rest.put("salaryDay", 27)
        let spend: [(String, Double, String)] = [("cat-luxuries", 18, "ستاربكس"), ("cat-essentials", 146.5, "الدانوب"),
                                                 ("cat-essentials", 90, "محطة ساسكو"), ("cat-luxuries", 62, "البيك"),
                                                 ("cat-charity", 50, "إحسان"), ("cat-luxuries", 34, "بارنز")]
        for i in 0..<18 {
            let s = spend[i % spend.count]
            d.transactions.append(Transaction.new(date: DateKey.adding(days: -(i / 2), to: today), amount: s.1, category: s.0, note: s.2))
        }
        var trip = ReserveFund.new(name: "سفرة الصيف", icon: "✈️", target: 6000)
        trip.addDeposit(amount: 2400, date: DateKey.adding(days: -60, to: today), note: "تمويل الدورة")
        trip.setFunding(perCycle: 800, source: "salary", stop: "target")
        var rent = ReserveFund.new(name: "الإيجار", icon: "🏠", target: nil)
        rent.addDeposit(amount: 3000, date: DateKey.adding(days: -20, to: today), note: nil)
        var surplus = ReserveFund.new(name: "الفوائض", icon: "✨", target: nil)
        surplus.raw.put("role", "surplus")
        surplus.addDeposit(amount: 640, date: DateKey.adding(days: -9, to: today), note: "فوائض دورة الراتب")
        d.reserves = [surplus, trip, rent]
        d.budgets = [Budget(raw: ["category": .string("cat-luxuries"), "limit": .number(900)]),
                     Budget(raw: ["category": .string("cat-essentials"), "limit": .number(2500)])]
        var k = d.khatma
        for back in stride(from: 14, through: 0, by: -1) { k.record(page: 312 - back * 11, on: DateKey.adding(days: -back, to: today)) }
        k.completed = 3
        d.khatma = k
        d.quranWird = (1..<9).map { DateKey.adding(days: -$0, to: today) }
        d.quranReflections = [QuranReflection.new(surah: 13, from: 28, to: 28, text: "الطمأنينة ليست غياب القلق، بل حضور الذكر معه.")]
        d.countdownEvents = [CountdownEvent.new(title: "السفر إلى أبها", date: DateKey.adding(days: 23, to: today), emoji: "✈️"),
                             CountdownEvent.new(title: "اختبار الرخصة", date: DateKey.adding(days: 5, to: today), emoji: "🚗")]
        return d
    }
}
