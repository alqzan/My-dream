/**
 * Pure credit-card settlement allocation.
 *
 * This module deliberately has no knowledge of AppData, Zustand, or the DOM.
 * It accepts the small set of fields used by imports and by the store, but
 * normalises every amount to integer cents before doing any arithmetic.  The
 * public `amount` fields are convenient major-unit numbers for the existing
 * finance model; every result also carries its exact `...Cents` counterpart.
 *
 * A settlement is a cash movement, not an expense.  It can pay only a charge
 * on the same card which happened strictly before it.  The strict comparison
 * is intentional: a date-only pair on the same day (or two events with the
 * same timestamp) is not silently ordered to make an excess disappear.  A
 * stable id is still used as a deterministic presentation tie-breaker.
 */

export type CreditLedgerMoney = number | string;
export type CreditLedgerId = string | number;

export interface CreditLedgerChargeInput {
  id?: CreditLedgerId;
  eventId?: CreditLedgerId;
  sourceKey?: CreditLedgerId;
  cardId?: CreditLedgerId;
  accountId?: CreditLedgerId;
  cardLast4?: CreditLedgerId;
  amount?: CreditLedgerMoney;
  amountCents?: CreditLedgerMoney;
  cents?: CreditLedgerMoney;
  date?: string;
  time?: string;
  occurredAt?: string;
  postedAt?: string;
  kind?: string;
  fundingKind?: string;
}

export interface CreditLedgerSettlementInput {
  id?: CreditLedgerId;
  eventId?: CreditLedgerId;
  sourceKey?: CreditLedgerId;
  cardId?: CreditLedgerId;
  accountId?: CreditLedgerId;
  cardLast4?: CreditLedgerId;
  amount?: CreditLedgerMoney;
  amountCents?: CreditLedgerMoney;
  cents?: CreditLedgerMoney;
  date?: string;
  time?: string;
  occurredAt?: string;
  postedAt?: string;
  kind?: string;
  fundingKind?: string;
}

export type CreditLedgerResolutionKind = "missed_expense" | "opening_debt" | "prepaid_credit";

export interface CreditLedgerResolutionInput {
  id?: CreditLedgerId;
  cardId?: CreditLedgerId;
  accountId?: CreditLedgerId;
  cardLast4?: CreditLedgerId;
  kind?: CreditLedgerResolutionKind | string;
  amount?: CreditLedgerMoney;
  amountCents?: CreditLedgerMoney;
  cents?: CreditLedgerMoney;
  allocatedAmount?: CreditLedgerMoney;
  allocatedAmountCents?: CreditLedgerMoney;
  date?: string;
  time?: string;
  occurredAt?: string;
  settlementId?: CreditLedgerId;
  settlementIds?: CreditLedgerId[];
  allocatedSettlementId?: CreditLedgerId;
  allocatedSettlementIds?: CreditLedgerId[];
  chargeId?: CreditLedgerId;
  chargeIds?: CreditLedgerId[];
  targetChargeId?: CreditLedgerId;
  targetChargeIds?: CreditLedgerId[];
  appliedToEventId?: CreditLedgerId;
  appliedToEventIds?: CreditLedgerId[];
  eventId?: CreditLedgerId;
}

export type CreditLedgerRefundDestination =
  | "card"
  | "merchant_card"
  | "credit_card"
  | "person_bank"
  | "bank_cash"
  | "person";

export interface CreditLedgerRefundInput {
  id?: CreditLedgerId;
  eventId?: CreditLedgerId;
  sourceKey?: CreditLedgerId;
  cardId?: CreditLedgerId;
  accountId?: CreditLedgerId;
  cardLast4?: CreditLedgerId;
  chargeId?: CreditLedgerId;
  originalChargeId?: CreditLedgerId;
  amount?: CreditLedgerMoney;
  amountCents?: CreditLedgerMoney;
  cents?: CreditLedgerMoney;
  date?: string;
  time?: string;
  occurredAt?: string;
  destination?: CreditLedgerRefundDestination | string;
  refundDestination?: CreditLedgerRefundDestination | string;
  target?: CreditLedgerRefundDestination | string;
  kind?: string;
}

export interface CreditLedgerCardInput {
  id?: CreditLedgerId;
  cardId?: CreditLedgerId;
  accountId?: CreditLedgerId;
  last4?: CreditLedgerId;
  cardLast4?: CreditLedgerId;
  kind?: string;
  fundingKind?: string;
  isCredit?: boolean;
}

export interface CreditLedgerInput {
  charges?: readonly CreditLedgerChargeInput[];
  settlements?: readonly CreditLedgerSettlementInput[];
  resolutions?: readonly CreditLedgerResolutionInput[];
  cardRefunds?: readonly CreditLedgerRefundInput[];
  cards?: readonly CreditLedgerCardInput[];
}

// Short aliases keep the public API pleasant for callers that do not need to
// distinguish the raw input shape from the normalised internal records.
export type CreditLedgerCharge = CreditLedgerChargeInput;
export type CreditLedgerSettlement = CreditLedgerSettlementInput;
export type CreditLedgerResolution = CreditLedgerResolutionInput;
export type CreditLedgerRefund = CreditLedgerRefundInput;
export type CreditLedgerCard = CreditLedgerCardInput;

export type CreditLedgerRecordType = "charge" | "settlement" | "resolution" | "refund" | "card";

