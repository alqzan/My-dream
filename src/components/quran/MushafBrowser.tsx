"use client";
import { useState, useEffect, useMemo } from "react";
import { SURAHS } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { normalizeArabic } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

// المصحف — كل القرآن داخل القسم: قائمة السور الـ114 بأعداد آياتها، وقارئٌ يعرض
// آيات أي سورة كاملة بالرسم العثماني (من بيانات المصحف المحلية). البسملة تُعرض
// كترويسةٍ للسور عدا الفاتحة (آيتها الأولى) والتوبة (بلا بسملة).
export function MushafBrowser() {
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);
  const [open, setOpen] = useState<number | null>(null); // رقم السورة المفتوحة
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalizeArabic(query.trim());
    if (!q) return SURAHS;
    return SURAHS.filter((s) => normalizeArabic(s.name).includes(q) || String(s.num) === q);
  }, [query]);

  if (open != null) {
    return <SurahReader surahNum={open} text={text} onBack={() => setOpen(null)} onNav={setOpen} />;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث عن سورة…"
          className="w-full text-sm border border-gray-200 rounded-xl ps-3 pe-9 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
        />
      </div>

      <div className="grid grid-cols-1 gap-1.5">
        {filtered.map((s) => (
          <button
            key={s.num}
            onClick={() => setOpen(s.num)}
            className="flex items-center gap-3 bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-2.5 press hover:border-quran/40 text-right"
          >
            <span className="w-9 h-9 shrink-0 rounded-lg bg-quran/10 text-quran flex items-center justify-center text-sm font-bold tabular-nums">
              {s.num}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-gray-800 truncate">{s.name}</div>
              <div className="text-[11px] text-gray-400">{s.meccan ? "مكية" : "مدنية"} · {s.ayat} آية</div>
            </div>
            <ChevronLeft size={16} className="text-gray-300 shrink-0" />
          </button>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">لا سورة بهذا الاسم.</p>
        )}
      </div>
    </div>
  );
}

function SurahReader({
  surahNum, text, onBack, onNav,
}: {
  surahNum: number; text: string[] | null; onBack: () => void; onNav: (n: number) => void;
}) {
  const s = SURAHS[surahNum - 1];
  const showBasmala = surahNum !== 1 && surahNum !== 9;
  const basmala = text?.[1] ?? "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

  const ayat: { n: number; text: string }[] = [];
  if (text) for (let a = 1; a <= s.ayat; a++) ayat.push({ n: a, text: text[s.first + (a - 1)] ?? "" });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-quran font-semibold press">
          <ChevronRight size={15} /> السور
        </button>
        <div className="text-center">
          <div className="text-base font-bold text-gray-800">{s.name}</div>
          <div className="text-[11px] text-gray-400">{s.meccan ? "مكية" : "مدنية"} · {s.ayat} آية</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onNav(surahNum - 1)}
            disabled={surahNum <= 1}
            className="p-1.5 rounded-lg text-gray-400 hover:text-quran hover:bg-quran/10 press disabled:opacity-30"
            aria-label="السورة السابقة"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => onNav(surahNum + 1)}
            disabled={surahNum >= 114}
            className="p-1.5 rounded-lg text-gray-400 hover:text-quran hover:bg-quran/10 press disabled:opacity-30"
            aria-label="السورة التالية"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-quran/15 bg-gradient-to-b from-quran/[0.04] to-transparent p-4">
        {showBasmala && (
          <p className="font-quran text-center text-[19px] font-bold text-quran mb-4 pb-3 border-b border-quran/10">{basmala}</p>
        )}
        {!text ? (
          <p className="text-sm text-gray-400 text-center py-8">…جارٍ تحميل المصحف</p>
        ) : (
          <p className="font-quran text-justify leading-[2.6] text-[22px] font-bold text-gray-800 dark:text-gray-100" dir="rtl">
            {ayat.map((v) => (
              <span key={v.n}>
                {v.text}
                <span className="inline-flex items-center justify-center text-[13px] text-quran mx-1 align-middle">
                  ﴿{v.n}﴾
                </span>
              </span>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}
