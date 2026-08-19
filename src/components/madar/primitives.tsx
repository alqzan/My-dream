/**
 * أوليّاتُ تصميم مدار — القِطعُ التي تتكرّر في كلّ شاشةٍ منقولة.
 *
 * **لماذا أنماطٌ ضمنية (inline) لا أصنافُ Tailwind؟** مقاساتُ التصميم ليست
 * على سُلَّم Tailwind (١١٫٥px · ‎.16em · نصفُ قطرٍ ١٩px · ارتفاعٌ ٤٢px)، فكلُّ
 * قيمةٍ منها تحتاج صنفَ قيمةٍ مفردة `[11.5px]`. عشراتُ هذه الأصناف أسوأُ
 * قراءةً من النمط الضمنيّ نفسِه، وتُخفي أنّ الرقم **مقيسٌ من التصميم** لا
 * مختارٌ من سُلَّم. فالنمطُ الضمنيُّ هنا قرارٌ لا كسل، ومحصورٌ في
 * `components/madar/` وحدَها؛ بقيّةُ المستودع تبقى على Tailwind.
 *
 * الألوانُ كلُّها من رموز `globals.css` (`--paper` · `--ink` · `--gold` …)
 * فتتبع الوضعَ الليلي بلا قاعدةٍ ثانية.
 */
import type { CSSProperties, ReactNode } from "react";

/* ───────────────────────── العلامات ───────────────────────── */

/** المعيَّنُ الصغير الذي يسبق كلَّ عنوانِ قسم. */
export function Diamond({ size = 6, color = "var(--gold)" }: { size?: number; color?: string }) {
  return <span className="mdr-diamond" style={{ width: size, height: size, background: color }} />;
}

/** الشمسةُ الثمانية — شارةُ الترويسة و«زاد اليوم». */
export function Star({ size = 12, color = "var(--gold)" }: { size?: number; color?: string }) {
  return <span className="mdr-star" style={{ width: size, height: size, background: color }} />;
}

/* ───────────────────────── ترويسةُ القسم ───────────────────────── */

/**
 * `— ◆ العنوان ────────────── الحاشية`
 * الخطُّ الفاصل يمتدّ لما بقي، والحاشيةُ (عدد/زرّ) تلتصق بالطرف.
 */
export function SectionHead({
  title,
  mark = "var(--gold)",
  titleColor = "var(--ink52)",
  trailing,
  marginTop = 22,
  marginBottom = 0,
  star,
}: {
  title: string;
  mark?: string;
  titleColor?: string;
  trailing?: ReactNode;
  marginTop?: number;
  marginBottom?: number;
  /** بعضُ الأقسام تُعلَّم بشمسةٍ لا بمعيّن (في «مثل هذا اليوم» و«زاد اليوم»). */
  star?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, margin: `${marginTop}px 0 ${marginBottom}px` }}>
      {star ? <Star size={12} color={mark} /> : <Diamond size={6} color={mark} />}
      <h2
        style={{
          margin: 0,
          fontSize: 11.5,
          letterSpacing: ".16em",
          fontWeight: 700,
          color: titleColor,
        }}
      >
        {title}
      </h2>
      <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      {trailing}
    </div>
  );
}

/** حاشيةُ الترويسة حين تكون مجرّدَ عدد. */
export function HeadMeta({ children }: { children: ReactNode }) {
  return <span style={{ fontSize: 11, color: "var(--ink34)", whiteSpace: "nowrap" }}>{children}</span>;
}

/* ───────────────────────── الأسطح ───────────────────────── */

/**
 * البطاقةُ الورقية. `tone` يحدّد الحدَّ والأرضية:
 * - `plain` حدٌّ رماديٌّ وأرضيةُ الورق الثاني (أكثرُها استعمالاً)
 * - `gold` حدٌّ ذهبيٌّ — للبطاقات التي تحمل معنى «زادٌ» أو «الآن»
 * - `wash` حدٌّ ذهبيٌّ مع تدرّجٍ ملوّنٍ خافت (يُمرَّر لونُه في `wash`)
 */
