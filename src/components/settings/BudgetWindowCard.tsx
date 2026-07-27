"use client";
import { useAppStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { formatDate, today, cn } from "@/lib/utils";
import { budgetCycleStart, cycleDays } from "@/lib/budgetCycle";
import type { BudgetWindowMode } from "@/lib/types";
import { Gauge } from "lucide-react";

// بطاقة إعدادات: على أيّ مدىً تُحسب **سقوف التصنيفات**؟ دورة الراتب (تتصفّر عند
// تأكيد «نزل الراتب») أو الشهر الميلادي (تتصفّر أوّل كل شهر). التبديل عرضٌ محض:
// السقوف نفسها والمعاملات لا تُمسّ — يتغيّر ما يُحتسب داخل النافذة فقط.
// الميزانية اليومية المتراكمة لها دورتها الخاصة ولا يمسّها هذا الخيار.
const OPTIONS: { mode: BudgetWindowMode; label: string; hint: string }[] = [
  { mode: "salary", label: "دورة الراتب", hint: "من يوم تأكيد «نزل الراتب» حتى الراتب التالي" },
  { mode: "month", label: "الشهر الميلادي", hint: "من أوّل الشهر إلى آخره، ويتصفّر أوّل كل شهر" },
];

export function BudgetWindowCard() {
  const { budgetWindow, setBudgetWindow, salaryDay, lastSalaryConfirm } = useAppStore();
  const mode: BudgetWindowMode = budgetWindow === "month" ? "month" : "salary";
  const todayStr = today();
  const start = budgetCycleStart(lastSalaryConfirm, salaryDay ?? 27, todayStr);

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-finance" />
          <span className="text-sm font-semibold text-gray-700">مدى حساب سقوف التصنيفات</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          على أيّ فترةٍ يُجمع الصرف داخل كل سقف؟ التبديل لا يمسّ سقوفك ولا معاملاتك — يغيّر ما
          يُحتسب داخل الفترة فقط. (الميزانية اليومية المتراكمة لها دورتها الخاصة ولا يمسّها هذا الخيار.)
        </p>

        <div className="flex bg-gray-100 rounded-xl p-1">
          {OPTIONS.map((o) => (
            <button
              key={o.mode}
              onClick={() => setBudgetWindow(o.mode)}
              aria-pressed={mode === o.mode}
              className={cn(
                "flex-1 text-xs font-semibold py-2 rounded-lg transition-all press",
                mode === o.mode ? "bg-white text-finance shadow-sm" : "text-gray-400"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-gray-500 bg-finance/5 rounded-xl px-3 py-2 leading-relaxed">
          {mode === "salary" ? (
            <>
              🔄 الدورة الحالية بدأت {formatDate(start)} — اليوم {cycleDays(start, todayStr)} منها. تتصفّر
              السقوف حين تؤكّد «نزل الراتب» (يوم {salaryDay ?? 27} من الشهر).
            </>
          ) : (
            <>📅 الحساب من {formatDate(`${todayStr.slice(0, 8)}01`)} — اليوم {Number(todayStr.slice(8))} من الشهر.</>
          )}
        </p>
      </div>
    </Card>
  );
}