export type CreditLedgerIssueCode =
  | "missing_id"
  | "duplicate_id"
  | "missing_card"
  | "unknown_card"
  | "non_credit_card"
  | "missing_amount"
  | "invalid_amount"
  | "negative_amount"
  | "zero_amount"
  | "amount_conflict"
  | "invalid_date"
  | "missing_date"
  | "invalid_time"
  | "invalid_resolution_kind"
  | "resolution_missing_settlement"
  | "resolution_unknown_settlement"
  | "resolution_wrong_card"
  | "resolution_unknown_charge"
  | "resolution_wrong_charge_card"
  | "resolution_overallocated"
  | "resolution_amount_mismatch"
  | "resolution_ambiguous_chronology"
  | "refund_destination_required"
  | "refund_destination_unknown"
  | "refund_unknown_charge"
  | "refund_ambiguous_charge"
  | "refund_wrong_card"
  | "refund_before_charge"
  | "refund_overallocated"
  | "ambiguous_chronology"
  | "unresolved_excess";

export interface CreditLedgerIssue {
  code: CreditLedgerIssueCode;
  message: string;
  severity: "error" | "warning";
  recordType?: CreditLedgerRecordType;
  recordId?: string;
  cardId?: string;
  relatedId?: string;
  amountCents?: number;
}

export type CreditLedgerAllocationKind =
  | "charge_settlement"
  | "opening_debt"
  | "missed_expense"
  | "prepaid_credit"
  | "card_refund_credit"
  | "person_bank_reimbursement"
  | "unallocated_excess";

export interface CreditLedgerAllocation {
  id: string;
  kind: CreditLedgerAllocationKind;
  cardId: string;
  amountCents: number;
  /** Major-unit convenience value; `amountCents` is the source of truth. */
  amount: number;
  settlementId?: string;
  chargeId?: string;
  resolutionId?: string;
  refundId?: string;
  date?: string;
}

export interface CreditLedgerCardSummary {
  cardId: string;
  unpaid: number;
  excess: number;
  prepaid: number;
  unsettledRecordedCharges: number;
  unsettledRecordedChargesCents: number;
  excessSettlement: number;
  excessSettlementCents: number;
  /** Remaining explicit prepayment plus unused merchant card-refund credit. */
  prepaidCredit: number;
  prepaidCreditCents: number;
  explicitPrepaidCredit: number;
  explicitPrepaidCreditCents: number;
  cardRefundCredit: number;
  cardRefundCreditCents: number;
  allocations: CreditLedgerAllocation[];
}

export interface CreditLedgerResult {
  /** Compact reconciliation view aliases used by the store adapter. */
  unpaid: number;
  excess: number;
  prepaid: number;
  unsettledRecordedCharges: number;
  unsettledRecordedChargesCents: number;
  excessSettlement: number;
  excessSettlementCents: number;
  prepaidCredit: number;
  prepaidCreditCents: number;
  byCard: Record<string, CreditLedgerCardSummary>;
  allocations: CreditLedgerAllocation[];
  issues: CreditLedgerIssue[];
  /** Alias kept for callers that name this collection explicitly. */
  validationIssues: CreditLedgerIssue[];
  /** The subset of `issues` that must stop a reconciliation: errors on a card
   * in the supplied credit catalogue (or on any card when no catalogue was
   * given). Warnings, and records the catalogue excluded as non-credit, only
   * inform — they never lock the owner out of reconciling. */
  blockingIssues: CreditLedgerIssue[];
  /** Card refunds the ledger rejected with a blocking issue. They reduced no
   * liability, so they must not be counted as restored cash either. */
  rejectedCardRefundIds: string[];
}

interface Chronology {
  date: string | null;
  time: string | null;
}

interface NormalizedBase extends Chronology {
  id: string;
  cardId: string;
  amountCents: number;
  order: number;
}

interface NormalizedCharge extends NormalizedBase {
  type: "charge";
}

interface NormalizedSettlement extends NormalizedBase {
  type: "settlement";
  reservedCents: number;
  usedCents: number;
}

interface NormalizedResolution extends NormalizedBase {
  type: "resolution";
  kind: CreditLedgerResolutionKind;
  settlementIds: string[];
  chargeIds: string[];
  settlementParts: Map<string, number>;
  valid: boolean;
}

type RefundDestinationKind = "card" | "person_bank";

interface NormalizedRefund extends NormalizedBase {
  type: "refund";
  destination: RefundDestinationKind;
  chargeId: string | null;
}

type LedgerEvent = NormalizedCharge | NormalizedSettlement | NormalizedResolution | NormalizedRefund;

interface ChargeState {
  record: NormalizedCharge;
  refundedCents: number;
  settledCents: number;
  creditAppliedCents: number;
  linkedResolutionCents: number;
  cardRefundCreditCents: number;
}

interface CreditPool {
  id: string;
  cardId: string;
  amountCents: number;
  remainingCents: number;
  availableAt: Chronology;
  kind: "prepaid_credit" | "card_refund_credit";
  resolutionId?: string;
  refundId?: string;
}

interface NormalizationContext {
  issues: CreditLedgerIssue[];
  cardsById: Map<string, string>;
  cardsByLast4: Map<string, string[]>;
  hasCards: boolean;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function text(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const result = String(value).trim();
    return result || null;
  }
  return null;
}

function recordValue(record: object, key: string): unknown {
  return (record as Record<string, unknown>)[key];
}

function firstText(record: object, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = text(recordValue(record, key));
    if (value) return value;
  }
  return null;
}

function addIssue(
  issues: CreditLedgerIssue[],
  code: CreditLedgerIssueCode,
  message: string,
  context: Partial<CreditLedgerIssue> = {},
): void {
  issues.push({ code, message, severity: "error", ...context });
}

