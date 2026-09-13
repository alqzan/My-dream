"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { ReserveSplit } from "@/lib/types";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today } from "@/lib/utils";
import { cyclePace, expenseWeight } from "@/lib/budgetFlow";
import { planBigExpense, suggestPayoffPerCycle, fundingPerDay, PAYOFF_CYCLE_CHOICES } from "@/lib/fundPlan";
import { cycleLength } from "@/lib/budgetCycle";
import { daysUntilSalary, surplusPullSource } from "@/lib/financeOverview";
import { Tent, Wand2 } from "lucide-react";

// ===================== «رحلة المدينة»: أين تسكن الصدمة الكبيرة؟ =====================
// كان أمام المصروف الكبير طريقان كلاهما يكذب: أن يُسجَّل عادياً فيبتلع الميزانية
// اليومية أسبوعين ويُفقدها معنى قياس الانضباط، أو يُوسم «خارج الميزانيات» فيختفي
// من كلّ وعاءٍ رغم أنّ المال خرج فعلاً.
//
// ثمّ تبيّن أنّ الطريق الثالث (مظروفٌ للحدث) ليس كافياً وحدَه ما دام يسأل المالك
// سؤالين عند الكاشير: **من أين؟ وعلى كم دورة؟**. فصار التطبيق يقرأ حالته ويقترح
// **توزيعاً واحداً جاهزاً** (`planBigExpense`): رصيدُ الدورة أوّلاً، فالفوائض بما
// لا يُفرغ وسادةَ المقاصة، فالباقي سدادٌ بأقلّ عددِ دوراتٍ يُبقي نقصَ البدل في
// حدّه. ضغطةٌ واحدة تنفّذها، و«عدّلها» يفتح كلّ رقمٍ فيها لمن أراد.
//
// لا تظهر البطاقة إلّا حين يستحقّ المصروفُ قراراً — `expenseWeight(...).big`.
const EVENT_ICON = "🎒";
const EVENT_COLOR = "#8a6fb0";

interface Props {
  amount: number;
  note: string;
  splits: ReserveSplit[];
  offBudget: boolean;
  onDaily: () => void;
  onFund: (fundId: string, pct?: number) => void;
  onOffBudget: () => void;
}

