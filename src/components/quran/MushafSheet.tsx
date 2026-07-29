"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { SURAHS, idToSurahAyah, idToJuz } from "@/lib/quran/meta";
import { portionPages } from "@/lib/quran/portionPage";
import { leafStack, edgeWidth } from "@/lib/quran/book";
import type { PageSide } from "@/lib/quran/page";
import { loadReadPrefs, DEFAULT_READ_PREFS } from "@/lib/quran/readPrefs";
import { SpreadGlyph } from "@/components/quran/SpreadGlyph";

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
// **حدّ المعرفة، وقد قُصِد**: بيانات المستودع تعرف أوّل آيةٍ في كلّ وجه ولا تعرف
// توزيع الأسطر داخله (راجع `src/lib/quran/page.ts`). فحدودُ الوجه ورقمُه وجهتُه
// **قاطعة**، وأمّا مواضع الأسطر فتقريبٌ يرسمه النصّ المضبوط (`text-justify`) لا
// نسخةٌ من مصحف المدينة. لا نَعِد المالك بما لا نملك.
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

// كيف تُعرض آياتُ الوجه خارج المقطع:
//   text  — نصّاً خافتاً: صورةُ الوجه كاملة (الأصل في الحفظ والمراجعة).
//   shape — أثراً بلا نصّ: يبقى شكل الوجه ولا يتسرّب ما لم يُطلب كشفُه.
//   none  — المقطع وحده (بطاقاتٌ ضيّقة لا تحتمل وجهاً كاملاً).
export type SheetContext = "text" | "shape" | "none";

