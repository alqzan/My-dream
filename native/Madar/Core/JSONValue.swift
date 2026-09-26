import Foundation

/// قيمة JSON عامّة — تحفظ حقول النسخة الاحتياطية التي لا تفهمها هذه النسخة بعد
/// (الكتب، العادات، سجلّات البنك…) فتخرج في التصدير كما دخلت ولا تضيع.
enum JSONValue: Codable, Equatable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else { self = .object(try c.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .null: try c.encodeNil()
        case .bool(let b): try c.encode(b)
        case .number(let n): try c.encode(n)
        case .string(let s): try c.encode(s)
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

struct AnyKey: CodingKey {
    var stringValue: String
    var intValue: Int? { nil }
    init(_ s: String) { stringValue = s }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

/// مصفوفةٌ تتخطّى العنصر التالف بدل أن تُسقط الاستيراد كلَّه — البيانات تأتي من
/// نسخٍ احتياطية وأجهزةٍ أقدم خارج سيطرتنا.
struct Lossy<T: Decodable>: Decodable {
    var items: [T]
    init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        var out: [T] = []
        while !c.isAtEnd {
            if let v = try? c.decode(T.self) { out.append(v) }
            else { _ = try? c.decode(JSONValue.self) }
        }
        items = out
    }
}

extension KeyedDecodingContainer where K == AnyKey {
    func list<T: Decodable>(_ key: String) -> [T] {
        (try? decodeIfPresent(Lossy<T>.self, forKey: AnyKey(key)))?.items ?? []
    }
    func opt<T: Decodable>(_ key: String) -> T? {
        try? decodeIfPresent(T.self, forKey: AnyKey(key))
    }
}
