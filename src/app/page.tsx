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
} from "@/lib/utils";
import { DailyPulse } from "@/components/dashboard/DailyPulse";
import { HabitTracker } from "@/components/dashboard/HabitTracker";
import { PrayerOrbit } from "@/components/dashboard/PrayerOrbit";
import { WeeklyWrap } from "@/components/dashboard/WeeklyWrap";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/ui/Confetti";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import Link from "next/link";
import { ChevronLeft, BarChart3, TrendingDown, Plus } from "lucide-react";

// Dashboard layout, top to bottom — one card per idea, nothing repeated:
//   1. التحية والتاريخ (هجري + ميلادي) + مدار السنة
//   2. صلوات اليوم
//   3. بطاقة اليوم الموحّدة (السلسلة + المهام الثلاث بروابطها)
//   4. عاداتي
//   5. حصيلة الأسبوع
//   6. تقويم السلسلة
//   7. روابط: متابعة الصرف + الإحصائيات الكاملة
export default function Dashboard() {
  const { journalEntries, readingLogs, transactions, books, dailyBudget, runRecurring } = useAppStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);

  // Auto-generate due recurring transactions on app open
  useEffect(() => {
    runRecurring();
  }, [runRecurring]);

  const todayStr = today();
  const journalStreak = getJournalStreak(journalEntries);
  const readingStreak = getReadingStreak(readingLogs);
  const financeStreak = getFinanceStreak(transactions);
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
  const dailyStatus = dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null;
  const thisMonthExpense = transactions
    .filter((t) => t.date.startsWith(todayStr.slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0);

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

      <div className="animate-fade-up stagger-2">
        <DailyPulse
          masterStreak={masterStreak}
          rows={[
            {
              href: "/journal",
              icon: "📓",
              label: "مذكرة اليوم",
              sub: hasTodayJournal ? "كتبتها — عوّد على المزيد" : "اكتب الآن",
              done: hasTodayJournal,
              streak: journalStreak,
              color: "#8a6fb0",
            },
            {
              href: "/finance",
              icon: "💰",
              label: "سجّل مصروفك",
              sub: dailyStatus
                ? `رصيدك اليومي ${dailyStatus.balance >= 0 ? "+" : "-"}${formatAmount(Math.abs(dailyStatus.balance))} ر.س`
                : thisMonthExpense > 0
                ? `${formatAmount(thisMonthExpense)} ر.س هذا الشهر`
                : "سجّل أول مصروف",
              done: hasTodayFinance,
              streak: financeStreak,
              color: "#3d9640",
            },
            {
              href: "/reading",
              icon: "📚",
              label: "اقرأ شيئاً",
              sub: currentBook ? currentBook.title : "أضف كتاباً",
              done: hasTodayReading,
              streak: readingStreak,
              color: "#c1663f",
            },
          ]}
        />
      </div>

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

      <Card className="animate-fade-up stagger-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سلسلة يومية — الأيام الثلاثة</span>
          <span className="text-xs text-gray-400">اضغط أي يوم 👆</span>
        </div>
        <StreakCalendar markedDates={completionDates} color="#c9852a" onDayClick={setSelectedDay} />
      </Card>

      <div className="grid grid-cols-2 gap-3 animate-fade-up stagger-6">
        <Link href="/finance/insights" className="block">
          <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-l from-[#1d5c20] to-[#3d9640] card-shadow press shine h-full">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
              <TrendingDown size={18} />
            </div>
            <p className="text-sm font-bold">متابعة الصرف</p>
            <p className="text-[11px] opacity-80 mt-0.5">أسبوعي · شهري · سنوي</p>
            <ChevronLeft size={16} className="absolute top-4 left-3 opacity-70" />
          </div>
        </Link>
        <Link href="/stats" className="block">
          <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-l from-[#5c3d21] to-[#8a5a24] card-shadow press shine h-full">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center mb-2">
              <BarChart3 size={18} />
            </div>
            <p className="text-sm font-bold">إحصائياتك الكاملة</p>
            <p className="text-[11px] opacity-80 mt-0.5">خريطة سنتك ومزاجك</p>
            <ChevronLeft size={16} className="absolute top-4 left-3 opacity-70" />
          </div>
        </Link>
      </div>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />

      {/* Quick-add expense — the most frequent daily action, always two
          taps away instead of a trip through the الأموال tab. */}
      <button
        onClick={() => setQuickExpense(true)}
        className="fixed bottom-24 lg:bottom-8 left-4 z-40 p-4 rounded-full bg-finance text-white shadow-lg shadow-finance/30 press"
        aria-label="سجّل مصروف سريع"
      >
        <Plus size={22} />
      </button>
      <Modal open={quickExpense} onClose={() => setQuickExpense(false)} title="مصروف سريع 💸">
        <TransactionForm onClose={() => setQuickExpense(false)} />
      </Modal>
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
