"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store";
import { generateInsights, type Insight, type InsightTone, type SnoozeOption } from "@/lib/insights";
import {
  filterInsights, loadPrefs, snoozeInsight, dismissInsight, type InsightPrefs,
} from "@/lib/insightPrefs";
import { today } from "@/lib/utils";
import { Compass, X, Clock, ChevronLeft } from "lucide-react";

const TONE: Record<InsightTone, string> = {
  action: "text-quran",
  positive: "text-finance",
  warning: "text-red-600 dark:text-red-300",
  tip: "text-journal",
};
const TONE_SOFT: Record<InsightTone, string> = {
  action: "bg-quran/10",
  positive: "bg-finance/10",
  warning: "bg-red-500/10",
  tip: "bg-journal/10",
};
const SNOOZE_LABEL: Record<SnoozeOption, string> = { today: "اليوم", tomorrow: "غداً", week: "أسبوع" };

export function SmartInsights() {
  const {
    transactions, journalEntries, readingLogs, books, habits,
    budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters,
    quranHifz, quranKhatma,
  } = useAppStore();
  const [prefs, setPrefs] = useState<InsightPrefs>({});
  useEffect(() => { setPrefs(loadPrefs()); }, []);

  const all = useMemo(() => {
    // التوصيات إضافة تحسينية — أي خلل فيها يجب ألا يسقط الصفحة كلها.
    try {
      return generateInsights({
        transactions: transactions ?? [], journalEntries: journalEntries ?? [],
        readingLogs: readingLogs ?? [], books: books ?? [], habits: habits ?? [],
        budgets: budgets ?? [], categories: categories ?? [], reserves: reserves ?? [],
        prayerLogs: prayerLogs ?? [], dailyBudget: dailyBudget ?? null, monthlyIncome: monthlyIncome ?? null,
        futureLetters: futureLetters ?? [], quranHifz: quranHifz ?? null, quranKhatma: quranKhatma ?? null,
        lastBackup: typeof window !== "undefined" ? localStorage.getItem("madar-last-backup") : null,
      });
    } catch {
      return [];
    }
  }, [transactions, journalEntries, readingLogs, books, habits, budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters, quranHifz, quranKhatma]);

  const visible = useMemo(() => filterInsights(all, prefs, today()), [all, prefs]);

  if (!visible.length) return null;
  const primary = visible[0];
  const secondary = visible.slice(1, 3);

  const snooze = (key: string, opt: SnoozeOption) => setPrefs({ ...snoozeInsight(key, opt) });
  const dismiss = (key: string) => setPrefs({ ...dismissInsight(key) });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass size={16} className="text-quran" />
          <span className="text-sm font-bold text-gray-800">بوصلة مدار</span>
        </div>
        <span className="text-[10px] text-gray-300">تُحسب محلياً من بياناتك</span>
      </div>

      {/* التوصية الرئيسية — «خطوتك الآن» */}
      <PrimaryCard ins={primary} onSnooze={snooze} onDismiss={dismiss} />

      {/* توصيتان ثانويتان عند الحاجة */}
      {secondary.length > 0 && (
        <div className="space-y-1.5 pt-0.5">
          {secondary.map((ins) => (
            <SecondaryRow key={ins.dedupeKey} ins={ins} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </div>
  );
}

function PrimaryCard({ ins, onSnooze, onDismiss }: {
  ins: Insight; onSnooze: (k: string, o: SnoozeOption) => void; onDismiss: (k: string) => void;
}) {
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  return (
    <div className={`rounded-xl ${TONE_SOFT[ins.tone]} p-3.5 space-y-2.5`}>
      <div className="flex items-start gap-2.5">
        <span className="text-xl shrink-0 leading-none mt-0.5">{ins.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold ${TONE[ins.tone]}`}>خطوتك الآن</span>
            <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100 truncate">{ins.title}</span>
          </div>
          <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-300 mt-1">{ins.body}</p>
        </div>
        {ins.dismissible && (
          <button onClick={() => onDismiss(ins.dedupeKey)} aria-label="إخفاء" className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-black/5 dark:hover:bg-white/5 press">
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {ins.href && ins.actionLabel && (
          <Link href={ins.href} className={`inline-flex items-center gap-1 text-xs font-bold text-white rounded-lg px-3 py-1.5 press shadow-sm ${ins.tone === "warning" ? "bg-red-500" : "bg-quran"}`}>
            {ins.actionLabel} <ChevronLeft size={14} />
          </Link>
        )}
        {ins.snoozeOptions && ins.snoozeOptions.length > 0 && (
          <div className="relative">
            <button onClick={() => setSnoozeOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 bg-white/70 dark:bg-[#241c12] border border-gray-200 dark:border-transparent rounded-lg px-2.5 py-1.5 press">
              <Clock size={13} /> لاحقاً
            </button>
            {snoozeOpen && (
              <div className="absolute z-10 mt-1 flex gap-1 bg-white dark:bg-[#241c12] border border-gray-100 dark:border-gray-700 rounded-lg p-1 shadow-lg">
                {ins.snoozeOptions.map((o) => (
                  <button key={o} onClick={() => { onSnooze(ins.dedupeKey, o); setSnoozeOpen(false); }} className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:bg-quran/10 rounded-md px-2 py-1 press">
                    {SNOOZE_LABEL[o]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SecondaryRow({ ins, onDismiss }: { ins: Insight; onDismiss: (k: string) => void }) {
  const body = (
    <>
      <span className="text-base shrink-0">{ins.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-relaxed text-gray-700 dark:text-gray-200 line-clamp-2">{ins.body}</p>
      </div>
    </>
  );
  const cls = `flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${TONE_SOFT[ins.tone]}`;
  return (
    <div className="flex items-stretch gap-1">
      {ins.href ? (
        <Link href={ins.href} className={`${cls} flex-1 press hover:brightness-95 transition`}>{body}</Link>
      ) : (
        <div className={`${cls} flex-1`}>{body}</div>
      )}
      {ins.dismissible && (
        <button onClick={() => onDismiss(ins.dedupeKey)} aria-label="إخفاء" className="shrink-0 w-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-black/5 dark:hover:bg-white/5 press">
          <X size={13} />
        </button>
      )}
    </div>
  );
}
