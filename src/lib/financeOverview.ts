// «نظرة اليوم» في صفحة الأموال: تجميعٌ عرضيٌّ فقط لأهمّ الأرقام، يعيد استعمال
// دوالّ الحساب القائمة (computeDailyBudgetStatus / reserveBalance / budgetLimit)
// دون أيّ معادلةٍ جديدة أو تغييرٍ في البيانات. منطقٌ نقيٌّ قابل
// للاختبار حتى تبقى الصفحة رقيقةً.
import type {
  DailyBudget, Transaction, ReserveFund, Budget, FinanceCategoryDef,
} from "./types";
import { computeDailyBudgetStatus, reserveBalance, cashOut, parseDate } from "./utils";
import { SURPLUS_FUND_NAME } from "./types";
import { budgetStatuses } from "./budgetStatus";

export interface FinanceOverview {
  hasBudget: boolean;
  availableToday: number; // ذو معنى فقط عند hasBudget
  monthSpend: number; // مجموع صرف الشهر (إجماليّ، للعرض)
  daysToSalary: number;
  reservesTotal: number;
  hasReserves: boolean;
}

// أقسام «الخطة المالية» القابلة للطيّ (مصادر الروابط العميقة أيضاً).
export const PLAN_SECTIONS = ["daily", "budgets", "reserves"] as const;
export type PlanSectionId = (typeof PLAN_SECTIONS)[number];

// عدد الأيام حتى الراتب القادم (0 = يوم الراتب نفسه). عرضٌ محض، لا يمسّ أيّ حساب.
export function daysUntilSalary(salaryDay: number, todayStr: string): number {
  const [y, m, d] = todayStr.split("-").map(Number);
  const inThisMonth = d <= salaryDay;
  const sy = inThisMonth ? y : m === 12 ? y + 1 : y;
  const sm = inThisMonth ? m : m === 12 ? 1 : m + 1;
  const lastDay = new Date(sy, sm, 0).getDate(); // sm هنا 1..12 → اليوم الأخير للشهر sm
  const day = Math.min(Math.max(salaryDay, 1), lastDay);
  const salaryDate = new Date(sy, sm - 1, day);
  return Math.max(0, Math.round((salaryDate.getTime() - parseDate(todayStr).getTime()) / 86400000));
}

// عدد السقوف المتجاوزة/القريبة داخل النافذة — عدٌّ محضٌ على `budgetStatuses`
// (المصدر الوحيد في `budgetStatus.ts`). للشارة والملخّص فقط.
export function budgetAlerts(
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null,
  // شهرٌ ميلادي «YYYY-MM» أو بدايةُ دورةِ راتب «YYYY-MM-DD» (راجع budgetCycle.ts)
  windowStart: string
): { over: number; near: number } {
  const rows = budgetStatuses(budgets, transactions, categories, monthlyIncome, windowStart);
  return {
    over: rows.filter((r) => r.state === "over").length,
    near: rows.filter((r) => r.state === "near").length,
  };
}

export function buildFinanceOverview(data: {
  dailyBudget: DailyBudget | null;
  transactions: Transaction[];
  reserves: ReserveFund[];
  salaryDay: number;
  monthPrefix: string; // YYYY-MM للشهر الحالي
  todayStr: string;
  now?: Date;
}): FinanceOverview {
  const now = data.now ?? new Date();
  const hasBudget = !!data.dailyBudget;
  const availableToday = hasBudget
    ? computeDailyBudgetStatus(data.dailyBudget as DailyBudget, data.transactions).balance
    : 0;
  // صرف الشهر = ما خرج فعلاً (البوّابة الوحيدة: cashOut).
  const monthSpend = data.transactions
    .filter((t) => t.date.startsWith(data.monthPrefix))
    .reduce((s, t) => s + cashOut(t), 0);
  const reservesTotal = data.reserves.reduce((s, f) => s + reserveBalance(f, data.transactions), 0);
  return {
    hasBudget,
    availableToday,
    monthSpend,
    daysToSalary: daysUntilSalary(data.salaryDay, data.todayStr),
    reservesTotal,
    hasReserves: data.reserves.length > 0,
  };
}