function warnIssue(
  issues: CreditLedgerIssue[],
  code: CreditLedgerIssueCode,
  message: string,
  context: Partial<CreditLedgerIssue> = {},
): void {
  issues.push({ code, message, severity: "warning", ...context });
}

function normalizeDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[٫]/g, ".")
    .replace(/[٬,]/g, "");
}

function parseCents(value: unknown, issues: CreditLedgerIssue[], context: Partial<CreditLedgerIssue>, explicitCents: boolean): number | null {
  if (value === undefined || value === null || value === "") {
    addIssue(issues, "missing_amount", "A positive amount is required.", context);
    return null;
  }
  const raw = typeof value === "string" ? normalizeDigits(value.trim()) : value;
  const numberValue = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(numberValue)) {
    addIssue(issues, "invalid_amount", "Amount must be finite.", context);
    return null;
  }
  if (numberValue < 0) {
    addIssue(issues, "negative_amount", "Amount cannot be negative.", { ...context, amountCents: numberValue });
    return null;
  }
  if (explicitCents && !Number.isInteger(numberValue)) {
    addIssue(issues, "invalid_amount", "amountCents must be an integer.", context);
    return null;
  }
  const cents = explicitCents ? Math.round(numberValue) : Math.round(numberValue * 100);
  if (!Number.isSafeInteger(cents)) {
    addIssue(issues, "invalid_amount", "Amount is outside the safe integer-cent range.", context);
    return null;
  }
  if (cents <= 0) {
    addIssue(issues, "zero_amount", "Amount must be greater than zero.", { ...context, amountCents: cents });
    return null;
  }
  return cents;
}

function readAmount(record: object, issues: CreditLedgerIssue[], context: Partial<CreditLedgerIssue>): number | null {
  const explicit = recordValue(record, "amountCents") ?? recordValue(record, "cents");
  const major = recordValue(record, "amount");
  if (explicit !== undefined && explicit !== null && explicit !== "") {
    const cents = parseCents(explicit, issues, context, true);
    if (major !== undefined && major !== null && major !== "") {
      const majorCents = parseCents(major, [], context, false);
      if (majorCents !== null && cents !== null && majorCents !== cents) {
        addIssue(issues, "amount_conflict", "amount and amountCents disagree.", { ...context, amountCents: cents });
        return null;
      }
    }
    return cents;
  }
  return parseCents(major, issues, context, false);
}

function dateAndTime(record: object, issues: CreditLedgerIssue[], context: Partial<CreditLedgerIssue>): Chronology {
  const dateValue = firstText(record, ["date", "eventDate", "occurredDate"]);
  const timestamp = firstText(record, ["occurredAt", "postedAt", "timestamp", "createdAt"]);
  let date = dateValue;
  let time = firstText(record, ["time", "eventTime"]);
  if (!date && timestamp) {
    const iso = timestamp.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}(?::\d{2})?))?/);
    if (iso) {
      date = iso[1];
      time = time ?? iso[2] ?? null;
    }
  }
  if (date && !isCalendarDate(date)) {
    addIssue(issues, "invalid_date", `Invalid date: ${date}.`, context);
    date = null;
  }
  if (time) {
    const normalized = time.match(/(\d{2}:\d{2}(?::\d{2})?)/)?.[1] ?? time;
    if (!TIME_RE.test(normalized)) {
      addIssue(issues, "invalid_time", `Invalid time: ${time}.`, context);
      time = null;
    } else {
      time = normalized;
    }
  }
  if (!date) warnIssue(issues, "missing_date", "Record has no usable date; it cannot be chronologically allocated.", context);
  return { date, time };
}

function stableId(record: object, fallback: string): string | null {
  return firstText(record, ["id", "eventId"]) ?? fallback;
}

function cardRef(record: object, context: NormalizationContext, issues: CreditLedgerIssue[], issueContext: Partial<CreditLedgerIssue>): string | null {
  const direct = firstText(record, ["cardId", "accountId"]);
  if (direct) return context.cardsById.has(direct) ? context.cardsById.get(direct)! : direct;
  const last4 = firstText(record, ["cardLast4", "last4", "account"]);
  if (last4) {
    const candidates = context.cardsByLast4.get(last4.replace(/\D/g, "")) ?? [];
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      addIssue(issues, "missing_card", "Card last four digits match multiple cards.", issueContext);
      return null;
    }
    if (!context.hasCards) return `last4:${last4.replace(/\D/g, "")}`;
  }
  addIssue(issues, "missing_card", "A stable card id is required.", issueContext);
  return null;
}

function cardIsAllowed(record: object, cardId: string, context: NormalizationContext, issues: CreditLedgerIssue[], issueContext: Partial<CreditLedgerIssue>): boolean {
  const declaredFunding = firstText(record, ["fundingKind"]);
  if (declaredFunding && declaredFunding !== "credit") {
    warnIssue(issues, "non_credit_card", "Only proven CREDIT funding enters this ledger.", issueContext);
    return false;
  }
  if (!context.hasCards) return true;
  if (!context.cardsById.has(cardId)) {
    // Outside the proven credit catalogue: excluded from the liability, so it
    // is information for review, not an error in the credit ledger itself.
    warnIssue(issues, "unknown_card", "Card is not present in the supplied card catalogue.", { ...issueContext, cardId });
    return false;
  }
  return true;
}

