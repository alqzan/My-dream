"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookMarked, BookOpen, Plus, Wallet } from "lucide-react";
import { useSectionNav } from "@/components/layout/useSectionNav";
import { useAppStore } from "@/lib/store";
import { prefGet, prefSet, prefRemove, prefKeys } from "@/lib/platform/prefs";
import { completedDayDates } from "@/lib/dayAggregator";
import {
  computeDailyBudgetStatus,
  computePrayerTimes,
  countDayPrayers,
  formatAmount,
  formatClock,
  getCachedCoords,
  parseDate,
  formatDate,
  getPrayerLog,
  hijriDate,
  quranActivityDates,
  today,
  toDateStr,
} from "@/lib/utils";
import { arNum, arClock } from "@/lib/madar/format";
import { buildTodayPlan } from "@/lib/quran/session";
import { GOLD_LIGHT } from "@/lib/palette";
import { dueArc, salahNow } from "@/lib/sundial";
import { Sundial } from "@/components/madar/today/Sundial";
import { ThreeArcs, type ArcSpec } from "@/components/madar/today/ThreeArcs";
import { PendingBankBanner } from "@/components/finance/PendingBankBanner";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { RamadanCard } from "@/components/dashboard/RamadanCard";
import { CountdownCard } from "@/components/dashboard/CountdownCard";
import { DayDigestCard } from "@/components/quran/DayDigestCard";
import { NudgeCard } from "@/components/dashboard/NudgeCard";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { BrandMark } from "@/components/layout/BrandMark";
import { Card } from "@/components/ui/Card";
import { Confetti } from "@/components/ui/Confetti";
import { Modal } from "@/components/ui/Modal";

