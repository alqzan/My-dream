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
  getPrayerLog,
  countDayPrayers,
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
import { DayDigestCard } from "@/components/quran/DayDigestCard";
import { HifzReminder } from "@/components/quran/HifzReminder";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/ui/Confetti";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import Link from "next/link";
import { ChevronLeft, BarChart3, TrendingDown, Plus, Wallet, BookMarked, BookOpen } from "lucide-react";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { BrandMark } from "@/components/layout/BrandMark";

// Dashboard layout, top to bottom — one card per idea, nothing repeated:
//   1. التحية والتاريخ (هجري + ميلادي) + مدار السنة
//   2. صلوات اليوم
//   3. بطاقة اليوم الموحّدة (السلسلة + المهام الثلاث بروابطها)
//   4. عاداتي
//   5. حصيلة الأسبوع
//   6. تقويم السلسلة
//   7. روابط: متابعة الصرف + الإحصائيات الكاملة
export default function Dashboard() {
  const { journalEntries, readingLogs, transactions, books, prayerLogs, habits, quranWird, quranHifz, quranReflections } = useAppStore();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);

  const todayStr = today();
  const completionDates = getDailyCompletionDates(journalEntries, readingLogs);

  const hasTodayJournal = journalEntries.some((e) => e.date === todayStr);
  const hasTodayReading = readingLogs.some((l) => l.date === todayStr);
  const allDoneToday = hasTodayJournal && hasTodayReading;

  // «أقمار اليوم» — today's done-state for each daily domain, reusing the
  // exact predicates the domain widgets use (PrayerOrbit / DailyHabits), so
  // the moons on YearOrbit never drift from the real trackers.
  const hasTodayPrayer = countDayPrayers(getPrayerLog(prayerLogs, todayStr)).prayed > 0;
  const hasTodayHabit = habits.some((h) => h.logs.includes(todayStr));
  const hasTodayWird = quranWird.includes(todayStr);

  // First run: a brand-new user has nothing tracked in any domain yet, so the
  // dashboard is a wall of empty instruments with no guidance. Detect it from
  // the same store slices the widgets read (no new state) — the instant ANY of
  // them holds data, this flips false and the normal dashboard shows.
  const isFirstRun =
    journalEntries.length === 0 &&
    readingLogs.length === 0 &&
    transactions.length === 0 &&
    books.length === 0 &&
    prayerLogs.length === 0 &&
    !habits.some((h) => h.logs.length > 0) &&
    quranWird.length === 0 &&
    quranReflections.length === 0 &&
    !quranHifz?.plan;

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
        <YearOrbit
          pct={yearPct}
          prayer={hasTodayPrayer}
          journal={hasTodayJournal}
          reading={hasTodayReading}
          habits={hasTodayHabit}
          wird={hasTodayWird}
        />
      </div>

      {isFirstRun && <OnboardingCard />}

      <PendingBankBanner />

      {!isFirstRun && (
        <div className="animate-fade-up stagger-1 space-y-3">
          <HifzReminder />
          <DayDigestCard />
        </div>
      )}

      <div className="animate-fade-up stagger-1">
        <RamadanCard />
      </div>

      <Card className="animate-fade-up stagger-1">
        <PrayerOrbit />
      </Card>

      <div className="animate-fade-up stagger-2">
        <HikmaCard />
      </div>

      <div id="daily-habits" className="animate-fade-up stagger-2 scroll-mt-4">
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
        className="fab p-4 rounded-full bg-finance text-white shadow-lg shadow-finance/30 press"
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

// Shown only on a truly empty first run (see `isFirstRun`). A warm welcome plus
// four section-coloured quick starts — the same icons the nav uses — so a new
// user has one obvious first move instead of a page of empty instruments.
const QUICK_STARTS = [
  { href: "/prayers", icon: MosqueIcon, label: "سجّل صلاة", color: "text-prayer", bg: "bg-prayer/10" },
  { href: "/finance", icon: Wallet, label: "أضف مصروف", color: "text-finance", bg: "bg-finance/10" },
  { href: "/journal", icon: BookMarked, label: "اكتب مذكرة", color: "text-journal", bg: "bg-journal/10" },
  { href: "/reading", icon: BookOpen, label: "أضف كتاباً", color: "text-reading", bg: "bg-reading/10" },
];