function registerDuplicate(seen: Set<string>, id: string, type: CreditLedgerRecordType, issues: CreditLedgerIssue[], index: number): boolean {
  const key = `${type}:${id}`;
  if (seen.has(key)) {
    addIssue(issues, "duplicate_id", `Duplicate ${type} id is ignored: ${id}.`, { recordType: type, recordId: id });
    return false;
  }
  seen.add(key);
  return true;
}

function normalizeCards(input: readonly CreditLedgerCardInput[] | undefined, issues: CreditLedgerIssue[]): NormalizationContext {
  const cardsById = new Map<string, string>();
  const cardsByLast4 = new Map<string, string[]>();
  const seen = new Set<string>();
  for (let index = 0; index < (input ?? []).length; index += 1) {
    const record = input![index] as object;
    const id = firstText(record, ["id", "cardId", "accountId"]);
    if (!id) {
      addIssue(issues, "missing_id", "Card catalogue records need a stable id.", { recordType: "card" });
      continue;
    }
    if (!registerDuplicate(seen, id, "card", issues, index)) continue;
    const funding = firstText(record, ["fundingKind"]);
    const explicitCredit = recordValue(record, "isCredit") === true || funding === "credit";
    if (!explicitCredit) {
      warnIssue(issues, "non_credit_card", "Card is not explicitly marked CREDIT; it is excluded.", { recordType: "card", recordId: id });
      continue;
    }
    cardsById.set(id, id);
    const last4 = firstText(record, ["last4", "cardLast4"]);
    if (last4) {
      const key = last4.replace(/\D/g, "");
      const list = cardsByLast4.get(key) ?? [];
      list.push(id);
      cardsByLast4.set(key, list);
    }
  }
  return { issues, cardsById, cardsByLast4, hasCards: (input ?? []).length > 0 };
}

function normalizeBase(
  record: object,
  type: CreditLedgerRecordType,
  index: number,
  context: NormalizationContext,
  issues: CreditLedgerIssue[],
  seen: Set<string>,
): NormalizedBase | null {
  const id = stableId(record, "");
  if (!id) {
    addIssue(issues, "missing_id", `${type} records need a stable id.`, { recordType: type });
    return null;
  }
  if (!registerDuplicate(seen, id, type, issues, index)) return null;
  const issueContext: Partial<CreditLedgerIssue> = { recordType: type, recordId: id };
  const cardId = cardRef(record, context, issues, issueContext);
  if (!cardId || !cardIsAllowed(record, cardId, context, issues, issueContext)) return null;
  const amountCents = readAmount(record, issues, { ...issueContext, cardId });
  if (amountCents === null) return null;
  const chronology = dateAndTime(record, issues, { ...issueContext, cardId });
  return { id, cardId, amountCents, ...chronology, order: index };
}

function normalizeCharges(
  input: readonly CreditLedgerChargeInput[] | undefined,
  context: NormalizationContext,
  issues: CreditLedgerIssue[],
): NormalizedCharge[] {
  const result: NormalizedCharge[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < (input ?? []).length; index += 1) {
    const base = normalizeBase(input![index] as object, "charge", index, context, issues, seen);
    if (base) result.push({ ...base, type: "charge" });
  }
  return result;
}

function normalizeSettlements(
  input: readonly CreditLedgerSettlementInput[] | undefined,
  context: NormalizationContext,
  issues: CreditLedgerIssue[],
): NormalizedSettlement[] {
  const result: NormalizedSettlement[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < (input ?? []).length; index += 1) {
    const base = normalizeBase(input![index] as object, "settlement", index, context, issues, seen);
    if (base) result.push({ ...base, type: "settlement", reservedCents: 0, usedCents: 0 });
  }
  return result;
}

function resolutionIds(record: object, singular: readonly string[], plural: readonly string[]): string[] {
  const values: unknown[] = [];
  for (const key of singular) {
    const value = recordValue(record, key);
    if (value !== undefined && value !== null && value !== "") values.push(value);
  }
  for (const key of plural) {
    const value = recordValue(record, key);
    if (Array.isArray(value)) values.push(...value);
  }
  return [...new Set(values.map((value) => text(value)).filter((value): value is string => Boolean(value)))];
}

