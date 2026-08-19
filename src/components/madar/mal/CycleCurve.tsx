"use client";
/**
 * **منحنى الدورة ودرجةُ الانضباط.**
 *
 * الرصيدُ رقمٌ واحد؛ المنحنى يقول **متى** انحرفتَ. وأسفلَه عمودٌ لكلِّ يومٍ
 * منقضٍ — ذهبيٌّ إن بقي داخل بدلِه، طينيٌّ إن تجاوزه — فترى النمطَ لا النتيجة.
 *
 * كلُّ حسابٍ هنا من `lib/cycleCurve.ts`؛ المكوّن رسمٌ محض.
 */
import {
  curveGeometry, disciplineDays, disciplineScore, CURVE_BASE, type CycleCurve as Curve,
} from "@/lib/cycleCurve";
import { formatAmount } from "@/lib/utils";
import { arNum, arPct } from "@/lib/madar/format";
import { SectionHead } from "../primitives";

export function CycleCurve({ curve, startLabel, endLabel }: {
  curve: Curve;
  /** «الراتب · ٢٧ يوليو» */
  startLabel: string;
  /** «الراتب التالي · ٢٧ أغسطس» */
  endLabel: string;
}) {
  const g = curveGeometry(curve);
  const tone = curve.over ? "var(--clay)" : "var(--ink)";
  const bars = disciplineDays(curve);
  const score = disciplineScore(curve);
  const scoreTone = score.ratio >= 0.7 ? "var(--gold)" : "var(--clay)";

  return (
    <div>
      <p style={{ margin: 0, fontSize: 19, fontWeight: 900, lineHeight: 1.6 }}>
        اليومُ {arNum(curve.idx)} من {arNum(curve.total)} في الدورة.
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.8 }}>
        بدلُ اليوم {formatAmount(curve.perDay)} · وكاملُ الدورة {formatAmount(curve.spendable)}
      </p>

      <div style={{ margin: "18px 0 0", border: "1px solid var(--line)", background: "var(--paper2)", padding: "14px 12px 10px" }}>
        <svg viewBox="0 0 300 116" preserveAspectRatio="none" style={{ width: "100%", height: 126, display: "block", overflow: "visible" }} aria-hidden>
          <path d={g.areaD} fill={tone} opacity=".13" />
          <path d={g.allowD} fill="none" stroke="var(--gold)" strokeWidth="1.2" strokeDasharray="4 3" />
          <path d={g.spendD} fill="none" stroke={tone} strokeWidth="1.8" strokeLinejoin="round" />
          <line x1={g.nowX} y1="0" x2={g.nowX} y2={CURVE_BASE} stroke="var(--ink34)" strokeWidth=".8" />
          <line x1="0" y1={CURVE_BASE} x2="300" y2={CURVE_BASE} stroke="var(--line)" strokeWidth="1" />
        </svg>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "6px 2px 0" }}>
          <span style={{ fontSize: 10.5, color: "var(--ink34)" }}>{startLabel}</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10.5, color: "var(--ink34)" }}>{endLabel}</span>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "10px 2px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink52)" }}>
            <span style={{ width: 16, height: 0, borderTop: "1.2px dashed var(--gold)" }} />
            <span>خطُّ الخطة</span>
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink52)" }}>
            <span style={{ width: 16, height: 2, background: tone }} />
            <span>التراكمي · {formatAmount(curve.spent)}</span>
          </span>
        </div>
      </div>

      <p style={{ margin: "10px 0 0", fontSize: 12.5, color: tone, fontWeight: 700, lineHeight: 1.8 }}>
        {curve.over
          ? `فوق الخطِّ بـ ${formatAmount(curve.diff)} في هذا اليوم من الدورة.`
          : `دون الخطِّ بـ ${formatAmount(curve.diff)} — وهو فرقٌ لك لا عليك.`}
      </p>

      <SectionHead
        title="درجةُ الانضباط"
        trailing={<span style={{ fontSize: 13, fontWeight: 900, color: scoreTone }}>{arPct(score.ratio)}</span>}
        marginTop={24}
        marginBottom={12}
      />
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 34 }}>
        {bars.map((b) => (
          <span
            key={b.day}
            title={`يوم ${arNum(b.day)} · ${formatAmount(b.value)}`}
            style={{ flex: 1, height: b.height, background: b.over ? "var(--clay)" : "var(--gold)" }}
          />
        ))}
      </div>
      <p style={{ margin: "9px 0 0", fontSize: 11.5, color: "var(--ink34)", lineHeight: 1.7 }}>
        {arNum(score.within)} من {arNum(score.of)} يومًا داخل البدل · العمودُ مصروفُ يومِه
      </p>
    </div>
  );
}
