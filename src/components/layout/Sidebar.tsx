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
    <aside className="hidden lg:flex flex-col w-56 bg-white border-l border-gray-100 min-h-screen fixed right-0 top-0 z-40">
      <div className="p-6 border-b border-gray-100 dark:border-[#3a2e1e] flex items-center gap-3">
        <BrandMark size={38} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">مدار</h1>
          <p className="text-xs text-gray-400 mt-0.5">مساحتك الشخصية</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1">
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
      <div className="p-3 border-t border-gray-100 dark:border-[#3a2e1e] flex items-center justify-between gap-2">
        <SyncStatus />
        <div className="flex items-center gap-1">
          <SettingsButton />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
