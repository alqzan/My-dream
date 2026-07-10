"use client";
import type { Transaction, JournalEntry, ReadingLog, Book } from "@/lib/types";
import { formatAmount, toDateStr, parseDate } from "@/lib/utils";

interface WeeklyWrapProps {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  books: Book[];
}

function getThisWeekDates() {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(toDateStr(d));
  }
  return dates;
}

export function WeeklyWrap({ transactions, journalEntries, readingLogs, books }: WeeklyWrapProps) {
  const week = getThisWeekDates();
  const weekSet = new Set(week);

  const weekTx = transactions.filter((t) => weekSet.has(t.date));
  const weekJournal = journalEntries.filter((e) => weekSet.has(e.date));
  const weekLogs = readingLogs.filter((l) => weekSet.has(l.date));

  const spent = weekTx.reduce((s, t) => s + t.amount, 0);
  const pagesRead = weekLogs.reduce((s, l) => s + l.pagesRead, 0);
  const journalDays = weekJournal.length;
  const readingDays = new Set(weekLogs.map((l) => l.date)).size;

  const topMood = weekJournal
    .filter((e) => e.mood)
    .reduce<Record<string, number>>((acc, e) => {
      if (e.mood) acc[e.mood] = (acc[e.mood] || 0) + 1;
      return acc;
    }, {});
  const dominantMood = Object.entries(topMood).sort((a, b) => b[1] - a[1])[0]?.[0];

  const moodEmoji: Record<string, string> = {
    ممتاز: "😄", جيد: "😊", محايد: "😐", سيء: "😔", سيء_جداً: "😞",
  };

  return (
    <div className="bg-gradient-to-br from-[#4a3320] via-[#6b4629] to-[#8a5a24] rounded-2xl p-4 text-white space-y-3 card-shadow shine">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white/55 font-medium">حصيلة الأسبوع</p>
          <p className="text-base font-bold mt-0.5">هذا ما أنجزته 🏆</p>
        </div>
        {dominantMood && <span className="text-3xl">{moodEmoji[dominantMood]}</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatPill icon="📓" label="أيام كتبت" value={`${journalDays}/7`} color="text-purple-300" />
        <StatPill icon="📚" label="صفحات" value={formatAmount(pagesRead)} color="text-orange-300" />
        <StatPill
          icon="💰"
          label="مصاريف الأسبوع"
          value={formatAmount(spent)}
          color="text-red-300"
        />
        <StatPill icon="📖" label="أيام قراءة" value={`${readingDays}/7`} color="text-blue-300" />
      </div>

      <div className="flex gap-1 justify-center pt-1">
        {week.map((d, i) => {
          const hasJ = weekJournal.some((e) => e.date === d);
          const hasR = readingLogs.some((l) => l.date === d);
          const score = [hasJ, hasR].filter(Boolean).length;
          return (
            <div key={d} className="flex flex-col items-center gap-1">
              <div className="text-[10px] text-white/45">
                {["أح","إث","ثل","أر","خم","جم","سب"][parseDate(d).getDay()]}
              </div>
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
                style={{
                  backgroundColor: score === 2 ? "#f97316" : score === 1 ? "#d4a017" : "rgba(255,255,255,0.12)",
                }}
              >
                {score === 2 ? "🔥" : score > 0 ? score : "·"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatPill({ icon, label, value, color }: { icon: string; label: string; value: string; color: string }) {
  return (
    <div className="bg-white/10 rounded-xl px-3 py-2">
      <div className="text-xs text-white/55">{icon} {label}</div>
      <div className={`text-base font-bold ${color} mt-0.5`}>{value}</div>
    </div>
  );
}
