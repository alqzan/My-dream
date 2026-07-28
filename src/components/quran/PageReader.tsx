"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import {
  SURAHS, pageRange, idToSurahAyah, idToJuz, idToPage, TOTAL_PAGES,
} from "@/lib/quran/meta";
import { placeOf, pageSide, facingPage, clampPage } from "@/lib/quran/page";
import {
  ChevronLeft, ChevronRight, Settings2, Minus, Plus, Focus, X,
  Bookmark, Copy, Sprout, EyeOff, Eye, Layers,
} from "lucide-react";

// ===================== قارئ صفحات المصحف =====================
// القراءة صفحةً صفحة كالمصحف الورقيّ: حدودُ الصفحة ثابتة، ورقمُها ظاهر، ويُقال
// لك في كلّ آيةٍ **أين هي**: الصفحة يُمنى أم يُسرى، وفي أيّ ثلثٍ منها. هذا ما
// يبني «صورة الصفحة» في الذاكرة، وهو سببُ كون الحفظ من المصحف الورقيّ أثبت.
//
// وضع الحفظ (`veil`) هو الأداة الثانية: الصفحة كلّها مستورة، وتكشف آيةً آيةً
// بالترتيب — فتسترجع من ذاكرتك قبل أن ترى. الكشفُ لا يُخزَّن ولا يُزامَن (حالة
// جلسةٍ محضة)، فلا يمسّ المزامنة بشيء.
//
// الحسابُ كلّه في `@/lib/quran/page` (نقيّ ومختبَر) — لا تعريفَ ثانياً هنا.

type VeilMode = "off" | "all" | "step";

const READ_KEY = "madar-mushaf-read";
function readReadSettings(): { size: number; lh: number } {
  if (typeof window === "undefined") return { size: 22, lh: 2.6 };
  try {
    const r = JSON.parse(window.localStorage.getItem(READ_KEY) || "null");
    if (r && typeof r.size === "number" && typeof r.lh === "number") return r;
  } catch { /* ignore */ }
  return { size: 22, lh: 2.6 };
}