// البهو يحافظ على إيقاع مدار الأصلي: مزولة، أقواس، ثم لمحات قصيرة من كل قسم.
// لا توجد لوحة «خلاصة اليوم» ثانية ولا درج أدوات؛ التفاصيل العميقة تعيش في
// صفحاتها، والبهو يذكّر فقط بما يستحق نظرة سريعة.
export default function Dashboard() {
  // أقواسُ البهو تبدّل القسم كالشريط السفلي تماماً، فتأخذ ضماناتِه نفسَها:
  // `router.push` وحدها بلا مهلة تترك القوسَ المضغوط بلا أثرٍ إن لم تصل حمولةُ
  // المسار — وهي الحالة التي صوّرها المالك في الشريط السفلي.
  const { navigate } = useSectionNav();
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);
  const transactions = useAppStore((s) => s.transactions);
  const books = useAppStore((s) => s.books);
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const habits = useAppStore((s) => s.habits);
  const frozenHabits = useAppStore((s) => s.frozenHabits);
  const quranWird = useAppStore((s) => s.quranWird);
  const quranHifz = useAppStore((s) => s.quranHifz);
  const quranReflections = useAppStore((s) => s.quranReflections);
  const quranKhatma = useAppStore((s) => s.quranKhatma);
  const [celebrate, setCelebrate] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);

  const todayStr = today();
  const yearPct = useMemo(() => {
    const [year, month, day] = todayStr.split("-").map(Number);
    const current = new Date(year, month - 1, day).getTime();
    const start = new Date(year, 0, 1).getTime();
    const next = new Date(year + 1, 0, 1).getTime();
    return Math.max(0, Math.min(100, Math.round(((current - start) / (next - start)) * 100)));
  }, [todayStr]);

  const quranDates = useMemo(
    () => quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma }),
    [quranWird, quranHifz, quranReflections, quranKhatma]
  );
  const completionDates = useMemo(
    () => completedDayDates({ journalEntries, readingLogs, quranActivity: quranDates, frozenHabits }),
    [journalEntries, readingLogs, quranDates, frozenHabits]
  );
  const allDoneToday = completionDates.includes(todayStr);
  const isFirstRun =
    journalEntries.length === 0 &&
    readingLogs.length === 0 &&
    transactions.length === 0 &&
    books.length === 0 &&
    prayerLogs.length === 0 &&
    !habits.some((habit) => habit.logs.length > 0) &&
    quranWird.length === 0 &&
    quranReflections.length === 0 &&
    !quranHifz?.plan;

  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // **دورُ الأقواس (٠٫١٫٤٦٥)**: كلُّ قوسٍ يجيب سؤالاً واحداً عن **الآن** لا
  // عن اليوم كلِّه — ماذا عليّ في الصلاة الآن؟ كم تأخذ جلسةُ القرآن اليوم؟ كم
  // يبقى لي أصرفه؟ — والتطويقُ الذهبيّ على ما يستحقّ فعلاً، أو على لا شيء.
  const prayerTimes = useMemo(() => {
    const c = getCachedCoords();
    return computePrayerTimes(parseDate(todayStr), c.lat, c.lng);
  }, [todayStr]);
  const todayPrayers = getPrayerLog(prayerLogs, todayStr);
  const prayedToday = countDayPrayers(todayPrayers).prayed;
  const salah = salahNow(nowTick, prayerTimes, todayPrayers?.prayers ?? {});
  const quranDone = quranDates.has(todayStr);
  // جلسةُ اليوم من الجدول نفسِه الذي تعرضه صفحة القرآن — لا عدَّ أخطاءٍ موازٍ
  // (كان القوسُ يعدّ مواضعَ الأخطاء ويسمّيها «للمراجعة»، والمراجعةُ شيءٌ آخر).
  const hifzPlan = useMemo(
    () => (quranHifz?.plan ? buildTodayPlan(quranHifz, todayStr) : null),
    [quranHifz, todayStr]
  );
  const dailyStatus = useMemo(
    () => (dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null),
    [dailyBudget, transactions]
  );
  const due = dueArc({
    salahPending: salah.pending.length,
    quranDone,
    overspent: !!dailyStatus && dailyStatus.balance < 0,
  });
  const sessionMinutes = hifzPlan && hifzPlan.steps.length ? hifzPlan.estMinutes : 0;
  const arcSpecs: ArcSpec[] = [
    {
      key: "salah",
      label: "الصلاة",
      big: arNum(prayedToday),
      unit: `من ${arNum(5)}`,
      sub: salah.pending.length === 1
        ? `حان ${salah.pending[0]}`
        : salah.pending.length > 1
          ? `${arNum(salah.pending.length)} تنتظر تسجيلك`
          : salah.next
            ? `${salah.next.name} ${arClock(salah.next.at, formatClock)}`
            : prayedToday === 5 ? "يومٌ كامل" : "سُجِّل يومُك",
      ratio: prayedToday / 5,
      color: "var(--clay)",
      wash: "var(--clayw)",
      onClick: () => navigate("/prayers"),
    },
    {
      key: "quran",
      label: "القرآن",
      big: quranDone ? "تمَّ" : sessionMinutes ? arNum(sessionMinutes) : "—",
      unit: quranDone
        ? "وِردك اليوم"
        : sessionMinutes
          ? (sessionMinutes >= 3 && sessionMinutes <= 10 ? "دقائق" : "دقيقة")
          : "وِرد اليوم",
      sub: quranDone
        ? "وردك مقروء"
        : hifzPlan?.newPortion
          ? "حفظٌ جديد ومراجعة"
          : sessionMinutes
            ? "مراجعةُ اليوم"
            : "وِردُك ينتظرك",
      ratio: quranDone ? 1 : 0,
      color: "var(--green)",
      wash: "var(--greenw)",
      onClick: () => navigate("/quran"),
    },
    {
      key: "mal",
      label: "المال",
      big: dailyStatus ? formatAmount(Math.round(Math.abs(dailyStatus.balance))) : "—",
      unit: dailyStatus ? (dailyStatus.balance < 0 ? "تجاوزتَ" : "ريالًا") : "بلا ميزانية",
      sub: dailyStatus ? (dailyStatus.balance < 0 ? "راجِع صرفك" : "يكفيك اليوم") : "اضبِط ميزانيتك",
      ratio: dailyStatus && dailyStatus.allowance > 0
        ? Math.max(0, Math.min(1, dailyStatus.balance / dailyStatus.allowance))
        : 0,
      color: "var(--blue)",
      wash: "var(--bluew)",
      onClick: () => navigate("/finance"),
    },
  ];

  useEffect(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = `madar-celebrated-${toDateStr(cutoff)}`;
    for (const key of prefKeys("madar-celebrated-")) {
      if (key < cutoffKey) prefRemove(key);
    }

    if (!allDoneToday) return;
    const key = `madar-celebrated-${todayStr}`;
    if (prefGet(key)) return;
    prefSet(key, "1");
    setCelebrate(true);
  }, [allDoneToday, todayStr]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("quick") !== "expense") return;
    setQuickExpense(true);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  return (
    <div className="page-shell page-shell--wide mdr mdr-home">
      {celebrate && <Confetti />}

      <header className="mdr-home-header">
        <div className="mdr-home-hero">
          <div className="mdr-home-greeting">
            <span className="mdr-home-kicker">مدار اليوم</span>
            <h1>{getGreeting()}</h1>
            <p>
              <span>{hijriDate(todayStr)}</span>
              <span className="mdr-diamond" aria-hidden="true" />
              <span>{formatDate(todayStr)}</span>
            </p>
          </div>
          <YearProgress pct={yearPct} />
        </div>
      </header>

      <div className="mdr-home-primary animate-fade-up">
        <section className="mdr-home-legacy-visuals" aria-label="إيقاع اليوم">
          <Sundial now={nowTick} times={prayerTimes} prayed={prayedToday} due={due} next={salah.next} />
          <ThreeArcs due={due} arcs={arcSpecs} />
        </section>
        {/* التذكيرُ اللطيف قبل قائمة الطقوس لا بعدها: القائمةُ تقول **ما هو**،
            والتذكيرُ يقول **أين وقفت وكم صار لك** — والثاني هو ما يُعيد من
            انقطع، والأوّلُ ما يُتابع من لم ينقطع. */}
        <NudgeCard />
        <DayDigestCard compact />
        {isFirstRun && <OnboardingCard />}
        <RamadanCard />
        <CountdownCard />
        <PendingBankBanner />
      </div>

      <WeeklySummary
        transactions={transactions}
        journalEntries={journalEntries}
        readingLogs={readingLogs}
        prayerLogs={prayerLogs}
        habits={habits}
        frozenHabits={frozenHabits}
        quranActivity={quranDates}
      />

      <button
        onClick={() => setQuickExpense(true)}
        className="fab p-4 rounded-full bg-finance text-white shadow-lg shadow-finance/30 press"
        aria-label="سجّل مصروف سريع"
      >
        <Plus size={22} />
      </button>
      <Modal open={quickExpense} onClose={() => setQuickExpense(false)} title="مصروف سريع">
        <TransactionForm onClose={() => setQuickExpense(false)} />
      </Modal>
    </div>
  );
}

