"use client";
import { useEffect, useState } from "react";
import { loadMutashabihat, similarInRange, type SimMap } from "@/lib/quran/mutashabihat";
import { MutashabihatCompare } from "@/components/quran/MutashabihatCompare";
import type { Portion } from "@/lib/quran/hifz";
import { GitCompareArrows, ChevronLeft } from "lucide-react";

// تنبيه المتشابهات — يظهر إن كان في المقطع آياتٌ لها نظائر، فينبّه الحافظ عند
// المرور بها ويفتح شاشة المقارنة. لا يظهر شيء إن لا متشابهات.
export function MutashabihatAlert({ portion, compact }: { portion: Portion; compact?: boolean }) {
  const [map, setMap] = useState<SimMap | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { loadMutashabihat().then(setMap); }, []);

  const ids = similarInRange(map, portion.fromId, portion.toId);
  if (ids.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/10 press hover:bg-amber-100/70 dark:hover:bg-amber-900/20 ${compact ? "px-3 py-2" : "px-3.5 py-2.5"}`}
      >
        <GitCompareArrows size={compact ? 14 : 15} className="text-amber-600 shrink-0" />
        <span className={`flex-1 text-right font-semibold text-amber-800 dark:text-amber-200 ${compact ? "text-[11px]" : "text-xs"}`}>
          {ids.length === 1 ? "في هذا المقطع آيةٌ لها متشابهات" : `في هذا المقطع ${ids.length} آيات لها متشابهات`}
          <span className="font-normal text-amber-600/80"> — انتبه للفروق</span>
        </span>
        <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-700 shrink-0">قارن <ChevronLeft size={13} /></span>
      </button>
      {open && <MutashabihatCompare baseIds={ids} onClose={() => setOpen(false)} />}
    </>
  );
}
