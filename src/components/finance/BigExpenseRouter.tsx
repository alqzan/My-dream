"use client";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { ReserveSplit } from "@/lib/types";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today, reserveBalance } from "@/lib/utils";
import { expenseWeight } from "@/lib/budgetFlow";
import {
  buildPlanOptions, suggestPayoffPerCycle, fundingPerDay,
  PAYOFF_CYCLE_CHOICES, type PlanKind,
} from "@/lib/fundPlan";
import { cycleLength } from "@/lib/budgetCycle";
import { daysUntilSalary, surplusPullSource } from "@/lib/financeOverview";
import { NumberInput } from "@/components/ui/NumberInput";
import { Tent } from "lucide-react";

// **لماذا نيّةٌ مؤجّلة لا تنفيذٌ فوريّ؟** أوّلُ استعمالٍ حقيقيّ كشف الفخّ: ضغط
// المالك «اعتمد» فأُنشئ المظروفُ وخطةُ سداده في تلك اللحظة، ثمّ أغلق الورقة بلا
// ضغط «حفظ» — فبقي مظروفٌ فارغ (٠ ر.س) وخطةُ سدادٍ «اكتملت» لأنّها لم تجد عجزاً
// تسدّه، والمصروفُ لم يُربط بشيء. الكتابةُ في المتجر يجب أن تقع **مع حفظ
// المعاملة أو لا تقع**: فالبطاقةُ تبني نيّةً، و`applyExpenseIntent` ينفّذها في
// `handleSave` وحده. ومعرّفُ المظروف الجديد يُولَد الآن ليحمله انقسامُ المعاملة،
// ويُنشأ به المظروفُ نفسُه عند الحفظ — فلا يتفرّق المعرّفان.
export interface ExpenseIntent {
  fundId: string;
  pct: number;
  newFund?: { name: string; target?: number };
  fromSurplus?: { fromId: string; amount: number };
  funding?: { perCycle: number };
}

export function applyExpenseIntent(intent: ExpenseIntent) {
  const s = useAppStore.getState();
  const name = intent.newFund?.name ?? s.reserves.find((f) => f.id === intent.fundId)?.name ?? "مظروف";
  if (intent.newFund) {
    s.addReserve({
      id: intent.fundId,
      name: intent.newFund.name,
      icon: EVENT_ICON,
      color: EVENT_COLOR,
      target: intent.newFund.target,
      deposits: [],
      createdAt: today(),
    });
  }
  if (intent.fromSurplus && intent.fromSurplus.amount > 0) {
    s.transferBetweenReserves(intent.fromSurplus.fromId, intent.fundId, intent.fromSurplus.amount, `تمويل «${name}»`);
  }
  if (intent.funding && intent.funding.perCycle > 0) {
    s.setReserveFunding(intent.fundId, { perCycle: intent.funding.perCycle, source: "salary", stop: "zero" });
  }
}

// ===================== المصروف الكبير: الوجهةُ أوّلاً ثمّ التمويل =====================
// أوّلُ تجربةٍ حقيقية كشفت ترتيباً مقلوباً: فاتورةُ فندقٍ بـ٢٦٠٠ في رحلة المدينة،
// والشاشةُ تسأل «من وين تدفعه؟» قبل أن تسأل «هذا المصروف **لماذا**؟». والرحلةُ
// أكبرُ من فاتورة: فندقٌ وتذاكرُ وأكلٌ وهدايا — وعاؤها واحدٌ يجمعها، لا مظروفٌ
// لكلّ فاتورة باسم التاجر («ALMOSAFER TRAVEL CO» اسمُ مظروفٍ لا يقوله أحد).
//
// فصارت الشاشةُ خطوتين بترتيبهما الطبيعيّ:
//   **١) على أيّ مظروفٍ يُحمَّل؟** — مظروفٌ قائم (فتنضمّ الفاتورةُ لأخواتها)،
//      أو جديدٌ باسمٍ **تكتبه أنت**، أو من مصروفك اليومي مباشرةً بلا مظروف.
//   **٢) ومن أين نموّل ما ينقص؟** — ولا تُعرض إلّا إن كان ثمّة نقصٌ فعلاً:
//      مظروفٌ رصيدُه يكفي لا يحتاج تمويلاً ولا سؤالاً.
// وما لا معنى له يُحذف لا يُعرض صفراً: بلا فوائضَ لا تُعرض خياراتُها ولا شاراتها.
const EVENT_ICON = "🎒";
const EVENT_COLOR = "#8a6fb0";