function normalizeResolutions(
  input: readonly CreditLedgerResolutionInput[] | undefined,
  context: NormalizationContext,
  issues: CreditLedgerIssue[],
  settlementsById: Map<string, NormalizedSettlement>,
  chargesById: Map<string, NormalizedCharge>,
): NormalizedResolution[] {
  const result: NormalizedResolution[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < (input ?? []).length; index += 1) {
    const record = input![index] as object;
    const id = stableId(record, "");
    if (!id) {
      addIssue(issues, "missing_id", "Resolution records need a stable id.", { recordType: "resolution" });
      continue;
    }
    if (!registerDuplicate(seen, id, "resolution", issues, index)) continue;
    const issueContext: Partial<CreditLedgerIssue> = { recordType: "resolution", recordId: id };
    const cardId = cardRef(record, context, issues, issueContext);
    if (!cardId || !cardIsAllowed(record, cardId, context, issues, issueContext)) continue;
    const kindText = firstText(record, ["kind"]);
    if (kindText !== "missed_expense" && kindText !== "opening_debt" && kindText !== "prepaid_credit") {
      addIssue(issues, "invalid_resolution_kind", "Resolution kind is not supported.", issueContext);
      continue;
    }
    const amountCents = readAmount(record, issues, { ...issueContext, cardId });
    if (amountCents === null) continue;
    const allocatedRaw = recordValue(record, "allocatedAmountCents") ?? recordValue(record, "allocatedAmount");
    let effectiveAmountCents = amountCents;
    if (allocatedRaw !== undefined && allocatedRaw !== null && allocatedRaw !== "") {
      const parsed = parseCents(allocatedRaw, issues, { ...issueContext, cardId }, recordValue(record, "allocatedAmountCents") !== undefined);
      if (parsed === null) continue;
      if (parsed > amountCents) {
        addIssue(issues, "resolution_amount_mismatch", "allocatedAmount cannot exceed resolution amount.", { ...issueContext, cardId, amountCents: parsed });
        continue;
      }
      effectiveAmountCents = parsed;
    }
    const baseDateTime = dateAndTime(record, issues, { ...issueContext, cardId });
    const settlementIds = resolutionIds(record, ["settlementId", "allocatedSettlementId"], ["settlementIds", "allocatedSettlementIds"]);
    const chargeIds = resolutionIds(record, ["chargeId", "targetChargeId", "appliedToEventId"], ["chargeIds", "targetChargeIds", "appliedToEventIds"]);
    let valid = true;
    if (settlementIds.length === 0) {
      addIssue(issues, "resolution_missing_settlement", "A resolution must name the settlement it explains.", { ...issueContext, cardId });
      valid = false;
    }
    const linkedSettlements: NormalizedSettlement[] = [];
    for (const settlementId of settlementIds) {
      const settlement = settlementsById.get(settlementId);
      if (!settlement) {
        addIssue(issues, "resolution_unknown_settlement", `Settlement ${settlementId} does not exist.`, { ...issueContext, cardId, relatedId: settlementId });
        valid = false;
      } else if (settlement.cardId !== cardId) {
        addIssue(issues, "resolution_wrong_card", `Settlement ${settlementId} belongs to another card.`, { ...issueContext, cardId, relatedId: settlementId });
        valid = false;
      } else {
        linkedSettlements.push(settlement);
      }
    }
    if (kindText !== "missed_expense" && chargeIds.length > 0) {
      addIssue(issues, "resolution_unknown_charge", "Only missed_expense resolutions may name charges.", { ...issueContext, cardId });
      valid = false;
    }
    for (const chargeId of chargeIds) {
      const charge = chargesById.get(chargeId);
      if (!charge) {
        addIssue(issues, "resolution_unknown_charge", `Charge ${chargeId} does not exist.`, { ...issueContext, cardId, relatedId: chargeId });
        valid = false;
      } else if (charge.cardId !== cardId) {
        addIssue(issues, "resolution_wrong_charge_card", `Charge ${chargeId} belongs to another card.`, { ...issueContext, cardId, relatedId: chargeId });
        valid = false;
      }
    }
    if (valid && kindText === "missed_expense" && chargeIds.length > 0) {
      for (const chargeId of chargeIds) {
        const charge = chargesById.get(chargeId);
        if (!charge) continue;
        if (linkedSettlements.some((settlement) => !strictlyBefore(charge, settlement))) {
          addIssue(issues, "resolution_ambiguous_chronology", `Charge ${chargeId} is not provably earlier than its named settlement.`, { ...issueContext, cardId, relatedId: chargeId });
          valid = false;
        }
      }
    }
    const totalAvailable = linkedSettlements.reduce((sum, settlement) => sum + settlement.amountCents - settlement.reservedCents, 0);
    if (valid && effectiveAmountCents > totalAvailable) {
      addIssue(issues, "resolution_overallocated", "Resolution amount exceeds the named settlement amounts.", { ...issueContext, cardId, amountCents: effectiveAmountCents });
      valid = false;
    }
    if (valid && kindText === "missed_expense" && chargeIds.length > 0) {
      const totalChargeCapacity = chargeIds.reduce((sum, chargeId) => sum + (chargesById.get(chargeId)?.amountCents ?? 0), 0);
      if (effectiveAmountCents > totalChargeCapacity) {
        addIssue(issues, "resolution_overallocated", "Missed-expense resolution exceeds the named charge amounts.", { ...issueContext, cardId, amountCents: effectiveAmountCents });
        valid = false;
      }
    }
    const resolution: NormalizedResolution = {
      id,
      cardId,
      amountCents: effectiveAmountCents,
      ...baseDateTime,
      order: index,
      type: "resolution",
      kind: kindText,
      settlementIds,
      chargeIds,
      settlementParts: new Map<string, number>(),
      valid,
    };
    if (valid) {
      let remaining = effectiveAmountCents;
      for (const settlement of linkedSettlements) {
        const portion = Math.min(remaining, settlement.amountCents - settlement.reservedCents);
        if (portion > 0) resolution.settlementParts.set(settlement.id, portion);
        settlement.reservedCents += portion;
        remaining -= portion;
      }
    }
    result.push(resolution);
  }
  return result;
}

function normalizeRefundDestination(record: object, issues: CreditLedgerIssue[], context: Partial<CreditLedgerIssue>): RefundDestinationKind | null {
  const raw = firstText(record, ["destination", "refundDestination", "target"])?.toLowerCase();
  if (!raw) {
    addIssue(issues, "refund_destination_required", "Refund destination must be explicit.", context);
    return null;
  }
  if (["card", "merchant_card", "credit_card", "merchant", "card_refund", "credit"].includes(raw)) return "card";
  if (["person_bank", "bank_cash", "person", "bank", "cash", "reimbursement"].includes(raw)) return "person_bank";
  addIssue(issues, "refund_destination_unknown", `Unknown refund destination: ${raw}.`, context);
  return null;
}

