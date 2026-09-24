// ===================== دورة الراتب (نافذة السقوف) =====================
// السقوف (`budgets`) كانت تُحسب على الشهر الميلادي، فبقيت تتراكم بعد ضغط
// «نزل الراتب» رغم أن الدورة انتهت فعلاً. المصدر الوحيد لنافذة الحساب صار هنا:
// الدورة تبدأ من **تأكيد الراتب** (`lastSalaryConfirm`) — وإن لم يؤكّد المالك بعد
// فمن آخر يوم راتبٍ مرّ. منطقٌ نقيّ بلا حالة، مختبَرٌ في `budgetCycle.test.ts`.
import { parseDate, toDateStr } from "./utils";

// آخر تاريخ نزول راتبٍ في/قبل اليوم (مع مراعاة الأشهر القصيرة: 31 → آخر يوم).
export function lastSalaryDate(salaryDay: number, todayStr: string): string {
  const [y, m, d] = todayStr.split("-").map(Number);
  const day = Math.min(Math.max(Math.round(salaryDay) || 27, 1), 31);
  let sy = y;
  let sm = m;
  if (d < Math.min(day, new Date(y, m, 0).getDate())) {
    sm = m === 1 ? 12 : m - 1;
    sy = m === 1 ? y - 1 : y;
  }
  const lastDay = new Date(sy, sm, 0).getDate();
  return `${sy}-${String(sm).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

// بداية دورة الصرف الحالية: تأكيد الراتب إن وُجد، وإلا آخر يوم راتبٍ مرّ.
// تأكيدٌ قديمٌ (دورةٌ لم تُؤكَّد بعد) يبقى هو البداية — الدورة تنتهي بالضغطة لا
// بمرور التاريخ، وهذا ما يطابق ما يراه المالك في البانر.
export function budgetCycleStart(
  lastSalaryConfirm: string | null | undefined,
  salaryDay: number,
  todayStr: string
): string {
  if (lastSalaryConfirm && /^\d{4}-\d{2}-\d{2}$/.test(lastSalaryConfirm) && lastSalaryConfirm <= todayStr) {
    return lastSalaryConfirm;
  }
  return lastSalaryDate(salaryDay, todayStr);
}

// نهاية الدورة المتوقّعة = يوم الراتب القادم (للوتيرة و«الفائض المتوقّع»).
export function nextSalaryDate(salaryDay: number, todayStr: string): string {
  const start = lastSalaryDate(salaryDay, todayStr);
  const d = parseDate(start);
  const day = Math.min(Math.max(Math.round(salaryDay) || 27, 1), 31);
  const ny = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const nm = d.getMonth() === 11 ? 0 : d.getMonth() + 1;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  return toDateStr(new Date(ny, nm, Math.min(day, lastDay)));
}

// عدد أيام الدورة حتى اليوم (شاملاً يوم البداية واليوم).
export function cycleDays(startDate: string, todayStr: string): number {
  return Math.max(
    1,
    Math.round((parseDate(todayStr).getTime() - parseDate(startDate).getTime()) / 86400000) + 1
  );
}

// هل تقع المعاملة داخل نافذة الحساب؟ النافذة إمّا شهرٌ ميلادي («YYYY-MM») —
// السلوك القديم المحفوظ للتوافق — أو تاريخُ بدايةِ دورة («YYYY-MM-DD») فيُحسب
// كل ما بعده. هذه البوابة الوحيدة لتصفية صرف السقوف في كل الواجهة.
export function inSpendWindow(date: string, windowStart: string): boolean {
  return windowStart.length === 7 ? date.startsWith(windowStart) : date >= windowStart;
}

// نافذة حساب السقوف الفعّالة حسب اختيار المالك (الإعدادات):
// «month» → شهرٌ ميلادي «YYYY-MM» · «salary» (الافتراضي) → بداية دورة الراتب.
// هذه الدالّة هي ما تستدعيه الواجهة، فلا يتكرّر الشرط في كل مكوّن.
export function spendWindow(
  mode: "salary" | "month" | undefined,
  lastSalaryConfirm: string | null | undefined,
  salaryDay: number,
  todayStr: string
): string {
  return mode === "month" ? todayStr.slice(0, 7) : budgetCycleStart(lastSalaryConfirm, salaryDay, todayStr);
}

// طولُ دورة الراتب بالأيام (٢٨..٣١): من يوم الراتب الماضي إلى القادم. تُقسَم
// عليه خطةُ تمويل المظاريف لتصير قطرةً يومية. ولماذا لا «من اليوم إلى الراتب
// القادم»؟ لأنّ تأكيداً مبكّراً (اليوم ٢٥ والراتب ٢٧) يجعل الطول يومين فتصير
// القطرةُ ضِعفَ البدل وتأكله كلَّه — والدورة في الحقيقة شهرٌ كامل.
export function cycleLength(salaryDay: number, todayStr: string): number {
  const from = parseDate(lastSalaryDate(salaryDay, todayStr)).getTime();
  const to = parseDate(nextSalaryDate(salaryDay, todayStr)).getTime();
  return Math.max(1, Math.round((to - from) / 86400000));
}

// ===================== متى يُسأل «نزل الراتب؟» =====================
// كان السؤال لا يظهر إلا من يوم الراتب المحفوظ، فراتبٌ نزل قبله (قبل إجازةٍ
// رسمية مثلاً) لا يملك المالكُ طريقاً لتأكيده — ولو أكّده لعاد السؤالُ يوم
// الراتب فيُرحَّل الفائضُ مرّتين. فالتأكيدُ صار يُحسب لراتبٍ إن وقع قبله بأسبوعٍ
// على الأكثر، وفي ذلك الأسبوع يُعرض عرضاً هادئاً («early») لا البانرَ كاملاً.
export const EARLY_SALARY_DAYS = 7;

function daysBefore(date: string, days: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}

/**
 * «due»: مرّ يوم الراتب ولم يُؤكَّد · «early»: الراتب خلال أسبوع ولم يُؤكَّد
 * بعد (يُعرض خيارُ التأكيد المبكر) · `null`: لا سؤال.
 */
/** هل يُحسب تأكيدُ «نزل الراتب» لراتب `salaryDate`؟ (في يومه أو قبله بأسبوعٍ على الأكثر، أو بعده). */
export function salaryConfirmedFor(lastConfirm: string | null | undefined, salaryDate: string): boolean {
  return !!lastConfirm && /^\d{4}-\d{2}-\d{2}$/.test(lastConfirm) && lastConfirm >= daysBefore(salaryDate, EARLY_SALARY_DAYS);
}

/**
 * الراتبُ القادم الفعليّ: كـ`nextSalaryDate`، إلّا أنّ راتباً أُكّد مبكّراً قد نزل
 * فعلاً، فالقادمُ هو الذي بعده. بدون هذا صارت دورةُ تأكيدٍ يوم ٢٤ (والراتب ٢٧)
 * ثلاثةَ أيام: منحنى يضغط شهراً فيها، و«إلى الراتب ٣ يوم».
 */
export function upcomingSalaryDate(
  salaryDay: number,
  lastConfirm: string | null | undefined,
  todayStr: string
): string {
  const next = nextSalaryDate(salaryDay, todayStr);
  return salaryConfirmedFor(lastConfirm, next) ? nextSalaryDate(salaryDay, next) : next;
}

export function salaryPrompt(
  salaryDay: number,
  lastConfirm: string | null | undefined,
  todayStr: string
): "due" | "early" | null {
  const confirmedFor = (salaryDate: string) => salaryConfirmedFor(lastConfirm, salaryDate);
  if (!confirmedFor(lastSalaryDate(salaryDay, todayStr))) return "due";
  const next = nextSalaryDate(salaryDay, todayStr);
  if (todayStr >= daysBefore(next, EARLY_SALARY_DAYS) && !confirmedFor(next)) return "early";
  return null;
}
