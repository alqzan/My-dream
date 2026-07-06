"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { FinanceSummary } from "@/components/finance/FinanceSummary";
import { BudgetDisciplineScore } from "@/components/finance/BudgetDisciplineScore";
import { FinancePace } from "@/components/finance/FinancePace";
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
import type { Transaction } from "@/lib/types";
import { Plus, Smartphone, Repeat, Tags, TrendingDown, ChevronLeft } from "lucide-react";
import { showUndo } from "@/components/ui/UndoToast";

export default function FinancePage() {
  const { transactions, budgets, recurring, categories, dailyBudget, monthlyIncome, deleteTransaction, addTransaction, runRecurring } = useAppStore();

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
    runRecurring();
  }, [runRecurring]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sms = params.get("sms");
    if (sms && sms.trim()) {
      setImportSms(sms);
      setShowImport(true);
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
          <h1 className="text-2xl font-bold text-gray-900">المصاريف</h1>
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

      <div className="animate-fade-up stagger-1">
        <DailyBudgetCard />
      </div>

      <Card className="animate-fade-up stagger-1">
        <ReserveFunds />
      </Card>

      <Card className="animate-fade-up stagger-2">
        <FinanceSummary transactions={byMonth} categories={categories} />
      </Card>

      <FinancePace budgets={budgets} monthTransactions={byMonth} categories={categories} monthlyIncome={monthlyIncome} />

      <BudgetDisciplineScore
        transactions={transactions}
        monthTransactions={byMonth}
        budgets={budgets}
        categories={categories}
        dailyBudget={dailyBudget}
        monthlyIncome={monthlyIncome}
      />

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
        <TransactionList
          transactions={byMonth}
          categories={categories}
          onDelete={handleDelete}
          onEdit={(tx) => setEditTx(tx)}
        />
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
