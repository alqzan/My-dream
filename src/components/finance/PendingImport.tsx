"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { spendWindow } from "@/lib/budgetCycle";
import { parseBankSmsBulk, suggestCategory, learnedCategory, isLikelyDuplicate, type SmsParseEventResult } from "@/lib/bankParser";
import { bankImportRouteReason, defaultIncluded, isAutoApprovableBankEvent } from "@/lib/bankImportPolicy";
import { deleteInboxItem, type InboxItem } from "@/lib/sync";
import { today, formatAmount, getCategoryInfo, cn, toLatinDigits, firstGrapheme, uid } from "@/lib/utils";
import { budgetWarningFor } from "@/lib/budgetStatus";
import { showToast } from "@/components/ui/UndoToast";
import { Button } from "@/components/ui/Button";
import { Sparkles, BrainCircuit, Check, Copy, Plus, X, Plane } from "lucide-react";
import type { FinanceCategoryDef, InboxEventRecord, InboxExpenseRoute, ReserveSplit, TxnKind } from "@/lib/types";
import { flushPersistedStrict } from "@/lib/idbStorage";
import { effectiveDailyRate } from "@/lib/fundPlan";
import { BigExpenseRouter, applyExpenseIntent, expenseFundIdForEvent, type ExpenseIntent } from "@/components/finance/BigExpenseRouter";
import { tripSplitFor } from "@/lib/trip";

interface Pending {
  key: string;
  amount: number;
  note: string;
  date: string;
  catId: string;
  learned: boolean;
  dup: boolean;       // looks already-recorded
  included: boolean;  // will be added on confirm
  ignored: boolean;
  manual?: boolean;   // parser couldn't read it — user types the amount
  kind: SmsParseEventResult["kind"];
  event: SmsParseEventResult;
  itemId: string;
  routeRequired?: boolean;
  routeChoice?: { expenseRoute: InboxExpenseRoute; intent?: ExpenseIntent };
  tripSplit?: ReserveSplit[];
  useTrip?: boolean;
  preselectReason?: string;
}

const TRIP_EXPENSE_KINDS = new Set<TxnKind>(["purchase", "atm", "bill", "fee"]);

