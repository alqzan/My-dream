"use client";
import type { Transaction } from "@/lib/types";
import { CATEGORY_LABELS } from "@/lib/types";
import { formatDate, formatAmount } from "@/lib/utils";
import { Trash2 } from "lucide-react";

interface TransactionListProps {
  transactions: Transaction[];
  onDelete?: (id: string) => void;
  onEdit?: (tx: Transaction) => void;
  limit?: number;
}

export function TransactionList({ transactions, onDelete, onEdit, limit }: TransactionListProps) {
  const shown = limit ? transactions.slice(0, limit) : transactions;

  if (!shown.length) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        لا توجد معاملات بعد
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {shown.map((tx) => {
        const info = CATEGORY_LABELS[tx.category];
        const isIncome = tx.type === "دخل";
        return (
          <div
            key={tx.id}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-pointer"
            onClick={() => onEdit?.(tx)}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: info.color + "15" }}
            >
              {info.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800">{info.label}</div>
              {tx.note && <div className="text-xs text-gray-400 truncate">{tx.note}</div>}
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(tx.date)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span
                className={`text-base font-bold ${isIncome ? "text-finance" : "text-red-500"}`}
              >
                {isIncome ? "+" : "-"}{formatAmount(tx.amount)}
                <span className="text-xs font-normal mr-0.5">ر.س</span>
              </span>
              {onDelete && (
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(tx.id); }}
                  className="p-1 text-gray-300 hover:text-red-400 rounded-lg"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
