"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { uid, today, parseDate, formatDate } from "@/lib/utils";
import { REVIEW_INTERVALS } from "@/lib/types";
import { SURAH_NAMES } from "@/lib/surahNames";
import { NumberInput } from "@/components/ui/NumberInput";
import { Plus, Trash2, Check, RefreshCw, BookMarked, CalendarClock } from "lucide-react";

// الحفظ: تتبّع المحفوظ + مراجعة بتكرار متباعد. العناصر المستحقّة اليوم
// (nextReview ≤ اليوم) تظهر في «مراجعة اليوم» بزرّي «تذكّرتها» / «أحتاج مراجعة»
// اللذين يقدّمان الجدولة أو يعيدانها. القائمة الكاملة أسفلها مع موعد كلٍّ.
export function MemorizationSection() {
  const { quranMemorized, addMemorization, deleteMemorization, reviewMemorization } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [label, setLabel] = useState("");
  const [fromAyah, setFromAyah] = useState("");
  const [toAyah, setToAyah] = useState("");
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  const todayStr = today();
  const due = quranMemorized
    .filter((m) => m.nextReview <= todayStr)
    .sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));
  const sorted = [...quranMemorized].sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));

  function save() {
    const name = label.trim();
    if (!name) return;
    const from = parseInt(fromAyah) || undefined;
    const to = parseInt(toAyah) || undefined;
    addMemorization({
      id: uid(),
      label: name,
      fromAyah: from,
      toAyah: to,
      memorizedDate: todayStr,
      reviewStage: 0,
      // أوّل مراجعة غداً (أوّل فاصلٍ في الجدولة).
      nextReview: nextFromToday(REVIEW_INTERVALS[0]),
    });
    setLabel(""); setFromAyah(""); setToAyah(""); setShowAdd(false);
  }

  function rangeText(m: { fromAyah?: number; toAyah?: number }): string {
    if (m.fromAyah && m.toAyah) return ` (${m.fromAyah}–${m.toAyah})`;
    if (m.fromAyah) return ` (من ${m.fromAyah})`;
    return "";
  }

  function dueLabel(nextReview: string): string {
    if (nextReview < todayStr) return "متأخّرة";
    if (nextReview === todayStr) return "اليوم";
    return formatDate(nextReview);
  }

  return (
    <div className="space-y-4">
      {/* مراجعة اليوم */}
      {due.length > 0 && (
        <div className="rounded-2xl border border-quran/25 bg-quran/[0.06] p-4">
          <div className="flex items-center gap-2 mb-3">
            <RefreshCw size={15} className="text-quran" />
            <span className="text-sm font-bold text-gray-800">مراجعة اليوم</span>
            <span className="text-[11px] font-bold text-white bg-quran rounded-full px-2 py-0.5">{due.length}</span>
          </div>
          <div className="space-y-2">
            {due.map((m) => (
              <div key={m.id} className="bg-white dark:bg-[#241c12] rounded-xl border border-quran/15 p-3">
                <div className="text-sm font-semibold text-gray-800 mb-2">
                  {m.label}
                  <span className="text-gray-400 font-normal">{rangeText(m)}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => reviewMemorization(m.id, true)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-quran rounded-lg py-2 press"
                  >
                    <Check size={14} /> تذكّرتها
                  </button>
                  <button
                    onClick={() => reviewMemorization(m.id, false)}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-quran bg-quran/10 hover:bg-quran/20 rounded-lg py-2 press"
                  >
                    <RefreshCw size={13} /> أحتاج مراجعة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* رأس القائمة + زر الإضافة */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookMarked size={16} className="text-quran" />
          <span className="text-sm font-semibold text-gray-700">محفوظاتي</span>
          {quranMemorized.length > 0 && (
            <span className="text-[11px] text-gray-400">({quranMemorized.length})</span>
          )}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1 text-xs font-bold text-quran bg-quran/10 hover:bg-quran/20 rounded-full px-3 py-1 press"
        >
          <Plus size={14} /> أضف محفوظاً
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 dark:bg-[#2c2318] rounded-xl p-3 space-y-2.5 animate-fade-up">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            list="surah-names"
            placeholder="اسم السورة أو المقطع (مثل: الملك)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-quran/40"
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
          <datalist id="surah-names">
            {SURAH_NAMES.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="flex gap-2 items-center">
            <span className="text-[11px] text-gray-400 shrink-0">الآيات (اختياري):</span>
            <NumberInput
              value={fromAyah}
              onChange={setFromAyah}
              inputMode="numeric"
              placeholder="من"
              className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40"
            />
            <span className="text-gray-300">–</span>
            <NumberInput
              value={toAyah}
              onChange={setToAyah}
              inputMode="numeric"
              placeholder="إلى"
              className="w-16 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-quran/40"
            />
            <button
              onClick={save}
              disabled={!label.trim()}
              className="ms-auto bg-quran text-white text-sm px-4 py-1.5 rounded-lg press disabled:opacity-40"
            >
              حفظ
            </button>
          </div>
        </div>
      )}

      {/* القائمة الكاملة */}
      {quranMemorized.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">لم تُضِف محفوظاً بعد. أضف أول سورة أو مقطع تحفظه لتبدأ متابعة مراجعته.</p>
      ) : (
        <div className="space-y-2">
          {sorted.map((m) => {
            const overdue = m.nextReview < todayStr;
            const dueToday = m.nextReview === todayStr;
            return (
              <div key={m.id} className="flex items-center gap-3 bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">
                    {m.label}
                    <span className="text-gray-400 font-normal">{rangeText(m)}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-[11px]">
                    <CalendarClock size={11} className={overdue ? "text-red-400" : dueToday ? "text-quran" : "text-gray-400"} />
                    <span className={overdue ? "text-red-500 font-medium" : dueToday ? "text-quran font-medium" : "text-gray-400"}>
                      مراجعة: {dueLabel(m.nextReview)}
                    </span>
                    <span className="text-gray-300 mx-1">·</span>
                    <span className="text-gray-400">مرتبة {m.reviewStage + 1}</span>
                  </div>
                </div>
                {confirmDel === m.id ? (
                  <span className="flex items-center gap-1.5 text-[11px] shrink-0">
                    <button onClick={() => { deleteMemorization(m.id); setConfirmDel(null); }} className="text-red-500 font-semibold press">حذف</button>
                    <button onClick={() => setConfirmDel(null)} className="text-gray-400 press">إلغاء</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDel(m.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 press shrink-0"
                    aria-label={`حذف ${m.label}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// تاريخ بعد n يوماً من اليوم (مفاتيح محلية YYYY-MM-DD).
function nextFromToday(n: number): string {
  const d = parseDate(today());
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
