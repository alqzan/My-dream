"use client";
import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { completedDayDates } from "@/lib/dayAggregator";
import {
  today,
  toDateStr,
  formatDate,
  hijriDate,
  quranActivityDates,
} from "@/lib/utils";
import { PendingBankBanner } from "@/components/finance/PendingBankBanner";
import { WeeklySummary } from "@/components/dashboard/WeeklySummary";
import { RamadanCard } from "@/components/dashboard/RamadanCard";
import { CountdownCard } from "@/components/dashboard/CountdownCard";
import { DayDigestCard } from "@/components/quran/DayDigestCard";
import { HifzReminder } from "@/components/quran/HifzReminder";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/ui/Confetti";
import { TransactionForm } from "@/components/finance/TransactionForm";
import Link from "next/link";
import { Plus, Wallet, BookMarked, BookOpen } from "lucide-react";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { BrandMark } from "@/components/layout/BrandMark";
import { SECTION, GOLD_LIGHT } from "@/lib/palette";
import { arNum } from "@/lib/madar/format";

// بهوٌ واحدٌ لليوم: رأس هادئ، ورد، خلاصة واحدة، ثم حدثٌ قادم وحصيلة أسبوعية
// قصيرة. التفاصيل العميقة تبقى في صفحاتها الأصلية ولا تتحول الرئيسية إلى لوحة
// أدوات أو صفحة مراجعة ثانية.
export default function Dashboard() {
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);
  const transactions = useAppStore((s) => s.transactions);
  const books = useAppStore((s) => s.books);
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const habits = useAppStore((s) => s.habits);
  const quranWird = useAppStore((s) => s.quranWird);
  const quranHifz = useAppStore((s) => s.quranHifz);
  const quranReflections = useAppStore((s) => s.quranReflections);
  const quranKhatma = useAppStore((s) => s.quranKhatma);
  const frozenHabits = useAppStore((s) => s.frozenHabits);
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

  return (
    <div className="page-shell page-shell--wide mdr mdr-home">
      {celebrate && <Confetti />}

      {/* ═══ رأس البهو ═══ */}
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

      {isFirstRun && <OnboardingCard />}

      <div className="mdr-home-primary animate-fade-up">
        <HifzReminder />
        <DayDigestCard compact />
        <RamadanCard />
        <CountdownCard />
        <PendingBankBanner />
      </div>

      <WeeklySummary
        transactions={transactions}
        journalEntries={journalEntries}
        readingLogs={readingLogs}
        quranHifz={quranHifz}
      />

      {/* Quick-add expense — the most frequent daily action, always two
          taps away instead of a trip through the الأموال tab. */}
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
    <div className="mdr-year-progress" aria-label={`مضى ${pct}% من السنة`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={`${(circumference * pct) / 100} ${circumference}`}
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dasharray 900ms cubic-bezier(.16,1,.3,1)" }}
        />
      </svg>
      <div>
        <span>نسبة السنة</span>
        <strong>{arNum(pct)}٪</strong>
        <small>من العام</small>
      </div>
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
    <Card className="animate-fade-up mdr-onboarding">
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
  pct, prayer, journal, reading, habits, wird, hifz,
  journalFrozen, readingFrozen, wirdFrozen, habitsShown,
}: {
  pct: number;
  prayer: boolean;
  journal: boolean;
  reading: boolean;
  habits: boolean;
  wird: boolean;
  hifz: boolean | null; // null = لا خطة حفظ → لا يُعرض قمرها
  journalFrozen: boolean; // القراءة/المذكرة/الوِرد المجمّدة تُخفى أقمارها كلّياً
  readingFrozen: boolean;
  wirdFrozen: boolean;
  habitsShown: boolean; // يُخفى قمر «العادات» متى جُمِّدت كلّ العادات المخصّصة
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
  // أقمار اليوم موزّعة بالتساوي على المدار — تُضاف الحفظ (متى وُجدت خطة) بلونها
  // الأخضر القرآني إلى جانب بقية الممارسات. زاويةُ كلٍّ تُحسب بالتساوي حسب العدد.
  const base = [
    { key: "prayer", label: "الصلاة", color: SECTION.prayer, done: prayer, href: "/prayers" as string | null },
    ...(wirdFrozen ? [] : [{ key: "wird", label: "الورد", color: SECTION.quran, done: wird, href: "/quran" as string | null }]),
    ...(hifz != null ? [{ key: "hifz", label: "الحفظ", color: SECTION.quran, done: hifz, href: "/quran?tab=hifz" as string | null }] : []),
    ...(journalFrozen ? [] : [{ key: "journal", label: "المذكرة", color: SECTION.journal, done: journal, href: "/journal" as string | null }]),
    ...(readingFrozen ? [] : [{ key: "reading", label: "القراءة", color: SECTION.reading, done: reading, href: "/reading" as string | null }]),
    ...(habitsShown ? [{ key: "habits", label: "العادات", color: SECTION.brand, done: habits, href: null as string | null }] : []),
  ];
  const moons = base.map((m, i) => ({ ...m, angle: -90 + (i * 360) / base.length })).map((m) => ({
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
            <stop offset="0%" stopColor={GOLD_LIGHT} />
            <stop offset="100%" stopColor={SECTION.reading} />
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
          cx={dotX} cy={dotY} r={4.5} fill={GOLD_LIGHT}
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
