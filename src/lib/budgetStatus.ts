// ===================== حالة سقوف التصنيفات — المصدر الوحيد =====================
// سؤالٌ واحد: «كم صُرف من سقف هذا القسم **داخل نافذة الحساب**؟» — كان يُجاب في
// أربعة أماكن بأربع نسخ (BudgetTracker · budgetAlerts · budgetWarningFor ·
// بوصلة مدار)، فانحرفت البوصلة وحدها إلى الشهر الميلادي بينما بقيت بقيّة
// الواجهة على دورة الراتب: صفحة الأموال تقول «ضمن السقوف» والبوصلة تقول «وصلت
// 97% من سقف أساسيات» — لأنها كانت تجمع صرف الدورة المنتهية كلّها. الحساب هنا
// مرّةً واحدة وكلّ واجهةٍ تقرأ منه، فلا يمكن أن تتناقض شاشتان بعد اليوم.
// منطقٌ نقيّ بلا DOM ولا حالة، مختبَرٌ في `budgetStatus.test.ts`.
import type { Budget, Transaction, FinanceCategoryDef } from "./types";
import { budgetLimit, budgetSpend, getMainCategory, formatDate, today } from "./utils";
import { inSpendWindow, cycleDays } from "./budgetCycle";

// عتبة «اقتربت من السقف» — رقمٌ واحد لكل الواجهة (البوصلة، الشارة، التنبيه
// الحيّ عند حفظ مصروف)، فلا تحذّر شاشةٌ عند 80% وأخرى عند 85%.
export const BUDGET_NEAR_PCT = 80;

export interface BudgetStatus {
  category: string; // معرّف التصنيف الرئيسي
  label: string;
  cap: number;
  spent: number;
  remaining: number; // قد يكون سالباً عند التجاوز
  pct: number; // مئويّة غير مقرّبة
  state: "ok" | "near" | "over";
}

// حالة كل سقفٍ له حدٌّ فعّال داخل النافذة (`YYYY-MM` شهرٌ ميلادي، أو
// `YYYY-MM-DD` بدايةُ دورة راتب — راجع `budgetCycle.ts`). السقوف بلا حدٍّ
// (نسبةٌ بلا دخل) تُسقَط، كما كان في كل النسخ السابقة.
export function budgetStatuses(
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null,
  windowStart: string
): BudgetStatus[] {
  const out: BudgetStatus[] = [];
  for (const b of budgets) {
    const cap = budgetLimit(b, monthlyIncome);
    if (!cap) continue;
    // السقف على قسمٍ رئيسي، وصرف أقسامه الفرعية يستهلكه. والمؤجّل والموسوم
    // «خارج الميزانيات» صفرٌ هنا (`budgetSpend`) — لم يخرج من ميزانية الدورة.
    const spent = transactions
      .filter((t) => getMainCategory(categories, t.category).id === b.category && inSpendWindow(t.date, windowStart))
      .reduce((s, t) => s + budgetSpend(t), 0);
    const pct = (spent / cap) * 100;
    out.push({
      category: b.category,
      label: categories.find((c) => c.id === b.category)?.label ?? "قسم",
      cap,
      spent,
      remaining: cap - spent,
      pct,
      state: spent > cap ? "over" : pct >= BUDGET_NEAR_PCT ? "near" : "ok",
    });
  }
  return out;
}

// حالة سقفِ تصنيفٍ بعينه (يصعد لقسمه الرئيسي) — null إن لم يكن له سقفٌ فعّال.
export function budgetStatusFor(
  categoryId: string,
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null,
  windowStart: string
): BudgetStatus | null {
  const mainId = getMainCategory(categories, categoryId).id;
  const b = budgets.find((x) => x.category === mainId);
  if (!b) return null;
  return budgetStatuses([b], transactions, categories, monthlyIncome, windowStart)[0] ?? null;
}

// التنبيه الحيّ لحظة حفظ مصروف: يظهر فقط عند بلوغ العتبة. غلافٌ رقيق على
// `budgetStatusFor` — كان نسخةً ثانيةً من الحساب في `utils.ts`.
export function budgetWarningFor(
  categoryId: string,
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null,
  windowStart?: string
): { label: string; over: boolean; pct: number; remaining: number } | null {
  const st = budgetStatusFor(
    categoryId, budgets, transactions, categories, monthlyIncome,
    windowStart || today().slice(0, 7)
  );
  if (!st || st.state === "ok") return null;
  return { label: st.label, over: st.state === "over", pct: Math.round(st.pct), remaining: st.remaining };
}

// جملةُ السند التي تُذكر مع كل رقمِ سقف: **على أيّ مدىً حُسب هذا الرقم**. تظهر
// في بوصلة مدار تحت التحذير، فلا يبقى الرقم مجهول المصدر — ولو انحرفت نافذةٌ
// يوماً لانكشف الانحراف من السطر نفسه بدل أن يُقرأ التحذير على أنه إشعارٌ قديم.
export function describeSpendWindow(windowStart: string, todayStr: string): string {
  if (windowStart.length === 7) {
    return `الحساب على الشهر الميلادي — اليوم ${Number(todayStr.slice(8))} من الشهر.`;
  }
  return `الحساب من نزول الراتب (${formatDate(windowStart)}) — اليوم ${cycleDays(windowStart, todayStr)} من الدورة.`;
}
