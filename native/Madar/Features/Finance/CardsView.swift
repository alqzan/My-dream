import SwiftUI

/// البطاقات والالتزامات — عرضٌ لما سجّله الويب من رسائل البنك.
struct CardsView: View {
    @EnvironmentObject var store: Store

    private var cards: [CardLedger.Card] { CardLedger.summarize(data: store.data) }
    private var obligations: [RawObject] {
        store.data.rest.objects("obligations").filter { $0.str("settledAt") == nil }
    }
    private var balances: [RawObject] {
        store.data.rest.objects("observedBalances").sorted { ($0.str("observedAt") ?? "") > ($1.str("observedAt") ?? "") }
    }
    private var settlements: [RawObject] {
        store.data.rest.objects("settlements").sorted { ($0.str("date") ?? "") > ($1.str("date") ?? "") }
    }

    var body: some View {
        MdrList {
            if cards.isEmpty && obligations.isEmpty && balances.isEmpty {
                ContentUnavailableView("لا بطاقات بعد", systemImage: "creditcard",
                                       description: Text("تظهر هنا البطاقات الائتمانية والالتزامات التي أكّدتها من رسائل البنك."))
            }
            if !cards.isEmpty {
                Section {
                    ForEach(cards) { c in
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Image(systemName: "creditcard.fill").foregroundStyle(Theme.finance)
                                Text(c.label).font(.mdrHeadline)
                                Spacer()
                                Text(Fmt.amount(abs(c.net)))
                                    .font(.mdrTitle3.weight(.semibold)).monospacedDigit()
                                    .foregroundStyle(c.net > 0.009 ? Theme.danger : Theme.finance)
                            }
                            Text(c.net > 0.009 ? "مستحقّ لم يُسدَّد" : c.net < -0.009 ? "سدادٌ زائد لم يُفسَّر" : "مسدَّدة بالكامل")
                                .font(.mdrFootnote).foregroundStyle(.secondary)
                            HStack(spacing: 14) {
                                stat("مشتريات", c.charges)
                                stat("سداد", c.settlements)
                                if c.refunds > 0 { stat("استرداد", c.refunds) }
                            }
                        }
                        .padding(.vertical, 4)
                    }
                } header: { Text("البطاقات الائتمانية") } footer: {
                    Text("صافٍ تقريبيّ لكلّ بطاقة. التوزيع التفصيليّ للسداد على المشتريات يبقى في نسخة الويب.")
                }
            }
            if !obligations.isEmpty {
                Section("الالتزامات") {
                    ForEach(Array(obligations.enumerated()), id: \.offset) { _, o in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(o.str("label") ?? o.str("source") ?? "التزام")
                                if let d = o.str("dueDate") {
                                    Text("الاستحقاق \(dateText(d))").font(.mdrCaption).foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            Text(Fmt.amount(o.num("outstanding") ?? 0)).monospacedDigit()
                        }
                    }
                }
            }
            if !balances.isEmpty {
                Section("آخر الأرصدة المرصودة") {
                    ForEach(Array(balances.prefix(8).enumerated()), id: \.offset) { _, b in
                        HStack {
                            Text("\(b.str("bank") ?? "") \(Digits.indic(b.str("cardLast4") ?? b.str("account") ?? ""))")
                            Spacer()
                            Text(Fmt.amount(b.num("balance") ?? 0)).monospacedDigit()
                        }
                    }
                }
            }
            if !settlements.isEmpty {
                Section("آخر السدادات") {
                    ForEach(Array(settlements.prefix(10).enumerated()), id: \.offset) { _, s in
                        HStack {
                            Text(dateText(s.str("date") ?? "")).foregroundStyle(.secondary)
                            Spacer()
                            Text(Fmt.amount(s.num("amount") ?? 0)).monospacedDigit()
                        }
                    }
                }
            }
        }
        .navigationTitle("البطاقات والالتزامات")
    }

    private func dateText(_ key: String) -> String {
        DateKey.date(key).map(Dates.longArabic) ?? Digits.indic(key)
    }

    private func stat(_ title: String, _ v: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.mdrCaption2).foregroundStyle(.secondary)
            Text(Fmt.amount(v)).font(.mdrCaption).monospacedDigit()
        }
    }
}
