"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { FinanceSummary } from "@/components/finance/FinanceSummary";
import { FinanceHealthScore } from "@/components/finance/FinanceHealthScore";
import { TransactionForm } from "@/components/finance/TransactionForm";
import { TransactionList } from "@/components/finance/TransactionList";
import { BankImport } from "@/components/finance/BankImport";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { Transaction } from "@/lib/types";
import { Plus, Smartphone } from "lucide-react";

type FilterType = "الكل" | "دخل" | "مصروف";

export default function FinancePage() {
  const { transactions, deleteTransaction } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editTx, setEditTx] = useState<Transaction | undefined>();
  const [filter, setFilter] = useState<FilterType>("الكل");
  const [monthFilter, setMonthFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  const byMonth = transactions.filter((t) => t.date.startsWith(monthFilter));
  const filtered = byMonth.filter((t) => filter === "الكل" || t.type === filter);

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
          <h1 className="text-2xl font-bold text-gray-900">الأموال</h1>
          <p className="text-sm text-gray-400 mt-0.5">{transactions.length} معاملة</p>
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

      <FinanceHealthScore transactions={transactions} />

      <div className="flex gap-2">
        {(["الكل", "مصروف", "دخل"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${
              filter === f
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">💰</p>
          <p className="text-sm font-medium">لا توجد معاملات</p>
          <p className="text-xs mt-1">سجّل أول معاملة مالية</p>
        </div>
      ) : (
        <TransactionList
          transactions={filtered}
          onDelete={deleteTransaction}
          onEdit={(tx) => setEditTx(tx)}
        />
      )}

      <Modal
        open={showForm || !!editTx}
        onClose={() => { setShowForm(false); setEditTx(undefined); }}
        title={editTx ? "تعديل المعاملة" : "معاملة جديدة"}
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
    </div>
  );
}
