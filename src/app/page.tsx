"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  getDailyCompletionDates,
  today,
  toDateStr,
  formatDate,
  hijriDate,
  yearProgress,
} from "@/lib/utils";
import { PendingBankBanner } from "@/components/finance/PendingBankBanner";
import { InstallHint } from "@/components/layout/InstallHint";
import { DailyHabits } from "@/components/dashboard/DailyHabits";
import { PrayerOrbit } from "@/components/dashboard/PrayerOrbit";
import { SmartInsights } from "@/components/dashboard/SmartInsights";
import { HikmaCard } from "@/components/dashboard/HikmaCard";
import { WeeklyWrap } from "@/components/dashboard/WeeklyWrap";
import { RamadanCard } from "@/components/dashboard/RamadanCard";
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
  const { journalEntries, readingLogs, transactions, books } = useAppStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);

  const todayStr = today();
  const completionDates = getDailyCompletionDates(journalEntries, readingLogs);

  const hasTodayJournal = journalEntries.some((e) => e.date === todayStr);
  const hasTodayReading = readingLogs.some((l) => l.date === todayStr);
  const allDoneToday = hasTodayJournal && hasTodayReading;

  // One confetti celebration per completed day. Also sweeps out celebration
  // keys older than 30 days — one gets written every completed day forever
  // otherwise, and localStorage never reclaims them on its own.
  useEffect(() => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      const cutoffKey = `madar-celebrated-${toDateStr(cutoffDate)}`;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("madar-celebrated-") && k < cutoffKey) localStorage.removeItem(k);
      }
    } catch { /* storage unavailable — skip cleanup */ }

    if (!allDoneToday) return;
    const key = `madar-celebrated-${todayStr}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    setCelebrate(true);
  }, [allDoneToday, todayStr]);

  // PWA shortcut: "مصروف سريع" launches with ?quick=expense — open the sheet
  // immediately and drop the param so a later reload doesn't reopen it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quick") === "expense") {
      setQuickExpense(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

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

      <PendingBankBanner />

      <div className="animate-fade-up stagger-1">
        <RamadanCard />
      </div>

      <Card className="animate-fade-up stagger-1">
        <PrayerOrbit />
      </Card>

      <div className="animate-fade-up stagger-2">
        <HikmaCard />
      </div>

      <div className="animate-fade-up stagger-2">
        <DailyHabits />
      </div>

      <div className="animate-fade-up stagger-3">
        <SmartInsights />
      </div>

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
          <span className="text-sm font-semibold text-gray-700">سلسلة يومية — مذكرة + قراءة</span>
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

      <InstallHint />

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
