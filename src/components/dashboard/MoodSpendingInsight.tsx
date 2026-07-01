"use client";
import type { JournalEntry, Transaction } from "@/lib/types";
import { MOOD_LABELS } from "@/lib/types";
import { formatAmount } from "@/lib/utils";

interface MoodSpendingInsightProps {
  journalEntries: JournalEntry[];
  transactions: Transaction[];
}

const MOOD_ORDER: NonNullable<JournalEntry["mood"]>[] = [
  "سيء_جداً", "سيء", "محايد", "جيد", "ممتاز",
];

export function MoodSpendingInsight({ journalEntries, transactions }: MoodSpendingInsightProps) {
  // Map each dated mood to that day's total expense
  const moodToExpenses: Record<string, number[]> = {};

  for (const entry of journalEntries) {
    if (!entry.mood) continue;
    const dayExpense = transactions
      .filter((t) => t.date === entry.date)
      .reduce((s, t) => s + t.amount, 0);
    (moodToExpenses[entry.mood] ??= []).push(dayExpense);
  }

  const data = MOOD_ORDER.map((mood) => {
    const arr = moodToExpenses[mood] ?? [];
    const avg = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
    return { mood, avg, count: arr.length };
  }).filter((d) => d.count > 0);

  // Need at least 2 distinct moods with data to be meaningful
  if (data.length < 2) return null;

  const maxAvg = Math.max(...data.map((d) => d.avg), 1);

  // Insight text: compare good-mood vs bad-mood spending
  const goodMoods = data.filter((d) => ["جيد", "ممتاز"].includes(d.mood));
  const badMoods = data.filter((d) => ["سيء", "سيء_جداً"].includes(d.mood));
  const goodAvg = avgOf(goodMoods);
  const badAvg = avgOf(badMoods);

  let insight = "";
  if (goodAvg && badAvg) {
    if (badAvg > goodAvg * 1.2) {
      const pct = Math.round(((badAvg - goodAvg) / goodAvg) * 100);
      insight = `تصرف أكثر بنسبة ${pct}% في الأيام السيئة 📉 — انتبه للشراء العاطفي.`;
    } else if (goodAvg > badAvg * 1.2) {
      insight = "تصرف أكثر في أيامك الجيدة — صرف احتفالي 🎉";
    } else {
      insight = "إنفاقك متّزن بغضّ النظر عن مزاجك 👏";
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div>
        <span className="text-sm font-semibold text-gray-700">مزاجك مقابل إنفاقك</span>
        <p className="text-xs text-gray-400 mt-0.5">متوسط المصروف اليومي حسب الحالة</p>
      </div>

      <div className="space-y-2">
        {data.map((d) => {
          const m = MOOD_LABELS[d.mood];
          return (
            <div key={d.mood} className="flex items-center gap-2">
              <span className="text-base w-6">{m.icon}</span>
              <span className="text-xs text-gray-500 w-14">{m.label}</span>
              <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full flex items-center justify-end pl-2 transition-all"
                  style={{
                    width: `${Math.max((d.avg / maxAvg) * 100, 8)}%`,
                    backgroundColor: moodColor(d.mood),
                  }}
                >
                  <span className="text-[10px] text-white font-semibold whitespace-nowrap">
                    {formatAmount(Math.round(d.avg))}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {insight && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded-xl p-2.5 leading-relaxed">
          💡 {insight}
        </div>
      )}
    </div>
  );
}

function avgOf(arr: { avg: number; count: number }[]): number {
  const total = arr.reduce((s, d) => s + d.avg * d.count, 0);
  const count = arr.reduce((s, d) => s + d.count, 0);
  return count ? total / count : 0;
}

function moodColor(mood: string): string {
  const colors: Record<string, string> = {
    ممتاز: "#3d9640",
    جيد: "#6b8e6b",
    محايد: "#d4a017",
    سيء: "#e07b39",
    سيء_جداً: "#e05555",
  };
  return colors[mood] ?? "#888";
}
