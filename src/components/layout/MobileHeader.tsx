"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsButton } from "@/components/layout/SettingsButton";
import { BrandMark } from "@/components/layout/BrandMark";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

// trailingSlash في التصدير الثابت → usePathname() ترجع "/quran/" والمسارات
// مكتوبة "/quran" (نفس الحيلة في Sidebar وMobileNav).
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

// الترويسة اللاصقة تعرف أين أنت وكم قطعت:
//   • خيطُ تقدّمٍ ذهبي أسفلها ينمو من اليمين مع نزولك في الصفحة — إشارةُ
//     «طلعت ولا نزلت» الوحيدة التي كانت ناقصة؛ الصفحاتُ طويلة والمحتوى متشابه.
//   • ارتفاعٌ خفيف (ظلّ + خلفيةٌ أعتم) بمجرّد مغادرة القمّة، فتنفصل الترويسة
//     عن المحتوى بدل أن تسبح فوقه.
//   • اسم القسم يظهر بجانب «مدار» بعد أن يمرّ عنوان الصفحة، فلا تفقد سياقك.
export function MobileHeader() {
  const pathname = normPath(usePathname());
  const section = NAV_ITEMS.find((n) => normPath(n.href) === pathname);
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [past, setPast] = useState(false);

  useEffect(() => {
    let raf = 0;
    const apply = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setScrolled(y > 4);
      // 72px ≈ ارتفاع كتلة العنوان: بعدها لم يعد اسم القسم ظاهراً في المحتوى.
      setPast(y > 72);
      setProgress(max > 48 ? Math.min(1, Math.max(0, y / max)) : 0);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // إعادة القياس عند تبديل القسم: الطول يختلف بين الصفحات.
  }, [pathname]);

  return (
    <div
      className={cn(
        // sticky يُنشئ سياق تموضعٍ لخيط التقدّم المطلق أسفله (لا حاجة لـrelative،
        // وإضافتها تصارع sticky على خاصية position نفسها).
        "lg:hidden sticky top-0 z-30 flex items-center justify-between gap-2 px-4 py-2.5",
        "backdrop-blur-lg border-b transition-colors duration-300",
        scrolled
          ? "bg-[#f4eee2]/95 dark:bg-[#171009]/95 border-gray-200/80 card-shadow"
          : "bg-[#f4eee2]/80 dark:bg-[#171009]/80 border-gray-100/70"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <BrandMark size={26} />
        <span className="text-lg font-bold text-gray-900 dark:text-white shrink-0">مدار</span>
        {section && (
          <span
            className={cn(
              "flex items-center gap-1.5 min-w-0 transition-all duration-300",
              past ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
            )}
            aria-hidden={!past}
          >
            <span className="text-gray-300 dark:text-gray-500">/</span>
            {/* `gray-600` لا `gray-500`: الأخير 4.18:1 على خلفية الترويسة —
                تحت حدّ AA بفارقٍ يسير، وهذا اسمُ القسم الذي يخبرك أين أنت. */}
            <span className="text-sm font-semibold text-gray-600 truncate">{section.label}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <SyncStatus />
        <SettingsButton />
        <ThemeToggle />
      </div>
      {/* خيط التقدّم — ينمو من اليمين (بداية السطر في RTL) */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[2px] rounded-l-full bg-gradient-to-l from-brand-500 to-brand-300 transition-[width] duration-150 ease-out"
        style={{ width: `${progress * 100}%` }}
      />
    </div>
  );
}
