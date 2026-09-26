import SwiftUI

struct FundDetail: View {
    @EnvironmentObject var store: Store
    let fundId: String
    @State private var editing = false
    @State private var moveSheet: MoveKind?
    @State private var confirmDelete = false
    @Environment(\.dismiss) private var dismiss

    enum MoveKind: String, Identifiable { case deposit, withdraw, toDaily, transfer; var id: String { rawValue } }

    var body: some View {
        if let f = store.data.reserves.first(where: { $0.id == fundId }) {
            let bal = BudgetEngine.reserveBalance(f, store.data.transactions)
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(Fmt.amount(bal)).font(.system(size: 40, weight: .bold, design: .rounded))
                            .foregroundStyle(bal < 0 ? Theme.danger : .primary)
                        if let t = f.target, t > 0 {
                            ProgressView(value: max(0, min(1, bal / t))).tint(Theme.finance)
                            Text("الهدف \(Fmt.amount(t))").font(.caption).foregroundStyle(.secondary)
                        }
                        if let per = f.fundingPerCycle {
                            Text("\(Fmt.amount(per)) كلّ دورة \(f.fundingSource == "surplus" ? "من الفوائض" : "من الراتب")\(f.fundingStop == "zero" ? " حتى يصفر العجز" : f.fundingStop == "target" ? " حتى الهدف" : "")")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    Button { moveSheet = .deposit } label: { Label("إيداع", systemImage: "arrow.down.circle") }
                    Button { moveSheet = .withdraw } label: { Label("سحب يدويّ", systemImage: "arrow.up.circle") }
                    if store.data.dailyBudget != nil {
                        Button { moveSheet = .toDaily } label: { Label("إلى المصروف اليومي", systemImage: "arrow.uturn.left.circle") }
                    }
                    if store.data.reserves.count > 1 {
                        Button { moveSheet = .transfer } label: { Label("نقل إلى مظروف آخر", systemImage: "arrow.left.arrow.right.circle") }
                    }
                }

                if BudgetEngine.isTripEligible(f) {
                    Section("وضع السفر") {
                        if f.runningTrip != nil {
                            if let s = BudgetEngine.tripSummary(f, store.data.transactions, today: DateKey.today()) {
                                LabeledContent("كلّفت حتى الآن", value: Fmt.amount(s.total))
                                LabeledContent("في \(Fmt.count(s.days)) يوم", value: "\(Fmt.amount(s.perDay)) لليوم")
                            }
                            Button("أنهِ الرحلة") { store.endTrip(f.id) }
                        } else {
                            Button("ابدأ رحلة على هذا المظروف") { store.startTrip(f.id) }
                            Text("كلُّ مصروفٍ تسجّله أثناءها يُحسب عليه تلقائياً.").font(.caption).foregroundStyle(.secondary)
                            if let s = BudgetEngine.tripSummary(f, store.data.transactions, today: DateKey.today()), !s.ongoing {
                                LabeledContent("آخر رحلة", value: "\(Fmt.amount(s.total)) في \(Fmt.count(s.days)) يوم")
                            }
                        }
                    }
                }

                Section("الحركة") {
                    ForEach(movements(f), id: \.id) { m in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(m.title).lineLimit(1)
                                Text(Fmt.shortDate(key: m.date)).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text((m.amount >= 0 ? "+" : "−") + Fmt.amount(abs(m.amount))).monospacedDigit()
                                .foregroundStyle(m.amount >= 0 ? Theme.finance : .primary)
                        }
                    }
                }

                if f.role == "custom" {
                    Section { Button("حذف المظروف", role: .destructive) { confirmDelete = true } }
                }
            }
            .navigationTitle("\(f.icon) \(f.name)")
            .toolbar { Button("تعديل") { editing = true } }
            .sheet(isPresented: $editing) { FundEditor(fund: f) }
            .sheet(item: $moveSheet) { k in MoveSheet(kind: k, fund: f, balance: bal) }
            .confirmationDialog("حذف «\(f.name)»؟", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("حذف", role: .destructive) { store.deleteFund(f.id); dismiss() }
            } message: { Text("المصاريف المحسوبة عليه تعود إلى المصروف اليومي.") }
        } else {
            ContentUnavailableView("المظروف غير موجود", systemImage: "tray")
        }
    }

    private struct Movement { let id: String; let date: String; let title: String; let amount: Double }

    private func movements(_ f: ReserveFund) -> [Movement] {
        var out = f.deposits.map { Movement(id: "d-\($0.id)", date: $0.date, title: $0.note ?? ($0.amount >= 0 ? "إيداع" : "سحب"), amount: $0.amount) }
        for t in store.data.transactions {
            let s = BudgetEngine.reserveShare(t, f.id)
            if s != 0 { out.append(Movement(id: "t-\(t.id)", date: t.date, title: t.note.isEmpty ? "مصروف" : t.note, amount: -s)) }
        }
        return out.sorted { $0.date > $1.date }.prefix(60).map { $0 }
    }
}

