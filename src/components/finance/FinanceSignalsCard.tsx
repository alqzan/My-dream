"use client";

import { useMemo, useState } from "react";
import { ChevronDown, CircleAlert, RefreshCw, Repeat, Wallet } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { usePending } from "@/lib/pending";
import {
  financeSignals,
  findSelfTransferCandidates,
  proposeSalary,
} from "@/lib/bankIntelligence";
import { formatAmount, formatDate, today, toIndicDigits } from "@/lib/utils";

/**
 * Read-only finance signals. The section starts collapsed because these are
 * useful review cues, not another balance competing with the budget cards.
 * Every action that changes accounting remains in the inbox/review flow.
 */
export function FinanceSignalsCard({ cycleStart }: { cycleStart: string }) {
  const transactions = useAppStore((state) => state.transactions);
  const inboxEvents = useAppStore((state) => state.inboxEvents ?? []);
  const observedBalances = useAppStore((state) => state.observedBalances ?? []);
  const accounts = useAppStore((state) => state.accounts ?? []);
  const ownerAliases = useAppStore((state) => state.ownerAliases ?? []);
  const ownerWallets = useAppStore((state) => state.ownerWallets ?? []);
  const ownerAccounts = useAppStore((state) => state.ownerAccounts ?? []);
  const salaryPayers = useAppStore((state) => state.salaryPayers ?? []);
  const payerAliases = useAppStore((state) => state.payerAliases ?? {});
  const salaryDay = useAppStore((state) => state.salaryDay ?? 27);
  const { openReview } = usePending();
  const [open, setOpen] = useState(false);
  const todayStr = today();

  const signals = useMemo(() => financeSignals({
    transactions,
    inboxEvents,
    observedBalances,
    accounts,
    cycleStart,
    today: todayStr,
  }), [transactions, inboxEvents, observedBalances, accounts, cycleStart, todayStr]);
  const salaryProposals = useMemo(() => proposeSalary({
    events: [
      ...transactions.map((transaction) => ({
        id: transaction.eventId ?? transaction.id,
        amount: transaction.amount,
        date: transaction.date,
        direction: transaction.direction,
        payer: transaction.counterparty,
        counterparty: transaction.counterparty,
        account: transaction.account,
        accountId: transaction.accountId,
        kind: transaction.kind,
        confirmedSalary: transaction.kind === "salary",
      })),
      ...inboxEvents.map((event) => ({
        id: event.eventId,
        amount: event.amount,
        date: event.date,
        direction: event.direction,
        payer: event.counterparty,
        counterparty: event.counterparty,
        account: event.account,
        accountId: event.accountId,
        kind: event.kind,
      })),
    ],
    salaryPayers,
    payerAliases,
    salaryDay,
    ownerAccountIds: ownerAccounts,
  }), [transactions, inboxEvents, salaryPayers, payerAliases, salaryDay, ownerAccounts]);
  const transferReview = useMemo(() => findSelfTransferCandidates(
    [
      ...transactions
        .filter((transaction) => transaction.kind === "self_transfer" || transaction.kind === "transfer_in" || transaction.kind === "transfer_out")
        .map((transaction) => ({
          id: transaction.eventId ?? transaction.id,
          amount: transaction.amount,
          date: transaction.date,
          time: transaction.time,
          direction: transaction.direction === "in" ? "in" as const : "out" as const,
          bank: transaction.bank,
          account: transaction.account,
          accountId: transaction.accountId,
          counterparty: transaction.counterparty,
          fee: transaction.fee,
        })),
      ...inboxEvents
        .filter((event) => event.kind === "self_transfer" || event.kind === "transfer_in" || event.kind === "transfer_out")
        .map((event) => ({
          id: event.eventId,
          amount: event.amount,
          date: event.date,
          time: event.time,
          direction: event.direction === "in" ? "in" as const : "out" as const,
          bank: event.bank,
          account: event.account,
          accountId: event.accountId,
          counterparty: event.counterparty,
          fee: event.fee,
        })),
    ],
    { names: ownerAliases, wallets: ownerWallets, accounts: ownerAccounts },
  ), [transactions, inboxEvents, ownerAliases, ownerWallets, ownerAccounts]);

  const pendingSalary = salaryProposals.filter((proposal) => proposal.status === "needs_choice");
  const reviewCount = pendingSalary.length + transferReview.unmatched.length + transferReview.ambiguous.length;
  const summary = signals.declinedCount > 0
    ? `${toIndicDigits(String(signals.declinedCount))} عملية مرفوضة تحتاج انتباهاً`
    : reviewCount > 0
      ? `${toIndicDigits(String(reviewCount))} إشارة تحتاج مراجعة`
      : signals.receiptFresh ? "الإيصالات حديثة" : "لا توجد إشارة حديثة";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white/80 dark:bg-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center gap-3 px-4 py-3 text-start press"
        aria-expanded={open}
      >
        <span className="w-8 h-8 rounded-xl bg-finance/10 text-finance flex items-center justify-center shrink-0">
          <RefreshCw size={16} />
        </span>
        <span className="flex-1 min-w-0">
          <strong className="block text-sm text-gray-800 dark:text-white">إشارات المال</strong>
          <span className="block text-[11px] text-gray-500 truncate">{summary}</span>
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3 text-xs text-gray-600 dark:text-gray-300">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2">
              <span className="block text-[10px] text-gray-400">الإيصال الأخير</span>
              <strong>{signals.lastReceiptDate ? formatDate(signals.lastReceiptDate) : "لا يوجد"}</strong>
              <span className="block text-[10px] text-gray-400">{signals.receiptFresh ? "حديث" : "أقدم من الإعداد"}</span>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2">
              <span className="block text-[10px] text-gray-400">الرصيد المرصود</span>
              <strong>{formatAmount(signals.observedCashSum)} ر.س</strong>
              <span className="block text-[10px] text-gray-400">من الحسابات المملوكة فقط</span>
            </div>
          </div>

          {signals.declinedCount > 0 && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 text-amber-800 px-3 py-2">
              <CircleAlert size={15} className="shrink-0 mt-0.5" />
              <span>{toIndicDigits(String(signals.declinedCount))} عملية مرفوضة محفوظة كمعلومة ولا تُحسب صرفاً.</span>
            </div>
          )}

          {pendingSalary.length > 0 && (
            <div className="rounded-xl bg-finance/5 px-3 py-2 space-y-1.5">
              <p className="font-semibold text-gray-700 dark:text-gray-200">دخل يحتاج تأكيد الراتب</p>
              {pendingSalary.slice(0, 3).map((proposal) => (
                <div key={proposal.eventId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{proposal.payer || proposal.canonicalPayer}</span>
                  <strong>{formatAmount(proposal.amount)} ر.س</strong>
                </div>
              ))}
              <button type="button" onClick={openReview} className="text-finance font-semibold underline underline-offset-2">راجع الوارد وأكّد يدوياً</button>
            </div>
          )}

          {transferReview.unmatched.length + transferReview.ambiguous.length > 0 && (
            <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2 flex items-start gap-2">
              <Repeat size={15} className="shrink-0 mt-0.5 text-slate-500" />
              <span>تحويلات داخلية غير مربوطة أو ملتبسة؛ لم تُحسب كدخل أو صرف تلقائياً.</span>
            </div>
          )}

          {signals.merchantFrequency.length > 0 && (
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <Wallet size={13} /> أكثر تكرار: {signals.merchantFrequency[0].merchant} ({toIndicDigits(String(signals.merchantFrequency[0].count))} مرات)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
