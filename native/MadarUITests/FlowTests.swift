import XCTest

/// **جولةٌ كاملة في التطبيق كما يستعمله المالك** — كلُّ قسمٍ يُفتح، وكلُّ فعلٍ
/// رئيسٍ يُضغط ويُتحقَّق من أثره. تعمل على بيانات العرض (`-demo`) في ملفٍّ مؤقّت،
/// فلا تمسّ بيانات أحد.
final class FlowTests: XCTestCase {
    var app: XCUIApplication!

    override func setUp() {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-demo"]
        addUIInterruptionMonitor(withDescription: "system alerts") { alert in
            for label in ["Allow While Using App", "Allow", "OK", "السماح أثناء استخدام التطبيق", "سماح", "حسناً"] {
                if alert.buttons[label].exists { alert.buttons[label].tap(); return true }
            }
            return false
        }
        app.launch()
    }

    // MARK: أدوات

    private func tab(_ name: String) {
        let b = app.tabBars.buttons[name]
        XCTAssertTrue(b.waitForExistence(timeout: 10), "تبويب «\(name)» غير موجود")
        b.tap()
    }

    @discardableResult
    private func wait(_ e: XCUIElement, _ what: String, timeout: TimeInterval = 8) -> XCUIElement {
        XCTAssertTrue(e.waitForExistence(timeout: timeout), "لم يظهر: \(what)")
        return e
    }

    private func text(containing s: String) -> XCUIElement {
        app.staticTexts.containing(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
    }

    private func anyElement(containing s: String) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
    }

    private func scrollTo(_ e: XCUIElement, maxSwipes: Int = 8) {
        var n = 0
        while !e.isHittable && n < maxSwipes { app.swipeUp(); n += 1 }
    }

    private func back() {
        let b = app.navigationBars.buttons.firstMatch
        if b.waitForExistence(timeout: 3) { b.tap() } else { app.swipeRight() }
    }

    // MARK: الأقسام كلّها تُفتح

    func testEveryTabOpens() {
        tab("اليوم"); wait(text(containing: "مدار اليوم"), "البهو")
        tab("الصلاة"); wait(app.buttons["prayerRow.0"], "صفّ الفجر")
        tab("المذكرات"); wait(app.buttons["journal.addToday"], "زرّ مذكرة اليوم")
        tab("القرآن"); wait(text(containing: "مدار الختمة"), "مدار الختمة")
        tab("المال"); wait(text(containing: "متاحٌ لك اليوم"), "المتاح اليوم")
    }

    // MARK: البهو

    func testTodayHeaderButtons() {
        tab("اليوم")
        wait(app.buttons["today.settings"], "زرّ الإعدادات").tap()
        wait(app.buttons["settings.done"], "إغلاق الإعدادات").tap()

        wait(app.buttons["today.stats"], "زرّ الحصيلة").tap()
        sleep(1); back()

        wait(app.buttons["today.day"], "زرّ يومٍ مضى").tap()
        sleep(1); back()
        wait(text(containing: "مدار اليوم"), "العودة للبهو")
    }

    func testQuickExpenseFromToday() {
        tab("اليوم")
        wait(app.buttons["fab.expense"], "زرّ المصروف السريع").tap()
        let amount = wait(app.textFields["expense.amount"], "خانة المبلغ")
        amount.tap(); amount.typeText("25")
        let note = app.textFields["expense.note"]
        if note.exists { note.tap(); note.typeText("UITEST") }
        wait(app.buttons["expense.save"], "زرّ الحفظ").tap()
        tab("المال")
        wait(anyElement(containing: "UITEST"), "المصروف الجديد في آخر المصاريف")
    }

    // MARK: الصلاة

    func testLogPrayerWithKhushu() {
        tab("الصلاة")
        let isha = wait(app.buttons["prayerRow.4"], "صفّ العشاء")
        isha.tap()
        wait(app.buttons["status.jamaah"], "خيار «في جماعة»").tap()
        wait(app.buttons["khushu.3"], "سؤال الخشوع").tap()
        XCTAssertTrue(app.buttons["prayerRow.4"].waitForExistence(timeout: 5))
        let label = app.buttons["prayerRow.4"].label
        XCTAssertTrue(label.contains("جماعة"), "العشاء لم تُسجَّل جماعة: \(label)")
    }

    func testMissedPrayerHasNoKhushu() {
        tab("الصلاة")
        wait(app.buttons["prayerRow.3"], "صفّ المغرب").tap()
        wait(app.buttons["status.missed"], "خيار «فاتتني»").tap()
        // «فاتتني» تُغلق الورقة ولا تسأل عن القلب.
        XCTAssertFalse(app.buttons["khushu.1"].waitForExistence(timeout: 2), "سُئل عن الخشوع لفرضٍ فات")
        XCTAssertTrue(app.buttons["prayerRow.3"].label.contains("فائتة"))
    }

    func testPrayerHistoryOpens() {
        tab("الصلاة")
        let history = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "السجلّ")).firstMatch
        scrollTo(history)
        wait(history, "زرّ السجلّ").tap()
        sleep(1)
        app.swipeDown(velocity: .fast)
    }

    // MARK: المذكرات

    func testWriteJournalEntry() {
        tab("المذكرات")
        wait(app.buttons["journal.addToday"], "زرّ مذكرة اليوم").tap()
        let body = wait(app.textFields["journal.content"].exists ? app.textFields["journal.content"] : app.textViews["journal.content"], "خانة النصّ")
        body.tap(); body.typeText(" UITESTJOURNAL")
        wait(app.buttons["journal.done"], "زرّ تم").tap()
        wait(anyElement(containing: "UITESTJOURNAL"), "المذكرة في القائمة")
    }

    // MARK: القرآن

    func testWirdToggleAndReader() {
        tab("القرآن")
        let wird = app.buttons["quran.wird"]
        scrollTo(wird)
        let before = wait(wird, "زرّ الوِرد").label
        wird.tap()
        XCTAssertNotEqual(app.buttons["quran.wird"].label, before, "لم يتغيّر الوِرد بالضغط")
        wird.tap()

        app.swipeDown(); app.swipeDown()
        wait(app.buttons["quran.continue"], "تابع القراءة").tap()
        let close = app.buttons["reader.close"]
        if !close.waitForExistence(timeout: 5) { app.tap() }
        wait(close, "إغلاق المصحف").tap()
        wait(text(containing: "مدار الختمة"), "العودة لصفحة القرآن")
    }

    func testHifzAndIndexOpen() {
        tab("القرآن")
        let hifz = app.buttons["الحفظ والمراجعة"]
        scrollTo(hifz)
        wait(hifz, "رابط الحفظ").tap()
        sleep(1); back()
        let index = app.buttons["فهرس السور والأجزاء"]
        scrollTo(index)
        wait(index, "رابط الفهرس").tap()
        sleep(1); back()
    }

    // MARK: المال

    func testFinanceScreensOpen() {
        tab("المال")
        for name in ["تحليل الصرف", "البطاقات والالتزامات"] {
            let link = app.buttons[name]
            scrollTo(link)
            wait(link, name).tap()
            sleep(1); back()
        }
        let fund = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "سفرة الصيف")).firstMatch
        scrollTo(fund, maxSwipes: 12)
        if fund.exists { fund.tap(); sleep(1); back() }
    }

    // MARK: الاستقرار

    func testRapidTabSwitchingDoesNotCrash() {
        for _ in 0..<3 {
            for t in ["اليوم", "الصلاة", "المذكرات", "القرآن", "المال"] { tab(t) }
        }
        XCTAssertEqual(app.state, .runningForeground)
    }
}
