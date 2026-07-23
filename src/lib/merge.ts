// Multi-device merge — the conflict-resolution core, split out of sync.ts so it
// has NO Firebase imports and can be unit-tested in plain Node. sync.ts re-
// exports mergeAppData, so existing importers are unaffected. Pure functions of
// (local, cloud) → merged AppData; touches no I/O.
import type { AppData, JournalEntry, HifzMistake, HifzState } from "./types";
import { EMPTY_HIFZ } from "./types";
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

// Keep tombstones for a full year so every device has ample time to converge,
// then drop them so the map can't grow without bound. Deliberate trade-off
// (documented in ROADMAP): a device left offline for MORE than a year can still
// resurrect data it never saw deleted — acceptable for one owner's few devices;
// the cure there is to clear the returning device and re-adopt the cloud, not a
// heavier per-device watermark scheme.
const TOMBSTONE_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

// ===================== دمج حفظ القرآن (واعٍ بالجيل) =====================
// المشكلة القديمة: `plan: ph.plan ?? sh.plan` و`frontierId: Math.max(...)`
// واتّحادٌ أعمى للسجلّات — فكانت خطةٌ مُسِحت تعود من نسخةٍ قديمة، وتصحيحُ الجبهة
// إلى الخلف يُلغيه Math.max، وقد تختلط سجلّات خطةٍ قديمة بجديدة.
//
// النموذج: لكلّ خطةٍ «جيلٌ» (planId) وطابعٌ موثوق (planUpdatedAt).
//  • عند اختلاف الجيلين: يفوز صاحب الطابع الأحدث *كاملاً* (خطته، جبهته،
//    وسجلّاته وحده) — فالمسح/البدء الأحدث ينتشر ولا تُعيده نسخةٌ قديمة. صاحب
//    الجيل الأحدث هو مؤلِّف كلّ سجلّات ذلك الجيل (لم يرَه الطرف الآخر بعد)،
//    فأخذُ سجلّاته كاملةً كافٍ ولا يخلط شيئاً من الجيل القديم.
//  • عند اتّفاق الجيلين: تتّحد الجلسات والمراجعات والأخطاء بلا فقد، وتُحسب
//    الجبهةُ بحيث لا يضيع تقدّمٌ متزامن (max على أقصى جلسة) ولا يُلغى تصحيحٌ
//    يدويٌّ حديث (طابع frontierUpdatedAt الأحدث من آخر جلسة يفوز، ولو للخلف).
//
// دالة تبادلية (لا يهمّ ترتيب a/b): كلّ الاختيارات بطوابع مع كسر تعادلٍ ثابت.

// معرّف جيلٍ مشتقّ ثابت للبيانات القديمة التي لا تحمل planId — يجب أن يُنتج
// القيمةَ نفسها على كلّ جهاز حتى تتلاقى النسخُ القديمة في جيلٍ واحد بدل أن
// يطيح أحدُهما بالآخر. مشتقٌّ من محتوى الخطة (ثابتٌ عبر الأجهزة).
export function legacyHifzGen(h: Pick<HifzState, "plan">): string {
  return h.plan ? `l:${h.plan.startId}:${h.plan.createdAt}` : "l:none";
}

const hifzGen = (h: HifzState): string => h.planId ?? legacyHifzGen(h);

// اتّحاد شاهدَي حذفٍ (id → طابع) بأخذ الأحدث لكلّ id، مع تقليمٍ لما تجاوز TTL.
function mergeRecordTombstones(
  a?: Record<string, number>, b?: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(out[k] ?? 0, v);
  const cutoff = Date.now() - TOMBSTONE_TTL_MS;
  for (const k of Object.keys(out)) if (out[k] < cutoff) delete out[k];
  return out;
}

// اتّحاد سجلّاتٍ مفتاحُها id مع: إسقاط المشهودِ حذفُه، وفوزِ آخر تعديلٍ (updatedAt
// ثمّ at) عند تعارض التقييم على id واحد، وترتيبٍ موثوقٍ عبر الأجهزة (التاريخ
// تنازلياً ثمّ at ثمّ id) فتنتظم مراجعتان/جلستان في اليوم نفسه بلا اعتمادٍ على
// أيّ الطرفين «الأساس».
function mergeHifzRecords<T extends { id: string; date?: string; at?: number; updatedAt?: number }>(
  a: T[], b: T[], tomb: Record<string, number>
): T[] {
  const byId = new Map<string, T>();
  for (const r of [...a, ...b]) {
    const prev = byId.get(r.id);
    if (!prev) { byId.set(r.id, r); continue; }
    const rU = r.updatedAt ?? r.at ?? 0;
    const pU = prev.updatedAt ?? prev.at ?? 0;
    if (rU > pU) byId.set(r.id, r);
  }
  return [...byId.values()]
    .filter((r) => !(r.id in tomb))
    .sort((x, y) =>
      (y.date ?? "").localeCompare(x.date ?? "") ||
      (y.at ?? 0) - (x.at ?? 0) ||
      (x.id < y.id ? 1 : x.id > y.id ? -1 : 0)
    );
}

