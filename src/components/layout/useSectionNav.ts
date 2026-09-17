"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isImpatientRetap,
  nativeNavHref,
  normNavPath,
  remainingSoftNavMs,
  shouldHardNavigate,
} from "@/lib/navHref";

/**
 * تبديلُ القسم — **نقرةٌ تصل دائماً**.
 *
 * التنقّلُ الداخليّ (`router.push`) هو الأصل: إعادةُ إقلاع التطبيق ليست رخيصة
 * (`ClientOnly` يحجب الواجهة حتى يُرطَّب المتجر من IndexedDB، ثمّ دورةُ مزامنةٍ
 * كاملة)، وكانت الروابطُ الأصلية تدفع ذلك الثمن مع **كلّ** تبويب.
 *
 * لكنّه في App Router **بلا مهلة**: لا ينتقل شيءٌ حتى تصل حمولةُ المسار
 * (`/prayers/index.txt?_rsc=…`)، وإن لم تصل — شبكةُ جوّالٍ نائمة وعاملُ الخدمة
 * لا يقود الصفحة بعد — بقيت الصفحةُ القديمة معروضةً **إلى الأبد بلا خطأ**.
 * فهنا ثلاثُ ضماناتٍ تجعل النقرة تصل:
 *
 * 1. **تُرى فوراً**: `pending` يُضيء الوجهةَ المضغوطة قبل أن تصل — ردٌّ صادق
 *    («وصلتْ ضغطتُك») لا كذبٌ بانتقالٍ لم يقع.
 * 2. **سقفٌ مطلق** من أوّل نقرةٍ معلّقة (`SOFT_NAV_DEADLINE_MS`) ثمّ انتقالٌ
 *    أصليّ بالرابط نفسِه. والسقفُ **لا يُستأنف** مع كلّ نقرة — وكان يُستأنف،
 *    فمن يضغط كلَّ ثانيتين لا تنقضي عنده المهلةُ أبداً.
 * 3. **ونقرةٌ ثانية على شاشةٍ لم تتحرّك** (`IMPATIENT_RETAP_MS`) انتقالٌ أصليّ
 *    فوراً: هي أصدقُ خبرٍ عندنا بأنّ الداخليّ لم يقع.
 *
 * والحفظُ مضمونٌ عبر الانتقال الأصليّ: `idbStorage.ts` يُفرغ المعلّق عند
 * `visibilitychange`/`pagehide`.
 */
export function useSectionNav() {
  const pathname = normNavPath(usePathname());
  const router = useRouter();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // الوجهةُ المعلّقة (بمسارها الأصليّ) وطابعُ **أوّل** نقرةٍ لم تصل بعد.
  const pendingRef = useRef<string | null>(null);
  const pendingSinceRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const settle = useCallback(() => {
    pendingRef.current = null;
    pendingSinceRef.current = null;
    setPending(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // وصلَ التنقّل الداخليّ → انتهى كلُّ شيء. هذه هي الإشارةُ الموثوقة (لا
  // المهلة): `pathname` لا يتغيّر إلا بعد أن يلتزم المسار فعلاً.
  useEffect(() => { settle(); }, [pathname, settle]);

  // لا نترك مؤقّتاً يوقظ مكوّناً مفكوكاً.
  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const navigate = useCallback((href: string) => {
    const target = nativeNavHref(href, basePath);
    const now = Date.now();

    // ضغطةٌ ثانية والشاشةُ مكانَها: لا ننتظر السقف.
    if (isImpatientRetap(pendingSinceRef.current, now)) {
      window.location.href = target;
      return;
    }

    if (pendingSinceRef.current === null) pendingSinceRef.current = now;
    pendingRef.current = target;
    setPending(normNavPath(href));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    router.push(href);

    // ما بقي من سقف **أوّل** نقرة، لا سقفاً جديداً لهذه.
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const hard = shouldHardNavigate({
        pending: pendingRef.current,
        target,
        currentPath: window.location.pathname,
        visible: document.visibilityState === "visible",
      });
      if (hard) window.location.href = target;
      // لم ننتقل ولم نُعِد التحميل (غابت الصفحة، أو كنّا واصلين أصلاً) → أعِد
      // الحالةَ إلى حقيقتها بدل تبويبٍ مُضاءٍ على وجهةٍ لم نصلها، وبدل طابعٍ
      // معلّقٍ يجعل النقرةَ التاليةَ تبدو «ضغطةً ثانية».
      else settle();
    }, remainingSoftNavMs(pendingSinceRef.current, now));
  }, [basePath, router, settle]);

  return { pathname, pending, navigate, basePath };
}
