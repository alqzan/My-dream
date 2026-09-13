"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { ReserveSplit } from "@/lib/types";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today } from "@/lib/utils";
import { expenseWeight } from "@/lib/budgetFlow";
import {
  buildPlanOptions, suggestPayoffPerCycle, fundingPerDay,
  PAYOFF_CYCLE_CHOICES, type PlanKind, type PlanOption,
} from "@/lib/fundPlan";
import { cycleLength } from "@/lib/budgetCycle";
import { daysUntilSalary, surplusPullSource } from "@/lib/financeOverview";
import { Tent } from "lucide-react";

// ===================== المصروف الكبير: طرقٌ بعواقبها، لا أرقامٌ تُحرَّر =====================
// تدرّجت هذه الشاشة على ثلاث مراحل، وكلُّ مرحلةٍ كشفت نقصَ ما قبلها:
//   ١) مظروفٌ للحدث — حلَّ الحساب، وترك على المالك سؤالين عند الكاشير.
//   ٢) خطةٌ مقترحة واحدة + «عدّلها» — أجابت السؤالين، لكنّها جعلته يحرّر **أرقاماً**.
//   ٣) وهذه: **طرقٌ كاملة، ولكلٍّ عاقبتُه برقمٍ واحد** — «بدلك بعدها ٨٤ ر.س/يوم،
//      ويبقى في فوائضك ٣٠٠». فالاختيار يصير بين نتائجَ مفهومة لا بين آليات.
// «موصى به» علامةٌ لا قيد، والبناءُ كلُّه نقيٌّ في `buildPlanOptions` (مختبَر).
const EVENT_ICON = "🎒";
const EVENT_COLOR = "#8a6fb0";

