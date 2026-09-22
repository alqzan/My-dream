"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  STABLE_AFTER_MS,
  bootReport,
  exitSafeMode,
  isSafeMode,
  isStoreRescue,
  markBootPhase,
  markBootStable,
} from "@/lib/platform/bootGuard";
import { toIndicDigits } from "@/lib/utils";

// يُعلن استقرار الإقلاع (عشرون ثانيةً حيّة، أو خروجٌ طبيعيّ إلى الخلفية)،
// ويعرض شريط الوضع الآمن حين يكون الإقلاع آمناً. المنطق في `platform/bootGuard.ts`.
export function BootGuard() {
  const [safe] = useState(isSafeMode);
  const [rescue] = useState(isStoreRescue);
  const [report] = useState(bootReport);

  useEffect(() => {
    markBootPhase("render");
    const timer = setTimeout(markBootStable, STABLE_AFTER_MS);
    // الخروجُ إلى الخلفية ليس انهياراً — وإلّا عُدّ إغلاقُ التطبيق سريعاً انهياراً.
    const onHide = () => {
      if (document.visibilityState === "hidden") markBootStable();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", markBootStable);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", markBootStable);
    };
  }, []);

  if (rescue && !safe) {
    return (
      <div dir="rtl" className="mx-3 mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 leading-relaxed">
        <p className="font-bold text-sm">وضعُ الإنقاذ — التطبيق يعمل من نسخة السحابة</p>
        <p>
          قراءةُ بياناتك المحفوظة على هذا الجهاز كانت تُسقط التطبيق، فتركناها كما هي
          (<b>لم تُحذف</b>) وحمّلنا بياناتك من المزامنة. ما سجّلته ولم يتزامن قبل العطل
          باقٍ في تلك النسخة ويمكن استرجاعه لاحقاً.
        </p>
      </div>
    );
  }
  if (!safe) return null;
  const mb = report.storeBytes ? toIndicDigits((report.storeBytes / 1_048_576).toFixed(1)) : null;
  return (
    <div dir="rtl" className="mx-3 mt-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
      <p className="font-bold">وضعٌ آمن — التطبيق انهار أكثر من مرّة عند الفتح</p>
      <p className="text-xs leading-relaxed">
        بياناتك سليمة على جهازك. أوقفنا مؤقتاً المزامنةَ واستيرادَ رسائل البنك والمقاصةَ التلقائية
        حتى يفتح التطبيق. خذ نسخةً احتياطية من الإعدادات أوّلاً.
      </p>
      <p className="text-[11px] opacity-80" dir="rtl">
        آخر مرحلة قبل الانهيار: <span dir="ltr">{report.crashPhase ?? "غير معروفة"}</span>
        {mb && <> · حجم البيانات: {mb} م.ب</>}
      </p>
      <div className="flex gap-2">
        <Link href="/settings" className="flex-1 text-center rounded-xl bg-amber-600 text-white font-bold text-xs py-2">
          النسخة الاحتياطية
        </Link>
        <button
          type="button"
          onClick={() => {
            exitSafeMode();
            location.reload();
          }}
          className="flex-1 rounded-xl border border-amber-400 font-bold text-xs py-2"
        >
          جرّب الوضع العادي
        </button>
      </div>
    </div>
  );
}
