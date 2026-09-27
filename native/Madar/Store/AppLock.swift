import Foundation
import LocalAuthentication
import SwiftUI

/// قفل الخصوصية بـFace ID (ورمز الجهاز بديلاً). يُقفل عند العودة من الخلفية
/// بعد مهلةٍ يختارها المالك — لا عند كلّ لمحة، فيبقى التطبيق سلساً.
@MainActor
final class AppLock: ObservableObject {
    @AppStorage("lock-enabled") var enabled = false
    @AppStorage("lock-delay") var delaySeconds = 30
    @Published private(set) var locked = false
    private var backgroundedAt: Date?

    init() { locked = UserDefaults.standard.bool(forKey: "lock-enabled") }

    var biometryName: String {
        let c = LAContext()
        _ = c.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch c.biometryType {
        case .faceID: return "Face ID"
        case .touchID: return "Touch ID"
        default: return "رمز الجهاز"
        }
    }

    func didEnterBackground() { backgroundedAt = Date() }

    func willEnterForeground() {
        guard enabled else { return }
        if let t = backgroundedAt, Date().timeIntervalSince(t) >= Double(delaySeconds) { locked = true }
        backgroundedAt = nil
    }

    func unlock() {
        let c = LAContext()
        c.localizedCancelTitle = "إلغاء"
        c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "افتح «مدار»") { ok, _ in
            Task { @MainActor in if ok { self.locked = false; Haptic.tap() } }
        }
    }

    /// التفعيل يطلب المصادقة أوّلاً — قفلٌ لا يستطيع صاحبه فتحه أسوأ من لا قفل.
    func setEnabled(_ on: Bool) {
        guard on else { enabled = false; locked = false; return }
        let c = LAContext()
        c.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "فعّل قفل «مدار»") { ok, _ in
            Task { @MainActor in if ok { self.enabled = true } }
        }
    }
}

struct LockScreen: View {
    @EnvironmentObject var lock: AppLock
    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "lock.fill").font(.system(size: 44)).foregroundStyle(Theme.brand)
            Text("مدار مقفل").font(.mdrTitle2.bold())
            Button { lock.unlock() } label: {
                Label("افتح بـ\(lock.biometryName)", systemImage: "faceid").frame(minWidth: 200)
            }
            .buttonStyle(.mdr(.brand)).tint(Theme.brand).controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Mdr.paper)
        .onAppear { lock.unlock() }
    }
}
