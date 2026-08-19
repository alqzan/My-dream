"use client";
/**
 * **الأقواسُ الثلاثة** — الصلاةُ والقرآنُ والمال في صفٍّ واحد.
 *
 * كلُّ قوسٍ محرابٌ يمتلئ بقدر حاله، **وواحدٌ منها فقط يُطوَّق بالذهب**: القوسُ
 * المستحقُّ الآن. شاشةٌ تصرخ بثلاثة نداءاتٍ لا تُقرأ، فالتطويقُ اختيارٌ لا زينة.
 */
import { bigFitSize, fillY, type DueArc } from "@/lib/sundial";

export interface ArcSpec {
  key: DueArc;
  label: string;
  /** الرقمُ الكبير في وسط القوس — قد يكون نصّاً («تمَّ»). */
  big: string;
  unit: string;
  sub: string;
  /** نسبةُ الامتلاء (٠..١). */
  ratio: number;
  /** رمزُ اللون الأساس. */
  color: string;
  /** رمزُ لون الغَسل الخفيف. */
  wash: string;
  onClick: () => void;
}

export function ThreeArcs({ arcs, due }: { arcs: ArcSpec[]; due: DueArc }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, margin: "14px 0 0" }}>
      {arcs.map((a) => (
        <button
          key={a.key}
          type="button"
          onClick={a.onClick}
          style={{
            flex: 1, position: "relative", border: "none", background: "transparent",
            padding: 0, color: "var(--ink)", borderRadius: 18, cursor: "pointer",
            fontFamily: "inherit",
            boxShadow: due === a.key ? "0 0 0 2px var(--gold)" : "none",
          }}
        >
          <svg viewBox="0 0 100 132" style={{ width: "100%", display: "block" }} aria-hidden>
            <defs>
              <clipPath id={`mdrArc-${a.key}`}>
                <path d="M25 132 L25 60 A28 28 0 1 1 75 60 L75 132 Z" />
              </clipPath>
            </defs>
            <rect x="0" y="0" width="100" height="132" fill={a.wash} clipPath={`url(#mdrArc-${a.key})`} />
            {/* منسوبُ الماء: كان `opacity=".4"` فوق غَسلٍ من اللون نفسِه، فبدا
                القوسُ ممتلئاً دائماً مهما كان حالُك — والقوسُ الذي لا يتغيّر
                بتغيّر عملك ليس مقياساً. الآن للمنسوب حدٌّ ظاهرٌ فوقه. */}
            <rect
              x="0" y={fillY(a.ratio)} width="100" height="132"
              fill={a.color} opacity=".62" clipPath={`url(#mdrArc-${a.key})`}
            />
            {a.ratio > 0.02 && a.ratio < 0.99 && (
              <line
                x1="0" x2="100" y1={fillY(a.ratio)} y2={fillY(a.ratio)}
                stroke={a.color} strokeWidth="2" clipPath={`url(#mdrArc-${a.key})`}
              />
            )}
            <path d="M20 132 L20 60 A33 33 0 1 1 80 60 L80 132" fill="none" stroke="var(--paper)" strokeWidth="8" />
            <path d="M20 60 A33 33 0 1 1 80 60" fill="none" stroke={a.color} strokeWidth="8" strokeDasharray="8.4 8.4" />
            <path d="M20 132 L20 60 A33 33 0 1 1 80 60 L80 132" fill="none" stroke="var(--gline)" strokeWidth="1" />
          </svg>

          <span
            style={{
              position: "absolute", left: 0, right: 0, top: "52%",
              transform: "translateY(-50%)", textAlign: "center", pointerEvents: "none",
            }}
          >
            <span
              style={{
                display: "block", fontSize: bigFitSize(a.big), fontWeight: 900,
                lineHeight: 1, color: a.color, maxWidth: 60, margin: "0 auto",
                whiteSpace: "nowrap", overflow: "hidden",
              }}
            >
              {a.big}
            </span>
            <span style={{ display: "block", marginTop: 4, fontSize: 10, color: "var(--ink52)" }}>{a.unit}</span>
          </span>

          <span style={{ display: "block", marginTop: 7, fontSize: 13.5, fontWeight: 900 }}>{a.label}</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 10.5, color: "var(--ink52)" }}>{a.sub}</span>
        </button>
      ))}
    </div>
  );
}
