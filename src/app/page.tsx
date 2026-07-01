"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  getJournalStreak,
  getReadingStreak,
  getFinanceStreak,
  computeDailyBudgetStatus,
  formatAmount,
  getDailyCompletionDates,
  calcStreak,
  today,
  formatDate,
  hijriDate,
  yearProgress,
  getPrayerStreak,
} from "@/lib/utils";
import { DailyStreakBanner } from "@/components/dashboard/StreakWidget";
import { DailyCompletion } from "@/components/dashboard/DailyCompletion";
import { HabitTracker } from "@/components/dashboard/HabitTracker";
import { PrayerOrbit } from "@/components/dashboard/PrayerOrbit";
import { WeeklyWrap } from "@/components/dashboard/WeeklyWrap";
import { MoodSpendingInsight } from "@/components/dashboard/MoodSpendingInsight";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Confetti } from "@/components/ui/Confetti";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import Link from "next/link";
import { ChevronLeft, BookMarked, Wallet, BookOpen, BarChart3 } from "lucide-react";

export default function Dashboard() {
  const { journalEntries, readingLogs, transactions, books, prayerLogs, dailyBudget, runRecurring } = useAppStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  // Auto-generate due recurring transactions on app open
  useEffect(() => {
    runRecurring();
  }, [runRecurring]);

  const todayStr = today();
  const journalStreak = getJournalStreak(journalEntries);
  const readingStreak = getReadingStreak(readingLogs);
  const financeStreak = getFinanceStreak(transactions);
  const prayerStreak = getPrayerStreak(prayerLogs);
  const completionDates = getDailyCompletionDates(journalEntries, readingLogs, transactions);
  const masterStreak = calcStreak(completionDates);

  const hasTodayJournal = journalEntries.some((e) => e.date === todayStr);
  const hasTodayFinance = transactions.some((t) => t.date === todayStr);
  const hasTodayReading = readingLogs.some((l) => l.date === todayStr);
  const allDoneToday = hasTodayJournal && hasTodayFinance && hasTodayReading;

  // One confetti celebration per completed day.
  useEffect(() => {
    if (!allDoneToday) return;
    const key = `madar-celebrated-${todayStr}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setCelebrate(true);
  }, [allDoneToday, todayStr]);

  const currentBook = books.find((b) => b.status === "أقرأ");
  const recentEntry = journalEntries[0];
  const thisMonthExpense = transactions
    .filter((t) => t.date.startsWith(todayStr.slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0);
  const dailyStatus = dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null;

  const yearPct = yearProgress();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      {celebrate && <Confetti />}

      <div className="flex items-center justify-between gap-4 animate-fade-up">
        <div>
          <h1 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-l from-[#5c3d21] to-[#a96c20] dark:from-[#f0d9a8] dark:to-[#e8b15a]">
            {getGreeting()} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(todayStr)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hijriDate(todayStr)}</p>
        </div>
        <YearOrbit pct={yearPct} />
      </div>

      <Card className="animate-fade-up stagger-1">
        <PrayerOrbit />
      </Card>

      <div className="animate-fade-up stagger-1">
        <DailyStreakBanner
          masterStreak={masterStreak}
          journalStreak={journalStreak}
          readingStreak={readingStreak}
          financeStreak={financeStreak}
          prayerStreak={prayerStreak}
        />
      </div>

      <Card className="animate-fade-up stagger-2">
        <DailyCompletion
          hasTodayJournal={hasTodayJournal}
          hasTodayFinance={hasTodayFinance}
          hasTodayReading={hasTodayReading}
        />
      </Card>

      <Card className="animate-fade-up stagger-3">
        <HabitTracker />
      </Card>

      <div className="animate-fade-up stagger-4">
        <WeeklyWrap
          transactions={transactions}
          journalEntries={journalEntries}
          readingLogs={readingLogs}
          books={books}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 animate-fade-up stagger-5">
        <QuickLink
          href="/journal"
          icon={<BookMarked size={20} />}
          label="مذكرة اليوم"
          sub={hasTodayJournal ? "كتبتها ✓" : "اكتب الآن"}
          color="journal"
          done={hasTodayJournal}
        />
        <QuickLink
          href="/finance"
          icon={<Wallet size={20} />}
          label="سجّل مصروف"
          sub={dailyStatus
            ? `${dailyStatus.balance >= 0 ? "+" : "-"}${formatAmount(Math.abs(dailyStatus.balance))} ر.س يومياً`
            : thisMonthExpense > 0
            ? `${thisMonthExpense.toLocaleString()} ر.س هذا الشهر`
            : "سجّل أول مصروف"}
          color="finance"
          done={hasTodayFinance}
        />
        <QuickLink
          href="/reading"
          icon={<BookOpen size={20} />}
          label="القراءة"
          sub={currentBook ? currentBook.title : "أضف كتاباً"}
          color="reading"
          done={hasTodayReading}
        />
      </div>

      <Card className="animate-fade-up stagger-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سلسلة يومية — الأيام الثلاثة</span>
          <span className="text-xs text-gray-400">اضغط أي يوم 👆</span>
        </div>
        <StreakCalendar markedDates={completionDates} color="#c9852a" onDayClick={setSelectedDay} />
      </Card>

      <Link href="/stats" className="block animate-fade-up stagger-7">
        <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-l from-[#5c3d21] to-[#8a5a24] card-shadow press shine">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <BarChart3 size={20} />
              </div>
              <div>
                <p className="text-sm font-bold">إحصائياتك الكاملة</p>
                <p className="text-xs opacity-80 mt-0.5">خريطة سنتك، أرقامك القياسية، ومزاجك</p>
              </div>
            </div>
            <ChevronLeft size={18} className="opacity-70" />
          </div>
        </div>
      </Link>

      {recentEntry && (
        <Card className="animate-fade-up stagger-8">
          <Link href="/journal" className="block">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-700">آخر مذكرة</span>
              <ChevronLeft size={16} className="text-gray-400" />
            </div>
            <p className="text-xs text-gray-400 mb-1">{formatDate(recentEntry.date)}</p>
            <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">
              {recentEntry.content}
            </p>
          </Link>
        </Card>
      )}

      {thisMonthExpense > 0 && (
        <Card className="animate-fade-up stagger-8">
          <Link href="/finance" className="block">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">هذا الشهر</span>
              <ChevronLeft size={16} className="text-gray-400" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">مصاريف</div>
                <div className="text-base font-bold text-red-500">
                  {thisMonthExpense.toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span>
                </div>
              </div>
              {dailyStatus && (
                <div className={`flex-1 rounded-xl p-3 text-center ${dailyStatus.balance >= 0 ? "bg-prayer/5" : "bg-red-50"}`}>
                  <div className="text-xs text-gray-500">الرصيد اليومي</div>
                  <div className={`text-base font-bold ${dailyStatus.balance >= 0 ? "text-prayer" : "text-red-500"}`}>
                    {dailyStatus.balance >= 0 ? "+" : "-"}{formatAmount(Math.abs(dailyStatus.balance))} <span className="text-xs font-normal">ر.س</span>
                  </div>
                </div>
              )}
            </div>
          </Link>
        </Card>
      )}

      <MoodSpendingInsight journalEntries={journalEntries} transactions={transactions} />

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "طاب سهرك";
  if (hour < 12) return "صباح النور";
  if (hour < 17) return "مساء الخير";
  return "مساء النور";
}

// Orbit ring showing how much of the year has passed — the "مدار" motif.
// The arc fills in with an eased animation on mount, with a gold gradient
// and a small orbiting "planet" at the arc's tip.
function YearOrbit({ pct }: { pct: number }) {
  const size = 88;
  const stroke = 6.5;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const [animPct, setAnimPct] = useState(0);

  useEffect(() => {
    const t = requestAnimationFrame(() => setAnimPct(pct));
    return () => cancelAnimationFrame(t);
  }, [pct]);

  const on = (c * animPct) / 100;
  const angle = (animPct / 100) * 360 - 90;
  const dotX = size / 2 + (r) * Math.cos((angle * Math.PI) / 180);
  const dotY = size / 2 + (r) * Math.sin((angle * Math.PI) / 180);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="orbitGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e8b15a" />
            <stop offset="100%" stopColor="#c1663f" />
          </linearGradient>
        </defs>
        <g style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}>
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none"
            stroke="url(#orbitGold)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={`${on} ${c - on}`}
            style={{ transition: "stroke-dasharray 1.4s cubic-bezier(0.16, 1, 0.3, 1)" }}
          />
        </g>
        <circle
          cx={dotX} cy={dotY} r={4.5} fill="#e8b15a"
          stroke="#fff" strokeWidth={1.5}
          style={{ transition: "cx 1.4s cubic-bezier(0.16,1,0.3,1), cy 1.4s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold text-gray-800 leading-none">{pct}%</span>
        <span className="text-[9px] text-gray-400 mt-0.5">من العام</span>
      </div>
    </div>
  );
}

function QuickLink({
  href, icon, label, sub, color, done,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  color: "journal" | "finance" | "reading";
  done?: boolean;
}) {
  const colors = {
    journal: { bg: "bg-journal/10", text: "text-journal", border: "border-journal/30" },
    finance: { bg: "bg-finance/10", text: "text-finance", border: "border-finance/30" },
    reading: { bg: "bg-reading/10", text: "text-reading", border: "border-reading/30" },
  };
  const c = colors[color];

  return (
    <Link href={href}>
      <div
        className={`rounded-2xl p-4 border press card-shadow ${done ? c.border + " " + c.bg : "border-gray-100 bg-white"} hover:shadow-lg transition-shadow`}
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${c.bg}`}>
          <span className={c.text}>{icon}</span>
        </div>
        <p className={`text-sm font-bold ${done ? c.text : "text-gray-800"}`}>{label}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{sub}</p>
      </div>
    </Link>
  );
}