const TITLES: Record<PlanKind, { title: string; gist: string }> = {
  mix: { title: "موزَّعة بذكاء", gist: "الأرخص أولاً: رصيدُ دورتك، فالفوائض، فالباقي سداداً" },
  noTouchBudget: { title: "بلا مساسٍ ببدلك", gist: "من رصيدك والفوائض وحدهما — ولا سداد" },
  financeAll: { title: "احفظ فوائضك", gist: "كلُّه سدادٌ من الراتب — سيولتك كما هي" },
  fromBudget: { title: "كلُّه الآن من بدلي", gist: "بلا مظروفٍ ولا التزام — والثمنُ بقيّةُ دورتك" },
};

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

  const [picked, setPicked] = useState<PlanKind>("mix");
  const [newName, setNewName] = useState("");
  const [cycles, setCycles] = useState<number | null>(null);

  const weight = expenseWeight(amount, dailyBudget?.amount ?? 0);
  if (!dailyBudget || !weight.big) return null;

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const len = cycleLength(salaryDay ?? 27, today());
  const daysLeft = daysUntilSalary(salaryDay ?? 27, today());
  const surplus = surplusPullSource(reserves, transactions, true);
  const options = buildPlanOptions({
    amount,
    cycleBalance: status.balance,
    rate: status.rate,
    surplusBalance: surplus?.balance ?? 0,
    cycleLen: len,
    daysLeft,
  });
  const chosen = options.find((o) => o.kind === picked) ?? options[0];
  // عددُ الدورات: المحسوب ما لم يختر المالك غيره (ويُعرض للطريق المختار وحده).
  const planCycles = cycles ?? chosen.plan.cycles;
  const perCycle =
    chosen.plan.financed > 0 && planCycles > 0 ? suggestPayoffPerCycle(chosen.plan.financed, planCycles) : 0;
  const perDay = perCycle > 0 ? fundingPerDay(perCycle, len) : 0;
  const rateAfter = Math.max(0, Math.round((status.rate - perDay) * 100) / 100);
  const name = (newName.trim() || note.trim() || "حدث").slice(0, 40);
  const chosenFund = splits.length ? reserves.find((f) => f.id === splits[0].fundId) : undefined;

  function apply() {
    if (!chosen.plan.needsEnvelope) {
      onDaily();
      return;
    }
    const id = uid();
    addReserve({ id, name, icon: EVENT_ICON, color: EVENT_COLOR, deposits: [], createdAt: today() });
    if (chosen.plan.fromSurplus > 0 && surplus) {
      transferBetweenReserves(surplus.fundId, id, chosen.plan.fromSurplus, `تمويل «${name}»`);
    }
    if (chosen.plan.financed > 0 && perCycle > 0) {
      setReserveFunding(id, { perCycle, source: "salary", stop: "zero" });
    }
    onFund(id, chosen.plan.envelopePct);
  }

  // سطرُ التركيب: من أين يأتي المال في هذا الطريق.
  function composition(o: PlanOption): string {
    const parts: string[] = [];
    if (o.plan.fromCycle > 0) parts.push(`${formatAmount(Math.round(o.plan.fromCycle))} من دورتك`);
    if (o.plan.fromSurplus > 0) parts.push(`${formatAmount(Math.round(o.plan.fromSurplus))} من الفوائض`);
    if (o.plan.financed > 0) {
      const n = o.kind === chosen.kind ? planCycles : o.plan.cycles;
      parts.push(`${formatAmount(Math.round(o.plan.financed))} على ${formatAmount(n)} ${n === 1 ? "دورة" : "دورات"}`);
    }
    return parts.join(" · ");
  }

  return (
    <div
      className="rounded-xl p-3 space-y-2.5 animate-fade-up"
      style={{ background: "var(--paper2)", border: "1px solid var(--theme-accent-line)" }}
    >
      <div className="flex items-center gap-2">
        <Tent size={15} className="text-finance shrink-0" />
        <span className="text-xs font-bold text-finance">
          مصروفٌ كبير — يعادل {formatAmount(weight.days)} يوماً من بدلك. من وين تدفعه؟
        </span>
      </div>

      <div className="space-y-1.5">
        {options.map((o) => {
          const on = o.kind === picked;
          const isDirect = o.kind === "fromBudget";
          const rate = on ? rateAfter : o.rateAfter;
          return (
            <button
              key={o.kind}
              type="button"
              onClick={() => { setPicked(o.kind); setCycles(null); }}
              aria-pressed={on}
              className="w-full text-right rounded-lg px-2.5 py-2 press transition-colors"
              style={{
                background: "var(--paper)",
                border: `1px solid ${on ? "var(--theme-accent)" : "var(--line)"}`,
                boxShadow: on ? "inset 0 0 0 1px var(--theme-accent-line)" : undefined,
              }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{
                    border: `1px solid ${on ? "var(--theme-accent)" : "var(--line)"}`,
                    background: on ? "var(--theme-accent)" : "transparent",
                  }}
                />
                <span className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>{TITLES[o.kind].title}</span>
                {o.recommended && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-finance/15 text-finance">موصى به</span>
                )}
              </span>

              <span className="block text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--ink52)" }}>
                {composition(o) || TITLES[o.kind].gist}
              </span>

              {/* العاقبة برقمٍ واحد — وهي ما يُختار عليه */}
              <span className="flex flex-wrap gap-1.5 mt-1">
                {isDirect ? (
                  <span
                    className="mdr-chip"
                    style={o.paceAfter < status.rate * 0.35 ? { color: "#c15a34", borderColor: "#c15a3455" } : undefined}
                  >
                    بقيّةُ دورتك <b>{formatAmount(Math.round(o.paceAfter))} ر.س/يوم</b>
                  </span>
                ) : (
                  <span className="mdr-chip">
                    بدلك بعدها <b>{formatAmount(Math.round(rate))} ر.س/يوم</b>
                  </span>
                )}
                <span className="mdr-chip">
                  الفوائض <b>{formatAmount(Math.round(o.surplusAfter))} ر.س</b>
                </span>
                {o.eatsCushion && <span className="mdr-chip">⚠︎ تُمسّ وسادةُ المقاصة</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* تفاصيل الطريق المختار: الاسم وعددُ الدورات — تظهر حين تعني شيئاً فقط */}
      {chosen.plan.needsEnvelope && (
        <div className="space-y-2">
          <div>
            <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
              اسم المظروف الذي يحمل {formatAmount(chosen.plan.envelopePct)}٪ من المبلغ
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={note.trim() || "مثل: رحلة المدينة"}
              className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
              style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
            />
          </div>

          {chosen.plan.financed > 0 && (
            <div>
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
                السداد على كم دورة؟ ({formatAmount(Math.round(perCycle))} ر.س لكل دورة ·{" "}
                {formatAmount(Math.round(perDay))} ر.س/يوم من بدلك)
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
                {cycles !== null && cycles !== chosen.plan.cycles && (
                  <button type="button" onClick={() => setCycles(null)} className="text-[10px] font-semibold text-finance px-2 press">
                    المحسوب ({formatAmount(chosen.plan.cycles)})
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <button type="button" onClick={apply} className="w-full bg-finance text-white text-[11px] font-bold py-2 rounded-lg press">
        {chosen.plan.needsEnvelope ? `اعتمد — ${TITLES[chosen.kind].title}` : "سجّله من بدلي"}
      </button>

      {chosenFund && (
        <p className="text-[10px] text-finance font-semibold">
          ✓ {splits[0]?.pct ?? 100}٪ منه على «{chosenFund.name}» — الباقي من بدلك
        </p>
      )}

      {/* مظروفٌ قائم، أو خارج الميزانيات — طريقان جانبيّان لا يزاحمان الخيارات */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {reserves.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onFund(f.id, 100)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded-full border transition-colors press",
              chosenFund?.id === f.id ? "border-finance bg-finance text-white font-semibold" : "text-gray-500"
            )}
            style={chosenFund?.id === f.id ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
          >
            {f.icon} {f.name}
          </button>
        ))}
        <button
          type="button"
          onClick={onOffBudget}
          aria-pressed={offBudget}
          className="text-[10px] px-2 py-0.5 rounded-full press"
          style={{
            border: `1px solid ${offBudget ? "var(--theme-accent)" : "var(--line)"}`,
            color: offBudget ? "var(--theme-accent)" : "var(--ink52)",
            background: "var(--paper)",
          }}
        >
          لا أتتبّعه — خارج الميزانيات
        </button>
      </div>
    </div>
  );
}
