"use client";
import { useState, useEffect, useRef } from "react";
import {
  SURAHS, pageRange, idToSurahAyah, idToJuz, idToPage, TOTAL_PAGES,
} from "@/lib/quran/meta";
import { placeOf, pageSide, facingPage, clampPage } from "@/lib/quran/page";
import { spreadOf, sameSpread, turnStep } from "@/lib/quran/book";
import { loadReadPrefs, saveReadPrefs, DEFAULT_READ_PREFS, SIZE_RANGE, LH_RANGE } from "@/lib/quran/readPrefs";
import { MushafSheet } from "@/components/quran/MushafSheet";
import { SpreadGlyph } from "@/components/quran/SpreadGlyph";
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
// الحسابُ كلّه في `@/lib/quran/page` (نقيّ ومختبَر)، ورسمُ لوح الوجه في
// `MushafSheet` — وهو نفسه لوحُ الحفظ والتسميع في قسم الحفظ، فصورةُ الوجه واحدةٌ
// أينما رأيتها. لا تعريفَ ثانياً هنا.

type VeilMode = "off" | "all" | "step";

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
  const [rs, setRs] = useState(DEFAULT_READ_PREFS);
  useEffect(() => { setRs(loadReadPrefs()); }, []);
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

  // الستر يجري على **الوجه المفتوح** لا على صفحةٍ منه: هكذا لا ينقطع كشفُك حين
  // تنتقل بعينك إلى الصفحة المقابلة — وهو ما تفعله بالورق تماماً.
  const spread = spreadOf(page);
  const spreadStart = pageRange(spread.right).start;
  const spreadEnd = pageRange(spread.left ?? spread.right).end;

  // قلبُ الورقة يبدأ حفظاً جديداً؛ أمّا التنقّل داخل الوجه المفتوح فلا يُلغي
  // ما كشفتَه (مفتاح الأثر هو الوجه لا الصفحة).
  useEffect(() => {
    setSel(null);
    setRevealed(0);
    setPeeked(new Set());
  }, [spread.right]);

  const save = (next: { size: number; lh: number }) => {
    setRs(next);
    saveReadPrefs(next);
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

  const ayatCount = spreadEnd - spreadStart + 1;

  const isVeiled = (id: number): boolean => {
    if (veil === "off" || peeked.has(id)) return false;
    if (veil === "all") return true;
    return id >= spreadStart + revealed; // step: كُشف ما قبل العدّاد
  };
  const allRevealed = veil === "step" && revealed >= ayatCount;

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
            {revealed} / {ayatCount}
          </span>
          <div className="flex-1 h-1 rounded-full bg-quran/10 overflow-hidden">
            <div
              className="h-full bg-quran/70 rounded-full transition-[width] duration-300"
              style={{ width: `${ayatCount ? (revealed / ayatCount) * 100 : 0}%` }}
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
            onClick={() => setRevealed((n) => Math.min(ayatCount, n + 1))}
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
            <button onClick={() => save({ ...rs, size: Math.max(SIZE_RANGE.min, rs.size - SIZE_RANGE.step) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أصغر"><Minus size={12} /></button>
            <span className="w-6 text-center tabular-nums font-bold text-gray-700 dark:text-gray-200">{rs.size}</span>
            <button onClick={() => save({ ...rs, size: Math.min(SIZE_RANGE.max, rs.size + SIZE_RANGE.step) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أكبر"><Plus size={12} /></button>
          </div>
          <div className="flex items-center gap-1.5">
            <span>التباعد</span>
            <button onClick={() => save({ ...rs, lh: Math.max(LH_RANGE.min, Math.round((rs.lh - LH_RANGE.step) * 10) / 10) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أقلّ"><Minus size={12} /></button>
            <span className="w-7 text-center tabular-nums font-bold text-gray-700 dark:text-gray-200">{rs.lh.toFixed(1)}</span>
            <button onClick={() => save({ ...rs, lh: Math.min(LH_RANGE.max, Math.round((rs.lh + LH_RANGE.step) * 10) / 10) })} className="w-6 h-6 rounded-lg bg-gray-100 dark:bg-[#382c1d] press flex items-center justify-center" aria-label="أكثر"><Plus size={12} /></button>
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

      {/* الوجه المفتوح — الصفحتان المتقابلتان في مجلَّدٍ واحد. تنتقل بينهما
          بالتمرير العَرْضيّ (أو تراهما معاً على شاشةٍ عريضة)، وتقلب الورقة
          بالسحب من طرفها أو بلمس حافّتها. */}
      <BookSpread
        page={page}
        text={text}
        rs={rs}
        veilOn={veil !== "off"}
        isVeiled={isVeiled}
        sel={sel}
        onPage={goto}
        onAyahClick={(id) => (veil !== "off" && isVeiled(id) ? peek(id) : setSel(sel === id ? null : id))}
      />

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

// ===================== الوجه المفتوح =====================
// المصحف لا يُقرأ صفحةً معلّقةً في فراغ: صفحتان متقابلتان في مجلَّدٍ واحد،
// وورقةٌ تُقلب من طرفها. هذا المكوّن يجمع الثلاثة:
//   • **الصفحتان معاً** في مسارٍ واحد: على الشاشة العريضة تراهما جنباً إلى جنب
//     كالمصحف المفتوح، وعلى الجوال تنتقل بينهما بالتمرير العَرْضيّ (مع بقاء طرف
//     المقابلة ظاهراً، فتعرف أنّها هناك).
//   • **قلبُ الورقة**: سحبٌ من طرف الوجه — يميناً تتقدّم ويساراً ترجع، وهي حركة
//     الورقة نفسها في الكتاب العربيّ (الورقة الراقدة يساراً تدور على الكعب
//     فتستقرّ يميناً). ولمسةٌ على الحافّة تكفي لمن لا يريد السحب.
//   • **حدُّ الوجه**: التنقّل داخل الوجه المفتوح تصفّحٌ بالعين (تمريرٌ سلس)،
//     وعبورُه قلبُ ورقةٍ له حركته. القرار في `sameSpread`.
//
// اتّجاه الحركة ليس ذوقاً: `book.ts` يشتقّه من بنية الكتاب العربيّ ويحرسه اختبار.
function BookSpread({
  page, text, rs, veilOn, isVeiled, sel, onPage, onAyahClick,
}: {
  page: number;
  text: string[] | null;
  rs: { size: number; lh: number };
  veilOn: boolean;
  isVeiled: (id: number) => boolean;
  sel: number | null;
  onPage: (p: number) => void;
  onAyahClick: (id: number) => void;
}) {
  const spread = spreadOf(page);
  // ترتيب DOM من اليسار لليمين (المسار نفسه ltr ليستقيم حساب التمرير في كلّ
  // المتصفّحات؛ نصُّ الآيات يبقى rtl داخل اللوح).
  const panes = [spread.left, spread.right].filter((p): p is number => p != null);

  const scroller = useRef<HTMLDivElement>(null);
  const paneEls = useRef(new Map<number, HTMLDivElement>());
  const prevPage = useRef(page);
  const settle = useRef<ReturnType<typeof setTimeout>>();
  const dragFrom = useRef<{ x: number; edge: "left" | "right" } | null>(null);
  const [dragDx, setDragDx] = useState(0);
  const [turning, setTurning] = useState<0 | 1 | -1>(0);
  const [calm, setCalm] = useState(false); // تفضيل تقليل الحركة

  useEffect(() => {
    setCalm(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  }, []);

  // أحضر الصفحة الحالية إلى المنظر: بسلاسةٍ داخل الوجه الواحد، وفوراً بعد قلب
  // ورقةٍ (الوجه الجديد يبدأ من مكانه لا منزلقاً).
  useEffect(() => {
    const box = scroller.current;
    const el = paneEls.current.get(page);
    if (!box || !el) return;
    const smooth = sameSpread(prevPage.current, page) && !calm;
    prevPage.current = page;
    box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.clientWidth) / 2, behavior: smooth ? "smooth" : "auto" });
  }, [page, calm]);

  // التمرير العَرْضيّ نفسه تنقّلٌ بين صفحتَي الوجه — نقرأ ما استقرّ عليه.
  function onScroll() {
    const box = scroller.current;
    if (!box || box.scrollWidth <= box.clientWidth + 8) return; // الشاشة العريضة: لا تمرير
    clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const center = box.scrollLeft + box.clientWidth / 2;
      let best = page;
      let bestD = Infinity;
      paneEls.current.forEach((el, p) => {
        const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - center);
        if (d < bestD) { bestD = d; best = p; }
      });
      if (best !== page) onPage(best);
    }, 140);
  }

  function step(dir: 1 | -1) {
    const target = clampPage(page + dir);
    if (target === page) return;
    if (sameSpread(target, page) || calm) { onPage(target); return; }
    setTurning(dir);
    setTimeout(() => { onPage(target); setTurning(0); }, 190);
  }

  const onDown = (e: React.PointerEvent, edge: "left" | "right") => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragFrom.current = { x: e.clientX, edge };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragFrom.current) return;
    const dx = e.clientX - dragFrom.current.x;
    setDragDx(Math.max(-170, Math.min(170, dx)));
  };
  const onUp = () => {
    const from = dragFrom.current;
    const dx = dragDx;
    dragFrom.current = null;
    setDragDx(0);
    if (!from) return;
    if (Math.abs(dx) < 6) { step(from.edge === "left" ? 1 : -1); return; } // لمسةٌ على الحافّة
    const s = turnStep(dx);
    if (s) step(s);
  };

  const shift = dragDx ? dragDx * 0.45 : turning ? turning * 70 : 0;

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={onScroll}
        dir="ltr"
        className="flex gap-2 overflow-x-auto snap-x snap-mandatory scroll-smooth px-6 -mx-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {panes.map((p) => {
          const r = pageRange(p);
          return (
            <div
              key={p}
              ref={(el) => { if (el) paneEls.current.set(p, el); else paneEls.current.delete(p); }}
              className="snap-center shrink-0 basis-[93%] min-[900px]:basis-[calc(50%-0.25rem)]"
              style={{
                transform: shift ? `translateX(${shift}px)` : undefined,
                opacity: turning ? 0.12 : 1,
                // ظلٌّ يرتفع مع السحب: الورقة تُرفع عن أختها قبل أن تنقلب.
                filter: dragDx ? `drop-shadow(0 6px 14px rgba(60,40,10,${Math.min(0.22, Math.abs(dragDx) / 700)}))` : undefined,
                transition: dragDx ? "none" : "transform 190ms ease-out, opacity 190ms ease-out",
              }}
            >
              <MushafSheet
                text={text}
                fromId={r.start}
                toId={r.end}
                header={false}
                size={rs.size}
                lh={rs.lh}
                hidden={isVeiled}
                selectedId={sel}
                onAyahClick={onAyahClick}
              />
            </div>
          );
        })}
      </div>

      {/* حافّتا الوجه: امسك الورقة من طرفها واسحب، أو المس الحافّة. اليمينُ نحو
          ما قرأت واليسارُ نحو ما بقي — كما تُمسك المصحف. */}
      <TurnEdge edge="right" label="الوجه السابق" disabled={page <= 1}
        onPointerDown={(e) => onDown(e, "right")} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyTurn={() => step(-1)} />
      <TurnEdge edge="left" label="الوجه التالي" disabled={page >= TOTAL_PAGES}
        onPointerDown={(e) => onDown(e, "left")} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onKeyTurn={() => step(1)} />

      {!veilOn && (
        <p className="text-[10px] text-gray-400 text-center mt-1.5">
          اسحب الورقة من طرفها لتقلبها · وللانتقال بين صفحتَي الوجه مرِّر عَرْضاً
        </p>
      )}
    </div>
  );
}

// شريطُ حافّةٍ رفيع: هدفُ لمسٍ كامل الارتفاع (44px عرضاً مع الهامش) بلا أن يغطّي
// النصّ — يعيش في هامش المسار لا فوق الورقة.
function TurnEdge({
  edge, label, disabled, onKeyTurn, ...handlers
}: {
  edge: "left" | "right";
  label: string;
  disabled: boolean;
  /** لوحة المفاتيح لا تُصدر أحداث مؤشّر: النقرةُ المولَّدة منها (detail = 0) هي
      سبيلُ من يتصفّح بالمفاتيح لقلب الورقة. */
  onKeyTurn: () => void;
} & Pick<React.ComponentProps<"button">, "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel">) {
  return (
    <button
      {...handlers}
      onClick={(e) => { if (e.detail === 0) onKeyTurn(); }}
      disabled={disabled}
      aria-label={label}
      className={`absolute inset-y-6 w-7 rounded-lg touch-none select-none press disabled:opacity-0 flex items-center justify-center text-quran/30 hover:text-quran/70 hover:bg-quran/[0.06] ${
        edge === "left" ? "left-0" : "right-0"
      }`}
    >
      {edge === "left" ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
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