// Tidy a raw bank SMS into a short readable note for a manual row.
function rawNote(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function sourceDocumentKey(event: Pick<SmsParseEventResult, "eventId" | "sourceInboxId">): string {
  return event.eventId?.replace(/:\d+$/, "") ?? event.sourceInboxId ?? "";
}

function closeSourceTimes(a: SmsParseEventResult, b: SmsParseEventResult): boolean {
  const aAt = a.sourceReceivedAt ? Date.parse(a.sourceReceivedAt) : NaN;
  const bAt = b.sourceReceivedAt ? Date.parse(b.sourceReceivedAt) : NaN;
  return Number.isFinite(aAt) && Number.isFinite(bAt) && Math.abs(aAt - bAt) <= 15 * 60 * 1000;
}

function categoryForParsedEvent(
  event: SmsParseEventResult,
  categories: FinanceCategoryDef[],
  merchantRules: Record<string, string>,
): string {
  const learned = learnedCategory(event.note ?? "", categories, merchantRules);
  if (learned) return learned;
  const suggested = suggestCategory(event.note ?? "", categories, merchantRules);
  const parserCategory = categories.find((category) => category.id === event.category);
  const suggestedCategory = categories.find((category) => category.id === suggested);
  // Keep a useful parser category as the fallback, but retain owner-defined
  // children suggested for a seeded parent (for example a custom cafe label).
  if (parserCategory && suggestedCategory?.parentId === parserCategory.id) return suggested;
  if (parserCategory && !["cat-essentials", "cat-luxuries"].includes(parserCategory.id)) return parserCategory.id;
  return suggested || parserCategory?.id || "cat-essentials";
}

function withImportReviewReason(event: SmsParseEventResult, dailyRate: number, onTrip = false): SmsParseEventResult {
  const prior = (event.reviewReason ?? "").split(" · ").filter((reason) =>
    reason && !reason.startsWith("قسط تمويل —") && !reason.startsWith("مصروف كبير (يعادل")
  );
  const routeReason = bankImportRouteReason(event, dailyRate, onTrip);
  const reasons = [...prior, ...(routeReason ? [routeReason] : [])];
  return { ...event, reviewReason: reasons.length ? reasons.join(" · ") : undefined };
}

function storedInboxEvent(record: InboxEventRecord): SmsParseEventResult {
  return {
    rawText: record.rawText,
    amount: record.amount,
    expenseAmount: record.expenseAmount,
    fee: record.fee,
    kind: record.kind,
    direction: record.direction,
    category: record.category,
    note: record.note,
    date: record.date,
    time: record.time,
    bank: record.bank,
    account: record.account,
    cardLast4: record.cardLast4,
    accountId: record.accountId,
    balanceAfter: record.balanceAfter,
    balanceKind: record.balanceKind,
    counterparty: record.counterparty,
    debtRemaining: record.debtRemaining,
    obligationHint: record.obligationHint,
    refundDestination: record.refundDestination,
    template: record.template,
    confidence: record.confidence ?? "generic",
    eventId: record.eventId,
    sourceKey: record.sourceKey,
    sourceInboxId: record.sourceInboxId,
    sourceReceivedAt: record.sourceReceivedAt,
    reviewReason: record.reviewReason,
  };
}

const REVIEW_KINDS: TxnKind[] = [
  "purchase", "atm", "bill", "installment", "fee", "card_settle", "transfer_in",
  "transfer_out", "deposit", "salary", "refund", "reversal", "cashback", "self_transfer", "declined", "info", "unknown",
];
function kindLabel(kind: TxnKind): string {
  const labels: Partial<Record<TxnKind, string>> = {
    purchase: "مصروف/شراء", atm: "سحب نقدي", bill: "فاتورة", installment: "قسط",
    fee: "رسم", card_settle: "سداد بطاقة", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر",
    deposit: "إيداع", salary: "راتب", refund: "استرجاع", reversal: "عكس عملية", cashback: "استرداد نقدي",
    self_transfer: "تحويل بين حساباتي", declined: "عملية مرفوضة",
    info: "معلومة/التزام", unknown: "غير معروف",
  };
  return labels[kind] ?? kind;
}

// Review queue for bank messages that arrived automatically (via the iOS
// Automation → cloud inbox). Each row is pre-classified with the smart
// suggestion; the user just confirms or changes the section, then adds.
export function PendingImport({ items, onClose }: { items: InboxItem[]; onClose: () => void }) {
  const categories = useAppStore((s) => s.categories);
  const merchantRules = useAppStore((s) => s.merchantRules);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const inboxEvents = useAppStore((s) => s.inboxEvents ?? []);
  const budgets = useAppStore((s) => s.budgets);
  const monthlyIncome = useAppStore((s) => s.monthlyIncome);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const ownerWallets = useAppStore((s) => s.ownerWallets ?? []);
  const addCategory = useAppStore((s) => s.addCategory);
  const rememberMerchant = useAppStore((s) => s.rememberMerchant);
  const confirmInboxEvent = useAppStore((s) => s.confirmInboxEvent);
  const decideInboxEvent = useAppStore((s) => s.decideInboxEvent);
  const dailyRate = dailyBudget ? effectiveDailyRate(dailyBudget.amount, dailyBudget.fundingPerDay) : 0;
  // Which row is currently showing the inline "new category" form (by key).
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const initial = useMemo<Pending[]>(() => {
    const out: Pending[] = [];
    for (const item of items) {
      // Local rows are reconstructed from the canonical persisted event.  A
      // manual paste can contain several subevents, so reparsing the stored
      // chunk with a new index would turn `manual:uuid:2` into `:0` and make a
      // later approval collide with the first event.
      const stored = item.sourceEventId
        ? inboxEvents.find((event) => event.eventId === item.sourceEventId)
        : undefined;
      const parsed: SmsParseEventResult[] = stored
        ? [storedInboxEvent(stored)]
        : parseBankSmsBulk(item.text, today(), {
            sender: item.from,
            receivedAt: item.ts,
            sourceInboxId: item.sourceInboxId ?? (item.localOnly ? undefined : item.id),
            sourceId: item.sourceEventId?.replace(/:\d+$/, ""),
            ownerWallets,
          }).events.map((event, index) => item.sourceEventId && index === 0
            ? { ...event, eventId: item.sourceEventId }
            : event);
      if (parsed.length === 0) {
        // Unreadable message the watcher chose to surface rather than drop —
        // show it as a manual row (raw text + an amount to fill in) so no
        // expense is ever lost to a format we didn't recognise.
        const event: SmsParseEventResult = {
          rawText: item.text,
          amount: 0,
          expenseAmount: 0,
          kind: "unknown",
          direction: "neutral",
          category: suggestCategory(item.text, categories, merchantRules),
          note: rawNote(item.text),
          date: today(),
          confidence: "generic",
          eventId: item.sourceEventId ?? `${item.id}:0`,
          sourceInboxId: item.sourceInboxId ?? (item.localOnly ? undefined : item.id),
          sourceReceivedAt: item.ts,
        };
        out.push({
          key: `${item.id}-m`,
          amount: 0,
          note: rawNote(item.text),
          date: today(),
          catId: suggestCategory(item.text, categories, merchantRules),
          learned: false,
          dup: false,
          included: false, // can't include until an amount is entered
          ignored: false,
          manual: true,
          kind: event.kind,
          event,
          itemId: item.id,
          preselectReason: "غير معروف",
        });
        continue;
      }
      parsed.forEach((r, i) => {
        const known = learnedCategory(r.note ?? "", categories, merchantRules);
        const dup = r.direction === "out" && isLikelyDuplicate(r.expenseAmount ?? r.amount, r.date, r.note ?? "", transactions);
        const amount = (r.expenseAmount ?? 0) > 0 ? r.expenseAmount ?? 0 : r.amount;
        const tripSplit = TRIP_EXPENSE_KINDS.has(r.kind) ? tripSplitFor(reserves, r.date) : undefined;
        const useTrip = Boolean(tripSplit);
        const event = withImportReviewReason(r, dailyRate, useTrip);
        const selection = defaultIncluded(event, dup, { dailyRate, onTrip: useTrip });
        const requiresLargeRoute = Boolean(bankImportRouteReason(event, dailyRate, useTrip));
        out.push({
          key: `${item.id}-${i}`,
          // Keep the source amount for incoming, settlement, and other
          // non-expense events. `expenseAmount` is a budget projection and may
          // intentionally be zero even when the bank receipt has a value.
          amount,
          note: r.note,
          date: r.date,
          // The parser only knows the two seeded parent categories. Re-run the
          // suggestion here so an existing user-owned child such as «مطاعم»
          // or «قهوة» is selected automatically.
          catId: known ?? categoryForParsedEvent(r, categories, merchantRules),
          learned: !!known,
          dup,
          // Default selection is separate from auto-save confidence. Generic
          // expenses stay checked for convenient review, while risk is explicit.
          included: selection.included && !requiresLargeRoute,
          ignored: false,
          kind: r.kind,
          event,
          itemId: item.id,
          manual: r.kind === "unknown",
          routeRequired: requiresLargeRoute,
          tripSplit,
          useTrip,
          preselectReason: selection.reason,
        });
      });
    }
    // The store repeats this check at the persistence boundary, but the review
    // sheet must also leave both same-time copies unchecked. Otherwise the
    // first click on "approve all" would turn a resend candidate into a saved
    // expense before the second document is inspected.
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const left = out[i]; const right = out[j];
        if (!left.event.sourceKey || left.event.sourceKey !== right.event.sourceKey) continue;
        if (sourceDocumentKey(left.event) === sourceDocumentKey(right.event)) continue;
        if (!closeSourceTimes(left.event, right.event)) continue;
        left.dup = true; left.included = false;
        right.dup = true; right.included = false;
        left.preselectReason = "مكرّر";
        right.preselectReason = "مكرّر";
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [categories, merchantRules, transactions, reserves, inboxEvents, items, dailyRate, ownerWallets]);

  const [rows, setRows] = useState<Pending[]>(initial);

  async function clearInbox(itemIds: Set<string>) {
    await Promise.all([...items.filter((item) => itemIds.has(item.id) && !item.localOnly).map((item) => item.id)]
      .map((id) => deleteInboxItem(id).catch(() => {})));
  }

  function setCat(key: string, catId: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, catId, event: { ...r.event, category: catId } } : r)));
  }

  function toggleInclude(key: string) {
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      if (!r.included && r.routeRequired && !r.routeChoice) return r;
      return { ...r, included: !r.included, ignored: false };
    }));
  }

  function chooseExpenseRoute(key: string, route: InboxExpenseRoute, intent?: ExpenseIntent) {
    setRows((rs) => rs.map((r) => r.key === key
      ? { ...r, routeChoice: { expenseRoute: route, intent }, included: true, ignored: false }
      : r));
  }

  const tripRows = rows.filter((row) => row.tripSplit && TRIP_EXPENSE_KINDS.has(row.kind));
  const allTripRowsOn = tripRows.length > 0 && tripRows.every((row) => row.useTrip);

  function setTripForRows(keys: Set<string>, enabled: boolean) {
    setRows((rs) => rs.map((row) => {
      if (!keys.has(row.key) || !row.tripSplit || !TRIP_EXPENSE_KINDS.has(row.kind)) return row;
      const event = withImportReviewReason(row.event, dailyRate, enabled);
      const routeRequired = Boolean(bankImportRouteReason(event, dailyRate, enabled));
      const selection = defaultIncluded(event, row.dup, { dailyRate, onTrip: enabled });
      return {
        ...row,
        useTrip: enabled,
        routeChoice: undefined,
        routeRequired,
        included: !row.ignored && selection.included && !routeRequired,
        preselectReason: selection.reason ?? (routeRequired ? "وجّه المصروف" : undefined),
        event,
      };
    }));
  }

  function toggleTripForRow(key: string) {
    const row = rows.find((item) => item.key === key);
    if (!row?.tripSplit) return;
    setTripForRows(new Set([key]), !row.useTrip);
  }

  function toggleTripForAll() {
    setTripForRows(new Set(tripRows.map((row) => row.key)), !allTripRowsOn);
  }

  function ignoreRow(key: string) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, included: false, ignored: true } : r)));
  }

  function setKind(key: string, kind: TxnKind) {
    const incoming = new Set<TxnKind>(["refund", "cashback", "reversal", "transfer_in", "deposit", "salary"]);
    const expense = new Set<TxnKind>(["purchase", "atm", "bill", "installment", "fee"]);
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const direction: SmsParseEventResult["direction"] = incoming.has(kind) ? "in" : expense.has(kind) || kind === "card_settle" || kind === "transfer_out" ? "out" : kind === "self_transfer" ? r.event.direction : "neutral";
      const event = { ...r.event, kind, direction, confidence: "inferred" as const, category: r.catId,
        ...(kind === "refund" || kind === "reversal" ? { refundDestination: undefined } : {}),
        expenseAmount: expense.has(kind) ? r.amount + (r.event.fee ?? 0) : 0 };
      const tripSplit = TRIP_EXPENSE_KINDS.has(kind) ? tripSplitFor(reserves, r.date) : undefined;
      const useTrip = Boolean(tripSplit);
      const updatedEvent = withImportReviewReason(event, dailyRate, useTrip);
      const routeRequired = Boolean(bankImportRouteReason(updatedEvent, dailyRate, useTrip));
      const selection = defaultIncluded(updatedEvent, r.dup, { dailyRate, onTrip: useTrip });
      return {
        ...r, kind, event: updatedEvent, included: false, ignored: false,
        manual: kind === "unknown", routeRequired, routeChoice: undefined,
        tripSplit, useTrip, preselectReason: selection.reason ?? "راجع النوع",
      };
    }));
  }

  function setRefundDestination(key: string, destination: SmsParseEventResult["refundDestination"]) {
    setRows((rs) => rs.map((r) => r.key === key
      ? { ...r, event: { ...r.event, refundDestination: destination } }
      : r));
  }

  // Manual (unreadable) rows: user types the amount; auto-include once it's > 0.
  function setAmount(key: string, val: string) {
    const n = parseFloat(toLatinDigits(val).replace(/[^\d.]/g, "")) || 0;
    setRows((rs) => rs.map((r) => {
      if (r.key !== key) return r;
      const kind = r.kind === "unknown" ? "purchase" as const : r.kind;
      const incoming = new Set<TxnKind>(["refund", "cashback", "reversal", "transfer_in", "deposit", "salary"]);
      const expense = new Set<TxnKind>(["purchase", "atm", "bill", "installment", "fee"]);
      const direction = incoming.has(kind) ? "in" as const : expense.has(kind) || kind === "card_settle" || kind === "transfer_out" ? "out" as const : kind === "self_transfer" ? r.event.direction : "neutral" as const;
      const baseEvent = { ...r.event, amount: n, expenseAmount: expense.has(kind) ? n : 0, kind, direction, confidence: "inferred" as const, category: r.catId };
      const tripSplit = TRIP_EXPENSE_KINDS.has(kind) ? tripSplitFor(reserves, r.date) : undefined;
      const useTrip = Boolean(tripSplit);
      const event = withImportReviewReason(baseEvent, dailyRate, useTrip);
      const routeRequired = Boolean(bankImportRouteReason(event, dailyRate, useTrip));
      const selection = defaultIncluded(event, r.dup, { dailyRate, onTrip: useTrip });
      return {
        ...r, amount: n, included: n > 0 && selection.included && !routeRequired,
        kind: event.kind, event, manual: false, routeRequired, routeChoice: undefined,
        tripSplit, useTrip, preselectReason: n > 0 ? selection.reason : "راجع المبلغ",
      };
    }));
  }

  const chosen = rows.filter((r) => r.included && !r.ignored && (!r.manual || r.amount > 0) && (!r.routeRequired || r.routeChoice));
  const unreadableCount = rows.filter((r) => r.kind === "unknown" || r.manual).length;
  const isNonExpenseRow = (row: Pending) =>
    row.kind !== "transfer_out" && ((row.event.expenseAmount ?? 0) <= 0 || row.event.direction !== "out");
  const nonExpenseRows = rows.filter(isNonExpenseRow);
  const [showNonExpenses, setShowNonExpenses] = useState(false);
  const visibleRows = showNonExpenses ? rows : rows.filter((row) => !isNonExpenseRow(row));

  // A fully legible, non-duplicate expense does not need an approval tap. The
  // effect is guarded per source snapshot so a persistence failure leaves the
  // sheet available for a manual retry without creating duplicate ledger rows.
  const autoAttemptedRef = useRef<string | null>(null);
  const autoKey = rows.map((row) => row.key).join("|");
  const autoApprovable = rows.length > 0 && rows.every((row) =>
    !row.ignored && !row.manual && row.included && !row.routeRequired
      && isAutoApprovableBankEvent(row.event, row.dup, { dailyRate, onTrip: row.useTrip })
  );

  async function handleAdd() {
    const approved = new Set(chosen.map((r) => r.key));
    const explicitlyIgnored = rows.filter((r) => r.ignored);
    for (const r of chosen) {
      const event = { ...r.event, category: r.catId, note: r.note, date: r.date,
        // Explicit approval resolves generic confidence and a source resend.
        confidence: r.event.confidence === "generic" ? "inferred" as const : r.event.confidence };
      const eventId = event.eventId ?? `${r.itemId}:0`;
      const current = useAppStore.getState();
      const alreadyHandled = current.transactions.some((transaction) => transaction.id === eventId || transaction.eventId === eventId)
        || current.settlements?.some((settlement) => settlement.id === eventId || settlement.eventId === eventId)
        || current.inboxDecisions?.some((decision) => decision.eventId === eventId && ["saved", "matched", "ignored", "duplicate"].includes(decision.decision))
        || current.deleted?.[eventId] !== undefined;
      const intent = r.routeChoice?.intent
        ? { ...r.routeChoice.intent, eventId }
        : undefined;
      if (!alreadyHandled && intent) applyExpenseIntent(intent, eventId);
      const route = r.routeChoice?.expenseRoute
        ? (() => {
            // A route saved by an older render may carry a random new-fund id.
            // Repair that in memory before the transaction is persisted so its
            // split agrees with the deterministic event fund created above.
            const oldFundId = r.routeChoice.intent?.fundId;
            const nextFundId = r.routeChoice.intent?.newFund && eventId
              ? expenseFundIdForEvent(eventId)
              : oldFundId;
            if (!oldFundId || !nextFundId || oldFundId === nextFundId) return r.routeChoice.expenseRoute;
            return {
              ...r.routeChoice.expenseRoute,
              reserveSplits: r.routeChoice.expenseRoute.reserveSplits?.map((split) =>
                split.fundId === oldFundId ? { ...split, fundId: nextFundId } : split
              ),
            };
          })()
        : r.tripSplit ? (r.useTrip ? { reserveSplits: r.tripSplit } : {}) : undefined;
      confirmInboxEvent(event, route);
    }
    for (const r of explicitlyIgnored) {
      // Route a neutral copy first so the raw canonical event is retained, then
      // record the terminal ignore decision. It has no accounting effect.
      const reviewEvent = { ...r.event, kind: "unknown" as const, direction: "neutral" as const, amount: 0, expenseAmount: 0, confidence: "generic" as const };
      const eventId = reviewEvent.eventId ?? `${r.itemId}:0`;
      useAppStore.getState().importInboxEvents([reviewEvent]);
      decideInboxEvent({ id: eventId, eventId, decision: "ignored", reason: "استُبعدت صراحةً من مراجعة الوارد" });
    }
    for (const r of chosen) if (r.note.trim() && r.event.direction === "out") rememberMerchant(r.note, r.catId);
    // Live budget alert for any category these expenses pushed to its limit.
    const st = useAppStore.getState();
    const fresh = st.transactions;
    const cycleStart = spendWindow(st.budgetWindow, st.lastSalaryConfirm, st.salaryDay ?? 27, today());
    const seen = new Set<string>();
    let warn: { label: string; over: boolean; pct: number } | null = null;
    for (const r of chosen) {
      const w = budgetWarningFor(r.catId, budgets, fresh, categories, monthlyIncome, cycleStart);
      if (w && !seen.has(w.label)) {
        seen.add(w.label);
        if (!warn || (w.over && !warn.over)) warn = w;
      }
    }
    if (warn) {
      showToast(
        warn.over ? `📛 تجاوزت سقف «${warn.label}»` : `⚠️ وصلت ${warn.pct}% من سقف «${warn.label}»`,
        "warning"
      );
    }
    const resolved = new Set<string>();
    for (const item of items) {
      const itemRows = rows.filter((r) => r.itemId === item.id);
      const hasDeferredHint = itemRows.some((r) => r.event.obligationHint && !r.ignored);
      if (itemRows.length && !hasDeferredHint && itemRows.every((r) => approved.has(r.key) || r.ignored)) resolved.add(item.id);
    }
    try {
      await flushPersistedStrict();
    } catch (error) {
      const detail = error instanceof Error && error.name ? ` (${error.name})` : "";
      showToast(`حُفظت المراجعة محلياً مؤقتاً — أبقيت رسالة البنك لإعادة المحاولة.${detail}`, "warning");
      return;
    }
    await clearInbox(resolved);
    onClose();
  }

  useEffect(() => {
    if (!autoApprovable || !autoKey || autoAttemptedRef.current === autoKey) return;
    autoAttemptedRef.current = autoKey;
    void handleAdd();
    // `handleAdd` reads the current rows snapshot; the key/guard above prevents
    // reruns when the store publishes the resulting transaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApprovable, autoKey]);

  async function handleDiscard() {
    // “تجاهل الكل” is an explicit terminal decision, unlike simply leaving an
    // ambiguous row unchecked. Persist each raw event before removing its cloud
    // inbox document so the choice survives another device.
    for (const r of rows) {
      const event = { ...r.event, kind: "unknown" as const, direction: "neutral" as const, amount: 0, expenseAmount: 0, confidence: "generic" as const };
      const eventId = event.eventId ?? `${r.itemId}:0`;
      useAppStore.getState().importInboxEvents([event]);
      decideInboxEvent({ id: eventId, eventId, decision: "ignored", reason: "تجاهل الكل" });
    }
    try {
      await flushPersistedStrict();
    } catch {
      showToast("لم يكتمل حفظ قرار التجاهل — أبقيت الرسائل لإعادة المحاولة.", "warning");
      return;
    }
    await clearInbox(new Set(items.map((item) => item.id)));
    onClose();
  }

  if (!rows.length) {
    return (
      <div className="text-center py-6 space-y-3">
        <p className="text-sm text-gray-500">ما فيه مصاريف جديدة للمراجعة.</p>
        <Button onClick={handleDiscard} className="w-full">تم</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 bg-finance/10 text-finance rounded-xl px-3 py-2 text-xs font-semibold">
        <Sparkles size={15} /> المعاملات الواضحة تُضاف تلقائياً — هذه الرسائل تحتاج مراجعة.
      </div>

      {unreadableCount > 0 && (
        <div className="flex items-start gap-2 bg-amber-50 text-amber-700 rounded-xl px-3 py-2 text-[11px] leading-relaxed">
          <span className="shrink-0">📩</span>
          <span>
            {unreadableCount} رسالة غير معروفة — اختر نوعها واكتب المبلغ إذا كانت مصروفاً،
            أو اتركها معلّقة حتى تراجعها لاحقاً.
          </span>
        </div>
      )}

      {nonExpenseRows.length > 0 && (
        <button
          type="button"
          onClick={() => setShowNonExpenses((value) => !value)}
          className="w-full text-right text-[11px] font-semibold text-slate-600 bg-slate-50 rounded-xl px-3 py-2"
        >
          {showNonExpenses ? "إخفاء الرسائل غير المصروفة" : `عرض ${nonExpenseRows.length} رسالة غير مصروفة`}
        </button>
      )}

      {tripRows.length > 0 && (
        <button
          type="button"
          onClick={toggleTripForAll}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-finance/25 bg-finance/5 px-3 py-2 text-[11px] font-bold text-finance"
        >
          <Plane size={14} />
          {allTripRowsOn ? "لا شيء على الرحلة" : `احسب ${tripRows.length} مصروف على الرحلة`}
        </button>
      )}

      <div className="max-h-[52vh] overflow-y-auto space-y-2 pr-0.5">
        {visibleRows.map((r) => {
          const info = getCategoryInfo(categories, r.catId);
          return (
            <div
              key={r.key}
              className={cn(
                "rounded-xl p-2.5 space-y-2 transition-opacity",
                r.ignored ? "bg-red-50/50 opacity-55" : r.included ? "bg-gray-50" : "bg-gray-50/50"
              )}
              style={{ borderRight: `3px solid ${info.color}` }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleInclude(r.key)}
                  aria-label={r.included ? "إبقاء للمراجعة" : "اعتماد"}
                  disabled={r.ignored || (!r.included && r.routeRequired && !r.routeChoice)}
                  className={cn(
                    "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors",
                    r.included ? "bg-finance border-finance text-white" : "bg-white border-gray-300 text-transparent"
                  )}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <span className="text-lg shrink-0">{info.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-gray-700 truncate">{r.note || "رسالة بنكية"}</span>
                    {r.manual && (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">
                        ما قدرت أقرأه
                      </span>
                    )}
                    {r.dup && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 rounded-full px-1.5 py-0.5 shrink-0">
                        <Copy size={9} /> مكرّر؟
                      </span>
                    )}
                    {r.learned && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-finance bg-finance/10 rounded-full px-1.5 py-0.5 shrink-0">
                        <BrainCircuit size={9} /> متعلّم
                      </span>
                    )}
                    {r.kind !== "purchase" && (
                      <span className="text-[9px] font-bold text-slate-600 bg-slate-100 rounded-full px-1.5 py-0.5 shrink-0">
                        {kindLabel(r.kind)}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400">{r.date}</div>
                </div>
                {r.manual ? (
                  <input
                    value={r.amount ? String(r.amount) : ""}
                    onChange={(e) => setAmount(r.key, e.target.value)}
                    inputMode="decimal"
                    placeholder="المبلغ"
                    aria-label="اكتب المبلغ"
                    className="w-20 shrink-0 text-sm text-left border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-finance/40"
                  />
                ) : (
                  <span className={cn("text-sm font-bold shrink-0", r.event.direction === "in" ? "text-emerald-600" : r.event.direction === "out" ? "text-red-500" : "text-gray-500")}>
                    {r.event.direction === "out" ? "-" : r.event.direction === "in" ? "+" : ""}{formatAmount(r.amount)}
                  </span>
                )}
              </div>
              {r.event.reviewReason && (
                <p className="rounded-lg bg-amber-50 text-amber-800 px-2.5 py-1.5 text-[10px] leading-relaxed">
                  {r.event.reviewReason}
                </p>
              )}
              {r.preselectReason && !r.included && !r.ignored && (
                <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800">
                  {r.preselectReason}
                </span>
              )}
              {r.tripSplit && TRIP_EXPENSE_KINDS.has(r.kind) && (
                <button
                  type="button"
                  onClick={() => toggleTripForRow(r.key)}
                  aria-pressed={Boolean(r.useTrip)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold",
                    r.useTrip ? "bg-finance/10 text-finance" : "bg-gray-100 text-gray-600"
                  )}
                >
                  <Plane size={11} />
                  {r.useTrip
                    ? `على رحلة ${reserves.find((fund) => fund.id === r.tripSplit?.[0]?.fundId)?.name ?? "السفر"} · اضغط للإزالة`
                    : `إلى الرحلة ${reserves.find((fund) => fund.id === r.tripSplit?.[0]?.fundId)?.name ?? "السفر"}`}
                </button>
              )}
              {r.routeRequired && (
                <BigExpenseRouter
                  amount={r.event.expenseAmount ?? r.amount}
                  note={r.note}
                  eventId={r.event.eventId ?? r.key}
                  splits={r.routeChoice?.expenseRoute.reserveSplits ?? []}
                  offBudget={r.routeChoice?.expenseRoute.offBudget ?? false}
                  intent={r.routeChoice?.intent ?? null}
                  onDaily={() => chooseExpenseRoute(r.key, {})}
                  onPlan={(intent) => chooseExpenseRoute(r.key, {
                    reserveSplits: [{ fundId: intent.fundId, pct: intent.pct }],
                  }, intent)}
                  onOffBudget={() => chooseExpenseRoute(r.key, { offBudget: true })}
                />
              )}
              <div className="flex items-center gap-1.5">
                <select
                  value={r.kind}
                  onChange={(e) => setKind(r.key, e.target.value as TxnKind)}
                  aria-label="نوع الرسالة"
                  className="flex-1 text-[11px] bg-white border border-gray-200 rounded-lg px-2 py-1.5"
                >
                  {REVIEW_KINDS.map((kind) => <option key={kind} value={kind}>{kindLabel(kind)}</option>)}
                </select>
                {(r.kind === "refund" || r.kind === "reversal") && (
                  <select
                    value={r.event.refundDestination ?? ""}
                    onChange={(e) => setRefundDestination(r.key, (e.target.value || undefined) as SmsParseEventResult["refundDestination"])}
                    aria-label="وجهة الاسترجاع"
                    className="flex-1 text-[11px] bg-white border border-amber-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="">وجهة الاسترجاع…</option>
                    <option value="merchant_card">إلى البطاقة</option>
                    <option value="person_bank">إلى حسابي</option>
                    <option value="unknown">غير متأكد</option>
                  </select>
                )}
                <button
                  onClick={() => ignoreRow(r.key)}
                  className={cn("flex items-center gap-1 text-[10px] font-bold rounded-lg px-2 py-1.5", r.ignored ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500")}
                >
                  <X size={12} /> {r.ignored ? "متجاهلة" : "تجاهل"}
                </button>
              </div>
              {addingFor === r.key ? (
                <NewCategoryInline
                  categories={categories}
                  onCancel={() => setAddingFor(null)}
                  onCreate={(def) => {
                    addCategory(def);
                    setCat(r.key, def.id);
                    setAddingFor(null);
                  }}
                />
              ) : (
                <div className="flex items-center gap-1.5">
                  <div className="flex-1 min-w-0">
                    <CategorySelect categories={categories} value={r.catId} onChange={(id) => setCat(r.key, id)} />
                  </div>
                  <button
                    onClick={() => setAddingFor(r.key)}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-finance bg-finance/10 rounded-lg px-2 py-2 press"
                    aria-label="إضافة قسم جديد"
                    title="أضف قسماً جديداً"
                  >
                    <Plus size={13} /> قسم
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 pt-1">
        <Button onClick={handleAdd} disabled={!chosen.length && !rows.some((r) => r.ignored)} className="flex-1 bg-finance hover:bg-finance/90 disabled:opacity-40">
          {chosen.length ? `اعتمد ${chosen.length} رسالة ✓` : rows.some((r) => r.ignored) ? "احفظ التجاهل ✓" : "لا شيء محدّد"}
        </Button>
        <Button variant="secondary" onClick={handleDiscard}>تجاهل الكل</Button>
      </div>
    </div>
  );
}

// A single dropdown of every category: each main, then its subs indented.
function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: { id: string; label: string; icon: string; parentId?: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const mains = categories.filter((c) => !c.parentId);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs bg-white border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:ring-2 focus:ring-finance/40"
    >
      {mains.map((m) => {
        const subs = categories.filter((c) => c.parentId === m.id);
        return (
          <optgroup key={m.id} label={`${m.icon} ${m.label}`}>
            <option value={m.id}>{m.icon} {m.label} (عام)</option>
            {subs.map((s) => (
              <option key={s.id} value={s.id}>&nbsp;&nbsp;↳ {s.icon} {s.label}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// A few warm-palette icons/colors so a category made on the fly still looks
// at home; it can be fully re-styled later from «تصنيفاتي».
const QUICK_ICONS = ["🏷️", "🧺", "✨", "🍽️", "☕", "🚗", "🏠", "💊", "🎁", "📌"];
const QUICK_COLORS = ["#c1663f", "#c9852a", "#3d9640", "#1f7a6c", "#8a6fb0", "#c94f6d"];


// Inline "add a category" form shown right on a bank row, so a message that
// fits nothing existing can get its own section without leaving the review.
// You can make it a standalone main category, or nest it under a section that
// takes sub-categories (أساسيات/كماليات) — a sub inherits its parent's color.
function NewCategoryInline({
  categories,
  onCreate,
  onCancel,
}: {
  categories: FinanceCategoryDef[];
  onCreate: (def: FinanceCategoryDef) => void;
  onCancel: () => void;
}) {
  const subTargets = categories.filter((c) => !c.parentId && c.allowSubs);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(QUICK_ICONS[0]);
  const [parent, setParent] = useState(""); // "" = standalone main
  const [color, setColor] = useState(QUICK_COLORS[0]);

  function submit() {
    const label = name.trim();
    if (!label) return;
    const parentMain = parent ? categories.find((c) => c.id === parent) : null;
    onCreate({
      id: uid(),
      label,
      icon,
      color: parentMain ? parentMain.color : color,
      parentId: parent || undefined,
    });
  }

  return (
    <div className="rounded-xl bg-white border border-finance/30 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-8 h-8 shrink-0 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-base">
          {icon}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="اسم القسم الجديد"
          className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-finance/40"
          autoFocus
        />
        <button onClick={onCancel} className="p-1 text-gray-300 hover:text-red-400 shrink-0" aria-label="إلغاء">
          <X size={15} />
        </button>
      </div>

      <div className="flex gap-1 flex-wrap items-center">
        {QUICK_ICONS.map((ic) => (
          <button
            key={ic}
            onClick={() => setIcon(ic)}
            className={cn("text-sm p-1 rounded-lg", icon === ic ? "bg-finance/10 ring-1 ring-finance" : "hover:bg-gray-100")}
          >
            {ic}
          </button>
        ))}
        <input
          value=""
          onChange={(e) => {
            const emoji = firstGrapheme(e.target.value);
            if (emoji) setIcon(emoji);
          }}
          placeholder="إيموجي"
          className="w-16 text-[11px] border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-finance/40"
          aria-label="إيموجي مخصص"
        />
      </div>

      {subTargets.length > 0 && (
        <select
          value={parent}
          onChange={(e) => setParent(e.target.value)}
          className="w-full text-[11px] bg-white border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-finance/40"
          aria-label="مكان القسم"
        >
          <option value="">قسم رئيسي مستقل</option>
          {subTargets.map((t) => (
            <option key={t.id} value={t.id}>تحت {t.icon} {t.label}</option>
          ))}
        </select>
      )}

      {!parent && (
        <div className="flex gap-1.5 flex-wrap">
          {QUICK_COLORS.map((c, i) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn("w-5 h-5 rounded-full", color === c ? "ring-2 ring-offset-1 ring-gray-400" : "")}
              style={{ backgroundColor: c }}
              aria-label={`اللون ${i + 1}`}
              aria-pressed={color === c}
            />
          ))}
        </div>
      )}

      <button
        onClick={submit}
        disabled={!name.trim()}
        className="w-full flex items-center justify-center gap-1 text-xs font-bold text-white bg-finance rounded-lg py-2 press disabled:opacity-40"
      >
        <Plus size={13} /> أضف القسم وصنّف عليه
      </button>
    </div>
  );
}
