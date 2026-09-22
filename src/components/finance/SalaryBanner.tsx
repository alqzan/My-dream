"use client";
import { useState, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, reserveBalance, round2, today } from "@/lib/utils";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { cycleLength } from "@/lib/budgetCycle";
import { findReserveByRole } from "@/lib/reserveFunds";
import { cycleOpening, type CycleOpening as Opening } from "@/lib/cycleOpening";
import { CycleOpening } from "@/components/finance/CycleOpening";
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
// المتراكمة إلى مظروف «الفوائض» وتتصفّر كل العدادات.
export function SalaryBanner() {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const monthlyIncome = useAppStore((s) => s.monthlyIncome);
  const salaryDay = useAppStore((s) => s.salaryDay);
  const lastSalaryConfirm = useAppStore((s) => s.lastSalaryConfirm);
  const confirmSalary = useAppStore((s) => s.confirmSalary);
  const [celebration, setCelebration] = useState<number | null>(null);
  // **تصحيحُ الفائض المرحَّل.** `null` = بلا تصحيح (يُرحَّل المحسوب كما هو).
  // شكوى المالك بنصّها: «ما أبغى يعطيني فائض وما عندي فايض» — الرقمُ المحسوب
  // مشتقٌّ من معاملاتٍ ناقصةٍ دائماً، وترحيلُ مالٍ لا وجود له إلى المظاريف
  // يُبنى عليه بعدها قرارُ تمويلٍ ومقاصة. ونزولاً فقط (يقصّه المتجر على
  // المحسوب): الصعودُ اختراعُ مال، ومكانُه المطابقةُ الربعية.
  const [carryEdit, setCarryEdit] = useState<string | null>(null);
  // البيانُ المعروضُ قبل الضغط يُحفظ لحظتَها ليُعرض في ورقة «دورة جديدة» بعده:
  // بعد التأكيد تكون الخطط قد نُفّذت ورُفع ما بلغ غايته، فإعادةُ حسابه حينئذٍ
  // تُري دورةً أخرى لا الدورةَ التي بدأت للتوّ. وهو نفسُه ما وقع (`planCycleFunding`).
  const [openedWith, setOpenedWith] = useState<Opening | null>(null);

  const todayStr = today();
  const surplus = findReserveByRole(reserves, "surplus");
  const opening = useMemo(
    () =>
      cycleOpening({
        income: monthlyIncome,
        dailyBudget,
        reserves,
        transactions,
        cycleLen: cycleLength(salaryDay ?? 27, todayStr),
        surplusId: surplus?.id,
        surplusBalance: surplus ? reserveBalance(surplus, transactions) : 0,
      }),
    [monthlyIncome, dailyBudget, reserves, transactions, salaryDay, todayStr, surplus]
  );
  if (!dailyBudget) return null;
  const due = salaryDue(salaryDay ?? 27, lastSalaryConfirm ?? null, todayStr);

  const balance = computeDailyBudgetStatus(dailyBudget, transactions).balance;
  const leftover = Math.max(0, balance);

  // الرقمُ المكتوب حين يكون تصحيحاً صالحاً، وإلّا `undefined` = بلا تصحيح.
  const carryTyped = carryEdit === null ? Number.NaN : Number(carryEdit.replace(/[^\d.]/g, ""));
  const carryOverride =
    carryEdit !== null && carryEdit.trim() !== "" && Number.isFinite(carryTyped)
      ? Math.min(leftover, round2(carryTyped))
      : undefined;

  function handleConfirm() {
    setOpenedWith(opening);
    setCelebration(confirmSalary(carryOverride));
    setCarryEdit(null);
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
                {" "}إلى مظروف <b>{SURPLUS_FUND_NAME}</b>، وتتصفّر كل العدادات لدورة جديدة.
              </p>
            </div>
          </div>

          {/* **البيانُ قبل الضغط لا بعده.** هذه اللحظةُ هي الوحيدة التي ما زال
              القرارُ فيها ممكناً: بعدها كلُّ ما يفعله النظام ردُّ فعل. فيرى
              المالكُ ما يخرج من راتبه وما يبقى له ومصروفَه اليومي **قبل** أن
              يبدأ الدورة، لا بعد أن ينزل الرقم بلا تفسير. */}
          <div className="mt-3">
            <CycleOpening opening={opening} title="هذا ما يبدأ عند التأكيد" />
          </div>

          {/* **صدقُ الفائض قبل أن يُرحَّل.** هذه آخرُ لحظةٍ يمكن فيها تصحيحُه:
              بعد الضغط يصير إيداعاً في «الفوائض» وتُبنى عليه قراراتُ الدورة
              القادمة كلُّها. */}
          {leftover > 0 && (
            <div className="mt-2.5">
              {carryEdit === null ? (
                <button
                  type="button"
                  onClick={() => setCarryEdit(String(Math.round(leftover)))}
                  className="text-[11px] underline decoration-white/40 underline-offset-4 opacity-90 hover:opacity-100 press"
                >
                  ما عندي هذا الفائض فعلاً — صحّحه
                </button>
              ) : (
                <div className="rounded-xl bg-white/15 px-3 py-2.5">
                  <label className="block text-[11px] opacity-90 mb-1.5">
                    كم بقي لك فعلاً من هذه الدورة؟ (صفرٌ إن لم يبقَ شيء)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={carryEdit}
                      onChange={(e) => setCarryEdit(e.target.value)}
                      max={Math.round(leftover)}
                      className="flex-1 min-w-0 rounded-lg bg-white/95 text-[#8a5a18] px-2.5 py-1.5 text-sm font-bold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setCarryEdit(null)}
                      className="shrink-0 text-[11px] opacity-90 hover:opacity-100 press"
                    >
                      تراجع
                    </button>
                  </div>
                  <p className="text-[10px] opacity-80 mt-1.5 leading-relaxed">
                    نزولاً فقط: ما فوق <b>{formatAmount(leftover)}</b> لا يُرحَّل — الزيادةُ لا تُخترع هنا، مكانُها
                    المطابقةُ الربعية حيث يقابلها رقمٌ من كشفك.
                  </p>
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleConfirm}
            className="mt-3 w-full bg-white/95 hover:bg-white text-[#8a5a18] font-bold text-sm py-2.5 rounded-xl transition-colors press"
          >
            {carryOverride !== undefined && carryOverride < leftover
              ? <>نعم، نزل الراتب — ويُرحَّل {formatAmount(carryOverride)} ✓</>
              : <>نعم، نزل الراتب ✓</>}
          </button>
        </div>
      )}

      <Modal open={celebration !== null} onClose={() => { setCelebration(null); setOpenedWith(null); }} title="دورة جديدة 🎉">
        {celebration !== null && celebration > 0 && <Confetti />}
        <div className="space-y-3 py-2">
          <p className="text-5xl text-center">🌙✨</p>
          {celebration && celebration > 0 ? (
            <p className="text-sm text-gray-700 leading-relaxed text-center">
              أضفنا <b className="text-finance">{formatAmount(celebration)} ر.س</b> إلى صندوق {SURPLUS_FUND_NAME}،
              <br />وصفّرنا العدادات — بداية موفقة للدورة الجديدة!
            </p>
          ) : (
            <p className="text-sm text-gray-700 leading-relaxed text-center">
              بدأنا دورة جديدة وصفّرنا العدادات.
              <br />لم يكن هناك فائض هذه الدورة — الدورة القادمة أفضل بإذن الله 💪
            </p>
          )}
          {/* البيانُ نفسُه الذي قُرئ قبل الضغط — لأنّه ما وقع بالضبط. */}
          {openedWith && <CycleOpening opening={openedWith} title="دورتك الجديدة" />}
          <Button onClick={() => { setCelebration(null); setOpenedWith(null); }} className="w-full bg-finance hover:bg-finance/90">تم ✓</Button>
        </div>
      </Modal>
    </>
  );
}
