"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today } from "@/lib/utils";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { NumberInput } from "@/components/ui/NumberInput";
import { Settings2, PiggyBank } from "lucide-react";

type Mode = "fixed" | "income";

const PCT_PRESETS = [10, 20, 30, 50];

// A cumulative daily allowance instead of a monthly cap: spend less than
// the daily rate today and it cushions tomorrow, spend more and it eats
// into your running balance. The daily amount is either a fixed figure or
// a percentage of monthly income (income × pct / 100 ÷ 30).
export function DailyBudgetCard() {
  const {
    dailyBudget, transactions, monthlyIncome, reserves, salaryDay,
    setDailyBudget, removeDailyBudget, setMonthlyIncome, setSalaryDay,
    sweepToReserve, addReserve,
  } = useAppStore();
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(dailyBudget?.incomePct ? "income" : "fixed");
  const [amount, setAmount] = useState(dailyBudget?.amount?.toString() ?? "");
  const [salaryDayInput, setSalaryDayInput] = useState(String(salaryDay ?? 27));
  const [sweeping, setSweeping] = useState(false);
  // The monthly income is shared app-wide (budgets by % use it too).
  const [income, setIncome] = useState((dailyBudget?.monthlyIncome ?? monthlyIncome)?.toString() ?? "");
  const [pct, setPct] = useState(dailyBudget?.incomePct?.toString() ?? "30");

  const parsedIncome = parseFloat(income) || 0;
  const parsedPct = parseFloat(pct) || 0;
  const derivedDaily = parsedIncome > 0 && parsedPct > 0 ? (parsedIncome * parsedPct) / 100 / 30 : 0;

  function handleSave() {
    if (mode === "income") {
      if (!derivedDaily) return;
      setMonthlyIncome(parsedIncome);
      setDailyBudget(Math.round(derivedDaily * 100) / 100, {
        monthlyIncome: parsedIncome,
        incomePct: parsedPct,
      });
    } else {
      const parsed = parseFloat(amount);
      if (!parsed || parsed <= 0) return;
      setDailyBudget(parsed);
    }
    const day = parseInt(salaryDayInput);
    if (day) setSalaryDay(day);
    setEditing(false);
  }

  // نقل كامل فائض اليومية إلى احتياطي محدد (وتصفير عدّاد اليومية).
  function handleSweep(fundId: string, balance: number) {
    sweepToReserve(fundId, Math.round(balance * 100) / 100);
    setSweeping(false);
  }

  function handleSweepToNewSurplus(balance: number) {
    const fund = {
      id: uid(),
      name: SURPLUS_FUND_NAME,
      icon: "✨",
      color: "#c9852a",
      deposits: [],
      createdAt: today(),
    };
    addReserve(fund);
    handleSweep(fund.id, balance);
  }

  if (!dailyBudget || editing) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <span className="text-sm font-semibold text-gray-700">الميزانية اليومية المتراكمة</span>
          <p className="text-xs text-gray-400 mt-0.5">
            حدّد مبلغاً يومياً — لو صرفت أقل ينضاف الفرق ليومك الجاي، ولو صرفت أكثر يتخصم منه.
          </p>
        </div>

        {/* Fixed amount vs. percentage-of-income */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          {([["fixed", "مبلغ ثابت"], ["income", "نسبة من الدخل"]] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex-1 text-xs font-semibold py-1.5 rounded-lg transition-all",
                mode === m ? "bg-white text-finance shadow-sm" : "text-gray-400"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "fixed" ? (
          <div className="flex gap-2">
            <NumberInput
              value={amount} onChange={setAmount}
              placeholder="مثلاً 500" inputMode="decimal"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
            />
            <button onClick={handleSave} className="bg-finance text-white text-sm px-4 py-2 rounded-lg hover:bg-finance/90 shrink-0">
              {dailyBudget ? "تحديث" : "ابدأ"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5 animate-fade-up">
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">دخلك الشهري (ريال)</label>
              <NumberInput
                value={income} onChange={setIncome}
                placeholder="مثلاً 10000" inputMode="decimal"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-400 mb-1">نسبة المصروف اليومي من الدخل</label>
              <div className="flex gap-1.5 items-center">
                {PCT_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPct(String(p))}
                    className={cn(
                      "text-xs font-bold rounded-lg px-2.5 py-1.5 border transition-colors",
                      parsedPct === p
                        ? "bg-finance text-white border-finance"
                        : "bg-white text-gray-500 border-gray-200 hover:border-finance/40"
                    )}
                  >
                    {p}٪
                  </button>
                ))}
                <NumberInput
                  value={pct} onChange={setPct}
                  placeholder="٪" inputMode="numeric" min={1} max={100}
                  className="w-16 text-xs text-center border border-gray-200 rounded-lg py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                  aria-label="نسبة مخصصة"
                />
              </div>
            </div>
            {derivedDaily > 0 && (
              <div className="bg-finance/5 rounded-xl px-3 py-2 text-center animate-fade-up">
                <span className="text-xs text-gray-500">
                  {formatAmount(parsedIncome)} × {parsedPct}٪ ÷ 30 يوم ={" "}
                </span>
                <span className="text-sm font-bold text-finance">{formatAmount(Math.round(derivedDaily))} ر.س/يوم</span>
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={!derivedDaily}
              className="w-full bg-finance text-white text-sm py-2 rounded-lg hover:bg-finance/90 disabled:opacity-40"
            >
              {dailyBudget ? "تحديث" : "ابدأ"}
            </button>
          </div>
        )}

        <div>
          <label className="block text-[10px] text-gray-400 mb-1">يوم نزول الراتب — يظهر بعده سؤال «نزل الراتب؟» وتتحول البواقي للفوائض</label>
          <NumberInput
            value={salaryDayInput} onChange={setSalaryDayInput}
            min={1} max={31} inputMode="numeric"
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-finance/40"
          />
        </div>

        {editing && (
          <div className="flex items-center justify-between">
            <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 hover:text-gray-500">إلغاء</button>
            {dailyBudget && (
              <button onClick={() => { removeDailyBudget(); setEditing(false); }} className="text-[11px] text-red-400 hover:text-red-500">
                إيقاف الميزانية اليومية
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const over = status.balance < 0;

  return (
    <div className={`rounded-2xl p-4 space-y-2 ${over ? "bg-red-50" : "bg-finance/5"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">الميزانية اليومية المتراكمة</span>
        <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600 p-1">
          <Settings2 size={15} />
        </button>
      </div>
      <div className="text-center py-1">
        <div className={`text-3xl font-bold ${over ? "text-red-500" : "text-finance"}`}>
          {over ? "-" : "+"}{formatAmount(Math.abs(status.balance))}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5">ر.س {over ? "بالسالب" : "رصيدك متراكم"}</div>
      </div>
      {status.days === 0 ? (
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          🌱 رُحّل الفائض — الدورة الجديدة تبدأ من الغد بمعدل {formatAmount(dailyBudget.amount)} ر.س يومياً
        </p>
      ) : status.carryAdjust > 0 ? (
        // بعد ترحيل الفائض: المخصّص الفعّال ينقص بمقدار ما رُحّل، فلا تصحّ
        // صيغة «المبلغ × الأيام». نعرض المتاح والمصروف مباشرةً.
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          🌱 دورة جديدة بعد الترحيل بمعدل {formatAmount(dailyBudget.amount)} ر.س يومياً — متاح {formatAmount(status.allowance)} ر.س، صرفت {formatAmount(status.spent)} ر.س
        </p>
      ) : (
        <p className="text-xs text-gray-500 text-center leading-relaxed">
          {formatAmount(dailyBudget.amount)} ر.س × {status.days} يوم = {formatAmount(status.allowance)} ر.س متاح — صرفت {formatAmount(status.spent)} ر.س
        </p>
      )}
      {dailyBudget.incomePct && dailyBudget.monthlyIncome ? (
        <p className="text-[10px] text-gray-400 text-center">
          💼 {dailyBudget.incomePct}٪ من دخلك الشهري ({formatAmount(dailyBudget.monthlyIncome)} ر.س)
        </p>
      ) : null}

      {/* فائض متراكم؟ حوّله للاحتياطي بضغطة — ويبدأ العدّاد من جديد */}
      {status.balance > 0 && (
        sweeping ? (
          <div className="bg-white/70 dark:bg-white/5 rounded-xl p-2.5 space-y-1.5 animate-fade-up">
            <p className="text-[11px] font-bold text-gray-600 text-center">
              وين تحب تحط {formatAmount(status.balance)} ر.س؟
            </p>
            {reserves.map((f) => (
              <button
                key={f.id}
                onClick={() => handleSweep(f.id, status.balance)}
                className="w-full flex items-center gap-2 text-sm bg-white dark:bg-white/10 border border-gray-100 rounded-lg px-3 py-2 hover:border-finance/40 press"
              >
                <span>{f.icon}</span>
                <span className="flex-1 text-right text-gray-700 font-medium">{f.name}</span>
              </button>
            ))}
            {!reserves.some((f) => f.name === SURPLUS_FUND_NAME) && (
              <button
                onClick={() => handleSweepToNewSurplus(status.balance)}
                className="w-full flex items-center gap-2 text-sm bg-white dark:bg-white/10 border border-dashed border-finance/40 rounded-lg px-3 py-2 text-finance font-medium press"
              >
                ✨ صندوق {SURPLUS_FUND_NAME} (جديد)
              </button>
            )}
            <button onClick={() => setSweeping(false)} className="w-full text-[11px] text-gray-400 py-1">
              إلغاء
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSweeping(true)}
            className="w-full flex items-center justify-center gap-2 text-sm font-bold text-finance bg-finance/10 hover:bg-finance/15 rounded-xl py-2.5 transition-colors press"
          >
            <PiggyBank size={15} />
            أضف الفائض ({formatAmount(status.balance)} ر.س) للاحتياطي
          </button>
        )
      )}
    </div>
  );
}
