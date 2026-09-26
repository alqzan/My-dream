import XCTest
@testable import Madar

final class DateKeyTests: XCTestCase {
    func testRoundTrip() {
        XCTAssertEqual(DateKey.adding(days: 1, to: "2026-02-28"), "2026-03-01")
        XCTAssertEqual(DateKey.days(from: "2026-09-01", to: "2026-09-26"), 25)
        XCTAssertTrue(DateKey.isValid("2026-09-26"))
        XCTAssertFalse(DateKey.isValid("2026-02-30"))
    }
}

final class PrayerTests: XCTestCase {
    func testRiyadhTimesAreOrderedAndPlausible() {
        let day = DateKey.date("2026-09-26")!
        let t = PrayerTimes.compute(for: day, lat: 24.7136, lng: 46.6753)!
        let order = Prayer.allCases.map { t[$0]! }
        XCTAssertEqual(order, order.sorted())
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Asia/Riyadh")!
        // الظهر في الرياض قرابة ١١:٤٥ بتوقيتها.
        let dhuhr = cal.dateComponents([.hour, .minute], from: t[.dhuhr]!)
        XCTAssertEqual(dhuhr.hour, 11)
        XCTAssertEqual(DateKey.days(from: "2026-09-26", to: "2026-09-26"), 0)
    }

    func testQadaPrefersRecordedMissed() {
        var a = PrayerLog(date: "2026-09-20"); a.setStatus(.missed, .asr)
        var b = PrayerLog(date: "2026-09-18"); b.setStatus(.missed, .isha); b.setStatus(.missed, .fajr)
        XCTAssertEqual(PrayerLogic.qadaOwed([a, b], backlog: 2), 5)
        let t = PrayerLogic.oldestMissed([a, b])!
        XCTAssertEqual(t.date, "2026-09-18")
        XCTAssertEqual(t.prayer, .fajr)
    }

    func testKhushuDroppedWhenNotPrayed() {
        var l = PrayerLog(date: "2026-09-26")
        l.setStatus(.jamaah, .fajr)
        l.setKhushu(.humble, .fajr)
        XCTAssertEqual(l.khushu(.fajr), .humble)
        l.setStatus(.missed, .fajr)
        XCTAssertNil(l.khushu(.fajr))
    }

    func testStreakToleratesUnfinishedToday() {
        var logs: [PrayerLog] = []
        for d in ["2026-09-23", "2026-09-24", "2026-09-25"] {
            var l = PrayerLog(date: d)
            for p in Prayer.allCases { l.setStatus(.alone, p) }
            logs.append(l)
        }
        XCTAssertEqual(PrayerLogic.streak(logs, today: "2026-09-26"), 3)
    }
}

final class BudgetTests: XCTestCase {
    private func tx(_ date: String, _ amount: Double, split: String? = nil, off: Bool = false) -> Transaction {
        var t = Transaction.new(date: date, amount: amount, category: "cat-essentials", note: "")
        if let s = split { t.setReserveSplits([(s, 100)]) }
        t.offBudget = off
        return t
    }

    func testDailyBudgetIsCumulative() {
        let b = DailyBudget(amount: 100, startDate: "2026-09-24")
        let s = BudgetEngine.status(b, [tx("2026-09-24", 50), tx("2026-09-25", 180)], today: "2026-09-26")
        XCTAssertEqual(s.days, 3)
        XCTAssertEqual(s.allowance, 300)
        XCTAssertEqual(s.balance, 70)
    }

    func testEnvelopeAndOffBudgetDoNotTouchDaily() {
        let b = DailyBudget(amount: 100, startDate: "2026-09-26")
        let s = BudgetEngine.status(b, [tx("2026-09-26", 500, split: "f1"), tx("2026-09-26", 40, off: true)], today: "2026-09-26")
        XCTAssertEqual(s.spent, 0)
        var f = ReserveFund.new(name: "سفر", icon: "✈️", target: nil)
        f.raw.put("id", "f1")
        f.addDeposit(amount: 800, date: "2026-09-01", note: nil)
        XCTAssertEqual(BudgetEngine.reserveBalance(f, [tx("2026-09-26", 500, split: "f1")]), 300)
    }

    func testFundingDripReducesRate() {
        var b = DailyBudget(amount: 100, startDate: "2026-09-26")
        b.fundingPerDay = 30
        XCTAssertEqual(BudgetEngine.status(b, [], today: "2026-09-26").rate, 70)
    }

    func testOffsetStopsAtThreeDays() {
        XCTAssertEqual(BudgetEngine.offsetPlan(balance: -250, surplus: 1000, daily: 100, enabled: true).amount, 250)
        XCTAssertEqual(BudgetEngine.offsetPlan(balance: -350, surplus: 1000, daily: 100, enabled: true).reason, .tooBig)
        XCTAssertEqual(BudgetEngine.offsetPlan(balance: -50, surplus: 20, daily: 100, enabled: true).reason, .partial)
    }

    func testSalaryDates() {
        XCTAssertEqual(BudgetEngine.lastSalaryDate(27, "2026-09-26"), "2026-08-27")
        XCTAssertEqual(BudgetEngine.nextSalaryDate(27, "2026-09-26"), "2026-09-27")
        XCTAssertEqual(BudgetEngine.lastSalaryDate(31, "2026-02-28"), "2026-02-28")
        XCTAssertEqual(BudgetEngine.salaryCycleKey(27, "2026-09-26"), "2026-09-27")
    }
}

final class HifzTests: XCTestCase {
    func testEarlyMasteryDoesNotEscalate() {
        let p = HifzPreset.all["balanced"]!
        let c = Hifz.Cursor(interval: 7, ease: 1, lastDate: "2026-09-25")
        let r = Hifz.applyRating(c, 3, "2026-09-26", p)
        XCTAssertTrue(r.early)
        XCTAssertEqual(r.interval, 7)
    }

    func testNewPageGoesThroughGoodDaysFirst() {
        let p = HifzPreset.all["balanced"]!
        let r = Hifz.applyRating(Hifz.Cursor(interval: 0, ease: 1, lastDate: nil), 3, "2026-09-26", p)
        XCTAssertEqual(r.interval, 3)
    }

    func testPortionEndPage() {
        XCTAssertEqual(Hifz.portionEnd(1, unit: "page", amount: 1), 7)
        XCTAssertEqual(Hifz.portionEnd(8, unit: "ayah", amount: 5), 12)
    }
}

final class BackupTests: XCTestCase {
    func testPlainBackupKeepsUnknownFields() throws {
        let json = #"{"__meta":{"app":"madar"},"prayerLogs":[{"date":"2026-09-26","prayers":{"الفجر":"جماعة"}}],"books":[{"id":"b1","title":"x"}],"journalEntries":[],"transactions":[],"lastUpdated":"x"}"#
        let d = try Backup.read(Data(json.utf8), password: nil)
        XCTAssertEqual(d.prayerLogs.first?.status(.fajr), .jamaah)
        let out = try JSONDecoder().decode(RawObject.self, from: Backup.export(d))
        XCTAssertEqual(out.objects("books").first?.str("title"), "x")
    }
}
