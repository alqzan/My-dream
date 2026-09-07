"use client";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { isPlainClick, nativeNavHref, shouldHardNavigate } from "@/lib/navHref";
import { loadNavPrefs, resolveNav } from "@/lib/navPrefs";

// Static export uses trailingSlash, so usePathname() returns "/journal/" while
// the nav hrefs are "/journal" — strip a trailing slash before comparing, or
// the active tab (and its sliding indicator) only ever lights up on the home
// route.
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

// شبكةُ الأمان: إن لم يقع التنقّل الداخليّ خلال هذه المهلة (حمولةُ المسار
// متعلّقةٌ على شبكةٍ نائمة) ننتقل انتقالاً أصلياً بالرابط نفسه. فالنقرة لا تذهب
// سدىً أبداً — وهي العلّة التي وُلدت منها الروابط الأصلية أوّلاً.
//
// المهلةُ سخيّة عن قصد: على شبكةِ الجوال (4G) تستغرق حمولةُ المسار أكثر من
// ثانيةٍ كثيراً، فكانت مهلةُ ١٫٢ ثانية تقطع تنقّلاً سليماً وتُعيد تحميل المستند
// كاملاً — فتظهر شاشةُ «مدار» وتُعاد المزامنة مع كلّ ضغطةِ تبويب. والإلغاء لا
// ينتظرها أصلاً: وصولُ المسار يلغيها فوراً (`useEffect` على `pathname`).
const SOFT_NAV_FALLBACK_MS = 6000;

