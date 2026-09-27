import Foundation
import SwiftUI

/// صندوق رسائل البنك: رسائلُ تصل من أتمتة iOS (إلى Firestore كما في الويب،
/// أو مباشرةً عبر اختصار «أرسل لمدار») فتُحلَّل وتنتظر قرار المالك.
@MainActor
final class BankInbox: ObservableObject {
    struct Item: Identifiable, Equatable {
        let id: String
        let text: String
        let from: String?
        let ts: String?
        let cloud: Bool
        var event: BankParser.Event?
    }

    @Published private(set) var items: [Item] = []
    @Published private(set) var loading = false
    weak var store: Store?
    private let fs = Firestore()
    private let localKey = "bank-inbox-local"

    var expenses: [Item] { items.filter { $0.event?.isExpense == true || $0.event?.kind == "unknown" || $0.event?.kind == "transfer_out" } }
    var noise: [Item] { items.filter { !expenses.contains($0) } }

    /// رسالةٌ من اختصار iOS — تُحفظ محليّاً حتى يُبتّ فيها.
    func addLocal(_ text: String, from: String?) {
        var saved = UserDefaults.standard.array(forKey: localKey) as? [[String: String]] ?? []
        saved.append(["id": "local:\(UUID().uuidString)", "text": text, "from": from ?? "", "ts": ISO8601DateFormatter().string(from: Date())])
        UserDefaults.standard.set(saved, forKey: localKey)
        Task { await refresh() }
    }

    private func decode(_ f: RawObject) -> String {
        let raw = f.str("text") ?? ""
        switch f.str("enc") {
        case "b64": return Data(base64Encoded: raw.replacingOccurrences(of: "\\s+", with: "", options: .regularExpression)).flatMap { String(data: $0, encoding: .utf8) } ?? raw
        case "url": return raw.removingPercentEncoding ?? raw
        default: return raw
        }
    }

    func refresh() async {
        guard let store else { return }
        loading = true
        defer { loading = false }
        var out: [Item] = []
        if let space = SyncKey.value, let docs = try? await fs.list("userData/\(space)/inbox") {
            for d in docs {
                let id = String(d.name.split(separator: "/").last ?? "")
                out.append(Item(id: id, text: decode(d.fields), from: d.fields.str("from"), ts: d.fields.str("ts"), cloud: true))
            }
        }
        for o in UserDefaults.standard.array(forKey: localKey) as? [[String: String]] ?? [] {
            out.append(Item(id: o["id"] ?? UUID().uuidString, text: o["text"] ?? "", from: o["from"], ts: o["ts"], cloud: false))
        }
        let known = Set(store.data.transactions.compactMap { $0.raw.str("sourceKey") })
        items = out.compactMap { item in
            var i = item
            let ref = item.ts.flatMap { $0.count >= 10 ? String($0.prefix(10)) : nil } ?? DateKey.today()
            i.event = BankParser.parse(item.text, reference: ref, sender: item.from, receivedAt: item.ts)
            if let e = i.event, e.isExpense {
                i.event?.category = BankParser.suggestCategory(e.note, categories: store.data.categories, rules: store.data.rest.obj("merchantRules") ?? [:])
            }
            // رسالةٌ سُجّلت من قبل (بصمة المصدر نفسها) لا تُعرض ثانيةً.
            if let k = i.event?.sourceKey, known.contains(k) {
                Task { await self.remove(item) }
                return nil
            }
            return i
        }.sorted { ($0.ts ?? "") > ($1.ts ?? "") }
    }

    func remove(_ item: Item) async {
        items.removeAll { $0.id == item.id }
        if item.cloud, let space = SyncKey.value {
            try? await fs.delete("userData/\(space)/inbox/\(item.id)")
        } else {
            let saved = (UserDefaults.standard.array(forKey: localKey) as? [[String: String]] ?? []).filter { $0["id"] != item.id }
            UserDefaults.standard.set(saved, forKey: localKey)
        }
    }

    /// يعتمد الرسالة مصروفاً: القسمُ المختار يُتعلَّم للتاجر، والوجهة كما في النموذج.
    func accept(_ item: Item, amount: Double, category: String, note: String, destination: String) async {
        guard let store, let e = item.event else { return }
        var t = Transaction.new(date: e.date, amount: amount, category: category, note: note)
        t.raw.put("kind", e.kind == "unknown" ? "purchase" : e.kind)
        t.raw.put("direction", "out")
        t.raw.put("time", e.time)
        t.raw.put("bank", e.bank)
        t.raw.put("account", e.account)
        t.raw.put("fee", e.fee > 0 ? e.fee : nil)
        t.raw.put("balanceAfter", e.balanceAfter)
        t.raw.put("counterparty", e.counterparty)
        t.raw.put("sourceKey", e.sourceKey)
        t.raw.put("eventId", "\(item.id):0")
        if item.cloud { t.raw.put("sourceInboxId", item.id) }
        t.raw.put("sourceReceivedAt", item.ts)
        t.raw.put("rawText", e.rawText)
        t.raw.put("confidence", e.confidence)
        if destination == "off" { t.offBudget = true } else if destination != "daily" { t.setReserveSplits([(destination, 100)]) }
        store.saveTransaction(t)
        let key = BankParser.normalizeMerchant(note)
        if !key.isEmpty {
            store.update { d in
                var rules = d.rest.obj("merchantRules") ?? [:]
                rules.put(key, category)
                d.rest.put("merchantRules", rules)
                var f = d.rest.obj("fieldUpdatedAt") ?? [:]
                f.put("merchant:\(key)", DateKey.nowMs())
                d.rest.put("fieldUpdatedAt", f)
            }
        }
        await remove(item)
    }
}