export function Panel({
  children,
  tone = "plain",
  wash,
  radius = 24,
  padding = 18,
  style,
}: {
  children: ReactNode;
  tone?: "plain" | "gold" | "wash";
  /** لونُ التدرّج حين يكون `tone="wash"` — مثل `"rgba(28,99,80,.13)"`. */
  wash?: string;
  radius?: number;
  padding?: number;
  style?: CSSProperties;
}) {
  const border = tone === "plain" ? "var(--line)" : "var(--gline)";
  const background =
    tone === "wash" && wash
      ? `linear-gradient(180deg, ${wash}, transparent 74%)`
      : tone === "gold"
        ? "linear-gradient(200deg, rgba(185,134,47,.12), transparent 72%)"
        : "var(--paper2)";
  return (
    <div
      style={{
        padding,
        border: `1px solid ${border}`,
        borderRadius: radius,
        background,
        boxSizing: "border-box",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ───────────────────────── التبويبات ───────────────────────── */

/** شريطُ التبويبات المنزلق — حبّةٌ داكنةٌ للنشط على أرضيةِ ورقٍ ثانٍ. */
export function TabBar({
  tabs,
  active,
  onPick,
  marginTop = 10,
}: {
  tabs: readonly string[];
  active: string;
  onPick: (t: string) => void;
  marginTop?: number;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        margin: `${marginTop}px 0 0`,
        padding: 4,
        borderRadius: 18,
        background: "var(--paper2)",
        border: "1px solid var(--line)",
      }}
    >
      {tabs.map((t) => {
        const on = t === active;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            style={{
              flex: 1,
              minHeight: 42,
              padding: "0 8px",
              background: on ? "var(--ink)" : "transparent",
              border: "none",
              borderRadius: 14,
              color: on ? "var(--paper)" : "var(--ink52)",
              fontSize: 13,
              fontWeight: 800,
              whiteSpace: "nowrap",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {t}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── الأزرار ───────────────────────── */

/**
 * زرُّ التصميم. `kind`:
 * - `ink` حبرٌ ممتلئ — الفعلُ الرئيس
 * - `ghost` حدٌّ رفيعٌ وخلفيةٌ شفافة — الفعلُ الثانوي
 * - `gold` حدٌّ ذهبيٌّ ونصٌّ ذهبيّ
 *
 * `minHeight` لا ينزل عن ٤٤ في أيِّ استعمال — هدفُ اللمس الذي يحرسه
 * `ROADMAP.md`؛ فالافتراضيُّ هنا ٤٤ ولا يُمرَّر أقلُّ منه.
 */
export function MdrButton({
  children,
  onClick,
  kind = "ghost",
  minHeight = 44,
  grow,
  title,
  disabled,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "ink" | "ghost" | "gold" | "clay";
  minHeight?: number;
  grow?: boolean;
  title?: string;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const skin: Record<string, CSSProperties> = {
    ink: { background: "var(--ink)", color: "var(--paper)", border: "none", fontWeight: 900 },
    ghost: { background: "transparent", color: "var(--ink72)", border: "1px solid var(--line)", fontWeight: 800 },
    gold: { background: "transparent", color: "var(--gold)", border: "1px solid var(--gline)", fontWeight: 800 },
    clay: { background: "transparent", color: "var(--clay)", border: "1px solid var(--line)", fontWeight: 800 },
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        minHeight: Math.max(44, minHeight),
        padding: "0 15px",
        borderRadius: 14,
        fontSize: 13,
        fontFamily: "inherit",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 1,
        flex: grow ? 1 : undefined,
        ...skin[kind],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ───────────────────────── العدّاد ───────────────────────── */

/** صفُّ `− العدد +` المتكرّر (الركعات · السنن الرواتب). */
export function Stepper({
  label,
  value,
  onDown,
  onUp,
  emphasis,
}: {
  label: string;
  /** العددُ منسَّقاً — يصل جاهزاً من `arNum` فلا تنسيقَ هنا. */
  value: string;
  onDown: () => void;
  onUp: () => void;
  /** صيغةُ «قيام الليل»: زرُّ الزيادة حبرٌ ممتلئ والعددُ أكبر. */
  emphasis?: boolean;
}) {
  const box: CSSProperties = {
    width: 44,
    height: 44,
    background: "transparent",
    border: "1px solid var(--line)",
    borderRadius: emphasis ? 13 : 0,
    fontSize: emphasis ? 18 : 17,
    fontWeight: 900,
    color: "var(--ink72)",
    fontFamily: "inherit",
    cursor: "pointer",
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        margin: emphasis ? "14px 0 0" : undefined,
        padding: emphasis ? undefined : "15px 0",
        borderTop: emphasis ? undefined : "1px solid var(--line)",
        flexWrap: "wrap",
      }}
    >
      <span style={{ flex: 1, minWidth: emphasis ? 110 : undefined, fontSize: emphasis ? 13.5 : 15, fontWeight: 700 }}>
        {label}
      </span>
      <button type="button" onClick={onDown} style={box} aria-label={`أنقِص ${label}`}>
        −
      </button>
      <span
        style={{
          minWidth: emphasis ? 52 : 46,
          textAlign: "center",
          fontSize: emphasis ? 20 : 17,
          fontWeight: 900,
        }}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onUp}
        aria-label={`زِد ${label}`}
        style={
          emphasis
            ? { ...box, background: "var(--ink)", color: "var(--paper)", border: "none" }
            : box
        }
      >
        +
      </button>
    </div>
  );
}

/* ───────────────────────── جذرُ الشاشة ───────────────────────── */

/** غلافُ الشاشة المنقولة — يفرض ورقَ التصميم وحشوتَه الأفقية. */
export function MdrScreen({ children }: { children: ReactNode }) {
  return (
    <div className="mdr" style={{ minHeight: "100%" }}>
      <div style={{ padding: "0 20px 24px" }}>{children}</div>
    </div>
  );
}
