"use client";
import { useMemo, useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import {
  getJournalStreak,
  getReadingStreak,
  getPrayerStreak,
  countDayPrayers,
  calcStreak,
  longestStreak,
  formatAmount,
  arabicMonthName,
  quranActivityDates,
  cashOut,
  today,
} from "@/lib/utils";
import { completedDayDates } from "@/lib/dayAggregator";
import { Card } from "@/components/ui/Card";
import { SectionSignet } from "@/components/layout/SectionSignet";
import { StatInstrument } from "@/components/stats/StatInstrument";
import { HifzStatCard } from "@/components/quran/HifzStatCard";
import { YearHeatmap } from "@/components/stats/YearHeatmap";
import dynamic from "next/dynamic";
// Charts (recharts) load on demand so the stats shell paints without waiting
// on ~90KB of charting code. The placeholder keeps the card height stable.
const MonthlyBars = dynamic(
  () => import("@/components/stats/MonthlyBars").then((m) => m.MonthlyBars),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gray-100 rounded-xl" /> }
);
import { Flame, Trophy, BookOpen, Wallet, BookMarked, BookCheck, CalendarCheck } from "lucide-react";
import { SECTION } from "@/lib/palette";
import { windowStats, yearPetals, yearAverage, yearInventory, pctOf } from "@/lib/hasila";
import { arNum, arPct } from "@/lib/madar/format";
import { SectionHead } from "@/components/madar/primitives";
import {
  KpiGrid, YearBloom, DoorRows, PrayerScale, YearInventory,
  type Kpi, type DoorRow,
} from "@/components/madar/hasila/HasilaParts";

export default function StatsPage() {
  const {
    journalEntries, readingLogs, transactions, books, prayerLogs, readingGoal, frozenHabits,
    quranWird, quranHifz, quranReflections, quranKhatma,
  } = useAppStore();

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
    .reduce((s, t) => s + cashOut(t), 0);
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
  // العادات المجمّدة تُستثنى هنا كما في الرئيسية: القراءة/المذكرة المجمّدة تختفي
  // من القائمة ولا تدخل في «السلسلة الكاملة» (تُبنى من الطقوس النشطة فقط).
  const frozen = new Set(frozenHabits ?? []);
  const journalActive = !frozen.has("core:journal");
  const readingActive = !frozen.has("core:reading");

  // «السلسلة الكاملة» = «اليوم المكتمل» بتعريفه المركزي الوحيد (مذكرة · قراءة ·
  // وِرد قرآني، ويُستثنى المجمّد) — نفس ما يقود تقويم الرئيسية وشارة DayView. كان
  // هنا تعريفٌ ثالثٌ يعرف المذكرة والقراءة فقط، فاختلف الرقم بين الشاشتين.
  const completionDates = completedDayDates({
    journalEntries,
    readingLogs,
    quranActivity: quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma }),
    frozenHabits,
  });

  const streaks = [
    {
      label: "السلسلة الكاملة",
      icon: <CalendarCheck size={16} />,
      color: SECTION.brand,
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
    ...(journalActive ? [{
      label: "المذكرات",
      icon: <BookMarked size={16} />,
      color: SECTION.journal,
      current: getJournalStreak(journalEntries),
      best: longestStreak(journalEntries.map((e) => e.date)),
    }] : []),
    ...(readingActive ? [{
      label: "القراءة",
      icon: <BookOpen size={16} />,
      color: SECTION.reading,
      current: getReadingStreak(readingLogs),
      best: longestStreak(readingLogs.map((l) => l.date)),
    }] : []),
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
      if (m) m.مصاريف += cashOut(t);
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

  /* ═══ حساباتُ الحصيلة المنقولة ═══ */
  const todayStr = today();
  const habits = useAppStore((st) => st.habits);
  const benefits = useAppStore((st) => st.benefits ?? []);
  const win = useMemo(
    () => windowStats(todayStr, { prayerLogs, journalEntries, readingLogs, habits, transactions }),
    [todayStr, prayerLogs, journalEntries, readingLogs, habits, transactions]
  );
  const petals = useMemo(() => yearPetals(prayerLogs, todayStr), [prayerLogs, todayStr]);
  const yearAvg = yearAverage(petals);
  const inventory = useMemo(
    () => yearInventory(Number(year), { journalEntries, readingLogs, books, prayerLogs, benefits }),
    [year, journalEntries, readingLogs, books, prayerLogs, benefits]
  );

  const kpis: Kpi[] = [
    {
      label: "الصلواتُ المسجَّلة",
      value: arPct(win.prayedTotal / Math.max(1, win.days.length * 5)),
      delta: `${arNum(win.jamaah)} جماعة`,
      color: "var(--clay)", deltaColor: "var(--green)",
      pct: pctOf(win.prayedTotal, win.days.length * 5),
    },
    {
      label: "صفحاتٌ قرأت",
      value: arNum(win.pagesTotal),
      delta: `${arNum(win.pages.filter((x) => x > 0).length)} يومًا`,
      color: "var(--green)", deltaColor: "var(--ink34)",
      pct: Math.min(100, win.pagesTotal),
    },
    {
      label: "أيامٌ كتبتَها",
      value: `${arNum(win.wroteDays)}/${arNum(win.days.length)}`,
      delta: win.wroteDays >= 20 ? "انتظام" : "متقطِّع",
      color: "var(--blue)", deltaColor: "var(--ink34)",
      pct: pctOf(win.wroteDays, win.days.length),
    },
    {
      label: "العادات",
      value: arPct(win.habitsCap ? win.habitsTotal / win.habitsCap : 0),
      delta: `من ${arNum(habits.length)}`,
      color: "var(--gold)", deltaColor: "var(--ink34)",
      pct: pctOf(win.habitsTotal, win.habitsCap),
    },
  ];

  const doorRows: DoorRow[] = [
    {
      key: "salah", label: "الصلاة", color: "var(--clay)", series: win.prayed,
      value: `${arNum(win.prayedTotal)} فرضًا`,
      note: `${arNum(win.jamaah)} منها في جماعة · ${arPct(win.prayedTotal / Math.max(1, win.days.length * 5))} من الخمس`,
    },
    {
      key: "reading", label: "القراءة", color: "var(--green)", series: win.pages,
      value: `${arNum(win.pagesTotal)} صفحة`,
      note: `${arNum(win.pages.filter((x) => x > 0).length)} يومًا قرأتَ فيه`,
    },
    {
      key: "writing", label: "الكتابة", color: "var(--blue)", series: win.wrote,
      value: `${arNum(win.wroteDays)} يومًا`,
      note: win.wroteDays >= 20 ? "شهرٌ مكتوبٌ في أكثره" : "الأيامُ التي لا تُكتب تسقط من سنتك",
    },
    {
      key: "habits", label: "العادات", color: "var(--gold)", series: win.habits,
      value: `${arNum(win.habitsTotal)} مرَّة`,
      note: `${arPct(win.habitsCap ? win.habitsTotal / win.habitsCap : 0)} من المتاح`,
    },
    {
      key: "mal", label: "المال", color: "var(--ink)", series: win.spend,
      value: formatAmount(win.spendTotal),
      note: `${arNum(win.spend.filter((x) => x > 0).length)} يومًا فيه صرف`,
    },
  ];

  // جملةٌ واحدةٌ صادقة: لا تُقال إلا إن كان في البيانات ما يُقال.
  const insight =
    win.prayedTotal === 0 && win.wroteDays === 0
      ? "ابدأ بيومٍ واحدٍ كاملٍ تُسجِّل فيه كلَّ شيء، وستقرأ هنا نمطَك بعد أسبوع."
      : win.wroteDays >= 20 && win.prayedTotal >= win.days.length * 4
        ? "شهرٌ ثابت: كتبتَ أكثرَ أيامه وحافظتَ على أكثرِ فرائضه. الثباتُ أنفعُ من الوثبة."
        : win.wroteDays < 8
          ? `كتبتَ ${arNum(win.wroteDays)} من ${arNum(win.days.length)} يومًا. الأيامُ التي لا تُكتب لا تُستعاد.`
          : `${arNum(win.jamaah)} فرضًا في جماعة هذا الشهر — وهو أكثرُ ما يثبت البقيّة.`;

  return (
    <div className="page-shell mdr">
      {/* ═══ الحصيلة — منقولةٌ من تصميم مدار ═══
          تُوضع فوق التفاصيل القديمة لا بدلاً منها: هذه قراءةٌ سريعةٌ للحال،
          وتلك أدواتُ تنقيبٍ يحتاجها من أراد التفصيل. */}
      <div style={{ padding: "0 20px 8px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "16px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 25, fontWeight: 900, lineHeight: 1.25 }}>الحصيلة</p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink72)" }}>
              سنةُ الالتزام · الحفظ · الصلاة · المال
            </p>
          </div>
          <span className="mdr-star" style={{ width: 24, height: 24 }} />
        </div>

        <KpiGrid kpis={kpis} />
        <YearBloom petals={petals} average={yearAvg} />
        <DoorRows rows={doorRows} />

        <p
          style={{
            margin: "12px 0 0", padding: "16px 18px", borderRadius: 22,
            background: "var(--paper2)", border: "1px solid var(--gline)",
            fontSize: 13, lineHeight: 2, color: "var(--ink72)",
          }}
        >
          {insight}
        </p>

        <SectionHead title="ميزانُ الفرائض" marginTop={26} marginBottom={0} />
        <PrayerScale logs={prayerLogs} todayStr={todayStr} />

        <YearInventory rows={inventory} year={Number(year)} />

        <SectionHead title="تفصيلٌ أعمق" marginTop={30} marginBottom={0} />
      </div>

      <div className="animate-fade-up">
        <div className="flex items-center gap-2.5">
          <SectionSignet href="/stats" />
          <h1 className="page-title">إحصائياتي</h1>
        </div>
        <p className="page-subtitle">رحلتك في {year} بالأرقام</p>
      </div>

      {/* Hero numbers — أربع أدواتٍ صغيرة بلغة اللوحة نفسها (سطح كريمي، حدٌّ
          ذهبي، ونجمُ القسم لونًا للعدد وحلقةً صغيرة) تمهيدًا لإسطرلاب السنة تحتها.
          حلقةُ «الكتب» مقياسٌ حقيقيّ نحو هدف القراءة؛ البقية مداراتٌ زخرفية. */}
      <div className="grid grid-cols-2 gap-3 animate-fade-up stagger-1">
        <StatInstrument
          value={entriesThisYear}
          label="مذكرة هذا العام"
          color={SECTION.journal}
          icon={<BookMarked size={15} />}
        />
        <StatInstrument
          value={pagesThisYear}
          label="صفحة قرأتها"
          color={SECTION.reading}
          icon={<BookOpen size={15} />}
        />
        <StatInstrument
          value={booksFinished}
          label="كتاب أنهيته"
          color={SECTION.brand}
          icon={<BookCheck size={15} />}
          goal={readingGoal ?? undefined}
        />
        <StatInstrument
          value={spentThisYear}
          label="ر.س مصاريف العام"
          color={SECTION.finance}
          icon={<Wallet size={15} />}
        />
      </div>

      {/* Quran memorization summary (يظهر متى وُجدت خطة حفظ) */}
      <HifzStatCard />

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
        <div className="space-y-3.5">
          {streaks.map((s) => (
            <div key={s.label}>
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: s.color + "18", color: s.color }}
                >
                  {s.icon}
                </span>
                <span className="text-xs font-medium text-gray-700">{s.label}</span>
              </div>
              <RecordTrack current={s.current} best={s.best} color={s.color} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-4 mt-3 pt-2 border-t border-gray-100 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><Trophy size={10} /> الأفضل (الرقم القياسي)</span>
          <span className="flex items-center gap-1"><Flame size={10} /> الحالية</span>
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
              color={SECTION.finance}
              cursorFill="rgba(61,150,64,0.08)"
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
              color={SECTION.reading}
              cursorFill="rgba(193,102,63,0.06)"
              yWidth={36}
              format={(v) => `${formatAmount(v)} صفحة`}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// A short horizontal race-track (مضمار) for one streak record: the far end holds
// the Trophy at your all-time best (the record), and a Flame marker sits at your
// current streak's position toward it — so "how close am I to my record" reads at
// a glance. Fills from the left start toward the record (right). Thin gold
// line-work; the progress + markers tint with the row's own section colour.
const REC_START = 10; // % from left — the "0" start (left edge)
const REC_END = 90; // % from left — the record end (right edge, trophy)

function RecordTrack({ current, best, color }: { current: number; best: number; color: string }) {
  const reduce = prefersReducedMotion();
  const [on, setOn] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(t);
  }, [reduce]);

  const f = best > 0 ? Math.min(1, Math.max(0, current / best)) : 0;
  const fv = on ? f : 0;
  const flameX = REC_START - fv * (REC_START - REC_END);
  const atRecord = best > 0 && current >= best;
  const trans = reduce ? undefined : "left 1s cubic-bezier(0.16,1,0.3,1)";

  return (
    <div className="relative h-9 mt-1">
      {/* base track line — thin faint gold */}
      <div
        className="absolute top-[64%] -translate-y-1/2 h-[2px] rounded-full"
        style={{ left: `${REC_START}%`, right: `${100 - REC_END}%`, backgroundColor: SECTION.brand, opacity: 0.28 }}
      />
      {/* progress line — section colour, from the start (left) to the flame */}
      <div
        className="absolute top-[64%] -translate-y-1/2 h-[3px] rounded-full"
        style={{ left: `${REC_START}%`, right: `${100 - flameX}%`, backgroundColor: color, opacity: 0.9, transition: trans }}
      />

      {/* Trophy at the record end + best value above it */}
      <div
        className="absolute top-[64%] -translate-y-1/2 -translate-x-1/2 flex items-center justify-center rounded-full"
        style={{ left: `${REC_END}%`, width: 18, height: 18, backgroundColor: atRecord ? SECTION.brand : "#fff7e6", boxShadow: `0 0 0 1.4px ${atRecord ? SECTION.brand : "rgba(201,133,42,0.55)"}` }}
      >
        <Trophy size={10} style={{ color: atRecord ? "#fff" : SECTION.brand }} />
      </div>
      <span className="absolute top-0 -translate-x-1/2 text-[11px] font-bold tabular-nums text-brand-600" style={{ left: `${REC_END}%` }}>{best}</span>

      {/* Flame marker at the current position + current value above it */}
      <div
        className="absolute top-[64%] -translate-y-1/2 -translate-x-1/2 flex items-center justify-center rounded-full"
        style={{ left: `${flameX}%`, width: 18, height: 18, backgroundColor: "#fff", boxShadow: `0 0 0 1.4px ${current > 0 ? color : "#d7cbb4"}`, transition: trans }}
      >
        <Flame size={10} style={{ color: current > 0 ? "#f97316" : "#c9bda0" }} />
      </div>
      <span
        className="absolute top-0 -translate-x-1/2 text-[11px] font-bold tabular-nums"
        style={{ left: `${flameX}%`, color: current > 0 ? color : "#a2947a", transition: trans }}
      >
        {current}
      </span>
    </div>
  );
}