export function BigExpenseRouter({ amount, note, splits, offBudget, onDaily, onFund, onOffBudget }: Props) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const salaryDay = useAppStore((s) => s.salaryDay);
  const addReserve = useAppStore((s) => s.addReserve);
  const transferBetweenReserves = useAppStore((s) => s.transferBetweenReserves);
  const setReserveFunding = useAppStore((s) => s.setReserveFunding);

  const [tweaking, setTweaking] = useState(false);
  const [newName, setNewName] = useState("");
  const [cycles, setCycles] = useState<number | null>(null); // null = العدد المحسوب

  const weight = expenseWeight(amount, dailyBudget?.amount ?? 0);
  // بلا ميزانيةٍ يومية لا مقياس لـ«كبير» أصلاً، فلا قرار يُعرض.
  if (!dailyBudget || !weight.big) return null;

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const daysLeft = daysUntilSalary(salaryDay ?? 27, today());
  const len = cycleLength(salaryDay ?? 27, today());
  const surplus = surplusPullSource(reserves, transactions, true);
  const plan = planBigExpense({
    amount,
    cycleBalance: status.balance,
    rate: status.rate,
    surplusBalance: surplus?.balance ?? 0,
    cycleLen: len,
  });
  // عددُ الدورات: المحسوب ما لم يختر المالك غيره.
  const planCycles = cycles ?? plan.cycles;
  const perCycle = plan.financed > 0 && planCycles > 0 ? suggestPayoffPerCycle(plan.financed, planCycles) : 0;
  const perDay = perCycle > 0 ? fundingPerDay(perCycle, len) : 0;
  const after = cyclePace(status.balance - amount, status.rate, daysLeft);

  const route: "daily" | "fund" | "off" = offBudget ? "off" : splits.length ? "fund" : "daily";
  const chosenFund = splits.length ? reserves.find((f) => f.id === splits[0].fundId) : undefined;
  const name = (newName.trim() || note.trim() || "حدث").slice(0, 40);

  // تنفيذُ الخطة بضغطة: مظروفٌ باسم الحدث · تمويلٌ فوريّ من الفوائض · خطةُ سدادٍ
  // للباقي · وحصّةُ المعاملة موزّعةٌ بين الجيب والمظروف بالنسبة المحسوبة.
  function applyPlan() {
    const id = uid();
    addReserve({ id, name, icon: EVENT_ICON, color: EVENT_COLOR, deposits: [], createdAt: today() });
    if (plan.fromSurplus > 0 && surplus) {
      transferBetweenReserves(surplus.fundId, id, plan.fromSurplus, `تمويل «${name}»`);
    }
    if (plan.financed > 0 && perCycle > 0) {
      setReserveFunding(id, { perCycle, source: "salary", stop: "zero" });
    }
    onFund(id, plan.envelopePct);
    setTweaking(false);
  }

  // مظروفٌ قائم اختاره المالك بنفسه — بلا خطة، كامل المبلغ عليه.
  function pickExisting(fundId: string) {
    onFund(fundId, 100);
    setTweaking(false);
  }

  const line = "flex items-baseline gap-1.5 text-[11px] leading-relaxed";
  return (
    <div
      className="rounded-xl p-3 space-y-2.5 animate-fade-up"
      style={{ background: "var(--paper2)", border: "1px solid var(--theme-accent-line)" }}
    >
      <div className="flex items-center gap-2">
        <Tent size={15} className="text-finance shrink-0" />
        <span className="text-xs font-bold text-finance">
          مصروفٌ كبير — يعادل {formatAmount(weight.days)} يوماً من بدلك
        </span>
      </div>

      {/* ————— الخطة المقترحة: الجواب جاهزاً، ومعه سببُه ————— */}
      {plan.needsEnvelope ? (
        <div className="rounded-lg px-2.5 py-2 space-y-1" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
          <div className="flex items-center gap-1.5 text-[11px] font-bold" style={{ color: "var(--ink)" }}>
            <Wand2 size={13} className="text-finance" /> الخطة المقترحة
          </div>
          {plan.fromCycle > 0 && (
            <div className={line} style={{ color: "var(--ink52)" }}>
              <b className="text-finance">{formatAmount(Math.round(plan.fromCycle))}</b>
              <span>من رصيد دورتك الحالي — متاحٌ الآن ولا يرتّب التزاماً</span>
            </div>
          )}
          {plan.fromSurplus > 0 && (
            <div className={line} style={{ color: "var(--ink52)" }}>
              <b className="text-finance">{formatAmount(Math.round(plan.fromSurplus))}</b>
              <span>
                من {SURPLUS_FUND_NAME} — ويبقى فيها {formatAmount(Math.round(plan.keptCushion))} وسادةً للمقاصة
              </span>
            </div>
          )}
          {plan.financed > 0 && (
            <div className={line} style={{ color: "var(--ink52)" }}>
              <b className="text-amber-600">{formatAmount(Math.round(plan.financed))}</b>
              <span>
                سداداً على {formatAmount(planCycles)} {planCycles === 1 ? "دورة" : "دورات"} —{" "}
                {formatAmount(Math.round(perCycle))} ر.س لكل دورة، أي{" "}
                <b className="text-amber-600">{formatAmount(Math.round(perDay))} ر.س/يوم</b> من بدلك
                {cycles === null && <> (أقلُّ عددٍ يُبقي النقص دون ثلث بدلك)</>}
              </span>
            </div>
          )}
          <div className="text-[10px] pt-0.5" style={{ color: "var(--ink52)" }}>
            ↳ يُفتح مظروفٌ باسم «{name}» يحمل {formatAmount(plan.envelopePct)}٪ من المبلغ، وبدلك اليومي لا ينكسر.
          </div>
        </div>
      ) : (
        <div className="rounded-lg px-2.5 py-2 text-[11px] leading-relaxed" style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink52)" }}>
          ✓ رصيدُ دورتك يتحمّله — يُخصم من بدلك مباشرةً ولا داعي لمظروف. (يبقى بعده{" "}
          {formatAmount(Math.round(status.balance - amount))} ر.س، وبدلك لبقيّة الدورة{" "}
          {formatAmount(Math.round(after.rate))} ر.س/يوم.)
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => (plan.needsEnvelope ? applyPlan() : onDaily())}
          className="flex-1 bg-finance text-white text-[11px] font-bold py-2 rounded-lg press"
        >
          {plan.needsEnvelope ? "اعتمد الخطة" : "سجّله من البدل"}
        </button>
        <button
          type="button"
          onClick={() => setTweaking((v) => !v)}
          className="text-[11px] font-semibold px-3 rounded-lg press"
          style={{ border: "1px solid var(--line)", color: "var(--ink52)" }}
        >
          {tweaking ? "إخفاء" : "عدّلها"}
        </button>
      </div>

      {route === "fund" && chosenFund && (
        <p className="text-[10px] text-finance font-semibold">
          ✓ {splits[0]?.pct ?? 100}٪ منه على «{chosenFund.name}» — الباقي من بدلك
        </p>
      )}

      {/* ————— التعديل اليدويّ: كلّ رقمٍ في الخطة مفتوح ————— */}
      {tweaking && (
        <div className="space-y-2 animate-fade-up">
          <div>
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
              اسم المظروف
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={note.trim() || "مثل: رحلة المدينة"}
              className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
              style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
            />
          </div>

          {plan.financed > 0 && (
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
                على كم دورة تسدّد {formatAmount(Math.round(plan.financed))} ر.س؟
              </label>
              <div className="flex gap-1 flex-wrap">
                {PAYOFF_CYCLE_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCycles(n)}
                    aria-pressed={planCycles === n}
                    className={cn(
                      "text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-colors press",
                      planCycles === n ? "bg-finance text-white border-finance" : "text-gray-500"
                    )}
                    style={planCycles === n ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
                  >
                    {formatAmount(n)}
                  </button>
                ))}
                {cycles !== null && (
                  <button
                    type="button"
                    onClick={() => setCycles(null)}
                    className="text-[10px] font-semibold text-finance px-2 press"
                  >
                    المحسوب ({formatAmount(plan.cycles)})
                  </button>
                )}
              </div>
            </div>
          )}

          {reserves.length > 0 && (
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
                أو ضعه كاملاً على مظروفٍ قائم
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {reserves.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => pickExisting(f.id)}
                    className={cn(
                      "text-[11px] px-2.5 py-1 rounded-full border transition-colors press",
                      chosenFund?.id === f.id ? "border-finance bg-finance text-white font-semibold" : "text-gray-500"
                    )}
                    style={chosenFund?.id === f.id ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
                  >
                    {f.icon} {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1.5 pt-0.5">
            <button
              type="button"
              onClick={onDaily}
              aria-pressed={route === "daily"}
              className={cn(
                "flex-1 text-[11px] font-bold py-1.5 rounded-lg press",
                route === "daily" ? "bg-white dark:bg-white/15 text-finance shadow-sm" : "text-gray-400"
              )}
              style={route === "daily" ? undefined : { border: "1px solid var(--line)" }}
            >
              كلّه من البدل اليومي
            </button>
            <button
              type="button"
              onClick={onOffBudget}
              aria-pressed={route === "off"}
              className={cn(
                "flex-1 text-[11px] font-bold py-1.5 rounded-lg press",
                route === "off" ? "bg-white dark:bg-white/15 text-finance shadow-sm" : "text-gray-400"
              )}
              style={route === "off" ? undefined : { border: "1px solid var(--line)" }}
            >
              خارج الميزانيات
            </button>
          </div>
          {route === "daily" && (
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
              ينزل بدلك لبقيّة الدورة إلى{" "}
              <b className={after.kind === "beyond" ? "text-red-500" : "text-amber-600"}>
                {formatAmount(Math.round(after.rate))} ر.س/يوم
              </b>{" "}
              ({formatAmount(daysLeft)} يوم على الراتب).
            </p>
          )}
          {route === "off" && (
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
              سيظهر في السجل والإحصائيات ومجموع الشهر، ولا يُحاسَب في أيّ وعاء — لما لا تريد تتبّعه أصلاً.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
