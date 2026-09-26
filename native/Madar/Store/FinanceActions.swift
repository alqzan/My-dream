import Foundation

/// أفعال المال — نقلٌ لإجراءات المتجر في الويب (`confirmSalary` · `pullFromReserve`
/// · `autoOffsetDeficit` · `sweepToReserve` · `startTrip`…). الحسابُ نفسه في `BudgetEngine`.
extension Store {
    // MARK: المعاملات

    func saveTransaction(_ t: Transaction) {
        var t = t
        if t.reserveSplits.isEmpty, let fund = BudgetEngine.tripSplit(data.reserves, date: t.date, today: DateKey.today()),
           data.transactions.first(where: { $0.id == t.id }) == nil {
            t.setReserveSplits([(fund, 100)])
        }
        t.stamp()
        update { d in
            if let i = d.transactions.firstIndex(where: { $0.id == t.id }) { d.transactions[i] = t }
            else { d.transactions.insert(t, at: 0) }
        }
        autoOffset()
        Haptic.success()
    }

    func deleteTransaction(_ id: String) {
        update { d in
            d.transactions.removeAll { $0.id == id }
            d.tombstone(id)
        }
    }

    // MARK: المصروف اليومي

    func setDailyBudget(amount: Double) {
        update { d in
            var b = DailyBudget(amount: amount, startDate: DateKey.today())
            if let old = d.dailyBudget, old.fundingPerDay > 0 { b.fundingPerDay = old.fundingPerDay }
            d.dailyBudget = b
        }
    }

    /// المقاصة التلقائية: عجزٌ صغير (≤ ٣ يوميّات) يُغطّى من «الفوائض» بلا ضغطة.
    @discardableResult
    func autoOffset() -> Double {
        let today = DateKey.today()
        guard let st = BudgetEngine.status(data, today: today),
              let fund = BudgetEngine.surplusFund(data.reserves) else { return 0 }
        let plan = BudgetEngine.offsetPlan(balance: st.balance, surplus: BudgetEngine.reserveBalance(fund, data.transactions),
                                           daily: st.rate, enabled: data.autoOffset)
        guard plan.amount > 0 else { return 0 }
        return pull(from: fund.id, amount: plan.amount, note: BudgetEngine.offsetNote, depositId: "offset:\(fund.id):\(today)")
    }

    /// سحبٌ من مظروفٍ إلى المصروف اليومي. بمعرّفٍ مشتقّ يُرفع سحب اليوم بدل أن يُضاف ثانٍ.
    @discardableResult
    func pull(from fundId: String, amount: Double, note: String? = nil, depositId: String? = nil) -> Double {
        guard let fi = data.reserves.firstIndex(where: { $0.id == fundId }), data.dailyBudget != nil, amount > 0 else { return 0 }
        let bal = BudgetEngine.reserveBalance(data.reserves[fi], data.transactions)
        guard bal > 0 else { return 0 }
        let added = round2(min(amount, bal))
        let today = DateKey.today()
        update { d in
            var fund = d.reserves[fi]
            var deps = fund.raw.objects("deposits")
            if let id = depositId, let j = deps.firstIndex(where: { $0.str("id") == id }) {
                deps[j].put("amount", round2((deps[j].num("amount") ?? 0) - added))
            } else {
                var o: RawObject = [:]
                o.put("id", depositId ?? ReserveFund.newID()); o.put("date", today); o.put("amount", -added)
                o.put("note", note ?? "إلى الميزانية اليومية")
                deps.insert(o, at: 0)
            }
            fund.raw.put("deposits", objects: deps)
            fund.stamp()
            d.reserves[fi] = fund
            var b = d.dailyBudget!
            b.carryAdjust = b.carryAdjust - added
            d.dailyBudget = b
        }
        return added
    }

    // MARK: المظاريف

    func saveFund(_ f: ReserveFund) {
        var f = f
        f.stamp()
        update { d in
            if let i = d.reserves.firstIndex(where: { $0.id == f.id }) { d.reserves[i] = f } else { d.reserves.append(f) }
        }
    }

