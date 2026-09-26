import Foundation

typealias RawObject = [String: JSONValue]

/// الوصول المكتوب إلى كائن JSON خام. كلُّ سجلٍّ في التطبيق يحمل كائنه الخام
/// كاملاً ويقرأ منه ويكتب فيه — فكلُّ حقلٍ لا تعرفه هذه النسخة (وسائط Day One،
/// بيانات البنك…) يبقى في مكانه ويخرج في التصدير كما دخل.
extension Dictionary where Key == String, Value == JSONValue {
    func str(_ k: String) -> String? { if case .string(let v)? = self[k] { return v }; return nil }
    func num(_ k: String) -> Double? { if case .number(let v)? = self[k] { return v }; return nil }
    func int(_ k: String) -> Int? { num(k).flatMap { $0.isFinite ? Int($0) : nil } }
    func bool(_ k: String) -> Bool? { if case .bool(let v)? = self[k] { return v }; return nil }
    func obj(_ k: String) -> RawObject? { if case .object(let v)? = self[k] { return v }; return nil }
    func arr(_ k: String) -> [JSONValue]? { if case .array(let v)? = self[k] { return v }; return nil }
    func strings(_ k: String) -> [String] {
        (arr(k) ?? []).compactMap { if case .string(let s) = $0 { return s }; return nil }
    }
    func objects(_ k: String) -> [RawObject] {
        (arr(k) ?? []).compactMap { if case .object(let o) = $0 { return o }; return nil }
    }

    mutating func put(_ k: String, _ v: String?) { self[k] = v.map(JSONValue.string) }
    mutating func put(_ k: String, _ v: Double?) { self[k] = v.map(JSONValue.number) }
    mutating func put(_ k: String, _ v: Int?) { self[k] = v.map { .number(Double($0)) } }
    mutating func put(_ k: String, _ v: Bool?) { self[k] = v.map(JSONValue.bool) }
    mutating func put(_ k: String, _ v: RawObject?) { self[k] = v.map(JSONValue.object) }
    mutating func put(_ k: String, strings v: [String]?) { self[k] = v.map { .array($0.map(JSONValue.string)) } }
    mutating func put(_ k: String, objects v: [RawObject]?) { self[k] = v.map { .array($0.map(JSONValue.object)) } }
}

/// سجلٌّ مبنيٌّ على كائنٍ خام. `stamp()` يختم `updatedAt` كما يفعل غلاف `set`
/// في الويب، فيبقى الدمجُ مع الويب ممكناً بطابع كلّ عنصر.
protocol RawRecord: Codable, Identifiable, Equatable {
    var raw: RawObject { get set }
    init(raw: RawObject)
}

extension RawRecord {
    var id: String { raw.str("id") ?? "" }
    var updatedAt: Double? { raw.num("updatedAt") }
    mutating func stamp() { raw.put("updatedAt", DateKey.nowMs()) }
    static func newID() -> String { UUID().uuidString.lowercased() }
}
