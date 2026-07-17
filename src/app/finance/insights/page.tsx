"use client";
import { useMemo, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import {
  today,
  toDateStr,
  parseDate,
  formatAmount,
  getMainCategory,
  getSubCategories,
  computeDailyBudgetStatus,
  dailyShare,
  reserveShare,
  arabicMonthName,
  cn,
} from "@/lib/utils";
import type { Transaction } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { SpendingPatternCard } from "@/components/finance/SpendingPatternCard";
import { FinancePace } from "@/components/finance/FinancePace";
import { BudgetDisciplineScore } from "@/components/finance/BudgetDisciplineScore";
import dynamic from "next/dynamic";
// recharts (~90KB) loads on demand so the insights shell paints without
// waiting on it. The placeholder keeps the card height stable.
const InsightsChart = dynamic(
  () => import("@/components/finance/InsightsChart").then((m) => m.InsightsChart),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gray-100 rounded-xl" /> }
);
import { TrendingDown, TrendingUp, ChevronDown, Sparkles } from "lucide-react";

type Period = "أسبوع" | "شهر" | "سنة";

const DAY_NAMES = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

function addDays(dateStr: string, n: number) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// The date range for the selected period plus the matching previous range
// (same length) — the previous range is what the "vs" comparison uses.
function periodRanges(period: Period, todayStr: string) {
  if (period === "أسبوع") {
    const start = addDays(todayStr, -6);
    return {
      start, end: todayStr,
      prevStart: addDays(todayStr, -13), prevEnd: addDays(todayStr, -7),
      label: "آخر ٧ أيام", prevLabel: "الأسبوع اللي قبله",
    };
  }
  if (period === "شهر") {
    const d = parseDate(todayStr);
    const start = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const dayCount = d.getDate();
    const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevStart = toDateStr(prevMonth);
    const lastDayPrev = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    const prevEnd = toDateStr(new Date(prevMonth.getFullYear(), prevMonth.getMonth(), Math.min(dayCount, lastDayPrev)));
    return {
      start, end: todayStr,
      prevStart, prevEnd,
      label: `${arabicMonthName(d.getMonth())} (حتى اليوم)`, prevLabel: "نفس الفترة من الشهر الماضي",
    };
  }
  const d = parseDate(todayStr);
  const start = toDateStr(new Date(d.getFullYear(), 0, 1));
  const prevStart = toDateStr(new Date(d.getFullYear() - 1, 0, 1));
  const prevEnd = toDateStr(new Date(d.getFullYear() - 1, d.getMonth(), d.getDate()));
  return {
    start, end: todayStr,
    prevStart, prevEnd,
    label: `سنة ${d.getFullYear()} (حتى اليوم)`, prevLabel: "نفس الفترة من السنة الماضية",
  };
}

const inRange = (t: Transaction, start: string, end: string) => t.date >= start && t.date <= end;

// عنوانٌ خفيفٌ يجمّع البطاقات بصريًّا (نفس نمط صفحة المصاريف: «يومياتك»/«سجلّك») —
// مسمّى مكتوم صغير مع خيطٍ ذهبيٍّ باهت، ليفصل قسم «هذا الشهر» عمّا فوقه من الفترة.
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-2 -mb-1">
      <h2 className="shrink-0 text-xs font-semibold tracking-wide text-gray-400">{children}</h2>
      <span className="h-px flex-1 bg-brand-500/25" aria-hidden />
    </div>
  );
}

