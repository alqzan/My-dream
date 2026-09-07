"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SURAHS, idToSurahAyah, idToJuz } from "@/lib/quran/meta";
import { portionPages } from "@/lib/quran/portionPage";
import { leafStack, edgeWidth, turnStep } from "@/lib/quran/book";
import type { PageSide } from "@/lib/quran/page";
import {
  loadPageLines, peekPageLines, linesOnPage, SURA_HEADER, BASMALA, CENTERED,
  type MushafPageLines, type MushafRun,
} from "@/lib/quran/mushafLayout";
import {
  loadReadPrefs, saveReadPrefs, clampZoom, ZOOM_RANGE, DEFAULT_READ_PREFS,
  MUSHAF_SKINS, type MushafSkin, type ReadPrefs,
} from "@/lib/quran/readPrefs";
import { enterFullscreen, exitFullscreen } from "@/lib/platform/fullscreen";
import { SpreadGlyph } from "@/components/quran/SpreadGlyph";
import {
  Maximize2, Minimize2, X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Palette, Check, StretchVertical,
} from "lucide-react";
import { arNum } from "@/lib/madar/format";

// ===================== لوح المصحف — العارض الوحيد لنصّ الآيات =====================
// الذاكرة التصويرية هي رأس مال الحافظ: يتذكّر أنّ الآية في أعلى الوجه الأيمن،
// وأنّ قبلها كذا وبعدها كذا **على الورقة نفسها**. فإذا عُرض المقطع مجرّداً من
// وجهه — قائمةَ آياتٍ في صندوق — انهدمت تلك الصورة وبقي حفظُ الصوت وحده.
//
// لذلك صار عرضُ النصّ في الحفظ والمراجعة واختبار مواضع الخطأ **من هنا**: المقطع
// يُرسم داخل وجهه من المصحف، بحدوده ورقمه وجهته وسياقِ آياته، والمقطع المطلوب
// مُبرَزٌ فيه. والستر (`hidden`) يُبقي أثر الآية في موضعها من الوجه — سترٌ لا
// حذف — فتسترجع من ذاكرتك وشكلُ الوجه قائمٌ تحت يدك.
//
// **والأسطر الآن أسطرُ المصحف نفسها**: كان النصّ يتّصل فيتكسّر حيث شاء عرضُ
// الشاشة، فتختلف صورةُ الوجه من جهازٍ لآخر — وهي عين ما يُعوَّل عليه في الحفظ.
// صار الوجه خمسةَ عشر سطراً (وثمانيةً في وجهَي الفاتحة وأوّل البقرة) ينتهي كلٌّ
// منها حيث ينتهي في المطبوع، ويستوي على عرضه بالتطويل المدسوس في النصّ ثمّ
// بمعامل تمدّد السطر. التخطيط والبيانات في `@/lib/quran/mushafLayout` — لا
// تُعِد حسابه هنا ولا ترسم آيةً خارج سطرها.
//
// القسمة على الأوجه في `@/lib/quran/portionPage` (نقيّة ومختبَرة) — لا تعريفَ
// ثانياً هنا.

export interface SheetAyah {
  id: number;
  surah: number;
  ayah: number;
  text: string;
  inPortion: boolean; // من المقطع المطلوب لا من سياقه
}

/** المقطع الواقع على سطرٍ واحد من آيةٍ قد تمتدّ على أسطر. */
export interface SheetPart {
  text: string;
  /** ترتيب أوّل كلمةٍ منه بين كلمات الآية — فيبقى وسمُ الكلمة على كلمته. */
  wordOffset: number;
}

// كيف تُعرض آياتُ الوجه خارج المقطع:
//   text  — نصّاً خافتاً: صورةُ الوجه كاملة (الأصل في الحفظ والمراجعة).
//   shape — أثراً بلا نصّ: يبقى شكل الوجه ولا يتسرّب ما لم يُطلب كشفُه.
export type SheetContext = "text" | "shape";

