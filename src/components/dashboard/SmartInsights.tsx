"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { generateInsights } from "@/lib/insights";
import { Sparkles, ChevronDown, ChevronUp } from "lucide-react";

const TONE_STYLES = {
  positive: "bg-finance/10 text-finance",
  warning: "bg-red-500/10 text-red-600 dark:text-red-300",
  tip: "bg-journal/10 text-journal",
};

export function SmartInsights() {
  const {
    transactions, journalEntries, readingLogs, books, habits,
    budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters,
  } = useAppStore();
  const [expanded, setExpanded] = useState(false);

  const insights = useMemo(() => {
    // التوصيات إضافة تحسينية — أي خلل فيها يجب ألا يسقط الصفحة كلها.
    try {
      return generateInsights({
        transactions: transactions ?? [],
        journalEntries: journalEntries ?? [],
        readingLogs: readingLogs ?? [],
        books: books ?? [],
        habits: habits ?? [],
        budgets: budgets ?? [],
        categories: categories ?? [],
        reserves: reserves ?? [],
        prayerLogs: prayerLogs ?? [],
        dailyBudget: dailyBudget ?? null,
        monthlyIncome: monthlyIncome ?? null,
        futureLetters: futureLetters ?? [],
        lastBackup: typeof window !== "undefined" ? localStorage.getItem("madar-last-backup") : null,
      });
    } catch {
      return [];
    }
  }, [transactions, journalEntries, readingLogs, books, habits, budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters]);

  if (!insights.length) return null;

  const shown = expanded ? insights : insights.slice(0, 3);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-brand-500" />
          <span className="text-sm font-bold text-gray-800">توصيات ذكية لك</span>
        </div>
        <span className="text-[10px] text-gray-300">تُحسب محلياً من بياناتك</span>
      </div>

      <div className="space-y-2">
        {shown.map((ins, i) => {
          const cls = `flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${TONE_STYLES[ins.tone]}`;
          const body = (
            <>
              <span className="text-base shrink-0">{ins.icon}</span>
              <p className="text-xs leading-relaxed font-medium">{ins.text}</p>
            </>
          );
          // تذكير النسخة الاحتياطية قابل للنقر — يأخذك مباشرةً لصفحة الإعدادات
          // حيث بطاقة النسخ الاحتياطي (BackupCard). بقية التوصيات تبقى كما هي.
          if (ins.text.includes("نسخة احتياطية")) {
            return (
              <Link
                key={i}
                href="/settings"
                aria-label="اذهب إلى الإعدادات لأخذ نسخة احتياطية من بياناتك"
                className={`${cls} press hover:brightness-95 transition`}
              >
                {body}
              </Link>
            );
          }
          return (
            <div key={i} className={cls}>
              {body}
            </div>
          );
        })}
      </div>

      {insights.length > 3 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-600 py-1 press"
        >
          {expanded ? (
            <>عرض أقل <ChevronUp size={13} /></>
          ) : (
            <>+{insights.length - 3} توصيات أخرى <ChevronDown size={13} /></>
          )}
        </button>
      )}
    </div>
  );
}
