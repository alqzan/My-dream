// قرارات المزامنة — دوالٌّ نقيّة بلا Firebase ولا React، مُخرَجة من SyncProvider
// حتى تُختبر وحدةً (كانت داخل المكوّن فلا سبيل لاختبار الشرط الذي يقرّر تبنّي
// لقطة السحابة، وهو أخطر شرطٍ في التطبيق: خطؤه = تعديلٌ يضيع بلا أثر).
import type { AppData } from "./types";

// هل تحمل هذه اللقطة بياناتٍ حقيقية للمالك؟ يُستعمل حتى لا يمحو جهازٌ جديد فارغ
// مساحةً سحابية فيها بياناته — الطوابع وحدها لا تكفي، فجهازٌ جديد يبدأ بختم
// «الآن» فيبدو أحدث من بياناتٍ حقيقية أقدم. يغطّي كلّ مجموعةٍ من تأليف المالك،
// ويستثني عمداً ما يشحنه التطبيق الجديد أصلاً (التصنيفات الافتراضية، العادتان
// المزروعتان — تُحتسبان بأيامها المسجّلة فقط، وsalaryDay 27) وإلا بدا كل جهاز
// «غير فارغ» فلا يعمل حارس الجهاز الجديد أبداً.
export function hasData(d: Partial<AppData>): boolean {
  const arr = (a?: { length: number }) => (a?.length ?? 0) > 0;
  if (
    arr(d.transactions) || arr(d.journalEntries) || arr(d.books) ||
    arr(d.readingLogs) || arr(d.recurring) || arr(d.budgets) ||
    arr(d.reserves) || arr(d.prayerLogs) || arr(d.futureLetters) ||
    arr(d.quranReflections) || arr(d.quranWird) || arr(d.installmentPlans) ||
    arr(d.assets) || arr(d.countdownEvents) ||
    arr(d.knowledgeSources) || arr(d.benefits) || arr(d.shelfItems)
  ) return true;
  if ((d.habits ?? []).some((h) => (h.logs?.length ?? 0) > 0)) return true;
  const hifz = d.quranHifz;
  if (hifz && (hifz.plan || (hifz.sessions?.length ?? 0) > 0 ||
    (hifz.reviews?.length ?? 0) > 0 || (hifz.frontierId ?? 0) > 0 ||
    (hifz.mistakes?.length ?? 0) > 0)) return true;
  if ((d.quranKhatma?.completed ?? 0) > 0 || (d.quranKhatma?.juz ?? 0) > 0) return true;
  if (d.dailyBudget || (d.monthlyIncome ?? 0) > 0 || (d.readingGoal ?? 0) > 0) return true;
  if ((d.qadaBacklog ?? 0) > 0) return true;
  if (Object.keys(d.merchantRules ?? {}).length > 0) return true;
  // A device whose only "state" is having deleted things still has real intent
  // to preserve — otherwise its tombstones can't seed a cloud that lacks them.
  if (Object.keys(d.deleted ?? {}).length > 0) return true;
  return false;
}

