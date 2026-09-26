import Foundation
import UserNotifications

/// تذكير الصلاة بإشعارٍ محليّ — بلا خادم: الجهاز يجدوله بنفسه.
/// بعد الأذان بنصف ساعة (كالمطالبة في الويب) يُسأل «صلَّيتَ الظهر؟»، وأزرارُ
/// الإشعار تسجّل الحالة مباشرةً. ما سُجّل قبل موعده يُلغى تذكيرُه.
@MainActor
final class PrayerNotifications: NSObject, ObservableObject, UNUserNotificationCenterDelegate {
    static let category = "PRAYER_ASK"
    static let delay: TimeInterval = 30 * 60
    private let center = UNUserNotificationCenter.current()
    weak var store: Store?

    @Published var enabled: Bool = UserDefaults.standard.bool(forKey: "prayer-notify") {
        didSet { UserDefaults.standard.set(enabled, forKey: "prayer-notify") }
    }

    override init() {
        super.init()
        center.delegate = self
        let jamaah = UNNotificationAction(identifier: "جماعة", title: "في جماعة")
        let alone = UNNotificationAction(identifier: "منفردة", title: "وحدي")
        let missed = UNNotificationAction(identifier: "فائتة", title: "فاتتني", options: [.destructive])
        center.setNotificationCategories([UNNotificationCategory(identifier: Self.category, actions: [jamaah, alone, missed], intentIdentifiers: [])])
    }

    func setEnabled(_ on: Bool, location: LocationProvider) {
        guard on else { enabled = false; center.removeAllPendingNotificationRequests(); return }
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            Task { @MainActor in
                self.enabled = granted
                if granted { self.reschedule(location: location) }
            }
        }
    }

    private static func id(_ date: String, _ p: Prayer) -> String { "prayer:\(date):\(p.rawValue)" }

    /// يجدول الأيام العشرة القادمة (حدّ iOS ٦٤ إشعاراً معلّقاً).
    func reschedule(location: LocationProvider) {
        guard enabled, let store else { return }
        center.removeAllPendingNotificationRequests()
        let now = Date()
        for offset in 0..<10 {
            let key = DateKey.adding(days: offset, to: DateKey.today())
            guard let day = DateKey.date(key), let times = location.times(for: day) else { continue }
            let log = store.prayerLog(key)
            for p in Prayer.allCases {
                guard let t = times[p], log.status(p) == .none else { continue }
                let at = t.addingTimeInterval(Self.delay)
                guard at > now else { continue }
                let c = UNMutableNotificationContent()
                c.title = "صلَّيتَ \(p.rawValue)؟"
                c.body = "أذّن \(Fmt.clock(t)) — سجّلها بلمسة."
                c.categoryIdentifier = Self.category
                c.userInfo = ["date": key, "prayer": p.rawValue]
                c.sound = .default
                let comps = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: at)
                center.add(UNNotificationRequest(identifier: Self.id(key, p), content: c,
                                                 trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
            }
        }
    }

    func cancel(date: String, prayer: Prayer) {
        center.removePendingNotificationRequests(withIdentifiers: [Self.id(date, prayer)])
        center.removeDeliveredNotifications(withIdentifiers: [Self.id(date, prayer)])
    }

    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let info = response.notification.request.content.userInfo
        guard let date = info["date"] as? String, let name = info["prayer"] as? String, let p = Prayer(rawValue: name),
              let s = PrayerStatus(rawValue: response.actionIdentifier) else { return }
        await MainActor.run { self.store?.setPrayer(p, s, on: date) }
    }

    nonisolated func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound]
    }
}
