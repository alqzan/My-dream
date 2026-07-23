"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { SURAHS, juzRange, pageRange, idToSurahAyah, surahAyahToId, idToPage, idToJuz, TOTAL_JUZ, TOTAL_PAGES } from "@/lib/quran/meta";
import { loadAyahText } from "@/lib/quran/text";
import { normalizeArabic } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, BookmarkCheck, Settings2, Minus, Plus, Focus, X, Bookmark, Copy, Sprout, Ear, Check } from "lucide-react";

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
    return (
      <SurahReader
        surahNum={open.surah}
        scrollAyah={open.ayah}
        text={text}
        onBack={() => setOpen(null)}
        onNav={(n) => openAt(n, 1)}
        onReflect={onReflect}
        onResume={markResume}
      />
    );
  }

  return (
    <div className="space-y-3">
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

      {/* مبدّل طريقة التصفّح */}
      <div className="flex gap-1 p-1 rounded-xl bg-quran/[0.07]">
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

      {/* اذهب إلى صفحة (١–٦٠٤) — متاحٌ دائماً */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-gray-500 shrink-0">اذهب إلى صفحة</span>
        <input
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => e.key === "Enter" && goToPage()}
          inputMode="numeric"
          placeholder="١–٦٠٤"
          className="w-20 text-sm text-center border border-gray-200 dark:border-transparent rounded-lg px-2 py-1.5 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
        />
        <button onClick={goToPage} disabled={!pageInput} className="text-[11px] font-bold text-white bg-quran rounded-lg px-3 py-1.5 press disabled:opacity-40">اذهب</button>
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
              className="w-full text-sm border border-gray-200 rounded-xl ps-3 pe-9 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
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
              className="w-full text-sm border border-gray-200 rounded-xl ps-3 pe-9 py-2 bg-white dark:bg-[#241c12] focus:outline-none focus:ring-2 focus:ring-quran/40"
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
  surahNum, scrollAyah, text, onBack, onNav, onReflect, onResume,
}: {
  surahNum: number; scrollAyah?: number; text: string[] | null;
  onBack: () => void; onNav: (n: number) => void;
  onReflect?: (surah: number, ayah: number) => void;
  onResume: (surah: number, ayah: number) => void;
}) {
  const s = SURAHS[surahNum - 1];
  const showBasmala = surahNum !== 1 && surahNum !== 9;
  const basmala = text?.[1] ?? "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";

  const [rs, setRs] = useState(readReadSettings);
  const [focus, setFocus] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [sel, setSel] = useState<number | null>(null); // الآية المحدّدة لقائمة الإجراءات
  const [hidden, setHidden] = useState<Set<number>>(new Set()); // آيات مُخفاة للتسميع
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  const save = (next: { size: number; lh: number }) => {
    setRs(next);
    try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  function flashMsg(m: string) {
    setFlash(m);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 1600);
  }

  // إعادة الضبط عند تغيّر السورة: إخفاء التسميع والتحديد.
  useEffect(() => { setSel(null); setHidden(new Set()); }, [surahNum]);

  // Wake Lock أثناء القراءة — بكشف الميزة فقط (يتعطّل بهدوء إن لم تُدعَم).
  useEffect(() => {
    let lock: { release?: () => void } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request?: (t: string) => Promise<{ release?: () => void }> } }).wakeLock;
    if (wl?.request) wl.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { try { lock?.release?.(); } catch { /* ignore */ } };
  }, []);

  // التمرير إلى الآية المطلوبة عند الفتح (بعد تحميل النصّ).
  useEffect(() => {
    if (!text || !scrollAyah || scrollAyah <= 1) return;
    const el = containerRef.current?.querySelector<HTMLElement>(`#q-ayah-${scrollAyah}`);
    if (el) {
      const t = setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 120);
      setSel(scrollAyah);
      return () => clearTimeout(t);
    }
  }, [text, scrollAyah, surahNum]);

  const ayat: { n: number; text: string }[] = [];
  if (text) for (let a = 1; a <= s.ayat; a++) ayat.push({ n: a, text: text[s.first + (a - 1)] ?? "" });

  function toggleHidden(n: number) {
    setHidden((prev) => { const next = new Set(prev); next.has(n) ? next.delete(n) : next.add(n); return next; });
  }
  async function copyAyah(n: number) {
    const t = text?.[s.first + (n - 1)] ?? "";
    try { await navigator.clipboard.writeText(`${t} ﴿${n}﴾\n— ${s.name} ${n}`); flashMsg("نُسخت الآية ✓"); }
    catch { flashMsg("تعذّر النسخ"); }
  }

  const selText = sel != null ? (text?.[s.first + (sel - 1)] ?? "") : "";

  return (
    <div className="space-y-3">
      <div className={`flex items-center justify-between ${focus ? "hidden" : ""}`}>
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-quran font-semibold press">
          <ChevronRight size={15} /> السور
        </button>
        <div className="text-center">
          <div className="text-base font-bold text-gray-800">{s.name}</div>
          <div className="text-[11px] text-gray-400">{s.meccan ? "مكية" : "مدنية"} · {s.ayat} آية · جزء {idToJuz(s.first)}</div>
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

      {/* تلميحٌ عابر (نسخ/علامة) */}
      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-quran text-white text-xs font-bold rounded-full px-4 py-2 shadow-lg [animation:fadeIn_0.2s_ease_both]">
          {flash}
        </div>
      )}

      <div ref={containerRef} className="rounded-2xl border border-quran/15 bg-gradient-to-b from-quran/[0.04] to-transparent p-4">
        {showBasmala && (
          <p className="font-quran text-center text-[19px] font-bold text-quran mb-4 pb-3 border-b border-quran/10">{basmala}</p>
        )}
        {!text ? (
          <p className="text-sm text-gray-400 text-center py-8">…جارٍ تحميل المصحف</p>
        ) : (
          <p className="font-quran text-justify font-bold text-gray-800 dark:text-gray-100" dir="rtl" style={{ fontSize: `${rs.size}px`, lineHeight: rs.lh }}>
            {ayat.map((v) => {
              const isHidden = hidden.has(v.n);
              const isSel = sel === v.n;
              return (
                <span
                  key={v.n}
                  id={`q-ayah-${v.n}`}
                  onClick={() => setSel(isSel ? null : v.n)}
                  className={`cursor-pointer rounded px-0.5 transition-colors ${isSel ? "bg-quran/15" : "hover:bg-quran/[0.06]"}`}
                >
                  {isHidden ? <span className="text-quran/40">••••••</span> : v.text}
                  <span className="inline-flex items-center justify-center text-[13px] text-quran mx-1 align-middle">
                    ﴿{v.n}﴾
                  </span>
                </span>
              );
            })}
          </p>
        )}
      </div>

      {/* قائمة إجراءات الآية المحدّدة — شريطٌ سفليّ */}
      {sel != null && (
        <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] [animation:sheetUp_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="max-w-2xl mx-auto bg-white dark:bg-[#241c12] rounded-2xl shadow-2xl border border-gray-100 dark:border-transparent p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-quran">{s.name} · آية {sel}</span>
              <button onClick={() => setSel(null)} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 press" aria-label="إغلاق"><X size={15} /></button>
            </div>
            <p className="font-quran text-[15px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-loose mb-2.5">{selText}</p>
            <div className="grid grid-cols-4 gap-1.5">
              <AyahAction icon={<Bookmark size={16} />} label="علامة" onClick={() => { onResume(surahNum, sel); flashMsg("حُفظت العلامة ✓"); setSel(null); }} />
              <AyahAction icon={<Sprout size={16} />} label="تأمّل" onClick={() => { onReflect?.(surahNum, sel); setSel(null); }} />
              <AyahAction icon={<Copy size={16} />} label="نسخ" onClick={() => { copyAyah(sel); setSel(null); }} />
              <AyahAction
                icon={hidden.has(sel) ? <Check size={16} /> : <Ear size={16} />}
                label={hidden.has(sel) ? "اكشف" : "تسميع"}
                onClick={() => toggleHidden(sel)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AyahAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 py-2 rounded-xl bg-quran/[0.06] hover:bg-quran/15 text-quran press"
    >
      {icon}
      <span className="text-[11px] font-bold">{label}</span>
    </button>
  );
}
