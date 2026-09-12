"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import type { ReserveSplit } from "@/lib/types";
import { computeDailyBudgetStatus, formatAmount, cn, uid, today } from "@/lib/utils";
import { cyclePace, expenseWeight } from "@/lib/budgetFlow";
import { daysUntilSalary, surplusPullSource } from "@/lib/financeOverview";
import { Tent } from "lucide-react";

// ===================== «رحلة المدينة»: أين تسكن الصدمة الكبيرة؟ =====================
// كان أمام المصروف الكبير طريقان كلاهما يكذب: أن يُسجَّل عادياً فيبتلع الميزانية
// اليومية أسبوعين ويُفقدها معنى قياس الانضباط، أو يُوسم «خارج الميزانيات» فيختفي
// من كلّ وعاءٍ رغم أنّ المال خرج فعلاً. هذه البطاقة تفتح الطريق الثالث لحظةَ
// التسجيل: **مظروفٌ للحدث يُموَّل من الفوائض**، فالرحلةُ تُحاسَب على نفسها.
//
// لا تظهر إلّا حين يستحقّ المصروفُ قراراً — `expenseWeight(...).big`، أي ما عادل
// ثلاث يوميّاتٍ فأكثر (`budgetFlow.ts`). وما دون ذلك لا يُقاطَع فيه المالك.
// وإن نقص رصيدُ الفوائض عن المبلغ، مُوِّل المظروف بما تيسّر وبقي الباقي عجزاً
// **في المظروف** يُغطّى من الراتب القادم — لا عجزاً في بدلك اليومي.
const EVENT_ICON = "🎒";
const EVENT_COLOR = "#8a6fb0";

interface Props {
  amount: number;
  note: string;
  splits: ReserveSplit[];
  offBudget: boolean;
  onDaily: () => void;
  onFund: (fundId: string) => void;
  onOffBudget: () => void;
}

