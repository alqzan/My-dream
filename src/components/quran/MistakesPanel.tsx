"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";
import { openMistakes, resolvedMistakes, mistakeStreak, MISTAKE_MASTERY } from "@/lib/quran/hifz";
import { loadAyahText, textsInRange } from "@/lib/quran/text";
import { loadMutashabihat, similarOf, type SimMap } from "@/lib/quran/mutashabihat";
import { MutashabihatCompare } from "@/components/quran/MutashabihatCompare";
import { MistakeDrillModal } from "@/components/quran/MistakeDrill";
import { AlertTriangle, Check, Trash2, GitCompareArrows, Target, RotateCcw, ChevronDown } from "lucide-react";
import { arNum } from "@/lib/madar/format";

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
// بالأكثر تكراراً. اللوحة عرضٌ لا مسارٌ موازٍ: مواضع اليوم تُختبَر داخل «جلسة
// اليوم»، وهنا ترى الصورة كاملةً وتختبر ما شئت متى شئت. «اختبرني» يطمس الموضع
// ويسألك عنه (لا يعرضه مكشوفاً)، والإغلاق يجيء من نتيجة الاختبار.
export function MistakesPanel() {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const items = openMistakes(h);
  const closed = resolvedMistakes(h);
  const [map, setMap] = useState<SimMap | null>(null);
  const [text, setText] = useState<string[] | null>(null);
  const [compareId, setCompareId] = useState<number | null>(null);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => { loadMutashabihat().then(setMap); }, []);
  useEffect(() => { loadAyahText().then(setText); }, []);
  // اللوحةُ تبقى ما دام ثمّة موضعٌ يُذكر — مفتوحاً كان أو مُتقناً يُفتح ثانية.
  if (items.length === 0 && closed.length === 0) return null;
  const calm = items.length === 0;

  const drill = drillId ? items.find((m) => m.id === drillId) ?? null : null;

  return (
    <div
      className={
        calm
          ? "rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 p-4 space-y-3"
          : "rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 space-y-3"
      }
    >
      <div className="flex items-center gap-2">
        {calm
          ? <Check size={15} className="text-emerald-600" />
          : <AlertTriangle size={15} className="text-red-500" />}
        <span className="text-sm font-bold text-gray-800">أخطائي</span>
        {!calm && (
          <span className="text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5">{items.length}</span>
        )}
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        {calm
          ? "لا موضعَ مفتوحاً الآن. ما أتقنتَه محفوظٌ أدناه — افتحه متى شككتَ فيه."
          : "مواضع تعثّرتَ فيها. «اختبرني» يطمس الموضع ويسألك عنه — ونجاحان متتاليان يُغلقانه تلقائياً. تظهر مواضع اليوم أيضاً ضمن جلسة اليوم."}
      </p>
      <div className="space-y-1.5">
        {items.map((m) => {
          const { surah, ayah } = idToSurahAyah(m.ayahId);
          const name = SURAHS[surah - 1]?.name ?? "";
          const repeats = m.hits.length;
          const lastHit = m.hits[m.hits.length - 1];
          const streak = mistakeStreak(m);
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
                    {name} · آية {arNum(ayah)}
                    {lastHit && <span className="mx-1">· آخر مرّة {lastHit}</span>}
                  </div>
                </div>
                {repeats >= 2 && (
                  <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5" title="عدد مرّات الخطأ">
                    تكرّر ×{arNum(repeats)}
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
                    onClick={() => setDrillId(m.id)}
                    disabled={!text}
                    className="p-1.5 rounded-lg text-quran hover:bg-quran/10 press disabled:opacity-40"
                    title="اختبرني على هذا الموضع"
                    aria-label="اختبرني"
                  >
                    <Target size={15} />
                  </button>
                  <button
                    onClick={() => store.resolveMistake(m.id)}
                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10 press"
                    title="أغلقه بلا اختبار"
                    aria-label="أغلقه"
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

              {/* تقدّمك في الاختبار — نجاحان متتاليان ثمّ يُغلق الموضع تلقائياً */}
              {streak > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  {Array.from({ length: MISTAKE_MASTERY }, (_, i) => (
                    <span key={i} className={`w-1.5 h-1.5 rounded-full ${i < streak ? "bg-emerald-500" : "bg-emerald-500/25"}`} />
                  ))}
                  نجحتَ فيه {arNum(streak)}× متتالية — نجاحٌ آخر يُغلقه.
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* المُتقَنة — «أغلقه بلا اختبار» ضغطةٌ بلا تأكيد، وكانت بلا رجعة: اللوحةُ
          لا تعرض إلا المفتوح، فالموضعُ المُغلق سهواً لا يُستعاد إلا بخطأٍ جديد
          فيه. `reopenMistake` كانت في المتجر بلا زرٍّ يبلغها. */}
      {closed.length > 0 && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-gray-700 press"
            aria-expanded={showClosed}
          >
            <ChevronDown size={13} className={showClosed ? "rotate-180 transition-transform" : "transition-transform"} />
            المُتقَنة ({arNum(closed.length)})
          </button>
          {showClosed && (
            <div className="space-y-1 mt-1.5">
              {closed.map((m) => {
                const { surah, ayah } = idToSurahAyah(m.ayahId);
                const name = SURAHS[surah - 1]?.name ?? "";
                return (
                  <div key={m.id} className="flex items-center gap-2 bg-white/70 dark:bg-white/5 rounded-lg px-2.5 py-1.5">
                    <span className="flex-1 min-w-0 text-[11px] text-gray-500 truncate">
                      {m.wordIndex == null
                        ? <span>الآية كاملة</span>
                        : <span className="font-quran text-gray-700 dark:text-gray-200">{m.word || "—"}</span>}
                      <span className="mx-1">· {name} · آية {arNum(ayah)}</span>
                    </span>
                    <button
                      onClick={() => store.reopenMistake(m.id)}
                      className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 rounded-lg px-1.5 py-1 press"
                      title="أعِدْه مفتوحاً"
                    >
                      <RotateCcw size={12} /> افتحه
                    </button>
                    <button
                      onClick={() => store.deleteMistake(m.id)}
                      className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-500 press"
                      title="حذف"
                      aria-label="حذف"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {compareId != null && <MutashabihatCompare baseIds={[compareId]} onClose={() => setCompareId(null)} />}
      {drill && text && (
        <MistakeDrillModal
          mistakeId={drill.id}
          ayahId={drill.ayahId}
          wordIndex={drill.wordIndex}
          word={drill.word}
          text={text}
          onClose={() => setDrillId(null)}
        />
      )}
    </div>
  );
}