const TITLES: Record<PlanKind, string> = {
  mix: "موزَّعة بذكاء",
  noTouchBudget: "من رصيدك والفوائض",
  financeAll: "كلُّه سداداً على دورات",
  fromBudget: "كلُّه الآن من مصروفي اليومي",
};

interface Props {
  amount: number;
  note: string;
  splits: ReserveSplit[];
  offBudget: boolean;
  onDaily: () => void;
  onPlan: (intent: ExpenseIntent) => void;
  onOffBudget: () => void;
  /** النيّة المعتمَدة (إن وُجدت) — لتأكيدٍ مرئيّ أنّ التنفيذ ينتظر الحفظ. */
  intent: ExpenseIntent | null;
}

export function BigExpenseRouter({ amount, note, splits, offBudget, onDaily, onPlan, onOffBudget, intent }: Props) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const salaryDay = useAppStore((s) => s.salaryDay);

  // مظاريفُ الأحداث (كلُّها عدا «الفوائض» — ذاك وعاءُ تمويلٍ لا وجهةُ صرف).
  const targets = useMemo(
    () => reserves.filter((f) => f.name !== SURPLUS_FUND_NAME).map((f) => ({ fund: f, balance: reserveBalance(f, transactions) })),
    [reserves, transactions]
  );
  // اقتراحُ الوجهة: مظروفٌ يذكر اسمُه في الملاحظة (أو تذكرُه هي) — كأن تكتب
  // «فندق رحلة المدينة» وعندك مظروف «رحلة المدينة».
  const guessed = useMemo(() => {
    const n = note.trim();
    if (!n) return null;
    return targets.find((t) => n.includes(t.fund.name) || t.fund.name.includes(n))?.fund.id ?? null;
  }, [note, targets]);

  const [dest, setDest] = useState<string>("");
  // معرّفُ المظروف الجديد يُولَد مرّةً ويثبت، فيحمله الانقسامُ ويُنشأ به المظروف.
  const [newFundId] = useState(() => uid());
  const [newName, setNewName] = useState("");
  const [tripBudget, setTripBudget] = useState("");
  const [picked, setPicked] = useState<PlanKind>("mix");
  const [cycles, setCycles] = useState<number | null>(null);

  const weight = expenseWeight(amount, dailyBudget?.amount ?? 0);
  if (!dailyBudget || !weight.big) return null;

  // الوجهة الفعلية: اختيارُ المالك، وإلّا المظروف المخمَّن، وإلّا مظروفٌ جديد.
  const destination = dest || guessed || "new";
  const chosen = targets.find((t) => t.fund.id === destination);

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const len = cycleLength(salaryDay ?? 27, today());
  const daysLeft = daysUntilSalary(salaryDay ?? 27, today());
  const surplus = surplusPullSource(reserves, transactions, true);
  const hasSurplus = (surplus?.balance ?? 0) > 0;

  // ما ينقص المظروفَ لتغطية هذه الفاتورة (رصيدٌ كافٍ = لا تمويل ولا سؤال).
  const covered = chosen ? Math.max(0, Math.min(amount, chosen.balance)) : 0;
  const needed = Math.round((amount - covered) * 100) / 100;

  const options = buildPlanOptions({
    amount: needed,
    cycleBalance: status.balance,
    rate: status.rate,
    surplusBalance: surplus?.balance ?? 0,
    cycleLen: len,
    daysLeft,
  }).filter((o) => hasSurplus || o.kind !== "noTouchBudget");
  const option = options.find((o) => o.kind === picked) ?? options[0];
  const planCycles = cycles ?? option.plan.cycles;
  const perCycle =
    option.plan.financed > 0 && planCycles > 0 ? suggestPayoffPerCycle(option.plan.financed, planCycles) : 0;
  const perDay = perCycle > 0 ? fundingPerDay(perCycle, len) : 0;
  const rateAfter = Math.max(0, Math.round((status.rate - perDay) * 100) / 100);

  const name = newName.trim().slice(0, 40);
  const isNew = destination === "new";
  const toDaily = destination === "daily";
  const canApply = toDaily || !isNew || !!name;

  function apply() {
    if (toDaily) return onDaily();
    // حصّةُ المظروف: ما لم يُدفع من رصيد الدورة مباشرةً.
    const pct = amount > 0 ? Math.max(1, Math.min(100, Math.round(((amount - option.plan.fromCycle) / amount) * 100))) : 100;
    onPlan({
      fundId: isNew ? newFundId : chosen!.fund.id,
      pct,
      newFund: isNew
        ? { name, target: parseFloat(tripBudget) > 0 ? parseFloat(tripBudget) : undefined }
        : undefined,
      fromSurplus:
        needed > 0 && option.plan.fromSurplus > 0 && surplus
          ? { fromId: surplus.fundId, amount: option.plan.fromSurplus }
          : undefined,
      funding: needed > 0 && option.plan.financed > 0 && perCycle > 0 ? { perCycle } : undefined,
    });
  }

  const cardStyle = (on: boolean) => ({
    background: "var(--paper)",
    border: `1px solid ${on ? "var(--theme-accent)" : "var(--line)"}`,
  });

  return (
    <div
      className="rounded-xl p-3 space-y-3 animate-fade-up"
      style={{ background: "var(--paper2)", border: "1px solid var(--theme-accent-line)" }}
    >
      <div className="flex items-center gap-2">
        <Tent size={15} className="text-finance shrink-0" />
        <span className="text-xs font-bold text-finance">
          مصروفٌ كبير — يعادل {formatAmount(weight.days)} يوماً من مصروفك اليومي
        </span>
      </div>

      {/* ————— ١) الوجهة ————— */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>
          ١· على أيّ مظروفٍ يُحمَّل؟
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {targets.map((t) => (
            <button
              key={t.fund.id}
              type="button"
              onClick={() => { setDest(t.fund.id); setCycles(null); }}
              aria-pressed={destination === t.fund.id}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full border press transition-colors",
                destination === t.fund.id ? "bg-finance text-white border-finance font-semibold" : "text-gray-500"
              )}
              style={destination === t.fund.id ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
            >
              {t.fund.icon} {t.fund.name}
              <span className="opacity-70"> · {formatAmount(Math.round(t.balance))}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setDest("new"); setCycles(null); }}
            aria-pressed={isNew}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border border-dashed press font-semibold",
              isNew ? "bg-finance text-white border-finance" : "text-finance"
            )}
            style={isNew ? undefined : { borderColor: "var(--theme-accent-line)", background: "var(--paper)" }}
          >
            ＋ مظروف جديد
          </button>
          <button
            type="button"
            onClick={() => { setDest("daily"); setCycles(null); }}
            aria-pressed={toDaily}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border press",
              toDaily ? "bg-finance text-white border-finance font-semibold" : "text-gray-500"
            )}
            style={toDaily ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
          >
            بلا مظروف — من مصروفي اليومي
          </button>
        </div>

        {isNew && (
          <div className="space-y-1.5 pt-0.5">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="اسم المناسبة — مثل: رحلة المدينة"
              className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
              style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <NumberInput
                value={tripBudget}
                onChange={setTripBudget}
                placeholder="ميزانيتها كاملةً (اختياري)"
                inputMode="decimal"
                className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                aria-label="ميزانية المناسبة كاملة"
              />
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
              مظروفٌ واحد يجمع كلّ مصاريف المناسبة — الفندق والتذاكر والأكل. سجّل الباقي لاحقاً
              واختر المظروف نفسه، فترى «صُرف كذا من كذا».
            </p>
          </div>
        )}

        {chosen && (
          <p className="text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
            {covered >= amount ? (
              <>
                ✓ رصيدُ «{chosen.fund.name}» يغطّيها — يبقى فيه{" "}
                <b className="text-finance">{formatAmount(Math.round(chosen.balance - amount))} ر.س</b> ولا يمسّ مصروفك اليومي.
              </>
            ) : (
              <>
                يحمل «{chosen.fund.name}» الفاتورة كاملةً؛ رصيدُه يغطّي{" "}
                {formatAmount(Math.round(covered))} ر.س، وينقصه{" "}
                <b className="text-amber-600">{formatAmount(Math.round(needed))} ر.س</b>.
              </>
            )}
          </p>
        )}
      </div>

      {/* ————— ٢) التمويل — إن كان ثمّة نقصٌ فعلاً ————— */}
      {!toDaily && needed > 0 && (
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>
            ٢· ومن وين نموّل {formatAmount(Math.round(needed))} ر.س؟
          </div>
          {options.map((o) => {
            const on = o.kind === picked;
            const direct = o.kind === "fromBudget";
            return (
              <button
                key={o.kind}
                type="button"
                onClick={() => { setPicked(o.kind); setCycles(null); }}
                aria-pressed={on}
                className="w-full text-right rounded-lg px-2.5 py-2 press transition-colors"
                style={cardStyle(on)}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{
                      border: `1px solid ${on ? "var(--theme-accent)" : "var(--line)"}`,
                      background: on ? "var(--theme-accent)" : "transparent",
                    }}
                  />
                  <span className="text-[11px] font-bold" style={{ color: "var(--ink)" }}>
                    {direct ? "كلُّه الآن من رصيد دورتك" : TITLES[o.kind]}
                  </span>
                  {o.recommended && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-finance/15 text-finance">موصى به</span>
                  )}
                </span>
                <span className="block text-[10px] mt-0.5 leading-relaxed" style={{ color: "var(--ink52)" }}>
                  {[
                    o.plan.fromCycle > 0 ? `${formatAmount(Math.round(o.plan.fromCycle))} الآن من رصيد دورتك` : "",
                    o.plan.fromSurplus > 0 ? `${formatAmount(Math.round(o.plan.fromSurplus))} من ${SURPLUS_FUND_NAME}` : "",
                    o.plan.financed > 0
                      ? `${formatAmount(Math.round(o.plan.financed))} سداداً على ${formatAmount(
                          on ? planCycles : o.plan.cycles
                        )} ${(on ? planCycles : o.plan.cycles) === 1 ? "دورة" : "دورات"}`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" + ")}
                </span>
                <span className="flex flex-wrap gap-1.5 mt-1">
                  {direct ? (
                    <span
                      className="mdr-chip"
                      style={o.paceAfter < status.rate * 0.35 ? { color: "#c15a34", borderColor: "#c15a3455" } : undefined}
                    >
                      بقيّةُ دورتك <b>{formatAmount(Math.round(o.paceAfter))} ر.س/يوم</b>
                    </span>
                  ) : (
                    <span className="mdr-chip">
                      مصروفك بعدها <b>{formatAmount(Math.round(on ? rateAfter : o.rateAfter))} ر.س/يوم</b>
                    </span>
                  )}
                  {hasSurplus && (
                    <span className="mdr-chip">
                      الفوائض <b>{formatAmount(Math.round(o.surplusAfter))} ر.س</b>
                    </span>
                  )}
                  {o.eatsCushion && <span className="mdr-chip">⚠︎ تُمسّ وسادةُ المقاصة</span>}
                </span>
              </button>
            );
          })}

          {option.plan.financed > 0 && (
            <div className="pt-0.5">
              <label className="block text-[10px] font-semibold mb-1" style={{ color: "var(--ink52)" }}>
                السداد على كم دورة؟ ({formatAmount(Math.round(perCycle))} ر.س لكل دورة ·{" "}
                {formatAmount(Math.round(perDay))} ر.س/يوم من مصروفك اليومي)
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
              </div>
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={!canApply}
        className="w-full bg-finance text-white text-[11px] font-bold py-2 rounded-lg press disabled:opacity-40"
      >
        {toDaily
          ? "سجّله من مصروفي اليومي"
          : isNew
          ? name
            ? `أنشئ «${name}» وحمّلها عليه`
            : "اكتب اسم المظروف أولاً"
          : `حمّلها على «${chosen?.fund.name ?? ""}»`}
      </button>

      <button
        type="button"
        onClick={onOffBudget}
        aria-pressed={offBudget}
        className="w-full text-[10px] px-2 py-1 rounded-full press"
        style={{
          border: `1px solid ${offBudget ? "var(--theme-accent)" : "var(--line)"}`,
          color: offBudget ? "var(--theme-accent)" : "var(--ink52)",
          background: "var(--paper)",
        }}
      >
        لا أتتبّعه — خارج الميزانيات
      </button>
      {intent && (
        <p className="text-[10px] font-semibold leading-relaxed text-finance">
          ✓ {formatAmount(intent.pct)}٪ منه على «{intent.newFund?.name ?? reserves.find((f) => f.id === intent.fundId)?.name}»
          {intent.newFund && " (مظروفٌ جديد)"} — <b>اضغط «حفظ» بالأسفل ليُنفَّذ</b>.
        </p>
      )}
    </div>
  );
}
