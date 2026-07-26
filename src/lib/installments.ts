// الأقساط — منطقٌ نقيٌّ بالكامل (لا حالة، لا I/O، لا Firebase) فيصحّ اختباره
// وحدةً. المبدأ الحاكم: **الخطة وصفٌ للاتفاق، والمعاملات هي الحقيقة**. لا شيء
// يُحتسب مدفوعاً إلا بمعاملةٍ مربوطة (`Transaction.planId`)، فمرور الموعد وحده لا
// يدفع قسطاً، وإلغاء الخطة لا يمحو ما دُفع فعلاً.
//
// الأرقام:
//   المدفوع   = مجموع المعاملات المربوطة (بأيّ دور).
//   المتبقّي  = max(0, totalPrice − المدفوع).
//   النسبة    = المدفوع ÷ totalPrice.
//   الجدول    = شهريٌّ من `firstDueDate` بيوم استحقاقٍ ثابت، يُقلَّم لآخر يوم الشهر
//               (31 → 30 → 28/29 في فبراير والسنة الكبيسة) ثمّ يعود ليوم المرساة.
// الرسوم توضيحية لا تُضاف على الإجمالي، و`finalPayment` **تستبدل** آخر قسط.
import type { InstallmentPlan, InstallmentRole, InstallmentStatus, Transaction } from "./types";
import { round2, toDateStr, parseDate } from "./utils";

export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  active: "نشطة",
  settled: "مسددة",
  cancelled: "ملغاة",
};

export const INSTALLMENT_ROLE_LABEL: Record<InstallmentRole, string> = {
  principal: "الأصل (مؤجّل)",
  down: "الدفعة الأولى",
  installment: "قسط",
  final: "الدفعة الأخيرة",
  settlement: "سداد مبكر",
};

// تفاوتٌ مقبول عند مقارنة المبالغ (نصف ريال) — يمنع تحذيراً كاذباً من كسور
// القسمة، ويكشف فرقاً حقيقياً يستحق نظر المالك.
const MONEY_EPSILON = 0.5;
// تفاوت اعتبار الصفّ مدفوعاً (هللة واحدة) — دفعةٌ أقلّ بقروشٍ تُغلق القسط.
const ROW_EPSILON = 0.01;

// ===================== جدول الاستحقاق =====================

// سقفٌ صلب لعدد صفوف الجدول — حارسٌ ضدّ عددٍ فاسد (خطأ إدخالٍ أو بياناتٍ تالفة)
// يولّد ملايين الصفوف فيُجمّد الصفحة. 600 = خمسون سنةً شهرياً، فلا يقصّ خطةً حقيقية.
const MAX_SCHEDULE_ROWS = 600;
// أقصى عددٍ يقبله النموذج (عشر سنوات) — ما فوقه خطأُ إدخالٍ شبه مؤكّد.
export const MAX_INSTALLMENT_COUNT = 120;

// تاريخٌ صالحٌ فعلاً بصيغة YYYY-MM-DD — لا الشكل وحده: «2026-13-45» يطابق النمط
// لكنه ليس يوماً، و`parseDate` كانت تُدوّره لتاريخٍ آخر بلا إشعار (شهر 13 → يناير
// التالي). حارسٌ واحد يشترك فيه النموذج و«قسّط هذا المصروف» وتوليد الجدول.
export function isValidDateKey(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(y, m, 0).getDate(); // آخر يوم في الشهر m
}

// مواعيد الاستحقاق: `count` موعداً شهرياً من `firstDueDate`. يوم المرساة هو يوم
// أوّل استحقاق؛ في شهرٍ أقصر يُقلَّم لآخر يومٍ فيه (31 يناير → 28/29 فبراير) ثمّ
// **يعود ليوم المرساة** في الشهر التالي — فلا يزحف الموعد للأبد بعد شهرٍ قصير.
export function installmentDueDates(firstDueDate: string, count: number): string[] {
  const n = Math.min(Math.max(0, Math.floor(count) || 0), MAX_SCHEDULE_ROWS);
  if (!n || !isValidDateKey(firstDueDate)) return [];
  const first = parseDate(firstDueDate);
  const anchorDay = first.getDate();
  const baseIndex = first.getFullYear() * 12 + first.getMonth();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const idx = baseIndex + i;
    const y = Math.floor(idx / 12);
    const m = ((idx % 12) + 12) % 12;
    const lastDay = new Date(y, m + 1, 0).getDate(); // اليوم الأخير للشهر m
    out.push(toDateStr(new Date(y, m, Math.min(anchorDay, lastDay))));
  }
  return out;
}

