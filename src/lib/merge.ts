// Multi-device merge — the conflict-resolution core, split out of sync.ts so it
// has NO Firebase imports and can be unit-tested in plain Node. sync.ts re-
// exports mergeAppData, so existing importers are unaffected. Pure functions of
// (local, cloud) → merged AppData; touches no I/O.
import type { AppData, JournalEntry, HifzMistake } from "./types";
import { dedupeJournalEntries, mergeEntryMedia, stripTombstonedMediaRefs } from "./utils";

// Which journal shard a given entry belongs to: one document per YYYY-MM of the
// entry's own date (stable across devices, naturally bounded). Malformed/absent
// dates fall into a shared "misc" shard. Lives here (Firebase-free) so it's
// unit-tested; sync.ts imports it to split/reassemble the journal collection.
export function journalShardId(dateStr: string | undefined): string {
  return dateStr && /^\d{4}-\d{2}/.test(dateStr) ? dateStr.slice(0, 7) : "misc";
}

// Tombstone keys for the collections that AREN'T keyed by a top-level item id,
// so a delete/un-complete on one device can't be undone by the other's union.
// All namespaced (prefix + ":") so they never collide with a real item id in
// the shared `deleted` map, and `alive()` (which checks `x.id in deleted`)
// never mistakes one for an item. Store writes these on delete/un-complete and
// lifts them on re-add; mergeAppData filters them out below. Same pruning TTL.
export const budgetTombKey = (category: string) => `budget:${category}`;
export const depositTombKey = (depositId: string) => `deposit:${depositId}`;
export const habitLogTombKey = (habitId: string, date: string) => `habitlog:${habitId}:${date}`;
export const wirdTombKey = (date: string) => `wird:${date}`;

// ===================== Multi-device merge =====================
// Combine a local and a cloud snapshot so neither device's edits are lost to a
// last-writer-wins overwrite. Every collection is unioned by its id/key; on a
// conflicting id the snapshot with the newer top-level `lastUpdated` wins that
// item. Habit logs, reserve deposits, and per-day prayers are unioned so a
// completion/deposit/prayer recorded on either device survives. Singletons
// (daily budget, income, salary day) come from the newer snapshot. Deletions
// are tracked as tombstones (`deleted`: id → ts) and filtered out of the union
// below, so a delete on one device is no longer undone by the other's
// still-present copy.
export function unionOrdered<T>(primary: T[], secondary: T[], keyOf: (t: T) => string): T[] {
  const seen = new Set(primary.map(keyOf));
  return [...primary, ...secondary.filter((it) => !seen.has(keyOf(it)))];
}

// Keep tombstones for a wide window so every device has time to converge, then
// drop them so the map can't grow without bound.
const TOMBSTONE_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 days

