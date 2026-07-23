"use client";
import { useState, useEffect, useMemo } from "react";
import { SURAHS } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { normalizeArabic } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, BookmarkCheck, Settings2, Minus, Plus, Focus, X } from "lucide-react";

// آخر سورةٍ فُتحت (علامةٌ محلّية بالجهاز — «تابع من حيث توقفت»).
const LAST_KEY = "madar-mushaf-last";
function readLast(): number | null {
  if (typeof window === "undefined") return null;
  const n = Number(window.localStorage.getItem(LAST_KEY));
  return n >= 1 && n <= 114 ? n : null;
}

// المصحف — كل القرآن داخل القسم: قائمة السور الـ114 بأعداد آياتها، وقارئٌ يعرض
// آيات أي سورة كاملة بالرسم العثماني (من بيانات المصحف المحلية). البسملة تُعرض
// كترويسةٍ للسور عدا الفاتحة (آيتها الأولى) والتوبة (بلا بسملة).
export function MushafBrowser({ initialSurah }: { initialSurah?: number | null }) {
  const [text, setText] = useState<string[] | null>(null);
  useEffect(() => { loadAyahText().then(setText); }, []);
  const [open, setOpen] = useState<number | null>(null); // رقم السورة المفتوحة
  const [query, setQuery] = useState("");
  const [last, setLast] = useState<number | null>(null);
  useEffect(() => { setLast(readLast()); }, []);

  // فتح سورةٍ يحفظ العلامة المحلّية ليُتابَع منها لاحقاً.
  function openSurah(n: number) {
    setOpen(n);
    setLast(n);
    try { window.localStorage.setItem(LAST_KEY, String(n)); } catch { /* ignore */ }
  }

  // فتح سورة مطلوبة من خارج القسم (مثل «اقرأ في المصحف» من خريطة الحفظ).
  useEffect(() => { if (initialSurah) openSurah(initialSurah); }, [initialSurah]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = normalizeArabic(query.trim());
    if (!q) return SURAHS;
    return SURAHS.filter((s) => normalizeArabic(s.name).includes(q) || String(s.num) === q);
  }, [query]);

  if (open != null) {
    return <SurahReader surahNum={open} text={text} onBack={() => setOpen(null)} onNav={openSurah} />;
  }

  return (
    <div className="space-y-3">
      {/* تابع من حيث توقفت */}
      {last && (
        <button
          onClick={() => openSurah(last)}
          className="w-full flex items-center gap-2 bg-quran/10 hover:bg-quran/20 border border-quran/20 rounded-xl p-2.5 press text-right"
        >
          <BookmarkCheck size={16} className="text-quran shrink-0" />
          <span className="text-sm font-bold text-quran flex-1">تابع من حيث توقفت</span>
          <span className="text-xs text-gray-500">{SURAHS[last - 1]?.name}</span>
          <ChevronLeft size={15} className="text-quran/60" />
        </button>
      )}

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
            onClick={() => openSurah(s.num)}
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

// إعدادات القراءة (تفضيلٌ محلّي بالجهاز): حجم النصّ وتباعد الأسطر.
const READ_KEY = "madar-mushaf-read";
function readReadSettings(): { size: number; lh: number } {
  if (typeof window === "undefined") return { size: 22, lh: 2.6 };
  try {
    const r = JSON.parse(window.localStorage.getItem(READ_KEY) || "null");
    if (r && typeof r.size === "number" && typeof r.lh === "number") return r;
  } catch { /* ignore */ }
  return { size: 22, lh: 2.6 };
}

function SurahReader({
  surahNum, text, onBack, onNav,
}: {
  surahNum: number; text: string[] | null; onBack: () => void; onNav: (n: number) => void;
}) {
  const s = SURAHS[surahNum - 1];
  const showBasmala = surahNum !== 1 && surahNum !== 9;
  const basmala = text?.[1] ?? "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

  const [rs, setRs] = useState(readReadSettings);
  const [focus, setFocus] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const save = (next: { size: number; lh: number }) => {
    setRs(next);
    try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  // Wake Lock أثناء القراءة — بكشف الميزة فقط (يتعطّل بهدوء إن لم تُدعَم).
  useEffect(() => {
    let lock: { release?: () => void } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request?: (t: string) => Promise<{ release?: () => void }> } }).wakeLock;
    if (wl?.request) wl.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { try { lock?.release?.(); } catch { /* ignore */ } };
  }, []);

  const ayat: { n: number; text: string }[] = [];
  if (text) for (let a = 1; a <= s.ayat; a++) ayat.push({ n: a, text: text[s.first + (a - 1)] ?? "" });

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between ${focus ? "hidden" : ""}`}>
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
          <button
            onClick={() => setShowTools((v) => !v)}
            className={`p-1.5 rounded-lg press ${showTools ? "text-quran bg-quran/10" : "text-gray-400 hover:text-quran hover:bg-quran/10"}`}
            aria-label="إعدادات القراءة"
          >
            <Settings2 size={16} />
          </button>
        </div>
      </div>

      {/* إعدادات قراءة خفيفة: حجم النصّ، تباعد الأسطر، ووضع التركيز */}
      {showTools && !focus && (
        <div className="flex items-center gap-3 flex-wrap bg-white dark:bg-[#241c12] border border-gray-100 dark:border-transparent rounded-xl p-2.5 text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <span>الحجم</span>
            <button onClick={() => save({ ...rs, size: Math.max(16, rs.size - 2) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أصغر"><Minus size={12} /></button>
            <span className="w-6 text-center tabular-nums font-bold text-gray-700 dark:text-gray-200">{rs.size}</span>
            <button onClick={() => save({ ...rs, size: Math.min(34, rs.size + 2) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أكبر"><Plus size={12} /></button>
          </div>
          <div className="flex items-center gap-1.5">
            <span>التباعد</span>
            <button onClick={() => save({ ...rs, lh: Math.max(1.8, Math.round((rs.lh - 0.2) * 10) / 10) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أقلّ"><Minus size={12} /></button>
            <span className="w-7 text-center tabular-nums font-bold text-gray-700 dark:text-gray-200">{rs.lh.toFixed(1)}</span>
            <button onClick={() => save({ ...rs, lh: Math.min(3.4, Math.round((rs.lh + 0.2) * 10) / 10) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أكثر"><Plus size={12} /></button>
          </div>
          <button onClick={() => setFocus(true)} className="inline-flex items-center gap-1 font-semibold text-quran bg-quran/10 rounded-lg px-2.5 py-1 press ms-auto">
            <Focus size={13} /> وضع التركيز
          </button>
        </div>
      )}

      {/* خروجٌ من وضع التركيز */}
      {focus && (
        <button onClick={() => setFocus(false)} className="fixed bottom-20 left-4 z-40 inline-flex items-center gap-1 text-[11px] font-bold text-white bg-quran/90 rounded-full px-3 py-2 press shadow-lg" aria-label="خروج من وضع التركيز">
          <X size={14} /> تركيز
        </button>
      )}

      <div className="rounded-2xl border border-quran/15 bg-gradient-to-b from-quran/[0.04] to-transparent p-4">
        {showBasmala && (
          <p className="font-quran text-center text-[19px] font-bold text-quran mb-4 pb-3 border-b border-quran/10">{basmala}</p>
        )}
        {!text ? (
          <p className="text-sm text-gray-400 text-center py-8">…جارٍ تحميل المصحف</p>
        ) : (
          <p className="font-quran text-justify font-bold text-gray-800 dark:text-gray-100" dir="rtl" style={{ fontSize: `${rs.size}px`, lineHeight: rs.lh }}>
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
