"use client";
import { useAppStore } from "@/lib/store";
import { buildDayDigest } from "@/lib/assistantContext";
import { today, formatDate, formatAmount } from "@/lib/utils";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { Wallet, BookMarked, BookOpen, Sprout, Star, Check, Minus } from "lucide-react";

// «خلاصة اليوم» — بطاقةٌ موجزة تجمع الصرف والصلوات والعادات والوِرد والمذكرة
// والقراءة، مشتقّةً من منطق assistantContext.ts (buildDayDigest). تُشترك في
// عرضٍ واحد حالة اليوم عبر الأقسام لتذكيرٍ لطيفٍ داخل قسم قرآن.
export function DayDigestCard() {
  // اشتراكٌ بكامل المتجر (بطاقةٌ خفيفة) — AppStore يمدّ AppData الذي يقرؤه البانّي.
  const store = useAppStore();
  const d = buildDayDigest(store);

  const overBudget = d.budgetBalance != null && d.budgetBalance < 0;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white dark:bg-[#241c12] card-shadow p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-800">خلاصة اليوم</span>
        <span className="text-[11px] text-gray-400">{formatDate(today())}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* الصرف */}
        <Stat
          icon={<Wallet size={15} />}
          color="#3d9640"
          label="صرف اليوم"
          value={`${formatAmount(d.spentToday)} ر.س`}
          sub={
            d.budgetBalance == null
              ? undefined
              : `${overBudget ? "تجاوز" : "متبقٍّ"} ${formatAmount(Math.abs(d.budgetBalance))}`
          }
          subTone={overBudget ? "bad" : "good"}
        />
        {/* الصلوات */}
        <Stat
          icon={<MosqueIcon size={15} />}
          color="#1f7a6c"
          label="الصلوات"
          value={`${d.prayed}/5`}
          sub={d.mosque > 0 ? `${d.mosque} بالمسجد` : undefined}
        />
        {/* الوِرد — يختفي متى جُمِّد */}
        {!d.wirdFrozen && (
          <BoolStat icon={<Sprout size={15} />} color="#1b6b4c" label="وِرد اليوم" done={d.wirdDone} />
        )}
        {/* المذكرة — تختفي متى جُمِّدت */}
        {!d.journalFrozen && (
          <BoolStat icon={<BookMarked size={15} />} color="#8a6fb0" label="المذكرة" done={d.journalWritten} />
        )}
        {/* القراءة — تختفي متى جُمِّدت */}
        {!d.readingFrozen && (
          <BoolStat icon={<BookOpen size={15} />} color="#c1663f" label="القراءة" done={d.readingDone} />
        )}
        {/* العادات أو الختمة */}
        {d.habitsTotal > 0 ? (
          <Stat icon={<Star size={15} />} color="#c9852a" label="العادات" value={`${d.habitsDone}/${d.habitsTotal}`} />
        ) : (
          <Stat icon={<Sprout size={15} />} color="#1b6b4c" label="الختمة" value={`${d.khatmaJuz}/30`} />
        )}
      </div>
    </div>
  );
}

function Stat({
  icon, color, label, value, sub, subTone,
}: {
  icon: React.ReactNode; color: string; label: string; value: string;
  sub?: string; subTone?: "good" | "bad";
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: color + "12" }}>
      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: color + "22", color }}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-gray-500 leading-none">{label}</div>
        <div className="text-sm font-bold text-gray-800 tabular-nums mt-0.5 truncate">{value}</div>
        {sub && (
          <div className={`text-[10px] mt-0.5 ${subTone === "bad" ? "text-red-500" : subTone === "good" ? "text-finance" : "text-gray-400"}`}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

function BoolStat({ icon, color, label, done }: { icon: React.ReactNode; color: string; label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl p-2.5" style={{ backgroundColor: (done ? color : "#9ca3af") + "12" }}>
      <span
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: (done ? color : "#9ca3af") + "22", color: done ? color : "#9ca3af" }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-gray-500 leading-none">{label}</div>
        <div className="text-sm font-bold mt-0.5 flex items-center gap-1" style={{ color: done ? color : "#9ca3af" }}>
          {done ? <><Check size={13} strokeWidth={3} /> تمّ</> : <><Minus size={13} /> بعد</>}
        </div>
      </div>
    </div>
  );
}
