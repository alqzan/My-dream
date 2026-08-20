"use client";
import { useState, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { completedDayDates, activeRitualLabels } from "@/lib/dayAggregator";
import {
  today,
  toDateStr,
  formatDate,
  hijriDate,
  getPrayerLog,
  countDayPrayers,
  quranActivityDates,
  computeDailyBudgetStatus,
  formatAmount,
} from "@/lib/utils";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { PendingBankBanner } from "@/components/finance/PendingBankBanner";
import { InstallHint } from "@/components/layout/InstallHint";
import { DailyHabits } from "@/components/dashboard/DailyHabits";
import { PrayerOrbit } from "@/components/dashboard/PrayerOrbit";
import { SmartInsights } from "@/components/dashboard/SmartInsights";
import { WeeklyWrap } from "@/components/dashboard/WeeklyWrap";
import { RamadanCard } from "@/components/dashboard/RamadanCard";
import { CountdownCard } from "@/components/dashboard/CountdownCard";
import { DayView } from "@/components/day/DayView";
import { DayDigestCard } from "@/components/quran/DayDigestCard";
import { HifzReminder } from "@/components/quran/HifzReminder";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Confetti } from "@/components/ui/Confetti";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { StreakCalendar } from "@/components/journal/StreakCalendar";
import Link from "next/link";
import { ChevronLeft, BarChart3, TrendingDown, Plus, Wallet, BookMarked, BookOpen, History } from "lucide-react";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { BrandMark } from "@/components/layout/BrandMark";
import { SECTION, GOLD_LIGHT, SECTION_DEEP } from "@/lib/palette";
import { useRouter } from "next/navigation";
import { dueArc } from "@/lib/sundial";
import { arNum } from "@/lib/madar/format";
import { Sundial } from "@/components/madar/today/Sundial";
import { ThreeArcs, type ArcSpec } from "@/components/madar/today/ThreeArcs";

