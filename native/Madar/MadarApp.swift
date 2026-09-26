import SwiftUI

@main
struct MadarApp: App {
    @StateObject private var store = Store()
    @StateObject private var location = LocationProvider()
    @StateObject private var lock = AppLock()
    @StateObject private var notifier = PrayerNotifications()
    @StateObject private var sync = SyncEngine()
    @StateObject private var inbox = BankInbox()
    @Environment(\.scenePhase) private var phase

    init() { QuranFont.register() }

    var body: some Scene {
        WindowGroup {
            ZStack {
                RootView()
                if lock.locked { LockScreen().transition(.opacity) }
            }
                .environmentObject(store)
                .environmentObject(location)
                .environmentObject(lock)
                .environmentObject(notifier)
                .environmentObject(sync)
                .environmentObject(inbox)
                .onAppear {
                    notifier.store = store
                    store.onPrayerLogged = { [weak notifier] date, p in notifier?.cancel(date: date, prayer: p) }
                    notifier.reschedule(location: location)
                    sync.store = store
                    inbox.store = store
                    store.onLocalChange = { [weak sync] in sync?.schedule() }
                    Task { await sync.sync() }
                }
                .onChange(of: location.lat) { _, _ in notifier.reschedule(location: location) }
                // التطبيق عربيٌّ دائماً مهما كانت لغة الجهاز: الاتجاه واللغة
                // مثبّتان هنا مرّةً واحدة لا في كلّ شاشة.
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .tint(Theme.brand)
        }
        .onChange(of: phase) { _, newPhase in
            switch newPhase {
            case .background: store.flush(); lock.didEnterBackground()
            case .active:
                lock.willEnterForeground()
                notifier.reschedule(location: location)
                Task { await sync.sync() }
            default: store.flush()
            }
        }
    }
}
