import type { SmsParseEventResult } from "./bankParser";

// These are the receipt kinds whose amount is a real outgoing expense. The
// policy deliberately excludes transfers, settlements, refunds and notices:
// those can be valid, but they need the owner's context before affecting the
// ledger.
const AUTO_EXPENSE_KINDS = new Set<SmsParseEventResult["kind"]>([
  "purchase", "atm", "bill", "installment", "fee",
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
): boolean {
  const amount = event.expenseAmount ?? event.amount;
  return !duplicate
    && event.direction === "out"
    && AUTO_EXPENSE_KINDS.has(event.kind)
    && !NON_EXPENSE_NOISE.has(event.kind)
    && event.confidence !== "generic"
    && !event.obligationHint
    && Number.isFinite(amount)
    && amount > 0;
}

export function isReviewNoiseKind(kind: SmsParseEventResult["kind"]): boolean {
  return NON_EXPENSE_NOISE.has(kind);
}
