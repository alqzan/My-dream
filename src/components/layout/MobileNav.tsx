"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/nav";

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 pb-safe">
      <div className="flex items-center justify-around py-2 px-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl transition-all min-w-[50px] press",
                active ? "text-brand-600" : "text-gray-400"
              )}
            >
              <span className={cn(
                "flex items-center justify-center rounded-full px-2.5 py-0.5 transition-colors",
                active && "bg-brand-100/70"
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
