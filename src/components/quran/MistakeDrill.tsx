"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { EMPTY_HIFZ } from "@/lib/types";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";
import { textsInRange } from "@/lib/quran/text";
import { MISTAKE_MASTERY } from "@/lib/quran/hifz";
import { leadOnPage } from "@/lib/quran/portionPage";
import { LeadPrompt } from "@/components/quran/LeadPrompt";
import { MushafSheet } from "@/components/quran/MushafSheet";
import { tokenizeRun } from "@/lib/quran/mushafLayout";
import { Eye, Check, X, RotateCcw, ShieldCheck, Target } from "lucide-react";

// ===================== اختبار موضع الخطأ =====================
// كانت «جلسة أخطائي» تعرض الآية مكشوفةً وتحتها زرّ «أتقنته» — لا اختبار فيها.
// هنا يُطمَس الموضع الذي تعثّرتَ فيه (كلمةٌ بعينها أو الآية كلّها) وتُسأل عنه،
// ثمّ تكشف وتُقرّ بالنتيجة. النتيجة وحدها تُغلق الموضع: نجاحان متتاليان
// يُغلقانه تلقائياً، والخطأ يرفع عدّاد التكرار ويعيده لاختبار الغد.
export function MistakeDrill({
  mistakeId, ayahId, wordIndex, word, text, onDone,
}: {
  mistakeId: string;
  ayahId: number;
  wordIndex: number | null;
  word?: string;
  text: string[];
  onDone: (ok: boolean, closed: boolean) => void;
}) {
  const store = useAppStore();
  const h = store.quranHifz ?? EMPTY_HIFZ;
  const mistake = (h.mistakes ?? []).find((m) => m.id === mistakeId);
  const streak = Math.max(0, mistake?.okStreak ?? 0);
  const [revealed, setRevealed] = useState(false);

  const { surah, ayah } = idToSurahAyah(ayahId);
  const name = SURAHS[surah - 1]?.name ?? "";
  const full = textsInRange(text, ayahId, ayahId)[0]?.text ?? "";
  const words = full.split(/\s+/).filter(Boolean);
  const wholeAyah = wordIndex == null;

  // موضع الطمس: الكلمة المحدّدة إن طابق فهرسُها، وإلا مطابقةٌ نصّية احتياطية.
  const blankIdx = wholeAyah
    ? -1
    : words[wordIndex] === word || !word
    ? wordIndex
    : Math.max(0, words.indexOf(word));

  function answer(ok: boolean) {
    store.recordMistakeDrill(mistakeId, ok);
    onDone(ok, ok && streak + 1 >= MISTAKE_MASTERY);
  }

  return (
    <div className="hifz-drill-card max-w-lg mx-auto space-y-4">
      <div className="hifz-drill-heading flex items-center gap-2 flex-wrap">
        <Target size={16} className="text-amber-600" />
        <span className="text-base font-bold text-gray-800 dark:text-gray-100">اختبار موضع خطأ</span>
        <span className="text-[11px] text-quran font-semibold">{name} · آية {ayah}</span>
        {(mistake?.hits.length ?? 0) >= 2 && (
          <span className="text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-900/30 rounded-full px-2 py-0.5">
            تكرّر ×{mistake?.hits.length}
          </span>
        )}
      </div>

      <p className="hifz-drill-hint text-xs text-gray-500 leading-relaxed">
        {wholeAyah
          ? "هذه الآية التي قبلها — أكمِل بعدها من حفظك ثمّ اكشف للتحقّق."
          : "أكمل الموضع المطموس من حفظك ثمّ اكشف للتحقّق."}
      </p>

      {/* الآية كاملةً مطموسة بلا تلقين ليست اختباراً: رقمُ الآية وحده لا يدلّ
          عليها. والسياق على الوجه تلقينٌ في موضعه — فلا نعرض البطاقة إلا حين
          تبدأ الآيةُ الوجهَ فلا سابقةَ لها على الورقة. */}
      {wholeAyah && !revealed && leadOnPage(ayahId) == null && <LeadPrompt text={text} targetId={ayahId} />}

      {/* الموضع يُختبَر **في وجهه**: الطمس يقع على الصورة نفسها التي حفظتَ
          عليها، فيرتبط تذكّرُ الكلمة بمكانها من الوجه لا بصندوقٍ معزول. */}
      <MushafSheet
        text={text}
        fromId={ayahId}
        toId={ayahId}
        spotlightId={ayahId}
        context={wholeAyah && !revealed ? "shape" : "text"}
        leadId={leadOnPage(ayahId)}
        maxHeight={330}
        hidden={wholeAyah ? () => !revealed : undefined}
        className="hifz-mushaf-stage"
        // الطمس يقع على الكلمة في **سطرها** من الوجه: تبقى بعرضها تماماً وقد
        // ذهب حرفُها، فلا يتزحزح السطر ولا يفضح الفراغُ طولَ الكلمة.
        renderAyah={wholeAyah ? undefined : (_a, part) => (
          <>
            {tokenizeRun(part.text, part.wordOffset).map((t, k) => {
              if (t.index !== blankIdx) return <span key={k}>{t.text}</span>;
              return (
                <span
                  key={k}
                  className={revealed
                    ? "text-red-600 dark:text-red-400 bg-red-500/10 rounded"
                    : "text-transparent bg-gray-300/50 dark:bg-white/10 rounded"}
                >
                  {t.text}
                </span>
              );
            })}
          </>
        )}
      />

      {streak > 0 && (
        <p className="text-[11px] text-center text-emerald-700 dark:text-emerald-300">
          نجحتَ فيه {streak}× متتالية — نجاحٌ آخر يُغلق الموضع.
        </p>
      )}

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
        >
          <Eye size={16} /> اكشف للتحقّق
        </button>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => answer(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-quran text-white font-bold press shadow-sm"
          >
            {streak + 1 >= MISTAKE_MASTERY ? <ShieldCheck size={16} /> : <Check size={16} />} أصبتُه
          </button>
          <button
            onClick={() => answer(false)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 font-bold press"
          >
            <X size={16} /> أخطأتُ مجدّداً
          </button>
        </div>
      )}
    </div>
  );
}

