import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: Store
    @SceneStorage("tab") private var tab = "today"
    /// `-tab <name>` يفتح تبويباً بعينه (لالتقاط الصور في CI).
    private static let forcedTab: String? = {
        let a = ProcessInfo.processInfo.arguments
        guard let i = a.firstIndex(of: "-tab"), a.indices.contains(i + 1) else { return nil }
        return a[i + 1]
    }()

    var body: some View {
        TabView(selection: $tab) {
            TodayView()
                .tabItem { Label("اليوم", systemImage: "sun.horizon") }.tag("today")
            PrayerView()
                .tabItem { Label("الصلاة", systemImage: "building.columns") }.tag("prayer")
            JournalView()
                .tabItem { Label("المذكرات", systemImage: "book.closed") }.tag("journal")
            QuranView()
                .tabItem { Label("القرآن", systemImage: "book") }.tag("quran")
            FinanceView()
                .tabItem { Label("المال", systemImage: "wallet.pass") }.tag("finance")
        }
        .mdrMinimizingTabBar()
        .environment(\.selectTab, { t in withAnimation { tab = t } })
        .onAppear { if let t = Self.forcedTab { tab = t } }
        .alert("تنبيه", isPresented: Binding(get: { store.loadError != nil }, set: { if !$0 { store.loadError = nil } })) {
            Button("حسناً", role: .cancel) {}
        } message: { Text(store.loadError ?? "") }
    }
}

enum AppInfo {
    static var build: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
    }
    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?"
    }
}
