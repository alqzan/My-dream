"use client";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { BrandMark } from "@/components/layout/BrandMark";

export function MobileHeader() {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white dark:bg-[#1c1610] border-b border-gray-100 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <BrandMark size={26} />
        <span className="text-lg font-bold text-gray-900 dark:text-white">مدار</span>
      </div>
      <div className="flex items-center gap-1">
        <SyncStatus />
        <ThemeToggle />
      </div>
    </div>
  );
}
