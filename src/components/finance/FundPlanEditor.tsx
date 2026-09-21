"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { FundFunding, ReserveFund } from "@/lib/types";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { formatAmount, cn, today, reserveBalance } from "@/lib/utils";
import { cycleLength } from "@/lib/budgetCycle";
import {
  suggestPayoffPerCycle, cyclesRemaining, fundingPreview, cyclesForGap,
  PAYOFF_CYCLES, PAYOFF_CYCLE_CHOICES, LONG_PLAN_CYCLES,
} from "@/lib/fundPlan";
import { NumberInput } from "@/components/ui/NumberInput";
import { Repeat, Target, Bandage } from "lucide-react";

// ===================== خطة تمويل المظروف — الواجهة =====================
// السطرُ الذي تقوم عليه البطاقة كلّها: **المظروف يمتدّ على عدة دورات، والمصروف اليومي
// اليومي دورةٌ واحدة.** فالإيجار خطةٌ مستمرّة، والرحلةُ القادمة ادخارٌ حتى
// الهدف، والأثاثُ الذي اشتريته أمس سدادٌ حتى التصفير — ثلاث صورٍ بآليةٍ واحدة.
// وأهمّ ما في الشاشة: **سطر الأثر** — «ينزل مصروفك اليومي من ١٠٠ إلى ٨٣» يُعرض قبل
// الموافقة لا بعدها، فلا يفاجئك نقصٌ لم تأذن به.

type Mode = "cycle" | "target" | "zero";

const MODES: { id: Mode; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "cycle", label: "كل دورة", hint: "التزامٌ يتكرّر — إيجار، اشتراك، مصروف ثابت", icon: <Repeat size={13} /> },
  { id: "target", label: "حتى الهدف", hint: "ادّخر لحدثٍ قادم، ويتوقّف حين يبلغ هدفه", icon: <Target size={13} /> },
  { id: "zero", label: "حتى التصفير", hint: "سدّد ما صُرف قبل أن يُموَّل، ويتوقّف حين يصفّر", icon: <Bandage size={13} /> },
];

// خطُّ الدورات: نقاطٌ تُري نهاية الالتزام بالعين — فما له أفقٌ يُحتمَل، وما لا
// أفق له يُنسى ويسحب من الراتب بلا أن يذكره أحد.
function CyclePips({ remaining }: { remaining: number }) {
  const dots = Math.min(remaining, 6);
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {Array.from({ length: dots }).map((_, i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "var(--theme-accent)", opacity: 1 - i * 0.12 }}
        />
      ))}
      {remaining > 6 && <span className="text-[10px] text-gray-400">+{remaining - 6}</span>}
    </span>
  );
}

