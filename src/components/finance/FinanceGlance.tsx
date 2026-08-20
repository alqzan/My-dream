"use client";
import type { FinanceOverview } from "@/lib/financeOverview";
import { formatAmount, getCategoryInfo } from "@/lib/utils";
import type { FinanceCategoryDef } from "@/lib/types";
import { Wallet, CalendarClock, CalendarDays, ChevronLeft } from "lucide-react";

// «نظرة اليوم» — لوحةٌ صغيرة لاختصار المال إلى قرارٍ واحد وثلاث معلومات.
// التفاصيل (السقوف، الاحتياطيات، الأصول، الأقساط...) ما زالت موجودةً تحت
// أقسامها المطويّة؛ هنا لا نعرض إلا ما يحتاجه المستخدم في أول نظرة.
export function FinanceGlance({
  overview, categories, onGo,
}: {
  overview: FinanceOverview;
  categories: FinanceCategoryDef[];
  onGo: (section: "daily" | "budgets" | "recurring" | "installments" | "reserves" | "history") => void;
}) {
  const { hasBudget, availableToday, monthSpend, daysToSalary, nearest } = overview;
  const negative = hasBudget && availableToday < 0;

  return (
    <div className="mdr-finance-glance animate-fade-up">
      {/* الرقم الوحيد الكبير: المتاح اليوم */}
      <button
        onClick={() => onGo("daily")}
        aria-label="المتاح اليوم — افتح الميزانية اليومية"
        className={`mdr-finance-balance w-full text-right rounded-2xl p-4 press border ${
          !hasBudget
            ? "bg-white border-gray-100"
            : negative
              ? "border-red-500/30 bg-red-50"
              : "border-finance/30 bg-finance/[0.06]"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600">
              <Wallet size={14} /> المتاح المتراكم اليوم
            </div>
            {hasBudget ? (
              <div className={`mt-1 text-3xl font-black tabular-nums leading-none ${negative ? "text-red-600" : "text-finance"}`}>
                {formatAmount(availableToday)} <span className="text-lg font-bold">ر.س</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-500">لم تحدّد ميزانيةً يومية بعد — حدّدها لتتابع المتاح كل يوم.</p>
            )}
          </div>
          <span className={`shrink-0 text-xs font-bold rounded-lg px-3 py-2 ${hasBudget ? "text-finance bg-finance/10" : "text-white bg-finance"}`}>
            {hasBudget ? "التفاصيل" : "حدّد الآن"}
          </span>
        </div>
      </button>

      {/* ثلاث بطاقات فقط — والباقي يُفتح من أقسام الخطة */}
      <div className="grid grid-cols-3 gap-2">
        <GlanceTile
          icon={<CalendarDays size={14} />}
          label="صرف الشهر"
          value={`${formatAmount(monthSpend)} ر.س`}
          onClick={() => onGo("history")}
        />
        <GlanceTile
          icon={<CalendarClock size={14} />}
          label="إلى الراتب"
          value={daysToSalary === 0 ? "اليوم" : daysToSalary === 1 ? "غداً" : `${formatAmount(daysToSalary)} يوم`}
          onClick={() => onGo("daily")}
        />
        <GlanceTile
          icon={<CalendarClock size={14} />}
          label="الالتزام القادم"
          value={nearest ? `${formatAmount(nearest.amount)} ر.س` : "لا التزامات"}
          sub={
            nearest
              ? `${nearest.note || getCategoryInfo(categories, nearest.category).label} · ${nearest.daysUntil === 0 ? "اليوم" : nearest.daysUntil === 1 ? "غداً" : `خلال ${nearest.daysUntil} يوم`}`
              : "من المتكررة أو الأقساط"
          }
          onClick={() => onGo(nearest?.kind === "installment" ? "installments" : "recurring")}
        />
      </div>
    </div>
  );
}

function GlanceTile({
  icon, label, value, sub, onClick,
}: {
  icon: React.ReactNode; label: string; value: string; sub?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={`${label}: ${value}`}
      className="mdr-finance-glance-tile w-full min-h-[64px] text-right bg-white rounded-2xl border border-gray-100 p-3 press hover:border-finance/40 transition-colors flex flex-col justify-center"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500">
        <span className="text-finance">{icon}</span>
        <span>{label}</span>
        <ChevronLeft size={13} className="text-gray-300 ms-auto" />
      </div>
      <div className="mt-1 text-lg font-black text-gray-900 tabular-nums truncate">{value}</div>
      {sub && <div className="text-[10px] text-gray-400 truncate mt-0.5">{sub}</div>}
    </button>
  );
}