export interface ScheduleRow {
  no: number; // 1..count
  due: string; // YYYY-MM-DD
  amount: number; // قيمة القسط، أو الدفعة الأخيرة في الصفّ الأخير
  isFinal: boolean; // هذا الصفّ هو الدفعة الأخيرة الكبيرة (استبدلت القسط)
  paidAmount: number; // مجموع ما رُبط بهذا الصفّ فعلاً
  paid: boolean; // اكتمل دفعه (لا يصير مدفوعاً بمرور الوقت أبداً)
  overdue: boolean; // فات موعده وما دُفع (وصفٌ لا حالةَ دفع)
  closedEarly: boolean; // أُغلق بسدادٍ مبكر — لا مدفوعٌ ولا متأخّر
  txIds: string[]; // المعاملات التي غطّته
}

// صفوف الجدول قبل ربط المدفوعات: المواعيد والمبالغ فقط.
export function planScheduleAmounts(plan: InstallmentPlan): { no: number; due: string; amount: number; isFinal: boolean }[] {
  const dues = installmentDueDates(plan.firstDueDate, plan.count);
  const hasFinal = (plan.finalPayment ?? 0) > 0;
  return dues.map((due, i) => {
    const last = i === dues.length - 1;
    const isFinal = hasFinal && last;
    return { no: i + 1, due, amount: round2(isFinal ? plan.finalPayment! : plan.installmentAmount), isFinal };
  });
}

// ===================== المبالغ =====================

// ما تتوقّعه بنود الخطة أن يُدفع: الدفعة الأولى + الأقساط (مع استبدال الأخير
// بالدفعة الأخيرة إن وُجدت). الرسوم **ليست** جزءاً منه — توضيحية فقط.
export function planExpectedTotal(plan: InstallmentPlan): number {
  const rows = planScheduleAmounts(plan);
  return round2((plan.downPayment || 0) + rows.reduce((s, r) => s + r.amount, 0));
}

// الإجمالي من البنود مباشرةً (دون خطةٍ كاملة) — يستعمله النموذج ليحسب السعر
// الإجمالي بنفسه بدل أن يطالِب المالك بجمعه بيده: ١٥٠٠ + ٧٨٠ × ٦ = ٦١٨٠.
export function partsTotal(p: {
  downPayment: number; installmentAmount: number; count: number; finalPayment?: number;
}): number {
  const n = Math.max(0, Math.floor(p.count) || 0);
  if (!n) return round2(p.downPayment || 0);
  const hasFinal = (p.finalPayment ?? 0) > 0;
  const regular = hasFinal ? n - 1 : n;
  return round2(
    (p.downPayment || 0) + regular * (p.installmentAmount || 0) + (hasFinal ? p.finalPayment! : 0)
  );
}

// فرقٌ بين ما تتوقّعه البنود والسعر الإجمالي (المرجع). تحذيرٌ **غير معطِّل**:
// نعرضه ولا نصحّح أرقام المالك ولا نمنعه من الحفظ.
export function planMismatch(plan: InstallmentPlan): { expected: number; diff: number } | null {
  const expected = planExpectedTotal(plan);
  const diff = round2(expected - plan.totalPrice);
  return Math.abs(diff) > MONEY_EPSILON ? { expected, diff } : null;
}