function YearProgress({ pct }: { pct: number }) {
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="mdr-year-progress" aria-label={`${pct}% من السنة مضت`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="36" cy="36" r={radius} fill="none" stroke={GOLD_LIGHT} strokeWidth="4"
          strokeLinecap="round" strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <strong>{arNum(pct)}٪</strong>
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

const QUICK_STARTS = [
  { href: "/prayers", icon: MosqueIcon, label: "سجّل صلاة", color: "text-prayer", bg: "bg-prayer/10" },
  { href: "/finance", icon: Wallet, label: "أضف مصروف", color: "text-finance", bg: "bg-finance/10" },
  { href: "/journal", icon: BookMarked, label: "اكتب مذكرة", color: "text-journal", bg: "bg-journal/10" },
  { href: "/reading", icon: BookOpen, label: "أضف كتاباً", color: "text-reading", bg: "bg-reading/10" },
];

function OnboardingCard() {
  return (
    <Card className="mdr-onboarding animate-fade-up">
      <div className="flex items-center gap-2 mb-1.5">
        <BrandMark size={26} />
        <h2 className="text-lg font-bold text-gray-800">ابدأ رحلتك في مدار</h2>
      </div>
      <p className="text-sm text-gray-500 leading-relaxed mb-4">
        مساحتك الشخصية لمتابعة صلواتك ومصاريفك ومذكراتك وقراءتك — وكلّها محفوظةٌ على جهازك وحده. اختر بدايةً:
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {QUICK_STARTS.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-3 press transition-colors hover:border-brand-300">
            <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${item.bg}`}>
              <item.icon size={18} className={item.color} />
            </span>
            <span className="text-sm font-semibold text-gray-700">{item.label}</span>
          </Link>
        ))}
      </div>
    </Card>
  );
}