    func deleteFund(_ id: String) {
        update { d in
            d.reserves.removeAll { $0.id == id }
            for i in d.transactions.indices where d.transactions[i].reserveSplits.contains(where: { $0.fundId == id }) {
                d.transactions[i].setReserveSplits(d.transactions[i].reserveSplits.filter { $0.fundId != id })
                d.transactions[i].stamp()
            }
            d.tombstone(id)
        }
    }

    func deposit(to fundId: String, amount: Double, note: String?) {
        guard amount != 0 else { return }
        update { d in
            guard let i = d.reserves.firstIndex(where: { $0.id == fundId }) else { return }
            d.reserves[i].addDeposit(amount: amount, date: DateKey.today(), note: note)
            d.reserves[i].stamp()
        }
        Haptic.success()
    }

    /// نقلٌ بين مظروفين — لا صرف ولا مساس بالمصروف اليومي.
    @discardableResult
    func transfer(from: String, to: String, amount: Double) -> Double {
        guard from != to, let src = data.reserves.first(where: { $0.id == from }),
              let dst = data.reserves.first(where: { $0.id == to }) else { return 0 }
        let moved = round2(min(amount, max(0, BudgetEngine.reserveBalance(src, data.transactions))))
        guard moved > 0 else { return 0 }
        update { d in
            for i in d.reserves.indices {
                if d.reserves[i].id == from { d.reserves[i].addDeposit(amount: -moved, date: DateKey.today(), note: "إلى «\(dst.name)»"); d.reserves[i].stamp() }
                if d.reserves[i].id == to { d.reserves[i].addDeposit(amount: moved, date: DateKey.today(), note: "من «\(src.name)»"); d.reserves[i].stamp() }
            }
        }
        return moved
    }

    /// وضع السفر: رحلةٌ جاريةٌ واحدة عبر المظاريف كلّها.
    func startTrip(_ fundId: String) {
        let today = DateKey.today()
        update { d in
            for i in d.reserves.indices where d.reserves[i].runningTrip != nil {
                d.reserves[i].endTrip(on: today); d.reserves[i].stamp()
            }
            if let i = d.reserves.firstIndex(where: { $0.id == fundId }) { d.reserves[i].startTrip(on: today); d.reserves[i].stamp() }
        }
    }

    func endTrip(_ fundId: String) {
        update { d in
            if let i = d.reserves.firstIndex(where: { $0.id == fundId }) { d.reserves[i].endTrip(on: DateKey.today()); d.reserves[i].stamp() }
        }
    }

    // MARK: الراتب

