"use client";
import { usePending } from "@/lib/pending";
import { Landmark, ChevronLeft } from "lucide-react";

// Home-screen call-to-action: shows how many bank messages arrived
// automatically and are waiting for approval, and reopens the review sheet.
export function PendingBankBanner() {
  const { count, reviewing, openReview } = usePending();
  if (!count || reviewing) return null;
  return (
    <button
      onClick={openReview}
      className="w-full flex items-center gap-3 bg-finance/10 border border-finance/20 rounded-2xl px-4 py-3 text-right press animate-fade-up"
    >
      <span className="w-9 h-9 rounded-xl bg-finance/15 flex items-center justify-center text-finance shrink-0">
        <Landmark size={18} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-gray-800 dark:text-white">
          {count} معاملة بنك جديدة
        </div>
        <div className="text-[11px] text-gray-500">وصلت تلقائياً — راجعها ووافق</div>
      </div>
      <ChevronLeft size={18} className="text-finance shrink-0" />
    </button>
  );
}
