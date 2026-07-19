"use client";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";
import { openMistakes, type Portion } from "@/lib/quran/hifz";
import { AlertTriangle, Check, Trash2, RefreshCw } from "lucide-react";

// لوحة «أخطائي» — مواضع الأخطاء المفتوحة التي حُدّدت أثناء المراجعة، مرتّبةً
// بالأكثر تكراراً. لكلّ موضعٍ: مكانه (سورة/آية + الكلمة)، عدّاد التكرار، وأزرار
// «راجِع» (يفتح التسميع على تلك الآية) و«أتقنته» (يُغلقه) و«حذف». تختفي إن لا أخطاء.
export function MistakesPanel({ onReview }: { onReview: (p: Portion) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const items = openMistakes(h);
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-red-500" />
        <span className="text-sm font-bold text-gray-800">أخطائي</span>
        <span className="text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        مواضع أخطأتَ فيها أثناء المراجعة. راجِعها حتى تُتقنها، وكلّما تكرّر الخطأ في موضعٍ ارتفع عدّاده — فتعرف ما يحتاج تركيزاً.
      </p>
      <div className="space-y-1.5">
        {items.map((m) => {
          const { surah, ayah } = idToSurahAyah(m.ayahId);
          const name = SURAHS[surah - 1]?.name ?? "";
          const repeats = m.hits.length;
          return (
            <div key={m.id} className="flex items-center gap-2 bg-white dark:bg-[#241c12] rounded-xl border border-red-100 dark:border-red-900/30 p-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-bold text-gray-800 truncate">
                  {m.wordIndex == null ? (
                    <span className="text-gray-500">الآية كاملة</span>
                  ) : (
                    <span className="font-quran text-red-600 dark:text-red-400">{m.word || "—"}</span>
                  )}
                </div>
                <div className="text-[11px] text-gray-400">{name} · آية {ayah}</div>
              </div>
              {repeats >= 2 && (
                <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5" title="عدد مرّات الخطأ">
                  تكرّر ×{repeats}
                </span>
              )}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onReview({ fromId: m.ayahId, toId: m.ayahId })}
                  className="p-1.5 rounded-lg text-quran hover:bg-quran/10 press"
                  title="راجِع هذه الآية"
                  aria-label="راجِع"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  onClick={() => store.resolveMistake(m.id)}
                  className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 press"
                  title="أتقنته"
                  aria-label="أتقنته"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => store.deleteMistake(m.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-500/10 press"
                  title="حذف"
                  aria-label="حذف"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
