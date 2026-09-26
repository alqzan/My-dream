import SwiftUI

@main
struct MadarApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                // التطبيق عربيٌّ دائماً مهما كانت لغة الجهاز: الاتجاه واللغة
                // مثبّتان هنا مرّةً واحدة لا في كلّ شاشة.
                .environment(\.layoutDirection, .rightToLeft)
                .environment(\.locale, Locale(identifier: "ar"))
        }
    }
}
