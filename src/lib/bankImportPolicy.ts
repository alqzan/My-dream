import type { SmsParseEventResult } from "./bankParser";
import { EVENT_DAYS } from "./budgetFlow";
import { toIndicDigits } from "./utils";

// These are the receipt kinds whose amount is a real outgoing expense. The
// policy deliberately excludes transfers, settlements, refunds and notices:
// those can be valid, but they need the owner's context before affecting the
// ledger.
const AUTO_EXPENSE_KINDS = new Set<SmsParseEventResult["kind"]>([
  "purchase", "atm", "bill", "fee",
]);

const NON_EXPENSE_NOISE = new Set<SmsParseEventResult["kind"]>([
  "otp", "declined", "statement", "marketing", "info", "hold", "bnpl_settle", "self_transfer",
]);

/**
 * Whether a parsed bank receipt is safe to accept without opening the review
 * sheet. A duplicate, a generic template, a zero amount, or any non-expense
 * signal stays visible for the owner to resolve.
 */
export function isAutoApprovableBankEvent(
  event: Pick<SmsParseEventResult, "kind" | "direction" | "confidence" | "amount" | "expenseAmount" | "obligationHint">,
  duplicate = false,
  context: { dailyRate?: number; onTrip?: boolean } = {},
): boolean {
  const amount = event.expenseAmount ?? event.amount;
  const dailyRate = Number.isFinite(context.dailyRate) && (context.dailyRate ?? 0) > 0 ? context.dailyRate! : 0;
  // The daily rate is what proves an amount is small relative to what the
  // owner actually spends. Without one there is no ceiling to test against,
  // so silent auto-import must fail closed rather than accept every size —
  // being on a trip does not by itself bound how large a single receipt can
  // be, so it no longer bypasses this gate either.
  return !duplicate
    && event.direction === "out"
    && AUTO_EXPENSE_KINDS.has(event.kind)
    && !NON_EXPENSE_NOISE.has(event.kind)
    && event.confidence !== "generic"
    && !event.obligationHint
    && Number.isFinite(amount)
    && amount > 0
    && dailyRate > 0
    && amount < dailyRate * EVENT_DAYS;
}

/** Human-readable reason an otherwise-expense receipt must wait for routing. */
export function bankImportRouteReason(
  event: Pick<SmsParseEventResult, "kind" | "amount" | "expenseAmount">,
  dailyRate = 0,
  onTrip = false,
): string | undefined {
  if (event.kind === "installment") return "قسط تمويل — راجعه يدوياً قبل اعتماده وتحديث الالتزام.";
  if (onTrip) return undefined;
  const amount = event.expenseAmount ?? event.amount;
  if (dailyRate > 0 && Number.isFinite(amount) && amount >= dailyRate * EVENT_DAYS) {
    return `مصروف كبير (يعادل ${toIndicDigits(String(EVENT_DAYS))} أيام أو أكثر) — وجّهه إلى مظروف أو اختر المصروف اليومي قبل الاعتماد.`;
  }
  return undefined;
}

const DEFAULT_EXPENSE_KINDS = new Set<SmsParseEventResult["kind"]>([
  "purchase", "atm", "bill", "fee", "installment",
]);

/** Checkbox default is a review aid, independent from automatic acceptance. */
export function defaultIncluded(
  event: Pick<SmsParseEventResult, "kind" | "direction" | "amount" | "expenseAmount" | "reviewReason">,
  duplicate = false,
  context: { dailyRate?: number; onTrip?: boolean } = {},
): { included: boolean; reason?: string } {
  const amount = event.expenseAmount ?? event.amount;
  if (duplicate) return { included: false, reason: "مكرّر" };
  if (/بطاقة|حساب|مبلغ موثوق|غير موثوق/i.test(event.reviewReason ?? "")) {
    return { included: false, reason: "راجع المبلغ" };
  }
  if (/محفظت|محفظة|wallet/i.test(event.reviewReason ?? "")) {
    return { included: false, reason: "محفظة؟" };
  }
  const routeReason = bankImportRouteReason(event, context.dailyRate ?? 0, context.onTrip === true);
  if (routeReason) return { included: false, reason: "وجّه المصروف" };
  if (event.direction !== "out" || !DEFAULT_EXPENSE_KINDS.has(event.kind)) {
    return { included: false, reason: event.kind === "unknown" ? "غير معروف" : "غير مصروف" };
  }
  if (!Number.isFinite(amount) || amount <= 0) return { included: false, reason: "راجع المبلغ" };
  return { included: true };
}

export function isReviewNoiseKind(kind: SmsParseEventResult["kind"]): boolean {
  return NON_EXPENSE_NOISE.has(kind);
}