struct MoveSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    let kind: FundDetail.MoveKind
    let fund: ReserveFund
    let balance: Double
    @State private var amount = ""
    @State private var note = ""
    @State private var target = ""

    var body: some View {
        NavigationStack {
            Form {
                TextField("المبلغ", text: $amount).keyboardType(.decimalPad).font(.title2)
                if kind == .deposit || kind == .withdraw { TextField("ملاحظة", text: $note) }
                if kind == .transfer {
                    Picker("إلى", selection: $target) {
                        ForEach(store.data.reserves.filter { $0.id != fund.id }) { Text("\($0.icon) \($0.name)").tag($0.id) }
                    }
                }
                if kind != .deposit { Text("الرصيد \(Fmt.amount(balance))").foregroundStyle(.secondary) }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("تم") { apply(); dismiss() }.disabled(value <= 0 || (kind == .transfer && target.isEmpty))
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
        }
        .presentationDetents([.medium])
    }

    private var value: Double { Double(amount.replacingOccurrences(of: "٫", with: ".")) ?? 0 }

    private var title: String {
        switch kind {
        case .deposit: return "إيداع"
        case .withdraw: return "سحب"
        case .toDaily: return "إلى المصروف اليومي"
        case .transfer: return "نقل"
        }
    }

    private func apply() {
        switch kind {
        case .deposit: store.deposit(to: fund.id, amount: value, note: note.isEmpty ? nil : note)
        case .withdraw: store.deposit(to: fund.id, amount: -value, note: note.isEmpty ? "سحب يدويّ" : note)
        case .toDaily: store.pull(from: fund.id, amount: value)
        case .transfer: store.transfer(from: fund.id, to: target, amount: value)
        }
    }
}

struct FundEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss
    @State var fund: ReserveFund
    @State private var target = ""
    @State private var perCycle = ""
    @State private var source = "salary"
    @State private var stop = "none"

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack {
                        TextField("💰", text: Binding(get: { fund.icon }, set: { fund.icon = $0 })).frame(width: 44)
                        TextField("اسم المظروف", text: Binding(get: { fund.name }, set: { fund.name = $0 }))
                    }
                    TextField("الهدف (اختياري)", text: $target).keyboardType(.decimalPad)
                }
                Section {
                    TextField("مبلغ كلّ دورة (اختياري)", text: $perCycle).keyboardType(.decimalPad)
                    Picker("من أين؟", selection: $source) {
                        Text("من الراتب").tag("salary")
                        Text("من الفوائض").tag("surplus")
                    }
                    Picker("متى تتوقّف؟", selection: $stop) {
                        Text("مستمرّة").tag("none")
                        Text("حين يصفر العجز").tag("zero")
                        Text("حين يبلغ الهدف").tag("target")
                    }
                } header: { Text("خطة التمويل") } footer: {
                    Text("من الراتب: ينقص مصروفك اليومي قطرةً كلّ يوم بقدرها. من الفوائض: مالٌ قديم لا يمسّ مصروفك.")
                }
            }
            .navigationTitle(fund.name.isEmpty ? "مظروف جديد" : fund.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("حفظ") {
                        var f = fund
                        f.target = Double(target)
                        f.setFunding(perCycle: Double(perCycle), source: source, stop: stop == "none" ? nil : stop)
                        store.saveFund(f)
                        dismiss()
                    }
                    .disabled(fund.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) { Button("إلغاء") { dismiss() } }
            }
            .onAppear {
                target = fund.target.map { String($0) } ?? ""
                perCycle = fund.fundingPerCycle.map { String($0) } ?? ""
                source = fund.fundingSource ?? "salary"
                stop = fund.fundingStop ?? "none"
            }
        }
    }
}