export default function SpendInsightsPage() {
  const { transactions, categories, reserves, dailyBudget, budgets, monthlyIncome } = useAppStore();
  const [period, setPeriod] = useState<Period>("أسبوع");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const todayStr = today();
  const ranges = periodRanges(period, todayStr);

  // The essential/luxury gauge, budget-pace and discipline cards below are
  // inherently about the CURRENT calendar month (their "days left"/"this month
  // vs last" language), so they read the month directly rather than the page's
  // period toggle — same data & math they used on /finance, just relocated here.
  const currentMonth = todayStr.slice(0, 7);
  const monthTx = useMemo(
    () => transactions.filter((t) => t.date.startsWith(currentMonth)),
    [transactions, currentMonth]
  );

  const periodTx = transactions.filter((t) => inRange(t, ranges.start, ranges.end));
  const prevTx = transactions.filter((t) => inRange(t, ranges.prevStart, ranges.prevEnd));

  const total = periodTx.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevTx.reduce((s, t) => s + t.amount, 0);
  const deltaPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const daysInPeriod =
    Math.round((parseDate(ranges.end).getTime() - parseDate(ranges.start).getTime()) / 86400000) + 1;
  const avgPerDay = total / Math.max(1, daysInPeriod);

  // ---------- Time-series bars ----------
  // value = full spend (what actually left your pocket); daily = the
  // daily-budget share only — that's what the over-budget red compares,
  // matching the daily budget's own rule (reserve shares don't count).
  const chartData = useMemo(() => {
    const byKey = new Map<string, number>();
    const dailyByKey = new Map<string, number>();
    for (const t of periodTx) {
      const key = period === "سنة" ? t.date.slice(0, 7) : t.date;
      byKey.set(key, (byKey.get(key) ?? 0) + t.amount);
      dailyByKey.set(key, (dailyByKey.get(key) ?? 0) + dailyShare(t));
    }
    if (period === "سنة") {
      const year = parseDate(todayStr).getFullYear();
      const currentMonth = parseDate(todayStr).getMonth();
      return Array.from({ length: currentMonth + 1 }, (_, m) => {
        const key = `${year}-${String(m + 1).padStart(2, "0")}`;
        return { key, label: arabicMonthName(m).slice(0, 3), value: byKey.get(key) ?? 0, daily: dailyByKey.get(key) ?? 0, isNow: m === currentMonth };
      });
    }
    const days: { key: string; label: string; value: number; daily: number; isNow: boolean }[] = [];
    let cursor = ranges.start;
    while (cursor <= ranges.end) {
      const d = parseDate(cursor);
      days.push({
        key: cursor,
        label: period === "أسبوع" ? DAY_NAMES[d.getDay()] : String(d.getDate()),
        value: byKey.get(cursor) ?? 0,
        daily: dailyByKey.get(cursor) ?? 0,
        isNow: cursor === todayStr,
      });
      cursor = addDays(cursor, 1);
    }
    return days;
  }, [periodTx, period, ranges.start, ranges.end, todayStr]);

  const maxBar = Math.max(...chartData.map((d) => d.value), 1);

  // ---------- Category rollup (main → subs) ----------
  const byMain = useMemo(() => {
    const map = new Map<string, { total: number; bySub: Map<string, number> }>();
    for (const t of periodTx) {
      const main = getMainCategory(categories, t.category);
      const entry = map.get(main.id) ?? { total: 0, bySub: new Map() };
      entry.total += t.amount;
      entry.bySub.set(t.category, (entry.bySub.get(t.category) ?? 0) + t.amount);
      map.set(main.id, entry);
    }
    return [...map.entries()]
      .map(([id, v]) => ({ main: getMainCategory(categories, id), ...v }))
      .sort((a, b) => b.total - a.total);
  }, [periodTx, categories]);

  // ---------- Automated insights ----------
  const insights = useMemo(() => {
    const list: string[] = [];
    if (!periodTx.length) return list;

    // ملاحظة: نسبة «مقابل الفترة السابقة» تظهر أصلاً في شارة البطل أعلى الصفحة
    // (وفي صف «مقابل الأسبوع الماضي» ضمن بطاقة الانضباط)، فلا نكرّرها هنا نصًّا.

    const topDay = [...chartData].sort((a, b) => b.value - a.value)[0];
    if (topDay && topDay.value > 0) {
      list.push(
        period === "سنة"
          ? `📅 أعلى شهر صرفاً: ${topDay.label} بـ ${formatAmount(topDay.value)} ر.س.`
          : `📅 أعلى يوم صرفاً: ${topDay.label} بـ ${formatAmount(topDay.value)} ر.س.`
      );
    }

    if (byMain[0]) {
      const share = Math.round((byMain[0].total / total) * 100);
      list.push(`${byMain[0].main.icon} «${byMain[0].main.label}» ياخذ ${share}٪ من صرفك (${formatAmount(byMain[0].total)} ر.س).`);
    }

    if (dailyBudget && period !== "سنة") {
      const daysOver = chartData.filter((d) => d.daily > dailyBudget.amount).length;
      const daysTracked = chartData.filter((d) => d.key <= todayStr).length;
      list.push(
        daysOver === 0
          ? `🟢 كل أيام الفترة ضمن ميزانيتك اليومية (${formatAmount(dailyBudget.amount)} ر.س) — ممتاز!`
          : `🔴 ${daysOver} من ${daysTracked} يوم تجاوزت فيها ميزانيتك اليومية.`
      );
    }

    const reserveTotal = periodTx.reduce(
      (s, t) => s + reserves.reduce((ss, f) => ss + reserveShare(t, f.id), 0),
      0
    );
    if (reserveTotal > 0) {
      list.push(`🪺 ${formatAmount(reserveTotal)} ر.س من صرف الفترة تحمّلها الاحتياطي بدل اليومية.`);
    }

    const biggest = [...periodTx].sort((a, b) => b.amount - a.amount)[0];
    if (biggest && total > 0 && biggest.amount / total > 0.25) {
      list.push(`💸 أكبر مصروف واحد (${biggest.note || getMainCategory(categories, biggest.category).label}) = ${formatAmount(biggest.amount)} ر.س — ربع صرفك أو أكثر.`);
    }

    // Month-end projection: current daily pace extended over the full month.
    if (period === "شهر" && total > 0) {
      const d = parseDate(todayStr);
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      if (d.getDate() >= 3 && d.getDate() < daysInMonth) {
        const projected = (total / d.getDate()) * daysInMonth;
        list.push(`📈 على وتيرتك الحالية، متوقع تصرف ${formatAmount(Math.round(projected))} ر.س بنهاية الشهر.`);
      }
    }

    return list;
  }, [periodTx, chartData, byMain, total, deltaPct, dailyBudget, reserves, categories, period, ranges.prevLabel, todayStr]);

  const dailyStatus = dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null;
  const spentFromDaily = periodTx.reduce((s, t) => s + dailyShare(t), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-gray-900">متابعة الصرف</h1>
        <p className="text-sm text-gray-400 mt-0.5">{ranges.label}</p>
      </div>

      {/* Period segmented control */}
      <div className="flex bg-gray-100 dark:bg-[#2c2318] rounded-xl p-1 animate-fade-up stagger-1">
        {(["أسبوع", "شهر", "سنة"] as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => { setPeriod(p); setExpandedCat(null); }}
            className={cn(
              "flex-1 text-sm font-semibold py-2 rounded-lg transition-all",
              period === p ? "bg-white dark:bg-[#241c12] text-finance shadow-sm" : "text-gray-400"
            )}
          >
            {p === "أسبوع" ? "أسبوعي" : p === "شهر" ? "شهري" : "سنوي"}
          </button>
        ))}
      </div>

      {/* Hero total + delta */}
      <div className="rounded-2xl p-5 text-white bg-gradient-to-br from-[#1d5c20] via-[#2d7a30] to-[#3d9640] card-shadow animate-fade-up stagger-2">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs opacity-80">إجمالي الصرف</p>
            <div className="text-4xl font-bold tabular-nums mt-1 flex items-baseline gap-1.5">
              <AnimatedNumber value={Math.round(total)} />
              <span className="text-sm font-normal opacity-80">ر.س</span>
            </div>
            <p className="text-[11px] opacity-70 mt-1">متوسط {formatAmount(Math.round(avgPerDay))} ر.س/يوم</p>
          </div>
          {deltaPct !== null && (
            <div
              className={cn(
                "flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-bold",
                deltaPct <= 0 ? "bg-white/20" : "bg-red-900/40"
              )}
            >
              {deltaPct <= 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
              {Math.abs(deltaPct)}٪
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {dailyStatus && (
            <span className="text-[10px] bg-white/15 rounded-full px-2 py-1">
              رصيدك اليومي المتراكم: {dailyStatus.balance >= 0 ? "+" : "-"}{formatAmount(Math.abs(dailyStatus.balance))} ر.س
            </span>
          )}
          {spentFromDaily !== total && (
            <span className="text-[10px] bg-white/15 rounded-full px-2 py-1">
              من اليومية: {formatAmount(spentFromDaily)} ر.س
            </span>
          )}
        </div>
      </div>

      {/* Time-series bars */}
      <Card className="animate-fade-up stagger-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">
            {period === "سنة" ? "الصرف شهراً بشهر" : "الصرف يوماً بيوم"}
          </span>
          {dailyBudget && period !== "سنة" && (
            <span className="text-[10px] text-gray-400">— خط ميزانيتك اليومية</span>
          )}
        </div>
        <div className="h-44" dir="ltr">
          <InsightsChart
            data={chartData}
            period={period}
            maxBar={maxBar}
            dailyBudgetAmount={dailyBudget && period !== "سنة" ? dailyBudget.amount : undefined}
            format={formatAmount}
          />
        </div>
        {dailyBudget && period !== "سنة" && (
          <div className="flex items-center justify-center gap-3 text-[10px] text-gray-400 pt-2">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-finance inline-block" /> ضمن اليومية</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /> تجاوز ({formatAmount(dailyBudget.amount)} ر.س)</span>
          </div>
        )}
      </Card>

      {/* Category breakdown with sub drill-down */}
      <Card className="animate-fade-up stagger-4">
        <span className="text-sm font-semibold text-gray-700 block mb-3">أين راح صرفك؟</span>
        {byMain.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">لا مصاريف في هذه الفترة</p>
        ) : (
          <div className="space-y-2.5">
            {byMain.map(({ main, total: catTotal, bySub }) => {
              const pct = Math.round((catTotal / total) * 100);
              const subs = [...bySub.entries()]
                .map(([id, amt]) => ({
                  info: categories.find((c) => c.id === id),
                  isMainItself: id === main.id,
                  amt,
                }))
                .sort((a, b) => b.amt - a.amt);
              const hasSubDetail = subs.length > 1 || (subs.length === 1 && !subs[0].isMainItself);
              const expanded = expandedCat === main.id;
              return (
                <div key={main.id}>
                  <button
                    onClick={() => hasSubDetail && setExpandedCat(expanded ? null : main.id)}
                    className={cn("w-full text-right", !hasSubDetail && "cursor-default")}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ backgroundColor: main.color + "1a" }}
                      >
                        {main.icon}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-gray-700 truncate">{main.label}</span>
                          <span className="text-xs font-bold text-gray-800 tabular-nums shrink-0">
                            {formatAmount(catTotal)} <span className="font-normal text-gray-400">ر.س · {pct}٪</span>
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-[#382c1d] rounded-full overflow-hidden mt-1">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${pct}%`, backgroundColor: main.color }}
                          />
                        </div>
                      </div>
                      {hasSubDetail && (
                        <ChevronDown size={14} className={cn("text-gray-300 shrink-0 transition-transform", expanded && "rotate-180")} />
                      )}
                    </div>
                  </button>

                  {expanded && (
                    <div className="mt-1.5 mr-10 space-y-1 animate-fade-up">
                      {subs.map(({ info, isMainItself, amt }) => (
                        <div key={info?.id ?? "unknown"} className="flex items-center justify-between text-[11px] bg-gray-50 dark:bg-[#2c2318] rounded-lg px-2.5 py-1.5">
                          <span className="text-gray-500">
                            {isMainItself ? "（عام）" : `${info?.icon ?? "📌"} ${info?.label ?? "غير مصنف"}`}
                          </span>
                          <span className="font-bold text-gray-700 tabular-nums">
                            {formatAmount(amt)} ر.س
                            <span className="font-normal text-gray-400"> · {Math.round((amt / catTotal) * 100)}٪</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Automated analysis — يتبع مبدّل الفترة (أسبوعي/شهري/سنوي)، فيبقى ضمن
          القسم العلوي فوق عنوان «هذا الشهر» حتى لا يختلط الأسبوعي بالشهري */}
      {insights.length > 0 && (
        <Card className="animate-fade-up stagger-5">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles size={15} className="text-brand-500" />
            <span className="text-sm font-semibold text-gray-700">تحليل تلقائي</span>
          </div>
          <div className="space-y-2">
            {insights.map((line, i) => (
              <p key={i} className="text-xs text-gray-600 leading-relaxed bg-gray-50 dark:bg-[#2c2318] rounded-xl px-3 py-2">
                {line}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* حدٌّ صريح: كل ما تحت هذا العنوان يخصّ الشهر الحالي ومستقلٌّ عن مبدّل
          الفترة أعلاه — بطاقاتٌ شهريّة نُقلت من صفحة المصاريف ليجتمع التحليل هنا */}
      <GroupLabel>نظرة على هذا الشهر</GroupLabel>

      {/* نمط الصرف — الأساسي مقابل الكمالي لهذا الشهر (مقياس تفاعلي) */}
      <Card className="animate-fade-up stagger-4">
        <SpendingPatternCard transactions={transactions} categories={categories} monthFilter={currentMonth} />
      </Card>

      {/* وتيرة الصرف مقابل ميزانيات التصنيفات + درجة الانضباط — تحليلٌ للشهر
          الحالي، بلا بطاقة (كلٌّ يرسم إطاره)، فيختفيان بلا فجوة عند غياب بياناتهما */}
      <FinancePace budgets={budgets} monthTransactions={monthTx} categories={categories} monthlyIncome={monthlyIncome} />

      <BudgetDisciplineScore
        transactions={transactions}
        monthTransactions={monthTx}
        budgets={budgets}
        categories={categories}
        dailyBudget={dailyBudget}
        monthlyIncome={monthlyIncome}
      />
    </div>
  );
}
