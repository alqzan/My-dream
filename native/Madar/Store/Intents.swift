import AppIntents
import Foundation

/// «أرسل رسالة البنك لمدار» — تستدعيه أتمتةُ الرسائل في اختصارات iOS مباشرةً،
/// فلا حاجة لمرورها بـFirestore. الرسالة تنتظر مراجعتك في «رسائل البنك».
struct AddBankMessageIntent: AppIntent {
    static var title: LocalizedStringResource = "أرسل رسالة بنك لمدار"
    static var description = IntentDescription("تضيف نصّ رسالة البنك إلى صندوق المراجعة في «مدار».")
    static var openAppWhenRun = false

    @Parameter(title: "نصّ الرسالة") var text: String
    @Parameter(title: "المرسِل") var sender: String?

    func perform() async throws -> some IntentResult {
        var saved = UserDefaults.standard.array(forKey: "bank-inbox-local") as? [[String: String]] ?? []
        saved.append(["id": "local:\(UUID().uuidString)", "text": text, "from": sender ?? "", "ts": ISO8601DateFormatter().string(from: Date())])
        UserDefaults.standard.set(saved, forKey: "bank-inbox-local")
        return .result()
    }
}

struct MadarShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: AddBankMessageIntent(), phrases: ["أرسل رسالة بنك إلى \(.applicationName)"],
                    shortTitle: "رسالة بنك", systemImageName: "banknote")
    }
}
