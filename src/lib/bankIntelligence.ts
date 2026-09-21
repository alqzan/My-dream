import type { Account, InboxEventRecord, ObservedBalance, Transaction } from "./types";
import { cashOut, isValidDateKey } from "./utils";
import { normalizeMerchant } from "./bankParser";

const DAY = 86_400_000;

export interface TransferEventInput {
  id: string;
  amount: number;
  date?: string;
  time?: string;
  at?: number;
  direction: "out" | "in";
  bank?: string;
  account?: string;
  accountId?: string;
  counterparty?: string;
  source?: string;
  destination?: string;
  sourceAccountId?: string;
  destinationAccountId?: string;
  fee?: number;
}

export interface OwnerRegistry {
  names?: readonly string[];
  wallets?: readonly string[];
  accounts?: readonly string[];
}

export interface SelfTransferFee {
  id: string;
  amount: number;
}

export interface SelfTransferResult {
  pairs: [string, string][];
  unmatched: string[];
  ambiguous: string[];
  fees: SelfTransferFee[];
}

export interface SalaryEventInput {
  id: string;
  amount: number;
  date: string;
  direction?: "in" | "out" | "neutral";
  payer?: string;
  counterparty?: string;
  account?: string;
  accountId?: string;
  kind?: string;
  confirmedSalary?: boolean;
}

export interface SalaryProposalInput {
  events: readonly SalaryEventInput[];
  salaryPayers: readonly string[];
  payerAliases?: Readonly<Record<string, string>>;
  salaryDay: number;
  ownerAccountIds?: readonly string[];
}

export interface SalaryProposal {
  eventId: string;
  payer: string;
  canonicalPayer: string;
  amount: number;
  accountId?: string;
  status: "matched" | "needs_choice";
  kind: "salary" | "needs_choice";
  confidence: "template" | "generic";
  reason: string;
}

export interface RecurringGuess {
  merchant: string;
  avgAmount: number;
  everyDays: number;
  occurrences: number;
  lastSeen: string;
  nextExpected: string;
  confidence: "high" | "medium";
}

export interface MerchantFrequency {
  merchant: string;
  count: number;
  totalAmount: number;
}

export interface FinanceSignalsInput {
  transactions: readonly Transaction[];
  inboxEvents?: readonly InboxEventRecord[];
  observedBalances?: readonly ObservedBalance[];
  accounts?: readonly Account[];
  cycleStart: string;
  today: string;
  freshnessDays?: number;
}

export interface FinanceSignals {
  declinedCount: number;
  lastReceiptDate: string | null;
  lastReceiptAt: string | null;
  daysSinceLastReceipt: number | null;
  receiptFresh: boolean;
  merchantFrequency: MerchantFrequency[];
  observedCashSum: number;
  observedCashByAccount: Record<string, number>;
}