export function mergeHifz(a: HifzState, b: HifzState): HifzState {
  const ga = hifzGen(a);
  const gb = hifzGen(b);
  const aAt = a.planUpdatedAt ?? 0;
  const bAt = b.planUpdatedAt ?? 0;

  if (ga !== gb) {
    // جيلان مختلفان: يفوز الأحدث كاملاً. كسر التعادل بمقارنة المعرّف (ثابت).
    const aWins = aAt !== bAt ? aAt > bAt : ga > gb;
    const win = aWins ? a : b;
    // شواهد الحذف خاصّة بالجيل: نأخذ شواهد الفائز وحده (سجلّات الجيل الخاسر
    // تُسقَط أصلاً)، مقلَّمةً بـTTL.
    const wtomb = mergeRecordTombstones(win.deletedRecords);
    return {
      plan: win.plan,
      frontierId: win.frontierId ?? 0,
      sessions: [...(win.sessions ?? [])],
      reviews: [...(win.reviews ?? [])],
      reviewCursorId: win.reviewCursorId ?? 0,
      mistakes: [...(win.mistakes ?? [])],
      lastTestDate: win.lastTestDate,
      planId: hifzGen(win),
      planUpdatedAt: win.planUpdatedAt ?? Math.max(aAt, bAt),
      frontierUpdatedAt: win.frontierUpdatedAt ?? 0,
      deletedRecords: Object.keys(wtomb).length ? wtomb : undefined,
    };
  }

  // الجيل نفسه: اتّحادٌ بلا فقد — مع إسقاط المشهودِ حذفُه فلا يُعيده جهازٌ قديم،
  // وفوزِ آخر تعديلِ تقييمٍ، وترتيبٍ موثوق.
  const tomb = mergeRecordTombstones(a.deletedRecords, b.deletedRecords);
  const sessions = mergeHifzRecords(a.sessions ?? [], b.sessions ?? [], tomb);
  const reviews = mergeHifzRecords(a.reviews ?? [], b.reviews ?? [], tomb);

  // الأخطاء: اتّحاد بالـid مع دمج تواريخ الوقوع (hits) وأحدث حالة إتقان، ثمّ
  // إسقاط المشهودِ حذفُه (deleteMistake النهائي).
  const aMist = a.mistakes ?? [];
  const bMist = b.mistakes ?? [];
  const aMistById = new Map(aMist.map((m) => [m.id, m]));
  const bMistById = new Map(bMist.map((m) => [m.id, m]));
  const mistakes: HifzMistake[] = unionOrdered(aMist, bMist, (m) => m.id)
    .filter((m) => !(m.id in tomb))
    .map((m) => {
      const x = aMistById.get(m.id);
      const y = bMistById.get(m.id);
      if (!x || !y) return m;
      const newer = (x.updatedAt ?? "") >= (y.updatedAt ?? "") ? x : y;
      return { ...newer, hits: [...new Set([...(x.hits ?? []), ...(y.hits ?? [])])].sort() };
    });

  // الجبهة: تقدّم الجلسات (max على أقصى toId) يحمي التقدّم المتزامن؛ لكنّ
  // تصحيحاً يدوياً أحدثَ من آخر جلسة يفوز حتى لو كان للخلف.
  const startFloor = (a.plan?.startId ?? b.plan?.startId ?? 1) - 1;
  const sessMax = sessions.reduce((mx, x) => Math.max(mx, x.toId ?? 0), startFloor);
  const newestSessionAt = sessions.reduce((mx, x) => Math.max(mx, x.at ?? 0), 0);
  const faAt = a.frontierUpdatedAt ?? 0;
  const fbAt = b.frontierUpdatedAt ?? 0;
  const mfAt = Math.max(faAt, fbAt);
  const mfVal = (faAt !== fbAt ? faAt > fbAt : (a.frontierId ?? 0) >= (b.frontierId ?? 0))
    ? (a.frontierId ?? 0) : (b.frontierId ?? 0);
  const frontierId = mfAt > newestSessionAt ? mfVal : Math.max(mfVal, sessMax);

  // إعدادات الخطة (المقدار/الوحدة): يفوز آخر تعديل (planUpdatedAt الأحدث).
  const planSide = aAt !== bAt ? (aAt > bAt ? a : b) : (a.plan ? a : b);
  const lastTestDate = (a.lastTestDate ?? "") >= (b.lastTestDate ?? "")
    ? a.lastTestDate : b.lastTestDate;
  const cursorSide = faAt >= fbAt ? a : b;

  return {
    plan: planSide.plan,
    frontierId,
    sessions,
    reviews,
    reviewCursorId: cursorSide.reviewCursorId || (cursorSide === a ? b : a).reviewCursorId || 0,
    mistakes,
    lastTestDate,
    planId: a.planId ?? b.planId ?? ga,
    planUpdatedAt: Math.max(aAt, bAt) || undefined,
    frontierUpdatedAt: mfAt || undefined,
    deletedRecords: Object.keys(tomb).length ? tomb : undefined,
  };
}

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

  // Single-value settings: merge per-field edit stamps (newest per field), then
  // pick each value from whichever device set it last — so a clear-to-null wins
  // over the other device's stale value. When NEITHER side carries a stamp
  // (legacy data), fall back to the old non-null pick so nothing regresses.
  const fieldUpdatedAt: Record<string, number> = { ...(cloud.fieldUpdatedAt ?? {}) };
  for (const [f, ts] of Object.entries(local.fieldUpdatedAt ?? {})) {
    fieldUpdatedAt[f] = Math.max(fieldUpdatedAt[f] ?? 0, ts);
  }
  const pickSingleton = <K extends keyof AppData>(field: K, fallback: AppData[K]): AppData[K] => {
    const pt = primary.fieldUpdatedAt?.[field as string] ?? 0;
    const st = secondary.fieldUpdatedAt?.[field as string] ?? 0;
    if (pt === 0 && st === 0) return fallback; // legacy: no stamps either side
    return pt >= st ? primary[field] : secondary[field];
  };
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

  // Quran حفظ: دمجٌ واعٍ بجيل الخطة — الجيل الأحدث يفوز كاملاً عند اختلاف
  // الجيلين، والتقدّم يتّحد بلا فقد عند اتّفاقهما. راجع mergeHifz أدناه.
  const quranHifz = mergeHifz(primary.quranHifz ?? EMPTY_HIFZ, secondary.quranHifz ?? EMPTY_HIFZ);

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
    // الإعدادات المفردة: يفوز آخر جهازٍ ضبطها (عبر fieldUpdatedAt)، فيسري المسح
    // إلى null بدل أن يطغى عليه قيمةٌ قديمة من الجهاز الآخر. عند غياب الطوابع
    // (بيانات قديمة) نرجع للسلوك السابق (non-null) فلا يتراجع شيء.
    dailyBudget: pickSingleton("dailyBudget", primary.dailyBudget ?? secondary.dailyBudget),
    monthlyIncome: pickSingleton("monthlyIncome", primary.monthlyIncome ?? secondary.monthlyIncome),
    futureLetters: byId(primary.futureLetters, secondary.futureLetters),
    salaryDay: pickSingleton("salaryDay", primary.salaryDay),
    lastSalaryConfirm: pickSingleton("lastSalaryConfirm", primary.lastSalaryConfirm),
    readingGoal: pickSingleton("readingGoal", primary.readingGoal ?? secondary.readingGoal ?? null),
    // العادات المجمّدة إعدادٌ مفرد (تبديل مقصود): آخر ضبطٍ يفوز كي يسري
    // الاستئناف/التجميد عبر الأجهزة بدل أن يُعيده اتحادٌ لا يعرف الإزالة.
    frozenHabits: pickSingleton("frozenHabits", primary.frozenHabits ?? secondary.frozenHabits ?? []),
    merchantRules: { ...secondary.merchantRules, ...primary.merchantRules },
    deleted,
    deletedMedia,
    fieldUpdatedAt,
    lastUpdated: (local.lastUpdated ?? "") > (cloud.lastUpdated ?? "") ? local.lastUpdated : cloud.lastUpdated,
  };
}
