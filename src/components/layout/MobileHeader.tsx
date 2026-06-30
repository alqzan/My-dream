"use client";
import { SyncButton } from "@/components/auth/SyncButton";
import { useAuth } from "@/components/auth/AuthProvider";

export function MobileHeader() {
  const { enabled } = useAuth();
  // Only render the bar when cloud sync is configured; otherwise no clutter.
  if (!enabled) return null;

  return (
    <div className="lg:hidden flex items-center justify-between px-4 py-2.5 bg-white border-b border-gray-100 sticky top-0 z-30">
      <span className="text-sm font-bold text-gray-900">حلمي</span>
      <SyncButton />
    </div>
  );
}
