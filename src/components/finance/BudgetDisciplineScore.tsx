"use client";
import { useEffect, useState } from "react";
import type { Transaction, Budget, DailyBudget, FinanceCategoryDef } from "@/lib/types";
import { computeDailyBudgetStatus, formatAmount, toDateStr, getMainCategory, budgetLimit } from "@/lib/utils";

interface BudgetDisciplineScoreProps {
  transactions: Transaction[]; // all-time, for trend + daily budget calc
  monthTransactions: Transaction[]; // current filtered month only
  budgets: Budget[];
  categories: FinanceCategoryDef[];
  dailyBudget: DailyBudget | null;
  monthlyIncome: number | null;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// A spending-discipline score (0-100) built entirely from expense data —
// staying under category budgets, staying under the daily allowance, and
// spending less than last week.
export function BudgetDisciplineScore({ transactions, monthTransactions, budgets, categories, dailyBudget, monthlyIncome }: BudgetDisciplineScoreProps) {
  if (!transactions.length) return null;

  let budgetScore = 20; // neutral baseline when no budgets are set yet
  if (budgets.length) {
    const within = budgets.filter((b) => {
      // Budgets sit on main categories — sub-category spending counts too.
      const spent = monthTransactions
        .filter((t) => getMainCategory(categories, t.category).id === b.category)
        .reduce((s, t) => s + t.amount, 0);
      return spent <= budgetLimit(b, monthlyIncome);
    }).length;
    budgetScore = Math.round((within / budgets.length) * 40);
  }

  function sumInRange(startDaysAgo: number, endDaysAgo: number) {
    const end = new Date(); end.setDate(end.getDate() - startDaysAgo);
    const start = new Date(); start.setDate(start.getDate() - endDaysAgo);
    const startStr = toDateStr(start);
    const endStr = toDateStr(end);
    return transactions
      .filter((t) => t.date >= startStr && t.date <= endStr)
      .reduce((s, t) => s + t.amount, 0);
  }
  const thisWeek = sumInRange(0, 6);
  const lastWeek = sumInRange(7, 13);
  let trendScore = 15;
  if (lastWeek > 0) {
    if (thisWeek <= lastWeek * 0.9) trendScore = 30;
    else if (thisWeek <= lastWeek) trendScore = 20;
    else if (thisWeek <= lastWeek * 1.2) trendScore = 10;
    else trendScore = 0;
  }

  let dailyScore = 15; // neutral baseline when no daily budget is set
  let dailyRatioLabel = "—";
  if (dailyBudget) {
    const status = computeDailyBudgetStatus(dailyBudget, transactions);
    const ratio = status.spent / Math.max(1, status.allowance);
    if (ratio <= 0.8) dailyScore = 30;
    else if (ratio <= 1) dailyScore = 20;
    else if (ratio <= 1.2) dailyScore = 10;
    else dailyScore = 0;
    dailyRatioLabel = `${status.balance >= 0 ? "+" : "-"}${formatAmount(Math.abs(status.balance))}`;
  }

  const score = Math.max(0, Math.min(100, budgetScore + dailyScore + trendScore));
  const { label, color, bg, advice } = getInfo(score);

  // The three component sub-scores become concentric rings inside the orbit,
  // each filled to its own share of its max (budget/40, daily/30, trend/30) —
  // the same numbers the columns used to print, now drawn as line-work.
  const subs = [
    { key: "budget", label: "ضمن الميزانية", color: "#2f7a33", frac: budgetScore / 40,
      value: budgets.length ? `${Math.round((budgetScore / 40) * 100)}%` : "—" },
    { key: "daily", label: "الرصيد اليومي", color: "#3d9640", frac: dailyScore / 30,
      value: dailyRatioLabel },
    { key: "trend", label: "مقابل الأسبوع الماضي", color: "#64b767", frac: trendScore / 30,
      value: lastWeek > 0 ? `${thisWeek <= lastWeek ? "↓" : "↑"} ${Math.round(Math.abs((thisWeek - lastWeek) / lastWeek) * 100)}%` : "—" },
  ];

  return (
    <div className={`rounded-2xl p-4 ${bg} space-y-3`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500">انضباط الميزانية</p>
        <span className="font-bold text-sm" style={{ color }}>{label}</span>
      </div>

      <div className="flex items-center gap-4">
        <ScoreOrbit score={score} scoreColor={color} subs={subs} />
        <div className="flex-1 min-w-0 space-y-2.5">
          <p className="text-xs text-gray-600 leading-relaxed">{advice}</p>
          <div className="space-y-1.5">
            {subs.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1.5 text-gray-500 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="truncate">{s.label}</span>
                </span>
                <span className="font-bold text-gray-800 tabular-nums shrink-0">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————————————————————
// مدار الانضباط: قوسٌ ذهبي كبير يمتلئ إلى الدرجة، وثلاث حلقات خضراء متراكزة
// للمكوّنات الفرعية — بحدٍّ ذهبي رفيع كأخوات الأداة. الرقم في المركز يبقى ظاهراً.
const VB = 120;
const CENTER = VB / 2;
const MAIN_R = 54;
const SUB_R = [43, 34, 25];

function ring(r: number, frac: number) {
  const c = 2 * Math.PI * r;
  return { c, dash: Math.max(0, Math.min(1, frac)) * c };
}

function ScoreOrbit({
  score,
  scoreColor,
  subs,
}: {
  score: number;
  scoreColor: string;
  subs: { key: string; color: string; frac: number }[];
}) {
  const reduce = prefersReducedMotion();
  const [on, setOn] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [reduce]);

  const main = ring(MAIN_R, score / 100);
  const tipAngle = ((on ? score / 100 : 0) * 360 - 90) * (Math.PI / 180);
  const tipX = CENTER + MAIN_R * Math.cos(tipAngle);
  const tipY = CENTER + MAIN_R * Math.sin(tipAngle);
  const dashTrans = reduce ? undefined : { transition: "stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)" };

  return (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
      <svg viewBox={`0 0 ${VB} ${VB}`} width={132} height={132}>
        <defs>
          <linearGradient id="disciplineGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8b15a" />
            <stop offset="100%" stopColor="#c1663f" />
          </linearGradient>
        </defs>
        <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
          {/* main score arc (gold) */}
          <circle cx={CENTER} cy={CENTER} r={MAIN_R} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={5} />
          <circle
            cx={CENTER} cy={CENTER} r={MAIN_R} fill="none"
            stroke="url(#disciplineGold)" strokeWidth={5} strokeLinecap="round"
            strokeDasharray={`${on ? main.dash : 0} ${main.c}`}
            style={dashTrans}
          />
          {/* three concentric sub-rings */}
          {subs.map((s, i) => {
            const rr = SUB_R[i];
            const { c, dash } = ring(rr, s.frac);
            return (
              <g key={s.key}>
                <circle cx={CENTER} cy={CENTER} r={rr} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={3.5} />
                <circle
                  cx={CENTER} cy={CENTER} r={rr} fill="none"
                  stroke={s.color} strokeWidth={3.5} strokeLinecap="round"
                  strokeDasharray={`${on ? dash : 0} ${c}`}
                  style={dashTrans}
                />
              </g>
            );
          })}
        </g>
        {/* orbiting tip on the main arc */}
        <circle
          cx={tipX} cy={tipY} r={3.4} fill="#e8b15a" stroke="#fff" strokeWidth={1.4}
          style={reduce ? undefined : { transition: "cx 1.2s cubic-bezier(0.16,1,0.3,1), cy 1.2s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black leading-none" style={{ color: scoreColor }}>{score}</span>
        <span className="text-[9px] text-gray-400 mt-1">من ١٠٠</span>
      </div>
    </div>
  );
}

function getInfo(score: number) {
  if (score >= 80) return { label: "ممتاز 🌟", color: "#3d9640", bg: "bg-green-50", advice: "انضباط رائع في مصاريفك، استمر!" };
  if (score >= 65) return { label: "جيد جداً", color: "#4a9fbd", bg: "bg-blue-50", advice: "أداء جيد، حافظ على وتيرتك." };
  if (score >= 50) return { label: "متوسط", color: "#d4a017", bg: "bg-yellow-50", advice: "راقب مصاريف الكماليات أكثر شوي." };
  if (score >= 35) return { label: "يحتاج تحسين", color: "#e07b39", bg: "bg-orange-50", advice: "مصاريفك تتسارع، راجع التصنيفات الكبيرة." };
  return { label: "خطر", color: "#e05555", bg: "bg-red-50", advice: "راجع ميزانياتك — الصرف يتجاوز الحدود." };
}
