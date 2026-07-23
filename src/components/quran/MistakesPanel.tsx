"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";
import { openMistakes, mistakeRecallSuccesses, MISTAKE_MASTERY_SUGGEST, type Portion } from "@/lib/quran/hifz";
import { loadAyahText, textsInRange } from "@/lib/quran/text";
import { loadMutashabihat, similarOf, type SimMap } from "@/lib/quran/mutashabihat";
import { MutashabihatCompare } from "@/components/quran/MutashabihatCompare";
import { AlertTriangle, Check, Trash2, RefreshCw, GitCompareArrows, ShieldCheck } from "lucide-react";

// الآية مع تظليل كلمة الخطأ في موضعها (سياقٌ قبلها وبعدها). عند غياب الكلمة أو
// تعذّر مطابقتها نصياً نعرض الآية كاملةً — تبقى سياقاً كافياً.
function AyahContext({ text, ayahId, word }: { text: string[] | null; ayahId: number; word?: string }) {
  if (!text) return null;
  const full = textsInRange(text, ayahId, ayahId)[0]?.text ?? "";
  if (!full) return null;
  const i = word ? full.indexOf(word) : -1;
  return (
    <p className="font-quran text-[15px] leading-[2.1] text-gray-600 dark:text-gray-300 mt-1" dir="rtl">
      {i < 0 || !word ? full : (
        <>
          {full.slice(0, i)}
          <span className="text-red-600 dark:text-red-400 font-bold bg-red-500/10 rounded px-0.5">{word}</span>
          {full.slice(i + word.length)}
        </>
      )}
    </p>
  );
}

// لوحة «أخطائي» — مواضع الأخطاء المفتوحة التي حُدّدت أثناء المراجعة، مرتّبةً
// بالأكثر تكراراً. لكلّ موضعٍ: مكانه (سورة/آية + الكلمة)، عدّاد التكرار، وأزرار
// «راجِع» (يفتح التسميع على تلك الآية) و«أتقنته» (يُغلقه) و«حذف». تختفي إن لا أخطاء.
export function MistakesPanel({ onReview }: { onReview: (p: Portion) => void }) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const items = openMistakes(h);
  const [map, setMap] = useState<SimMap | null>(null);
  const [text, setText] = useState<string[] | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  useEffect(() => { loadMutashabihat().then(setMap); }, []);
  useEffect(() => { loadAyahText().then(setText); }, []);
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
          const lastHit = m.hits[m.hits.length - 1];
          const successes = mistakeRecallSuccesses(h, m);
          const suggestClose = successes >= MISTAKE_MASTERY_SUGGEST;
          return (
            <div key={m.id} className="bg-white dark:bg-[#241c12] rounded-xl border border-red-100 dark:border-red-900/30 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-gray-800 truncate">
                    {m.wordIndex == null ? (
                      <span className="text-gray-500">الآية كاملة</span>
                    ) : (
                      <span className="font-quran text-red-600 dark:text-red-400">{m.word || "—"}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400">
                    {name} · آية {ayah}
                    {lastHit && <span className="mx-1">· آخر مرّة {lastHit}</span>}
                  </div>
                </div>
                {repeats >= 2 && (
                  <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5" title="عدد مرّات الخطأ">
                    تكرّر ×{repeats}
                  </span>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {similarOf(map, m.ayahId).length > 0 && (
                    <button
                      onClick={() => setCompareId(m.ayahId)}
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-500/10 press"
                      title="قارن المتشابهات"
                      aria-label="قارن المتشابهات"
                    >
                      <GitCompareArrows size={15} />
                    </button>
                  )}
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

              {/* سياق الآية مع تظليل موضع الخطأ */}
              <AyahContext text={text} ayahId={m.ayahId} word={m.wordIndex == null ? undefined : m.word} />

              {/* اقتراح الإغلاق التلقائي بعد تسميعٍ ناجحٍ متكرّر (بلا حذف التاريخ) */}
              {suggestClose && (
                <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/15 rounded-lg px-2.5 py-1.5">
                  <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex-1">
                    سمّعتَه بنجاح {successes}× بعد آخر خطأ — أغلِقه؟
                  </span>
                  <button
                    onClick={() => store.resolveMistake(m.id)}
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 rounded-lg px-2.5 py-1 press"
                  >
                    <ShieldCheck size={13} /> أغلقه
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {compareId != null && <MutashabihatCompare baseIds={[compareId]} onClose={() => setCompareId(null)} />}
    </div>
  );
}
