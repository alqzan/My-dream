"use client";
import type { FinanceOverview } from "@/lib/financeOverview";
import { formatAmount, getCategoryInfo } from "@/lib/utils";
import type { FinanceCategoryDef } from "@/lib/types";
import { Wallet, CalendarClock, CalendarDays, Landmark, ChevronLeft } from "lucide-react";

// «نظرة اليوم» — أوّل ما يظهر في صفحة الأموال: بطاقةٌ رئيسية للمتاح اليوم، وشبكة
// 2×2 لأربعة أرقامٍ أخرى. كلٌّ منها ينقل إلى قسمه في الصفحة. عند غياب إعدادٍ
// (ميزانية/احتياطي/التزام) تظهر دعوةُ إعدادٍ صادقة بدل رقمٍ مضلِّل. عرضٌ محض.
export function FinanceGlance({
  overview, categories, onGo,
}: {
  overview: FinanceOverview;
  categories: FinanceCategoryDef[];
  onGo: (section: "daily" | "budgets" | "recurring" | "reserves" | "history") => void;
}) {
  const { hasBudget, availableToday, monthSpend, daysToSalary, reservesTotal, hasReserves, nearest } = overview;
  const negative = hasBudget && availableToday < 0;

  return (
    <div className="space-y-2 animate-fade-up">
      {/* البطاقة الرئيسية — المتاح اليوم */}
      <button
        onClick={() => onGo("daily")}
        aria-label="المتاح اليوم — افتح الميزانية اليومية"
        className={`w-full text-right rounded-2xl p-4 card-shadow press border ${
          !hasBudget
            ? "bg-white border-gray-100"
            : negative
              ? "border-red-500/30 bg-gradient-to-l from-[#7a1f1f] to-[#b23b3b] text-white"
              : "border-finance/30 bg-gradient-to-l from-[#1d5c20] to-[#3d9640] text-white"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className={`flex items-center gap-1.5 text-xs font-semibold ${hasBudget ? "opacity-90" : "text-gray-500"}`}>
              <Wallet size={14} /> المتاح المتراكم اليوم
            </div>
            {hasBudget ? (
              <div className="mt-1 text-3xl font-black tabular-nums leading-none">
                {formatAmount(availableToday)} <span className="text-lg font-bold">ر.س</span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-gray-500">لم تحدّد ميزانيةً يومية بعد — حدّدها لتتابع المتاح كل يوم.</p>
            )}
          </div>
          {!hasBudget && (
            <span className="shrink-0 text-xs font-bold text-white bg-finance rounded-lg px-3 py-2">حدّد الآن</span>
          )}
        </div>
      </button>

      {/* شبكة 2×2 لبقية الأرقام */}
      <div className="grid grid-cols-2 gap-2">
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
          icon={<span className="text-[13px]">📌</span>}
          label="أقرب التزام"
          value={nearest ? `${formatAmount(nearest.amount)} ر.س` : "لا التزامات"}
          sub={
            nearest
              ? `${getCategoryInfo(categories, nearest.category).icon} ${nearest.note || getCategoryInfo(categories, nearest.category).label} · ${nearest.daysUntil === 0 ? "اليوم" : nearest.daysUntil === 1 ? "غداً" : `خلال ${nearest.daysUntil} يوم`}`
              : "أضِف التزاماً متكرّراً"
          }
          onClick={() => onGo("recurring")}
        />
        <GlanceTile
          icon={<Landmark size={14} />}
          label="الاحتياطيات"
          value={hasReserves ? `${formatAmount(reservesTotal)} ر.س` : "لا احتياطي"}
          sub={hasReserves ? undefined : "أنشئ صندوقاً للطوارئ"}
          onClick={() => onGo("reserves")}
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
      className="w-full min-h-[64px] text-right bg-white rounded-2xl border border-gray-100 p-3 press hover:border-finance/40 transition-colors flex flex-col justify-center"
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
