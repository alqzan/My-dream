import SwiftUI

/// «نزل الراتب»: يعرض الفائض المحسوب ويسمح بتصحيحه **نزولاً فقط** قبل ترحيله.
struct SalarySheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var carry = ""

    var body: some View {
        let computed = max(0, round2(BudgetEngine.status(store.data)?.balance ?? 0))
        NavigationStack {
            Form {
                Section {
                    LabeledContent("الفائض المحسوب", value: "\(Fmt.amount(computed)) ر.س")
                    TextField("المُرحَّل فعلاً (اختياري)", text: $carry).keyboardType(.decimalPad)
                } footer: {
                    Text("الفائض يُرحَّل إلى «الفوائض». إن كان في حسابك أقلّ ممّا يقوله التطبيق فاكتب الأصدق — لا يُقبل رقمٌ أعلى من المحسوب.")
                }
                let funded = store.data.reserves.filter { $0.fundingPerCycle != nil }
                if !funded.isEmpty {
                    Section("تمويل المظاريف لهذه الدورة") {
                        ForEach(funded) { f in
                            LabeledContent("\(f.icon) \(f.name)", value: "\(Fmt.amount(f.fundingPerCycle ?? 0)) · \(f.fundingSource == "surplus" ? "من الفوائض" : "من الراتب")")
                        }
                    }
                }
            }
            .navigationTitle("نزل الراتب")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("أكّد") {
                        let v = Double(carry.replacingOccurrences(of: "٫", with: "."))
                        store.confirmSalary(carryOverride: v)
                        dismiss()
                    }.bold()
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

struct FinanceSettings: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State private var daily = ""
    @State private var income = ""
    @State private var salaryDay = 27
    @State private var reconcile = ""
    @State private var reconciled: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("المصروف اليومي", text: $daily).keyboardType(.decimalPad)
                    if let b = store.data.dailyBudget, b.fundingPerDay > 0 {
                        Text("ينقص منه \(Fmt.amount(b.fundingPerDay)) يومياً لتمويل المظاريف، فالفعليّ \(Fmt.amount(BudgetEngine.effectiveRate(amount: b.amount, perDay: b.fundingPerDay))).")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } header: { Text("المصروف اليومي") } footer: {
                    Text("تغيير المبلغ يبدأ حساباً جديداً من اليوم.")
                }
                Section("الراتب") {
                    Stepper("يوم نزول الراتب: \(Fmt.count(salaryDay))", value: $salaryDay, in: 1...31)
                    TextField("الدخل الشهري (للسقوف بالنسبة)", text: $income).keyboardType(.decimalPad)
                }
                Section {
                    Toggle("المقاصة التلقائية", isOn: Binding(get: { store.data.autoOffset }, set: { v in store.update { $0.autoOffset = v } }))
                    Picker("نافذة السقوف", selection: Binding(get: { store.data.rest.str("budgetWindow") ?? "salary" },
                                                             set: { v in store.update { $0.rest.put("budgetWindow", v) } })) {
                        Text("دورة الراتب").tag("salary")
                        Text("الشهر الميلادي").tag("month")
                    }
                } footer: {
                    Text("عجزٌ صغير (حتى ثلاث يوميّات) يُغطّى من «الفوائض» تلقائياً؛ ما فوقه حدثٌ يستحقّ قرارك.")
                }
                Section {
                    NavigationLink("الأقسام") { CategoriesEditor() }
                    NavigationLink("السقوف") { CapsEditor() }
                }
                Section {
                    TextField("مجموع أرصدتك في الكشوف", text: $reconcile).keyboardType(.decimalPad)
                    Button("طابِق") {
                        if let v = Double(reconcile.replacingOccurrences(of: "٫", with: ".")) {
                            store.recordReconcile(actual: v)
                            reconciled = "سُجّلت المطابقة."
                            reconcile = ""
                        }
                    }
                    if let r = reconciled { Text(r).foregroundStyle(Theme.finance) }
                } header: { Text("المطابقة الربعية") } footer: {
                    let last = store.lastReconcileDate
                    Text("رقمٌ واحد من كشوف حساباتك يقابل ما يظنّه التطبيق (\(Fmt.amount(BudgetEngine.holdings(store.data, today: DateKey.today())))). الفرقُ يُسجَّل تسويةً على «الفوائض».\(last.map { " آخر مطابقة: \(Fmt.shortDate(key: $0))." } ?? "")")
                }
            }
            .navigationTitle("إعدادات المال")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("حفظ") { save(); dismiss() }.bold() }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                daily = store.data.dailyBudget.map { String($0.amount) } ?? ""
                income = store.data.monthlyIncome.map { String($0) } ?? ""
                salaryDay = store.data.salaryDay
            }
        }
    }

    private func num(_ s: String) -> Double? { Double(s.replacingOccurrences(of: "٫", with: ".")) }

    private func save() {
        if let d = num(daily), d > 0, d != store.data.dailyBudget?.amount { store.setDailyBudget(amount: d) }
        let inc = num(income)
        if inc != store.data.monthlyIncome { store.update { $0.monthlyIncome = inc } }
        if salaryDay != store.data.salaryDay { store.update { $0.salaryDay = salaryDay } }
    }
}

struct CategoriesEditor: View {
    @EnvironmentObject var store: Store
    @State private var newLabel = ""
    @State private var newIcon = "📌"

    var body: some View {
        List {
            ForEach(store.data.categories) { c in
                HStack {
                    Text(c.icon)
                    Text(c.label)
                    if c.parentId != nil { Text("فرعي").font(.caption).foregroundStyle(.secondary) }
                }
            }
            .onDelete { idx in
                let ids = idx.map { store.data.categories[$0].id }
                store.update { d in
                    d.categories.removeAll { ids.contains($0.id) }
                    ids.forEach { d.tombstone($0) }
                }
            }
            Section("قسم جديد") {
                HStack {
                    TextField("😀", text: $newIcon).frame(width: 44)
                    TextField("الاسم", text: $newLabel)
                    Button("أضف") {
                        let c = FinanceCategory(id: "cat-\(UUID().uuidString.prefix(8).lowercased())", label: newLabel, icon: newIcon.isEmpty ? "📌" : newIcon, color: "#8a6fb0")
                        store.update { $0.categories.append(c) }
                        newLabel = ""
                    }
                    .disabled(newLabel.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
        .navigationTitle("الأقسام")
    }
}

struct CapsEditor: View {
    @EnvironmentObject var store: Store

    var body: some View {
        Form {
            ForEach(store.data.categories.filter { $0.parentId == nil }) { c in
                let b = store.data.budgets.first { $0.category == c.id }
                HStack {
                    Text("\(c.icon) \(c.label)")
                    Spacer()
                    TextField("بلا سقف", text: Binding(
                        get: { b?.limit.map { String(Int($0)) } ?? "" },
                        set: { v in setCap(c.id, Double(v)) }))
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.leading)
                        .frame(width: 110)
                }
            }
        }
        .navigationTitle("السقوف")
    }

    private func setCap(_ id: String, _ v: Double?) {
        store.update { d in
            d.budgets.removeAll { $0.category == id }
            if let v, v > 0 {
                var b = Budget(raw: ["category": .string(id), "limit": .number(v)])
                b.stamp()
                d.budgets.append(b)
            }
        }
    }
}
