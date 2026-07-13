"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";

// Static export uses trailingSlash, so usePathname() returns "/journal/" while
// the nav hrefs are "/journal" — strip a trailing slash before comparing, or
// the active tab (and its sliding indicator) only ever lights up on the home
// route.
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

export function MobileNav() {
  const pathname = normPath(usePathname());
  const count = NAV_ITEMS.length;
  const activeIndex = NAV_ITEMS.findIndex((item) => normPath(item.href) === pathname);
  const slot = 100 / count;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#f4eee2]/85 dark:bg-[#171009]/85 backdrop-blur-lg border-t border-gray-100/70 pb-safe">
      <div className="relative flex items-stretch py-2 px-0.5">
        {/* المؤشر المنزلق — يتحرك خلف التبويب النشط بحركة ناعمة. RTL: التبويب
            الأول على اليمين، فنحسب الإزاحة من اليمين. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 h-[3px] rounded-full bg-brand-500 transition-all duration-300 ease-out"
          style={{
            width: `calc(${slot}% - 26px)`,
            right: `calc(${(activeIndex < 0 ? 0 : activeIndex) * slot}% + 13px)`,
            opacity: activeIndex < 0 ? 0 : 1,
          }}
        />
        {NAV_ITEMS.map((item) => {
          const active = normPath(item.href) === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-0.5 px-0.5 py-1.5 rounded-xl transition-all press",
                active ? "text-brand-600" : "text-gray-400"
              )}
            >
              <span className={cn(
                "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-all duration-300",
                active ? "bg-brand-100/70 scale-105" : "scale-100"
              )}>
                <item.icon size={20} />
              </span>
              <span className="text-[9.5px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
