// Idempotency guard for the automatic bank-SMS inbox (Phase 3 hardening —
// see docs/FIREBASE-RULES-CANDIDATE.md for the companion schema-validation
// work at the Firestore rules layer).
//
// The iOS Automation POSTs each incoming bank message to
// userData/{space}/inbox with a fresh, random document id (see
// src/lib/sync.ts's loadInbox/subscribeInbox) — nothing server-side stops the
// SAME message being posted twice (an Automation retry after a flaky network
// reply, for instance), which would create two SEPARATE inbox documents with
// identical text. src/lib/bankParser.ts's isLikelyDuplicate() already guards
// the OTHER half of this — a message whose expense is already a recorded
// Transaction — but that check runs against `transactions`, not against
// sibling items in the SAME still-unreviewed batch. Two never-yet-reviewed
// copies of one message would both show as "not a duplicate" and both
// default to included, double-recording the expense if approved together.
//
// Pure (no Firebase, no store) so it's trivially unit-testable; the actual
// deletion of the redundant Firestore doc happens in the caller
// (PendingInboxWatcher.tsx), mirroring how it already silently clears
// confirmed noise.

export interface DedupeInput {
  id: string;
  text: string;
}

export interface DedupeResult<T extends DedupeInput> {
  /** One item per distinct message text — the earliest-seen copy (by input
   *  order) of each. */
  unique: T[];
  /** ids of the redundant later copies — safe to delete from the cloud inbox,
   *  exactly like already-processed noise. */
  duplicateIds: string[];
}

// Normalizes the same way isLikelyDuplicate compares merchants: whitespace
// only here (not case/punctuation-folded) because the exact SMS text — digits,
// currency symbols, punctuation — is exactly what a resend reproduces
// byte-for-byte. Over-normalizing risks collapsing two DIFFERENT small
// transactions that happen to share wording (e.g. two coffees, two different
// amounts) into one — worse than doing nothing.
function normalizeText(text: string): string {
  return (text || "").trim().replace(/\s+/g, " ");
}

/** Collapses exact-duplicate message text within one inbox batch, keeping the
 *  first occurrence (input order = Firestore's returned order, effectively
 *  arrival order). Items with empty/whitespace-only text are never
 *  collapsed against each other — an empty string is not a real duplicate. */
export function dedupeInboxItems<T extends DedupeInput>(items: T[]): DedupeResult<T> {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicateIds: string[] = [];
  for (const item of items) {
    const key = normalizeText(item.text);
    if (key && seen.has(key)) {
      duplicateIds.push(item.id);
      continue;
    }
    if (key) seen.add(key);
    unique.push(item);
  }
  return { unique, duplicateIds };
}
