import Foundation

/// محرّك المال — نقلٌ للقواعد النقيّة في الويب (`utils.ts` · `budgetFlow.ts` ·
/// `budgetCycle.ts` · `fundPlan.ts` · `trip.ts`). **واحدٌ يقرّر واثنان يخبران**:
/// المصروف اليومي يقرّر، والسقوف والمظاريف تخبر. لا تُعِد معادلةً منه داخل شاشة.
enum BudgetEngine {
    /// الخطّ الفاصل بين صرف يومٍ وحدث: ثلاث يوميّات (سقف المقاصة ووزن المصروف معاً).
    static let eventDays = 3.0
    static let offsetNote = "مقاصة تلقائية — تغطية عجز اليومية"
    static let surplusFundID = "fund-surplus"

    private static let expenseKinds: Set<String> = [
        "purchase", "atm", "bill", "installment", "fee", "transfer_out", "opening_debt", "missed_expense",
    ]

    // MARK: بوّابات المعاملة

    /// **البوّابة الوحيدة** لـ«كم خرج من الجيب» (`cashOut`).
    static func cashOut(_ t: Transaction) -> Double {
        if let k = t.kind {
            guard expenseKinds.contains(k) else { return 0 }
            return t.amount + (k == "transfer_out" ? (t.raw.num("fee") ?? 0) : 0)
        }
        return t.direction == "in" ? 0 : t.amount
    }

    static func budgetSpend(_ t: Transaction) -> Double { t.offBudget ? 0 : cashOut(t) }

    /// حصصٌ مدموجةٌ بالمعرّف ومحصورةٌ في ١٠٠٪ (`normalizeReserveSplits`).
    static func normalizedSplits(_ t: Transaction) -> [(fundId: String, pct: Double)] {
        var merged: [String: Double] = [:]
        var order: [String] = []
        for s in t.reserveSplits where !s.fundId.isEmpty && s.pct.isFinite && s.pct > 0 {
            if merged[s.fundId] == nil { order.append(s.fundId) }
            merged[s.fundId, default: 0] += s.pct
        }
        let total = merged.values.reduce(0, +)
        guard total > 0 else { return [] }
        let scale = total > 100 ? 100 / total : 1
        return order.map { ($0, round2(merged[$0]! * scale)) }
    }

    /// حصّة التدفّق العادي: ما تستهلكه المعاملة من المصروف اليومي **والسقوف معاً**.
    static func dailyShare(_ t: Transaction) -> Double {
        let paid = budgetSpend(t)
        let splits = normalizedSplits(t)
        guard !splits.isEmpty else { return paid }
        let reserved = min(100, splits.reduce(0) { $0 + $1.pct })
        return round2(paid * (100 - reserved) / 100)
    }

    static func reserveShare(_ t: Transaction, _ fundId: String) -> Double {
        guard let s = normalizedSplits(t).first(where: { $0.fundId == fundId }) else { return 0 }
        let refund = (t.kind == "refund" || t.kind == "reversal") && t.raw.str("refundDestination") == "merchant_card"
            && t.raw.str("linkedTransactionId") != nil
        let amount = refund ? -abs(t.amount) : cashOut(t)
        return round2(amount * s.pct / 100)
    }

    static func reserveBalance(_ f: ReserveFund, _ txs: [Transaction]) -> Double {
        let dep = f.deposits.reduce(0) { $0 + $1.amount }
        let spent = txs.reduce(0) { $0 + reserveShare($1, f.id) }
        return round2(dep - spent)
    }

    // MARK: المصروف اليومي

    struct Status {
        var days: Int
        var rate: Double       // المصروف اليومي الفعليّ (بعد قطرة التمويل)
        var allowance: Double
        var spent: Double
        var balance: Double
        var spentToday: Double
        /// المتاح اليوم = الرصيد التراكميّ (يشمل بدل اليوم).
        var available: Double { balance }
    }

    static func effectiveRate(amount: Double, perDay: Double) -> Double {
        max(0, round2(max(0, amount) - max(0, perDay)))
    }

    static func status(_ d: AppData, today: String = DateKey.today()) -> Status? {
        guard let b = d.dailyBudget else { return nil }
        return status(b, d.transactions, today: today)
    }

