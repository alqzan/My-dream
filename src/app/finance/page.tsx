"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { getNoSpendStreak } from "@/lib/utils";
import { FinanceSummary } from "@/components/finance/FinanceSummary";
import { BudgetDisciplineScore } from "@/components/finance/BudgetDisciplineScore";
import { FinancePace } from "@/components/finance/FinancePace";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { BankImport } from "@/components/finance/BankImport";
import { RecurringManager } from "@/components/finance/RecurringManager";
import { UpcomingRecurring } from "@/components/finance/UpcomingRecurring";
import { BudgetTracker } from "@/components/finance/BudgetTracker";
import { SpendCalendar } from "@/components/finance/SpendCalendar";
import { DayView } from "@/components/day/DayView";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Transaction } from "@/lib/types";
import { Plus, Smartphone, Repeat } from "lucide-react";

export default function FinancePage() {
  const { transactions, budgets, recurring, deleteTransaction, runRecurring } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | undefined>();
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    runRecurring();
  }, [runRecurring]);
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const byMonth = transactions.filter((t) => t.date.startsWith(monthFilter));
  const noSpendStreak = getNoSpendStreak(transactions);

  const months = [...new Set(transactions.map((t) => t.date.slice(0, 7)))].sort().reverse();

  function monthLabel(m: string) {
    const [y, mo] = m.split("-");
    const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
    return `${months[parseInt(mo) - 1]} ${y}`;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">المصاريف</h1>
          <div className="flex items-center gap-2 mt-1">
            {noSpendStreak > 0 && (
              <span className="text-sm text-prayer font-medium">🌿 {noSpendStreak} يوم بدون صرف</span>
            )}
          </div>
        </div>
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
        <FinanceSummary transactions={byMonth} />
      </Card>

      <FinancePace budgets={budgets} monthTransactions={byMonth} />

      <BudgetDisciplineScore transactions={transactions} monthTransactions={byMonth} budgets={budgets} />

      <Card>
        <BudgetTracker monthPrefix={monthFilter} />
      </Card>

      <UpcomingRecurring recurring={recurring} />

      <button
        onClick={() => setShowRecurring(true)}
        className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 rounded-2xl py-3 text-sm font-medium text-gray-600 hover:border-finance/40 transition-colors"
      >
        <Repeat size={16} className="text-finance" />
        المصاريف المتكررة التلقائية
      </button>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سجل الشهر</span>
          <span className="text-xs text-gray-400">اضغط أي يوم للتفاصيل 👆</span>
        </div>
        <SpendCalendar transactions={byMonth} onDayClick={setSelectedDay} />
      </Card>

      {byMonth.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">💰</p>
          <p className="text-sm font-medium">لا توجد مصاريف</p>
          <p className="text-xs mt-1">سجّل أول مصروف لهذا الشهر</p>
        </div>
      ) : (
        <TransactionList
          transactions={byMonth}
          onDelete={deleteTransaction}
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
        onClose={() => setShowImport(false)}
        title="استيراد بنكي تلقائي 🤖"
      >
        <BankImport onClose={() => setShowImport(false)} />
      </Modal>

      <Modal
        open={showRecurring}
        onClose={() => setShowRecurring(false)}
        title="المصاريف المتكررة 🔁"
      >
        <RecurringManager onClose={() => setShowRecurring(false)} />
      </Modal>

      <DayView date={selectedDay} onClose={() => setSelectedDay(null)} />
    </div>
  );
}
