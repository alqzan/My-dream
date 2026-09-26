import Foundation

/// ملخّصٌ مبسّط لدفتر البطاقات الائتمانية — **للعرض فقط**.
/// الويب يوزّع كلَّ سدادٍ على المشتريات زمنياً (`creditLedger.ts`)؛ هنا نكتفي
/// بالصافي لكلّ بطاقة: المشتريات − الاستردادات − السدادات + ما فسّرته التسويات.
/// لا يُكتب منه شيءٌ في البيانات، فلا يمكن أن يُفسد دفتر الويب.
enum CardLedger {
    struct Card: Identifiable {
        let id: String
        let label: String
        var charges: Double = 0
        var refunds: Double = 0
        var settlements: Double = 0
        var resolved: Double = 0
        /// موجب = مستحقّ لم يُسدَّد · سالب = سدادٌ زائد لم يُفسَّر.
        var net: Double { round2(charges - refunds - settlements + resolved) }
    }

    private static let chargeKinds: Set<String> = ["purchase", "atm", "bill", "installment", "fee"]

    private static func last4(_ s: String?) -> String {
        String((s ?? "").filter(\.isNumber).suffix(4))
    }

    /// البطاقات الائتمانية المؤكَّدة من المالك وحدها (كما في الويب: وسمُ Visa ليس دليلاً).
    static func summarize(data: AppData) -> [Card] {
        let accounts = data.rest.objects("accounts").filter {
            $0.str("kind") == "card" && ($0.bool("isOwn") ?? false) && $0.str("fundingKind") == "credit"
                && $0.str("archivedAt") == nil
        }
        guard !accounts.isEmpty else { return [] }
        var cards: [String: Card] = [:]
        var order: [String] = []
        for a in accounts {
            guard let id = a.str("id") else { continue }
            let label = a.str("label") ?? "\(a.str("bank") ?? "") •••• \(Digits.indic(last4(a.str("last4"))))"
            cards[id] = Card(id: id, label: label)
            order.append(id)
        }
        func cardId(_ o: RawObject) -> String? {
            if let d = o.str("cardId") ?? o.str("accountId"), cards[d] != nil { return d }
            let l = last4(o.str("cardLast4") ?? o.str("account"))
            guard !l.isEmpty else { return nil }
            let bank = o.str("bank")?.lowercased()
            return accounts.first {
                last4($0.str("last4")) == l && (bank == nil || $0.str("bank")?.lowercased() == bank)
            }?.str("id")
        }
        for t in data.transactions {
            guard let id = cardId(t.raw) else { continue }
            let amt = max(0, t.amount)
            if t.direction == "out", chargeKinds.contains(t.kind ?? "") {
                cards[id]?.charges += amt
            } else if t.direction == "in", ["refund", "reversal"].contains(t.kind ?? ""),
                      t.raw.str("refundDestination") != "person_bank" {
                cards[id]?.refunds += amt
            }
        }
        for s in data.rest.objects("settlements") {
            guard let id = cardId(s), let a = s.num("amount"), a > 0 else { continue }
            cards[id]?.settlements += a
        }
        for r in data.rest.objects("settlementResolutions") {
            guard let id = cardId(r), let a = r.num("amount"), a > 0 else { continue }
            cards[id]?.resolved += a
        }
        return order.compactMap { cards[$0] }
    }
}