function normalized(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function matchesOwner(value: string | undefined, owner: OwnerRegistry): boolean {
  const actual = normalized(value);
  if (!actual) return false;
  const names = [...(owner.names ?? []), ...(owner.wallets ?? [])].map(normalized).filter(Boolean);
  if (names.some((name) => actual.includes(name) || name.includes(actual))) return true;
  const accounts = (owner.accounts ?? []).map(normalized).filter(Boolean);
  return accounts.some((account) => actual === account);
}

function endpointValues(event: TransferEventInput): (string | undefined)[] {
  return event.direction === "out"
    ? [event.destination, event.destinationAccountId, event.counterparty]
    : [event.source, event.sourceAccountId, event.counterparty];
}

function eventHasOwnerEvidence(event: TransferEventInput, owner: OwnerRegistry): boolean {
  // The local account is not linkage evidence: an own-account outgoing leg
  // can still pay a stranger, and an own-account incoming leg can come from a
  // company. Only the typed endpoint/counterparty may prove ownership.
  return endpointValues(event).some((value) => matchesOwner(value, owner));
}

function eventAt(event: Pick<TransferEventInput, "date" | "time" | "at">): number | null {
  if (Number.isFinite(event.at)) return event.at!;
  if (!event.date || !isValidDateKey(event.date) || !event.time) return null;
  const time = event.time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/) ?? [];
  if (!time[1]) return null;
  const hours = Number(time[1]);
  const minutes = Number(time[2]);
  const seconds = Number(time[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const value = Date.UTC(Number(event.date.slice(0, 4)), Number(event.date.slice(5, 7)) - 1, Number(event.date.slice(8, 10)), hours, minutes, seconds);
  return Number.isFinite(value) ? value : null;
}

/** Pair only owner-evidenced, one-to-one transfer legs; no amount/time-only match is accepted. */
export function findSelfTransferCandidates(events: readonly TransferEventInput[], owner: OwnerRegistry): SelfTransferResult {
  const eligible = events.filter((event) => Number.isFinite(event.amount) && event.amount > 0 && eventHasOwnerEvidence(event, owner));
  const outs = eligible.filter((event) => event.direction === "out");
  const ins = eligible.filter((event) => event.direction === "in");
  const edges = new Map<string, string[]>();
  for (const out of outs) {
    const outAt = eventAt(out);
    const matches = ins.filter((incoming) => {
      const inAt = eventAt(incoming);
      return outAt !== null && inAt !== null
        && Math.abs(out.amount - incoming.amount) <= 0.01
        && Math.abs(outAt - inAt) <= 90 * 60 * 1000;
    });
    edges.set(out.id, matches.map((event) => event.id));
  }
  const reverse = new Map<string, string[]>();
  for (const [outId, incomingIds] of edges) for (const incomingId of incomingIds) reverse.set(incomingId, [...(reverse.get(incomingId) ?? []), outId]);
  const pairs: [string, string][] = [];
  const ambiguous = new Set<string>();
  const paired = new Set<string>();
  for (const out of outs) {
    const candidates = edges.get(out.id) ?? [];
    if (candidates.length === 1 && (reverse.get(candidates[0]) ?? []).length === 1) {
      const incomingId = candidates[0];
      if (!paired.has(out.id) && !paired.has(incomingId)) {
        pairs.push([out.id, incomingId]);
        paired.add(out.id);
        paired.add(incomingId);
      }
    } else if (candidates.length > 1) {
      ambiguous.add(out.id);
      candidates.forEach((id) => ambiguous.add(id));
    }
  }
  for (const [incomingId, outIds] of reverse) if (outIds.length > 1) {
    ambiguous.add(incomingId);
    outIds.forEach((id) => ambiguous.add(id));
  }
  const unmatched = events.map((event) => event.id).filter((id) => !paired.has(id) && !ambiguous.has(id));
  const fees = events
    .filter((event) => Number.isFinite(event.fee) && (event.fee ?? 0) > 0)
    .map((event) => ({ id: event.id, amount: Math.round((event.fee ?? 0) * 100) / 100 }));
  return { pairs, unmatched, ambiguous: [...ambiguous], fees };
}

function canonicalPayer(value: string | undefined, payers: readonly string[], aliases: Readonly<Record<string, string>>): string | null {
  const actual = normalized(value);
  if (!actual) return null;
  for (const [alias, canonical] of Object.entries(aliases)) {
    const aliasKey = normalized(alias);
    if (aliasKey && (actual === aliasKey || actual.includes(aliasKey) || aliasKey.includes(actual))) {
      return payers.find((candidate) => normalized(candidate) === normalized(canonical)) ?? null;
    }
  }
  const payer = payers.find((candidate) => normalized(candidate) === actual || normalized(candidate).includes(actual) || actual.includes(normalized(candidate)));
  if (payer) return payer;
  return null;
}

/** Propose a salary classification from a confirmed three-entry pattern; never mutates or confirms anything. */
export function proposeSalary(input: SalaryProposalInput): SalaryProposal[] {
  const aliases = input.payerAliases ?? {};
  const incoming = input.events.filter((event) => event.direction === "in" && event.confirmedSalary !== true && event.kind !== "salary" && Number.isFinite(event.amount) && event.amount > 0);
  const proposals: SalaryProposal[] = [];
  for (const event of incoming) {
    const payerText = event.payer ?? event.counterparty ?? "";
    const canonical = canonicalPayer(payerText, input.salaryPayers, aliases);
    if (!canonical) continue;
    const accountId = event.accountId ?? event.account;
    const history = input.events
      .filter((candidate) => candidate.id !== event.id && candidate.direction === "in" && (candidate.confirmedSalary === true || candidate.kind === "salary") && canonicalPayer(candidate.payer ?? candidate.counterparty, input.salaryPayers, aliases) === canonical)
      .filter((candidate) => Number.isFinite(candidate.amount) && candidate.amount > 0 && isValidDateKey(candidate.date))
      .filter((candidate) => candidate.date < event.date)
      .filter((candidate) => !input.ownerAccountIds?.length || input.ownerAccountIds.includes(candidate.accountId ?? candidate.account ?? ""))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3);
    const average = history.length === 3 ? history.reduce((sum, item) => sum + item.amount, 0) / 3 : 0;
    const accountMatches = accountId !== undefined
      && (!input.ownerAccountIds?.length || input.ownerAccountIds.includes(accountId))
      && history.length === 3
      && history.every((item) => {
        const itemAccountId = item.accountId ?? item.account;
        return Boolean(itemAccountId) && itemAccountId === accountId;
      });
    const dateMatches = history.length === 3 && Math.abs(Number(event.date.slice(8, 10)) - input.salaryDay) <= 3;
    const amountMatches = history.length === 3 && event.amount >= average * 0.9 && event.amount <= average * 1.1;
    const matched = Boolean(history.length === 3 && accountMatches && dateMatches && amountMatches);
    proposals.push({
      eventId: event.id,
      payer: payerText,
      canonicalPayer: canonical,
      amount: event.amount,
      ...(accountId ? { accountId } : {}),
      status: matched ? "matched" : "needs_choice",
      kind: matched ? "salary" : "needs_choice",
      confidence: matched ? "template" : "generic",
      reason: matched ? "Confirmed payer, account, day, and three-entry amount pattern." : "Payer is known, but the confirmed account/day/amount pattern does not prove salary.",
    });
  }
  return proposals;
}

function merchantName(transaction: Transaction): string {
  const normalizedMerchantName = normalizeMerchant(transaction.counterparty || transaction.note || "");
  // A normalized prefix keeps receipts such as "SERVICE PLAN 2026" together
  // while retaining enough words to distinguish unrelated merchants.
  return normalizedMerchantName.split(" ").slice(0, 3).join(" ").slice(0, 48);
}

function dateMs(date: string): number | null {
  if (!isValidDateKey(date)) return null;
  const value = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Number.isFinite(value) ? value : null;
}

function addDays(date: string, days: number): string {
  const parsed = dateMs(date);
  if (parsed === null) return date;
  return new Date(parsed + Math.round(days) * DAY).toISOString().slice(0, 10);
}

function nextCalendarMonth(date: string): string {
  const parsed = dateMs(date);
  if (parsed === null) return date;
  const current = new Date(parsed);
  const year = current.getUTCFullYear();
  const month = current.getUTCMonth() + 1;
  const day = current.getUTCDate();
  const nextMonth = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

/** Detect monthly-like merchants only when the amount and cadence both repeat. */
export function detectRecurringMerchants(transactions: readonly Transaction[]): RecurringGuess[] {
  const groups = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const amount = cashOut(transaction);
    const merchant = merchantName(transaction);
    if (!merchant || !Number.isFinite(amount) || amount <= 0 || dateMs(transaction.date) === null) continue;
    groups.set(merchant, [...(groups.get(merchant) ?? []), transaction]);
  }
  const guesses: RecurringGuess[] = [];
  for (const [merchant, rows] of groups) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    if (sorted.length < 3) continue;
    const amounts = sorted.map((row) => cashOut(row));
    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    if (!average || (Math.max(...amounts) - Math.min(...amounts)) / average >= 0.25) continue;
    const gaps: number[] = [];
    for (let index = 1; index < sorted.length; index += 1) gaps.push((dateMs(sorted[index].date)! - dateMs(sorted[index - 1].date)!) / DAY);
    const monthlyGaps = gaps.filter((gap) => gap >= 25 && gap <= 35);
    if (monthlyGaps.length < 2) continue;
    const everyDays = monthlyGaps.reduce((sum, gap) => sum + gap, 0) / monthlyGaps.length;
    const sameDay = sorted.slice(1).every((row, index) => Math.abs(Number(row.date.slice(8, 10)) - Number(sorted[index].date.slice(8, 10))) <= 2);
    const lastSeen = sorted[sorted.length - 1].date;
    guesses.push({ merchant, avgAmount: Math.round(average * 100) / 100, everyDays: Math.round(everyDays * 100) / 100, occurrences: sorted.length, lastSeen, nextExpected: sameDay ? nextCalendarMonth(lastSeen) : addDays(lastSeen, everyDays), confidence: sameDay ? "high" : "medium" });
  }
  return guesses.sort((a, b) => a.nextExpected.localeCompare(b.nextExpected) || a.merchant.localeCompare(b.merchant));
}

