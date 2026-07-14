"use client";
import { useState, useEffect } from "react";
import { useAppStore } from "@/lib/store";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today } from "@/lib/utils";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { NumberInput } from "@/components/ui/NumberInput";
import { Settings2, PiggyBank } from "lucide-react";

type Mode = "fixed" | "income";

const PCT_PRESETS = [10, 20, 30, 50];

// «الساعة المائية / إناء اليوم» — إناء يمتلئ بمقدار المتبقّي من يومية اليوم
// ويفرغ مع الصرف. المستوى = المتبقّي ÷ المتاح (مقصوص بين ٠ و١) بنفس قيم
// computeDailyBudgetStatus — تمثيل بصري فقط، بلا أي حساب جديد. الحدّ من ذهبٍ
// رفيع كأخوات الأداة (PrayerOrbit)، والتعبئة خضراء ماليّة تتحوّل لعنبريّ دافئ
// حين تقارب النفاد، وإناء فارغ بلمسة حمراء عند السالب.
function BudgetVessel({ frac, over }: { frac: number; over: boolean }) {
  const [lvl, setLvl] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setLvl(frac));
    return () => cancelAnimationFrame(t);
  }, [frac]);
  // مستوى الماء داخل الإناء: ممتلئ ≈ y24، فارغ ≈ y112.
  const top = 112 - lvl * 88;
  const grad = over ? "vgLow" : frac < 0.25 ? "vgLow" : "vgOk";
  return (
    <svg width={92} height={112} viewBox="0 0 100 124" className="shrink-0" aria-hidden="true">
      <defs>
        <linearGradient id="vgOk" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5cb85f" />
          <stop offset="100%" stopColor="#2f7a33" />
        </linearGradient>
        <linearGradient id="vgLow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8b15a" />
          <stop offset="100%" stopColor="#d76a2e" />
        </linearGradient>
        <clipPath id="vClip">
          <path d="M26,22 C26,17 74,17 74,22 L74,95 C74,109 60,114 50,114 C40,114 26,109 26,95 Z" />
        </clipPath>
      </defs>
      {!over ? (
        <g clipPath="url(#vClip)">
          <g className="vessel-water" style={{ transform: `translateY(${top}px)` }}>
            <g className="vessel-wave-anim">
              <path
                d="M-50,5 q25,-5 50,0 t50,0 t50,0 t50,0 t50,0 V132 H-50 Z"
                fill={`url(#${grad})`}
              />
            </g>
          </g>
        </g>
      ) : (
        <g clipPath="url(#vClip)">
          <rect x="0" y="106" width="100" height="10" fill="#e05555" opacity="0.28" />
        </g>
      )}
      {/* حدّ الإناء الذهبي الرفيع */}
      <path
        d="M22,20 C22,14 78,14 78,20 L78,96 C78,112 62,118 50,118 C38,118 22,112 22,96 Z"
        fill="none" stroke={over ? "#d98a3a" : "#c9852a"} strokeWidth="2" strokeLinejoin="round"
      />
      <ellipse cx="50" cy="20" rx="28" ry="5.5" fill="none" stroke="#c9852a" strokeWidth="2" />
    </svg>
  );
}

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
  // نسبة امتلاء الإناء = المتبقّي ÷ المتاح (نفس قيم البطاقة، بلا حساب جديد).
  const frac =
    status.allowance > 0
      ? Math.min(1, Math.max(0, status.balance / status.allowance))
      : over
      ? 0
      : 1;

  return (
    <div className={`rounded-2xl p-4 space-y-2 ${over ? "bg-red-50" : "bg-finance/5"}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">الميزانية اليومية المتراكمة</span>
        <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600 p-1">
          <Settings2 size={15} />
        </button>
      </div>
      <div className="flex items-center justify-center gap-4 py-1">
        <BudgetVessel frac={frac} over={over} />
        <div className="text-center">
          <div className={`text-3xl font-bold ${over ? "text-red-500" : "text-finance"}`}>
            {over ? "-" : "+"}{formatAmount(Math.abs(status.balance))}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">ر.س {over ? "بالسالب" : "رصيدك متراكم"}</div>
        </div>
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
