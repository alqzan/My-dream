"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { EVENING_HOUR } from "@/lib/nudges";
import { nudgesEnabled, readNudgePrefs, writeNudgePrefs } from "@/lib/nudgePrefs";

// بطاقةُ إعدادات: **التذكيراتُ اللطيفة** في البهو. مفتاحٌ واحد يُطفئها بالكامل —
// وهو شرطُ المالك لقبولها («خلّني أقدر أحذفها»)، لا استثناءٌ منها.
//
// **ولا وعدَ بإشعارِ جوّال هنا.** «مدار» موقعٌ ثابت بلا خادم Push، فالإشعارُ
// وأنت مسكِّرٌ التطبيق غيرُ ممكنٍ أصلاً. قولُ ذلك صراحةً أصدقُ من زرٍّ يعِد
// بما لا يقع — ويمنع سؤالاً يتكرّر كلَّ بضعة أشهر: «ليش ما وصلني إشعار؟».
export function RemindersCard() {
  // التفضيلُ جهازيّ يُقرأ بعد الترطيب، فلا يختلف الخادمُ عن العميل.
  const [on, setOn] = useState(true);
  useEffect(() => setOn(nudgesEnabled(readNudgePrefs())), []);

  function toggle() {
    const next = !on;
    setOn(next);
    // `hidden` يُمسح مع الإشعال: من أعاد الميزة يريد أن يراها الآن لا غداً.
    writeNudgePrefs(next ? { on: true } : { ...readNudgePrefs(), on: false });
  }

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-brand-600" />
          <span className="text-sm font-semibold text-gray-700">التذكيراتُ اللطيفة</span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">
          سطران أو ثلاثة في البهو: أوّلَ النهار ما ينتظرك، وبعد المغرب ما صار. ومعها موضعُك حين تنقطع —
          أين وقفتَ في المصحف، ومتى كانت آخرُ مذكرةٍ كتبتها. صياغتُها تتبدّل كلَّ يوم حتى لا تصير أثاثاً
          تمرّ عليه العين، ولا تحمل لوماً ولا إنذاراً.
        </p>

        <button
          type="button"
          onClick={toggle}
          aria-pressed={on}
          className={cn(
            "w-full flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right press transition-colors",
            on ? "border-brand-600 bg-brand-600/5" : "border-gray-200 dark:border-white/10 bg-white dark:bg-white/5"
          )}
        >
          <span className="flex-1 min-w-0">
            <span className={cn("block text-xs font-bold", on ? "text-brand-600" : "text-gray-600 dark:text-gray-300")}>
              {on ? "ظاهرة" : "مخفيّة"}
            </span>
            <span className="block text-[10px] text-gray-400 leading-relaxed">
              {on ? "تظهر في البهو لحظتين في اليوم" : "لا تظهر البطاقة إطلاقاً"}
            </span>
          </span>
          <span className={cn("shrink-0 w-9 h-5 rounded-full p-0.5 transition-colors", on ? "bg-brand-600" : "bg-gray-200 dark:bg-white/20")}>
            <span className={cn("block w-4 h-4 rounded-full bg-white transition-transform", on && "-translate-x-4")} />
          </span>
        </button>

        <p className="text-[11px] text-gray-500 bg-brand-600/5 rounded-xl px-3 py-2 leading-relaxed">
          🔔 التذكيرُ داخل التطبيق لا إشعارٌ على جوّالك: «مدار» موقعٌ ثابت بلا خادم، ولا سبيل لإرسال إشعارٍ
          إليك وأنت مغلِقُه. فهو ينتظرك أوّلَ ما تفتحه — قبل الساعة {EVENING_HOUR} افتتاحاً، وبعدها حصاداً.
          و«×» على البطاقة يخفيها لتلك اللحظة وحدها، لا للأبد.
        </p>
      </div>
    </Card>
  );
}