// True when the cloud snapshot carries anything this device hasn't seen yet —
// a new id, a new date, or a deletion. Used so a lagging top-level `lastUpdated`
// (e.g. the other device's clock runs a few minutes behind) can never hide a
// genuinely new change written elsewhere — we pull on unseen content, not just
// on a newer timestamp. Covers every collection plus tombstones, so a remote
// delete/un-complete propagates live instead of waiting for the next unrelated
// edit. ملاحظة مهمّة: هذا الفحص يرى **العناصر الجديدة** فقط، لا تعديلَ عنصرٍ
// قائم — ولذلك وحده لا يكفي (راجع shouldAdoptCloud).
//
// **عند إضافة مجموعةٍ جديدة لـAppData أضِفها هنا وفي `hasData` معاً.** إغفالُها
// عطلٌ صامت: `assets` أُضيفت في 0.1.295 ونُسيت في الدالتين، فأصلٌ سُجّل على
// الجوّال لم يُعدّ «محتوىً لم يُرَ» على الآيباد — تسقط شبكة الأمان الثالثة
// ويبقى الجهازان مختلفين. الحارس في `syncDecision.test.ts` يكشف الإغفال التالي.
export function cloudHasUnseen(cloud: Partial<AppData>, local: AppData): boolean {
  const hasNewId = (localItems: { id: string }[], cloudItems?: { id: string }[]) => {
    const ids = new Set(localItems.map((i) => i.id));
    return (cloudItems ?? []).some((i) => !ids.has(i.id));
  };
  if (
    hasNewId(local.journalEntries, cloud.journalEntries) ||
    hasNewId(local.transactions, cloud.transactions) ||
    hasNewId(local.books, cloud.books) ||
    hasNewId(local.readingLogs, cloud.readingLogs) ||
    hasNewId(local.futureLetters, cloud.futureLetters) ||
    hasNewId(local.recurring, cloud.recurring) ||
    hasNewId(local.installmentPlans ?? [], cloud.installmentPlans) ||
    hasNewId(local.assets ?? [], cloud.assets) ||
    hasNewId(local.countdownEvents ?? [], cloud.countdownEvents) ||
    hasNewId(local.reserves, cloud.reserves) ||
    hasNewId(local.habits, cloud.habits) ||
    hasNewId(local.categories, cloud.categories) ||
    hasNewId(local.quranReflections ?? [], cloud.quranReflections) ||
    hasNewId(local.knowledgeSources ?? [], cloud.knowledgeSources) ||
    hasNewId(local.benefits ?? [], cloud.benefits) ||
    hasNewId(local.shelfItems ?? [], cloud.shelfItems)
  ) return true;
  const localPrayers = new Set(local.prayerLogs.map((p) => p.date));
  if ((cloud.prayerLogs ?? []).some((p) => !localPrayers.has(p.date))) return true;
  const localBudgets = new Set(local.budgets.map((b) => b.category));
  if ((cloud.budgets ?? []).some((b) => !localBudgets.has(b.category))) return true;
  const localWird = new Set(local.quranWird ?? []);
  if ((cloud.quranWird ?? []).some((wd) => !localWird.has(wd))) return true;
  const localHabitLogs = new Map((local.habits ?? []).map((h) => [h.id, new Set(h.logs ?? [])]));
  if ((cloud.habits ?? []).some((h) => (h.logs ?? []).some((wd) => !localHabitLogs.get(h.id)?.has(wd)))) return true;
  const localHifz = local.quranHifz;
  const cloudHifz = cloud.quranHifz;
  if (cloudHifz) {
    // An explicit cloud plan generation is content we have not seen. An old
    // document may omit planId, so an absent cloud value must not make a fresh
    // device treat its own local plan as remotely new.
    if (cloudHifz.planId && cloudHifz.planId !== localHifz?.planId) return true;
    if (hasNewId(localHifz?.sessions ?? [], cloudHifz.sessions) ||
      hasNewId(localHifz?.reviews ?? [], cloudHifz.reviews) ||
      hasNewId(localHifz?.mistakes ?? [], cloudHifz.mistakes)) return true;
    if ((cloudHifz.frontierId ?? 0) > (localHifz?.frontierId ?? 0) ||
      (cloudHifz.lastTestDate ?? "") > (localHifz?.lastTestDate ?? "")) return true;
    if (Object.keys(cloudHifz.deletedRecords ?? {}).some((id) => !(id in (localHifz?.deletedRecords ?? {})))) return true;
  }
  const localKhatma = local.quranKhatma;
  const cloudKhatma = cloud.quranKhatma;
  if (cloudKhatma) {
    const localPageLog = new Map<string, number>();
    for (const entry of localKhatma?.pageLog ?? []) {
      localPageLog.set(entry.date, Math.max(localPageLog.get(entry.date) ?? 0, entry.page));
    }
    if ((cloudKhatma.pageLog ?? []).some((entry) => entry.page > (localPageLog.get(entry.date) ?? 0))) return true;
    if ((cloudKhatma.juz ?? 0) > (localKhatma?.juz ?? 0) ||
      (cloudKhatma.page ?? 0) > (localKhatma?.page ?? 0) ||
      (cloudKhatma.completed ?? 0) > (localKhatma?.completed ?? 0) ||
      (cloudKhatma.lastReadDate ?? "") > (localKhatma?.lastReadDate ?? "")) return true;
  }
  const localDeleted = local.deleted ?? {};
  if (Object.keys(cloud.deleted ?? {}).some((k) => !(k in localDeleted))) return true;
  const localDelMedia = local.deletedMedia ?? {};
  if (Object.keys(cloud.deletedMedia ?? {}).some((k) => !(k in localDelMedia))) return true;
  return false;
}

// هل نتبنّى (نُدمج) لقطةً وصلت من المستمع الحيّ؟
//
// كانت الإجابة معلّقةً على أمرين فقط: ختمٌ أحدث، أو محتوى لم نره (معرّف/تاريخ/
// شاهد حذف جديد). وهذا يُسقِط حالةً حقيقية: **تعديل عنصرٍ قائم** على جهازٍ ساعته
// متأخّرة — لا معرّف جديد ولا شاهد جديد، والختم يبدو أقدم، فيُتجاهل التعديل بلا
// أثر (يبقى في السحابة ولا يظهر هنا حتى تعديلٍ آخر لا علاقة له).
//
// العلاج: `revision` — عدّادٌ رقميّ رتيب يرفعه كلّ حفظٍ في معاملة Firestore، فلا
// يعتمد على ساعة أيّ جهاز. ارتفاعه عن آخر revision تبنّيناه يعني **كتابةً حقيقية
// من جهازٍ آخر**، وهذا سببٌ كافٍ للدمج وحده. الدمج نفسه (mergeAppData) يحلّ
// التعارض لكل عنصرٍ بـupdatedAt الخاص به، فتبنّي لقطةٍ لا يفقد تعديلاً محلياً.
export interface AdoptInputs {
  cloudLastUpdated?: string;
  localLastUpdated?: string;
  // revision المستند القادم مقابل آخر revision تبنّاه/كتبه هذا الجهاز.
  cloudRevision?: number;
  lastRevision?: number;
  // نتيجة cloudHasUnseen (تُحسب في مكان النداء لتبقى هذه الدالة نقيّة ورخيصة).
  hasUnseen: boolean;
}

export interface AdoptDecision {
  adopt: boolean;
  reason: "newer" | "revision" | "unseen" | "none";
}

export function decideAdoptCloud(i: AdoptInputs): AdoptDecision {
  if ((i.cloudLastUpdated ?? "") > (i.localLastUpdated ?? "")) return { adopt: true, reason: "newer" };
  // ارتفاع revision = كتابةٌ من جهازٍ آخر، ولو كان ختمُه الزمني متأخّراً.
  if ((i.cloudRevision ?? 0) > (i.lastRevision ?? 0)) return { adopt: true, reason: "revision" };
  if (i.hasUnseen) return { adopt: true, reason: "unseen" };
  return { adopt: false, reason: "none" };
}

export function shouldAdoptCloud(i: AdoptInputs): boolean {
  return decideAdoptCloud(i).adopt;
}
