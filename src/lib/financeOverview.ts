// «نظرة اليوم» في صفحة الأموال: تجميعٌ عرضيٌّ فقط لأهمّ الأرقام، يعيد استعمال
// دوالّ الحساب القائمة (computeDailyBudgetStatus / reserveBalance / nextDueDate /
// budgetLimit) دون أيّ معادلةٍ جديدة أو تغييرٍ في البيانات. منطقٌ نقيٌّ قابل
// للاختبار حتى تبقى الصفحة رقيقةً.
import type {
  DailyBudget, Transaction, ReserveFund, RecurringTransaction, Budget, FinanceCategoryDef,
  InstallmentPlan,
} from "./types";
import { computeDailyBudgetStatus, reserveBalance, nextDueDate, parseDate, toDateStr, cashOut } from "./utils";
import { SURPLUS_FUND_NAME } from "./types";
import { installmentsOverview, type InstallmentsOverview } from "./installments";
import { budgetStatuses } from "./budgetStatus";

export interface NearestCommitment {
  id: string;
  note: string;
  category: string;
  amount: number;
  due: string; // YYYY-MM-DD
  daysUntil: number;
  // من أين جاء الالتزام: قاعدةٌ متكرّرة أم قسطٌ في خطة — فتنقل البطاقة إلى قسمه.
  kind: "recurring" | "installment";
  planId?: string;
}

export interface FinanceOverview {
  hasBudget: boolean;
  availableToday: number; // ذو معنى فقط عند hasBudget
  monthSpend: number; // مجموع صرف الشهر (إجماليّ، للعرض)
  daysToSalary: number;
  reservesTotal: number;
  hasReserves: boolean;
  nearest: NearestCommitment | null;
  installments: InstallmentsOverview;
}

// أقسام «الخطة المالية» القابلة للطيّ (مصادر الروابط العميقة أيضاً).
// «الأقساط» بعد «المتكررة» وقبل «الاحتياطيات» — ترتيبٌ يقرأ من الالتزام الثابت
// إلى الالتزام المؤقّت ثمّ إلى ما جُنِّب.
export const PLAN_SECTIONS = ["daily", "budgets", "recurring", "installments", "assets", "reserves"] as const;
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

// أقرب التزامٍ قادم — متكرّرٌ **أو** قسطٌ من خطة، في بطاقةٍ واحدة (لا بطاقة أقساط
// دائمة في واجهة اليوم). منعُ التكرار مقصود: خطةٌ لها تذكيرٌ متكرّر (recurringId)
// تظهر مرّةً واحدة — نُسقِط قاعدة التذكير ونُبقي القسط نفسه، وإلا رأى المالك
// الالتزام مرّتين بنفس المبلغ والموعد.
export function nearestCommitment(
  recurring: RecurringTransaction[],
  now: Date,
  extra?: { plans?: InstallmentPlan[]; transactions?: Transaction[] }
): NearestCommitment | null {
  const todayStr = toDateStr(now);
  const plans = extra?.plans ?? [];
  const transactions = extra?.transactions ?? [];
  const startOfToday = new Date(now.toDateString()).getTime();
  const daysFrom = (t: number) => Math.max(0, Math.round((t - startOfToday) / 86400000));

  const candidates: NearestCommitment[] = [];

  // معرّفات قواعد التذكير التي تخصّ خططاً — تُستبعد فلا يُحتسب الالتزام مرّتين.
  const planReminderIds = new Set(
    plans.filter((p) => p.status === "active" && p.recurringId).map((p) => p.recurringId as string)
  );
  for (const r of recurring) {
    if (!r.active || planReminderIds.has(r.id) || r.planId) continue;
    const due = nextDueDate(r, now);
    candidates.push({
      id: r.id, note: r.note, category: r.category, amount: r.amount,
      due: toDateStr(due), daysUntil: daysFrom(due.getTime()), kind: "recurring",
    });
  }

  const inst = installmentsOverview(plans, transactions, todayStr);
  if (inst.next) {
    const { plan, row } = inst.next;
    candidates.push({
      id: `plan:${plan.id}:${row.no}`,
      note: plan.name || plan.provider,
      category: plan.category ?? "",
      amount: row.amount,
      due: row.due,
      daysUntil: daysFrom(parseDate(row.due).getTime()),
      kind: "installment",
      planId: plan.id,
    });
  }

  if (!candidates.length) return null;
  // الأقرب موعداً؛ وعند التساوي يتقدّم القسط (موعده مُلزَم بجهةٍ خارجية).
  return candidates.sort(
    (a, b) => a.due.localeCompare(b.due) || (a.kind === b.kind ? 0 : a.kind === "installment" ? -1 : 1)
  )[0];
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
  recurring: RecurringTransaction[];
  installmentPlans?: InstallmentPlan[];
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
  // صرف الشهر = ما خرج فعلاً (المؤجّل التزامٌ لا صرف — راجع cashOut).
  const monthSpend = data.transactions
    .filter((t) => t.date.startsWith(data.monthPrefix))
    .reduce((s, t) => s + cashOut(t), 0);
  const reservesTotal = data.reserves.reduce((s, f) => s + reserveBalance(f, data.transactions), 0);
  const plans = data.installmentPlans ?? [];
  return {
    hasBudget,
    availableToday,
    monthSpend,
    daysToSalary: daysUntilSalary(data.salaryDay, data.todayStr),
    reservesTotal,
    hasReserves: data.reserves.length > 0,
    nearest: nearestCommitment(data.recurring, now, { plans, transactions: data.transactions }),
    installments: installmentsOverview(plans, data.transactions, data.todayStr),
  };
}

// حالة الفتح الافتراضية لأقسام الخطة: نفتح ما يحتاج انتباهاً، وإلا الميزانية
// اليومية. تُستعمل فقط عند غياب تفضيلٍ محفوظٍ بالجهاز.
export function defaultPlanOpen(attention: {
  budgetAttention: boolean;
  negativeBalance: boolean;
  installmentOverdue?: boolean;
}): Record<PlanSectionId, boolean> {
  const base: Record<PlanSectionId, boolean> = {
    daily: false, budgets: false, recurring: false, installments: false, assets: false, reserves: false,
  };
  // قسطٌ فائت أعجل من سقفٍ مُتجاوَز: له جهةٌ خارجية تطالب به.
  if (attention.installmentOverdue) return { ...base, installments: true };
  if (attention.budgetAttention) return { ...base, budgets: true };
  return { ...base, daily: true }; // يشمل حالة الرصيد السالب (القسم نفسه)
}

// أيّ قسمِ خطةٍ يخصّه رابطٌ عميق (‎#daily‎ …)؛ null لغير أقسام الخطة (مثل ‎#history‎
// الظاهر دائماً). يُستعمل لفتح القسم المطويّ قبل التمرير إليه.
export function planSectionFromHash(hash: string): PlanSectionId | null {
  return (PLAN_SECTIONS as readonly string[]).includes(hash) ? (hash as PlanSectionId) : null;
}

// أكبر مصروفٍ **نقديّ** واحد في مجموعة — يقارن بـ`cashOut` فيستبعد المؤجّل تماماً
// (أصلُ خطةٍ بـ1200 لم يخرج من الحساب، فلا يصحّ أن يُسمّى «أكبر مصروف» ولا أن
// يُقاس بربع الصرف). يرجع null إن لم يكن في المجموعة صرفٌ نقديّ أصلاً. نقيٌّ
// ومختبَر، تستعمله صفحة «متابعة الصرف» بدل ترتيبٍ خامٍ على `amount`.
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
