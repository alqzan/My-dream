"use client";
import { SyncStatus } from "@/components/sync/SyncStatus";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SettingsButton } from "@/components/layout/SettingsButton";
import { BrandMark } from "@/components/layout/BrandMark";

export function MobileHeader() {
  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-[#f4eee2]/80 dark:bg-[#171009]/80 backdrop-blur-lg border-b border-gray-100/70 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <BrandMark size={26} />
        <span className="text-lg font-bold text-gray-900 dark:text-white">مدار</span>
      </div>
      <div className="flex items-center gap-1">
        <SyncStatus />
        <SettingsButton />
        <ThemeToggle />
      </div>
    </div>
  );
}
