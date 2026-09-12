"use client";
import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { formatAmount } from "@/lib/utils";
import { showToast } from "@/components/ui/UndoToast";

// مراقبٌ واحد للمقاصة التلقائية، مركّبٌ في التخطيط العام. لماذا هنا لا داخل
// `addTransaction`؟ لأنّ العجز يظهر من مسالكَ عدّة: نموذجُ المصروف، وتعديلُ
// معاملةٍ قديمة، ورسائلُ البنك الواردة تلقائياً، ودمجُ لقطةِ السحابة. المراقب
// يرى النتيجة أيّاً كان سببُها، فلا تُنسى المقاصة في مسلكٍ ويُذكر في آخر.
//
// القرار كلّه في `offsetPlan` (`budgetFlow.ts`) عبر `autoOffsetDeficit`؛ وهو
// **ساكنٌ بطبعه**: بعد التغطية يصير الرصيد صفراً فالنداءُ التالي يرجع صفراً،
// فلا حلقة. والتأخير القصير يمنع مقاصّاتٍ متتابعة وسط استيرادٍ من البنك دفعةً
// واحدة — تُحسب مرّةً على المحصّلة بدل مرّةٍ لكلّ رسالة.
export function DeficitOffsetWatcher() {
  const autoOffset = useAppStore((s) => s.autoOffset);
  const dailyBudget = useAppStore((s) => s.dailyBudget);
  const transactions = useAppStore((s) => s.transactions);
  const reserves = useAppStore((s) => s.reserves);
  const run = useAppStore((s) => s.autoOffsetDeficit);
  // آخر مبلغٍ أُعلن، حتى لا تتكرّر الرسالة نفسها حين تُعيد إعادةُ الرسم النداء.
  const lastRef = useRef(0);

  useEffect(() => {
    if (autoOffset === false || !dailyBudget) return;
    const t = setTimeout(() => {
      const moved = run();
      // صفرٌ = لا عجز الآن، فتُنسى آخرُ رسالة: مقاصةٌ لاحقةٌ بالمبلغ نفسه تُعلَن
      // من جديد بدل أن يبتلعها حارسُ التكرار.
      if (moved <= 0) { lastRef.current = 0; return; }
      if (moved !== lastRef.current) {
        lastRef.current = moved;
        showToast(`✨ مقاصة تلقائية: ${formatAmount(moved)} ر.س من الفوائض غطّت عجز يوميّتك`, "success");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [autoOffset, dailyBudget, transactions, reserves, run]);

  return null;
}