function normalizeRefunds(
  input: readonly CreditLedgerRefundInput[] | undefined,
  context: NormalizationContext,
  issues: CreditLedgerIssue[],
): NormalizedRefund[] {
  const result: NormalizedRefund[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < (input ?? []).length; index += 1) {
    const record = input![index] as object;
    const id = stableId(record, "");
    if (!id) {
      addIssue(issues, "missing_id", "Refund records need a stable id.", { recordType: "refund" });
      continue;
    }
    if (!registerDuplicate(seen, id, "refund", issues, index)) continue;
    const issueContext: Partial<CreditLedgerIssue> = { recordType: "refund", recordId: id };
    const cardId = cardRef(record, context, issues, issueContext);
    if (!cardId || !cardIsAllowed(record, cardId, context, issues, issueContext)) continue;
    const amountCents = readAmount(record, issues, { ...issueContext, cardId });
    if (amountCents === null) continue;
    const destination = normalizeRefundDestination(record, issues, { ...issueContext, cardId });
    if (!destination) continue;
    const chronology = dateAndTime(record, issues, { ...issueContext, cardId });
    const chargeId = firstText(record, ["chargeId", "originalChargeId"]);
    result.push({ id, cardId, amountCents, ...chronology, order: index, type: "refund", destination, chargeId });
  }
  return result;
}

function compareChronology(a: Chronology & { order: number; id: string }, b: Chronology & { order: number; id: string }): number {
  if (a.date && b.date && a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.date && !b.date) return -1;
  if (!a.date && b.date) return 1;
  if (a.date && b.date && a.date === b.date) {
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
  }
  const idOrder = a.id.localeCompare(b.id);
  return idOrder || a.order - b.order;
}

function strictlyBefore(a: Chronology, b: Chronology): boolean {
  if (!a.date || !b.date) return false;
  if (a.date !== b.date) return a.date < b.date;
  if (!a.time || !b.time) return false;
  return a.time < b.time;
}

function sameUncertainMoment(a: Chronology, b: Chronology): boolean {
  return Boolean(a.date && b.date && a.date === b.date && (!a.time || !b.time || a.time === b.time));
}

function asAmount(cents: number): number {
  return cents / 100;
}

function allocation(
  kind: CreditLedgerAllocationKind,
  cardId: string,
  cents: number,
  ids: Partial<Pick<CreditLedgerAllocation, "settlementId" | "chargeId" | "resolutionId" | "refundId">>,
  date?: string | null,
): CreditLedgerAllocation {
  const id = [kind, cardId, ids.settlementId, ids.chargeId, ids.resolutionId, ids.refundId].filter(Boolean).join(":") + `:${cents}`;
  return { id, kind, cardId, amountCents: cents, amount: asAmount(cents), ...ids, ...(date ? { date } : {}) };
}

function cardSummary(cardId: string): CreditLedgerCardSummary {
  return {
    cardId,
    unpaid: 0,
    excess: 0,
    prepaid: 0,
    unsettledRecordedCharges: 0,
    unsettledRecordedChargesCents: 0,
    excessSettlement: 0,
    excessSettlementCents: 0,
    prepaidCredit: 0,
    prepaidCreditCents: 0,
    explicitPrepaidCredit: 0,
    explicitPrepaidCreditCents: 0,
    cardRefundCredit: 0,
    cardRefundCreditCents: 0,
    allocations: [],
  };
}

function addAllocation(result: CreditLedgerAllocation[], byCard: Record<string, CreditLedgerCardSummary>, item: CreditLedgerAllocation): void {
  result.push(item);
  const summary = byCard[item.cardId] ?? (byCard[item.cardId] = cardSummary(item.cardId));
  summary.allocations.push(item);
}

