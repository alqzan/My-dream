"use client";
import { useEffect, useState } from "react";
import { idToSurahAyah, SURAHS } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { loadMutashabihat, similarOf, wordDiff, type SimMap, type DiffWord } from "@/lib/quran/mutashabihat";
import { X, GitCompareArrows } from "lucide-react";

function locOf(id: number): string {
  const { surah, ayah } = idToSurahAyah(id);
  return `${SURAHS[surah - 1]?.name ?? ""} · ${ayah}`;
}

// شاشة مقارنة المتشابهات — لكلّ آيةٍ في القائمة نعرضها ثمّ نظائرها، مع إبراز
// الكلمات المختلفة عن الآية الأساس بالأصفر، فيرى الحافظ مواطن الالتباس بدقّة.
export function MutashabihatCompare({ baseIds, onClose }: { baseIds: number[]; onClose: () => void }) {
  const [text, setText] = useState<string[] | null>(null);
  const [map, setMap] = useState<SimMap | null>(null);
  useEffect(() => { loadAyahText().then(setText); loadMutashabihat().then(setMap); }, []);

  return (
    <div className="fixed inset-0 z-[80] bg-[#f4eee2] dark:bg-[#171009] flex flex-col">
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-gray-100 dark:border-[#3a2e1e]">
        <div className="flex items-center gap-2">
          <GitCompareArrows size={17} className="text-amber-600" />
          <div className="text-sm font-bold text-gray-800">مقارنة المتشابهات</div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 press" aria-label="إغلاق"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-8 max-w-lg w-full mx-auto space-y-5">
        <p className="text-[11px] text-gray-500 leading-relaxed text-center">
          الكلمات المختلفة عن الآية الأساس مميّزةٌ بالأصفر — تأمّلها لتثبّت الفرق ولا تلتبس عليك.
        </p>
        {!text || !map ? (
          <p className="text-xs text-gray-400 text-center py-8">…جارٍ التحميل</p>
        ) : (
          baseIds.map((baseId) => {
            const sims = similarOf(map, baseId);
            if (!sims.length) return null;
            return (
              <div key={baseId} className="space-y-2.5">
                <div className="rounded-xl border border-quran/25 bg-quran/[0.06] p-3.5">
                  <div className="text-[11px] font-bold text-quran mb-1.5">الآية الأساس — {locOf(baseId)}</div>
                  <p className="font-quran text-[19px] leading-[2.4] font-bold text-gray-800 dark:text-gray-100 text-center" dir="rtl">
                    {text[baseId]}
                  </p>
                </div>
                <div className="text-[11px] text-gray-400 text-center">نظائرها ({sims.length}):</div>
                {sims.map((simId) => {
                  const { b } = wordDiff(text[baseId] ?? "", text[simId] ?? "");
                  return (
                    <div key={simId} className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-900/10 p-3.5">
                      <div className="text-[11px] font-bold text-amber-700 mb-1.5">{locOf(simId)}</div>
                      <DiffText words={b} />
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function DiffText({ words }: { words: DiffWord[] }) {
  return (
    <p className="font-quran text-[19px] leading-[2.4] font-bold text-gray-800 dark:text-gray-100 text-center" dir="rtl">
      {words.map((w, i) => (
        <span
          key={i}
          className={w.same ? undefined : "bg-amber-300/70 dark:bg-amber-500/40 rounded px-0.5 text-amber-900 dark:text-amber-100"}
        >
          {w.text}{" "}
        </span>
      ))}
    </p>
  );
}