export interface MushafSheetProps {
  text: string[] | null;
  fromId: number;
  toId: number;
  context?: SheetContext;
  /** آيةٌ من السياق تُعرض نصّاً ولو كان السياق شكلاً (تلقين). */
  leadId?: number | null;
  /** أيّ آيات المقطع مستورة الآن (سترٌ يُبقي أثرها في موضعها). */
  hidden?: (id: number) => boolean;
  /** آيةٌ تُبرز والباقي يخفت — مرحلة تكرار الآية الواحدة. */
  spotlightId?: number | null;
  selectedId?: number | null;
  /** ترويسة «صفحة N · يمنى» فوق اللوح (تُطفأ حين يعلوها شريطُ موضعٍ خاصّ). */
  header?: boolean;
  /** بديلُ رسم نصّ الآية — لوسم الكلمات أو طمس موضعٍ منها. يُنادى **لكلّ مقطعٍ
      من الآية على سطره**، ومعه ترتيبُ أوّل كلمةٍ فيه. */
  renderAyah?: (a: SheetAyah, part: SheetPart) => React.ReactNode;
  /** بديلُ رسم رقم الآية — حين يكون زرّاً (وسم الآية كاملةً). */
  renderNumber?: (a: SheetAyah) => React.ReactNode;
  onAyahClick?: (id: number) => void;
  /** تكبيرُ الوجه (1 = ملء العرض). ما زاد عليه يُتصفَّح أفقياً. */
  zoom?: number;
  /** ارتفاعٌ أقصى بالبكسل مع تمرير — للبطاقات داخل الصفحات. */
  maxHeight?: number;
  /** نموذجُ العرض — يُمرَّر حين يقوده الطور، وإلا فمن تفضيلات القراءة. */
  skin?: MushafSkin;
  /** سماكةُ الأوراق على الطرف الخارجيّ (تُطفأ في المساحات الضيّقة جداً). */
  stack?: boolean;
  /** زرُّ «ملء الشاشة» فوق اللوح — يفتح الوجه على الشاشة كلّها بحالته نفسها. */
  expandable?: boolean;
  className?: string;
}

