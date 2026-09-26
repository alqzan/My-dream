import SwiftUI

/// تسجيل مصروفٍ أو تعديله. المبلغُ أوّلاً بلوحةٍ كبيرة، ثمّ القسم، ثمّ الوجهة.
/// المصروفُ الكبير (≥ ٣ يوميّات) يُسأل عن وجهته قبل أن يمسّ المصروف اليومي.
struct ExpenseEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var t: Transaction
    @State private var amountText: String
    @State private var destination: String   // "daily" | "off" | fundId
    @State private var confirmDelete = false
    @FocusState private var amountFocused: Bool
    private let isNew: Bool

    init(transaction: Transaction) {
        _t = State(initialValue: transaction)
        isNew = transaction.amount == 0
        _amountText = State(initialValue: transaction.amount == 0 ? "" : Self.plain(transaction.amount))
        let dest = transaction.offBudget ? "off" : (transaction.reserveSplits.first?.fundId ?? "daily")
        _destination = State(initialValue: dest)
    }

    private static func plain(_ v: Double) -> String {
        v == v.rounded() ? String(Int(v)) : String(v)
    }

    /// يقبل الأرقام الهندية واللاتينية والفاصلة العربية.
    private var amount: Double {
        let map: [Character: Character] = ["٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".", ",": "."]
        return Double(String(amountText.map { map[$0] ?? $0 })) ?? 0
    }

    var body: some View {
        let rate = BudgetEngine.status(store.data)?.rate ?? 0
        let weight = BudgetEngine.expenseWeight(amount: amount, daily: rate)
        NavigationStack {
            Form {
                Section {
                    HStack(alignment: .firstTextBaseline) {
                        TextField("٠", text: $amountText)
                            .keyboardType(.decimalPad)
                            .font(.system(size: 44, weight: .bold, design: .rounded))
                            .focused($amountFocused)
                        Text("ر.س").foregroundStyle(.secondary)
                    }
                    if weight.big && destination == "daily" {
                        Label("يعادل \(Digits.indic(String(weight.days))) يوماً من مصروفك — أهو حدثٌ له مظروف؟", systemImage: "exclamationmark.circle")
                            .font(.footnote).foregroundStyle(Theme.brand)
                    }
                }

                Section("القسم") { categoryGrid }

                Section {
                    TextField("ملاحظة (المكان، الغرض)", text: Binding(get: { t.note }, set: { t.note = $0 }))
                    DatePicker("التاريخ", selection: Binding(get: { DateKey.date(t.date) ?? Date() }, set: { t.date = DateKey.string($0) }),
                               in: ...Date(), displayedComponents: .date)
                }

                Section {
                    Picker("من أين؟", selection: $destination) {
                        Text("المصروف اليومي").tag("daily")
                        ForEach(store.data.reserves.filter { $0.role != "surplus" }) { f in Text("\(f.icon) \(f.name)").tag(f.id) }
                        Text("خارج الميزانيات").tag("off")
                    }
                } footer: {
                    Text(destinationHint)
                }

                if !isNew {
                    Section { Button("حذف المصروف", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(isNew ? "مصروف جديد" : "تعديل المصروف")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("حفظ") { save() }.bold().disabled(amount <= 0) }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear { if isNew { amountFocused = true } }
            .confirmationDialog("حذف المصروف؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف", role: .destructive) { store.deleteTransaction(t.id); dismiss() }
            }
        }
    }

    private var destinationHint: String {
        switch destination {
        case "daily": return "يُخصم من مصروفك اليومي ومن سقف قسمه."
        case "off": return "صرفٌ حقيقيّ يظهر في السجلّ، لكنّه استثناءٌ لا يُحاسَب عليه مصروفك."
        default: return "يُخصم من المظروف — مالٌ جمعته من قبل، فلا يمسّ مصروف اليوم."
        }
    }

    private var categoryGrid: some View {
        let mains = store.data.categories.filter { $0.parentId == nil }
        return LazyVGrid(columns: [GridItem(.adaptive(minimum: 88), spacing: 8)], spacing: 8) {
            ForEach(mains) { c in chip(c) }
            ForEach(store.data.categories.filter { $0.parentId != nil && ($0.parentId == t.category || $0.parentId == BudgetEngine.mainCategory(store.data.categories, t.category).id) }) { c in chip(c) }
        }
        .padding(.vertical, 4)
    }

    private func chip(_ c: FinanceCategory) -> some View {
        let on = t.category == c.id
        let color = Color(hexString: c.color)
        return Button { t.category = c.id; Haptic.tap() } label: {
            VStack(spacing: 4) {
                Text(c.icon).font(.title3)
                Text(c.label).font(.caption).lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(on ? color.opacity(0.22) : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? color : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    private func save() {
        var x = t
        x.amount = amount
        x.offBudget = destination == "off"
        if destination == "daily" || destination == "off" { x.setReserveSplits([]) }
        else { x.setReserveSplits([(destination, 100)]) }
        store.saveTransaction(x)
        dismiss()
    }
}

/// كلّ المصاريف مجمّعةً باليوم، مع بحث.
struct TransactionsList: View {
    @EnvironmentObject var store: Store
    @State private var search = ""
    @State private var editing: Transaction?

    var body: some View {
        let q = search.trimmingCharacters(in: .whitespaces)
        let list = store.data.transactions
            .filter { q.isEmpty || $0.note.localizedCaseInsensitiveContains(q) }
            .sorted { $0.date > $1.date }
        let days = Dictionary(grouping: list, by: \.date).sorted { $0.key > $1.key }
        List {
            ForEach(days, id: \.key) { entry in
                let day = entry.key, items = entry.value
                Section {
                    ForEach(items) { t in
                        Button { editing = t } label: { TransactionRow(t: t) }.buttonStyle(.plain)
                            .swipeActions { Button(role: .destructive) { store.deleteTransaction(t.id) } label: { Label("حذف", systemImage: "trash") } }
                    }
                } header: {
                    HStack {
                        Text(Fmt.shortDate(key: day))
                        Spacer()
                        Text(Fmt.amount(items.reduce(0) { $0 + BudgetEngine.cashOut($1) })).monospacedDigit()
                    }
                }
            }
        }
        .searchable(text: $search, prompt: "ابحث في الملاحظات")
        .navigationTitle("المصاريف")
        .sheet(item: $editing) { ExpenseEditor(transaction: $0) }
    }
}
