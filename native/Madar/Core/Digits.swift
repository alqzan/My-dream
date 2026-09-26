import Foundation

/// الأرقام هنديةٌ في كلّ ما يُعرض (قرار المالك، كما في نسخة الويب).
/// هذه البوّابة الوحيدة للتحويل — ولا تُمرَّر عليها قيمةٌ تُخزَّن أو تُقارَن.
enum Digits {
    private static let map: [Character: Character] = [
        "0": "٠", "1": "١", "2": "٢", "3": "٣", "4": "٤",
        "5": "٥", "6": "٦", "7": "٧", "8": "٨", "9": "٩",
    ]

    static func indic(_ text: String) -> String {
        String(text.map { map[$0] ?? $0 })
    }
}

enum Dates {
    static func longArabic(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ar@numbers=arab")
        f.calendar = Calendar(identifier: .gregorian)
        f.setLocalizedDateFormatFromTemplate("EEEEdMMMMy")
        return f.string(from: date)
    }
}
