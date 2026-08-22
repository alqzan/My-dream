"use client";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { isPlainClick, nativeNavHref } from "@/lib/navHref";
import { loadNavPrefs, resolveNav } from "@/lib/navPrefs";

// Static export uses trailingSlash, so usePathname() returns "/journal/" while
// the nav hrefs are "/journal" — strip a trailing slash before comparing, or
// the active tab (and its sliding indicator) only ever lights up on the home
// route.
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

// شبكةُ الأمان: إن لم يقع التنقّل الداخليّ خلال هذه المهلة (حمولةُ المسار
// متعلّقةٌ على شبكةٍ نائمة) ننتقل انتقالاً أصلياً بالرابط نفسه. فالنقرة لا تذهب
// سدىً أبداً — وهي العلّة التي وُلدت منها الروابط الأصلية أوّلاً.
const SOFT_NAV_FALLBACK_MS = 1200;

export function MobileNav() {
  const pathname = normPath(usePathname());
  const router = useRouter();
  // Read once on mount (a saved preference change reloads the page — same
  // pattern as SyncKeyCard — so this never needs to react live).
  const [prefs] = useState(() => loadNavPrefs());
  const { visible } = resolveNav(NAV_ITEMS, prefs);

  // كل الأبواب تظهر في شريط واحد قابل للتمرير أفقيًا؛ لا توجد قائمة «المزيد».
  const count = visible.length;
  const activeIndex = visible.findIndex((item) => normPath(item.href) === pathname);
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
  const go = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(e)) return; // ضغطةٌ بمُعدِّل — سلوكُ الرابط للمستخدم
    e.preventDefault();
    const target = nativeNavHref(href, basePath);
    pendingRef.current = target;
    router.push(href);
    window.setTimeout(() => {
      if (pendingRef.current !== target) return; // ألغتها نقرةٌ أحدث
      if (normPath(window.location.pathname) === normPath(target)) return; // وصلنا
      window.location.href = target;
    }, SOFT_NAV_FALLBACK_MS);
  };

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
          const active = normPath(item.href) === pathname;
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
