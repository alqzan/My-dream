"use client";
import { useState, useEffect, useMemo, type ReactNode } from "react";
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
import { SalaryBanner } from "@/components/finance/SalaryBanner";
import { SpendCalendar } from "@/components/finance/SpendCalendar";
import { FinanceGlance } from "@/components/finance/FinanceGlance";
import { CollapsibleSection } from "@/components/finance/CollapsibleSection";
import Link from "next/link";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionSignet } from "@/components/layout/SectionSignet";
import type { Transaction } from "@/lib/types";
import { Plus, Smartphone, Repeat, Tags, TrendingDown, ChevronLeft, Search, X, Wallet, Gauge, Landmark } from "lucide-react";
import { getCategoryInfo, normalizeArabic, formatAmount, today } from "@/lib/utils";
import {
  buildFinanceOverview, budgetAlerts, defaultPlanOpen, planSectionFromHash, historySlice,
  PLAN_SECTIONS, type PlanSectionId,
} from "@/lib/financeOverview";
import { showUndo } from "@/components/ui/UndoToast";

// عنوانٌ خفيفٌ يجمّع البطاقات بصريًّا — مسمّى مكتوم صغير (ثمانية، عالميّ) مع خيطٍ
// ذهبيٍّ باهتٍ يمتدّ جانبًا. ليس شريطًا ثقيلًا؛ فقط يقسّم الصفحة فصولًا للعين.
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-2 -mb-1">
      <h2 className="shrink-0 text-xs font-semibold tracking-wide text-gray-400">{children}</h2>
      <span className="h-px flex-1 bg-brand-500/25" aria-hidden />
    </div>
  );
}

// شارة تحذيرٍ حمراء صغيرة لرأس قسمٍ مطويّ (تبقى ظاهرةً دون فتحه).
function AlertBadge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-[10px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">{children}</span>
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
    transactions, recurring, categories, dailyBudget, reserves, budgets, salaryDay, monthlyIncome,
    deleteTransaction, addTransaction,
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
  // حالة فتح أقسام «الخطة»: افتراضٌ ثابت (الميزانية اليومية) يطابق الخادم، ثمّ
  // نطبّق التفضيل المحفوظ محلياً + أي قسمٍ يطلبه رابطٌ عميق بعد التركيب.
  const [openSections, setOpenSections] = useState<Record<PlanSectionId, boolean>>(
    () => defaultPlanOpen({ budgetAttention: false, negativeBalance: false })
  );
  const [historyLimit, setHistoryLimit] = useState(HISTORY_PAGE);

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

  // الروابط العميقة + التفضيل المحفوظ: ‎?open=add|recurring|categories‎ تفتح
  // النافذة، و‎#daily/#budgets/#recurring/#reserves/#history‎ تفتح القسم المطويّ
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
    if (saved || hashSection) {
      setOpenSections((prev) => ({ ...prev, ...(saved ?? {}), ...(hashSection ? { [hashSection]: true } : {}) }));
    }
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
      dailyBudget, transactions, reserves, recurring,
      salaryDay: salaryDay ?? 27, monthPrefix: currentMonth, todayStr: today(),
    }),
    [dailyBudget, transactions, reserves, recurring, salaryDay, currentMonth]
  );
  const alerts = useMemo(
    () => budgetAlerts(budgets, transactions, categories, monthlyIncome, currentMonth),
    [budgets, transactions, categories, monthlyIncome, currentMonth]
  );

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
    if ((PLAN_SECTIONS as readonly string[]).includes(id)) {
      setOpenSections((prev) => ({ ...prev, [id]: true }));
    }
    setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }

  return (
    <div className="max-w-2xl xl:max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <div className="flex items-center gap-2.5">
            <SectionSignet href="/finance" />
            <h1 className="text-2xl font-bold text-gray-900">الأموال</h1>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{transactions.length} معاملة</p>
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

      {/* ===== 1 — نظرة اليوم ===== */}
      <FinanceGlance overview={overview} categories={categories} onGo={goToSection} />

      <SalaryBanner />

      <Link href="/finance/insights" className="block animate-fade-up">
        <div className="relative overflow-hidden rounded-2xl p-3.5 text-white bg-gradient-to-l from-[#1d5c20] to-[#3d9640] card-shadow press shine">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
                <TrendingDown size={18} />
              </div>
              <div>
                <p className="text-sm font-bold">متابعة الصرف</p>
                <p className="text-xs opacity-80 mt-0.5">أسبوعي · شهري · سنوي — أرقامك وتحليلك التلقائي</p>
              </div>
            </div>
            <ChevronLeft size={18} className="opacity-70" />
          </div>
        </div>
      </Link>

      {/* ===== 2 — الخطة المالية ===== */}
      <GroupLabel>الخطة المالية</GroupLabel>

      <CollapsibleSection
        id="daily"
        title="الميزانية اليومية"
        icon={<Wallet size={16} />}
        open={openSections.daily}
        onToggle={() => toggleSection("daily")}
        summary={overview.hasBudget ? `المتاح ${formatAmount(overview.availableToday)} ر.س` : "غير محدّدة"}
        badge={overview.hasBudget && overview.availableToday < 0 ? <AlertBadge>سالب</AlertBadge> : undefined}
      >
        <DailyBudgetCard />
      </CollapsibleSection>

      <CollapsibleSection
        id="budgets"
        title="سقوف التصنيفات"
        icon={<Gauge size={16} />}
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
          <BudgetTracker monthPrefix={monthFilter} />
        </Card>
        <button
          onClick={() => setShowCategories(true)}
          className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors press"
        >
          <Tags size={16} className="text-finance" />
          تصنيفاتي
        </button>
      </CollapsibleSection>

      <CollapsibleSection
        id="recurring"
        title="المتكررة والقادم"
        icon={<Repeat size={16} />}
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
      </CollapsibleSection>

      <CollapsibleSection
        id="reserves"
        title="الاحتياطيات"
        icon={<Landmark size={16} />}
        open={openSections.reserves}
        onToggle={() => toggleSection("reserves")}
        summary={overview.hasReserves ? `${formatAmount(overview.reservesTotal)} ر.س` : "لا احتياطي بعد"}
      >
        <Card>
          <ReserveFunds />
        </Card>
      </CollapsibleSection>

      {/* ===== 3 — السجل ===== */}
      <div id="history" className="scroll-mt-24 space-y-3">
        <GroupLabel>السجل</GroupLabel>

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

      <Modal
        open={showForm || !!editTx}
        onClose={() => { setShowForm(false); setEditTx(undefined); }}
        title={editTx ? "تعديل المصروف" : "مصروف جديد"}
      >
        <TransactionForm onClose={() => { setShowForm(false); setEditTx(undefined); }} initial={editTx} />
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
