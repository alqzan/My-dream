"use client";
import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { DailyBudgetCard } from "@/components/finance/DailyBudgetCard";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { BankImport } from "@/components/finance/BankImport";
import { RecurringManager } from "@/components/finance/RecurringManager";
import { UpcomingRecurring } from "@/components/finance/UpcomingRecurring";
import { BudgetTracker } from "@/components/finance/BudgetTracker";
import { CategoryManager } from "@/components/finance/CategoryManager";
import { ReserveFunds } from "@/components/finance/ReserveFunds";
import { InstallmentPlans } from "@/components/finance/InstallmentPlans";
import { Assets } from "@/components/finance/Assets";
import { Shelf } from "@/components/madar/mal/Shelf";
import { SalaryBanner } from "@/components/finance/SalaryBanner";
import { SpendCalendar } from "@/components/finance/SpendCalendar";
import { FinanceCycleDashboard } from "@/components/finance/FinanceCycleDashboard";
import { PendingBankBanner } from "@/components/finance/PendingBankBanner";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionSignet } from "@/components/layout/SectionSignet";
import type { Transaction, ShelfItem } from "@/lib/types";
import { Plus, Smartphone, Repeat, Tags, ChevronLeft, Search, X, Wallet, Gauge, Landmark, CalendarClock, Package, Hourglass } from "lucide-react";
import { getCategoryInfo, normalizeArabic, formatAmount, today, uid } from "@/lib/utils";
import {
  buildFinanceOverview, budgetAlerts, defaultPlanOpen, planSectionFromHash, historySlice,
  PLAN_SECTIONS, type PlanSectionId,
} from "@/lib/financeOverview";
import { assetsOverview } from "@/lib/assets";
import { spendWindow, nextSalaryDate } from "@/lib/budgetCycle";
import { buildCycleCurve } from "@/lib/cycleCurve";
import { budgetStatuses } from "@/lib/budgetStatus";
import { waitingItems, savedTotal, isRipe } from "@/lib/shelf";
import {
  readFinanceDisplayVisibility,
  saveFinanceDisplayVisibility,
  isFinanceDisplayVisible,
  type FinanceDisplayId,
  type FinanceDisplayVisibility,
} from "@/lib/financePreferences";
import { showUndo } from "@/components/ui/UndoToast";

// شارة تحذيرٍ حمراء صغيرة لرأس قسمٍ مطويّ (تبقى ظاهرةً دون فتحه).
function AlertBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{children}</span>
  );
}

// شارةُ «نضج» — بلون الثيم لا بلون تحذيرٍ مستقل: هذا إذنٌ بالحكم بعد أن هدأتَ.
function RipeBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] font-bold text-white bg-finance rounded-full px-2 py-0.5">{children}</span>
  );
}

const HISTORY_PAGE = 20;
const SECTIONS_KEY = "madar-finance-sections"; // تفضيل الفتح/الطي جهازيّ (لا يُزامَن)

function readSavedSections(): Partial<Record<PlanSectionId, boolean>> | null {
  if (typeof window === "undefined") return null;
  try {
    const r = JSON.parse(window.localStorage.getItem(SECTIONS_KEY) || "null");
    return r && typeof r === "object" ? r : null;
  } catch {
    return null;
  }
}

