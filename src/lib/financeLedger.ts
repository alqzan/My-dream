import { calculateCreditLedger, type CreditLedgerResult } from "./creditLedger";
import type { Account, AppData, CardSettlement, SettlementResolution, Transaction } from "./types";
import { cashOut, round2 } from "./utils";

const CREDIT_CHARGE_KINDS = new Set<Transaction["kind"]>([
  "purchase", "atm", "bill", "installment", "fee", "transfer_out",
]);

/** Canonical card identity at the AppData boundary. Imports can carry a bank
 * account id, only a last four, or an older account field; the owner's account
 * registry is the authority that joins those forms. */
export function canonicalCardId(
  value: { accountId?: string; account?: string; cardLast4?: string; bank?: string; cardId?: string },
  accounts: readonly Account[] = [],
): string | undefined {
  const direct = value.cardId ?? value.accountId;
  const cards = accounts.filter((account) => account.kind === "card");
  if (direct && cards.some((account) => account.id === direct)) return direct;
  const last4 = (value.cardLast4 ?? value.account ?? "").replace(/\D/g, "").slice(-4);
  if (!last4) return direct?.includes(":card:") ? direct : undefined;
  const bank = value.bank?.trim().toLowerCase();
  const match = cards.find((account) =>
    account.last4.replace(/\D/g, "").slice(-4) === last4
      && (!bank || account.bank.toLowerCase() === bank)
  );
  if (match) return match.id;
  if (direct?.includes(":card:")) return direct;
  return bank ? `${bank}:card:${last4}` : undefined;
}

function creditCards(accounts: readonly Account[]): Account[] {
  return accounts.filter((account) => account.kind === "card" && account.isOwn && account.fundingKind === "credit");
}

function isProvenCreditCard(cardId: string | undefined, accounts: readonly Account[]): boolean {
  if (!cardId) return false;
  return accounts.some((account) => account.id === cardId
    && account.kind === "card"
    && account.isOwn
    && account.fundingKind === "credit");
}

function chargeAmount(transaction: Transaction): number {
  return round2(Math.max(0, cashOut(transaction)));
}

function toCharge(transaction: Transaction, accounts: readonly Account[]) {
  const cardId = canonicalCardId(transaction, accounts)
    ?? transaction.accountId
    ?? (transaction.bank && (transaction.cardLast4 ?? transaction.account)
      ? `${transaction.bank}:card:${(transaction.cardLast4 ?? transaction.account)!.replace(/\D/g, "").slice(-4)}`
      : `unknown:${transaction.id}`);
  const amount = chargeAmount(transaction);
  if (amount <= 0 || !transaction.date) return null;
  return {
    id: transaction.eventId ?? transaction.id,
    eventId: transaction.eventId ?? transaction.id,
    cardId,
    amount,
    date: transaction.date,
    ...(transaction.time ? { time: transaction.time } : {}),
    kind: transaction.kind,
    // The supplied card catalogue is the proof boundary. The engine reports
    // an unregistered id as `unknown_card`; retaining that structured issue
    // keeps the row visible for owner review rather than dropping it.
    fundingKind: "credit",
  };
}

function toSettlement(settlement: CardSettlement, accounts: readonly Account[]) {
  const cardId = canonicalCardId({ cardId: settlement.cardId }, accounts)
    ?? settlement.cardId
    ?? `unknown:settlement:${settlement.id}`;
  if (!Number.isFinite(settlement.amount) || settlement.amount <= 0) return null;
  return {
    id: settlement.eventId ?? settlement.id,
    eventId: settlement.eventId ?? settlement.id,
    cardId,
    amount: settlement.amount,
    date: settlement.date,
    ...(settlement.sourceReceivedAt?.includes("T") ? { time: settlement.sourceReceivedAt.slice(11, 19) } : {}),
    fundingKind: "credit",
  };
}

function toResolution(resolution: SettlementResolution, accounts: readonly Account[]) {
  const cardId = canonicalCardId({ cardId: resolution.cardId }, accounts) ?? resolution.cardId;
  if (!Number.isFinite(resolution.amount) || resolution.amount <= 0) return null;
  return {
    id: resolution.id,
    cardId,
    kind: resolution.kind,
    amount: resolution.amount,
    date: resolution.date,
    settlementIds: resolution.settlementIds ?? [],
    ...(resolution.appliedToEventIds ? { chargeIds: resolution.appliedToEventIds } : {}),
    ...(resolution.allocatedAmount !== undefined ? { allocatedAmount: resolution.allocatedAmount } : {}),
  };
}

