import Foundation

/// عميل Firestore عبر REST — نفس المشروع ومسار المساحة الذي يستعمله الويب
/// (`userData/{space}`). لا تسجيل دخول: القواعد تسمح بالمساحة التي يعرف معرّفَها
/// المالكُ وحده. مفتاح الـAPI عامٌّ بتصميم Firebase (القواعد هي الحارس).
struct Firestore {
    static let project = "my-dream-a"
    static let apiKey = "AIzaSyD9Vg0WsM_5EJtESaRVKZY1H5YcfGs3WkA"
    static let root = "projects/\(project)/databases/(default)/documents"
    static let base = URL(string: "https://firestore.googleapis.com/v1/")!

    struct Doc { var name: String; var fields: RawObject; var updateTime: String? }

    enum Failure: LocalizedError {
        case http(Int, String), precondition, badResponse
        var errorDescription: String? {
            switch self {
            case .http(let c, let m): return "خطأ من الخادم (\(c)): \(m)"
            case .precondition: return "تغيّرت السحابة أثناء المزامنة."
            case .badResponse: return "ردٌّ غير مفهوم من الخادم."
            }
        }
    }

    let session: URLSession = {
        let c = URLSessionConfiguration.default
        c.timeoutIntervalForRequest = 30
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }()

    private func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var comps = URLComponents(url: base.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        comps.queryItems = query + [URLQueryItem(name: "key", value: Self.apiKey)]
        return comps.url!
    }

    private func send(_ req: URLRequest) async throws -> [String: Any] {
        let (data, resp) = try await session.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        let obj = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        if code == 404 { return [:] }
        guard (200..<300).contains(code) else {
            let msg = ((obj["error"] as? [String: Any])?["message"] as? String) ?? ""
            if code == 400 || code == 409, msg.contains("FAILED_PRECONDITION") || msg.lowercased().contains("precondition") || msg.contains("update time") {
                throw Failure.precondition
            }
            throw Failure.http(code, msg)
        }
        return obj
    }

    func get(_ path: String) async throws -> Doc? {
        let obj = try await send(URLRequest(url: url("\(Self.root)/\(path)")))
        guard let name = obj["name"] as? String else { return nil }
        return Doc(name: name, fields: FirestoreValue.decodeFields(obj["fields"]), updateTime: obj["updateTime"] as? String)
    }

    func list(_ collectionPath: String) async throws -> [Doc] {
        var out: [Doc] = []
        var token: String?
        repeat {
            var q = [URLQueryItem(name: "pageSize", value: "300")]
            if let t = token { q.append(URLQueryItem(name: "pageToken", value: t)) }
            let obj = try await send(URLRequest(url: url("\(Self.root)/\(collectionPath)", query: q)))
            for d in obj["documents"] as? [[String: Any]] ?? [] {
                if let n = d["name"] as? String {
                    out.append(Doc(name: n, fields: FirestoreValue.decodeFields(d["fields"]), updateTime: d["updateTime"] as? String))
                }
            }
            token = obj["nextPageToken"] as? String
        } while token != nil
        return out
    }

    struct Write { var path: String; var fields: RawObject; var updateTime: String?; var mustNotExist: Bool }

    /// كتابةٌ ذرّية لعدّة مستندات بشرط أنّها لم تتغيّر منذ قُرئت.
    func commit(_ writes: [Write]) async throws {
        guard !writes.isEmpty else { return }
        let body: [String: Any] = ["writes": writes.map { w -> [String: Any] in
            var o: [String: Any] = ["update": ["name": "\(Self.root)/\(w.path)", "fields": FirestoreValue.encodeFields(w.fields)]]
            if let t = w.updateTime { o["currentDocument"] = ["updateTime": t] }
            else if w.mustNotExist { o["currentDocument"] = ["exists": false] }
            return o
        }]
        var req = URLRequest(url: url("\(Self.root):commit"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        _ = try await send(req)
    }

    func delete(_ path: String) async throws {
        var req = URLRequest(url: url("\(Self.root)/\(path)"))
        req.httpMethod = "DELETE"
        _ = try await send(req)
    }
}

/// ترميز قيم Firestore ⇄ JSON. الأعداد الصحيحة `integerValue` والكسرية
/// `doubleValue` — كما يكتبها SDK الويب.
enum FirestoreValue {
    static func decodeFields(_ any: Any?) -> RawObject {
        var out: RawObject = [:]
        for (k, v) in any as? [String: Any] ?? [:] { out[k] = decode(v) }
        return out
    }

    static func decode(_ any: Any) -> JSONValue {
        guard let v = any as? [String: Any], let first = v.first else { return .null }
        let k = first.key, x = first.value
        switch k {
        case "nullValue": return .null
        case "booleanValue": return .bool(x as? Bool ?? false)
        case "integerValue": return .number(Double(x as? String ?? "") ?? (x as? Double) ?? 0)
        case "doubleValue": return .number((x as? Double) ?? Double(x as? String ?? "") ?? 0)
        case "stringValue", "timestampValue", "referenceValue": return .string(x as? String ?? "")
        case "arrayValue": return .array(((x as? [String: Any])?["values"] as? [Any] ?? []).map(decode))
        case "mapValue": return .object(decodeFields((x as? [String: Any])?["fields"]))
        default: return .null
        }
    }

    static func encodeFields(_ o: RawObject) -> [String: Any] {
        var out: [String: Any] = [:]
        for (k, v) in o { out[k] = encode(v) }
        return out
    }

    static func encode(_ v: JSONValue) -> [String: Any] {
        switch v {
        case .null: return ["nullValue": NSNull()]
        case .bool(let b): return ["booleanValue": b]
        case .number(let n):
            if n.isFinite, n == n.rounded(), abs(n) < 9_007_199_254_740_992 { return ["integerValue": String(Int64(n))] }
            return ["doubleValue": n]
        case .string(let s): return ["stringValue": s]
        case .array(let a): return ["arrayValue": ["values": a.map(encode)]]
        case .object(let o): return ["mapValue": ["fields": encodeFields(o)]]
        }
    }
}
