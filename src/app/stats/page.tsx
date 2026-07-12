"use client";
import { useMemo } from "react";
import { useAppStore } from "@/lib/store";
import {
  getJournalStreak,
  getReadingStreak,
  getPrayerStreak,
  countDayPrayers,
  getDailyCompletionDates,
  calcStreak,
  longestStreak,
  formatAmount,
  arabicMonthName,
  today,
} from "@/lib/utils";
import { Card } from "@/components/ui/Card";
import { BackupCard } from "@/components/settings/BackupCard";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { YearHeatmap } from "@/components/stats/YearHeatmap";
import dynamic from "next/dynamic";
// Charts (recharts) load on demand so the stats shell paints without waiting
// on ~90KB of charting code. The placeholder keeps the card height stable.
const MonthlyBars = dynamic(
  () => import("@/components/stats/MonthlyBars").then((m) => m.MonthlyBars),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gray-100 rounded-xl" /> }
);
import { Flame, Trophy, BookOpen, Wallet, BookMarked, CalendarCheck } from "lucide-react";

export default function StatsPage() {
  const { journalEntries, readingLogs, transactions, books, prayerLogs } = useAppStore();

  const year = today().slice(0, 4);

  // ---------- Hero numbers ----------
  const entriesThisYear = journalEntries.filter((e) => e.date.startsWith(year)).length;
  const pagesThisYear = readingLogs
    .filter((l) => l.date.startsWith(year))
    .reduce((s, l) => s + l.pagesRead, 0);
  const booksFinished = books.filter(
    (b) => b.status === "أنهيت" && (!b.finishDate || b.finishDate.startsWith(year))
  ).length;
  const spentThisYear = transactions
    .filter((t) => t.date.startsWith(year))
    .reduce((s, t) => s + t.amount, 0);
  const fullPrayerDays = prayerLogs
    .filter((l) => countDayPrayers(l).prayed === 5)
    .map((l) => l.date);

  // ---------- Heatmap scores ----------
  const heatmapScores = useMemo(() => {
    const j = new Set(journalEntries.map((e) => e.date));
    const r = new Set(readingLogs.map((l) => l.date));
    const f = new Set(transactions.map((t) => t.date));
    const all = new Set([...j, ...r, ...f]);
    const scores: Record<string, number> = {};
    all.forEach((d) => {
      scores[d] = [j.has(d), r.has(d), f.has(d)].filter(Boolean).length;
    });
    return scores;
  }, [journalEntries, readingLogs, transactions]);

  // ---------- Streaks ----------
  const completionDates = getDailyCompletionDates(journalEntries, readingLogs);
  const streaks = [
    {
      label: "السلسلة الكاملة",
      icon: <CalendarCheck size={16} />,
      color: "#c9852a",
      current: calcStreak(completionDates),
      best: longestStreak(completionDates),
    },
    {
      label: "الصلوات الخمس",
      icon: <span className="text-sm">🕌</span>,
      color: "#2d8577",
      current: getPrayerStreak(prayerLogs),
      best: longestStreak(fullPrayerDays),
    },
    {
      label: "المذكرات",
      icon: <BookMarked size={16} />,
      color: "#8a6fb0",
      current: getJournalStreak(journalEntries),
      best: longestStreak(journalEntries.map((e) => e.date)),
    },
    {
      label: "القراءة",
      icon: <BookOpen size={16} />,
      color: "#c1663f",
      current: getReadingStreak(readingLogs),
      best: longestStreak(readingLogs.map((l) => l.date)),
    },
  ];

  // ---------- Monthly spending (last 6 months) ----------
  const financeMonthly = useMemo(() => {
    const now = new Date();
    const months: { key: string; name: string; مصاريف: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, name: arabicMonthName(d.getMonth()), مصاريف: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    transactions.forEach((t) => {
      const m = byKey[t.date.slice(0, 7)];
      if (m) m.مصاريف += t.amount;
    });
    return months;
  }, [transactions]);
  const hasFinanceData = financeMonthly.some((m) => m.مصاريف > 0);

  // ---------- Monthly reading pages (last 6 months) ----------
  const readingMonthly = useMemo(() => {
    const now = new Date();
    const months: { key: string; name: string; صفحات: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, name: arabicMonthName(d.getMonth()), صفحات: 0 });
    }
    const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
    readingLogs.forEach((l) => {
      const m = byKey[l.date.slice(0, 7)];
      if (m) m.صفحات += l.pagesRead;
    });
    return months;
  }, [readingLogs]);
  const hasReadingData = readingMonthly.some((m) => m.صفحات > 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="animate-fade-up">
        <h1 className="text-2xl font-bold text-gray-900">إحصائياتي</h1>
        <p className="text-sm text-gray-500 mt-0.5">رحلتك في {year} بالأرقام</p>
      </div>

      {/* Hero numbers */}
      <div className="grid grid-cols-2 gap-3 animate-fade-up stagger-1">
        <HeroStat
          emoji="📓"
          value={entriesThisYear}
          label="مذكرة هذا العام"
          gradient="from-[#8a6fb0] to-[#6d5595]"
        />
        <HeroStat
          emoji="📖"
          value={pagesThisYear}
          label="صفحة قرأتها"
          gradient="from-[#c1663f] to-[#a04e2c]"
        />
        <HeroStat
          emoji="🏁"
          value={booksFinished}
          label="كتاب أنهيته"
          gradient="from-[#3d9640] to-[#2d7a30]"
        />
        <HeroStat
          emoji="💰"
          value={spentThisYear}
          label="ر.س مصاريف العام"
          gradient="from-[#c9852a] to-[#a96c20]"
        />
      </div>

      {/* Year heatmap */}
      <Card className="animate-fade-up stagger-2">
        <div className="flex items-center gap-2 mb-4">
          <CalendarCheck size={16} className="text-brand-600" />
          <span className="text-sm font-semibold text-gray-700">سنة من الالتزام</span>
        </div>
        <YearHeatmap scores={heatmapScores} />
      </Card>

      {/* Streak records */}
      <Card className="animate-fade-up stagger-3">
        <div className="flex items-center gap-2 mb-4">
          <Trophy size={16} className="text-brand-600" />
          <span className="text-sm font-semibold text-gray-700">أرقامك القياسية</span>
        </div>
        <div className="space-y-2.5">
          {streaks.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: s.color + "18", color: s.color }}
              >
                {s.icon}
              </div>
              <span className="text-sm text-gray-700 flex-1">{s.label}</span>
              <div className="flex items-center gap-1 text-sm">
                <Flame size={13} className={s.current > 0 ? "text-orange-500" : "text-gray-300"} />
                <span className="font-bold text-gray-800 min-w-[1.5rem]">{s.current}</span>
              </div>
              <div className="flex items-center gap-1 text-sm text-gray-400">
                <Trophy size={13} className="text-brand-400" />
                <span className="font-bold text-gray-600 min-w-[1.5rem]">{s.best}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><Flame size={10} /> الحالية</span>
          <span className="flex items-center gap-1"><Trophy size={10} /> الأفضل</span>
        </div>
      </Card>

      {/* Monthly finance */}
      {hasFinanceData && (
        <Card className="animate-fade-up stagger-4">
          <div className="flex items-center gap-2 mb-4">
            <Wallet size={16} className="text-finance" />
            <span className="text-sm font-semibold text-gray-700">مصاريفك — آخر ٦ أشهر</span>
          </div>
          <div className="h-52" dir="ltr">
            <MonthlyBars
              data={financeMonthly}
              dataKey="مصاريف"
              color="#d96a4a"
              cursorFill="rgba(201,133,42,0.06)"
              yWidth={44}
              format={(v) => `${formatAmount(v)} ر.س`}
            />
          </div>
        </Card>
      )}

      {/* Monthly reading */}
      {hasReadingData && (
        <Card className="animate-fade-up stagger-5">
          <div className="flex items-center gap-2 mb-4">
            <BookOpen size={16} className="text-reading" />
            <span className="text-sm font-semibold text-gray-700">صفحات القراءة — آخر ٦ أشهر</span>
          </div>
          <div className="h-44" dir="ltr">
            <MonthlyBars
              data={readingMonthly}
              dataKey="صفحات"
              color="#c1663f"
              cursorFill="rgba(193,102,63,0.06)"
              yWidth={36}
              format={(v) => `${formatAmount(v)} صفحة`}
            />
          </div>
        </Card>
      )}

      <div className="animate-fade-up">
        <BackupCard />
      </div>
    </div>
  );
}

function HeroStat({
  emoji, value, label, gradient,
}: {
  emoji: string;
  value: number;
  label: string;
  gradient: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-br ${gradient} card-shadow`}>
      <div className="text-2xl mb-2">{emoji}</div>
      <div className="text-2xl font-bold tabular-nums">
        <AnimatedNumber value={value} />
      </div>
      <div className="text-xs opacity-85 mt-0.5">{label}</div>
    </div>
  );
}