export function MushafSheet({
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
  size, lh,
  maxHeight,
  stack = true,
  className = "",
}: {
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
  /** بديلُ رسم نصّ الآية — لوسم الكلمات أو طمس موضعٍ منها. */
  renderAyah?: (a: SheetAyah) => React.ReactNode;
  /** بديلُ رسم رقم الآية — حين يكون زرّاً (وسم الآية كاملةً). */
  renderNumber?: (a: SheetAyah) => React.ReactNode;
  onAyahClick?: (id: number) => void;
  size?: number;
  lh?: number;
  /** ارتفاعٌ أقصى بالبكسل مع تمرير — للبطاقات داخل الصفحات. */
  maxHeight?: number;
  /** سماكةُ الأوراق على الطرف الخارجيّ (تُطفأ في المساحات الضيّقة جداً). */
  stack?: boolean;
  className?: string;
}) {
  // التفضيلات تُقرأ بعد التركيب لا أثناء الرسم الأوّل: الموقع ثابتٌ مُصدَّر
  // مسبقاً، فقراءةُ localStorage في أوّل رسمٍ تُخالف ما صُدِّر.
  const [prefs, setPrefs] = useState(DEFAULT_READ_PREFS);
  useEffect(() => { setPrefs(loadReadPrefs()); }, []);
  const fontSize = size ?? prefs.size;
  const lineHeight = lh ?? prefs.lh;

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

  return (
    <div
      ref={scroller}
      className={`space-y-3 ${maxHeight ? "overflow-y-auto" : ""} ${className}`}
      style={maxHeight ? { maxHeight } : undefined}
    >
      {pages.map((pg) => {
        const first = context === "none" ? pg.fromId : pg.start;
        const last = context === "none" ? pg.toId : pg.end;
        const ayat: SheetAyah[] = [];
        for (let id = first; id <= last; id++) {
          const { surah, ayah } = idToSurahAyah(id);
          ayat.push({ id, surah, ayah, text: text[id] ?? "", inPortion: id >= fromId && id <= toId });
        }

        return (
          <div key={pg.page}>
            {header && (
              <div className="flex items-center gap-2 mb-1.5 px-0.5">
                <SpreadGlyph side={pg.side} className="w-7 h-5" />
                <span className="text-[11px] font-bold text-quran">صفحة {pg.page} · {pg.side}</span>
                <span className="text-[10px] text-gray-400 truncate">
                  {SURAHS[idToSurahAyah(pg.fromId).surah - 1].name} · جزء {idToJuz(pg.fromId)}
                </span>
              </div>
            )}

            {/* ورقةٌ في مجلَّد لا لوحٌ عائم: الكعب في الداخل بظلّه وزاويتُه
                مربّعة، وحافّةُ الأوراق المتراكمة في الخارج بسماكةٍ تقول أين أنت
                من المصحف. الشكل وحده يقول «يمنى» أو «يسرى» قبل الكلمة. */}
            <Leaf page={pg.page} side={pg.side} stack={stack}>
              <p
                className="font-quran text-justify font-bold text-gray-800 dark:text-gray-100"
                dir="rtl"
                style={{ fontSize: `${fontSize}px`, lineHeight }}
              >
                {ayat.map((v) => (
                  <AyahSpan
                    key={v.id}
                    v={v}
                    basmala={text[1] ?? ""}
                    // إبرازُ المقطع إنّما يميّزه عن سياقه؛ فإن كان الوجه كلّه هو
                    // المقطع (قارئ الصفحات) فلا شيء يُميَّز عنه — وإبرازُ كلّ آية
                    // يجعل الوجه مخطّطاً بصناديق بدل صفحةٍ متّصلة.
                    highlight={!pg.whole}
                    veiled={v.inPortion ? !!hidden?.(v.id) : false}
                    // السياق يُطمس شكلاً إلا آيةَ التلقين — وهي الآية التي قبل
                    // المقطع في وجهه، مدخلُ الاسترجاع الطبيعيّ.
                    traced={!v.inPortion && context === "shape" && v.id !== leadId}
                    dimmed={!v.inPortion || (spotlightId != null && v.id !== spotlightId)}
                    selected={selectedId === v.id}
                    onClick={onAyahClick}
                    renderAyah={renderAyah}
                    renderNumber={renderNumber}
                  />
                ))}
              </p>
              <span className="absolute bottom-1.5 inset-x-0 text-center text-[11px] font-bold text-quran/50 tabular-nums">
                {pg.page}
              </span>
            </Leaf>
          </div>
        );
      })}
    </div>
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
    <div className={`relative ${className}`}>
      <div
        className={`relative border-2 border-quran/20 bg-gradient-to-b from-quran/[0.05] to-transparent p-4 pb-7 ${
          spineOnLeft
            ? "rounded-l-sm rounded-r-2xl border-l-quran/40 ms-0 me-0"
            : "rounded-r-sm rounded-l-2xl border-r-quran/40"
        }`}
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

function AyahSpan({
  v, basmala, highlight, veiled, traced, dimmed, selected, onClick, renderAyah, renderNumber,
}: {
  v: SheetAyah;
  basmala: string;
  highlight: boolean;
  veiled: boolean;
  traced: boolean;
  dimmed: boolean;
  selected: boolean;
  onClick?: (id: number) => void;
  renderAyah?: (a: SheetAyah) => React.ReactNode;
  renderNumber?: (a: SheetAyah) => React.ReactNode;
}) {
  const startsSurah = v.ayah === 1 && v.surah !== 1 && v.surah !== 9;
  const body = veiled || traced
    ? <Trace len={v.text.length} tone={veiled ? "veil" : "context"} />
    : renderAyah && v.inPortion
    ? renderAyah(v)
    : v.text;

  return (
    <span>
      {startsSurah && (
        <span className="block text-center text-[0.8em] text-quran font-bold my-3 pb-2 border-b border-quran/10">
          {SURAHS[v.surah - 1].name}
          <span className="block">{basmala}</span>
        </span>
      )}
      <span
        id={`q-page-ayah-${v.id}`}
        onClick={onClick ? () => onClick(v.id) : undefined}
        className={`rounded px-0.5 box-decoration-clone transition-colors ${onClick ? "cursor-pointer hover:bg-quran/[0.06]" : ""} ${
          selected
            ? "bg-quran/15"
            : highlight && v.inPortion && !veiled
            ? "bg-quran/[0.07]" // المقطع المطلوب مُبرَزٌ داخل وجهه
            : ""
        } ${dimmed && !veiled && !traced ? "text-gray-400 dark:text-gray-500" : ""}`}
      >
        {body}
        {renderNumber && v.inPortion ? renderNumber(v) : (
          <span className={`inline-flex items-center justify-center text-[0.6em] mx-1 align-middle ${dimmed ? "text-quran/40" : "text-quran"}`}>
            ﴿{v.ayah}﴾
          </span>
        )}
      </span>
    </span>
  );
}

// أثرُ آيةٍ مستورة: سترٌ لا حذف — طولُ الأثر يتناسب مع طول الآية، فيبقى شكلُ
// الوجه (وهو نفسه ما تحفظه العين) قائماً تحت الستر.
export function Trace({ len, tone }: { len: number; tone: "veil" | "context" }) {
  return (
    <span
      aria-label="آية مستورة"
      className={`inline-block align-middle rounded select-none ${tone === "veil" ? "bg-quran/15" : "bg-gray-400/15 dark:bg-white/[0.07]"}`}
      style={{ width: `${Math.min(100, Math.max(8, len / 2.2))}%`, height: "0.62em" }}
    />
  );
}
