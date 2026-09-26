import XCTest
@testable import Madar

final class MergeTests: XCTestCase {
    private func obj(_ json: String) -> RawObject {
        try! JSONDecoder().decode(RawObject.self, from: Data(json.utf8))
    }

    func testEachPrayerResolvedByItsOwnStamp() {
        let local = obj(#"{"lastUpdated":"2026-09-26T10:00:00Z","prayerLogs":[{"date":"2026-09-26","prayers":{"الفجر":"جماعة","العشاء":"لم"},"prayerUpdatedAt":{"الفجر":100,"العشاء":100}}]}"#)
        let cloud = obj(#"{"lastUpdated":"2026-09-26T09:00:00Z","prayerLogs":[{"date":"2026-09-26","prayers":{"العشاء":"منفردة"},"prayerUpdatedAt":{"العشاء":200}}]}"#)
        let m = Merge.merge(local: local, cloud: cloud)
        let p = m.objects("prayerLogs").first!.obj("prayers")!
        XCTAssertEqual(p.str("الفجر"), "جماعة")
        XCTAssertEqual(p.str("العشاء"), "منفردة")
    }

    func testTombstoneStopsResurrectionButNewerReaddWins() {
        // Stamps must be recent: tombstones older than the 365-day TTL expire by design.
        let n = Int(DateKey.nowMs())
        let local = obj(#"{"lastUpdated":"b","deleted":{"t1":\#(n - 100)},"transactions":[]}"#)
        let cloud = obj(#"{"lastUpdated":"a","transactions":[{"id":"t1","amount":5,"updatedAt":\#(n - 200)},{"id":"t2","amount":9,"updatedAt":\#(n)}]}"#)
        let m = Merge.merge(local: local, cloud: cloud)
        XCTAssertEqual(m.objects("transactions").compactMap { $0.str("id") }, ["t2"])
        let cloud2 = obj(#"{"lastUpdated":"a","transactions":[{"id":"t1","amount":5,"updatedAt":\#(n + 100)}]}"#)
        XCTAssertEqual(Merge.merge(local: local, cloud: cloud2).objects("transactions").count, 1)
    }

    func testNewerItemEditWinsDespiteOlderDocument() {
        let local = obj(#"{"lastUpdated":"z","journalEntries":[{"id":"e","date":"2026-09-01","content":"old","updatedAt":1}]}"#)
        let cloud = obj(#"{"lastUpdated":"a","journalEntries":[{"id":"e","date":"2026-09-01","content":"new","updatedAt":2,"photoRefs":["abc"]}]}"#)
        let e = Merge.merge(local: local, cloud: cloud).objects("journalEntries").first!
        XCTAssertEqual(e.str("content"), "new")
        XCTAssertEqual(e.strings("photoRefs"), ["abc"])
    }

    func testMediaRefsUnionMinusTombstone() {
        let local = obj(#"{"lastUpdated":"z","deletedMedia":{"e:photos:h1":\#(DateKey.nowMs())},"journalEntries":[{"id":"e","date":"2026-09-01","content":"x","updatedAt":5,"photoRefs":["h2"]}]}"#)
        let cloud = obj(#"{"lastUpdated":"a","journalEntries":[{"id":"e","date":"2026-09-01","content":"x","updatedAt":1,"photoRefs":["h1","h3"]}]}"#)
        let refs = Set(Merge.merge(local: local, cloud: cloud).objects("journalEntries").first!.strings("photoRefs"))
        XCTAssertEqual(refs, ["h2", "h3"])
    }

    func testHifzNewerGenerationWinsWhole() {
        let a = obj(#"{"planId":"g1","planUpdatedAt":10,"frontierId":50,"sessions":[{"id":"s1","date":"2026-09-01","fromId":1,"toId":50}]}"#)
        let b = obj(#"{"planId":"g2","planUpdatedAt":20,"frontierId":0,"sessions":[]}"#)
        let m = Merge.mergeHifz(a, b, now: 0)
        XCTAssertEqual(m.str("planId"), "g2")
        XCTAssertEqual(m.objects("sessions").count, 0)
    }

    func testWirdUnionRespectsTombstone() {
        let local = obj(#"{"lastUpdated":"z","quranWird":["2026-09-01"],"deleted":{"wird:2026-09-02":\#(DateKey.nowMs())}}"#)
        let cloud = obj(#"{"lastUpdated":"a","quranWird":["2026-09-02","2026-09-03"]}"#)
        XCTAssertEqual(Merge.merge(local: local, cloud: cloud).strings("quranWird"), ["2026-09-01", "2026-09-03"])
    }

    func testFirestoreValueRoundTrip() {
        let v = obj(#"{"a":1,"b":1.5,"c":"x","d":[true,null],"e":{"f":2}}"#)
        let back = FirestoreValue.decodeFields(FirestoreValue.encodeFields(v))
        XCTAssertEqual(back, v)
    }

    func testMediaWebHashMatchesWeb() {
        // SHA-256("data:image/png;base64,AAAA")[:32] كما يحسبه `photoHash` في الويب.
        XCTAssertEqual(MediaStore.webHash("data:image/png;base64,AAAA"), "bde6da8e9d3902a86a1452ec62648cd0")
        XCTAssertEqual(MediaStore.hash(of: "r2:abc"), "abc")
    }
}
