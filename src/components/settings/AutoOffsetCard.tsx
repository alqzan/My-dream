"use client";
import { useAppStore } from "@/lib/store";
import { Card } from "@/components/ui/Card";
import { formatAmount, cn } from "@/lib/utils";
import { EVENT_DAYS } from "@/lib/budgetFlow";
import { SURPLUS_FUND_NAME } from "@/lib/types";
import { Scale } from "lucide-react";

// بطاقة إعدادات: **المقاصة التلقائية**. حين ينزل رصيد الميزانية اليومية تحت
// الصفر يُسحب العجزُ من صندوق «الفوائض» فور ظهوره بلا ضغطة. وسقفُها مقصود:
// عجزٌ يتجاوز ثلاث يوميّات ليس عجزاً يومياً بل حدثٌ سُجّل في المكان الخطأ،
// فتقف المقاصة ويُعرض القرار في بطاقة الميزانية (القاعدة في `budgetFlow.ts`).
export function AutoOffsetCard() {
  const autoOffset = useAppStore((s) => s.autoOffset);
  const setAutoOffset = useAppStore((s) => s.setAutoOffset);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const on = autoOffset !== false;
  const cap = dailyBudget ? dailyBudget.amount * EVENT_DAYS : 0;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-finance" />
          <span className="text-sm font-semibold text-gray-700">المقاصة التلقائية للعجز</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          إذا نزل رصيد ميزانيتك اليومية تحت الصفر، يُسحب العجز من صندوق «{SURPLUS_FUND_NAME}» فوراً
          فيعود رصيدك إلى الصفر بدل أن يبقى سالباً. يظهر السحب في سجلّ الصندوق باسمه، فتعرف ما جرى.
        </p>

        <button
          type="button"
          onClick={() => setAutoOffset(!on)}
          aria-pressed={on}
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right press transition-colors",
            on ? "border-finance bg-finance/5" : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
          )}
        >
          <span className="flex-1 min-w-0">
            <span className={cn("block text-xs font-bold", on ? "text-finance" : "text-gray-600 dark:text-gray-300")}>
              {on ? "مفعّلة" : "موقوفة"}
            </span>
            <span className="block text-[10px] text-gray-400 leading-relaxed">
              {on
                ? "العجز يُغطّى لحظة ظهوره"
                : "العجز يبقى ظاهراً وتغطّيه يدوياً من بطاقة الميزانية اليومية"}
            </span>
          </span>
          <span className={cn("shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors", on ? "bg-finance" : "bg-gray-200 dark:bg-white/20")}>
            <span className={cn("block w-4 h-4 rounded-full bg-white transition-transform", on && "-translate-x-4")} />
          </span>
        </button>

        <p className="text-[11px] text-gray-500 bg-finance/5 rounded-xl px-3 py-2 leading-relaxed">
          ⚖️ السقف: {cap > 0 ? <>حتى {formatAmount(Math.round(cap))} ر.س</> : <>حتى {EVENT_DAYS} يوميّات</>} في المرّة
          الواحدة ({EVENT_DAYS} أيام من بدلك). وما زاد عن ذلك لا يُغطّى صامتاً — فهو غالباً حدثٌ كبير
          (سفرة، رسوم) مكانُه مظروفٌ مستقلّ يُعرض عليك لحظة تسجيل المصروف، لا بدلُك اليومي.
        </p>
      </div>
    </Card>
  );
}