// حالة الفتح الافتراضية لأقسام الخطة: نفتح ما يحتاج انتباهاً، وإلا الميزانية
// اليومية. تُستعمل فقط عند غياب تفضيلٍ محفوظٍ بالجهاز.
export function defaultPlanOpen(attention: {
  budgetAttention: boolean;
  negativeBalance: boolean;
}): Record<PlanSectionId, boolean> {
  const base: Record<PlanSectionId, boolean> = {
    daily: false, budgets: false, reserves: false,
  };
  if (attention.budgetAttention) return { ...base, budgets: true };
  return { ...base, daily: true }; // يشمل حالة الرصيد السالب (القسم نفسه)
}

// أيّ قسمِ خطةٍ يخصّه رابطٌ عميق (‎#daily‎ …)؛ null لغير أقسام الخطة (مثل ‎#history‎
// الظاهر دائماً). يُستعمل لفتح القسم المطويّ قبل التمرير إليه.
export function planSectionFromHash(hash: string): PlanSectionId | null {
  return (PLAN_SECTIONS as readonly string[]).includes(hash) ? (hash as PlanSectionId) : null;
}

// أكبر مصروفٍ **نقديّ** واحد في مجموعة — يمرّ بـ`cashOut` كأيّ تجميعٍ للصرف.
// يرجع null إن لم يكن في المجموعة صرفٌ أصلاً. نقيٌّ ومختبَر، تستعمله صفحة
// «متابعة الصرف» بدل ترتيبٍ خامٍ على `amount`.
export function biggestCashExpense(transactions: Transaction[]): Transaction | null {
  let best: Transaction | null = null;
  for (const t of transactions) {
    const v = cashOut(t);
    if (v <= 0) continue;
    if (!best || v > cashOut(best)) best = t;
  }
  return best;
}

// شريحة «السجل» مع «إظهار المزيد»: أحدث أوّلاً (مُرتَّبة سلفاً)، وكم بقي.
export function historySlice<T>(sorted: T[], limit: number): { visible: T[]; hasMore: boolean; remaining: number } {
  const visible = sorted.slice(0, Math.max(0, limit));
  return { visible, hasMore: sorted.length > visible.length, remaining: sorted.length - visible.length };
}

// ===================== الفائض المتوقّع عند نزول الراتب =====================
// «كم سيتبقّى لي حين ينزل الراتب؟» — سؤالٌ عرضيٌّ محض يعيد استعمال أرقام
// computeDailyBudgetStatus كما هي: الرصيد المتراكم اليوم، زائد يوميّة كل يومٍ
// باقٍ حتى الراتب، ناقص ما يُتوقَّع صرفه على **وتيرتك الفعلية** في هذه الدورة
// (متوسط الصرف اليومي منذ بدايتها). الرقم المتفائل (بلا أيّ صرف) يُعرض بجانبه
// كسقفٍ أعلى حتى لا يُقرأ المتوقَّع على أنه وعد. لا يمسّ أيّ بيانات.
export function projectedCycleSurplus(
  status: { balance: number; spent: number; days: number },
  dailyAmount: number,
  daysLeft: number
): { avgSpend: number; projected: number; optimistic: number; daysLeft: number } {
  const left = Math.max(0, Math.round(daysLeft));
  const avgSpend = status.days > 0 ? Math.round((status.spent / status.days) * 100) / 100 : 0;
  const projected = Math.round((status.balance + (dailyAmount - avgSpend) * left) * 100) / 100;
  const optimistic = Math.round((status.balance + dailyAmount * left) * 100) / 100;
  return { avgSpend, projected, optimistic, daysLeft: left };
}

// ===================== الفوائض ← الميزانية اليومية =====================
// شرط ظهور زرّ «أضف الفوائض للميزانية اليومية» في بطاقة الميزانية، منطقاً نقياً
// لا داخل المكوّن: صندوقٌ اسمه «الفوائض» برصيدٍ موجب **وميزانيةٌ يومية قائمة**
// (بلا ميزانية لا وعاء يستقبل المبلغ). يرجع `null` حين لا مصدر — فيختفي الزرّ.
export function surplusPullSource(
  reserves: ReserveFund[],
  transactions: Transaction[],
  hasDailyBudget: boolean
): { fundId: string; balance: number } | null {
  if (!hasDailyBudget) return null;
  const fund = reserves.find((f) => f.name === SURPLUS_FUND_NAME);
  if (!fund) return null;
  const balance = reserveBalance(fund, transactions);
  return balance > 0 ? { fundId: fund.id, balance } : null;
}
