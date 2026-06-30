"use client";
import { SyncButton } from "@/components/auth/SyncButton";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function MobileHeader() {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 sticky top-0 z-30">
      <span className="text-lg font-bold text-gray-900 dark:text-white">حلمي</span>
      <div className="flex items-center gap-1">
        <SyncButton />
        <ThemeToggle />
      </div>
    </div>
  );
}
