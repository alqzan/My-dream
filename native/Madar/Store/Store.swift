import Foundation
import SwiftUI

/// مخزن التطبيق: لقطةٌ واحدة `AppData` تُحفظ ملفَّ JSON على الجهاز.
/// الحفظُ مؤجَّلٌ قليلاً ويجري خارج الخيط الرئيسيّ، فلا تتأخّر ضغطةٌ بسبب الكتابة.
@MainActor
final class Store: ObservableObject {
    @Published var data: AppData {
        didSet { if data != oldValue { scheduleSave() } }
    }
    @Published var loadError: String?

    private let fileURL: URL
    private var saveTask: Task<Void, Never>?

    init(fileURL: URL? = nil) {
        let url = fileURL ?? Store.defaultURL
        self.fileURL = url
        if let raw = try? Data(contentsOf: url) {
            do { data = try JSONDecoder().decode(AppData.self, from: raw) }
            catch {
                // ملفٌّ تالف لا يُمسح: يُنقل جانباً ليُفحص، ويبدأ التطبيق فارغاً.
                try? FileManager.default.moveItem(at: url, to: url.appendingPathExtension("corrupt-\(Int(Date().timeIntervalSince1970))"))
                data = AppData()
                loadError = "تعذّرت قراءة البيانات المحفوظة؛ نُقلت جانباً ولم تُحذف."
            }
        } else {
            data = AppData()
        }
    }

    static var defaultURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("madar.json")
    }

    /// كلُّ تعديلٍ يمرّ من هنا فيُختم `lastUpdated` مرّةً واحدة.
    func update(_ change: (inout AppData) -> Void) {
        var d = data
        change(&d)
        d.touch()
        data = d
    }

    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = data
        let url = fileURL
        saveTask = Task.detached(priority: .utility) {
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            Store.write(snapshot, to: url)
        }
    }

    /// حفظٌ فوريّ — عند ذهاب التطبيق إلى الخلفية.
    func flush() {
        saveTask?.cancel()
        Store.write(data, to: fileURL)
    }

    nonisolated static func write(_ data: AppData, to url: URL) {
        guard let bytes = try? JSONEncoder().encode(data) else { return }
        try? bytes.write(to: url, options: [.atomic, .completeFileProtection])
    }

    // MARK: الاستيراد

    /// يستبدل البيانات بنسخةٍ احتياطية، ويُخرج وسائط المذكرات إلى ملفّات.
    /// قبل الاستبدال تُحفظ نسخةٌ من الحالية بجانب الملف — لا إجراءٌ مُتلِف بلا شبكة.
    func replace(with imported: AppData) {
        var d = imported
        for i in d.journalEntries.indices {
            let e = d.journalEntries[i]
            if e.photos.contains(where: { $0.hasPrefix("data:") }) {
                d.journalEntries[i].setPhotos(e.photos.map(MediaStore.externalize))
            }
            if e.audios.contains(where: { $0.hasPrefix("data:") }) {
                d.journalEntries[i].setAudios(e.audios.map(MediaStore.externalize))
            }
        }
        Store.write(data, to: fileURL.deletingLastPathComponent().appendingPathComponent("madar-before-import.json"))
        data = d
        flush()
    }
}