function OnboardingCard() {
  return (
    <Card className="animate-fade-up">
      <div className="flex items-center gap-2 mb-1.5">
        <BrandMark size={26} />
        <h2 className="text-lg font-bold text-gray-800">ابدأ رحلتك في مدار</h2>
      </div>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        مساحتك الشخصية لمتابعة صلواتك ومصاريفك ومذكراتك وقراءتك — وكلّها محفوظةٌ على جهازك وحده. اختر بدايةً:
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {QUICK_STARTS.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-3 press transition-colors hover:border-brand-300"
          >
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${it.bg}`}>
              <it.icon size={18} className={it.color} />
            </span>
            <span className="text-sm font-semibold text-gray-700">{it.label}</span>
          </Link>
        ))}
      </div>
    </Card>
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
function YearOrbit({
  pct, prayer, journal, reading, habits, wird,
}: {
  pct: number;
  prayer: boolean;
  journal: boolean;
  reading: boolean;
  habits: boolean;
  wird: boolean;
}) {
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

  // «أقمار اليوم على مدار السنة» — one small moon per daily domain, orbiting
  // just inside the year ring at the four cardinal points. A moon glows in its
  // section colour when that domain is done today, or sits as a faint outline
  // when not. The centre radius (26) keeps every moon clear of the orbiting
  // planet (on the ring at r≈39), the centre "%" label, and the greeting to
  // the side. Purely additive — the year arc, planet, and label are untouched.
  const cx0 = size / 2;
  const cy0 = size / 2;
  const moonR = 26;
  // خمسة أقمار موزّعة بالتساوي (كل 72°) — أُضيف الوِرد بلونه الأخضر القرآني
  // إلى جانب المدارات الأربعة الأصلية.
  const moons = [
    { key: "prayer", label: "الصلاة", color: "#1f7a6c", done: prayer, angle: -90, href: "/prayers" as string | null },
    { key: "wird", label: "الورد", color: "#1b6b4c", done: wird, angle: -18, href: "/quran" as string | null },
    { key: "journal", label: "المذكرة", color: "#8a6fb0", done: journal, angle: 54, href: "/journal" as string | null },
    { key: "reading", label: "القراءة", color: "#c1663f", done: reading, angle: 126, href: "/reading" as string | null },
    { key: "habits", label: "العادات", color: "#c9852a", done: habits, angle: 198, href: null as string | null },
  ].map((m) => ({
    ...m,
    x: cx0 + moonR * Math.cos((m.angle * Math.PI) / 180),
    y: cy0 + moonR * Math.sin((m.angle * Math.PI) / 180),
  }));

  // Habits has no page of its own — its moon nudges the DailyHabits card into
  // view. Instant when the user prefers reduced motion.
  const scrollToHabits = () => {
    const el = typeof document !== "undefined" && document.getElementById("daily-habits");
    if (!el) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  };

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
        {moons.map((m) => (
          <g key={m.key}>
            {m.done && <circle cx={m.x} cy={m.y} r={4.2} fill={m.color} opacity={0.25} />}
            <circle
              cx={m.x} cy={m.y} r={2.8}
              fill={m.done ? m.color : "none"}
              stroke={m.color}
              strokeWidth={m.done ? 0 : 1.3}
              opacity={m.done ? 1 : 0.42}
            />
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-base font-bold text-gray-800 leading-none">{pct}%</span>
        <span className="text-[9px] text-gray-400 mt-0.5">من العام</span>
      </div>
      {/* Transparent hit targets over each moon: real tap size + focus ring +
          Arabic label, so the moons are keyboard-reachable and navigate. */}
      {moons.map((m) => {
        const aria = `${m.label} — ${m.done ? "أنجزت اليوم" : "لم تُنجز بعد"}`;
        const cls = "absolute rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
        const st = { left: m.x - 10, top: m.y - 10, width: 20, height: 20, ["--tw-ring-color" as string]: m.color };
        return m.href ? (
          <Link key={m.key} href={m.href} aria-label={aria} title={aria} className={cls} style={st} />
        ) : (
          <button key={m.key} type="button" onClick={scrollToHabits} aria-label={aria} title={aria} className={cls} style={st} />
        );
      })}
    </div>
  );
}
