"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

// trailingSlash export → usePathname() is "/settings/" but the href is
// "/settings"; strip the trailing slash before comparing (same trick as the
// nav components) so the active tint lights up on the settings route.
const normPath = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);

// Small gear that opens the standalone settings page. Lives next to the
// ThemeToggle in both the desktop Sidebar footer and the MobileHeader, so
// settings is reachable without spending a slot in the primary nav.
export function SettingsButton({ className }: { className?: string }) {
  const active = normPath(usePathname()) === "/settings";
  return (
    <Link
      href="/settings"
      aria-label="الإعدادات"
      title="الإعدادات"
      className={
        "relative p-2 rounded-xl transition-colors " +
        (active
          ? "text-brand-600 bg-brand-50 "
          : "text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10 ") +
        (className ?? "")
      }
    >
      <Settings size={18} />
    </Link>
  );
}
