"use client";
/**
 * **المزولة** — قوسُ النهار وشاخصٌ يرمي ظلَّه على ساعةِ الآن.
 *
 * التصميمُ المصدر يقودها بساعةٍ وهميةٍ تُقدَّم بالضغط لأنّه نموذج. هنا تُقاد
 * بمواقيت جهازك: النهارُ من الفجر إلى العشاء، وموضعُ الشمس نسبةُ ما مضى منه.
 * فهي تقول أين أنت من يومك، لا أين أنت من رسمة.
 */
import { useMemo } from "react";
import {
  dayFraction, dialGeometry, dueArc, sunWindow, DUE_ARC_LABEL, DIAL_W, DIAL_H,
} from "@/lib/sundial";
import { computePrayerTimes, getCachedCoords, formatClock, parseDate } from "@/lib/utils";
import { arNum, arClock, arPct } from "@/lib/madar/format";

export function Sundial({
  todayStr,
  now,
  prayed,
  hifzDue,
}: {
  todayStr: string;
  now: Date;
  prayed: number;
  hifzDue: number;
}) {
  const times = useMemo(() => {
    const c = getCachedCoords();
    return computePrayerTimes(parseDate(todayStr), c.lat, c.lng);
  }, [todayStr]);

  // بلا مواقيتَ محسوبة (إحداثيّاتٌ قطبيّة أو شاذّة) لا نرسم مزولةً كاذبة.
  if (!times) return null;

  // الشروقُ مرآةُ المغرب حول الظهر الشمسيّ — وهي العلاقةُ التي يبني عليها
  // `computePrayerTimes` المغربَ نفسَه، فالاشتقاقُ منها دقيقٌ لا تقدير.
  const sunrise = new Date(2 * times.الظهر.getTime() - times.المغرب.getTime());
  const frac = dayFraction(now, times.الفجر, times.العشاء);
  const g = dialGeometry(frac, sunWindow(times.الفجر, times.العشاء, sunrise, times.المغرب));
  const due = dueArc(prayed, hifzDue);

  return (
    <div
      style={{
        display: "block", width: "100%", margin: "14px 0 0",
        background: "var(--paper2)", border: "1px solid var(--gline)",
        borderRadius: 22, padding: "12px 14px 9px", color: "var(--ink)",
        boxSizing: "border-box",
      }}
    >
      <svg viewBox={`0 0 ${DIAL_W} ${DIAL_H}`} style={{ width: "100%", display: "block" }} aria-hidden>
        <path d="M14 44 Q160 -12 306 44" fill="none" stroke="var(--gline)" strokeWidth="1" strokeDasharray="2.5 5" />
        <path d="M14 47 L306 47" stroke="var(--gline)" strokeWidth="1.2" />
        <path d={g.ticksDim} stroke="var(--gline)" strokeWidth="1" />
        {g.tickOn && <path d={g.tickOn} stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" />}
        <polygon points={g.shadow} fill="var(--ink)" opacity={g.shadowOpacity} />
        <path d="M160 47 L160 22" stroke="var(--ink)" strokeWidth="2.8" strokeLinecap="round" opacity={g.gnomonOpacity} />
        <path d="M154 47 L166 47" stroke="var(--ink)" strokeWidth="2.4" strokeLinecap="round" opacity={g.gnomonOpacity} />
        {g.sunVisible && (
          <g>
            <circle cx={g.sunX} cy={g.sunY} r="7" fill="var(--gold)" opacity=".18" />
            <circle cx={g.sunX} cy={g.sunY} r="3.4" fill="var(--gold)" />
          </g>
        )}
      </svg>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2, fontSize: 9.5, color: "var(--ink34)" }}>
        <span>الفجر {arClock(times.الفجر, formatClock)}</span>
        <span>{g.phase} · مضى {arPct(frac)} من نهارك</span>
        <span>العشاء {arClock(times.العشاء, formatClock)}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, paddingTop: 9, borderTop: "1px solid var(--line)" }}>
        <span className="mdr-star" style={{ width: 9, height: 9 }} />
        <span style={{ flex: 1, fontSize: 10.5, fontWeight: 700, color: "var(--ink72)" }}>
          القوسُ المستحقُّ الآن: {DUE_ARC_LABEL[due]}
        </span>
        <span style={{ fontSize: 9.5, color: "var(--ink34)" }}>{arNum(prayed)} من {arNum(5)}</span>
      </div>
    </div>
  );
}