export function MushafSheet(props: MushafSheetProps) {
  const {
    text, fromId, toId,
    context = "text",
    leadId = null,
    hidden,
    spotlightId = null,
    selectedId = null,
    header = true,
    renderAyah,
    renderNumber,
    onAyahClick,
    zoom,
    maxHeight,
    skin,
    stack = true,
    expandable = false,
    className = "",
  } = props;
  // التفضيلات تُقرأ بعد التركيب لا أثناء الرسم الأوّل: الموقع ثابتٌ مُصدَّر
  // مسبقاً، فقراءةُ localStorage في أوّل رسمٍ تُخالف ما صُدِّر.
  const [prefs, setPrefs] = useState(DEFAULT_READ_PREFS);
  useEffect(() => { setPrefs(loadReadPrefs()); }, []);
  const pageZoom = zoom ?? prefs.zoom;
  const pageSkin = skin ?? prefs.skin;
  const [full, setFull] = useState(false);

  const pages = useMemo(() => portionPages(fromId, toId), [fromId, toId]);

  // في اللوح المحدود الارتفاع قد يقع المقطع تحت طيّة السياق — ننزل إليه.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!maxHeight || !text) return;
    const box = scroller.current;
    const el = box?.querySelector<HTMLElement>(`#q-page-ayah-${fromId}`);
    if (box && el) box.scrollTop = Math.max(0, el.offsetTop - box.offsetTop - 48);
  }, [maxHeight, text, fromId]);

  if (!text) {
    return <p className="text-xs text-gray-400 text-center py-6">…جارٍ تحميل المصحف</p>;
  }

  const sheet = (
    <div
      ref={scroller}
      className={`mushaf-skin-${pageSkin} space-y-3 ${maxHeight ? "overflow-y-auto" : ""} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {pages.map((pg) => (
        <div key={pg.page}>
          {header && (
            <div className="flex items-center gap-2 mb-1.5 px-0.5">
              <SpreadGlyph side={pg.side} className="w-7 h-5" />
              <span className="text-[11px] font-bold text-quran">صفحة {arNum(pg.page)} · {pg.side}</span>
              <span className="text-[10px] text-gray-400 truncate">
                {SURAHS[idToSurahAyah(pg.fromId).surah - 1].name} · جزء {arNum(idToJuz(pg.fromId))}
              </span>
              {/* «ملء الشاشة» في سطر الترويسة لا عائماً فوقه: الزرُّ العائم كان
                  يجلس على اسم السورة ورقم الوجه فيحجبهما. */}
              {expandable && pg.page === pages[0].page && (
                <button
                  type="button"
                  onClick={() => setFull(true)}
                  className="mushaf-expand-btn press ms-auto"
                  aria-label="افتح الوجه على ملء الشاشة"
                >
                  <Maximize2 size={12} /> ملء الشاشة
                </button>
              )}
            </div>
          )}

          {/* ورقةٌ في مجلَّد لا لوحٌ عائم: الكعب في الداخل بظلّه وزاويتُه
              مربّعة، وحافّةُ الأوراق المتراكمة في الخارج بسماكةٍ تقول أين أنت
              من المصحف. الشكل وحده يقول «يمنى» أو «يسرى» قبل الكلمة. */}
          <Leaf page={pg.page} side={pg.side} stack={stack}>
            <PageLines
              page={pg.page}
              zoom={pageZoom}
              // إبرازُ المقطع إنّما يميّزه عن سياقه؛ فإن كان الوجه كلّه هو
              // المقطع (قارئ الصفحات) فلا شيء يُميَّز عنه — وإبرازُ كلّ آية
              // يجعل الوجه مخطّطاً بصناديق بدل صفحةٍ متّصلة.
              highlight={!pg.whole}
              inPortion={(id) => id >= fromId && id <= toId}
              context={context}
              leadId={leadId}
              hidden={hidden}
              spotlightId={spotlightId}
              selectedId={selectedId}
              onAyahClick={onAyahClick}
              renderAyah={renderAyah}
              renderNumber={renderNumber}
              text={text}
            />
            {/* رقمُ الوجه في طُرّته، متوسّطاً أسفلَ الورقة كالمطبوع. */}
            <span className="absolute bottom-1.5 inset-x-0 text-center text-[11px] font-bold tabular-nums">
              <span className="mushaf-page-number">{arNum(pg.page)}</span>
            </span>
          </Leaf>
        </div>
      ))}
    </div>
  );

  if (!expandable) return sheet;
  return (
    <div className="mushaf-sheet-wrap relative">
      {sheet}
      {/* بلا ترويسةٍ يبقى الزرُّ عائماً على حافّة الورقة — لا سطرَ يسكن فيه. */}
      {!header && (
        <button
          type="button"
          onClick={() => setFull(true)}
          className="mushaf-expand-btn mushaf-expand-btn--float press"
          aria-label="افتح الوجه على ملء الشاشة"
        >
          <Maximize2 size={13} /> ملء الشاشة
        </button>
      )}
      {full && <MushafStage {...props} onClose={() => setFull(false)} />}
    </div>
  );
}

// ===================== الوجه على ملء الشاشة =====================
// المصحف الورقيّ لا يُقرأ في نافذةٍ بارتفاع ثلاثمئة بكسل: صورةُ الوجه هي رأس مال
// الحافظ، وكلّما صغرت ضاعت. هنا يُفتح **وجهٌ واحد يملأ الشاشة**، وثلاثةُ أشياء
// تجعله ملءاً حقيقياً لا طبقةً فوق الصفحة:
//
// ١) **`Fullscreen API`** عند الفتح (خلف واجهة `@/lib/platform/fullscreen`):
//    يطوي شريطَ المتصفّح وشريطَ النظام، فلا يبقى على الزجاج إلا الورقة. وحيث لا
//    يُدعَم (iOS Safari) تبقى الطبقةُ الغاطية كما كانت — زيادةٌ لا شرط.
// ٢) **الأدواتُ تعلو الوجه ولا تقتطع منه**: الشريطُ والتنقّل طبقتان معلّقتان
//    تنسحبان وحدهما بعد لحظتين ويعودان باللمس. كانا يأكلان مئةَ بكسلٍ من
//    الارتفاع دائماً، وهي عين ما يُقاس منه عرضُ الوجه.
// ٣) **«ملء الطول»**: شاشةُ الجوّال أطول من نسبة الوجه المطبوع، فيبقى تحته فراغ
//    مهما كبّرت. حين يُشغَّل تتوزّع الأسطرُ الخمسةَ عشر على الارتفاع كلّه —
//    مواضعُها من المطبوع لا تتغيّر، والذي يتغيّر ما بينها.
//
// و**النماذج** أربعة (ورق · المدينة · ليل · سادة): ورقٌ وحبرٌ وشكلُ تحديد،
// تُبدَّل من زرّ اللوحة وتُحفظ في تفضيلات القراءة فتسري على كلّ لوحٍ في التطبيق.
// وحالةُ اللوح تعبر كما هي: السترُ والإبرازُ ووسمُ الكلمات — الطورُ يمرّر كلّ
// خصائصه إلى `MushafSheet` نفسه. والتنقّل بين أوجه المقطع سحباً أو بالسهمين.
export function MushafStage({ onClose, ...props }: MushafSheetProps & { onClose: () => void }) {
  const pages = useMemo(() => portionPages(props.fromId, props.toId), [props.fromId, props.toId]);
  const [i, setI] = useState(0);
  const [prefs, setPrefs] = useState(DEFAULT_READ_PREFS);
  const [chrome, setChrome] = useState(true);
  const [models, setModels] = useState(false);
  const down = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => { setPrefs(loadReadPrefs()); }, []);

  // الملءُ الحقيقيّ يُطلب من داخل الإيماءة التي فتحت الطور (نافذةُ التفعيل
  // المؤقّت ما تزال مفتوحة هنا)، ويُترك عند الإغلاق مهما كان سببُه.
  useEffect(() => {
    void enterFullscreen();
    return () => { void exitFullscreen(); };
  }, []);

  const idx = Math.min(i, Math.max(0, pages.length - 1));
  const pg = pages[idx];
  const go = (step: number) => setI((v) => Math.min(pages.length - 1, Math.max(0, v + step)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      // المصحف يُقلَب من اليمين إلى اليسار: السهم الأيسر يتقدّم.
      if (e.key === "ArrowLeft") go(1);
      if (e.key === "ArrowRight") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages.length, onClose]);

  // الأدواتُ تنسحب وحدها فيخلو الزجاج للورقة — إلا وورقةُ النماذج مفتوحة.
  useEffect(() => {
    if (!chrome || models) return;
    const t = window.setTimeout(() => setChrome(false), 2600);
    return () => window.clearTimeout(t);
  }, [chrome, models, idx]);

  const patch = (p: Partial<ReadPrefs>) => {
    setPrefs((v) => ({ ...v, ...p }));
    saveReadPrefs(p);
  };
  const setZoomSaved = (z: number) => patch({ zoom: clampZoom(z) });

  if (!pg) return null;

  return (
    <div
      className={`mushaf-stage mushaf-skin-${prefs.skin}`}
      dir="rtl" role="dialog" aria-modal="true" aria-label="المصحف — ملء الشاشة"
    >
      <div
        className="mushaf-stage-fit"
        data-fill={prefs.fill ? "1" : undefined}
        style={{ ["--mushaf-zoom" as string]: prefs.zoom }}
        onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={(e) => {
          const s = down.current;
          down.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          // سحبةٌ أفقيّة صريحة وحدها تقلب الورقة؛ وما دونها لمسةٌ تُظهر الأدوات.
          if (Math.abs(dx) > Math.abs(e.clientY - s.y)) {
            const step = turnStep(dx);
            if (step) { go(step); return; }
          }
          if (Math.abs(dx) < 6 && Math.abs(e.clientY - s.y) < 6) {
            if (models) { setModels(false); return; }
            setChrome((v) => !v);
          }
        }}
        onPointerCancel={() => { down.current = null; }}
      >
        <MushafSheet
          {...props}
          fromId={pg.fromId}
          toId={pg.toId}
          header={false}
          zoom={1}
          skin={prefs.skin}
          expandable={false}
          maxHeight={undefined}
          className=""
        />
      </div>

      <div className={`mushaf-stage-bar ${chrome ? "" : "is-hidden"}`}>
        <button type="button" onClick={onClose} className="mushaf-stage-icon press" aria-label="إغلاق"><X size={18} /></button>
        <div className="mushaf-stage-title">
          <strong>{SURAHS[idToSurahAyah(pg.fromId).surah - 1].name}</strong>
          <small>صفحة {arNum(pg.page)} · {pg.side} · جزء {arNum(idToJuz(pg.fromId))}</small>
        </div>
        <div className="mushaf-stage-tools">
          <button
            type="button" onClick={() => setZoomSaved(prefs.zoom - ZOOM_RANGE.step)}
            disabled={prefs.zoom <= ZOOM_RANGE.min} className="mushaf-stage-icon press" aria-label="تصغير"
          ><ZoomOut size={16} /></button>
          <button
            type="button" onClick={() => setZoomSaved(prefs.zoom + ZOOM_RANGE.step)}
            disabled={prefs.zoom >= ZOOM_RANGE.max} className="mushaf-stage-icon press" aria-label="تكبير"
          ><ZoomIn size={16} /></button>
          <button
            type="button" onClick={() => setModels((v) => !v)}
            className={`mushaf-stage-icon press ${models ? "is-on" : ""}`}
            aria-pressed={models} aria-label="نماذج العرض"
          ><Palette size={16} /></button>
        </div>
      </div>

      {pages.length > 1 && (
        <div className={`mushaf-stage-nav ${chrome ? "" : "is-hidden"}`}>
          <button type="button" onClick={() => go(-1)} disabled={idx === 0} className="mushaf-stage-turn press">
            <ChevronRight size={16} /> السابق
          </button>
          <span className="mushaf-stage-count tabular-nums">{arNum(idx + 1)} / {arNum(pages.length)}</span>
          <button type="button" onClick={() => go(1)} disabled={idx >= pages.length - 1} className="mushaf-stage-turn press">
            التالي <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {models && (
        <SkinSheet
          skin={prefs.skin}
          fill={prefs.fill}
          onSkin={(skin) => patch({ skin })}
          onFill={(fill) => patch({ fill })}
          onClose={() => setModels(false)}
        />
      )}
    </div>
  );
}

// ورقةُ النماذج: أربعُ صفحاتٍ للوجه الواحد، كلٌّ منها بعيّنةِ ورقٍ وحبرٍ وتحديد
// تُرى قبل أن تُختار — والاختيار يقع على الوجه خلفها فوراً، فالورقةُ لا تحجب إلا
// أسفلَ الشاشة. الاختيار يُحفظ في تفضيلات القراءة فيسري على كلّ لوحٍ في التطبيق
// (بطاقةُ الحفظ · التسميع · اختبار المواضع) لا على هذا الطور وحده.
function SkinSheet({
  skin, fill, onSkin, onFill, onClose,
}: {
  skin: MushafSkin;
  fill: boolean;
  onSkin: (s: MushafSkin) => void;
  onFill: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div className="mushaf-models" role="group" aria-label="نماذج عرض المصحف">
      <div className="mushaf-models-head">
        <span>نماذج العرض</span>
        <button type="button" onClick={onClose} className="mushaf-models-x press" aria-label="إغلاق النماذج">
          <X size={14} />
        </button>
      </div>

      <div className="mushaf-models-row">
        {MUSHAF_SKINS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSkin(m.id)}
            aria-pressed={skin === m.id}
            className={`mushaf-model press ${skin === m.id ? "is-on" : ""}`}
          >
            <span className={`mushaf-model-swatch mushaf-skin-${m.id}`} aria-hidden>
              <i /><i /><i className="is-mark" /><i />
            </span>
            <span className="mushaf-model-name">
              {m.label}
              {skin === m.id && <Check size={12} />}
            </span>
            <span className="mushaf-model-hint">{m.hint}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onFill(!fill)}
        aria-pressed={fill}
        className={`mushaf-models-fill press ${fill ? "is-on" : ""}`}
      >
        <StretchVertical size={15} />
        <span>
          <strong>ملء الطول</strong>
          <small>توزيع الأسطر على ارتفاع الشاشة كاملاً</small>
        </span>
        <span className={`mushaf-switch ${fill ? "is-on" : ""}`} aria-hidden />
      </button>
    </div>
  );
}

// ===================== أسطر الوجه =====================
// السطر هنا وحدةُ الرسم لا الآية: الآية تنكسر على أسطرٍ كما في المطبوع، ومقاطعُها
// تحمل هويّتها فيبقى النقر والستر والإبراز على الآية كاملةً عابراً للأسطر.
//
// عرضُ السطر ثابتٌ نسبةً إلى الوجه (`.mushaf-page` في globals.css)، وما بقي من
// فرقٍ بعد التطويل المدسوس يُكمله `scaleX` — لا `text-justify` يتصرّف بالكلمات
// كيف شاء. وحدُ المعرفة انتهى هنا: مواضعُ الأسطر صارت مقيسةً لا مقدَّرة.
function PageLines({
  page, zoom, text, highlight, inPortion, context, leadId,
  hidden, spotlightId, selectedId, onAyahClick, renderAyah, renderNumber,
}: {
  page: number;
  zoom: number;
  text: string[];
  highlight: boolean;
  inPortion: (id: number) => boolean;
  context: SheetContext;
  leadId: number | null;
  hidden?: (id: number) => boolean;
  spotlightId: number | null;
  selectedId: number | null;
  onAyahClick?: (id: number) => void;
  renderAyah?: (a: SheetAyah, part: SheetPart) => React.ReactNode;
  renderNumber?: (a: SheetAyah) => React.ReactNode;
}) {
  // حزمةُ الوجه قد تكون محمّلةً من وجهٍ سابق — فنرسم بها فوراً بلا وميض.
  const [lines, setLines] = useState<MushafPageLines | null>(() => peekPageLines(page));
  // تعذّر إحضارُ الحزمة (انقطاعٌ أو ملفٌّ لم يصل). `retry` يزيد فيُعاد الأثر.
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true;
    const ready = peekPageLines(page);
    setLines(ready);
    setFailed(false);
    if (!ready) {
      loadPageLines(page).then(
        (l) => { if (alive) setLines(l); },
        // بلا هذا يبقى القارئ على هيكلٍ فارغ إلى الأبد، ويخرج الرفضُ غيرَ
        // ملتقَط إلى وحدة التحكّم. الآن حالةُ خطأٍ هادئة وزرُّ إعادةِ محاولة.
        () => { if (alive) setFailed(true); }
      );
    }
    return () => { alive = false; };
  }, [page, retry]);

  // ريثما تصل الحزمة: أسطرُ الوجه بعددها فارغة — يبقى للوجه ارتفاعُه فلا يقفز
  // ما تحته حين يصل النصّ. وحالةُ الخطأ تُرسم **داخل** هذا الهيكل نفسه، فيبقى
  // للوجه ارتفاعُه ولا ينكمش المصحف تحت يد القارئ.
  if (!lines) {
    return (
      <div className="mushaf-sheet relative" style={{ width: `${zoom * 100}%` }} aria-busy={!failed}>
        <div className={`mushaf-page ${failed ? "opacity-40" : ""}`}>
          {Array.from({ length: linesOnPage(page) }, (_, i) => (
            <div key={i} className="mushaf-line">
              <span className="mushaf-trace">&nbsp;</span>
            </div>
          ))}
        </div>
        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-4">
            <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
              تعذّر إحضار هذا الوجه
            </p>
            <button
              onClick={() => setRetry((n) => n + 1)}
              className="text-[11px] font-bold text-white bg-quran rounded-lg px-3 py-1.5 press"
            >
              إعادة المحاولة
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`mushaf-scroll ${zoom > 1 ? "overflow-x-auto" : ""}`}
      style={zoom > 1 ? { scrollbarWidth: "none" } : undefined}
    >
      <div className="mushaf-sheet" style={{ width: `${zoom * 100}%` }}>
        {/* وجهُ الفاتحة وأوّلِ البقرة ثمانيةُ أسطرٍ لا خمسةَ عشر: توزيعُها على
            ارتفاع الشاشة يفتح بينها فجواتٍ لا وجود لها في المطبوع. فالوجهُ
            القصير يتوسّط بتباعده الطبيعيّ، والتوزيعُ للوجه التامّ وحده. */}
        <div className="mushaf-page" data-short={lines.length < 12 ? "1" : undefined}>
          {lines.map((line, i) => {
            const centered = line.stretch === CENTERED;
            return (
              <div
                key={i}
                className={`mushaf-line ${centered ? "mushaf-line--center" : ""}`}
                style={centered ? undefined : { transform: `scaleX(${line.stretch})` }}
              >
                {line.runs.map((run, j) => (
                  <RunSpan
                    key={j}
                    run={run}
                    text={text}
                    highlight={highlight}
                    inPortion={inPortion}
                    context={context}
                    leadId={leadId}
                    hidden={hidden}
                    spotlightId={spotlightId}
                    selectedId={selectedId}
                    onAyahClick={onAyahClick}
                    renderAyah={renderAyah}
                    renderNumber={renderNumber}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RunSpan({
  run, text, highlight, inPortion, context, leadId,
  hidden, spotlightId, selectedId, onAyahClick, renderAyah, renderNumber,
}: {
  run: MushafRun;
  text: string[];
  highlight: boolean;
  inPortion: (id: number) => boolean;
  context: SheetContext;
  leadId: number | null;
  hidden?: (id: number) => boolean;
  spotlightId: number | null;
  selectedId: number | null;
  onAyahClick?: (id: number) => void;
  renderAyah?: (a: SheetAyah, part: SheetPart) => React.ReactNode;
  renderNumber?: (a: SheetAyah) => React.ReactNode;
}) {
  if (run.id === SURA_HEADER) return <span className="mushaf-sura">{run.text}</span>;
  if (run.id === BASMALA) return <span className="mushaf-basmala">{run.text}</span>;

  const { surah, ayah } = idToSurahAyah(run.id);
  const mine = inPortion(run.id);
  const a: SheetAyah = { id: run.id, surah, ayah, text: text[run.id] ?? "", inPortion: mine };

  const veiled = mine ? !!hidden?.(run.id) : false;
  // السياق يُطمس شكلاً إلا آيةَ التلقين — وهي الآية التي قبل المقطع في وجهه،
  // مدخلُ الاسترجاع الطبيعيّ.
  const traced = !mine && context === "shape" && run.id !== leadId;
  const dimmed = !mine || (spotlightId != null && run.id !== spotlightId);
  const selected = selectedId === run.id;

  // الستر والطمس يُبقيان النصّ بعرضه تماماً ويذهبان بلونه — فلا يتزحزح سطر.
  const body = veiled || traced
    ? <span className={veiled ? "mushaf-veil" : "mushaf-trace"}>{run.text}</span>
    : renderAyah && mine
    ? renderAyah(a, { text: run.text, wordOffset: run.wordOffset })
    : run.text;

  // شكلُ التحديد من النموذج لا من صنفٍ مكتوبٍ هنا: `mushaf-focus` (المقطع
  // المطلوب) و`mushaf-pick` (الآية المحدَّدة) يرسمهما `globals.css` لكلّ نموذجٍ
  // بطريقته — قلمَ تحديدٍ برأسين مستديرين، أو وشاحاً هادئاً، أو هالةً في الليل.
  // كانا صندوقين شفّافين بزاويةٍ ٣px يقطعهما انكسارُ السطر فيبدوان قصاصات.
  return (
    <span
      id={run.wordOffset === 0 ? `q-page-ayah-${run.id}` : undefined}
      onClick={onAyahClick ? () => onAyahClick(run.id) : undefined}
      className={`mushaf-run box-decoration-clone ${onAyahClick ? "cursor-pointer" : ""} ${
        selected
          ? "mushaf-pick"
          : highlight && mine && !veiled
          ? "mushaf-focus" // المقطع المطلوب مُبرَزٌ داخل وجهه
          : ""
      } ${dimmed && !veiled && !traced ? "mushaf-dim" : "mushaf-ink"}`}
    >
      {body}
      {run.num > 0 && (renderNumber && mine
        ? renderNumber(a)
        : <AyahNumber num={run.num} dimmed={dimmed} />)}
    </span>
  );
}

// رقمُ الآية **كما يكتبه مصدر التخطيط نفسه**: قوسان مزخرفان (U+FD3F/U+FD3E)
// بينهما الرقم بأرقامٍ هندية — والخطّ (حفص) يركّبهما طُرّةً مؤطَّرة كالمطبوع.
//
// وهذا ليس ذوقاً بل قياس: عرضُ السطر في البيانات مقيسٌ **بالرقم على هذه الصورة**
// داخل النصّ، فرسمُه بصورةٍ أخرى (وردةُ ۝ مثلاً) يغيّر عرض السطر عمّا قِيس فتفيض
// الأسطر أو تقصر. كان المصدر السابق («أميري قرآن») يكتبه `۝49` فكان هذا هو
// الصواب حينها — بُدِّل المصدر والخطّ معاً، فتبدّلت معهما صورةُ الرقم.
//
// والأرقامُ هندية من `arNum` — البوّابة الوحيدة للتحويل (راجع CLAUDE.md).
export function AyahNumber({ num, dimmed = false }: { num: number; dimmed?: boolean }) {
  return (
    <span className={`mushaf-num ${dimmed ? "is-dim" : ""}`} aria-label={`آية ${num}`}>
      {`\uFD3F${arNum(num)}\uFD3E`}
    </span>
  );
}

// ===================== الورقة =====================
// ثلاثة أشياء تجعل المستطيل ورقةً في مجلَّد: **الكعب** (حافّةٌ داخلية مربّعة
// الزاوية عليها ظلُّ الطيّة)، و**الطرف الخارجيّ** المستدير الذي تُمسكه لتقلبها،
// و**سماكةُ الأوراق** خلفه. والجهةُ تُقرأ من ترتيب هذه الثلاثة: الكعب يسارَ
// اليُمنى ويمينَ اليُسرى — كما في المصحف بيدك تماماً.
//
// السماكة صادقة: على الطرف الخارجيّ لليُمنى تُرسم أوراقُ ما **قرأتَه** (وهي في
// الكتاب العربيّ تتراكم يميناً)، وعلى طرف اليُسرى أوراقُ ما **بقي**. فسماكةٌ
// رفيعة يميناً تعني أنّك في أوّل المصحف، بلا رقمٍ تقرأه. الحسابُ في
// `@/lib/quran/book`.
export function Leaf({
  page, side, stack = true, className = "", children,
}: {
  page: number;
  side: PageSide;
  stack?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const spineOnLeft = side === "يمنى"; // الكعب في داخل الوجه المفتوح
  const { beforePct, afterPct } = leafStack(page);
  const edgePx = edgeWidth(spineOnLeft ? beforePct : afterPct);

  return (
    <div className={`mushaf-leaf relative ${className}`}>
      <div
        className={`mushaf-leaf-page relative px-3 pt-3 pb-7 ${spineOnLeft ? "rounded-l-sm rounded-r-2xl" : "rounded-r-sm rounded-l-2xl"}`}
        style={stack ? (spineOnLeft ? { marginRight: edgePx } : { marginLeft: edgePx }) : undefined}
      >
        {children}

        {/* ظلُّ الطيّة عند الكعب — يعمق تدريجاً كما ينحني الورق نحو الخياطة */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 w-7 ${
            spineOnLeft
              ? "left-0 bg-gradient-to-r from-black/[0.09] via-black/[0.03] to-transparent dark:from-black/40"
              : "right-0 bg-gradient-to-l from-black/[0.09] via-black/[0.03] to-transparent dark:from-black/40"
          }`}
        />
        {/* خيطُ الكعب نفسه */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 w-[2px] bg-quran/25 ${spineOnLeft ? "left-0" : "right-0"}`}
        />
      </div>

      {/* حافّة الأوراق: خطوطٌ متقاربة كحوافّ الورق حين تنظر إلى المصحف من جنبه */}
      {stack && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-2 rounded-sm ${spineOnLeft ? "right-0" : "left-0"}`}
          style={{
            width: edgePx,
            backgroundImage:
              "repeating-linear-gradient(to right, rgba(120,95,55,0.30) 0px, rgba(120,95,55,0.30) 1px, transparent 1px, transparent 3px)",
          }}
        />
      )}
    </div>
  );
}
