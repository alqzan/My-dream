import SwiftUI

@main
struct MadarApp: App {
    @StateObject private var store = Store()
    @StateObject private var location = LocationProvider()
    @Environment(\.scenePhase) private var phase

    init() { QuranFont.register() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(location)
                // التطبيق عربيٌّ دائماً مهما كانت لغة الجهاز: الاتجاه واللغة
                // مثبّتان هنا مرّةً واحدة لا في كلّ شاشة.
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
                .tint(Theme.brand)
        }
        .onChange(of: phase) { _, newPhase in
            if newPhase != .active { store.flush() }
        }
    }
}