/** Calculate deterministic same-card settlement allocations in integer cents. */
export function calculateCreditLedger(input: CreditLedgerInput = {}): CreditLedgerResult {
  const issues: CreditLedgerIssue[] = [];
  const context = normalizeCards(input.cards, issues);
  const charges = normalizeCharges(input.charges, context, issues);
  const settlements = normalizeSettlements(input.settlements, context, issues);
  const chargesById = new Map(charges.map((charge) => [charge.id, charge]));
  const settlementsById = new Map(settlements.map((settlement) => [settlement.id, settlement]));
  const resolutions = normalizeResolutions(input.resolutions, context, issues, settlementsById, chargesById);
  const refunds = normalizeRefunds(input.cardRefunds, context, issues);

  const byCard: Record<string, CreditLedgerCardSummary> = {};
  const allocations: CreditLedgerAllocation[] = [];
  const states = new Map<string, ChargeState>();
  for (const charge of charges) {
    states.set(charge.id, {
      record: charge,
      refundedCents: 0,
      settledCents: 0,
      creditAppliedCents: 0,
      linkedResolutionCents: 0,
      cardRefundCreditCents: 0,
    });
    if (!byCard[charge.cardId]) byCard[charge.cardId] = cardSummary(charge.cardId);
  }
  for (const settlement of settlements) if (!byCard[settlement.cardId]) byCard[settlement.cardId] = cardSummary(settlement.cardId);
  for (const resolution of resolutions) if (!byCard[resolution.cardId]) byCard[resolution.cardId] = cardSummary(resolution.cardId);
  for (const refund of refunds) if (!byCard[refund.cardId]) byCard[refund.cardId] = cardSummary(refund.cardId);

  // Apply explicit resolutions to their named settlements before automatic FIFO.
  // This is what makes an opening-debt/prepaid decision survive a late import:
  // the newly arrived charge cannot reclaim the settlement that was labelled.
  for (const resolution of resolutions) {
    if (!resolution.valid) continue;
    for (const [settlementId, amountCents] of resolution.settlementParts) {
      addAllocation(allocations, byCard, allocation(resolution.kind, resolution.cardId, amountCents, {
        settlementId,
        resolutionId: resolution.id,
        ...(resolution.kind === "missed_expense" && resolution.chargeIds.length === 1 ? { chargeId: resolution.chargeIds[0] } : {}),
      }, resolution.date));
    }
    if (resolution.kind === "prepaid_credit") {
      // The pool is created below at the resolution event date.
      continue;
    }
    if (resolution.kind === "missed_expense" && resolution.chargeIds.length > 0) {
      let remainingCharge = resolution.amountCents;
      for (const chargeId of resolution.chargeIds) {
        const state = states.get(chargeId);
        if (!state) continue;
        const room = Math.max(0, state.record.amountCents - state.linkedResolutionCents);
        const portion = Math.min(remainingCharge, room);
        state.linkedResolutionCents += portion;
        state.settledCents += portion;
        remainingCharge -= portion;
        if (remainingCharge <= 0) break;
      }
      if (remainingCharge > 0) {
        // This can only occur when the input changed between validation and
        // allocation. Keep the decision visible instead of silently dropping it.
        addIssue(issues, "resolution_overallocated", "Missed-expense resolution could not be applied in full.", { recordType: "resolution", recordId: resolution.id, cardId: resolution.cardId, amountCents: remainingCharge });
      }
    }
  }

  const pools: CreditPool[] = [];
  const events: LedgerEvent[] = [...charges, ...settlements, ...resolutions, ...refunds];
  events.sort(compareChronology);
  const chargeStates = [...states.values()];

  for (const event of events) {
    if (event.type === "resolution") {
      if (!event.valid || event.kind !== "prepaid_credit") continue;
      const amountCents = [...event.settlementParts.values()].reduce((sum, value) => sum + value, 0);
      if (amountCents <= 0) continue;
      pools.push({ id: `resolution:${event.id}`, cardId: event.cardId, amountCents, remainingCents: amountCents, availableAt: event, kind: "prepaid_credit", resolutionId: event.id });
      continue;
    }
    if (event.type === "charge") {
      const state = states.get(event.id);
      if (!state) continue;
      const creditPools = pools.filter((pool) => pool.cardId === event.cardId && pool.remainingCents > 0 && strictlyBefore(pool.availableAt, event));
      let remaining = Math.max(0, event.amountCents - state.refundedCents - state.settledCents - state.creditAppliedCents);
      for (const pool of creditPools) {
        if (remaining <= 0) break;
        const amountCents = Math.min(remaining, pool.remainingCents);
        if (amountCents <= 0) continue;
        pool.remainingCents -= amountCents;
        state.creditAppliedCents += amountCents;
        remaining -= amountCents;
        const kind = pool.kind === "prepaid_credit" ? "prepaid_credit" : "card_refund_credit";
        addAllocation(allocations, byCard, allocation(kind, event.cardId, amountCents, { resolutionId: pool.resolutionId, refundId: pool.refundId, chargeId: event.id }, event.date));
      }
      continue;
    }
    if (event.type === "settlement") {
      let remaining = Math.max(0, event.amountCents - event.reservedCents);
      const uncertainSameDay = chargeStates.some((state) =>
        state.record.cardId === event.cardId
        && state.record.date === event.date
        && !strictlyBefore(state.record, event)
        && state.record.amountCents > state.refundedCents + state.settledCents + state.creditAppliedCents,
      );
      const candidates = chargeStates
        .filter((state) => state.record.cardId === event.cardId && strictlyBefore(state.record, event))
        .sort((a, b) => compareChronology(a.record, b.record));
      for (const state of candidates) {
        if (remaining <= 0) break;
        const owed = Math.max(0, state.record.amountCents - state.refundedCents - state.settledCents - state.creditAppliedCents);
        if (owed <= 0) continue;
        const amountCents = Math.min(owed, remaining);
        state.settledCents += amountCents;
        event.usedCents += amountCents;
        remaining -= amountCents;
        addAllocation(allocations, byCard, allocation("charge_settlement", event.cardId, amountCents, { settlementId: event.id, chargeId: state.record.id }, event.date));
      }
      // Only a settlement left with excess is ambiguous in effect: once
      // earlier charges explain it in full, the same-day charge's order no
      // longer changes any number and a lingering warning would be noise.
      if (uncertainSameDay && remaining > 0) {
        warnIssue(issues, "ambiguous_chronology", "Same-day charge and settlement lack a provable order; the settlement remains excess until clarified.", { recordType: "settlement", recordId: event.id, cardId: event.cardId });
      }
      continue;
    }
    if (event.type === "refund") {
      if (event.destination === "person_bank") {
        addAllocation(allocations, byCard, allocation("person_bank_reimbursement", event.cardId, event.amountCents, { refundId: event.id }, event.date));
        continue;
      }
      let state: ChargeState | undefined;
      if (event.chargeId) {
        state = states.get(event.chargeId);
        if (!state) {
          addIssue(issues, "refund_unknown_charge", `Charge ${event.chargeId} does not exist.`, { recordType: "refund", recordId: event.id, cardId: event.cardId, relatedId: event.chargeId });
          continue;
        }
        if (state.record.cardId !== event.cardId) {
          addIssue(issues, "refund_wrong_card", `Charge ${event.chargeId} belongs to another card.`, { recordType: "refund", recordId: event.id, cardId: event.cardId, relatedId: event.chargeId });
          continue;
        }
      } else {
        const candidates = chargeStates.filter((candidate) => candidate.record.cardId === event.cardId && strictlyBefore(candidate.record, event) && candidate.record.amountCents > candidate.refundedCents);
        if (candidates.length !== 1) {
          addIssue(issues, "refund_ambiguous_charge", "A card refund needs one unambiguous earlier charge or an explicit chargeId.", { recordType: "refund", recordId: event.id, cardId: event.cardId });
          continue;
        }
        state = candidates[0];
      }
      if (!strictlyBefore(state.record, event)) {
        if (sameUncertainMoment(state.record, event)) addIssue(issues, "refund_before_charge", "Refund and charge chronology is ambiguous; no card credit was created.", { recordType: "refund", recordId: event.id, cardId: event.cardId, relatedId: state.record.id });
        else addIssue(issues, "refund_before_charge", "A refund must occur after its charge.", { recordType: "refund", recordId: event.id, cardId: event.cardId, relatedId: state.record.id });
        continue;
      }
      const capacity = Math.max(0, state.record.amountCents - state.refundedCents);
      if (event.amountCents > capacity) {
        addIssue(issues, "refund_overallocated", "Refund exceeds the unrefunded original charge amount.", { recordType: "refund", recordId: event.id, cardId: event.cardId, relatedId: state.record.id, amountCents: event.amountCents });
        continue;
      }
      const unpaidBefore = Math.max(0, state.record.amountCents - state.refundedCents - state.settledCents - state.creditAppliedCents);
      state.refundedCents += event.amountCents;
      const creditCents = Math.max(0, event.amountCents - unpaidBefore);
      if (creditCents > 0) {
        state.cardRefundCreditCents += creditCents;
        pools.push({ id: `refund:${event.id}`, cardId: event.cardId, amountCents: creditCents, remainingCents: creditCents, availableAt: event, kind: "card_refund_credit", refundId: event.id });
        addAllocation(allocations, byCard, allocation("card_refund_credit", event.cardId, creditCents, { refundId: event.id, chargeId: state.record.id }, event.date));
      }
    }
  }

  for (const settlement of settlements) {
    const excessCents = Math.max(0, settlement.amountCents - settlement.reservedCents - settlement.usedCents);
    if (excessCents <= 0) continue;
    addAllocation(allocations, byCard, allocation("unallocated_excess", settlement.cardId, excessCents, { settlementId: settlement.id }, settlement.date));
    byCard[settlement.cardId].excessSettlementCents += excessCents;
    byCard[settlement.cardId].excessSettlement = asAmount(byCard[settlement.cardId].excessSettlementCents);
    warnIssue(issues, "unresolved_excess", `Settlement ${settlement.id} remains unexplained excess.`, { recordType: "settlement", recordId: settlement.id, cardId: settlement.cardId, amountCents: excessCents });
  }

  for (const state of states.values()) {
    const unpaidCents = Math.max(0, state.record.amountCents - state.refundedCents - state.settledCents - state.creditAppliedCents);
    const summary = byCard[state.record.cardId] ?? (byCard[state.record.cardId] = cardSummary(state.record.cardId));
    summary.unsettledRecordedChargesCents += unpaidCents;
    summary.unsettledRecordedCharges = asAmount(summary.unsettledRecordedChargesCents);
  }
  for (const pool of pools) {
    if (pool.remainingCents <= 0) continue;
    const summary = byCard[pool.cardId] ?? (byCard[pool.cardId] = cardSummary(pool.cardId));
    summary.prepaidCreditCents += pool.remainingCents;
    if (pool.kind === "prepaid_credit") summary.explicitPrepaidCreditCents += pool.remainingCents;
    else summary.cardRefundCreditCents += pool.remainingCents;
  }
  for (const summary of Object.values(byCard)) {
    summary.unpaid = summary.unsettledRecordedCharges;
    summary.excess = summary.excessSettlement;
    summary.prepaid = summary.prepaidCredit;
    summary.prepaidCredit = asAmount(summary.prepaidCreditCents);
    summary.explicitPrepaidCredit = asAmount(summary.explicitPrepaidCreditCents);
    summary.cardRefundCredit = asAmount(summary.cardRefundCreditCents);
    summary.prepaid = summary.prepaidCredit;
  }

  const unsettledRecordedChargesCents = Object.values(byCard).reduce((sum, card) => sum + card.unsettledRecordedChargesCents, 0);
  const excessSettlementCents = Object.values(byCard).reduce((sum, card) => sum + card.excessSettlementCents, 0);
  const prepaidCreditCents = Object.values(byCard).reduce((sum, card) => sum + card.prepaidCreditCents, 0);
  const blockingIssues = issues.filter((issue) => issue.severity === "error"
    && issue.cardId !== undefined
    && (!context.hasCards || context.cardsById.has(issue.cardId)));
  const rejectedCardRefundIds = [...new Set(blockingIssues
    .filter((issue) => issue.recordType === "refund" && issue.recordId)
    .map((issue) => issue.recordId!))];
  return {
    unpaid: asAmount(unsettledRecordedChargesCents),
    excess: asAmount(excessSettlementCents),
    prepaid: asAmount(prepaidCreditCents),
    unsettledRecordedCharges: asAmount(unsettledRecordedChargesCents),
    unsettledRecordedChargesCents,
    excessSettlement: asAmount(excessSettlementCents),
    excessSettlementCents,
    prepaidCredit: asAmount(prepaidCreditCents),
    prepaidCreditCents,
    byCard,
    allocations,
    issues,
    validationIssues: issues,
    blockingIssues,
    rejectedCardRefundIds,
  };
}
