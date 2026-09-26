import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var location: LocationProvider
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var pendingFile: Data?
    @State private var password = ""
    @State private var askPassword = false
    @State private var preview: AppData?
    @State private var message: String?
    @State private var exportURL: URL?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Button { importing = true } label: { Label("استيراد نسخة احتياطية من الويب", systemImage: "square.and.arrow.down") }
                    Button { export() } label: { Label("تصدير نسخة احتياطية", systemImage: "square.and.arrow.up") }
                    if let url = exportURL {
                        ShareLink(item: url) { Label("مشاركة ملف النسخة", systemImage: "doc") }
                    }
                } header: { Text("البيانات") } footer: {
                    Text("الاستيراد يستبدل بيانات هذا الجهاز بالنسخة، وتُحفظ نسخةٌ من الحالية قبله. التصدير بصيغة الويب فتفتحه نسخة المتصفّح كما هي.")
                }

                Section("الموقع والمواقيت") {
                    HStack {
                        Text(location.isFallback ? "الرياض (افتراضي)" : "موقعك الحالي")
                        Spacer()
                        Button("تحديث") { location.request() }
                    }
                }

                Section("الأرقام") {
                    LabeledContent("المذكرات", value: Fmt.count(store.data.journalEntries.count))
                    LabeledContent("أيام الصلاة المسجّلة", value: Fmt.count(store.data.prayerLogs.count))
                    LabeledContent("المصاريف", value: Fmt.count(store.data.transactions.count))
                    LabeledContent("المظاريف", value: Fmt.count(store.data.reserves.count))
                }

                Section("عن التطبيق") {
                    LabeledContent("الإصدار", value: Digits.indic("\(AppInfo.version) (\(AppInfo.build))"))
                }
            }
            .navigationTitle("الإعدادات")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("تم") { dismiss() } } }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
                guard case .success(let url) = result else { return }
                let ok = url.startAccessingSecurityScopedResource()
                defer { if ok { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else { message = "تعذّرت قراءة الملف."; return }
                if Backup.isEncrypted(data) { pendingFile = data; askPassword = true } else { load(data, password: nil) }
            }
            .alert("كلمة مرور النسخة", isPresented: $askPassword) {
                SecureField("كلمة المرور", text: $password)
                Button("فتح") { if let d = pendingFile { load(d, password: password) }; password = "" }
                Button("إلغاء", role: .cancel) { pendingFile = nil; password = "" }
            }
            .confirmationDialog("استبدال بيانات هذا الجهاز؟", isPresented: Binding(get: { preview != nil }, set: { if !$0 { preview = nil } }), titleVisibility: .visible) {
                Button("استبدل بالنسخة", role: .destructive) {
                    if let p = preview { store.replace(with: p); message = "تمّ الاستيراد." }
                    preview = nil
                }
            } message: {
                if let p = preview {
                    Text("في النسخة: \(Fmt.count(p.journalEntries.count)) مذكرة · \(Fmt.count(p.prayerLogs.count)) يوم صلاة · \(Fmt.count(p.transactions.count)) مصروف")
                }
            }
            .alert(message ?? "", isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })) {
                Button("حسناً", role: .cancel) {}
            }
        }
    }

    private func load(_ data: Data, password: String?) {
        do { preview = try Backup.read(data, password: password) }
        catch { message = error.localizedDescription }
        pendingFile = nil
    }

    private func export() {
        do {
            let bytes = try Backup.export(store.data)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("madar-backup-\(DateKey.today()).json")
            try bytes.write(to: url, options: .atomic)
            exportURL = url
        } catch { message = "تعذّر التصدير." }
    }
}
