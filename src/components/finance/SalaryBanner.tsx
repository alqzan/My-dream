"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, today } from "@/lib/utils";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Confetti } from "@/components/ui/Confetti";
import { PartyPopper } from "lucide-react";

// هل حان سؤال «نزل الراتب؟» — من يوم الراتب وحتى يؤكد المستخدم.
function salaryDue(salaryDay: number, lastConfirm: string | null, todayStr: string): boolean {
  const [y, m, d] = todayStr.split("-").map(Number);
  // أحدث تاريخ راتب في/قبل اليوم
  let saly = y, salm = m;
  if (d < salaryDay) {
    salm = m === 1 ? 12 : m - 1;
    saly = m === 1 ? y - 1 : y;
  }
  const lastDayOfMonth = new Date(saly, salm, 0).getDate();
  const salaryDate = `${saly}-${String(salm).padStart(2, "0")}-${String(Math.min(salaryDay, lastDayOfMonth)).padStart(2, "0")}`;
  return !lastConfirm || lastConfirm < salaryDate;
}

// بانر «نزل الراتب؟ 🎉»: عند التأكيد يتحول باقي الميزانية اليومية
// المتراكمة إلى صندوق «الفوائض» في الاحتياطي وتتصفّر كل العدادات.
export function SalaryBanner() {
  const { dailyBudget, transactions, salaryDay, lastSalaryConfirm, confirmSalary } = useAppStore();
  const [celebration, setCelebration] = useState<number | null>(null);

  const todayStr = today();
  if (!dailyBudget) return null;
  const due = salaryDue(salaryDay ?? 27, lastSalaryConfirm ?? null, todayStr);

  const balance = computeDailyBudgetStatus(dailyBudget, transactions).balance;
  const leftover = Math.max(0, balance);

  function handleConfirm() {
    setCelebration(confirmSalary());
  }

  return (
    <>
      {due && (
        <div className="rounded-2xl p-4 text-white bg-gradient-to-l from-[#8a5a18] via-[#b07d20] to-[#d99e33] card-shadow shine animate-fade-up">
          <div className="flex items-center gap-3">
            <PartyPopper size={28} className="shrink-0" />
            <div className="flex-1">
              <p className="font-bold text-base">نزل الراتب؟ 🎉</p>
              <p className="text-xs opacity-90 mt-0.5 leading-relaxed">
                عند التأكيد يتحول باقي ميزانيتك اليومية
                {leftover > 0 && <> (<b>{formatAmount(leftover)} ر.س</b>)</>}
                {" "}إلى صندوق <b>{SURPLUS_FUND_NAME}</b> في الاحتياطي، وتتصفّر كل العدادات لدورة جديدة.
              </p>
            </div>
          </div>
          <button
            onClick={handleConfirm}
            className="mt-3 w-full bg-white/95 hover:bg-white text-[#8a5a18] font-bold text-sm py-2.5 rounded-xl transition-colors press"
          >
            نعم، نزل الراتب ✓
          </button>
        </div>
      )}

      <Modal open={celebration !== null} onClose={() => setCelebration(null)} title="دورة جديدة 🎉">
        {celebration !== null && celebration > 0 && <Confetti />}
        <div className="text-center space-y-3 py-2">
          <p className="text-5xl">🌙✨</p>
          {celebration && celebration > 0 ? (
            <p className="text-sm text-gray-700 leading-relaxed">
              أضفنا <b className="text-finance">{formatAmount(celebration)} ر.س</b> إلى صندوق {SURPLUS_FUND_NAME}،
              <br />وصفّرنا العدادات — بداية موفقة للدورة الجديدة!
            </p>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed">
              بدأنا دورة جديدة وصفّرنا العدادات.
              <br />لم يكن هناك فائض هذه الدورة — الدورة القادمة أفضل بإذن الله 💪
            </p>
          )}
          <Button onClick={() => setCelebration(null)} className="w-full bg-finance hover:bg-finance/90">تم ✓</Button>
        </div>
      </Modal>
    </>
  );
}