function toCardRefund(transaction: Transaction, accounts: readonly Account[], transactions: readonly Transaction[]) {
  const linkedCharge = transaction.linkedTransactionId
    ? transactions.find((candidate) => candidate.id === transaction.linkedTransactionId || candidate.eventId === transaction.linkedTransactionId)
    : undefined;
  const cardId = canonicalCardId(transaction, accounts)
    ?? (linkedCharge ? canonicalCardId(linkedCharge, accounts) : undefined)
    ?? transaction.accountId
    ?? `unknown:refund:${transaction.id}`;
  const amount = round2(Math.max(0, transaction.amount));
  if (amount <= 0 || !transaction.date) return null;
  // Person-bank reimbursements increase current holdings directly. They do
  // not settle a credit-card charge; retaining them outside the card engine
  // prevents an unrelated card id from blocking a legitimate cash refund.
  // Merchant-card refunds and explicit unknown destinations must go through
  // the engine so they either allocate chronologically or remain review work.
  if (transaction.refundDestination === "person_bank") return null;
  return {
    id: transaction.eventId ?? transaction.id,
    eventId: transaction.eventId ?? transaction.id,
    cardId,
    amount,
    date: transaction.date,
    ...(transaction.time ? { time: transaction.time } : {}),
    destination: transaction.refundDestination === "merchant_card" ? "merchant_card" : "unknown",
    ...(transaction.linkedTransactionId ? { chargeId: transaction.linkedTransactionId } : {}),
  };
}

/** Build the pure chronological ledger from persisted AppData. Only owner
 * confirmed CREDIT cards enter; debit, Visa-only, and unknown instruments are
 * intentionally excluded so they cannot manufacture a trustworthy liability. */
export function creditLedgerForState(state: Pick<AppData, "transactions" | "settlements" | "settlementResolutions" | "accounts">): CreditLedgerResult {
  const accounts = state.accounts ?? [];
  const cards = creditCards(accounts);
  const knownAccountsById = new Map(accounts.map((account) => [account.id, account]));
  const charges = (state.transactions ?? [])
    .filter((transaction) => transaction.direction === "out" && CREDIT_CHARGE_KINDS.has(transaction.kind) && transaction.kind !== "transfer_out")
    .filter((transaction) => {
      const canonical = canonicalCardId(transaction, accounts);
      const known = (transaction.accountId ? knownAccountsById.get(transaction.accountId) : undefined)
        ?? (canonical ? knownAccountsById.get(canonical) : undefined);
      // Known cash/debit instruments are ordinary spending and stay out of
      // the credit liability. Unknown card funding is retained for an engine
      // issue so reconciliation cannot silently close around it.
      return !(known && (known.kind !== "card" || known.fundingKind === "debit"));
    })
    .map((transaction) => toCharge(transaction, accounts))
    .filter((charge): charge is NonNullable<typeof charge> => Boolean(charge));
  const settlements = (state.settlements ?? [])
    .map((settlement) => toSettlement(settlement, accounts))
    .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement));
  const resolutions = (state.settlementResolutions ?? [])
    .map((resolution) => toResolution(resolution, accounts))
    .filter((resolution): resolution is NonNullable<typeof resolution> => Boolean(resolution));
  const cardRefunds = (state.transactions ?? [])
    .filter((transaction) => transaction.direction === "in"
      && (transaction.kind === "refund" || transaction.kind === "reversal" || transaction.kind === "cashback")
      && transaction.refundDestination !== "person_bank")
    .map((transaction) => toCardRefund(transaction, accounts, state.transactions ?? []))
    .filter((refund): refund is NonNullable<typeof refund> => Boolean(refund));
  // An empty catalogue is not proof that every imported card is credit. A
  // private sentinel keeps the engine's `hasCards` validation active while
  // producing no ledger row of its own.
  const cardCatalogue = cards.length > 0
    ? cards.map((account) => ({ id: account.id, last4: account.last4, fundingKind: account.fundingKind, kind: account.kind }))
    : [{ id: "__no_proven_credit_card__", fundingKind: "credit", kind: "card" as const }];
  return calculateCreditLedger({
    cards: cardCatalogue,
    charges,
    settlements,
    resolutions,
    cardRefunds,
  });
}
