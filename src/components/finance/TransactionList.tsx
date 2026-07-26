"use client";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatDate, formatAmount, getCategoryInfo, getMainCategory } from "@/lib/utils";
import { INSTALLMENT_ROLE_LABEL } from "@/lib/installments";
import { Trash2, PiggyBank } from "lucide-react";

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
            className="flex items-center gap-3 rounded-xl border p-3 bg-white border-gray-100 card-shadow cursor-pointer press"
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
                {reservedPct > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-finance bg-finance/10 px-1.5 py-0.5 rounded-full shrink-0">
                    <PiggyBank size={9} /> {reservedPct}% احتياطي
                  </span>
                )}
                {/* دفعةٌ مربوطة بخطة أقساط — تبقى مصروفاً عادياً في كل الحسابات،
                    والوسم يوضّح لماذا سُجّلت حتى لا تبدو مصروفاً غامضاً. */}
                {tx.planId && (
                  <span className="text-[10px] font-semibold text-gray-500 bg-gray-100 dark:bg-white/10 dark:text-gray-300 px-1.5 py-0.5 rounded-full shrink-0">
                    🧾 {tx.planRole ? INSTALLMENT_ROLE_LABEL[tx.planRole] : "قسط"}
                    {tx.planRole === "installment" && tx.planInstallmentNo ? ` ${tx.planInstallmentNo}` : ""}
                  </span>
                )}
                {/* شراءٌ مؤجّل (مهب كاش): لم يخرج من الحساب فلا يُحتسب صرفاً —
                    نقولها صريحةً حتى لا يبدو الرقم ناقصاً في حسابات الشهر. */}
                {tx.deferred && (
                  <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-500/20 dark:text-amber-300 px-1.5 py-0.5 rounded-full shrink-0">
                    مؤجّل — لا يُحتسب
                  </span>
                )}
              </div>
              {tx.note && <div className="text-xs text-gray-400 truncate">{tx.note}</div>}
              <div className="text-xs text-gray-400 mt-0.5">{formatDate(tx.date)}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* المؤجّل بلا إشارة سالبة ولا لونٍ أحمر — لم يخرج من الجيب. */}
              <span className={`text-base font-bold ${tx.deferred ? "text-gray-400 line-through" : "text-red-500"}`}>
                {tx.deferred ? "" : "-"}{formatAmount(tx.amount)}
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