export function FundPlanEditor({ fund, balance }: { fund: ReserveFund; balance: number }) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const salaryDay = useAppStore((s) => s.salaryDay);
  const reserves = useAppStore((s) => s.reserves);
  const transactions = useAppStore((s) => s.transactions);
  const setReserveFunding = useAppStore((s) => s.setReserveFunding);

  const deficit = balance < 0 ? -balance : 0;
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<Mode>(fund.funding?.stop ?? (deficit > 0 ? "zero" : "cycle"));
  const [amount, setAmount] = useState(
    fund.funding?.perCycle?.toString() ?? (deficit > 0 ? String(suggestPayoffPerCycle(deficit)) : "")
  );
  const [source, setSource] = useState<FundFunding["source"]>(fund.funding?.source ?? "salary");

  const len = cycleLength(salaryDay ?? 27, today());
  const perCycle = parseFloat(amount) || 0;
  const surplusBalance = (() => {
    const f = reserves.find((x) => x.name === SURPLUS_FUND_NAME);
    return f ? reserveBalance(f, transactions) : 0;
  })();
  const preview = dailyBudget
    ? fundingPreview(dailyBudget.amount, dailyBudget.fundingPerDay, perCycle, len)
    : null;
  const remaining = cyclesRemaining(fund, balance);
  // **الفجوة** التي يقسمها المالك على الدورات: عجزُ السداد، أو ما بقي للهدف.
  // الخطةُ المستمرّة (الإيجار) بلا فجوة — مبلغُها هو المطلوب كل دورة بذاته.
  const gap = mode === "zero" ? deficit : mode === "target" ? Math.max(0, (fund.target ?? 0) - balance) : 0;
  const pickedCycles = gap > 0 ? cyclesForGap(gap, perCycle) : 0;

  function save() {
    if (perCycle <= 0) return;
    setReserveFunding(fund.id, {
      perCycle,
      source,
      stop: mode === "cycle" ? undefined : mode,
    });
    setEditing(false);
  }

  // ————— الحالة المعروضة: خطةٌ قائمة —————
  if (fund.funding && !editing) {
    const f = fund.funding;
    const perDay = dailyBudget ? fundingPreview(dailyBudget.amount, 0, f.perCycle, len).perDay : 0;
    return (
      <div
        className="min-w-0 rounded-xl px-3 py-2 space-y-1"
        style={{
          background: "var(--paper2)",
          border: "1px solid var(--line)",
          borderInlineStartWidth: 2,
          borderInlineStartColor: "var(--theme-accent)",
        }}
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 text-[11px] font-bold text-gray-700 dark:text-gray-200">
            {f.stop === "zero" ? "🩹 خطة سداد" : f.stop === "target" ? "🎯 خطة ادخار" : "🔁 تمويل مستمرّ"}
            {" — "}
            <span className="text-finance">{formatAmount(f.perCycle)} ر.س</span> كل دورة
          </span>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => setEditing(true)} className="text-[10px] text-gray-400 hover:text-finance press">تعديل</button>
            <button onClick={() => setReserveFunding(fund.id, null)} className="text-[10px] text-gray-400 hover:text-red-500 press">أوقف</button>
          </div>
        </div>
        <div className="text-[10px] leading-relaxed" style={{ color: "var(--ink52)" }}>
          {f.source === "surplus" ? (
            <>من {SURPLUS_FUND_NAME} — لا يمسّ مصروفك اليومي</>
          ) : (
            <>من الراتب — ينقص مصروفك اليومي <b className="text-amber-600">{formatAmount(Math.round(perDay))} ر.س/يوم</b></>
          )}
          {remaining !== null && remaining > 0 && (
            <>
              {" · "}
              <CyclePips remaining={remaining} /> بقيت {remaining === 1 ? "دورةٌ واحدة" : `${formatAmount(remaining)} دورات`}
            </>
          )}
          {remaining === 0 && (
            // خطةٌ بلا ما تسدّه: تُقال كما هي بدل «اكتملت» التي تُقرأ كإنجازٍ لم يقع.
            <>
              {" · "}
              {f.stop === "zero" ? "لا عجز الآن — تُرفع عند الراتب القادم" : "بلغ هدفه — تُرفع عند الراتب القادم"}
            </>
          )}
        </div>
      </div>
    );
  }

  // ————— لا خطة: دعوةٌ واحدة، وتُبرز السدادَ حين يكون المظروف سالباً —————
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "w-full rounded-xl border border-dashed px-3 py-2 text-right press transition-colors",
          deficit > 0
            ? "border-amber-400/60 bg-amber-50/60 dark:bg-amber-500/10"
            : "border-finance/35 hover:bg-finance/5"
        )}
      >
        <span className="block text-[11px] font-bold text-finance">
          {deficit > 0 ? "🩹 سدّده على دورات" : "＋ خطة تمويل كل دورة"}
        </span>
        <span className="block text-[10px] text-gray-400 leading-relaxed">
          {deficit > 0
            ? `صُرف ${formatAmount(Math.round(deficit))} ر.س قبل أن يُموَّل — وزّعها على ${PAYOFF_CYCLES} دورات بـ${formatAmount(Math.round(suggestPayoffPerCycle(deficit)))} ر.س لكل دورة`
            : "مبلغٌ ثابت ينتقل إليه مع كل راتب — للإيجار، أو ادّخاراً لحدثٍ قادم"}
        </span>
      </button>
    );
  }

  // ————— المحرّر —————
  const modes = MODES.filter((m) => (m.id === "target" ? !!fund.target : m.id === "zero" ? deficit > 0 : true));
  const active = MODES.find((m) => m.id === mode);
  return (
    <div
      className="min-w-0 rounded-xl p-2.5 space-y-2 animate-fade-up"
      style={{ background: "var(--paper2)", border: "1px solid var(--theme-accent-line)" }}
    >
      <div className="flex flex-wrap gap-1">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            aria-pressed={mode === m.id}
            className={cn(
              "flex-1 flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-all press",
              mode === m.id ? "bg-white dark:bg-white/15 text-finance shadow-sm" : "text-gray-400"
            )}
          >
            {m.icon} {m.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 leading-relaxed">{active?.hint}</p>

      {/* **العدد بيدك**: اختر على كم دورة تُقسَم الفجوة، والمبلغ يُشتقّ منها —
          أو اكتب المبلغ فيُقال لك كم دورة يعني. الاتجاهان مفتوحان. */}
      {gap > 0 && (
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[10px] font-semibold" style={{ color: "var(--ink52)" }}>
              على كم دورة تقسّم {formatAmount(Math.round(gap))} ر.س؟
            </span>
            {pickedCycles > 0 && (
              <span className="text-[10px]" style={{ color: "var(--ink52)" }}>
                = {pickedCycles === 1 ? "دورةٌ واحدة" : `${formatAmount(pickedCycles)} دورات`}
              </span>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {PAYOFF_CYCLE_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAmount(String(suggestPayoffPerCycle(gap, n)))}
                aria-pressed={pickedCycles === n}
                className={cn(
                  "text-[11px] font-bold rounded-lg px-2.5 py-1 border transition-colors press",
                  pickedCycles === n ? "bg-finance text-white border-finance" : "text-gray-500"
                )}
                style={pickedCycles === n ? undefined : { borderColor: "var(--line)", background: "var(--paper)" }}
              >
                {formatAmount(n)}
              </button>
            ))}
          </div>
          {pickedCycles > LONG_PLAN_CYCLES && (
            <p className="text-[10px]" style={{ color: "var(--ink52)" }}>
              ⓘ خطةٌ طويلة — ستسحب من مصروفك اليومي طوال {formatAmount(pickedCycles)} دورات. مقبولٌ إن كان مقصوداً.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <NumberInput
          value={amount}
          onChange={setAmount}
          placeholder="المبلغ لكل دورة"
          inputMode="decimal"
          className="basis-full min-w-0 text-sm border border-gray-200 dark:border-white/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40 sm:basis-auto sm:flex-1"
          aria-label="المبلغ لكل دورة"
        />
        {gap > 0 && (
          <button
            onClick={() => setAmount(String(suggestPayoffPerCycle(gap)))}
            className="text-[10px] font-semibold text-finance bg-finance/10 rounded-lg px-2 press shrink-0"
            title={`المقترح: ${PAYOFF_CYCLES} دورات`}
          >
            المقترح
          </button>
        )}
      </div>

      <div className="flex flex-wrap bg-white/70 dark:bg-white/5 rounded-lg p-1 gap-1">
        {([["salary", "من الراتب"], ["surplus", `من ${SURPLUS_FUND_NAME}`]] as [FundFunding["source"], string][]).map(
          ([id, label]) => (
            <button
              key={id}
              onClick={() => setSource(id)}
              aria-pressed={source === id}
              className={cn(
                "flex-1 text-[11px] font-bold py-1.5 rounded-md transition-all press",
                source === id ? "bg-finance text-white" : "text-gray-400"
              )}
            >
              {label}
            </button>
          )
        )}
      </div>

      {/* سطرُ الأثر — يُعرض قبل الموافقة لا بعدها */}
      {perCycle > 0 && (
        <p
          className="text-[10px] leading-relaxed rounded-lg px-2.5 py-1.5"
          style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink52)" }}
        >
          {source === "salary" ? (
            preview ? (
              <>
                ↳ مصروفك اليومي ينزل من <b>{formatAmount(Math.round(preview.before))}</b> إلى{" "}
                <b className="text-amber-600">{formatAmount(Math.round(preview.after))} ر.س/يوم</b> —{" "}
                {formatAmount(Math.round(preview.perDay))} ر.س يومياً لهذا المظروف
              </>
            ) : (
              <>↳ لا ميزانية يومية مضبوطة — سيُموَّل من الراتب بلا أثرٍ ظاهر على بدلٍ يومي</>
            )
          ) : (
            <>
              ↳ لا يمسّ مصروفك اليومي — يُخصم من {SURPLUS_FUND_NAME} (المتوفّر الآن{" "}
              {formatAmount(Math.round(surplusBalance))} ر.س)
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={save}
          disabled={perCycle <= 0}
          className="flex-1 bg-finance text-white text-[11px] font-bold py-1.5 rounded-lg press disabled:opacity-40"
        >
          فعّل الخطة
        </button>
        <button onClick={() => setEditing(false)} className="text-[11px] text-gray-400 px-3 press">إلغاء</button>
      </div>
    </div>
  );
}
