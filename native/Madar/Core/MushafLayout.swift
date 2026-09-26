import Foundation

/// أسطر الوجه كما هي في مصحف المدينة (`mushafLayout.ts`): ٦٠٤ أوجه، ١٥ سطراً
/// (وثمانية لوجهَي الفاتحة وأوّل البقرة)، ولكلّ سطرٍ معامل تمدّدٍ يستوي به على
/// عرضه. المقاسُ قِيس على سطرٍ عرضه ٢٧٠ بخطّ حفص ١٦ — وكلُّ عرضٍ آخر تكبيرٌ متناسب.
enum MushafLayout {
    static let lineWidth = 270.0
    static let baseFont = 16.0
    static let suraHeader = 0
    static let basmala = -1
    static let centered = -1.0

    struct Run: Hashable { let id: Int; let text: String; let num: Int }
    struct Line: Hashable { let stretch: Double; let runs: [Run] }

    private static var cache: [Int: [String: [Line]]] = [:]
    private static let lock = NSLock()

    static func lines(page: Int) -> [Line]? {
        let chunk = (page - 1) / 20
        lock.lock(); defer { lock.unlock() }
        if cache[chunk] == nil {
            let name = String(format: "chunk-%02d", chunk)
            guard let url = Bundle.main.url(forResource: name, withExtension: "json"),
                  let d = try? Data(contentsOf: url),
                  let obj = try? JSONSerialization.jsonObject(with: d) as? [String: [[Any]]] else { return nil }
            var pages: [String: [Line]] = [:]
            for (k, rawLines) in obj {
                pages[k] = rawLines.compactMap { l -> Line? in
                    guard l.count >= 2, let runs = l[1] as? [[Any]] else { return nil }
                    let stretch = (l[0] as? NSNumber)?.doubleValue ?? centered
                    return Line(stretch: stretch, runs: runs.compactMap { r in
                        guard r.count >= 3 else { return nil }
                        return Run(id: (r[0] as? NSNumber)?.intValue ?? 0, text: r[1] as? String ?? "", num: (r[2] as? NSNumber)?.intValue ?? 0)
                    })
                }
            }
            cache[chunk] = pages
        }
        return cache[chunk]?[String(page)]
    }
}
