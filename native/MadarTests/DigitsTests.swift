import XCTest
@testable import Madar

final class DigitsTests: XCTestCase {
    func testConvertsEveryLatinDigit() {
        XCTAssertEqual(Digits.indic("0123456789"), "٠١٢٣٤٥٦٧٨٩")
    }

    func testLeavesNonDigitsUntouched() {
        XCTAssertEqual(Digits.indic("2026-09-26 ر.س"), "٢٠٢٦-٠٩-٢٦ ر.س")
    }

    func testDateUsesIndicDigitsOnly() {
        let date = DateComponents(calendar: Calendar(identifier: .gregorian),
                                  year: 2026, month: 9, day: 26).date!
        let text = Dates.longArabic(date)
        XCTAssertNil(text.rangeOfCharacter(from: CharacterSet(charactersIn: "0123456789")),
                     "رقمٌ لاتينيّ شاذّ في: \(text)")
        XCTAssertTrue(text.contains("٢٦"))
    }
}
