"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Wallet, BookMarked, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncButton } from "@/components/auth/SyncButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "الرئيسية", color: "text-gray-700" },
  { href: "/journal", icon: BookMarked, label: "المذكرات", color: "text-journal" },
  { href: "/finance", icon: Wallet, label: "الأموال", color: "text-finance" },
  { href: "/reading", icon: BookOpen, label: "القراءة", color: "text-reading" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex flex-col w-56 bg-white border-l border-gray-100 min-h-screen fixed right-0 top-0 z-40">
      <div className="p-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-gray-900">حلمي</h1>
        <p className="text-xs text-gray-400 mt-0.5">متابعتك اليومية</p>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href;
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
      <div className="p-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
        <SyncButton />
        <ThemeToggle />
      </div>
    </aside>
  );
}
