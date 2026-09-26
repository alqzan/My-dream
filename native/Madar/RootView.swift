import SwiftUI

struct RootView: View {
    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Dates.longArabic(Date()))
                            .font(.title3.weight(.semibold))
                        Text("الهيكل الأصليّ يعمل — الأبوابُ تأتي تباعاً.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
                Section("الإصدار") {
                    LabeledContent("البناء", value: Digits.indic(AppInfo.build))
                }
            }
            .navigationTitle("مدار")
        }
    }
}

enum AppInfo {
    static var build: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "?"
    }
}

#Preview {
    RootView()
        .environment(\.layoutDirection, .rightToLeft)
}
