import SwiftUI

struct SyncSection: View {
    @EnvironmentObject var sync: SyncEngine
    @State private var key = ""
    @State private var worker = UserDefaults.standard.string(forKey: "r2-worker-url") ?? ""
    @State private var editing = false

    var body: some View {
        Section {
            HStack {
                Text("الحالة")
                Spacer()
                statusText.foregroundStyle(Mdr.ink52)
            }
            if sync.enabled {
                Button("زامن الآن") { Task { await sync.sync() } }
                    .disabled(sync.status == .syncing)
                Button("أزِل مفتاح المزامنة", role: .destructive) { sync.setKey(nil) }
            } else {
                SecureField("مفتاح المزامنة (من إعدادات الويب)", text: $key)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("فعّل المزامنة") { sync.setKey(key); key = "" }
                    .disabled(!SyncKey.isValid(key))
            }
            DisclosureGroup("رابط بوّابة الوسائط", isExpanded: $editing) {
                TextField("https://…workers.dev", text: $worker)
                    .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .onSubmit { UserDefaults.standard.set(worker, forKey: "r2-worker-url") }
                Button("احفظ الرابط") { UserDefaults.standard.set(worker, forKey: "r2-worker-url") }
            }
        } header: { Text("المزامنة مع الويب وأجهزتك") } footer: {
            Text("نفس المساحة التي يزامن عليها الويب: ما تسجّله هنا يظهر هناك والعكس. المفتاح يُحفظ في Keychain الجهاز، والصور والتسجيلات التي تضيفها من هنا تُرفع إلى مخزن الوسائط نفسه.")
        }
    }

    private var statusText: Text {
        switch sync.status {
        case .off: return Text("غير مفعّلة")
        case .idle: return Text("جاهزة")
        case .syncing: return Text("تزامن…")
        case .ok(let d): return Text("متزامن \(Fmt.clock(d))")
        case .failed(let m): return Text(m).foregroundStyle(Theme.danger)
        }
    }
}
