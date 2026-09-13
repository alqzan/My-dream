"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount, formatDate, cn, uid, today } from "@/lib/utils";
import { cycleLength } from "@/lib/budgetCycle";
import { savingPlan } from "@/lib/fundPlan";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { NumberInput } from "@/components/ui/NumberInput";
import { Target } from "lucide-react";

// ===================== جهّز لشيءٍ قادم =====================
// الاتجاهُ الأماميّ لخطة المظروف: المظاريف كلُّها كانت تُفتح **بعد** أن يقع
// الحدث (تسدّد ما صُرف)، وهذا يفتحها **قبله** — فيأتي يومُ الرحلة أو الجهاز
// والمالُ جاهزٌ ولا تقع صدمةٌ أصلاً. وهو أنظفُ صورةٍ للنظام كلّه.
//
// والسؤالُ الذي يقوده واحد: **متى تحتاجه؟** — فعددُ الدورات يُشتقّ من التاريخ
// (`cyclesUntil`) لا يُخمَّن، والقسطُ منه، والأثرُ اليومي يُعرض قبل الموافقة.
// ومواعيدُ «الأحداث المهمّة» تُعرض اختصاراً: هدفُك غالباً حدثٌ سجّلتَه أصلاً.
const ICONS = ["🎯", "✈️", "🕋", "🚗", "💍", "🎓", "🏠", "📱", "🛋️", "🎁"];
const COLOR = "#1f7a6c";

export function GoalWizard({ onDone }: { onDone: () => void }) {
  const salaryDay = useAppStore((s) => s.salaryDay);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const countdownEvents = useAppStore((s) => s.countdownEvents);
  const addReserve = useAppStore((s) => s.addReserve);
  const setReserveFunding = useAppStore((s) => s.setReserveFunding);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICONS[0]);
  const [target, setTarget] = useState("");
  const [date, setDate] = useState("");
  const [source, setSource] = useState<"salary" | "surplus">("salary");

  const todayStr = today();
  const len = cycleLength(salaryDay ?? 27, todayStr);
  const plan = savingPlan({
    target: parseFloat(target) || 0,
    dateStr: date,
    salaryDay: salaryDay ?? 27,
    todayStr,
    cycleLen: len,
  });
  const ready = !!name.trim() && (parseFloat(target) || 0) > 0 && plan.cycles > 0;
  // مواعيدُ قادمةٌ سجّلها المالك في «الأحداث المهمّة» — اختصارٌ لحقل التاريخ.
  const upcoming = (countdownEvents ?? []).filter((e) => e.date > todayStr).slice(0, 4);

  function create() {
    if (!ready) return;
    const id = uid();
    addReserve({
      id,
      name: name.trim().slice(0, 40),
      icon,
      color: COLOR,
      target: parseFloat(target),
      deposits: [],
      createdAt: todayStr,
    });
    setReserveFunding(id, { perCycle: plan.perCycle, source, stop: "target" });
    onDone();
  }

  return (
    <div
      className="rounded-xl p-3 space-y-2.5 animate-fade-up"
      style={{ background: "var(--paper2)", border: "1px solid var(--theme-accent-line)" }}
    >
      <div className="flex items-center gap-2">
        <Target size={15} className="text-finance shrink-0" />
        <span className="text-xs font-bold text-finance">جهّز لشيءٍ قادم</span>
        <span className="text-[10px]" style={{ color: "var(--ink52)" }}>
          يجي موعده والمال جاهز
        </span>
      </div>

      <div className="flex gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="لأيّ شيء؟ — عمرة، سفرة، جهاز…"
          className="flex-1 min-w-0 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        />
        <NumberInput
          value={target}
          onChange={setTarget}
          placeholder="المبلغ"
          inputMode="decimal"
          className="w-24 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
          aria-label="المبلغ المستهدف"
        />
      </div>

      <div className="flex gap-1 flex-wrap">
        {ICONS.map((ic) => (
          <button
            key={ic}
            type="button"
            onClick={() => setIcon(ic)}
            aria-pressed={icon === ic}
            className={cn("text-sm rounded-lg px-1.5 py-0.5 press border transition-colors")}
            style={{
              borderColor: icon === ic ? "var(--theme-accent)" : "var(--line)",
              background: icon === ic ? "var(--theme-accent-soft)" : "var(--paper)",
            }}
          >
            {ic}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] font-semibold" style={{ color: "var(--ink52)" }}>
          متى تحتاجه؟
        </label>
        <input
          type="date"
          value={date}
          min={todayStr}
          onChange={(e) => setDate(e.target.value)}
          className="w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
          style={{ background: "var(--paper)", border: "1px solid var(--line)" }}
        />
        {upcoming.length > 0 && (
          <div className="flex gap-1 flex-wrap pt-0.5">
            {upcoming.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { setDate(e.date); if (!name.trim()) setName(e.title); }}
                className="text-[10px] px-2 py-0.5 rounded-full press"
                style={{ border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink52)" }}
              >
                {e.emoji ?? "📌"} {e.title} — {formatDate(e.date)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex rounded-lg p-1 gap-1" style={{ background: "var(--paper)", border: "1px solid var(--line)" }}>
        {([["salary", "من الراتب"], ["surplus", `من ${SURPLUS_FUND_NAME}`]] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            aria-pressed={source === id}
            className={cn(
              "flex-1 text-[11px] font-bold py-1.5 rounded-md transition-all press",
              source === id ? "bg-finance text-white" : "text-gray-400"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* المعاينة: الجواب كلُّه في سطرين — كم كل دورة، وكم يكلّفك يومياً */}
      {(parseFloat(target) || 0) > 0 && date && (
        <div
          className="rounded-lg px-2.5 py-1.5 text-[10px] leading-relaxed"
          style={{ background: "var(--paper)", border: "1px solid var(--line)", color: "var(--ink52)" }}
        >
          {plan.cycles > 0 ? (
            <>
              ↳ <b className="text-finance">{formatAmount(plan.cycles)}</b>{" "}
              {plan.cycles === 1 ? "راتبٌ واحد" : "رواتب"} حتى {formatDate(date)} —{" "}
              <b className="text-finance">{formatAmount(Math.round(plan.perCycle))} ر.س</b> لكل دورة.
              <br />
              {source === "salary" ? (
                dailyBudget ? (
                  <>
                    ينزل مصروفك اليومي{" "}
                    <b className="text-amber-600">{formatAmount(Math.round(plan.perDay))} ر.س/يوم</b> حتى يكتمل الهدف،
                    ثمّ يرجع كما كان وحده.
                  </>
                ) : (
                  <>يُقتطع من الراتب مع كل دورة.</>
                )
              ) : (
                <>يُؤخذ من {SURPLUS_FUND_NAME} — لا يمسّ مصروفك اليومي.</>
              )}
            </>
          ) : (
            <>⚠︎ لا ينزل راتبٌ قبل هذا الموعد — قرّبه أو موّله الآن يدوياً من المظروف بعد إنشائه.</>
          )}
        </div>
      )}

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={create}
          disabled={!ready}
          className="flex-1 bg-finance text-white text-[11px] font-bold py-2 rounded-lg press disabled:opacity-40"
        >
          ابدأ التجهيز
        </button>
        <button type="button" onClick={onDone} className="text-[11px] px-3 press" style={{ color: "var(--ink52)" }}>
          إلغاء
        </button>
      </div>
    </div>
  );
}
