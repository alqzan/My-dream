// «نظرة اليوم» في صفحة الأموال: تجميعٌ عرضيٌّ فقط لأهمّ الأرقام، يعيد استعمال
// دوالّ الحساب القائمة (computeDailyBudgetStatus / reserveBalance / nextDueDate /
// budgetLimit) دون أيّ معادلةٍ جديدة أو تغييرٍ في البيانات. منطقٌ نقيٌّ قابل
// للاختبار حتى تبقى الصفحة رقيقةً.
import type {
  DailyBudget, Transaction, ReserveFund, RecurringTransaction, Budget, FinanceCategoryDef,
} from "./types";
import { computeDailyBudgetStatus, reserveBalance, nextDueDate, budgetLimit, getMainCategory, parseDate } from "./utils";

export interface NearestCommitment {
  id: string;
  note: string;
  category: string;
  amount: number;
  due: string; // YYYY-MM-DD
  daysUntil: number;
}

export interface FinanceOverview {
  hasBudget: boolean;
  availableToday: number; // ذو معنى فقط عند hasBudget
  monthSpend: number; // مجموع صرف الشهر (إجماليّ، للعرض)
  daysToSalary: number;
  reservesTotal: number;
  hasReserves: boolean;
  nearest: NearestCommitment | null;
}

// أقسام «الخطة المالية» القابلة للطيّ (مصادر الروابط العميقة أيضاً).
export const PLAN_SECTIONS = ["daily", "budgets", "recurring", "reserves"] as const;
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

// أقرب التزامٍ متكرّرٍ قادم (أصغر nextDueDate بين المفعّلة).
export function nearestCommitment(recurring: RecurringTransaction[], now: Date): NearestCommitment | null {
  const active = recurring.filter((r) => r.active);
  if (!active.length) return null;
  const best = active
    .map((r) => ({ r, due: nextDueDate(r, now) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime())[0];
  const { r, due } = best;
  const startOfToday = new Date(now.toDateString()).getTime();
  const daysUntil = Math.max(0, Math.round((due.getTime() - startOfToday) / 86400000));
  const key = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  return { id: r.id, note: r.note, category: r.category, amount: r.amount, due: key, daysUntil };
}

// عدد السقوف المتجاوزة/القريبة هذا الشهر — نفس منطق insights/BudgetTracker
// (budgetLimit + getMainCategory + عتبة 80%). للشارة والملخّص فقط.
export function budgetAlerts(
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null,
  monthPrefix: string
): { over: number; near: number } {
  let over = 0;
  let near = 0;
  for (const b of budgets) {
    const cap = budgetLimit(b, monthlyIncome);
    if (!cap) continue;
    const spent = transactions
      .filter((t) => getMainCategory(categories, t.category).id === b.category && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);
    if (spent > cap) over++;
    else if ((spent / cap) * 100 >= 80) near++;
  }
  return { over, near };
}

export function buildFinanceOverview(data: {
  dailyBudget: DailyBudget | null;
  transactions: Transaction[];
  reserves: ReserveFund[];
  recurring: RecurringTransaction[];
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
  const monthSpend = data.transactions
    .filter((t) => t.date.startsWith(data.monthPrefix))
    .reduce((s, t) => s + t.amount, 0);
  const reservesTotal = data.reserves.reduce((s, f) => s + reserveBalance(f, data.transactions), 0);
  return {
    hasBudget,
    availableToday,
    monthSpend,
    daysToSalary: daysUntilSalary(data.salaryDay, data.todayStr),
    reservesTotal,
    hasReserves: data.reserves.length > 0,
    nearest: nearestCommitment(data.recurring, now),
  };
}

// حالة الفتح الافتراضية لأقسام الخطة: نفتح ما يحتاج انتباهاً، وإلا الميزانية
// اليومية. تُستعمل فقط عند غياب تفضيلٍ محفوظٍ بالجهاز.
export function defaultPlanOpen(attention: { budgetAttention: boolean; negativeBalance: boolean }): Record<PlanSectionId, boolean> {
  const base: Record<PlanSectionId, boolean> = { daily: false, budgets: false, recurring: false, reserves: false };
  if (attention.budgetAttention) return { ...base, budgets: true };
  return { ...base, daily: true }; // يشمل حالة الرصيد السالب (القسم نفسه)
}

// أيّ قسمِ خطةٍ يخصّه رابطٌ عميق (‎#daily‎ …)؛ null لغير أقسام الخطة (مثل ‎#history‎
// الظاهر دائماً). يُستعمل لفتح القسم المطويّ قبل التمرير إليه.
export function planSectionFromHash(hash: string): PlanSectionId | null {
  return (PLAN_SECTIONS as readonly string[]).includes(hash) ? (hash as PlanSectionId) : null;
}

// شريحة «السجل» مع «إظهار المزيد»: أحدث أوّلاً (مُرتَّبة سلفاً)، وكم بقي.
export function historySlice<T>(sorted: T[], limit: number): { visible: T[]; hasMore: boolean; remaining: number } {
  const visible = sorted.slice(0, Math.max(0, limit));
  return { visible, hasMore: sorted.length > visible.length, remaining: sorted.length - visible.length };
}