    static func status(_ b: DailyBudget, _ txs: [Transaction], today: String) -> Status {
        let start = DateKey.isValid(b.startDate) ? b.startDate : today
        let days = max(0, DateKey.days(from: start, to: today) + 1)
        let rate = effectiveRate(amount: b.amount, perDay: b.fundingPerDay)
        let allowance = round2(rate * Double(days) - b.carryAdjust)
        var spent = 0.0, spentToday = 0.0
        for t in txs where t.date >= start && t.date <= today {
            let s = dailyShare(t)
            spent += s
            if t.date == today { spentToday += s }
        }
        spent = round2(spent)
        return Status(days: days, rate: rate, allowance: allowance, spent: spent,
                      balance: round2(allowance - spent), spentToday: round2(spentToday))
    }

    // MARK: دورة الراتب

    private static func daysInMonth(_ y: Int, _ m: Int) -> Int {
        let cal = DateKey.calendar
        guard let d = cal.date(from: DateComponents(year: y, month: m, day: 1)) else { return 30 }
        return cal.range(of: .day, in: .month, for: d)?.count ?? 30
    }

    private static func clampDay(_ salaryDay: Int) -> Int { min(max(salaryDay, 1), 31) }

    static func lastSalaryDate(_ salaryDay: Int, _ today: String) -> String {
        let p = today.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return today }
        let (y, m, d) = (p[0], p[1], p[2])
        let day = clampDay(salaryDay)
        var sy = y, sm = m
        if d < min(day, daysInMonth(y, m)) {
            sm = m == 1 ? 12 : m - 1
            sy = m == 1 ? y - 1 : y
        }
        return String(format: "%04d-%02d-%02d", sy, sm, min(day, daysInMonth(sy, sm)))
    }

    static func nextSalaryDate(_ salaryDay: Int, _ today: String) -> String {
        let p = lastSalaryDate(salaryDay, today).split(separator: "-").compactMap { Int($0) }
        let (y, m) = (p[0], p[1])
        let ny = m == 12 ? y + 1 : y, nm = m == 12 ? 1 : m + 1
        return String(format: "%04d-%02d-%02d", ny, nm, min(clampDay(salaryDay), daysInMonth(ny, nm)))
    }

    static func cycleLength(_ salaryDay: Int, _ today: String) -> Int {
        max(1, DateKey.days(from: lastSalaryDate(salaryDay, today), to: nextSalaryDate(salaryDay, today)))
    }

    static let earlySalaryDays = 7

    static func salaryConfirmedFor(_ last: String?, _ salaryDate: String) -> Bool {
        guard let l = last, DateKey.isValid(l) else { return false }
        return l >= DateKey.adding(days: -earlySalaryDays, to: salaryDate)
    }

    /// يومُ الراتب الذي يخصّه تأكيدٌ اليوم — هويّةُ الدورة.
    static func salaryCycleKey(_ salaryDay: Int, _ today: String) -> String {
        let next = nextSalaryDate(salaryDay, today)
        return next <= DateKey.adding(days: earlySalaryDays, to: today) ? next : lastSalaryDate(salaryDay, today)
    }

    enum SalaryPrompt { case due, early }
    static func salaryPrompt(_ salaryDay: Int, _ last: String?, _ today: String) -> SalaryPrompt? {
        if !salaryConfirmedFor(last, lastSalaryDate(salaryDay, today)) { return .due }
        let next = nextSalaryDate(salaryDay, today)
        if today >= DateKey.adding(days: -earlySalaryDays, to: next) && !salaryConfirmedFor(last, next) { return .early }
        return nil
    }

    static func upcomingSalaryDate(_ salaryDay: Int, _ last: String?, _ today: String) -> String {
        let next = nextSalaryDate(salaryDay, today)
        return salaryConfirmedFor(last, next) ? nextSalaryDate(salaryDay, next) : next
    }

    static func cycleStart(_ d: AppData, today: String) -> String {
        if let l = d.lastSalaryConfirm, DateKey.isValid(l), l <= today { return l }
        return lastSalaryDate(d.salaryDay, today)
    }

    /// نافذة السقوف: «YYYY-MM» شهرٌ ميلادي أو «YYYY-MM-DD» بداية دورة.
    static func spendWindow(_ d: AppData, today: String) -> String {
        d.rest.str("budgetWindow") == "month" ? String(today.prefix(7)) : cycleStart(d, today: today)
    }

    static func inWindow(_ date: String, _ window: String) -> Bool {
        window.count == 7 ? date.hasPrefix(window) : date >= window
    }

    // MARK: الوتيرة والمقاصة والوزن

    enum PaceKind { case ahead, onTrack, tighten, beyond }
    struct Pace { var daily: Double; var daysLeft: Int; var rate: Double; var kind: PaceKind }

    static func cyclePace(balance: Double, daily: Double, daysLeft: Int) -> Pace {
        let left = max(1, daysLeft)
        let dly = daily > 0 ? daily : 0
        let rate = round2((balance + dly * Double(left)) / Double(left))
        let ratio = dly > 0 ? rate / dly : 1
        let kind: PaceKind = ratio >= 1.05 ? .ahead : ratio >= 0.95 ? .onTrack : ratio > 0.35 ? .tighten : .beyond
        return Pace(daily: dly, daysLeft: left, rate: rate, kind: kind)
    }

    enum OffsetReason { case none, off, noSurplus, covered, partial, tooBig }
    struct OffsetPlan { var amount: Double; var deficit: Double; var cap: Double; var reason: OffsetReason }

    static func offsetPlan(balance: Double, surplus: Double, daily: Double, enabled: Bool) -> OffsetPlan {
        let dly = daily > 0 ? daily : 0
        let cap = round2(dly * eventDays)
        let deficit = balance < 0 ? round2(-balance) : 0
        if deficit <= 0 { return OffsetPlan(amount: 0, deficit: 0, cap: cap, reason: .none) }
        if !enabled { return OffsetPlan(amount: 0, deficit: deficit, cap: cap, reason: .off) }
        if cap > 0 && deficit > cap { return OffsetPlan(amount: 0, deficit: deficit, cap: cap, reason: .tooBig) }
        if surplus <= 0 { return OffsetPlan(amount: 0, deficit: deficit, cap: cap, reason: .noSurplus) }
        let amt = round2(min(deficit, surplus))
        return OffsetPlan(amount: amt, deficit: deficit, cap: cap, reason: amt >= deficit ? .covered : .partial)
    }

    /// كم يوماً من المصروف اليومي يعادل هذا المبلغ، وهل هو «حدث» (≥ ٣ يوميّات).
    static func expenseWeight(amount: Double, daily: Double) -> (days: Double, big: Bool) {
        guard daily > 0, amount > 0 else { return (0, false) }
        return ((amount / daily * 10).rounded() / 10, amount >= daily * eventDays)
    }

    // MARK: السقوف

    struct CapStatus: Identifiable {
        var id: String { category }
        var category: String, label: String, icon: String
        var cap: Double, spent: Double
        var remaining: Double { cap - spent }
        var pct: Double { cap > 0 ? spent / cap * 100 : 0 }
        var state: String { spent > cap ? "over" : pct >= 80 ? "near" : "ok" }
    }

    static func mainCategory(_ cats: [FinanceCategory], _ id: String) -> FinanceCategory {
        guard let c = cats.first(where: { $0.id == id }) else { return .unknown }
        guard let p = c.parentId else { return c }
        return cats.first { $0.id == p } ?? c
    }

    static func capStatuses(_ d: AppData, today: String) -> [CapStatus] {
        let window = spendWindow(d, today: today)
        return d.budgets.compactMap { b in
            guard let cap = b.effectiveLimit(monthlyIncome: d.monthlyIncome), cap > 0 else { return nil }
            let spent = d.transactions
                .filter { mainCategory(d.categories, $0.category).id == b.category && inWindow($0.date, window) }
                .reduce(0) { $0 + dailyShare($1) }
            let c = d.categories.first { $0.id == b.category }
            return CapStatus(category: b.category, label: c?.label ?? "قسم", icon: c?.icon ?? "📌", cap: cap, spent: round2(spent))
        }
    }

    // MARK: تمويل المظاريف

    static func cycleFundingAmount(_ f: ReserveFund, balance: Double) -> Double {
        guard let per0 = f.fundingPerCycle, per0 > 0 else { return 0 }
        let per = round2(per0)
        switch f.fundingStop {
        case "zero":
            let deficit = balance < 0 ? round2(-balance) : 0
            return deficit <= 0 ? 0 : round2(min(per, deficit))
        case "target":
            guard let target = f.target, target > 0 else { return per }
            let missing = round2(target - balance)
            return missing <= 0 ? 0 : round2(min(per, missing))
        default:
            return per
        }
    }

    static func fundingDone(_ f: ReserveFund, balanceAfter: Double) -> Bool {
        switch f.fundingStop {
        case "zero": return balanceAfter >= 0
        case "target": return (f.target ?? 0) > 0 && balanceAfter >= (f.target ?? 0)
        default: return false
        }
    }

    struct FundingMove { var fundId: String; var amount: Double; var source: String; var done: Bool }

    static func planCycleFunding(reserves: [ReserveFund], txs: [Transaction], surplusId: String?, surplusBalance: Double)
        -> (moves: [FundingMove], fromSalary: Double) {
        var left = surplusBalance
        var fromSalary = 0.0
        var moves: [FundingMove] = []
        for f in reserves where f.fundingPerCycle != nil && f.id != surplusId {
            let bal = reserveBalance(f, txs)
            var amount = cycleFundingAmount(f, balance: bal)
            let source = f.fundingSource == "surplus" ? "surplus" : "salary"
            if source == "surplus" {
                amount = round2(min(amount, max(0, left)))
                if amount > 0 { left = round2(left - amount) }
            } else if amount > 0 {
                fromSalary = round2(fromSalary + amount)
            }
            moves.append(FundingMove(fundId: f.id, amount: max(0, amount), source: source,
                                     done: fundingDone(f, balanceAfter: round2(bal + max(0, amount)))))
        }
        return (moves, fromSalary)
    }

    static func fundingPerDay(_ total: Double, cycleLength: Int) -> Double {
        round2(max(0, total) / Double(max(1, cycleLength)))
    }

    // MARK: الرحلات

    static func isTripEligible(_ f: ReserveFund) -> Bool { f.role == "custom" }

    /// وجهة المصروف من تاريخ وقوعه: داخل نافذة رحلةٍ ⇒ كلّه على مظروفها.
    static func tripSplit(_ reserves: [ReserveFund], date: String, today: String) -> String? {
        guard DateKey.isValid(date), date <= today else { return nil }
        var best: (fundId: String, start: String)?
        for f in reserves where isTripEligible(f) {
            for t in f.trips where date >= t.startedAt && date <= (t.endedAt ?? today) {
                if best == nil || t.startedAt > best!.start || (t.startedAt == best!.start && f.id < best!.fundId) {
                    best = (f.id, t.startedAt)
                }
            }
        }
        return best?.fundId
    }

    struct TripSummary { var total: Double; var count: Int; var days: Int; var perDay: Double; var ongoing: Bool }

    static func tripSummary(_ f: ReserveFund, _ txs: [Transaction], today: String) -> TripSummary? {
        let trip = f.trips.first { $0.endedAt == nil } ?? f.trips.filter { $0.endedAt != nil }.max { ($0.endedAt ?? "") < ($1.endedAt ?? "") }
        guard let t = trip else { return nil }
        let to = t.endedAt ?? today
        var total = 0.0, count = 0
        for x in txs where x.date >= t.startedAt && x.date <= to {
            let s = reserveShare(x, f.id)
            if s > 0 { total = round2(total + s); count += 1 }
        }
        let days = max(1, DateKey.days(from: t.startedAt, to: to) + 1)
        return TripSummary(total: total, count: count, days: days, perDay: round2(total / Double(days)), ongoing: t.endedAt == nil)
    }

    // MARK: المظاريف

    static func surplusFund(_ reserves: [ReserveFund]) -> ReserveFund? { reserves.first { $0.role == "surplus" } }

    /// ما يظنّه التطبيق في يدك: مظاريفك + رصيد دورتك (`holdings` في `reconcile.ts`).
    static func holdings(_ d: AppData, today: String) -> Double {
        let env = d.reserves.reduce(0) { $0 + reserveBalance($1, d.transactions) }
        let cycle = status(d, today: today)?.balance ?? 0
        return round2(env + cycle)
    }
}
