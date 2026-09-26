import SwiftUI

struct FinanceView: View {
    @EnvironmentObject var store: Store
    @State private var adding: Transaction?
    @State private var salarySheet = false
    @State private var settings = false
    @State private var newFund = false

    private var today: String { DateKey.today() }

    var body: some View {
        NavigationStack {
            List {
                if store.data.dailyBudget == nil {
                    Section { onboarding }
                } else {
                    Section { hero }.listRowBackground(Color.clear).listRowInsets(EdgeInsets())
                    if let prompt = BudgetEngine.salaryPrompt(store.data.salaryDay, store.data.lastSalaryConfirm, today) {
                        Section { salaryBanner(prompt) }
                    }
                }

                Section { recent } header: {
                    HStack { Text("آخر المصاريف"); Spacer(); NavigationLink("الكل") { TransactionsList() }.font(.footnote) }
                }

                let caps = BudgetEngine.capStatuses(store.data, today: today)
                if !caps.isEmpty { Section("السقوف") { ForEach(caps) { CapRow(cap: $0) } } }

                Section {
                    ForEach(store.data.reserves) { f in
                        NavigationLink { FundDetail(fundId: f.id) } label: { FundRow(fund: f) }
                    }
                    Button { newFund = true } label: { Label("مظروف جديد", systemImage: "plus") }
                } header: { Text("المظاريف") } footer: {
                    Text("مالٌ موجودٌ مخصَّص — لا يُحتسب من مصروفك اليومي.")
                }
            }
            .navigationTitle("المال")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { settings = true } label: { Image(systemName: "slider.horizontal.3") }.accessibilityLabel("إعدادات المال")
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { adding = Transaction.new(date: today, amount: 0, category: store.data.categories.first?.id ?? "", note: "") } label: {
                    Label("سجّل مصروفاً", systemImage: "plus").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent).tint(Theme.finance).controlSize(.large)
                .padding(.horizontal).padding(.bottom, 8)
            }
            .sheet(item: $adding) { t in ExpenseEditor(transaction: t) }
            .sheet(isPresented: $salarySheet) { SalarySheet() }
            .sheet(isPresented: $settings) { FinanceSettings() }
            .sheet(isPresented: $newFund) { FundEditor(fund: ReserveFund.new(name: "", icon: "💰", target: nil)) }
        }
    }

    private var onboarding: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("كم تصرف في اليوم؟").font(.headline)
            Text("رقمٌ واحد يجيب «أقدر أصرف الآن؟» — ما لم تصرفه يبقى لك غداً، وما زدتَه يُخصم منه.")
                .foregroundStyle(.secondary)
            Button { settings = true } label: { Text("اضبط مصروفك اليومي").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).tint(Theme.finance).controlSize(.large)
        }
        .padding(.vertical, 6)
    }

    private var hero: some View {
        let s = BudgetEngine.status(store.data, today: today)!
        let next = BudgetEngine.upcomingSalaryDate(store.data.salaryDay, store.data.lastSalaryConfirm, today)
        let daysLeft = max(0, DateKey.days(from: today, to: next))
        let pace = BudgetEngine.cyclePace(balance: s.balance, daily: s.rate, daysLeft: daysLeft)
        let negative = s.balance < 0
        return VStack(alignment: .leading, spacing: 12) {
            Text("متاحٌ لك اليوم").font(.subheadline).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Fmt.amount(s.balance))
                    .font(.system(size: 52, weight: .bold, design: .rounded))
                    .foregroundStyle(negative ? Theme.danger : .primary)
                    .contentTransition(.numericText(value: s.balance))
                Text("ر.س").font(.title3).foregroundStyle(.secondary)
            }
            HStack(spacing: 16) {
                stat("المصروف اليومي", Fmt.amount(s.rate))
                stat("صرفتَ اليوم", Fmt.amount(s.spentToday))
                stat("إلى الراتب", "\(Fmt.count(daysLeft)) يوم")
            }
            if daysLeft > 0 {
                Text(paceText(pace)).font(.footnote).foregroundStyle(pace.kind == .beyond || pace.kind == .tighten ? Theme.danger : .secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.vertical, 6)
    }

    private func stat(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.headline).monospacedDigit()
            Text(label).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func paceText(_ p: BudgetEngine.Pace) -> String {
        switch p.kind {
        case .ahead: return "على وتيرتك تقدر تصرف \(Fmt.amount(p.rate)) يومياً حتى الراتب."
        case .onTrack: return "أنت على مصروفك اليومي تماماً."
        case .tighten: return "لتصل للراتب على الصفر: \(Fmt.amount(p.rate)) يومياً بدل \(Fmt.amount(p.daily))."
        case .beyond: return "العجز أعمق من أن تمتصّه الأيام الباقية — غطِّه من مظروف."
        }
    }

    private func salaryBanner(_ p: BudgetEngine.SalaryPrompt) -> some View {
        Button { salarySheet = true } label: {
            HStack {
                Image(systemName: "banknote").foregroundStyle(Theme.finance)
                VStack(alignment: .leading) {
                    Text(p == .due ? "نزل الراتب؟" : "نزل الراتب مبكّراً؟").font(.headline)
                    Text("أكّده لتبدأ دورةٌ جديدة ويُرحَّل فائضك.").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.left").foregroundStyle(.tertiary)
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var recent: some View {
        let list = store.data.transactions.sorted { $0.date > $1.date }.prefix(8)
        if list.isEmpty { Text("لا مصاريف بعد.").foregroundStyle(.secondary) }
        ForEach(Array(list)) { t in
            Button { adding = t } label: { TransactionRow(t: t) }.buttonStyle(.plain)
                .swipeActions { Button(role: .destructive) { store.deleteTransaction(t.id) } label: { Label("حذف", systemImage: "trash") } }
        }
    }
}

struct TransactionRow: View {
    @EnvironmentObject var store: Store
    let t: Transaction
    var body: some View {
        let cat = store.data.categories.first { $0.id == t.category } ?? .unknown
        let fund = t.reserveSplits.first.flatMap { s in store.data.reserves.first { $0.id == s.fundId } }
        HStack(spacing: 12) {
            Text(cat.icon).font(.title3).frame(width: 36, height: 36)
                .background(Color(hexString: cat.color).opacity(0.15), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(t.note.isEmpty ? cat.label : t.note).lineLimit(1)
                HStack(spacing: 6) {
                    Text(Fmt.shortDate(key: t.date))
                    if let f = fund { Text("من \(f.name)") }
                    if t.offBudget { Text("خارج الميزانية") }
                }
                .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(Fmt.amount(t.amount)).font(.body.weight(.semibold)).monospacedDigit()
                .foregroundStyle(t.direction == "in" ? Theme.finance : .primary)
        }
        .contentShape(Rectangle())
    }
}

struct CapRow: View {
    let cap: BudgetEngine.CapStatus
    var body: some View {
        let color: Color = cap.state == "over" ? Theme.danger : cap.state == "near" ? Theme.brand : Theme.finance
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("\(cap.icon) \(cap.label)")
                Spacer()
                Text("\(Fmt.amount(cap.spent)) / \(Fmt.amount(cap.cap))").font(.subheadline).monospacedDigit().foregroundStyle(.secondary)
            }
            ProgressView(value: min(1, cap.spent / max(1, cap.cap))).tint(color)
            if cap.state == "over" {
                Text("تجاوزتَ بـ\(Fmt.amount(-cap.remaining))").font(.caption).foregroundStyle(Theme.danger)
            }
        }
        .padding(.vertical, 2)
    }
}

struct FundRow: View {
    @EnvironmentObject var store: Store
    let fund: ReserveFund
    var body: some View {
        let bal = BudgetEngine.reserveBalance(fund, store.data.transactions)
        HStack(spacing: 12) {
            Text(fund.icon).font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(fund.name)
                    if fund.runningTrip != nil { Pill(text: "رحلة جارية", color: Theme.brand) }
                }
                if let t = fund.target, t > 0 {
                    ProgressView(value: max(0, min(1, bal / t))).tint(Theme.finance)
                } else if let per = fund.fundingPerCycle {
                    Text("\(Fmt.amount(per)) كلّ دورة").font(.caption).foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text(Fmt.amount(bal)).font(.body.weight(.semibold)).monospacedDigit()
                .foregroundStyle(bal < 0 ? Theme.danger : .primary)
        }
    }
}