export function mergeAppData(local: AppData, cloud: AppData): AppData {
  const localNewer = (local.lastUpdated ?? "") >= (cloud.lastUpdated ?? "");
  const primary = localNewer ? local : cloud;
  const secondary = localNewer ? cloud : local;

  // Union both tombstone maps (newest deletedAt per id), then prune old ones.
  const deleted: Record<string, number> = { ...(cloud.deleted ?? {}) };
  for (const [id, ts] of Object.entries(local.deleted ?? {})) {
    deleted[id] = Math.max(deleted[id] ?? 0, ts);
  }
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const id of Object.keys(deleted)) {
    if (deleted[id] < cutoff) delete deleted[id];
  }
  // Media tombstones (entryId:kind:hash → deletedAt): same union+prune. These
  // record a single photo/voice note removed from ONE entry, so the media-ref
  // union below can't pull the deleted one back from a copy that still
  // references it — and a shared photo deleted from one entry stays in others.
  const deletedMedia: Record<string, number> = { ...(cloud.deletedMedia ?? {}) };
  for (const [h, ts] of Object.entries(local.deletedMedia ?? {})) {
    deletedMedia[h] = Math.max(deletedMedia[h] ?? 0, ts);
  }
  for (const h of Object.keys(deletedMedia)) {
    if (deletedMedia[h] < cutoff) delete deletedMedia[h];
  }
  const mediaTomb = new Set(Object.keys(deletedMedia));
  // Drop any id-keyed item that carries a live tombstone — this is what stops a
  // resurrected copy from a second device.
  const alive = <T extends { id: string }>(arr: T[]) => arr.filter((x) => !(x.id in deleted));
  const byId = <T extends { id: string }>(p: T[], s: T[]) =>
    alive(unionOrdered(p, s, (x) => x.id));

  // Like byId, but on a conflicting id keep the copy whose own `updatedAt` is
  // newer — so a per-item edit survives even when the OTHER device holds the
  // newer document-level `lastUpdated`. Missing/equal stamps fall back to the
  // primary copy (prior behavior), so legacy items are untouched.
  const byIdNewer = <T extends { id: string; updatedAt?: number }>(p: T[], s: T[]) => {
    const sById = new Map(s.map((it) => [it.id, it]));
    const merged = p.map((it) => {
      const other = sById.get(it.id);
      return other && (other.updatedAt ?? 0) > (it.updatedAt ?? 0) ? other : it;
    });
    const seen = new Set(p.map((it) => it.id));
    return alive([...merged, ...s.filter((it) => !seen.has(it.id))]);
  };

  // Habits: union by id, then union each habit's logged dates — but drop any day
  // the user un-completed (tombstoned habitlog:<id>:<date>), so un-checking a day
  // on one device isn't undone by the other's still-logged copy.
  const habits = byId(primary.habits, secondary.habits).map((h) => {
    const pLogs = primary.habits.find((x) => x.id === h.id)?.logs ?? [];
    const sLogs = secondary.habits.find((x) => x.id === h.id)?.logs ?? [];
    const logs = [...new Set([...pLogs, ...sLogs])]
      .filter((d) => !(habitLogTombKey(h.id, d) in deleted))
      .sort();
    return { ...h, logs };
  });

  // Reserve funds: union by id, and union each fund's deposits by deposit id —
  // dropping any deposit the user deleted (tombstoned deposit:<id>), so removing
  // a deposit on one device isn't resurrected from the other's copy.
  const reserves = byId(primary.reserves, secondary.reserves).map((f) => {
    const pDep = primary.reserves.find((x) => x.id === f.id)?.deposits ?? [];
    const sDep = secondary.reserves.find((x) => x.id === f.id)?.deposits ?? [];
    const deposits = unionOrdered(pDep, sDep, (d) => d.id).filter(
      (d) => !(depositTombKey(d.id) in deleted)
    );
    return { ...f, deposits };
  });

  // Prayer logs: union by date; on a shared date merge the per-prayer maps
  // (primary wins per prayer) so a prayer logged only on the other device stays.
  const prayerLogs = unionOrdered(primary.prayerLogs, secondary.prayerLogs, (p) => p.date).map((pl) => {
    const sMatch = secondary.prayerLogs.find((x) => x.date === pl.date);
    return sMatch ? { ...pl, prayers: { ...sMatch.prayers, ...pl.prayers } } : pl;
  });

  // Quran khatma: singleton from the newer snapshot, but never lose a completed
  // khatma — take the higher `completed` count across both devices.
  const pk = primary.quranKhatma ?? { juz: 0, completed: 0 };
  const sk = secondary.quranKhatma ?? { juz: 0, completed: 0 };
  const quranKhatma = { ...pk, completed: Math.max(pk.completed ?? 0, sk.completed ?? 0) };

  // Quran حفظ: خطة من الأحدث، والجبهة أبعد موضعٍ بلغه أيُّ جهاز، وسجلّا الجلسات
  // والمراجعات يُوحَّدان بالـid فلا يضيع أثرٌ سُجّل على جهاز. مواضع الأخطاء
  // (mistakes) تُوحَّد بالـid مع دمج تواريخ الوقوع (hits) وأحدث حالة إتقان، و
  // lastTestDate يأخذ الأحدث — كان الاثنان يُمحيان لأن الدمج بنى كائنًا ناقصهما.
  const emptyHifz = { plan: null, frontierId: 0, sessions: [], reviews: [], reviewCursorId: 0, mistakes: [] as HifzMistake[], lastTestDate: undefined as string | undefined };
  const ph = primary.quranHifz ?? emptyHifz;
  const sh = secondary.quranHifz ?? emptyHifz;
  const pMist = ph.mistakes ?? [];
  const sMist = sh.mistakes ?? [];
  const pMistById = new Map(pMist.map((m) => [m.id, m]));
  const sMistById = new Map(sMist.map((m) => [m.id, m]));
  const mistakes = unionOrdered(pMist, sMist, (m) => m.id).map((m) => {
    const a = pMistById.get(m.id);
    const b = sMistById.get(m.id);
    if (!a || !b) return m; // only one device has it
    // Both hold it: union the hit dates, and take the record edited more
    // recently for resolved/word so an "أُتقن" on either device sticks.
    const newer = (a.updatedAt ?? "") >= (b.updatedAt ?? "") ? a : b;
    return { ...newer, hits: [...new Set([...(a.hits ?? []), ...(b.hits ?? [])])].sort() };
  });
  const lastTestDate = (ph.lastTestDate ?? "") >= (sh.lastTestDate ?? "")
    ? ph.lastTestDate : sh.lastTestDate;
  const quranHifz = {
    plan: ph.plan ?? sh.plan,
    frontierId: Math.max(ph.frontierId ?? 0, sh.frontierId ?? 0),
    sessions: unionOrdered(ph.sessions ?? [], sh.sessions ?? [], (x) => x.id),
    reviews: unionOrdered(ph.reviews ?? [], sh.reviews ?? [], (x) => x.id),
    reviewCursorId: ph.reviewCursorId || sh.reviewCursorId || 0,
    mistakes,
    lastTestDate,
  };

  // Journal entries need more than a plain id-union. First canonicalize +
  // dedupe both sides so the same Day One entry imported on two devices (which
  // historically got a different random id each time) collapses into one item.
  // Then, for an entry both devices hold, keep the chosen side's text but never
  // lose media the other side has — this is what stops a device with the newer
  // top-level stamp from wiping a photo/voice note the other device added (and
  // from pushing that stripped copy back, deleting the file from Cloud Storage).
  const pJournal = dedupeJournalEntries(primary.journalEntries);
  const sJournal = dedupeJournalEntries(secondary.journalEntries);
  const sJournalById = new Map(sJournal.map((e) => [e.id, e]));
  const journalEntries = alive(
    unionOrdered(
      pJournal.map((e) => {
        const other = sJournalById.get(e.id);
        if (!other) return e;
        // Keep the text of whichever copy was edited more recently (per-item
        // updatedAt), then fill any media the winner lacks from the other side
        // so a newer text edit never wipes a photo/voice note the older copy
        // still holds. Falls back to primary (e) when stamps are equal/missing.
        const base = (other.updatedAt ?? 0) > (e.updatedAt ?? 0) ? other : e;
        const from = base === e ? other : e;
        return mergeEntryMedia(base, from);
      }),
      sJournal,
      (e) => e.id
    )
    // Drop refs to media the user deleted — applied to EVERY entry (merged or
    // unique) so a deleted photo can't ride back in on either side's copy.
  ).map((e) => stripTombstonedMediaRefs(e, mediaTomb));

  return {
    transactions: byIdNewer(primary.transactions, secondary.transactions),
    books: byId(primary.books, secondary.books),
    readingLogs: byId(primary.readingLogs, secondary.readingLogs),
    journalEntries,
    habits,
    recurring: byId(primary.recurring, secondary.recurring),
    // Budgets are keyed by category (no item id), so a removed cap is tombstoned
    // as budget:<category> and filtered here — else the union re-adds it.
    budgets: unionOrdered(primary.budgets, secondary.budgets, (b) => b.category).filter(
      (b) => !(budgetTombKey(b.category) in deleted)
    ),
    categories: alive(unionOrdered(primary.categories, secondary.categories, (c) => c.id)),
    reserves,
    prayerLogs,
    // القرآن: تأمّلات ومحفوظات تُوحَّد بالـid (مع الأختام)، والوِرد يُوحَّد
    // كتواريخ (كسجلّات العادات) فلا يضيع وِردٌ سُجّل على جهاز.
    quranReflections: byId(primary.quranReflections ?? [], secondary.quranReflections ?? []),
    quranHifz,
    // الوِرد يُوحَّد كتواريخ، مع إسقاط أيّ يومٍ أُلغِيَ (شاهد wird:<date>) فلا
    // يُعيده اتحادٌ من جهازٍ ما زال يحمله.
    quranWird: [...new Set([...(primary.quranWird ?? []), ...(secondary.quranWird ?? [])])]
      .filter((d) => !(wirdTombKey(d) in deleted))
      .sort(),
    quranKhatma,
    // الإعدادات المفردة (الميزانية اليومية والدخل الشهري): الأحدث يفوز، لكن إن
    // لم يضبطها الجهاز الأحدث نأخذها من الآخر — فلا يمحو جهازٌ لم تُضبَط فيه
    // إعداداً موجوداً على الجهاز الثاني (كان سبب «الإعدادات ما تظهر بالآيباد»).
    dailyBudget: primary.dailyBudget ?? secondary.dailyBudget,
    monthlyIncome: primary.monthlyIncome ?? secondary.monthlyIncome,
    futureLetters: byId(primary.futureLetters, secondary.futureLetters),
    salaryDay: primary.salaryDay,
    lastSalaryConfirm: primary.lastSalaryConfirm,
    readingGoal: primary.readingGoal ?? secondary.readingGoal ?? null,
    // العادات المجمّدة إعدادٌ مفرد (تبديل مقصود): يفوز الأحدث كي يسري
    // الاستئناف/التجميد عبر الأجهزة بدل أن يُعيده اتحادٌ لا يعرف الإزالة.
    frozenHabits: primary.frozenHabits ?? secondary.frozenHabits ?? [],
    merchantRules: { ...secondary.merchantRules, ...primary.merchantRules },
    deleted,
    deletedMedia,
    lastUpdated: (local.lastUpdated ?? "") > (cloud.lastUpdated ?? "") ? local.lastUpdated : cloud.lastUpdated,
  };
}