export function MobileNav() {
  const pathname = normPath(usePathname());
  const router = useRouter();
  // Read once on mount (a saved preference change reloads the page — same
  // pattern as SyncKeyCard — so this never needs to react live).
  const [prefs] = useState(() => loadNavPrefs());
  const { visible } = resolveNav(NAV_ITEMS, prefs);

  // كل الأبواب تظهر في شريط واحد قابل للتمرير أفقيًا؛ لا توجد قائمة «المزيد».
  const count = visible.length;
  const slot = 100 / count;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  // ===== نقرةُ التبويب تنقّلٌ داخليّ، لا إعادةَ إقلاعٍ للتطبيق =====
  // الروابط الأصلية كانت تُعيد تحميل المستند كاملاً عند **كلّ** تبويب، وإعادةُ
  // التحميل في «مدار» ليست رخيصة: `ClientOnly` يحجب الواجهة كلّها خلف شاشة
  // «مدار» حتى يُرطَّب المتجر من IndexedDB، ثمّ يبدأ `SyncProvider` دورةَ
  // مزامنةٍ كاملة (قراءةُ المستند وshards المذكرات · دمج · ترطيبُ وسائط حتى
  // 8MB · كتابةٌ راجعة). فبدا التنقّل بين التبويبات تعليقاً، وضاعت كلُّ حالةٍ
  // في الذاكرة مع كلّ ضغطة — ومنها موضعُ المراجعة في القرآن (`HifzCoach` يحفظ
  // موضعه في حالة React لا في المتجر، فإعادةُ التحميل تُخرج المالك من المراجعة).
  // والشريط الجانبي على الحاسوب لم يُصَب لأنه بقي على `next/link`.
  //
  // يبقى `href` أصلياً على الرابط: يعمل قبل الترطيب، ومع الضغط المطوّل وفتحِ
  // تبويبٍ جديد، وهو نفسُه ما تستعمله شبكةُ الأمان أدناه. فلا تعود نقرةٌ ميّتة.
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  // ===== النقرةُ تُرى قبل أن تصل =====
  // `router.push` انتقالٌ (transition) في App Router: الصفحةُ القديمة تبقى
  // معروضةً حتى تجهز الجديدة. فبين الضغطة والوصول **لا يتغيّر في الشاشة شيء**
  // — لا مؤشّرٌ ينزلق ولا أيقونةٌ تُضاء — فيظنّ المالك أنّ الزرّ لم يُضغط
  // فيضغط ثانيةً وثالثة. وصفحاتُ مدار ثقيلةُ الرسم (الصلاة والقرآن خاصّةً)،
  // فالفجوةُ محسوسة. هذا `pending` يُشعل التبويبَ المضغوط **فوراً** بلا انتظار
  // المسار: ردٌّ بصريٌّ صادق («وصلتْ ضغطتُك، أنا في الطريق») لا كذبٌ بانتقالٍ
  // لم يقع. يُمسح فور وصول `pathname` — أو فور فشل التنقّل.
  const [pending, setPending] = useState<string | null>(null);

  // وصلَ التنقّل الداخليّ → ألغِ الشبكة. هذا هو الإشارةُ الموثوقة (لا المهلة):
  // `pathname` لا يتغيّر إلا بعد أن يلتزم المسار فعلاً.
  useEffect(() => {
    pendingRef.current = null;
    setPending(null);
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [pathname]);

  // ===== تسخينُ المسارات عند الفراغ =====
  // الشريطُ السفلي لا يستعمل `next/link`، فلا يرث تحميلَه المسبق. وبدونه تبدأ
  // كلُّ نقرةِ تبويبٍ من الصفر: جلبُ حمولة المسار وتنفيذُ حزمته قبل أن يقع
  // الانتقال. `prefetch` يملأ ذاكرةَ الموجّه بعد أن تهدأ الشاشة، فتصير النقرةُ
  // التالية فوريّةً بلا شبكة. و`requestIdleCallback` لا `useEffect` مباشرةً:
  // لا نزاحم الرسمَ الأوّل بسبع حمولاتٍ دفعةً واحدة (وهي نفسُها العلّة التي
  // كانت تُعلّق التبويبات عند الإقلاع البارد).
  useEffect(() => {
    const hrefs = visible.map((i) => i.href);
    const warm = () => { for (const href of hrefs) router.prefetch(href); };
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const id = idle(warm, { timeout: 3000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 1200);
    return () => window.clearTimeout(t);
    // القائمةُ تُقرأ مرّةً عند التركيب (تفضيلُ الترتيب يُعيد تحميل الصفحة).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return; // ضغطةٌ بمُعدِّل — سلوكُ الرابط للمستخدم
    e.preventDefault();
    const target = nativeNavHref(href, basePath);
    pendingRef.current = target;
    setPending(normPath(href));
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    router.push(href);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const hard = shouldHardNavigate({
        pending: pendingRef.current,
        target,
        currentPath: window.location.pathname,
        visible: document.visibilityState === "visible",
      });
      if (hard) window.location.href = target;
      // لم ننتقل ولم نُعِد التحميل → أعِد التبويبَ إلى حقيقته بدل أن يبقى
      // مُضاءً على وجهةٍ لم نصلها. الكذبُ البصريُّ أسوأ من الانتظار.
      else setPending(null);
    }, SOFT_NAV_FALLBACK_MS);
  };

  // ما يُرسم نشِطاً: الوجهةُ المضغوطة إن كانت في الطريق، وإلّا المسارُ الفعليّ.
  const shownPath = pending ?? pathname;
  const activeIndex = visible.findIndex((item) => normPath(item.href) === shownPath);

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#f4eee2]/85 dark:bg-[#171009]/85 backdrop-blur-lg border-t border-gray-100/70 pb-safe">
      <div className="overflow-x-auto">
        <div className="relative flex min-w-full w-max items-stretch py-2 px-0.5">
        {/* المؤشر المنزلق — يتحرك خلف التبويب النشط بحركة ناعمة. RTL: التبويب
            الأول على اليمين، فنحسب الإزاحة من اليمين. يأخذ لون القسم النشط عبر
            `bg-current` (صنفُ اللون نصّيّ في `nav.ts`)، فينزلق اللونُ مع
            المؤشّر بدل ذهبيٍّ ثابتٍ يخالف الأيقونة تحته. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 h-[3px] rounded-full bg-current transition-all duration-300 ease-out",
            activeIndex < 0 ? "text-brand-500" : visible[activeIndex].color
          )}
          style={{
            width: `calc(${slot}% - 26px)`,
            right: `calc(${(activeIndex < 0 ? 0 : activeIndex) * slot}% + 13px)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
        {visible.map((item) => {
          const active = normPath(item.href) === shownPath;
          return (
            <a
              key={item.href}
              href={nativeNavHref(item.href, basePath)}
              onClick={go(item.href)}
              aria-label={item.label}
              className={cn(
                // min-h-[44px]: a comfortable touch target (WCAG 2.2 target-size).
                "w-[72px] shrink-0 min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 rounded-xl transition-all press",
                // لون القسم نفسه الذي يستعمله الشريط الجانبي — المصدر `nav.ts`.
                // والخامل `gray-600` لا `gray-400`: الأخير يقرأ **2.2:1** على
                // خلفية الشريط (المطلوب 4.5) — أي أنّ مسمّيات التنقّل الأساسيّ
                // كانت دون حدّ AA في كلّ شاشة. الهرميّة لا تُفقد بذلك: النشِط
                // يفرزه لونُ قسمه وحبّتُه المظلَّلة ومؤشّرُه المنزلق، لا خفوتُ
                // جيرانه إلى حدّ تعذّر القراءة.
                active ? item.color : "text-gray-600"
              )}
            >
              <span className={cn(
                "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-all duration-300",
                active ? `${item.tint} scale-105` : "scale-100"
              )}>
                <item.icon size={20} />
              </span>
              <span className="text-[10.5px] leading-none font-medium whitespace-nowrap">{item.shortLabel ?? item.label}</span>
            </a>
          );
        })}
        </div>
      </div>
    </nav>
  );
}