export const detectRecurring = detectRecurringMerchants;

function inCycle(date: string, start: string, end: string): boolean {
  return dateMs(date) !== null && dateMs(start) !== null && dateMs(end) !== null && date >= start && date <= end;
}

function accountForObserved(balance: ObservedBalance, accounts: readonly Account[]): Account | null {
  if (balance.balanceKind !== "cash" || (balance.assetKind !== undefined && balance.assetKind !== "bank_cash")) return null;
  const account = balance.account?.trim() ?? "";
  const last4 = (balance.cardLast4 ?? account).replace(/\D/g, "").slice(-4);
  const bank = normalized(balance.bank);
  const ownAccounts = accounts.filter((candidate) => candidate.isOwn && candidate.kind === "account");
  const exact = ownAccounts.filter((candidate) => candidate.id === account);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  if (last4.length === 0) return null;
  const matches = ownAccounts.filter((candidate) => candidate.last4.replace(/\D/g, "").slice(-4) === last4 && (!bank || normalized(candidate.bank) === bank));
  return matches.length === 1 ? matches[0] : null;
}

type ReceiptRecord = Pick<Transaction, "date" | "time" | "sourceReceivedAt"> | Pick<InboxEventRecord, "date" | "time" | "sourceReceivedAt">;

function receiptCandidate(record: ReceiptRecord): { at: string; date: string; ms: number } | null {
  const sourceAt = record.sourceReceivedAt?.trim();
  if (sourceAt) {
    const sourceMs = Date.parse(sourceAt);
    const sourceDate = sourceAt.slice(0, 10);
    if (Number.isFinite(sourceMs) && isValidDateKey(sourceDate)) return { at: sourceAt, date: sourceDate, ms: sourceMs };
  }
  const eventMs = dateMs(record.date);
  if (eventMs === null) return null;
  const at = `${record.date}${record.time ? `T${record.time}` : "T00:00:00"}`;
  return { at, date: record.date, ms: eventMs + timeOffset(record.time) };
}