    /// «نزل الراتب»: يُرحَّل فائض الدورة إلى «الفوائض»، وتُنفَّذ خطط التمويل،
    /// وتبدأ دورةٌ جديدة اليوم. `carryOverride` يصحّح الفائض نزولاً فقط.
    @discardableResult
    func confirmSalary(carryOverride: Double? = nil) -> Double {
        let today = DateKey.today()
        let d0 = data
        if d0.lastSalaryConfirm == today { return 0 }
        let key = BudgetEngine.salaryCycleKey(d0.salaryDay, today)
        if let last = d0.lastSalaryConfirm, BudgetEngine.salaryCycleKey(d0.salaryDay, last) == key { return 0 }
        let balance = BudgetEngine.status(d0, today: today)?.balance ?? 0
        let computed = max(0, round2(balance))
        let moved = carryOverride.map { $0 >= 0 ? min(computed, round2($0)) : computed } ?? computed

        update { d in
            if moved > 0 {
                if BudgetEngine.surplusFund(d.reserves) == nil {
                    var f = ReserveFund.new(name: "الفوائض", icon: "✨", target: nil)
                    f.raw.put("id", BudgetEngine.surplusFundID)
                    f.raw.put("role", "surplus")
                    f.raw.put("color", "#c9852a")
                    d.reserves.append(f)
                }
                if let i = d.reserves.firstIndex(where: { $0.role == "surplus" }) {
                    let id = "salary:\(key):surplus-rollover"
                    if !d.reserves[i].deposits.contains(where: { $0.id == id }) {
                        var deps = d.reserves[i].raw.objects("deposits")
                        deps.insert(["id": .string(id), "date": .string(today), "amount": .number(moved), "note": .string("فوائض دورة الراتب")], at: 0)
                        d.reserves[i].raw.put("deposits", objects: deps)
                        d.reserves[i].stamp()
                    }
                }
            }

            let surplus = BudgetEngine.surplusFund(d.reserves)
            let plan = BudgetEngine.planCycleFunding(
                reserves: d.reserves, txs: d.transactions, surplusId: surplus?.id,
                surplusBalance: surplus.map { BudgetEngine.reserveBalance($0, d.transactions) } ?? 0)
            for move in plan.moves {
                guard let fi = d.reserves.firstIndex(where: { $0.id == move.fundId }) else { continue }
                let name = d.reserves[fi].name
                if move.amount > 0 {
                    if move.source == "surplus", let si = d.reserves.firstIndex(where: { $0.id == surplus?.id }) {
                        let oid = "salary:\(key):funding:surplus-out:\(move.fundId)"
                        if !d.reserves[si].deposits.contains(where: { $0.id == oid }) {
                            var deps = d.reserves[si].raw.objects("deposits")
                            deps.insert(["id": .string(oid), "date": .string(today), "amount": .number(-move.amount), "note": .string("تمويل «\(name)»")], at: 0)
                            d.reserves[si].raw.put("deposits", objects: deps)
                        }
                    }
                    let iid = "salary:\(key):funding:\(move.source):\(move.fundId)"
                    if !d.reserves[fi].deposits.contains(where: { $0.id == iid }) {
                        var deps = d.reserves[fi].raw.objects("deposits")
                        let note = d.reserves[fi].fundingStop == "zero" ? "سداد الدورة" : "تمويل الدورة"
                        deps.insert(["id": .string(iid), "date": .string(today), "amount": .number(move.amount), "note": .string(note)], at: 0)
                        d.reserves[fi].raw.put("deposits", objects: deps)
                    }
                }
                if move.done { d.reserves[fi].raw["funding"] = nil }
                d.reserves[fi].stamp()
            }

            if var b = d.dailyBudget {
                let spentToday = round2(d.transactions.filter { $0.date == today }.reduce(0) { $0 + BudgetEngine.dailyShare($1) })
                let perDay = BudgetEngine.fundingPerDay(plan.fromSalary, cycleLength: BudgetEngine.cycleLength(d.salaryDay, today))
                let rate = BudgetEngine.effectiveRate(amount: b.amount, perDay: perDay)
                b.raw.put("startDate", today)
                b.carryAdjust = rate - spentToday
                if perDay > 0 { b.fundingPerDay = perDay } else { b.raw["fundingPerDay"] = nil }
                d.dailyBudget = b
            }
            d.lastSalaryConfirm = today
        }
        Haptic.success()
        return moved
    }

    /// المطابقة الربعية: رقمٌ واحدٌ من كشوفك يقابل «مظاريفك + رصيد دورتك»،
    /// والفرقُ تسويةٌ على «الفوائض» وقيدٌ في `reconciles`.
    func recordReconcile(actual: Double) {
        let today = DateKey.today()
        let rid = "reconcile:\(today)"
        guard !data.rest.objects("reconciles").contains(where: { $0.str("id") == rid }) else { return }
        let expected = BudgetEngine.holdings(data, today: today)
        let delta = round2(actual - expected)
        update { d in
            if delta != 0 {
                if BudgetEngine.surplusFund(d.reserves) == nil {
                    var f = ReserveFund.new(name: "الفوائض", icon: "✨", target: nil)
                    f.raw.put("id", BudgetEngine.surplusFundID); f.raw.put("role", "surplus")
                    d.reserves.append(f)
                }
                if let i = d.reserves.firstIndex(where: { $0.role == "surplus" }) {
                    var deps = d.reserves[i].raw.objects("deposits")
                    deps.insert(["id": .string(rid), "date": .string(today), "amount": .number(delta), "note": .string("تسوية المطابقة")], at: 0)
                    d.reserves[i].raw.put("deposits", objects: deps)
                    d.reserves[i].stamp()
                }
            }
            var list = d.rest.objects("reconciles")
            list.append(["id": .string(rid), "date": .string(today), "expected": .number(expected), "actual": .number(round2(actual)),
                         "delta": .number(delta), "updatedAt": .number(DateKey.nowMs())])
            d.rest.put("reconciles", objects: list)
        }
    }

    var lastReconcileDate: String? {
        data.rest.objects("reconciles").compactMap { $0.str("date") }.max()
    }
}
