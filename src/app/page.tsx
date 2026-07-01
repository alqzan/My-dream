"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  getJournalStreak,
  getReadingStreak,
  getFinanceStreak,
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
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import Link from "next/link";
import { ChevronLeft, BookMarked, Wallet, BookOpen } from "lucide-react";

export default function Dashboard() {
  const { journalEntries, readingLogs, transactions, books, prayerLogs, runRecurring } = useAppStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const currentBook = books.find((b) => b.status === "أقرأ");
  const recentEntry = journalEntries[0];
  const thisMonthExpense = transactions
    .filter((t) => t.type === "مصروف" && t.date.startsWith(todayStr.slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0);
  const thisMonthIncome = transactions
    .filter((t) => t.type === "دخل" && t.date.startsWith(todayStr.slice(0, 7)))
    .reduce((s, t) => s + t.amount, 0);

  const yearPct = yearProgress();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {getGreeting()} 👋
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{formatDate(todayStr)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{hijriDate(todayStr)}</p>
        </div>
        <YearOrbit pct={yearPct} />
      </div>

      <Card>
        <PrayerOrbit />
      </Card>

      <DailyStreakBanner
        masterStreak={masterStreak}
        journalStreak={journalStreak}
        readingStreak={readingStreak}
        financeStreak={financeStreak}
        prayerStreak={prayerStreak}
      />

      <Card>
        <DailyCompletion
          hasTodayJournal={hasTodayJournal}
          hasTodayFinance={hasTodayFinance}
          hasTodayReading={hasTodayReading}
        />
      </Card>

      <Card>
        <HabitTracker />
      </Card>

      <WeeklyWrap
        transactions={transactions}
        journalEntries={journalEntries}
        readingLogs={readingLogs}
        books={books}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          sub={thisMonthIncome > 0
            ? `${thisMonthIncome.toLocaleString()} ر.س دخل`
            : "لا يوجد دخل هذا الشهر"}
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

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سلسلة يومية — الأيام الثلاثة</span>
          <span className="text-xs text-gray-400">اضغط أي يوم 👆</span>
        </div>
        <StreakCalendar markedDates={completionDates} color="#c9852a" onDayClick={setSelectedDay} />
      </Card>

      {recentEntry && (
        <Card>
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

      {(thisMonthExpense > 0 || thisMonthIncome > 0) && (
        <Card>
          <Link href="/finance" className="block">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700">هذا الشهر</span>
              <ChevronLeft size={16} className="text-gray-400" />
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-finance/5 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">دخل</div>
                <div className="text-base font-bold text-finance">
                  {thisMonthIncome.toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span>
                </div>
              </div>
              <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                <div className="text-xs text-gray-500">مصاريف</div>
                <div className="text-base font-bold text-red-500">
                  {thisMonthExpense.toLocaleString("ar-SA")} <span className="text-xs font-normal">ر.س</span>
                </div>
              </div>
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
function YearOrbit({ pct }: { pct: number }) {
  const size = 82;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const on = (c * pct) / 100;
  const gold = "#e8b15a";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-gray-200 dark:text-[#3a2e1e]" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={gold} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${on} ${c - on}`} />
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
        className={`rounded-2xl p-4 border ${done ? c.border + " " + c.bg : "border-gray-100 bg-white"} hover:shadow-sm transition-shadow`}
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
