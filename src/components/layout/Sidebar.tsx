"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsButton } from "@/components/layout/SettingsButton";
import { BrandMark } from "@/components/layout/BrandMark";

// trailingSlash export → usePathname() is "/journal/" but hrefs are "/journal".
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

export function Sidebar() {
  const pathname = normPath(usePathname());

  return (
    // ارتفاعٌ **بالضبط** بمقدار المساحة المرئية، لا `min-h-screen`: العنصر `fixed`
    // فلا يتمرّر معه شيء، و`100vh` على آيباد/آيفون Safari أطولُ من المرئيّ فعلاً
    // (شريط المتصفّح ومؤشّر الهوم يغطّيان الأسفل) — فكان صفّ المزامنة والإعدادات
    // يسقط تحت الحافة في الزاوية ولا يظهر ولا يُلمس. `100dvh` يتبع المرئيّ حيّاً،
    // و`shrink-0` على الطرفين مع `overflow-y-auto` على التنقّل يجعل القائمة هي
    // التي تتقلّص عند ضيق الارتفاع — فيبقى الصفّ السفليّ مرئياً دائماً.
    <aside className="hidden lg:flex flex-col w-56 bg-white border-l border-gray-100 h-[100dvh] fixed right-0 top-0 z-40">
      <div className="shrink-0 p-6 border-b border-gray-100 dark:border-[#3a2e1e] flex items-center gap-3">
        <BrandMark size={38} />
        <div>
          {/* اسم التطبيق لا عنوان الصفحة: كان <h1> فتحمل كلّ صفحةٍ عنوانين
              رئيسيين، وقارئ الشاشة يرى بنيةً مكسورة. الشكل كما هو. */}
          <p className="text-xl font-bold text-gray-900">مدار</p>
          <p className="text-xs text-gray-400 mt-0.5">مساحتك الشخصية</p>
        </div>
      </div>

      {/* المزامنة والإعدادات والسمة **في الأعلى** — كما هي في ترويسة الجوّال
          تماماً. كانت في ذيل الشريط: أبعدُ نقطةٍ عن العين، وأوّلُ ما يُقتطع حين
          يقصر الارتفاع، فبدا التطبيق على الآيباد بلا إعداداتٍ ولا حالة مزامنة
          بينما هي ظاهرةٌ على الآيفون. مكانٌ واحد على الجهازين. */}
      <div className="shrink-0 px-3 py-2 border-b border-gray-100 dark:border-[#3a2e1e] flex items-center justify-between gap-2">
        <SyncStatus />
        <div className="flex items-center gap-1">
          <SettingsButton />
          <ThemeToggle />
        </div>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = normPath(item.href) === pathname;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                active
                  ? "bg-gray-100 text-gray-900 font-semibold"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon size={18} className={active ? item.color : ""} />
              <span className="text-sm">{item.label}</span>
            </Link>
          );
        })}
      </nav>
      {/* حشوٌ سفليّ بمنطقة الأمان وحدها: القائمة تنتهي فوق مؤشّر الهوم لا تحته. */}
      <div className="shrink-0 pb-[env(safe-area-inset-bottom,0px)]" />
    </aside>
  );
}
