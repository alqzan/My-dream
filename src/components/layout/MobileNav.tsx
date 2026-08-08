"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { loadNavPrefs, resolveNav } from "@/lib/navPrefs";
import { Modal } from "@/components/ui/Modal";

// Static export uses trailingSlash, so usePathname() returns "/journal/" while
// the nav hrefs are "/journal" — strip a trailing slash before comparing, or
// the active tab (and its sliding indicator) only ever lights up on the home
// route.
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

export function MobileNav() {
  const pathname = normPath(usePathname());
  // Read once on mount (a saved preference change reloads the page — same
  // pattern as SyncKeyCard — so this never needs to react live).
  const [prefs] = useState(() => loadNavPrefs());
  const { primary, overflow } = resolveNav(NAV_ITEMS, prefs);
  const [moreOpen, setMoreOpen] = useState(false);

  // "المزيد" only exists once the owner has actually customized the bar
  // (overflow.length > 0) — an untouched device keeps every section directly
  // in the bar exactly as before (resolveNav's documented default).
  const tabs = overflow.length ? [...primary, { more: true as const }] : primary;
  const count = tabs.length;
  const activeIndex = primary.findIndex((item) => normPath(item.href) === pathname);
  // Overflow counts as "active" too (so the slider/tint don't just vanish
  // while on a page reached through "المزيد") but the sliding indicator only
  // makes sense for a direct tab — hide it when the current page lives behind
  // "المزيد" instead of pointing at the wrong slot.
  const onOverflowPage = overflow.some((item) => normPath(item.href) === pathname);
  const slot = 100 / count;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#f4eee2]/85 dark:bg-[#171009]/85 backdrop-blur-lg border-t border-gray-100/70 pb-safe">
      <div className="relative flex items-stretch py-2 px-0.5">
        {/* المؤشر المنزلق — يتحرك خلف التبويب النشط بحركة ناعمة. RTL: التبويب
            الأول على اليمين، فنحسب الإزاحة من اليمين. يأخذ لون القسم النشط عبر
            `bg-current` (صنفُ اللون نصّيّ في `nav.ts`)، فينزلق اللونُ مع
            المؤشّر بدل ذهبيٍّ ثابتٍ يخالف الأيقونة تحته. */}
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 h-[3px] rounded-full bg-current transition-all duration-300 ease-out",
            activeIndex < 0 ? "text-brand-500" : primary[activeIndex].color
          )}
          style={{
            width: `calc(${slot}% - 26px)`,
            right: `calc(${(activeIndex < 0 ? 0 : activeIndex) * slot}% + 13px)`,
            opacity: activeIndex < 0 || onOverflowPage ? 0 : 1,
          }}
        />
        {primary.map((item) => {
          const active = normPath(item.href) === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              className={cn(
                // min-h-[44px]: a comfortable touch target (WCAG 2.2 target-size).
                "flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 rounded-xl transition-all press",
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
            </Link>
          );
        })}
        {overflow.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="المزيد من الأقسام"
            className={cn(
              "flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-1.5 rounded-xl transition-all press",
              onOverflowPage ? "text-brand-600" : "text-gray-600"
            )}
          >
            <span className={cn(
              "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-all duration-300",
              onOverflowPage ? "bg-brand-500/15 scale-105" : "scale-100"
            )}>
              <MoreHorizontal size={20} />
            </span>
            <span className="text-[10.5px] leading-none font-medium whitespace-nowrap">المزيد</span>
          </button>
        )}
      </div>

      {overflow.length > 0 && (
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="بقية الأقسام">
          <div className="grid grid-cols-3 gap-3 pb-1">
            {overflow.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="min-h-[44px] flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl bg-gray-50 dark:bg-white/5 press"
              >
                <span className={cn("flex items-center justify-center rounded-full p-2", item.tint)}>
                  <item.icon size={20} className={item.color} />
                </span>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{item.label}</span>
              </Link>
            ))}
          </div>
        </Modal>
      )}
    </nav>
  );
}