// نسخةٌ مستقلّة تُفتح من لوحة «أخطائي» خارج جلسة اليوم — الشاشة نفسها بغلافٍ
// كامل وزرّ إغلاق.
export function MistakeDrillModal({
  mistakeId, ayahId, wordIndex, word, text, onClose,
}: {
  mistakeId: string;
  ayahId: number;
  wordIndex: number | null;
  word?: string;
  text: string[];
  onClose: () => void;
}) {
  const [result, setResult] = useState<{ ok: boolean; closed: boolean } | null>(null);

  return (
    <div className="hifz-drill-modal fixed inset-0 z-[70] bg-[#f4eee2] dark:bg-[#171009] flex flex-col" dir="rtl">
      <div className="hifz-drill-header flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-[#3a2e1e]">
        <div className="text-sm font-bold text-gray-800 dark:text-gray-100">اختبار موضع خطأ</div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 press" aria-label="إغلاق">
          <X size={20} />
        </button>
      </div>
      <div className="hifz-drill-body flex-1 overflow-y-auto px-4 pt-8 pb-6 max-w-lg w-full mx-auto">
        {result ? (
          <div className="text-center space-y-4 pt-6">
            <div className="w-16 h-16 mx-auto rounded-full bg-quran/10 flex items-center justify-center">
              {result.closed ? <ShieldCheck size={28} className="text-quran" /> : result.ok ? <Check size={28} className="text-quran" /> : <RotateCcw size={28} className="text-amber-600" />}
            </div>
            <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
              {result.closed
                ? "أُغلق الموضع — أتقنتَه"
                : result.ok
                ? "أحسنت — نجاحٌ آخر ويُغلق"
                : "سُجِّل التعثّر — نعيده عليك غداً"}
            </p>
            <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-quran text-white font-bold press">تمّ</button>
          </div>
        ) : (
          <MistakeDrill
            mistakeId={mistakeId}
            ayahId={ayahId}
            wordIndex={wordIndex}
            word={word}
            text={text}
            onDone={(ok, closed) => setResult({ ok, closed })}
          />
        )}
      </div>
    </div>
  );
}