function timeOffset(time: string | undefined): number {
  const parts = time?.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!parts) return 0;
  const hours = Number(parts[1]);
  const minutes = Number(parts[2]);
  const seconds = Number(parts[3] ?? 0);
  return hours <= 23 && minutes <= 59 && seconds <= 59 ? ((hours * 60 + minutes) * 60 + seconds) * 1000 : 0;
}

/** Read-only current-cycle signals. Cash totals exclude credit limits, wallets, unknown accounts, and non-expense events. */
export function financeSignals(input: FinanceSignalsInput): FinanceSignals {
  const transactions = input.transactions.filter((transaction) => inCycle(transaction.date, input.cycleStart, input.today));
  const declinedIds = new Set<string>();
  for (const transaction of transactions) if (transaction.kind === "declined") declinedIds.add(transaction.id);
  for (const event of input.inboxEvents ?? []) if (event.kind === "declined" && inCycle(event.date, input.cycleStart, input.today)) declinedIds.add(event.id);
  const expenseRows = transactions.map((transaction) => ({ transaction, amount: cashOut(transaction) })).filter((row) => Number.isFinite(row.amount) && row.amount > 0);
  const merchantMap = new Map<string, MerchantFrequency>();
  for (const { transaction, amount } of expenseRows) {
    const merchant = merchantName(transaction);
    if (!merchant) continue;
    const row = merchantMap.get(merchant) ?? { merchant, count: 0, totalAmount: 0 };
    row.count += 1;
    row.totalAmount = Math.round((row.totalAmount + amount) * 100) / 100;
    merchantMap.set(merchant, row);
  }
  const lastReceipt = [...input.transactions, ...(input.inboxEvents ?? [])]
    .map(receiptCandidate)
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.ms - a.ms || b.at.localeCompare(a.at))[0] ?? null;
  const todayMs = dateMs(input.today);
  const receiptDateMs = lastReceipt ? dateMs(lastReceipt.date) : null;
  const daysSince = todayMs !== null && receiptDateMs !== null ? Math.max(0, Math.floor((todayMs - receiptDateMs) / DAY)) : null;
  const freshnessDays = Math.max(0, Math.round(input.freshnessDays ?? 7));
  const observedCashByAccount: Record<string, number> = {};
  const observedAtByAccount: Record<string, string> = {};
  const updatedAtByAccount: Record<string, number> = {};
  for (const balance of input.observedBalances ?? []) {
    const account = accountForObserved(balance, input.accounts ?? []);
    if (!account || !Number.isFinite(balance.balance)) continue;
    const previousObservedAt = observedAtByAccount[account.id];
    const previousUpdatedAt = updatedAtByAccount[account.id] ?? -Infinity;
    const isNewer = previousObservedAt === undefined
      || balance.observedAt > previousObservedAt
      || (balance.observedAt === previousObservedAt && (balance.updatedAt ?? 0) >= previousUpdatedAt);
    if (isNewer) {
      observedCashByAccount[account.id] = balance.balance;
      observedAtByAccount[account.id] = balance.observedAt;
      updatedAtByAccount[account.id] = balance.updatedAt ?? 0;
    }
  }
  return {
    declinedCount: declinedIds.size,
    lastReceiptDate: lastReceipt?.date ?? null,
    lastReceiptAt: lastReceipt?.at ?? null,
    daysSinceLastReceipt: daysSince,
    receiptFresh: daysSince !== null && daysSince <= freshnessDays,
    merchantFrequency: [...merchantMap.values()].sort((a, b) => b.count - a.count || b.totalAmount - a.totalAmount || a.merchant.localeCompare(b.merchant)),
    observedCashSum: Math.round(Object.values(observedCashByAccount).reduce((sum, amount) => sum + amount, 0) * 100) / 100,
    observedCashByAccount,
  };
}