// تخطيط الرئيسية — **طبقتان** لا قائمةٌ واحدة. كانت اثنتي عشرة كتلةً متساوية
// الوزن البصريّ بلا شيءٍ يقول «هذا الأهمّ»، وما يخصّ اليوم مختلطٌ بما يُراجَع
// مرّةً في الأسبوع:
//
//   الترويسة   — التحية والتاريخ (هجري + ميلادي) ومدار السنة بأقماره.
//   «يومك»     — خلاصة اليوم · الصلوات · العادات | رمضان · العدّ التنازلي ·
//                زاد اليوم · بوصلة مدار.  (كلّه ظاهرٌ دائماً.)
//   «مراجعة»   — حصيلة الأسبوع · تقويم السلسلة · الروابط.  **مطويّ افتراضياً**:
//                يُقرأ مرّةً في الأسبوع لا عشرين مرّةً في اليوم، وفيه أطولُ
//                بطاقتين. لا شيء حُذف — نقرةٌ واحدة تفتحه.
//
// و«بوصلة مدار» تبقى خارج الطيّ عمداً: توصياتها تُنفَّذ الآن لا تُقرأ لاحقاً.
export default function Dashboard() {
  const router = useRouter();
  // منتقٍ لكلّ شريحة بدل `useAppStore()` المجرّدة: تلك تشترك بالحالة كلّها،
  // فتُعاد رسمُ الصفحة (وشجرتها) مع **أيّ** تعديلٍ في المتجر — ولو كان تعديلاً
  // لا يظهر على هذه الشاشة أصلاً.
  const journalEntries = useAppStore((s) => s.journalEntries);
  const readingLogs = useAppStore((s) => s.readingLogs);
  const transactions = useAppStore((s) => s.transactions);
  const books = useAppStore((s) => s.books);
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const habits = useAppStore((s) => s.habits);
  const quranWird = useAppStore((s) => s.quranWird);
  const quranHifz = useAppStore((s) => s.quranHifz);
  const quranReflections = useAppStore((s) => s.quranReflections);
  const quranKhatma = useAppStore((s) => s.quranKhatma);
  const frozenHabits = useAppStore((s) => s.frozenHabits);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [quickExpense, setQuickExpense] = useState(false);
  // قسم «مراجعة» مطويٌّ افتراضياً. الحالة محليّة عمداً — لا مفتاحَ تخزينٍ جديد
  // لتفضيلٍ ثانويّ (كلّ مفتاحٍ جديد يجب أن يُسجَّل في docs/APP-STORE-PLAN.md).
  const [reviewOpen, setReviewOpen] = useState(false);

  const todayStr = today();
  // نسبةُ السنة تُعرض في أعلى البهو كإشارةٍ واحدة هادئة، لا كمدارٍ إضافي
  // يزاحم أدوات اليوم. الحساب مشتقّ من التاريخ نفسه ولا يضيف حالةً جديدة.
  const yearPct = useMemo(() => {
    const [year, month, day] = todayStr.split("-").map(Number);
    const current = new Date(year, month - 1, day).getTime();
    const start = new Date(year, 0, 1).getTime();
    const next = new Date(year + 1, 0, 1).getTime();
    return Math.max(0, Math.min(100, Math.round(((current - start) / (next - start)) * 100)));
  }, [todayStr]);

  // العادات المجمّدة تختفي من التطبيق كلّه: لا تظهر أقمارها على مدار السنة ولا
  // تُحتسب. القراءة/المذكرة/الوِرد المجمّدة تُخفى قمرُها، والعادات المخصّصة
  // المجمّدة تُستثنى من قمر «العادات» الجامع.
  const frozen = useMemo(() => new Set(frozenHabits ?? []), [frozenHabits]);

  // السلسلة والتقويم والاحتفال — كلّها من تعريف «اليوم المكتمل» المركزي
  // (مذكرة · قراءة · وِرد، ويُستثنى المجمّد)، فلا يختلف يومٌ مكتملٌ بين شاشتين.
  //
  // **لماذا `useMemo` هنا تحديداً؟** الاثنتان تمرّان على المذكرات وسجلّات
  // القراءة والنشاط القرآنيّ **كلّها**. وبلا تذكّرٍ كانتا تُعادان في كلّ رسمة —
  // وهذه الصفحة تُعاد رسمُها مع أيّ تعديلٍ في المتجر مهما بَعُد عن هذه الحسبة.
  // بسنواتٍ من البيانات صار ذلك ملموساً على جوّالٍ متوسّط.
  const quranDates = useMemo(
    () => quranActivityDates({ quranWird, quranHifz, quranReflections, quranKhatma }),
    [quranWird, quranHifz, quranReflections, quranKhatma]
  );
  const completionDates = useMemo(
    () => completedDayDates({ journalEntries, readingLogs, quranActivity: quranDates, frozenHabits }),
    [journalEntries, readingLogs, quranDates, frozenHabits]
  );
  const ritualLabels = useMemo(() => activeRitualLabels(frozenHabits), [frozenHabits]);

  // ملخّصُ رأس «مراجعة» **وصفٌ لا رقم**، عمداً: بطاقةُ العادات فوقه تعرض
  // «١٤ يوم متواصل» بتعريفها هي (مذكرة + قراءة)، وسلسلةُ هذا القسم تعريفُها
  // آخر (يضاف الوِرد) — فرقمان مختلفان تحت العنوان نفسه على شاشةٍ واحدة
  // يقرآن تناقضاً لا معلومة. الوصفُ يقول ما تحت الطيّ بلا أن يزاحم.
  const reviewSummary = "حصيلة أسبوعك وتقويم سلسلتك";

  const allDoneToday = completionDates.includes(todayStr);

  // مؤشر القرآن في قوس اليوم يعتمد أيّ نشاطٍ قرآني (حفظ/مراجعة/تدبّر/ختمة/ورد)
  // تماماً كبطاقة «وِرد اليوم» و«خلاصة اليوم» — لا بنقرة الوِرد اليدوية وحدها.
  const hasTodayWird = quranDates.has(todayStr);

  /* ═══ ما تحتاجه المزولةُ والأقواسُ الثلاثة ═══ */

  // ساعةٌ تتقدّم كلَّ دقيقة: المزولةُ تقول «أين أنت من نهارك»، فساعةٌ مجمّدةٌ
  // على لحظةِ الفتح تكذب بعد قليل. الدقيقةُ كافيةٌ — الظلُّ لا يقفز أسرع.
  const [nowTick, setNowTick] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const prayedToday = countDayPrayers(getPrayerLog(prayerLogs, todayStr)).prayed;
  // أوجهُ الحفظ التي حان موعدُ مراجعتها اليوم — من مصدر الحقيقة نفسِه الذي
  // يقرؤه قسم القرآن، لا من عدٍّ ثانٍ هنا.
  // مواضعُ الخطأ التي لم تُتقن بعدُ ولم تُختبَر اليوم — هي «ما يستحقّ مراجعتك
  // الآن» في باب القرآن، لا كلُّ خطأٍ مسجّل.
  const hifzDueCount = useMemo(
    () => (quranHifz?.mistakes ?? []).filter((m) => !m.resolved && m.lastDrill !== todayStr).length,
    [quranHifz, todayStr]
  );
  const dueNow = dueArc(prayedToday, hifzDueCount);

  const dailyStatus = useMemo(
    () => (dailyBudget ? computeDailyBudgetStatus(dailyBudget, transactions) : null),
    [dailyBudget, transactions]
  );

  const arcSpecs: ArcSpec[] = [
    {
      key: "salah", label: "الصلاة",
      big: arNum(prayedToday), unit: `من ${arNum(5)}`,
      sub: prayedToday === 5 ? "يومٌ كامل" : `بقيت ${arNum(5 - prayedToday)}`,
      ratio: prayedToday / 5,
      color: "var(--clay)", wash: "var(--clayw)",
      onClick: () => router.push("/prayers"),
    },
    {
      key: "quran", label: "القرآن",
      big: hifzDueCount ? arNum(hifzDueCount) : "تمَّ",
      unit: hifzDueCount ? "للمراجعة" : "مراجعةُ اليوم",
      sub: hasTodayWird ? "وِردُ اليوم تمَّ" : "لم يُسجَّل وِردُك",
      ratio: hifzDueCount ? Math.max(0.12, 1 - hifzDueCount / 12) : 1,
      color: "var(--green)", wash: "var(--greenw)",
      onClick: () => router.push("/quran"),
    },
    {
      key: "mal", label: "المال",
      big: dailyStatus ? formatAmount(Math.round(Math.abs(dailyStatus.balance))) : "—",
      unit: dailyStatus ? (dailyStatus.balance < 0 ? "تجاوزتَ" : "ريالًا") : "بلا ميزانية",
      sub: dailyStatus ? (dailyStatus.balance < 0 ? "راجِع صرفك" : "يكفيك اليوم") : "اضبِط ميزانيتك",
      ratio: dailyStatus && dailyStatus.allowance > 0
        ? Math.max(0, Math.min(1, dailyStatus.balance / dailyStatus.allowance))
        : 0,
      color: "var(--blue)", wash: "var(--bluew)",
      onClick: () => router.push("/finance"),
    },
  ];

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

      {/* ═══ رأسُ اليوم — إيقاع البهو الجديد ═══
          التحيّة والتاريخ أولاً، ثم خلاصة اليوم وصلواته. القياسات القديمة
          (المزولة والأقواس) تبقى في درج «المزيد» ولا تزاحم القرار اليومي. */}
      <div className="mdr-home-header" style={{ padding: "0 4px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, padding: "8px 0 0" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 25, fontWeight: 900, lineHeight: 1.25 }}>{getGreeting()}</p>
            <p
              style={{
                margin: "6px 0 0", fontSize: 12.5, color: "var(--ink72)",
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              }}
            >
              <span>{hijriDate(todayStr)}</span>
              <span className="mdr-diamond" style={{ width: 5, height: 5 }} />
              <span style={{ color: "var(--ink52)" }}>{formatDate(todayStr)}</span>
            </p>
          </div>
        </div>

      </div>

      {isFirstRun && <OnboardingCard />}

      <div className="mdr-home-primary animate-fade-up">
        <HifzReminder />
        <DayDigestCard compact />
        <Card className="mdr-home-prayer-panel">
          <PrayerOrbit />
        </Card>
        <div className="mdr-home-year-countdown">
          <YearProgress pct={yearPct} />
          <RamadanCard />
          <CountdownCard />
        </div>
        <PendingBankBanner />
      </div>

      {/* ===== التفاصيل الثانوية =====
          التوصيات والقياسات القديمة وتحرير العادات تبقى متاحةً دون أن
          تنافس خلاصة اليوم في أول شاشة. */}
      {!isFirstRun && <details className="mdr-home-more">
        <summary>المزيد من البهو</summary>
        <div className="mdr-home-more-body">
          <SmartInsights showSecondary={false} />

          <details className="mdr-home-instrument-details">
            <summary>إيقاع اليوم</summary>
            <div className="mdr-home-instruments" aria-label="إيقاع اليوم">
              <Sundial todayStr={todayStr} now={nowTick} prayed={prayedToday} hifzDue={hifzDueCount} />
              <ThreeArcs due={dueNow} arcs={arcSpecs} />
            </div>
          </details>

          <details id="daily-habits" className="mdr-home-habits-details">
            <summary>إدارة العادات</summary>
            <div className="pt-3">
              <DailyHabits />
            </div>
          </details>
        </div>
      </details>}

      {/* ===== 2 — مراجعة =====
          حصيلةُ الأسبوع وتقويمُ السلسلة والروابط: تُقرأ مرّةً في الأسبوع لا
          عشرين مرّةً في اليوم، وهما أطولُ بطاقتين في الصفحة. مطويّةٌ افتراضياً
          فتختصر ذيل الرئيسية، ونقرةٌ واحدة تفتحها — ولا شيء حُذف.
          (نفس نمط أقسام صفحة الأموال، ونفس المكوّن.) */}
      <CollapsibleSection
        id="review"
        title="مراجعة"
        tone="brand"
        icon={<History size={16} />}
        summary={reviewSummary}
        open={reviewOpen}
        onToggle={() => setReviewOpen((v) => !v)}
      >
        <div className="page-grid pt-1">
          <div className="space-y-5">
            <WeeklyWrap
              transactions={transactions}
              journalEntries={journalEntries}
              readingLogs={readingLogs}
              books={books}
              quranHifz={quranHifz}
            />

          <div className="grid grid-cols-2 gap-3 mdr-review-links">
            <Link href="/finance/insights" className="block">
                <div className="relative overflow-hidden rounded-2xl p-4 mdr-review-link mdr-review-link--green press h-full">
                  <div className="mdr-review-link-icon">
                    <TrendingDown size={18} />
                  </div>
                  <p className="text-sm font-bold">متابعة الصرف</p>
                  <p className="text-[11px] opacity-80 mt-0.5">أسبوعي · شهري · سنوي</p>
                  <ChevronLeft size={16} className="absolute top-4 left-3 opacity-70" />
                </div>
              </Link>
            <Link href="/stats" className="block">
                <div className="relative overflow-hidden rounded-2xl p-4 mdr-review-link mdr-review-link--gold press h-full">
                  <div className="mdr-review-link-icon">
                    <BarChart3 size={18} />
                  </div>
                  <p className="text-sm font-bold">إحصائياتك الكاملة</p>
                  <p className="text-[11px] opacity-80 mt-0.5">خريطة سنتك ومزاجك</p>
                  <ChevronLeft size={16} className="absolute top-4 left-3 opacity-70" />
                </div>
              </Link>
            </div>
          </div>

          <div className="space-y-5">
            <Card>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-gray-700">
                  {ritualLabels.length ? `سلسلة يومية — ${ritualLabels.join(" + ")}` : "سلسلة يومية"}
                </span>
                <span className="text-xs text-gray-400">اضغط أي يوم</span>
              </div>
              <StreakCalendar markedDates={completionDates} color={SECTION_DEEP.brand} onDayClick={setSelectedDay} />
            </Card>

            <InstallHint />
          </div>
        </div>
      </CollapsibleSection>

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
      <Modal open={quickExpense} onClose={() => setQuickExpense(false)} title="مصروف سريع">
        <TransactionForm onClose={() => setQuickExpense(false)} />
      </Modal>
    </div>
  );
}

function YearProgress({ pct }: { pct: number }) {
  return (
    <div className="mdr-year-progress" aria-label={`مضى ${pct}% من السنة`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-bold">نسبة السنة</span>
        <span className="text-sm font-black tabular-nums">{arNum(pct)}٪</span>
      </div>
      <div className="mdr-year-progress-track" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
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
