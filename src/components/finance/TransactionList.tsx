"use client";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatDate, formatAmount, getCategoryInfo, getMainCategory } from "@/lib/utils";
import { Trash2, Gem, PiggyBank } from "lucide-react";

interface TransactionListProps {
  transactions: Transaction[];
  categories: FinanceCategoryDef[];
  onDelete?: (id: string) => void;
  onEdit?: (tx: Transaction) => void;
  limit?: number;
}

export function TransactionList({ transactions, categories, onDelete, onEdit, limit }: TransactionListProps) {
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
        const info = getCategoryInfo(categories, tx.category);
        const main = getMainCategory(categories, tx.category);
        const isSub = main.id !== info.id;
        const reservedPct = tx.reserveSplits?.reduce((s, sp) => s + sp.pct, 0) ?? 0;
        return (
          <div
            key={tx.id}
            className={`flex items-center gap-3 rounded-xl border p-3 hover:shadow-md transition-shadow cursor-pointer press ${
              tx.big ? "bg-brand-50 border-brand-200" : "bg-white border-gray-100"
            }`}
            onClick={() => onEdit?.(tx)}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0"
              style={{ backgroundColor: info.color + "15" }}
            >
              {info.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <div className="text-sm font-semibold text-gray-800 truncate">
                  {isSub ? (
                    <>
                      <span className="text-gray-400 font-normal">{main.label} · </span>
                      {info.label}
                    </>
                  ) : (
                    info.label
                  )}
                </div>
                {tx.big && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded-full shrink-0">
                    <Gem size={9} /> التزام كبير
                  </span>
                )}
                {reservedPct > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-prayer bg-prayer/10 px-1.5 py-0.5 rounded-full shrink-0">
                    <PiggyBank size={9} /> {reservedPct}% احتياطي
                  </span>
                )}
              </div>
              {tx.note && <div className="text-xs text-gray-400 truncate">{tx.note}</div>}
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(tx.date)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-base font-bold text-red-500">
                -{formatAmount(tx.amount)}
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
