"use client";
import { useState, useEffect, type ReactNode } from "react";
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
import Link from "next/link";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionSignet } from "@/components/layout/SectionSignet";
import type { Transaction } from "@/lib/types";
import { Plus, Smartphone, Repeat, Tags, TrendingDown, ChevronLeft, Search, X } from "lucide-react";
import { getCategoryInfo, normalizeArabic } from "@/lib/utils";
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

export default function FinancePage() {
  const { transactions, recurring, categories, dailyBudget, deleteTransaction, addTransaction } = useAppStore();

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
  // Bank SMS handed in via the URL (?sms=...) — e.g. from the iOS Shortcut
  // share sheet. Opens the importer pre-filled and auto-previewed.
  const [importSms, setImportSms] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sms = params.get("sms");
    if (sms && sms.trim()) {
      setImportSms(sms);
      setShowImport(true);
    } else if (params.get("import") === "1") {
      // Simple deep-link (from the Shortcut) → just open the importer; the
      // user taps "استورد من الحافظة" there (clipboard needs a tap on iOS).
      setShowImport(true);
    }
    if (params.has("sms") || params.has("import")) {
      // Strip the query so a refresh/back doesn't re-import the same messages.
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", clean);
    }
  }, []);

  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const byMonth = transactions.filter((t) => t.date.startsWith(monthFilter));

  const [txSearch, setTxSearch] = useState("");
  const q = normalizeArabic(txSearch.trim());
  const shownTx = q
    ? byMonth.filter((t) => {
        const label = normalizeArabic(getCategoryInfo(categories, t.category).label);
        return normalizeArabic(t.note ?? "").includes(q) || label.includes(q);
      })
    : byMonth;

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();

  function monthLabel(m: string) {
    const [y, mo] = m.split("-");
    const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    return `${months[parseInt(mo) - 1]} ${y}`;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between animate-fade-up">
        <div>
          <div className="flex items-center gap-2.5">
            <SectionSignet href="/finance" />
            <h1 className="text-2xl font-bold text-gray-900">المصاريف</h1>
          </div>
          <p className="text-sm text-gray-400 mt-0.5">{transactions.length} معاملة</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowImport(true)}
            className="gap-1.5"
          >
            <Smartphone size={14} />
            SMS / CSV
          </Button>
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="gap-1.5 bg-finance hover:bg-finance/90"
          >
            <Plus size={16} />
            إضافة
          </Button>
        </div>
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

      <Link href="/finance/insights" className="block animate-fade-up">
        <div className="relative overflow-hidden rounded-2xl p-4 text-white bg-gradient-to-l from-[#1d5c20] to-[#3d9640] card-shadow press shine">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                <TrendingDown size={20} />
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

      <SalaryBanner />

      <GroupLabel>يومياتك</GroupLabel>

      <div className="animate-fade-up stagger-1">
        <DailyBudgetCard />
      </div>

      <Card className="animate-fade-up stagger-1">
        <ReserveFunds />
      </Card>

      <Card className="animate-fade-up stagger-3">
        <BudgetTracker monthPrefix={monthFilter} />
      </Card>

      <UpcomingRecurring recurring={recurring} categories={categories} />

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setShowRecurring(true)}
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors press"
        >
          <Repeat size={16} className="text-finance" />
          المصاريف المتكررة
        </button>
        <button
          onClick={() => setShowCategories(true)}
          className="flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors press"
        >
          <Tags size={16} className="text-finance" />
          تصنيفاتي
        </button>
      </div>

      <GroupLabel>سجلّك</GroupLabel>

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
      ) : (
        <div className="space-y-3">
          <div className="relative">
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
          {shownTx.length === 0 ? (
            <p className="text-center text-xs text-gray-400 py-6">ما فيه مصاريف تطابق «{txSearch}».</p>
          ) : (
            <TransactionList
              transactions={shownTx}
              categories={categories}
              onDelete={handleDelete}
              onEdit={(tx) => setEditTx(tx)}
            />
          )}
        </div>
      )}

      <Modal
        open={showForm || !!editTx}
        onClose={() => { setShowForm(false); setEditTx(undefined); }}
        title={editTx ? "تعديل المصروف" : "مصروف جديد"}
      >
        <TransactionForm
          onClose={() => { setShowForm(false); setEditTx(undefined); }}
          initial={editTx}
        />
      </Modal>

      <Modal
        open={showImport}
        onClose={() => { setShowImport(false); setImportSms(null); }}
        title="استيراد بنكي تلقائي 🤖"
      >
        <BankImport
          initialSms={importSms ?? undefined}
          onClose={() => { setShowImport(false); setImportSms(null); }}
        />
      </Modal>


      <Modal
        open={showRecurring}
        onClose={() => setShowRecurring(false)}
        title="المصاريف المتكررة 🔁"
      >
        <RecurringManager onClose={() => setShowRecurring(false)} />
      </Modal>

      <Modal
        open={showCategories}
        onClose={() => setShowCategories(false)}
        title="تصنيفاتي"
      >
        <CategoryManager onClose={() => setShowCategories(false)} />
      </Modal>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}