export function PageReader({
  page, text, onPage, onBack, onReflect, onResume,
}: {
  page: number;
  text: string[] | null;
  onPage: (p: number) => void;
  onBack: () => void;
  onReflect?: (surah: number, ayah: number) => void;
  onResume: (surah: number, ayah: number) => void;
}) {
  const [rs, setRs] = useState(readReadSettings);
  const [focus, setFocus] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [sel, setSel] = useState<number | null>(null); // معرّف الآية المحدّدة
  const [veil, setVeil] = useState<VeilMode>("off");
  // كم آيةً كُشفت في وضع «واحدة تلو الأخرى» (من أوّل الصفحة).
  const [revealed, setRevealed] = useState(0);
  // آياتٌ كُشفت فرادى بالنقر أثناء الستر (لا تُغيّر عدّاد التتابع).
  const [peeked, setPeeked] = useState<Set<number>>(new Set());
  const [flash, setFlash] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();

  const { start, end } = pageRange(clampPage(page));
  const side = pageSide(page);
  const facing = facingPage(page);

  // تبديلُ الصفحة يبدأ حفظاً جديداً: نعيد الستر والتحديد إلى أوّله.
  useEffect(() => {
    setSel(null);
    setRevealed(0);
    setPeeked(new Set());
  }, [page]);

  const save = (next: { size: number; lh: number }) => {
    setRs(next);
    try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  function flashMsg(m: string) {
    setFlash(m);
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(""), 1600);
  }

  // Wake Lock أثناء القراءة — بكشف الميزة فقط.
  useEffect(() => {
    let lock: { release?: () => void } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request?: (t: string) => Promise<{ release?: () => void }> } }).wakeLock;
    if (wl?.request) wl.request("screen").then((l) => { lock = l; }).catch(() => {});
    return () => { try { lock?.release?.(); } catch { /* ignore */ } };
  }, []);

  // آياتُ هذه الصفحة، ومع كلّ آيةٍ سورتُها ورقمُها فيها (فالصفحة قد تعبر سوراً).
  const ayat = useMemo(() => {
    if (!text) return [];
    const out: { id: number; surah: number; ayah: number; text: string }[] = [];
    for (let id = start; id <= end; id++) {
      const { surah, ayah } = idToSurahAyah(id);
      out.push({ id, surah, ayah, text: text[id] ?? "" });
    }
    return out;
  }, [text, start, end]);

  // السور المبدوءة في هذه الصفحة (لعرض ترويسة البسملة في موضعها الصحيح).
  const surahStarts = useMemo(() => {
    const m = new Map<number, number>(); // معرّف الآية → رقم السورة التي تبدأ عندها
    for (const v of ayat) if (v.ayah === 1) m.set(v.id, v.surah);
    return m;
  }, [ayat]);

  const isVeiled = (id: number): boolean => {
    if (veil === "off" || peeked.has(id)) return false;
    if (veil === "all") return true;
    return id >= start + revealed; // step: كُشف ما قبل العدّاد
  };
  const allRevealed = veil === "step" && revealed >= ayat.length;

  function toggleVeil() {
    setVeil((v) => (v === "off" ? "step" : v === "step" ? "all" : "off"));
    setRevealed(0);
    setPeeked(new Set());
  }
  function peek(id: number) {
    setPeeked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function copyAyah(id: number) {
    const { surah, ayah } = idToSurahAyah(id);
    try {
      await navigator.clipboard.writeText(`${text?.[id] ?? ""} ﴿${ayah}﴾\n— ${SURAHS[surah - 1].name} ${ayah}`);
      flashMsg("نُسخت الآية ✓");
    } catch { flashMsg("تعذّر النسخ"); }
  }

  const first = idToSurahAyah(start);
  const last = idToSurahAyah(end);
  const surahLabel = first.surah === last.surah
    ? SURAHS[first.surah - 1].name
    : `${SURAHS[first.surah - 1].name} – ${SURAHS[last.surah - 1].name}`;

  const goto = (p: number) => onPage(clampPage(p));

  return (
    <div className="space-y-3">
      {/* ترويسة: الصفحة، السورة والجزء، والتنقّل. اتجاه الأسهم على المصحف
          الورقيّ: «التالية» تتقدّم يساراً، و«السابقة» يميناً. */}
      <div className={`flex items-center justify-between ${focus ? "hidden" : ""}`}>
        <button onClick={onBack} className="flex items-center gap-1 text-xs text-quran font-semibold press">
          <ChevronRight size={15} /> الفهرس
        </button>
        <div className="text-center">
          <div className="text-base font-bold text-gray-800 dark:text-gray-100">صفحة {page}</div>
          <div className="text-[11px] text-gray-400">{surahLabel} · جزء {idToJuz(start)}</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => goto(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded-lg text-gray-400 hover:text-quran hover:bg-quran/10 press disabled:opacity-30"
            aria-label="الصفحة السابقة"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => goto(page + 1)}
            disabled={page >= TOTAL_PAGES}
            className="p-1.5 rounded-lg text-gray-400 hover:text-quran hover:bg-quran/10 press disabled:opacity-30"
            aria-label="الصفحة التالية"
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

      {/* شريطُ الموضع: أين هذه الصفحة من المصحف المفتوح — المعلومة التي يتعلّق
          بها التذكّر. مرسومةٌ لا مكتوبةً وحسب: وجهٌ مفتوح صفحتُه الحالية مضاءة. */}
      {!focus && (
        <div className="flex items-center gap-3 rounded-xl border border-quran/15 bg-quran/[0.04] px-3 py-2">
          <SpreadGlyph side={side} />
          <div className="flex-1 min-w-0 text-[11px] leading-relaxed">
            <span className="font-bold text-quran">الصفحة {side}</span>
            <span className="text-gray-500 dark:text-gray-400">
              {" "}في الوجه المفتوح{facing ? ` · تقابلها صفحة ${facing}` : ""}
            </span>
          </div>
          <button
            onClick={toggleVeil}
            className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-bold rounded-lg px-2.5 py-1.5 press ${
              veil === "off" ? "text-quran bg-quran/10" : "text-white bg-quran"
            }`}
          >
            {veil === "off" ? <EyeOff size={13} /> : <Eye size={13} />}
            {veil === "off" ? "احفظ" : veil === "step" ? "تتابع" : "سترٌ كامل"}
          </button>
        </div>
      )}

      {/* شريط الحفظ: كشفٌ متتابع مع عدّاد. يظهر فقط في وضع التتابع. */}
      {veil === "step" && (
        <div className="flex items-center gap-2 rounded-xl border border-quran/20 bg-white dark:bg-[#241c12] px-3 py-2">
          <Layers size={14} className="text-quran shrink-0" />
          <span className="text-[11px] text-gray-500 tabular-nums shrink-0">
            {revealed} / {ayat.length}
          </span>
          <div className="flex-1 h-1 rounded-full bg-quran/10 overflow-hidden">
            <div
              className="h-full bg-quran/70 rounded-full transition-[width] duration-300"
              style={{ width: `${ayat.length ? (revealed / ayat.length) * 100 : 0}%` }}
            />
          </div>
          <button
            onClick={() => setRevealed((n) => Math.max(0, n - 1))}
            disabled={revealed === 0}
            className="text-[11px] font-bold text-quran bg-quran/10 rounded-lg px-2 py-1 press disabled:opacity-30"
          >
            استر
          </button>
          <button
            onClick={() => setRevealed((n) => Math.min(ayat.length, n + 1))}
            disabled={allRevealed}
            className="text-[11px] font-bold text-white bg-quran rounded-lg px-2.5 py-1 press disabled:opacity-40"
          >
            اكشف
          </button>
        </div>
      )}

      {/* إعدادات قراءة خفيفة */}
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

      {focus && (
        <button onClick={() => setFocus(false)} className="fixed bottom-20 left-4 z-40 inline-flex items-center gap-1 text-[11px] font-bold text-white bg-quran/90 rounded-full px-3 py-2 press shadow-lg" aria-label="خروج من وضع التركيز">
          <X size={14} /> تركيز
        </button>
      )}

      {flash && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-quran text-white text-xs font-bold rounded-full px-4 py-2 shadow-lg [animation:fadeIn_0.2s_ease_both]">
          {flash}
        </div>
      )}

      {/* لوحُ الصفحة — إطارٌ ثابت يحاكي حدّ المصحف، ورقمُ الصفحة في قدمه.
          الجانبُ المضيء (يمين/يسار) يذكّرك بموضع الصفحة في الوجه المفتوح. */}
      <div
        className={`relative rounded-2xl border-2 border-quran/20 bg-gradient-to-b from-quran/[0.05] to-transparent p-4 pb-8 ${
          side === "يمنى" ? "border-r-4 border-r-quran/50" : "border-l-4 border-l-quran/50"
        }`}
      >
        {!text ? (
          <p className="text-sm text-gray-400 text-center py-10">…جارٍ تحميل المصحف</p>
        ) : (
          <p
            className="font-quran text-justify font-bold text-gray-800 dark:text-gray-100"
            dir="rtl"
            style={{ fontSize: `${rs.size}px`, lineHeight: rs.lh }}
          >
            {ayat.map((v) => {
              const startsSurah = surahStarts.get(v.id);
              const veiled = isVeiled(v.id);
              const isSel = sel === v.id;
              return (
                <span key={v.id}>
                  {startsSurah && startsSurah !== 1 && startsSurah !== 9 && v.ayah === 1 && (
                    <span className="block text-center text-[0.8em] text-quran font-bold my-3 pb-2 border-b border-quran/10">
                      {SURAHS[startsSurah - 1].name}
                      <span className="block">{text[1]}</span>
                    </span>
                  )}
                  <span
                    id={`q-page-ayah-${v.id}`}
                    onClick={() => (veil !== "off" && veiled ? peek(v.id) : setSel(isSel ? null : v.id))}
                    className={`cursor-pointer rounded px-0.5 transition-colors ${isSel ? "bg-quran/15" : "hover:bg-quran/[0.06]"}`}
                  >
                    {veiled ? (
                      // سترٌ لا حذف: طولُ الأثر يتناسب مع طول الآية، فيبقى شكلُ
                      // الصفحة (وهو نفسه ما تحفظه العين) قائماً تحت الستر.
                      <span
                        aria-label="آية مستورة"
                        className="inline-block align-middle rounded bg-quran/15 select-none"
                        style={{ width: `${Math.min(100, Math.max(8, v.text.length / 2.2))}%`, height: "0.62em" }}
                      />
                    ) : (
                      v.text
                    )}
                    <span className="inline-flex items-center justify-center text-[0.6em] text-quran mx-1 align-middle">
                      ﴿{v.ayah}﴾
                    </span>
                  </span>
                </span>
              );
            })}
          </p>
        )}
        <span className="absolute bottom-2 inset-x-0 text-center text-[11px] font-bold text-quran/50 tabular-nums">
          {page}
        </span>
      </div>

      {/* تنقّلٌ سفليّ بعرضٍ كامل — أسهل من أسهم الترويسة أثناء القراءة. */}
      {!focus && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => goto(page - 1)}
            disabled={page <= 1}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-quran bg-quran/10 rounded-xl py-2.5 press disabled:opacity-30"
          >
            <ChevronRight size={15} /> السابقة
          </button>
          <button
            onClick={() => goto(page + 1)}
            disabled={page >= TOTAL_PAGES}
            className="flex-1 inline-flex items-center justify-center gap-1 text-xs font-bold text-white bg-quran rounded-xl py-2.5 press disabled:opacity-40"
          >
            التالية <ChevronLeft size={15} />
          </button>
        </div>
      )}

      {/* قائمة إجراءات الآية المحدّدة — وفيها موضعُها الدقيق في الصفحة. */}
      {sel != null && <AyahSheet id={sel} text={text?.[sel] ?? ""} onClose={() => setSel(null)}
        onReflect={onReflect} onResume={onResume} onCopy={() => copyAyah(sel)}
        onFlash={flashMsg} veiled={isVeiled(sel)} onPeek={() => peek(sel)} veilOn={veil !== "off"} />}
    </div>
  );
}

// رسمٌ صغير لوجهٍ مفتوح: صفحتان، والحالية مضاءة في جهتها. أوقع في الذهن من
// كلمة «يمنى» وحدها، وهو بيت القصيد في حفظ موضع الصفحة.
function SpreadGlyph({ side }: { side: "يمنى" | "يسرى" }) {
  const on = "fill-quran/70 stroke-quran";
  const off = "fill-transparent stroke-quran/30";
  return (
    <svg viewBox="0 0 34 22" className="w-9 h-6 shrink-0" aria-hidden>
      <rect x="17.6" y="1" width="15" height="20" rx="2" strokeWidth="1.2"
        className={side === "يسرى" ? on : off} />
      <rect x="1.4" y="1" width="15" height="20" rx="2" strokeWidth="1.2"
        className={side === "يمنى" ? on : off} />
      <line x1="17" y1="1" x2="17" y2="21" strokeWidth="1.2" className="stroke-quran/40" />
    </svg>
  );
}

function AyahSheet({
  id, text, onClose, onReflect, onResume, onCopy, onFlash, veiled, onPeek, veilOn,
}: {
  id: number; text: string; onClose: () => void;
  onReflect?: (surah: number, ayah: number) => void;
  onResume: (surah: number, ayah: number) => void;
  onCopy: () => void; onFlash: (m: string) => void;
  veiled: boolean; onPeek: () => void; veilOn: boolean;
}) {
  const { surah, ayah } = idToSurahAyah(id);
  const place = placeOf(id);

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-4 pb-[env(safe-area-inset-bottom)] [animation:sheetUp_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
      <div className="max-w-2xl mx-auto bg-white dark:bg-[#241c12] rounded-2xl shadow-2xl border border-gray-100 dark:border-transparent p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-quran">{SURAHS[surah - 1].name} · آية {ayah}</span>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 press" aria-label="إغلاق"><X size={15} /></button>
        </div>

        {/* موضعُ الآية — الغرض الأول من هذا القارئ. «الترتيب» رقمٌ دقيق،
            و«الثلث» تقريبٌ من عدد آيات الصفحة لا رقمُ سطرٍ في مصحف المدينة. */}
        <div className="flex items-center gap-2 mb-2 text-[11px] rounded-xl bg-quran/[0.07] px-2.5 py-2">
          <SpreadGlyph side={place.side} />
          <span className="font-bold text-quran">صفحة {place.page} · {place.side}</span>
          <span className="text-gray-500 dark:text-gray-400">
            {place.zone} · الآية {place.index} من {place.count}
          </span>
        </div>

        <p className="font-quran text-[15px] text-gray-600 dark:text-gray-300 line-clamp-2 leading-loose mb-2.5">{text}</p>
        <div className={`grid gap-1.5 ${veilOn ? "grid-cols-4" : "grid-cols-3"}`}>
          <SheetAction icon={<Bookmark size={16} />} label="علامة" onClick={() => { onResume(surah, ayah); onFlash("حُفظت العلامة ✓"); onClose(); }} />
          <SheetAction icon={<Sprout size={16} />} label="تأمّل" onClick={() => { onReflect?.(surah, ayah); onClose(); }} />
          <SheetAction icon={<Copy size={16} />} label="نسخ" onClick={() => { onCopy(); onClose(); }} />
          {veilOn && (
            <SheetAction
              icon={veiled ? <Eye size={16} /> : <EyeOff size={16} />}
              label={veiled ? "اكشف" : "استر"}
              onClick={onPeek}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SheetAction({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
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

// مساعدٌ للفهرس: رقم صفحة أوّل آيةٍ في سورة (لفتح السورة صفحةً لا قائمةَ آيات).
export const surahFirstPage = (surahNum: number): number => idToPage(SURAHS[surahNum - 1].first);