struct BankInboxView: View {
    @EnvironmentObject var inbox: BankInbox
    @EnvironmentObject var store: Store
    @State private var reviewing: BankInbox.Item?
    @State private var paste = ""

    var body: some View {
        MdrList {
            if inbox.items.isEmpty && !inbox.loading {
                ContentUnavailableView("لا رسائل تنتظر", systemImage: "tray",
                                       description: Text("تصل رسائل البنك هنا من أتمتة iOS، أو الصق رسالةً بالأسفل."))
            }
            if !inbox.expenses.isEmpty {
                Section("مصاريف تنتظر قرارك") {
                    ForEach(inbox.expenses) { item in
                        Button { reviewing = item } label: { row(item) }.buttonStyle(.plain)
                            .swipeActions { Button("تجاهل", role: .destructive) { Task { await inbox.remove(item) } } }
                    }
                }
            }
            if !inbox.noise.isEmpty {
                Section {
                    ForEach(inbox.noise) { item in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(kindLabel(item.event?.kind)).font(.mdrCaption.weight(.semibold)).foregroundStyle(Mdr.ink52)
                            Text(item.text).font(.mdrCaption).lineLimit(2)
                        }
                        .swipeActions { Button("امسح", role: .destructive) { Task { await inbox.remove(item) } } }
                    }
                    Button("امسح الكلّ", role: .destructive) { Task { for i in inbox.noise { await inbox.remove(i) } } }
                } header: { Text("لا تحتاج قراراً") } footer: {
                    Text("رموز تحقّق وإشعارات ووارد — لا تدخل مصروفك.")
                }
            }
            Section("الصق رسالة بنك") {
                TextField("نصّ الرسالة", text: $paste, axis: .vertical).lineLimit(2...6)
                Button("أضف للمراجعة") { inbox.addLocal(paste, from: nil); paste = "" }
                    .disabled(paste.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .navigationTitle("رسائل البنك")
        .refreshable { await inbox.refresh() }
        .task { await inbox.refresh() }
        .sheet(item: $reviewing) { item in InboxReview(item: item) }
    }

    private func row(_ item: BankInbox.Item) -> some View {
        let e = item.event
        let cat = store.data.categories.first { $0.id == e?.category } ?? .unknown
        return HStack(spacing: 12) {
            Text(cat.icon).font(.mdrTitle3)
            VStack(alignment: .leading, spacing: 2) {
                Text(e?.note ?? "رسالة").lineLimit(1)
                HStack(spacing: 6) {
                    Text(Fmt.shortDate(key: e?.date ?? DateKey.today()))
                    if let r = e?.reviewReason { Text(r).foregroundStyle(Theme.brand).lineLimit(1) }
                }
                .font(.mdrCaption).foregroundStyle(Mdr.ink52)
            }
            Spacer()
            Text(e.map { $0.amount > 0 ? Fmt.amount($0.amount) : "؟" } ?? "؟").font(.mdrHeadline).monospacedDigit()
        }
    }

    private func kindLabel(_ k: String?) -> String {
        switch k {
        case "otp": return "رمز تحقّق"
        case "declined": return "عملية مرفوضة"
        case "hold": return "حجز مؤقت"
        case "salary": return "راتب"
        case "transfer_in", "deposit", "refund", "cashback", "reversal": return "وارد"
        case "statement": return "كشف حساب"
        case "card_settle": return "سداد بطاقة"
        case "self_transfer": return "تحويل بين حساباتك"
        default: return "إشعار"
        }
    }
}

struct InboxReview: View {
    @EnvironmentObject var inbox: BankInbox
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let item: BankInbox.Item
    @State private var amount = ""
    @State private var note = ""
    @State private var category = ""
    @State private var destination = "daily"

    var body: some View {
        NavigationStack {
            MdrForm {
                Section { Text(item.text).font(.mdrCallout).foregroundStyle(Mdr.ink52) }
                Section {
                    TextField("المبلغ", text: $amount).keyboardType(.decimalPad).font(.mdrTitle2.bold())
                    TextField("التاجر / الملاحظة", text: $note)
                    Picker("القسم", selection: $category) {
                        ForEach(store.data.categories) { c in Text("\(c.icon) \(c.label)").tag(c.id) }
                    }
                    Picker("من أين؟", selection: $destination) {
                        Text("المصروف اليومي").tag("daily")
                        ForEach(store.data.reserves.filter { $0.role != "surplus" }) { f in Text("\(f.icon) \(f.name)").tag(f.id) }
                        Text("خارج الميزانيات").tag("off")
                    }
                }
                if let r = item.event?.reviewReason { Section { Label(r, systemImage: "exclamationmark.circle").foregroundStyle(Theme.brand) } }
            }
            .navigationTitle("مراجعة")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("سجّل المصروف") {
                        let v = Double(BankParser.normalizeDigits(amount)) ?? 0
                        Task { await inbox.accept(item, amount: v, category: category, note: note, destination: destination); dismiss() }
                    }
                    .bold()
                    .disabled((Double(BankParser.normalizeDigits(amount)) ?? 0) <= 0)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                let e = item.event
                amount = e.map { $0.amount > 0 ? String($0.amount) : "" } ?? ""
                note = e?.note ?? ""
                category = e?.category ?? store.data.categories.first?.id ?? ""
                if let fund = BudgetEngine.tripSplit(store.data.reserves, date: e?.date ?? DateKey.today(), today: DateKey.today()) { destination = fund }
            }
        }
    }
}
