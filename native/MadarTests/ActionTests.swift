import XCTest
@testable import Madar

/// **أثرُ كلّ زرّ** — الأفعالُ التي تستدعيها الأزرار، على متجرٍ حقيقيٍّ في ملفٍّ
/// مؤقّت: ما يكتبه كلُّ فعل، وما يمنعه، وما يتركه شاهداً للمزامنة.
@MainActor
final class ActionTests: XCTestCase {
    private var store: Store!
    private let today = DateKey.today()

    override func setUp() async throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("madar-test-\(UUID().uuidString).json")
        store = Store(fileURL: url)
        store.replace(with: AppData())
    }

    private var tombstones: RawObject { store.data.rest.obj("deleted") ?? [:] }

    // MARK: الصلاة

    func testLogPrayerThenKhushuThenMissedDropsKhushu() {
        store.setPrayer(.isha, .jamaah, on: today)
        store.setKhushu(.isha, Khushu(rawValue: 3), on: today)
        XCTAssertEqual(store.prayerLog(today).status(.isha), .jamaah)
        XCTAssertEqual(store.prayerLog(today).khushu(.isha)?.rawValue, 3)
        store.setPrayer(.isha, .missed, on: today)
        XCTAssertEqual(store.prayerLog(today).status(.isha), .missed)
        XCTAssertNil(store.prayerLog(today).khushu(.isha), "درجةٌ يتيمةٌ على فرضٍ فات")
    }

    func testQadaPrefersRecordedMissedThenBacklog() {
        let y = DateKey.adding(days: -1, to: today)
        store.setPrayer(.fajr, .missed, on: y)
        store.update { $0.qadaBacklog = 2 }
        XCTAssertTrue(store.doQada())
        XCTAssertEqual(store.prayerLog(y).status(.fajr), .qada, "الفائتةُ المسجّلة أوّلاً")
        XCTAssertEqual(store.data.qadaBacklog, 2)
        XCTAssertTrue(store.doQada())
        XCTAssertEqual(store.data.qadaBacklog, 1)
    }

    func testPrayedCountAndClearing() {
        for p in Prayer.allCases { store.setPrayer(p, .alone, on: today) }
        XCTAssertEqual(store.prayerLog(today).prayedCount, 5)
        store.setPrayer(.asr, .none, on: today)
        XCTAssertEqual(store.prayerLog(today).prayedCount, 4)
    }

    // MARK: القرآن

    func testWirdToggleLeavesTombstoneAndReaddLiftsIt() {
        store.toggleWird(today)
        XCTAssertTrue(store.data.quranWird.contains(today))
        store.toggleWird(today)
        XCTAssertFalse(store.data.quranWird.contains(today))
        XCTAssertNotNil(tombstones["wird:\(today)"], "إلغاءُ الوِرد بلا شاهد يعيده الدمج")
        store.toggleWird(today)
        XCTAssertNil(tombstones["wird:\(today)"])
    }

    func testKhatmaPageGoalAndCompletion() {
        store.setKhatmaPage(40)
        XCTAssertEqual(store.data.khatma.page, 40)
        store.setKhatmaGoal(10)
        XCTAssertEqual(store.data.khatma.dailyPageGoal, 10)
        store.setKhatmaPage(9999)
        XCTAssertEqual(store.data.khatma.page, QuranMeta.totalPages, "الصفحة تُقصّ على ٦٠٤")
        let before = store.data.khatma.completed
        store.completeKhatma()
        XCTAssertEqual(store.data.khatma.completed, before + 1)
        XCTAssertEqual(store.data.khatma.page, 0)
    }

    func testReflectionSaveAndDelete() {
        let r = QuranReflection.new(surah: 13, from: 28, to: 28, text: "تجربة")
        store.saveReflection(r)
        XCTAssertEqual(store.data.quranReflections.count, 1)
        store.deleteReflection(r.id)
        XCTAssertTrue(store.data.quranReflections.isEmpty)
        XCTAssertNotNil(tombstones[r.id])
    }

    // MARK: المذكرات

    func testQuickLinesAppendToOneEntry() {
        store.appendQuickLine("أولى", on: today)
        store.appendQuickLine("  ", on: today)
        store.appendQuickLine("ثانية", on: today)
        let entries = store.data.journalEntries.filter { $0.date == today }
        XCTAssertEqual(entries.count, 1, "السطرُ السريع يُلحق بمذكرة اليوم لا يُنشئ ثانية")
        XCTAssertEqual(entries[0].raw.objects("quickLines").count, 2, "السطرُ الفارغ لا يُسجَّل")
        XCTAssertTrue(entries[0].content.contains("أولى") && entries[0].content.contains("ثانية"))
    }

    // MARK: المال

    private func expense(_ amount: Double, date: String? = nil) -> Transaction {
        Transaction.new(date: date ?? today, amount: amount, category: "cat-essentials", note: "اختبار")
    }

    func testDailyBudgetReflectsExpenseAndDeleteRestores() {
        store.setDailyBudget(amount: 100)
        let t = expense(30)
        store.saveTransaction(t)
        var s = BudgetEngine.status(store.data, today: today)!
        XCTAssertEqual(s.spentToday, 30)
        XCTAssertEqual(s.balance, 70)
        store.deleteTransaction(t.id)
        s = BudgetEngine.status(store.data, today: today)!
        XCTAssertEqual(s.balance, 100)
        XCTAssertNotNil(tombstones[t.id])
    }

    func testSmallDeficitAutoOffsetsFromSurplus() {
        store.setDailyBudget(amount: 100)
        var surplus = ReserveFund.new(name: "الفوائض", icon: "✨", target: nil)
        surplus.raw.put("role", "surplus")
        surplus.addDeposit(amount: 500, date: today, note: nil)
        store.saveFund(surplus)
        store.saveTransaction(expense(250))   // عجزٌ ١٥٠ ≤ ٣ يوميّات
        let s = BudgetEngine.status(store.data, today: today)!
        XCTAssertEqual(s.balance, 0, accuracy: 0.001)
        let fund = store.data.reserves.first { $0.role == "surplus" }!
        XCTAssertEqual(BudgetEngine.reserveBalance(fund, store.data.transactions), 350, accuracy: 0.001)
    }

    func testBigDeficitIsNotOffsetAutomatically() {
        store.setDailyBudget(amount: 100)
        var surplus = ReserveFund.new(name: "الفوائض", icon: "✨", target: nil)
        surplus.raw.put("role", "surplus")
        surplus.addDeposit(amount: 5000, date: today, note: nil)
        store.saveFund(surplus)
        store.saveTransaction(expense(900))   // ٨٠٠ عجزاً > ٣ يوميّات → يُسأل المالك
        XCTAssertEqual(BudgetEngine.status(store.data, today: today)!.balance, -800, accuracy: 0.001)
    }

    func testDepositAndTransferBetweenFunds() {
        let a = ReserveFund.new(name: "أ", icon: "💰", target: nil)
        let b = ReserveFund.new(name: "ب", icon: "💰", target: nil)
        store.saveFund(a); store.saveFund(b)
        store.deposit(to: a.id, amount: 300, note: nil)
        XCTAssertEqual(store.transfer(from: a.id, to: b.id, amount: 1000), 300, "النقلُ لا يتجاوز الرصيد")
        let bal = { (id: String) in BudgetEngine.reserveBalance(self.store.data.reserves.first { $0.id == id }!, self.store.data.transactions) }
        XCTAssertEqual(bal(a.id), 0, accuracy: 0.001)
        XCTAssertEqual(bal(b.id), 300, accuracy: 0.001)
    }

    func testTripRoutesNewExpensesToTheFund() {
        store.setDailyBudget(amount: 100)
        var trip = ReserveFund.new(name: "سفر", icon: "✈️", target: nil)
        trip.addDeposit(amount: 1000, date: today, note: nil)
        store.saveFund(trip)
        store.startTrip(trip.id)
        store.saveTransaction(expense(80))
        XCTAssertEqual(BudgetEngine.status(store.data, today: today)!.spentToday, 0, "صرفُ السفر من مظروفه لا من اليومي")
        let f = store.data.reserves.first { $0.id == trip.id }!
        XCTAssertEqual(BudgetEngine.reserveBalance(f, store.data.transactions), 920, accuracy: 0.001)
        store.endTrip(trip.id)
        XCTAssertNil(store.data.reserves.first { $0.id == trip.id }!.runningTrip)
    }

    func testSalaryRollsSurplusOnceAndOnlyDownward() {
        store.setDailyBudget(amount: 100)
        let moved = store.confirmSalary(carryOverride: 1_000_000)
        XCTAssertEqual(moved, 100, accuracy: 0.001, "تصحيحُ الفائض صعوداً ممنوع")
        XCTAssertEqual(store.data.lastSalaryConfirm, today)
        XCTAssertEqual(store.confirmSalary(), 0, "تأكيدٌ ثانٍ في الدورة نفسها لا يرحّل مرّتين")
    }

    // MARK: الأحداث

    func testCountdownSaveAndDelete() {
        let e = CountdownEvent.new(title: "اختبار", date: DateKey.adding(days: 3, to: today), emoji: "📅")
        store.saveEvent(e)
        XCTAssertEqual(Countdown.visible(store.data.countdownEvents, from: today).count, 1)
        store.deleteEvent(e.id)
        XCTAssertTrue(store.data.countdownEvents.isEmpty)
        XCTAssertNotNil(tombstones[e.id])
    }

    // MARK: الحفظ

    func testDataSurvivesReload() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("madar-reload-\(UUID().uuidString).json")
        let s1 = Store(fileURL: url)
        s1.replace(with: AppData())
        s1.setPrayer(.fajr, .jamaah, on: today)
        s1.appendQuickLine("يبقى", on: today)
        s1.flush()
        let s2 = Store(fileURL: url)
        XCTAssertEqual(s2.prayerLog(today).status(.fajr), .jamaah)
        XCTAssertTrue(s2.data.journalEntries.contains { $0.content.contains("يبقى") })
    }
}