// كل معاملات هذه الخطة (أقدم أولاً) — بما فيها «الأصل المؤجّل» إن وُجد.
export function planLinkedTransactions(plan: InstallmentPlan | string, transactions: Transaction[]): Transaction[] {
  const id = typeof plan === "string" ? plan : plan.id;
  return transactions
    .filter((t) => t.planId === id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// **الدفعات** فقط — مصدر كل رقمٍ «مدفوع». يُستثنى منها:
//  • «الأصل المؤجّل» (`planRole: "principal"`): هو الشراء نفسه، التزامٌ لا دفعة —
//    لو حُسِب لظهرت الخطة مسدّدةً كاملةً في لحظة الشراء.
//  • أيّ معاملةٍ مؤجّلة (`deferred`): لم يخرج منها ريال.
export function planPayments(plan: InstallmentPlan | string, transactions: Transaction[]): Transaction[] {
  return planLinkedTransactions(plan, transactions).filter(
    (t) => t.planRole !== "principal" && !t.deferred
  );
}

// «الأصل المؤجّل» المرتبط بالخطة (الشراء الذي لم يكن كاش)، إن وُجد.
export function planPrincipal(plan: InstallmentPlan, transactions: Transaction[]): Transaction | null {
  return (
    planLinkedTransactions(plan, transactions).find(
      (t) => t.planRole === "principal" || t.id === plan.principalTxId
    ) ?? null
  );
}

export function planPaid(plan: InstallmentPlan, transactions: Transaction[]): number {
  return round2(planPayments(plan, transactions).reduce((s, t) => s + t.amount, 0));
}

// ===================== الجدول مع المدفوعات =====================

// ربط المدفوعات بصفوف الجدول: الدفعة التي تحمل رقم قسطٍ صريح تُنسب لصفّها، وما
// بلا رقم يُوزّع على أقدم صفٍّ غير مكتمل (فتسجيلٌ سريع بلا اختيار رقم يبقى صحيحاً).
export function planSchedule(plan: InstallmentPlan, transactions: Transaction[], todayStr: string): ScheduleRow[] {
  const rows: ScheduleRow[] = planScheduleAmounts(plan).map((r) => ({
    ...r, paidAmount: 0, paid: false, overdue: false, closedEarly: false, txIds: [],
  }));
  if (!rows.length) return rows;
  const byNo = new Map(rows.map((r) => [r.no, r]));
  const covering = planPayments(plan, transactions).filter(
    (t) => t.planRole === "installment" || t.planRole === "final"
  );
  const loose: Transaction[] = [];
  for (const t of covering) {
    const row = t.planInstallmentNo != null ? byNo.get(t.planInstallmentNo) : undefined;
    if (row) {
      row.paidAmount = round2(row.paidAmount + t.amount);
      row.txIds.push(t.id);
    } else {
      loose.push(t);
    }
  }
  const filled = (r: ScheduleRow) => r.paidAmount + ROW_EPSILON >= r.amount;
  for (const t of loose) {
    const row = rows.find((r) => !filled(r)) ?? rows[rows.length - 1];
    row.paidAmount = round2(row.paidAmount + t.amount);
    row.txIds.push(t.id);
  }
  for (const r of rows) {
    r.paid = filled(r);
    // السداد المبكر يُغلق ما بقي: لا يُحسب مدفوعاً (لم يُدفع بقيمته) ولا متأخّراً.
    r.closedEarly = !r.paid && plan.status === "settled";
    // «لا يصير القسط مدفوعاً بمرور الوقت» — الفوات وصفٌ للموعد فقط، والخطة
    // الملغاة/المسددة لا تُطالِب بشيء.
    r.overdue = !r.paid && !r.closedEarly && plan.status === "active" && r.due < todayStr;
  }
  return rows;
}

// ما بقي على صفٍّ بعينه: قيمتُه ناقص ما رُبط به فعلاً. القسط قد يُدفع على دفعتين
// (تحويلٌ ناقص ثمّ إكماله)، فتسجيلُ قيمته كاملةً ثانيةً يُضخّم المدفوع بلا حقّ.
export function rowRemaining(row: Pick<ScheduleRow, "amount" | "paidAmount">): number {
  return round2(Math.max(0, row.amount - row.paidAmount));
}

export interface PlanSummary {
  rows: ScheduleRow[];
  paidRows: number; // كم قسطاً اكتمل دفعه (للعرض: «٣ من ١٢ قسطاً»)
  totalRows: number; // عدد أقساط الجدول
  paid: number; // مجموع المعاملات المربوطة
  remaining: number; // max(0, totalPrice − المدفوع)
  pct: number; // 0..100 نسبة الإنجاز
  complete: boolean; // اكتملت (سُدّدت مبكراً أو بلغ المدفوع الإجمالي)
  next: ScheduleRow | null; // القسط القادم (أقدم صفٍّ غير مدفوع)
  overdue: number; // عدد الأقساط الفائتة غير المدفوعة
  mismatch: { expected: number; diff: number } | null; // تحذير غير معطِّل
  saved: number; // «موفَّر» بالسداد المبكر (فرقٌ معروضٌ فقط — لا مصروف وهمي)
  downPaid: boolean; // سُجّلت الدفعة الأولى
  // «الأصل المؤجّل» المربوط (الشراء الذي لم يكن كاش) — للعرض فقط، بصفر أثرٍ حسابيّ.
  principal: Transaction | null;
}

export function planSummary(plan: InstallmentPlan, transactions: Transaction[], todayStr: string): PlanSummary {
  const payments = planPayments(plan, transactions);
  const rows = planSchedule(plan, transactions, todayStr);
  const paid = round2(payments.reduce((s, t) => s + t.amount, 0));
  const remaining = round2(Math.max(0, plan.totalPrice - paid));
  const complete = plan.status === "settled" || (plan.totalPrice > 0 && paid + ROW_EPSILON >= plan.totalPrice);
  const pct = complete
    ? 100
    : plan.totalPrice > 0
      ? Math.max(0, Math.min(100, Math.round((paid / plan.totalPrice) * 100)))
      : 0;
  // «موفَّر»: ما كان واجباً قبل السداد المبكر ناقص ما دُفع فيه فعلاً. عرضٌ محض.
  const settleTotal = round2(
    payments.filter((t) => t.planRole === "settlement").reduce((s, t) => s + t.amount, 0)
  );
  let saved = 0;
  if (settleTotal > 0) {
    const owedBefore = round2(Math.max(0, plan.totalPrice - round2(paid - settleTotal)));
    saved = round2(Math.max(0, owedBefore - settleTotal));
  }
  return {
    rows,
    paidRows: rows.filter((r) => r.paid).length,
    totalRows: rows.length,
    paid,
    remaining,
    pct,
    complete,
    next: rows.find((r) => !r.paid && !r.closedEarly) ?? null,
    overdue: rows.filter((r) => r.overdue).length,
    mismatch: planMismatch(plan),
    saved,
    downPaid: payments.some((t) => t.planRole === "down"),
    principal: planPrincipal(plan, transactions),
  };
}

// خطةٌ ما زالت تطالِب بدفعاتٍ قادمة (تدخل «أقرب التزام» والتنبيه الواحد).
export function isPlanOpen(plan: InstallmentPlan, transactions: Transaction[], todayStr: string): boolean {
  if (plan.status !== "active") return false;
  return !planSummary(plan, transactions, todayStr).complete;
}

export interface InstallmentsOverview {
  activeCount: number; // خطط نشطة لم تكتمل
  remainingTotal: number; // مجموع المتبقّي عليها
  monthlyLoad: number; // مجموع الأقساط الشهرية للخطط النشطة (عبءٌ تقديريّ)
  overdueCount: number; // أقساط فائتة غير مدفوعة عبر كل الخطط
  next: { plan: InstallmentPlan; row: ScheduleRow } | null; // أقرب قسطٍ مستحقّ
  savedTotal: number; // مجموع ما وفّره السداد المبكر (عرضٌ فقط)
}

export function installmentsOverview(
  plans: InstallmentPlan[],
  transactions: Transaction[],
  todayStr: string
): InstallmentsOverview {
  let remainingTotal = 0;
  let monthlyLoad = 0;
  let overdueCount = 0;
  let savedTotal = 0;
  let activeCount = 0;
  let next: { plan: InstallmentPlan; row: ScheduleRow } | null = null;
  for (const plan of plans) {
    const s = planSummary(plan, transactions, todayStr);
    savedTotal = round2(savedTotal + s.saved);
    overdueCount += s.overdue;
    if (plan.status !== "active" || s.complete) continue;
    activeCount++;
    remainingTotal = round2(remainingTotal + s.remaining);
    monthlyLoad = round2(monthlyLoad + (plan.installmentAmount || 0));
    if (s.next && (!next || s.next.due < next.row.due)) next = { plan, row: s.next };
  }
  return { activeCount, remainingTotal, monthlyLoad, overdueCount, next, savedTotal };
}

// ===================== الربط التلقائي =====================
// المالك يسجّل مصروفه كالعادة (أو يصله من رسالة البنك)، ونحن نربطه بالقسط الذي
// يطابقه بلا أن يبحث عن الخطة. الربط **اقتراحٌ محسوم**: لا يُقترح إلا حين لا
// يحتمل غير خطةٍ واحدة، فلا يُنسب ريالٌ لخطةٍ خطأً. التوسّع في الشكّ ممنوع —
// عند تعدّد المرشّحين نُرجع null ويبقى القرار للمالك.

// تفاوت المبلغ المقبول (ريال) — القسط قد يصل ٧٧٩٫٩٥ أو ٧٨٠٫٥ برسم تحويل.
export const AUTO_LINK_TOLERANCE = 1;
// نافذة التاريخ حول موعد الاستحقاق (أيام) — تُغطّي الدفع المبكر والمتأخّر بأسبوع
// ونصف، ولا تمتدّ لقسط الشهر التالي (٣٠ يوماً).
export const AUTO_LINK_WINDOW = 12;

export interface PlanLinkSuggestion {
  plan: InstallmentPlan;
  row: ScheduleRow;
  role: InstallmentRole; // "installment" أو "final"
}

// مرشّحٌ وحيدٌ لربط معاملةٍ بقسط، أو null. المعاملة المربوطة أصلاً أو المؤجّلة
// لا تُقترح ثانيةً، والخطط المغلقة لا تطالِب بشيء.
export function suggestPlanLink(
  tx: { amount: number; date: string; planId?: string; deferred?: boolean },
  plans: InstallmentPlan[],
  transactions: Transaction[],
  todayStr: string
): PlanLinkSuggestion | null {
  if (tx.planId || tx.deferred || !(tx.amount > 0)) return null;
  const hits: PlanLinkSuggestion[] = [];
  for (const plan of plans) {
    if (plan.status !== "active") continue;
    for (const row of planSchedule(plan, transactions, todayStr)) {
      if (row.paid || row.closedEarly) continue;
      const remaining = rowRemaining(row);
      const amountFits =
        Math.abs(tx.amount - remaining) <= AUTO_LINK_TOLERANCE ||
        Math.abs(tx.amount - row.amount) <= AUTO_LINK_TOLERANCE;
      if (!amountFits) continue;
      if (Math.abs(daysBetween(row.due, tx.date)) > AUTO_LINK_WINDOW) continue;
      hits.push({ plan, row, role: row.isFinal ? "final" : "installment" });
    }
  }
  // الشكّ يمنع الربط: مرشّحان (خطّتان بنفس القسط والموعد) يعنيان أن الاختيار
  // للمالك لا لنا.
  return hits.length === 1 ? hits[0] : null;
}

// ===================== تحقّقٌ من المدخلات =====================

// أخطاءٌ تمنع الحفظ (بيانات لا معنى لها). عدم تطابق الحساب **ليس** منها — ذاك
// تحذيرٌ غير معطِّل عبر planMismatch.
export function validatePlanDraft(d: {
  provider: string; name: string; totalPrice: number; downPayment: number;
  installmentAmount: number; count: number; firstDueDate: string;
}): string[] {
  const errors: string[] = [];
  if (!d.provider.trim() && !d.name.trim()) errors.push("اكتب الجهة أو اسم الالتزام");
  if (!(d.totalPrice > 0)) errors.push("السعر الإجمالي مطلوب");
  if (!(d.count >= 1)) errors.push("عدد الأقساط لا يقلّ عن ١");
  else if (d.count > MAX_INSTALLMENT_COUNT) errors.push(`عدد الأقساط أكبر من المعقول (الحدّ ${MAX_INSTALLMENT_COUNT})`);
  if (!(d.installmentAmount > 0)) errors.push("قيمة القسط مطلوبة");
  if (d.downPayment < 0) errors.push("الدفعة الأولى لا تكون سالبة");
  if (!isValidDateKey(d.firstDueDate)) errors.push("أول موعد استحقاق مطلوب");
  return errors;
}

// وصفٌ عربيٌّ موجز لعدد الأيام حتى موعدٍ (يشترك فيه العرض والتنبيه).
export function describeDueIn(days: number): string {
  if (days < 0) return `متأخّر ${Math.abs(days)} يوم`;
  if (days === 0) return "اليوم";
  if (days === 1) return "غداً";
  return `خلال ${days} يوم`;
}

export function daysBetween(fromStr: string, toStr: string): number {
  return Math.round((parseDate(toStr).getTime() - parseDate(fromStr).getTime()) / 86400000);
}
