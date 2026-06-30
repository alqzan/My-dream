"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Wallet, BookMarked, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "الرئيسية" },
  { href: "/journal", icon: BookMarked, label: "مذكرات" },
  { href: "/finance", icon: Wallet, label: "الأموال" },
  { href: "/reading", icon: BookOpen, label: "القراءة" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 pb-safe">
      <div className="flex items-center justify-around py-2">
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[60px]",
                active ? "text-brand-600" : "text-gray-400"
              )}
            >
              <item.icon size={22} />
              <span className="text-[10px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
