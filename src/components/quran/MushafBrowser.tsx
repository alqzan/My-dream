"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { SURAHS, juzRange, pageRange, idToSurahAyah, surahAyahToId, idToPage, idToJuz, TOTAL_JUZ, TOTAL_PAGES } from "@/lib/quran/meta";
import { clampPage } from "@/lib/quran/page";
import { PageReader } from "./PageReader";
import { KhatmaOrbit } from "./KhatmaOrbit";
import { loadAyahText } from "@/lib/quran/text";
import { normalizeArabic } from "@/lib/utils";
import { Search, ChevronLeft, BookmarkCheck } from "lucide-react";

// علامة «تابع من حيث توقفت» (محلّية بالجهاز): تحفظ السورة *والآية* لا السورة
// وحدها. صيغةٌ قديمة كانت رقم السورة فقط → تُرقّى إلى الآية الأولى.
const LAST_KEY = "madar-mushaf-last";
interface LastRead { surah: number; ayah: number }
function readLast(): LastRead | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(LAST_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && v.surah >= 1 && v.surah <= 114) {
      return { surah: v.surah, ayah: Math.max(1, v.ayah || 1) };
    }
  } catch { /* رقمٌ قديم */ }
  const n = Number(raw);
  return n >= 1 && n <= 114 ? { surah: n, ayah: 1 } : null;
}
function writeLast(l: LastRead) {
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

// تجريدٌ خاصّ بالرسم القرآني: يزيل كلّ علامات الضبط والوقف (لا يكفي
// normalizeArabic الذي يقف عند 0x0652) ليعمل البحث في نصّ الآيات بما يكتبه
// المستخدم دون تشكيل.
function normQuran(s: string): string {
  return (s || "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

type ListMode = "surah" | "juz" | "search";

// المصحف — كل القرآن داخل القسم: تصفّحٌ بالسور أو الأجزاء أو الصفحة، وبحثٌ في
// نصّ الآيات، وقارئٌ يعرض آيات أي سورة بالرسم العثماني مع قائمة إجراءاتٍ لكلّ آية
// (علامة/متابعة، تأمّل، نسخ، تسميع). البسملة تُعرض كترويسةٍ للسور عدا الفاتحة
// (آيتها الأولى) والتوبة (بلا بسملة).
export function MushafBrowser({ initialSurah, onReflect }: { initialSurah?: number | null; onReflect?: (surah: number, ayah: number) => void }) {
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);
  const [open, setOpen] = useState<{ surah: number; ayah: number } | null>(null); // السورة (والآية) المفتوحة
  const [mode, setMode] = useState<ListMode>("surah");
  const [query, setQuery] = useState("");
  const [pageInput, setPageInput] = useState("");
  const [last, setLast] = useState<LastRead | null>(null);
  useEffect(() => { setLast(readLast()); }, []);

  // فتح سورةٍ عند آية (افتراضياً الأولى) وحفظ العلامة المحلّية.
  function openAt(surah: number, ayah = 1) {
    setOpen({ surah, ayah });
    const l = { surah, ayah };
    setLast(l);
    writeLast(l);
  }
  const openId = (id: number) => { const { surah, ayah } = idToSurahAyah(id); openAt(surah, ayah); };

  // تحديث علامة «تابع من حيث توقفت» دون تبديل الشاشة (من قائمة إجراءات الآية).
  function markResume(surah: number, ayah: number) {
    const l = { surah, ayah };
    setLast(l);
    writeLast(l);
  }

  // فتح سورة مطلوبة من خارج القسم (مثل «اقرأ في المصحف» من خريطة الحفظ).
  useEffect(() => { if (initialSurah) openAt(initialSurah, 1); }, [initialSurah]); // eslint-disable-line react-hooks/exhaustive-deps

  const surahMatches = useMemo(() => {
    const q = normalizeArabic(query.trim());
    if (!q) return SURAHS;
    return SURAHS.filter((s) => normalizeArabic(s.name).includes(q) || String(s.num) === q);
  }, [query]);

  // بحثٌ في نصّ الآيات (مُجرَّدٌ من التشكيل). نصّ مُطبَّع محسوبٌ مرّة.
  const normText = useMemo(() => (text ? text.map(normQuran) : null), [text]);
  const ayahMatches = useMemo(() => {
    const q = normQuran(query.trim());
    if (!normText || q.length < 2) return [];
    const out: { id: number; surah: number; ayah: number; text: string }[] = [];
    for (let id = 1; id < normText.length && out.length < 40; id++) {
      if (normText[id].includes(q)) {
        const { surah, ayah } = idToSurahAyah(id);
        out.push({ id, surah, ayah, text: text![id] ?? "" });
      }
    }
    return out;
  }, [normText, text, query]);

  function goToPage() {
    const p = parseInt(pageInput);
    if (!p || p < 1 || p > TOTAL_PAGES) return;
    openId(pageRange(Math.min(p, TOTAL_PAGES)).start);
    setPageInput("");
  }

  if (open != null) {
    // القراءة صفحةً صفحة هي الأصل: نفتح صفحة الآية المطلوبة لا قائمةَ آيات
    // السورة. `markResume` يبقى مصدر علامة «تابع من حيث توقفت».
    return (
      <PageReader
        page={clampPage(idToPage(surahAyahToId(open.surah, open.ayah)))}
        text={text}
        onPage={(p) => { const { surah, ayah } = idToSurahAyah(pageStartId(p)); openAt(surah, ayah); }}
        onBack={() => setOpen(null)}
        onReflect={onReflect}
        onResume={markResume}
      />
    );
  }

  return (
    <div className="mushaf-index space-y-4">
      <div className="mushaf-index-intro">
        <div className="min-w-0">
          <span className="mushaf-index-eyebrow">المصحف الشريف</span>
          <h2 className="mushaf-index-title">استعراض المصحف</h2>
          <p className="mushaf-index-copy">اقرأ بهدوء، وتابع من آخر موضع وقفت عنده.</p>
        </div>
        <div className="mushaf-index-count" aria-label="عدد صفحات المصحف">
          <strong>604</strong>
          <span>وجهًا</span>
        </div>
      </div>

      {/* تابع من حيث توقفت — السورة والآية (والصفحة) */}
      {last && (
        <button
          onClick={() => openAt(last.surah, last.ayah)}
          className="w-full flex items-center gap-2 bg-quran/10 hover:bg-quran/20 border border-quran/20 rounded-xl p-2.5 press text-right"
        >
          <BookmarkCheck size={16} className="text-quran shrink-0" />
          <span className="text-sm font-bold text-quran flex-1">تابع من حيث توقفت</span>
          <span className="text-xs text-gray-500">
            {SURAHS[last.surah - 1]?.name} · آية {last.ayah} · ص {idToPage(surahAyahToId(last.surah, last.ayah))}
          </span>
          <ChevronLeft size={15} className="text-quran/60" />
        </button>
      )}

      <KhatmaOrbit />

      {/* مبدّل طريقة التصفّح */}
      <div className="mushaf-index-tabs flex gap-1 p-1 rounded-xl bg-quran/[0.07]">
        {([["surah", "السور"], ["juz", "الأجزاء"], ["search", "بحث الآيات"]] as [ListMode, string][]).map(([m, label]) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 text-xs font-bold py-1.5 rounded-lg press transition-colors ${mode === m ? "bg-quran text-white shadow-sm" : "text-quran/80 hover:bg-quran/10"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* اذهب إلى صفحة (١–٦٠٤) — متاحٌ دائماً. الحقل يمتدّ على ما تبقّى من
          السطر: صفٌّ قصيرٌ يترك نصف العرض فارغاً كان يكسر توازن الشريطين
          فوقه وتحته (وكلاهما بعرضٍ كامل). */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">اذهب إلى صفحة</span>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && goToPage()}
          inputMode="numeric"
          placeholder="١–٦٠٤"
          aria-label="اذهب إلى صفحة"
          className="flex-1 min-w-0 text-sm text-center border border-gray-200 dark:border-transparent rounded-lg px-2 py-1.5 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
        />
        <button onClick={goToPage} disabled={!pageInput} className="shrink-0 text-xs font-bold text-white bg-quran rounded-lg px-3.5 py-2 press disabled:opacity-40">اذهب</button>
      </div>

      {mode === "juz" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1).map((j) => {
            const { start } = juzRange(j);
            const { surah, ayah } = idToSurahAyah(start);
            return (
              <button
                key={j}
                onClick={() => openId(start)}
                className="flex flex-col items-center bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-2 press hover:border-quran/40"
              >
                <span className="text-sm font-bold text-quran">الجزء {j}</span>
                <span className="text-[10px] text-gray-400 truncate max-w-full">{SURAHS[surah - 1]?.name} {ayah}</span>
              </button>
            );
          })}
        </div>
      ) : mode === "search" ? (
        <>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في نصّ الآيات… (بلا تشكيل)"
              className="w-full text-sm border border-gray-200 rounded-xl ps-9 pe-3 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
            />
          </div>
          {query.trim().length < 2 ? (
            <p className="text-xs text-gray-400 text-center py-6">اكتب كلمةً أو أكثر للبحث في نصّ القرآن.</p>
          ) : !text ? (
            <p className="text-xs text-gray-400 text-center py-6">…جارٍ تحميل المصحف</p>
          ) : ayahMatches.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">لا آية تطابق «{query.trim()}».</p>
          ) : (
            <div className="space-y-1.5">
              {ayahMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openId(m.id)}
                  className="w-full text-right bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-2.5 press hover:border-quran/40"
                >
                  <div className="text-[11px] font-bold text-quran mb-0.5">{SURAHS[m.surah - 1]?.name} · آية {m.ayah}</div>
                  <div className="font-quran text-[15px] text-gray-700 dark:text-gray-200 line-clamp-2 leading-loose">{m.text}</div>
                </button>
              ))}
              {ayahMatches.length === 40 && <p className="text-[10px] text-gray-300 text-center">أوّل 40 نتيجة — دقّق البحث لنتائج أقل.</p>}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="relative">
            <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن سورة…"
              className="w-full text-sm border border-gray-200 rounded-xl ps-9 pe-3 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
            />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {surahMatches.map((s) => (
              <button
                key={s.num}
                onClick={() => openAt(s.num, 1)}
                className="flex items-center gap-3 bg-white dark:bg-[#241c12] rounded-xl border border-gray-100 p-2.5 press hover:border-quran/40 text-right"
              >
                <span className="w-9 h-9 shrink-0 rounded-lg bg-quran/10 text-quran flex items-center justify-center text-sm font-bold tabular-nums">
                  {s.num}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800 truncate">{s.name}</div>
                  <div className="text-[11px] text-gray-400">{s.meccan ? "مكية" : "مدنية"} · {s.ayat} آية · جزء {idToJuz(s.first)}</div>
                </div>
                <ChevronLeft size={16} className="text-gray-300 shrink-0" />
              </button>
            ))}
            {surahMatches.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">لا سورة بهذا الاسم.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}


// معرّف أوّل آيةٍ في صفحة — يجعل التنقّل بين الصفحات يحدّث العلامة بآيةٍ
// حقيقية بدل أن يخمّن رقم سورة. (pageRange مصدرها meta، بلا نسخةٍ هنا.)
function pageStartId(page: number): number {
  return pageRange(clampPage(page)).start;
}