export default function FinancePage() {
  const {
    transactions, recurring, installmentPlans, assets, categories, dailyBudget, reserves, budgets, salaryDay, lastSalaryConfirm, budgetWindow, monthlyIncome,
    shelfItems, deleteTransaction, addTransaction,
    addShelfItem, updateShelfItem, deleteShelfItem, releaseShelfItem, renewShelfItem, buyShelfItem,
  } = useAppStore();

  // Instant delete + 5s undo window.
  function handleDelete(id: string) {
    const tx = transactions.find((t) => t.id === id);
    deleteTransaction(id);
    if (tx) showUndo("حذفت المصروف", () => addTransaction(tx));
  }
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [importSms, setImportSms] = useState<string | null>(null);
  // عنصرُ الرفّ الذي نضج ويُشترى الآن: نفتح به نموذجَ المصروف نفسَه (لا مساراً
  // ثانياً للصرف) ثمّ نربط المعاملة بالعنصر بمعرّفها. هكذا يمرّ الشراء بكلّ ما
  // يمرّ به أيّ مصروف — الميزانية اليومية والسقوف والسجل — بلا استثناء.
  const [buyingShelf, setBuyingShelf] = useState<ShelfItem | null>(null);
  // حالة فتح أقسام «الخطة»: افتراضٌ ثابت (الميزانية اليومية) يطابق الخادم، ثمّ
  // نطبّق التفضيل المحفوظ محلياً + أي قسمٍ يطلبه رابطٌ عميق بعد التركيب.
  const [openSections, setOpenSections] = useState<Record<PlanSectionId, boolean>>(
    () => defaultPlanOpen({ budgetAttention: false, negativeBalance: false, installmentOverdue: false })
  );
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [financeView, setFinanceView] = useState<"cycle" | "now">("cycle");
  const [financeVisibility, setFinanceVisibility] = useState<FinanceDisplayVisibility>({});
  const [financeVisibilityReady, setFinanceVisibilityReady] = useState(false);

  useEffect(() => {
    setFinanceVisibility(readFinanceDisplayVisibility());
    setFinanceVisibilityReady(true);
  }, []);

  useEffect(() => {
    if (financeVisibilityReady) saveFinanceDisplayVisibility(financeVisibility);
  }, [financeVisibility, financeVisibilityReady]);

  function isFinanceSectionVisible(id: FinanceDisplayId): boolean {
    return isFinanceDisplayVisible(financeVisibility, id);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sms = params.get("sms");
    if (sms && sms.trim()) {
      setImportSms(sms);
      setShowImport(true);
    } else if (params.get("import") === "1") {
      setShowImport(true);
    }
    if (params.has("sms") || params.has("import")) {
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", clean);
    }
  }, []);

  // إن وصل رابطٌ عميق إلى قسم أخفاه المستخدم، نعيد إظهاره لهذا الوصول فقط؛
  // لا يتحول الرابط إلى شاشة فارغة ولا نغيّر تفضيله المحفوظ بلا طلب.
  useEffect(() => {
    if (!financeVisibilityReady) return;
    const hash = window.location.hash.slice(1);
    const id = hash === "history" ? "history" : planSectionFromHash(hash);
    if (id && !isFinanceDisplayVisible(financeVisibility, id as FinanceDisplayId)) {
      setFinanceVisibility((current) => ({ ...current, [id as FinanceDisplayId]: true }));
    }
  }, [financeVisibility, financeVisibilityReady]);

  // الروابط العميقة + التفضيل المحفوظ: ‎?open=add|recurring|categories‎ تفتح
  // النافذة، و‎#daily/#budgets/#recurring/#installments/#reserves/#history‎ تفتح القسم المطويّ
  // المقصود *قبل* التمرير إليه. التفضيل المحفوظ يُطبَّق أوّلاً ثمّ يعلوه فتح الرابط.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const open = params.get("open");
    if (open === "recurring") setShowRecurring(true);
    else if (open === "categories") setShowCategories(true);
    else if (open === "add") setShowForm(true);
    if (open) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
    const saved = readSavedSections();
    const hash = window.location.hash.slice(1);
    const hashSection = planSectionFromHash(hash);
    if (hash === "history") setHistoryOpen(true);
    // بلا تفضيلٍ محفوظ نفتح ما يحتاج انتباهاً فعلاً (قسطٌ فائت ← سقفٌ متجاوَز ←
    // الميزانية اليومية). القيم تُقرأ من مرجعٍ (ref) فيبقى الأثر لمرّة الوصول
    // وحدها ولا يُقحم قيماً متغيّرة في اعتماديّاته.
    const base = saved ?? defaultPlanOpen(attentionRef.current);
    setOpenSections((prev) => ({
      ...prev, ...base, ...(hashSection ? { [hashSection]: true } : {}),
    }));
    if (hash) {
      const t = setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 250);
      return () => clearTimeout(t);
    }
  }, []);

  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const currentMonth = today().slice(0, 7);

  const byMonth = transactions.filter((t) => t.date.startsWith(monthFilter));

  const [txSearch, setTxSearch] = useState("");
  const q = normalizeArabic(txSearch.trim());
  const shownTx = q
    ? byMonth.filter((t) => {
        const label = normalizeArabic(getCategoryInfo(categories, t.category).label);
        return normalizeArabic(t.note ?? "").includes(q) || label.includes(q);
      })
    : byMonth;
  // أحدث أولاً + ترقيمٌ خفيف («إظهار المزيد») فلا يُصبّ السجلّ كاملاً دفعةً واحدة.
  const sortedTx = useMemo(() => [...shownTx].sort((a, b) => b.date.localeCompare(a.date)), [shownTx]);
  const { visible: visibleTx, hasMore: hasMoreTx, remaining: remainingTx } = historySlice(sortedTx, historyLimit);
  useEffect(() => { setHistoryLimit(HISTORY_PAGE); }, [monthFilter, txSearch]);

  // «نظرة اليوم» + تنبيهات السقوف — تجميعٌ عرضيّ يعيد استعمال دوالّ الحساب القائمة.
  const overview = useMemo(
    () => buildFinanceOverview({
      dailyBudget, transactions, reserves, recurring, installmentPlans,
      salaryDay: salaryDay ?? 27, monthPrefix: currentMonth, todayStr: today(),
    }),
    [dailyBudget, transactions, reserves, recurring, installmentPlans, salaryDay, currentMonth]
  );
  // ملخّص الأصول لرأس القسم — حسابٌ نقيّ من assets.ts، بلا أثرٍ على أيّ صرف.
  const assetsSummary = useMemo(() => assetsOverview(assets ?? [], today()), [assets]);
  // ملخّص الرفّ لرأس القسم: كم ينتظر، وكم نضج، وكم وفَّرتَ بتركِه — كلُّها مشتقّة.
  const shelfSummary = useMemo(() => {
    const list = shelfItems ?? [];
    const todayStr = today();
    const waiting = waitingItems(list);
    const ripe = waiting.filter((k) => isRipe(k, todayStr)).length;
    const saved = savedTotal(list);
    // «نضج» تُقال مرّةً واحدة — في الشارة. تكرارُها في الملخّص ضجيجٌ لا خبر.
    const text = waiting.length === 0
      ? saved > 0 ? `وفَّرت ${formatAmount(saved)} ر.س بتركِه` : "لا شيء على الرفّ"
      : `${formatAmount(waiting.length)} ينتظر`;
    return { waiting: waiting.length, ripe, saved, text };
  }, [shelfItems]);
  // تنبيهات السقوف على نافذة دورة الراتب (لا الشهر الميلادي) — نفس نافذة
  // BudgetTracker، فتتصفّر مع تأكيد «نزل الراتب».
  const cycleStart = useMemo(
    () => spendWindow(budgetWindow, lastSalaryConfirm, salaryDay ?? 27, today()),
    [budgetWindow, lastSalaryConfirm, salaryDay]
  );
  const alerts = useMemo(
    () => budgetAlerts(budgets, transactions, categories, monthlyIncome, cycleStart),
    [budgets, transactions, categories, monthlyIncome, cycleStart]
  );
  // لو بدأت الميزانية اليومية في منتصف دورة الراتب فلا يجوز للمنحنى أن يمنح
  // بدلاً عن الأيام التي سبقت إنشاءها. السقوف تظل على دورة الراتب كاملة؛ هذا
  // التصحيح خاص بخط الميزانية اليومية وحده.
  const curveStart = useMemo(
    () => dailyBudget?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(cycleStart) && dailyBudget.startDate > cycleStart
      ? dailyBudget.startDate
      : cycleStart,
    [dailyBudget?.startDate, cycleStart]
  );
  // منحنى الدورة: صرفٌ تراكميٌّ فوق خطِّ الخطّة من الراتب إلى الراتب. يُقاس
  // ببدلِ الميزانية اليومية و`dailyShare` نفسِهما، فلا تعطي الشاشةُ الواحدة
  // رقمين متناقضين — وبلا ميزانيةٍ يومية لا يُرسم أصلاً (لا خطَّ يُقاس عليه).
  const cycleCurve = useMemo(
    () => buildCycleCurve(dailyBudget, transactions, curveStart, nextSalaryDate(salaryDay ?? 27, today()), today()),
    [dailyBudget, transactions, curveStart, salaryDay]
  );
  const budgetRows = useMemo(
    () => budgetStatuses(budgets, transactions, categories, monthlyIncome, cycleStart),
    [budgets, transactions, categories, monthlyIncome, cycleStart]
  );
  // ما يستحقّ الفتح عند أوّل زيارةٍ بلا تفضيلٍ محفوظ — في مرجعٍ يُقرأ داخل تأثير
  // الوصول (لا يُعاد تشغيله مع كل تغيّر رقم).
  const attentionRef = useRef({ budgetAttention: false, negativeBalance: false, installmentOverdue: false });
  attentionRef.current = {
    budgetAttention: alerts.over > 0 || alerts.near > 0,
    negativeBalance: overview.hasBudget && overview.availableToday < 0,
    installmentOverdue: overview.installments.overdueCount > 0,
  };

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();

  function monthLabel(m: string) {
    const [y, mo] = m.split("-");
    const names = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    return `${names[parseInt(mo) - 1]} ${y}`;
  }

  function toggleSection(id: PlanSectionId) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // ينتقل «نظرة اليوم» أو رابطٌ عميق إلى قسمٍ: يفتحه (إن كان قابلاً للطيّ) ثمّ يمرّر.
  function goToSection(id: PlanSectionId | "history") {
    if (!isFinanceSectionVisible(id as FinanceDisplayId)) {
      setFinanceVisibility((current) => ({ ...current, [id as FinanceDisplayId]: true }));
    }
    if ((PLAN_SECTIONS as readonly string[]).includes(id)) {
      setOpenSections((prev) => ({ ...prev, [id]: true }));
    } else if (id === "history") {
      setHistoryOpen(true);
    }
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  return (
    <div className={`page-shell page-shell--wide mdr-finance-page ${financeView === "now" ? "is-now" : ""}`}>
      <div className="mdr-finance-header flex items-center justify-between animate-fade-up">
        <div>
          <div className="flex items-center gap-2.5">
            <SectionSignet href="/finance" />
            <h1 className="page-title">المال</h1>
          </div>
          <p className="page-subtitle">{transactions.length} معاملة</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Smartphone size={14} />
            رسائل البنك
          </Button>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 bg-finance hover:bg-finance/90">
            <Plus size={16} />
            إضافة
          </Button>
        </div>
      </div>

      <div className="mdr-finance-tabs" role="tablist" aria-label="واجهة المال">
        <button type="button" role="tab" aria-selected={financeView === "cycle"} className={financeView === "cycle" ? "is-active" : ""} onClick={() => setFinanceView("cycle")}>الدورة</button>
        <button type="button" role="tab" aria-selected={financeView === "now"} className={financeView === "now" ? "is-active" : ""} onClick={() => setFinanceView("now")}>الآن</button>
      </div>

      {financeView === "cycle" ? (
        <div className="mdr-finance-cycle-surface">
          <FinanceCycleDashboard
            curve={cycleCurve}
            overview={overview}
            categories={categories}
            budgetRows={budgetRows}
            onGo={goToSection}
            visible={isFinanceSectionVisible}
          />
          {isFinanceSectionVisible("daily") && <div className="mdr-finance-salary"><SalaryBanner /></div>}
        </div>
      ) : (
        <div className="mdr-finance-now-surface">
          <div className="mdr-finance-now-card">
            <div className="mdr-finance-now-heading">
              <div>
                <span className="mdr-finance-eyebrow">الآن</span>
                <h2>العمليات التي تنتظر قرارك</h2>
                <p>راجع رسائل البنك، أو أضف مصروفًا لم يصل تلقائيًا.</p>
              </div>
            </div>
            <PendingBankBanner />
            <div className="mdr-finance-now-actions">
              <Button onClick={() => setShowForm(true)} className="bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--ink)]"><Plus size={15} /> أضف مصروفًا</Button>
              <button
                type="button"
                onClick={() => {
                  setFinanceView("cycle");
                  goToSection("history");
                }}
              >
                افتح السجل <ChevronLeft size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* كل أدوات المال الأصلية باقية بلا نقصان، لكنّها **مجموعتان** لا تسعُ
          أقسامٍ متساوية الوزن: ما يخصّ إنفاقَ يومك، وما هو التزامٌ أو مخزونٌ
          لا تفتحه كلَّ يوم. الترتيبُ وحده هو ما تغيّر — لا قسمَ حُذف ولا
          اختُصر، والروابطُ العميقة (‎#shelf‎ …) تعمل كما كانت. */}
      <div className="mdr-finance-tools">
      <div className="mdr-finance-plan-details">

      <p className="mdr-finance-group">مالُ يومك</p>

      {isFinanceSectionVisible("daily") && <CollapsibleSection
        id="daily"
        title="ضبط الميزانية اليومية"
        icon={<Wallet size={16} />}
        className="mdr-finance-tool"
        open={openSections.daily}
        onToggle={() => toggleSection("daily")}
        summary={overview.hasBudget ? `المتاح ${formatAmount(overview.availableToday)} ر.س` : "غير محدّدة"}
        badge={overview.hasBudget && overview.availableToday < 0 ? <AlertBadge>سالب</AlertBadge> : undefined}
      >
        <DailyBudgetCard />
      </CollapsibleSection>}

      {isFinanceSectionVisible("budgets") && <CollapsibleSection
        id="budgets"
        title="إدارة سقوف الإنفاق"
        icon={<Gauge size={16} />}
        className="mdr-finance-tool"
        open={openSections.budgets}
        onToggle={() => toggleSection("budgets")}
        summary={
          alerts.over + alerts.near > 0
            ? `${alerts.over} متجاوز · ${alerts.near} قريب`
            : budgets.length > 0 ? "ضمن السقوف" : "لا سقوف بعد"
        }
        badge={alerts.over > 0 ? <AlertBadge>{formatAmount(alerts.over)}</AlertBadge> : undefined}
      >
        <Card>
          <BudgetTracker />
        </Card>
        <button
          onClick={() => setShowCategories(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors press"
        >
          <Tags size={16} className="text-finance" />
          تصنيفاتي
        </button>
      </CollapsibleSection>}

      {/* السجل الكامل باقٍ كما هو، لكنه لا يملأ الصفحة قبل أن يطلبه المستخدم. */}
      {isFinanceSectionVisible("history") && <CollapsibleSection
        id="history"
        title="آخر العمليات"
        icon={<Search size={16} />}
        className="mdr-finance-tool"
        open={historyOpen}
        onToggle={() => setHistoryOpen((open) => !open)}
        summary={byMonth.length ? `${formatAmount(byMonth.length)} عملية · ${formatAmount(overview.monthSpend)} ر.س هذا الشهر` : "لا عمليات هذا الشهر"}
      >
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              placeholder="ابحث في المصاريف (اسم أو قسم)..."
              className="w-full border border-gray-200 rounded-xl pr-9 pl-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
            {txSearch && (
              <button
                onClick={() => setTxSearch("")}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                aria-label="مسح"
              >
                <X size={15} />
              </button>
            )}
          </div>
          <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 shrink-0 bg-finance hover:bg-finance/90">
            <Plus size={15} /> مصروف
          </Button>
        </div>

        {months.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {months.map((m) => (
              <button
                key={m}
                onClick={() => setMonthFilter(m)}
                className={`shrink-0 text-sm px-3 py-1.5 rounded-full border transition-colors ${
                  monthFilter === m
                    ? "bg-finance text-white border-finance"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 bg-white"
                }`}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
        )}

        <Card>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-gray-700">سجل الشهر</span>
            <span className="text-xs text-gray-400">اضغط أي يوم للتفاصيل 👆</span>
          </div>
          <SpendCalendar transactions={byMonth} dailyBudget={dailyBudget} onDayClick={setSelectedDay} />
        </Card>

        {byMonth.length === 0 ? (
          <EmptyState
            emoji="💰"
            title="لا توجد مصاريف"
            subtitle="سجّل أول مصروف لهذا الشهر أو استورده من رسائل البنك"
            action={
              <Button size="sm" onClick={() => setShowForm(true)} className="gap-1.5 bg-finance hover:bg-finance/90">
                <Plus size={14} /> سجّل مصروف
              </Button>
            }
          />
        ) : shownTx.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">ما فيه مصاريف تطابق «{txSearch}».</p>
        ) : (
          <div className="space-y-3">
            <TransactionList
              transactions={visibleTx}
              categories={categories}
              onDelete={handleDelete}
              onEdit={(tx) => setEditTx(tx)}
            />
            {hasMoreTx && (
              <button
                onClick={() => setHistoryLimit((n) => n + HISTORY_PAGE)}
                className="w-full py-3 text-sm font-bold text-finance bg-finance/10 hover:bg-finance/20 rounded-2xl transition-colors press"
              >
                إظهار المزيد ({formatAmount(remainingTx)})
              </button>
            )}
          </div>
        )}
      </div>
      </CollapsibleSection>}

      <p className="mdr-finance-group">التزاماتُك ومخزونك</p>


      {isFinanceSectionVisible("recurring") && <CollapsibleSection
        id="recurring"
        title="المتكررة والقادم"
        icon={<Repeat size={16} />}
        className="mdr-finance-tool"
        open={openSections.recurring}
        onToggle={() => toggleSection("recurring")}
        summary={
          overview.nearest
            ? `أقرب: ${overview.nearest.note || getCategoryInfo(categories, overview.nearest.category).label} · ${formatAmount(overview.nearest.amount)} ر.س`
            : "لا التزامات"
        }
      >
        <Card>
          <UpcomingRecurring recurring={recurring} categories={categories} />
          <button
            onClick={() => setShowRecurring(true)}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors press"
          >
            <Repeat size={15} className="text-finance" />
            إدارة المصاريف المتكررة
          </button>
        </Card>
      </CollapsibleSection>}

      {isFinanceSectionVisible("installments") && <CollapsibleSection
        id="installments"
        title="الأقساط"
        icon={<CalendarClock size={16} />}
        className="mdr-finance-tool"
        open={openSections.installments}
        onToggle={() => toggleSection("installments")}
        summary={
          overview.installments.activeCount > 0
            ? `${formatAmount(overview.installments.activeCount)} خطة · متبقٍّ ${formatAmount(overview.installments.remainingTotal)} ر.س`
            : "لا أقساط"
        }
        badge={
          overview.installments.overdueCount > 0
            ? <AlertBadge>{formatAmount(overview.installments.overdueCount)} متأخّر</AlertBadge>
            : undefined
        }
      >
        <Card>
          <InstallmentPlans />
        </Card>
      </CollapsibleSection>}

      {/* «الرفّ»: تأخيرُ الحكم مدّةً تُختار لكلّ عنصر — لا يمنع شراءً، يؤجّله حتى تهدأ
          الشهوة. ما تُرِكَ يُجمع ثمنُه في «وفَّرت» **اشتقاقاً** من العناصر
          المتروكة لا بعدّادٍ يتراكم (عدّادٌ يخسر زيادةً عند الدمج بين جهازين). */}
      {isFinanceSectionVisible("shelf") && <CollapsibleSection
        id="shelf"
        title="الرفّ"
        icon={<Hourglass size={16} />}
        className="mdr-finance-tool"
        open={openSections.shelf}
        onToggle={() => toggleSection("shelf")}
        summary={shelfSummary.text}
        badge={shelfSummary.ripe > 0 ? <RipeBadge>{formatAmount(shelfSummary.ripe)} نضج</RipeBadge> : undefined}
      >
        <Card>
          <div className="mdr">
            <Shelf
              items={shelfItems ?? []}
              todayStr={today()}
              onAdd={(draft) =>
                addShelfItem({
                  id: uid(), name: draft.name, price: draft.price, reason: draft.reason,
                  ripenDays: draft.ripenDays, placedAt: today(),
                })
              }
              onEdit={(id, draft) =>
                updateShelfItem(id, {
                  name: draft.name, price: draft.price, reason: draft.reason, ripenDays: draft.ripenDays,
                })
              }
              // الحذف **تصحيحُ إدخالٍ لا حكم**: شيءٌ وُضع سهواً يخرج بلا أن
              // يُحسب فيما «وفَّرت» (ذلك ثوابُ «دَعْه» وحده). ولذلك تراجعٌ
              // بضغطة كبقيّة الحذف في التطبيق، لا نافذةُ تأكيد.
              onDelete={(item) => {
                deleteShelfItem(item.id);
                showUndo(`حذفت «${item.name}» من الرفّ`, () => addShelfItem(item));
              }}
              onRelease={releaseShelfItem}
              onRenew={renewShelfItem}
              onBuy={setBuyingShelf}
            />
          </div>
        </Card>
      </CollapsibleSection>}

      {isFinanceSectionVisible("assets") && <CollapsibleSection
        id="assets"
        title="الأصول"
        icon={<Package size={16} />}
        className="mdr-finance-tool"
        open={openSections.assets}
        onToggle={() => toggleSection("assets")}
        summary={
          assetsSummary.count > 0
            ? `${formatAmount(assetsSummary.count)} أصل · قيمتها ${formatAmount(assetsSummary.bookValue)} ر.س · ${formatAmount(assetsSummary.perDay)} ر.س يومياً`
            : "لا أصول بعد"
        }
      >
        <Card>
          <Assets />
        </Card>
      </CollapsibleSection>}

      {isFinanceSectionVisible("reserves") && <CollapsibleSection
        id="reserves"
        title="الاحتياطيات"
        icon={<Landmark size={16} />}
        className="mdr-finance-tool"
        open={openSections.reserves}
        onToggle={() => toggleSection("reserves")}
        summary={overview.hasReserves ? `${formatAmount(overview.reservesTotal)} ر.س` : "لا احتياطي بعد"}
      >
        <Card>
          <ReserveFunds />
        </Card>
      </CollapsibleSection>}
      </div>

      </div>

      <Modal
        open={showForm || !!editTx}
        onClose={() => { setShowForm(false); setEditTx(undefined); }}
        title={editTx ? "تعديل المصروف" : "مصروف جديد"}
      >
        <TransactionForm onClose={() => { setShowForm(false); setEditTx(undefined); }} initial={editTx} />
      </Modal>

      {/* شراءُ ما نضج: نموذجُ المصروف نفسُه بمبلغٍ واسمٍ جاهزين — والتصنيفُ بيد
          المالك. بعد الحفظ نربط المعاملةَ بالعنصر فيخرج من الرفّ إلى السجل. */}
      <Modal
        open={!!buyingShelf}
        onClose={() => setBuyingShelf(null)}
        title={buyingShelf ? `اشترِ «${buyingShelf.name}»` : "شراء"}
      >
        {buyingShelf && (
          <TransactionForm
            onClose={() => setBuyingShelf(null)}
            prefill={{ amount: buyingShelf.price, note: buyingShelf.name }}
            onSaved={(tx) => buyShelfItem(buyingShelf.id, tx.id)}
          />
        )}
      </Modal>

      <Modal
        open={showImport}
        onClose={() => { setShowImport(false); setImportSms(null); }}
        title="استيراد بنكي تلقائي 🤖"
      >
        <BankImport initialSms={importSms ?? undefined} onClose={() => { setShowImport(false); setImportSms(null); }} />
      </Modal>

      <Modal open={showRecurring} onClose={() => setShowRecurring(false)} title="المصاريف المتكررة 🔁">
        <RecurringManager onClose={() => setShowRecurring(false)} />
      </Modal>

      <Modal open={showCategories} onClose={() => setShowCategories(false)} title="تصنيفاتي">
        <CategoryManager onClose={() => setShowCategories(false)} />
      </Modal>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}