export function BigExpenseRouter({ amount, note, splits, offBudget, onDaily, onFund, onOffBudget }: Props) {
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const salaryDay = useAppStore((s) => s.salaryDay);
  const addReserve = useAppStore((s) => s.addReserve);
  const transferBetweenReserves = useAppStore((s) => s.transferBetweenReserves);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const weight = expenseWeight(amount, dailyBudget?.amount ?? 0);
  // بلا ميزانيةٍ يومية لا مقياس لـ«كبير» أصلاً، فلا قرار يُعرض.
  if (!dailyBudget || !weight.big) return null;

  const status = computeDailyBudgetStatus(dailyBudget, transactions);
  const daysLeft = daysUntilSalary(salaryDay ?? 27, today());
  const after = cyclePace(status.balance - amount, dailyBudget.amount, daysLeft);
  const surplus = surplusPullSource(reserves, transactions, true);
  const fundedBy = surplus ? Math.min(amount, surplus.balance) : 0;
  const shortfall = Math.max(0, Math.round((amount - fundedBy) * 100) / 100);

  const route: "daily" | "fund" | "off" = offBudget ? "off" : splits.length ? "fund" : "daily";
  const chosenFund = splits.length ? reserves.find((f) => f.id === splits[0].fundId) : undefined;

  function createEnvelope() {
    const name = (newName.trim() || note.trim() || "حدث").slice(0, 40);
    const id = uid();
    addReserve({ id, name, icon: EVENT_ICON, color: EVENT_COLOR, deposits: [], createdAt: today() });
    // تمويلٌ فوريّ من الفوائض بما تسمح به (الدالّة تقصّه على الرصيد المتاح).
    if (surplus) transferBetweenReserves(surplus.fundId, id, amount, `تمويل «${name}»`);
    onFund(id);
    setNaming(false);
    setNewName("");
  }

  const tab = (active: boolean) =>
    cn(
      "flex-1 text-[11px] font-bold py-2 rounded-lg transition-all press",
      active ? "bg-white dark:bg-white/15 text-finance shadow-sm" : "text-gray-400"
    );

  return (
    <div className="rounded-xl border border-finance/25 bg-finance/5 p-3 space-y-2 animate-fade-up">
      <div className="flex items-center gap-2">
        <Tent size={15} className="text-finance shrink-0" />
        <span className="text-xs font-bold text-finance">
          مصروفٌ كبير — يعادل {weight.days} يوماً من بدلك
        </span>
      </div>
      <p className="text-[10px] text-gray-500 leading-relaxed">
        لو خصمته من البدل اليومي نزلت وتيرتك لبقيّة الدورة إلى{" "}
        <b className={after.kind === "beyond" ? "text-red-500" : "text-amber-600"}>
          {formatAmount(Math.round(after.rate))} ر.س/يوم
        </b>{" "}
        ({daysLeft} يوم على الراتب). أو اجعله حدثاً بمظروفٍ يُحاسَب على نفسه.
      </p>

      <div className="flex bg-gray-100 dark:bg-white/5 rounded-xl p-1 gap-1">
        <button type="button" onClick={onDaily} aria-pressed={route === "daily"} className={tab(route === "daily")}>
          من البدل اليومي
        </button>
        <button type="button" onClick={onOffBudget} aria-pressed={route === "off"} className={tab(route === "off")}>
          خارج الميزانيات
        </button>
      </div>

      {/* الطريق الثالث: مظروفٌ يحمل الحدث — قائمٌ أو جديدٌ يُموَّل من الفوائض */}
      <div className="space-y-1.5">
        <div className="text-[10px] font-semibold text-gray-500">أو من مظروف (الأنظف لحدثٍ كهذا):</div>
        <div className="flex gap-1.5 flex-wrap">
          {reserves.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFund(f.id)}
              className={cn(
                "text-[11px] px-2.5 py-1 rounded-full border transition-colors press",
                chosenFund?.id === f.id
                  ? "border-finance bg-finance text-white font-semibold"
                  : "border-gray-200 dark:border-white/15 text-gray-500 bg-white dark:bg-white/5"
              )}
            >
              {f.icon} {f.name}
            </button>
          ))}
          {!naming && (
            <button
              type="button"
              onClick={() => { setNaming(true); setNewName(note.trim()); }}
              className="text-[11px] px-2.5 py-1 rounded-full border border-dashed border-finance/50 text-finance bg-white dark:bg-white/5 font-semibold press"
            >
              + مظروف حدث جديد
            </button>
          )}
        </div>

        {naming && (
          <div className="space-y-1.5 animate-fade-up">
            <div className="flex gap-1.5">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="اسم الحدث — مثل: رحلة المدينة"
                className="flex-1 min-w-0 text-xs border border-gray-200 dark:border-white/15 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-finance/40"
                onKeyDown={(e) => e.key === "Enter" && createEnvelope()}
                autoFocus
              />
              <button
                type="button"
                onClick={createEnvelope}
                className="text-[11px] font-bold text-white bg-finance rounded-lg px-3 press shrink-0"
              >
                أنشئ ومَوِّل
              </button>
              <button
                type="button"
                onClick={() => { setNaming(false); setNewName(""); }}
                className="text-[11px] text-gray-400 bg-gray-100 dark:bg-white/10 rounded-lg px-2 press shrink-0"
              >
                إلغاء
              </button>
            </div>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {fundedBy > 0 ? (
                <>
                  سيُموَّل بـ{formatAmount(Math.round(fundedBy))} ر.س من الفوائض
                  {shortfall > 0 && (
                    <> — والباقي {formatAmount(Math.round(shortfall))} ر.س يبقى عجزاً في المظروف نفسه تغطّيه لاحقاً، لا عجزاً في بدلك اليومي</>
                  )}
                </>
              ) : (
                <>لا رصيد في الفوائض الآن — يُنشأ المظروف بعجزٍ بقيمة المصروف يُغطّى من الراتب القادم، وتبقى يوميّتك سليمة</>
              )}
            </p>
          </div>
        )}

        {route === "fund" && chosenFund && (
          <p className="text-[10px] text-finance font-semibold">
            ✓ كامل المبلغ على «{chosenFund.name}» — لا يمسّ بدلك اليومي ولا سقوف الأقسام
          </p>
        )}
        {route === "off" && (
          <p className="text-[10px] text-gray-400 leading-relaxed">
            سيظهر في السجل والإحصائيات ومجموع الشهر، ولا يُحاسَب في أيّ وعاء — استعمله لما لا تريد
            تتبّعه أصلاً، لا لما تريد ضبطه.
          </p>
        )}
      </div>
    </div>
  );
}
