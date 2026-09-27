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
    @State private var bigTarget = "new"
    @State private var bigName = ""
    @State private var bigPlan: BudgetEngine.PlanKind = .mix
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
            MdrForm {
                Section {
                    HStack(alignment: .firstTextBaseline) {
                        TextField("٠", text: $amountText).accessibilityIdentifier("expense.amount")
                            .keyboardType(.decimalPad)
                            .font(Mdr.font(44, black: true))
                            .focused($amountFocused)
                        Text("ر.س").foregroundStyle(Mdr.ink52)
                    }
                    if weight.big && destination == "daily" {
                        Label("يعادل \(Digits.indic(String(weight.days))) يوماً من مصروفك — أهو حدثٌ له مظروف؟", systemImage: "exclamationmark.circle")
                            .font(.mdrFootnote).foregroundStyle(Theme.brand)
                    }
                }

                Section("القسم") { categoryGrid }

                Section {
                    TextField("ملاحظة (المكان، الغرض)", text: Binding(get: { t.note }, set: { t.note = $0 })).accessibilityIdentifier("expense.note")
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

                if weight.big && isNew && destination == "daily" { bigExpenseSection(rate: rate) }

                if !isNew {
                    Section { Button("حذف المصروف", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle(isNew ? "مصروف جديد" : "تعديل المصروف")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("حفظ") { save() }.bold().disabled(amount <= 0).accessibilityIdentifier("expense.save") }
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
                Text(c.icon).font(.mdrTitle3)
                Text(c.label).font(.mdrCaption).lineLimit(1)
            }
            .frame(maxWidth: .infinity, minHeight: 60)
            .background(on ? color.opacity(0.22) : Mdr.line, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(on ? color : .clear, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
    }

    /// المصروف الكبير: الوجهةُ أوّلاً (مظروفٌ قائم · جديدٌ باسمك · اليوميّ)، ثمّ من أين يُموَّل.
    @ViewBuilder private func bigExpenseSection(rate: Double) -> some View {
        let options = planOptions(rate: rate)
        Section {
            Picker("على أيّ مظروف؟", selection: $bigTarget) {
                Text("مظروف جديد").tag("new")
                ForEach(store.data.reserves.filter { BudgetEngine.isTripEligible($0) }) { f in Text("\(f.icon) \(f.name)").tag(f.id) }
                Text("من مصروفي اليومي").tag("daily")
            }
            if bigTarget == "new" {
                TextField("اسمه (رحلة المدينة، صيانة السيارة…)", text: $bigName)
            }
            if bigTarget != "daily" {
                ForEach(options) { o in
                    Button { bigPlan = o.kind } label: {
                        HStack(alignment: .top) {
                            Image(systemName: bigPlan == o.kind ? "largecircle.fill.circle" : "circle").foregroundStyle(Theme.finance)
                            VStack(alignment: .leading, spacing: 3) {
                                HStack { Text(o.title).font(.mdrSubheadline.weight(.semibold)); if o.recommended { Pill(text: "الموصى به", color: Theme.finance) } }
                                Text(summary(o)).font(.mdrCaption).foregroundStyle(Mdr.ink52)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        } header: {
            Text("مصروفٌ كبير — يعادل \(Digits.indic(String(BudgetEngine.expenseWeight(amount: amount, daily: rate).days))) يوماً من مصروفك")
        } footer: {
            Text("الصدمة الكبيرة لا تدخل المصروف اليومي: تدخل مظروفاً، والمظروف يُموَّل على دورات.")
        }
    }

    private func planOptions(rate: Double) -> [BudgetEngine.PlanOption] {
        let today = DateKey.today()
        let st = BudgetEngine.status(store.data, today: today)
        let surplus = BudgetEngine.surplusFund(store.data.reserves).map { BudgetEngine.reserveBalance($0, store.data.transactions) } ?? 0
        let next = BudgetEngine.upcomingSalaryDate(store.data.salaryDay, store.data.lastSalaryConfirm, today)
        return BudgetEngine.planOptions(amount: amount, cycleBalance: st?.balance ?? 0, rate: rate, surplus: max(0, surplus),
                                        cycleLen: BudgetEngine.cycleLength(store.data.salaryDay, today),
                                        daysLeft: max(1, DateKey.days(from: today, to: next)))
    }

    private func summary(_ o: BudgetEngine.PlanOption) -> String {
        var parts: [String] = []
        if o.plan.fromCycle > 0 { parts.append("\(Fmt.amount(o.plan.fromCycle)) من رصيدك") }
        if o.plan.fromSurplus > 0 { parts.append("\(Fmt.amount(o.plan.fromSurplus)) من الفوائض") }
        if o.plan.financed > 0 { parts.append("\(Fmt.amount(o.plan.perCycle)) × \(Fmt.count(o.plan.cycles)) دورات") }
        parts.append("مصروفك بعدها \(Fmt.amount(o.rateAfter))")
        if o.kind == .fromBudget { parts.append("وتيرة بقيّة الدورة \(Fmt.amount(o.paceAfter))") }
        return parts.joined(separator: " · ")
    }

    /// تنفيذ الخطة مع حفظ المصروف — أو لا تقع أبداً (لا مظروف فارغ ولا خطة بلا مصروف).
    private func applyBigPlan(_ x: inout Transaction, rate: Double) {
        guard bigTarget != "daily", let o = planOptions(rate: rate).first(where: { $0.kind == bigPlan }), o.kind != .fromBudget else { return }
        let fundId: String
        if bigTarget == "new" {
            fundId = "fund-expense:\(x.id)"
            var f = ReserveFund.new(name: bigName.trimmingCharacters(in: .whitespaces).isEmpty ? (x.note.isEmpty ? "حدث" : x.note) : bigName, icon: "🎒", target: nil)
            f.raw.put("id", fundId)
            f.raw.put("color", "#8a6fb0")
            store.saveFund(f)
        } else { fundId = bigTarget }
        if o.plan.fromSurplus > 0, let s = BudgetEngine.surplusFund(store.data.reserves) {
            store.transfer(from: s.id, to: fundId, amount: o.plan.fromSurplus)
        }
        if o.plan.financed > 0 && o.plan.perCycle > 0, var f = store.data.reserves.first(where: { $0.id == fundId }) {
            f.setFunding(perCycle: o.plan.perCycle, source: "salary", stop: "zero")
            store.saveFund(f)
        }
        let pct = amount > 0 ? max(1, min(100, Int(((amount - o.plan.fromCycle) / amount * 100).rounded()))) : 100
        x.setReserveSplits([(fundId, Double(pct))])
    }

    private func save() {
        var x = t
        x.amount = amount
        x.offBudget = destination == "off"
        if destination == "daily" || destination == "off" { x.setReserveSplits([]) }
        else { x.setReserveSplits([(destination, 100)]) }
        let rate = BudgetEngine.status(store.data)?.rate ?? 0
        if isNew && destination == "daily" && BudgetEngine.expenseWeight(amount: amount, daily: rate).big { applyBigPlan(&x, rate: rate) }
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
        MdrList {
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
