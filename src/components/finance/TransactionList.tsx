"use client";
import { useAppStore } from "@/lib/store";
import type { Transaction, FinanceCategoryDef } from "@/lib/types";
import { formatDate, formatAmount, getCategoryInfo, getMainCategory } from "@/lib/utils";
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
  // أسماءُ المظاريف لتسمية وعاء الصرف بالعربي في كلّ سطر: «من مظروف: رحلة
  // المدينة» بدل «١٠٠٪ احتياطي» — السطر يقول من أين خرج المال بلا أن يُفتح.
  const reserves = useAppStore((s) => s.reserves);

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
            className="flex items-center gap-3 rounded-xl border p-3 bg-white border-gray-100 card-shadow cursor-pointer press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finance/50"
            role={onEdit ? "button" : undefined}
            tabIndex={onEdit ? 0 : undefined}
            aria-label={onEdit ? `تعديل ${tx.note || info.label}` : undefined}
            onClick={() => onEdit?.(tx)}
            onKeyDown={(event) => {
              if (!onEdit || (event.key !== "Enter" && event.key !== " ")) return;
              event.preventDefault();
              onEdit(tx);
            }}
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
                {reservedPct > 0 && (() => {
                  const names = (tx.reserveSplits ?? [])
                    .map((sp) => reserves.find((f) => f.id === sp.fundId)?.name)
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold text-finance bg-finance/10 px-1.5 py-0.5 rounded-full shrink-0 max-w-[11rem] truncate">
                      <PiggyBank size={9} className="shrink-0" />
                      {reservedPct >= 100 ? "من مظروف" : `${reservedPct}٪ من مظروف`}
                      {names ? `: ${names}` : ""}
                    </span>
                  );
                })()}
                {/* مصروفٌ استثنائيّ خارج الميزانيات: صرفٌ حقيقيّ (يبقى بالأحمر
                    وفي المجاميع) لكنّه لا يخصم من اليومية ولا السقوف. */}
                {tx.offBudget && (
                  <span className="text-[10px] font-semibold text-finance bg-finance/10 px-1.5 py-0.5 rounded-full shrink-0">
                    خارج الميزانيات
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
                  type="button"
                  aria-label={`حذف ${tx.note || info.label}`}
                  onClick={(e) => { e.stopPropagation(); onDelete(tx.id); }}
                  className="p-2 text-gray-300 hover:text-red-400 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50"
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
