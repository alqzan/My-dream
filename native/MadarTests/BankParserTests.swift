import XCTest
@testable import Madar

/// عيّنات محلّل البنك من اختبار الويب (`bankParser.catalogue.test.ts`) — النقلُ يطابقه.
final class BankParserTests: XCTestCase {
    func testSenderCatalogue() {
        let cases: [(String, String, String, String)] = [
            ("AlRajhiBank", "حوالة داخلية صادرة\nمن:2468\nمبلغ:SAR 600\nالى:حساب ادخار\nفي:2026-08-14", "transfer_out", "out"),
            ("BSF", "شراء عبر نقاط البيع بـ SAR 57.39\nبطاقة:7312\nلدى:TEST GROCERY\nفي:2026-08-14", "purchase", "out"),
            ("SNB", "OTP 123456 for Own Credit Card Payment with Amount 700 SAR", "otp", "neutral"),
            ("Alinma", "رمز شراء أونلاين 123456\nللبطاقة *7312\nبـ 113 SAR\nمن TEST SHOP\nفي:2026-08-14", "otp", "neutral"),
            ("Barq", "Money Added to your Barq wallet\namount: 5000.0 SAR\ncard number: **7312\n2026-08-14 12:22", "deposit", "in"),
            ("STC Bank", "دفع قطة\nمبلغ:47.33 ر.س\nإلى:حساب مشترك", "purchase", "out"),
            ("Sukuk", "إيداع إلى حساب استثماري\nمبلغ:SAR 300\nفي:2026-08-14", "deposit", "in"),
            ("D360", "اضافة باستخدام آبل باى\nمبلغ:SAR 1000\nبطاقة:*7312 - mada\nإلى:*2468\nفي:2026-08-14", "deposit", "in"),
            ("Tiqmo", "ECOM Purchase Transaction\nAmount: 20 SAR\nJust a hold on your card", "hold", "neutral"),
            ("Tamara", "تأكيد الدفع\nمن:ExampleStore\nبقيمة:62.00 SAR", "info", "neutral"),
            ("Tabby", "Your SAR 62 purchase at ExampleStore is confirmed", "info", "neutral"),
            ("RiyadBank", "لا تشارك الرمز 123456", "otp", "neutral"),
            ("Drahim", "رمز التحقق:123456 لسحب الدراهم", "otp", "neutral"),
            ("Tweeq", "عزيزي العميل، نود إبلاغك بإيقاف خدمات المحفظة مؤقتاً", "marketing", "neutral"),
            ("Emkan", "رمز التحقق: 123456", "otp", "neutral"),
            ("Derayah", "تم منحكم الخصم الخاص بحسابكم بنسبة 100% وتم تفعيل الخصم تلقائياً", "marketing", "neutral"),
            ("Manafa", "العملية: سداد مبكر\nالمبلغ: SAR 200", "info", "neutral"),
            ("SDB", "سم نفسك تاجر وانطلق لريادتك!", "marketing", "neutral"),
            ("STC900", "عزيزي العميل،\nالنقاط المضافة إلى رصيدك: 1 نقطة\nرصيد قطاف الحالي: 10 نقاط", "marketing", "neutral"),
        ]
        for (sender, text, kind, dir) in cases {
            let e = BankParser.parse(text, reference: "2026-08-15", sender: sender, receivedAt: "2026-08-15T12:00:00+03:00")
            XCTAssertEqual(e?.kind, kind, sender)
            XCTAssertEqual(e?.direction, dir, sender)
        }
    }

    func testTwoDigitYearDates() {
        XCTAssertEqual(BankParser.parse("شراء 78.00 SAR POS - Apple Pay بطاقة ائتمانية *9407 من ALDREES 1089 - SA في 15:12 26-07-30 الرصيد 482.37", reference: "2026-08-01")?.date, "2026-07-30")
        XCTAssertEqual(BankParser.parse("شراء بـ SR 22 لدى STARBUCKS بتاريخ 16/7/26 رصيد: 1200", reference: "2026-08-01")?.date, "2026-07-16")
        XCTAssertEqual(BankParser.parse("شراء 50 SAR لدى SOME STORE بتاريخ 26-02-25 رصيد: 900", reference: "2025-02-27")?.date, "2025-02-26")
    }

    func testPurchaseAmountAndMerchant() {
        let e = BankParser.parse("شراء عبر نقاط البيع بـ SAR 57.39\nبطاقة:7312\nلدى:TEST GROCERY\nفي:2026-08-14", reference: "2026-08-15", sender: "BSF")!
        XCTAssertEqual(e.amount, 57.39)
        XCTAssertEqual(e.note, "TEST GROCERY")
        XCTAssertEqual(e.date, "2026-08-14")
        XCTAssertEqual(e.account, "7312")
    }
}
