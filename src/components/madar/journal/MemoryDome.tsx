"use client";
/**
 * **سماءُ الذكريات** بشكل التصميم: قبّةُ ليلٍ زاويةُ كلِّ نجمةٍ فيها يومُها من
 * السنة، فالسماءُ خريطةٌ زمنيةٌ تُقرأ بنظرة.
 *
 * **ما حُفِظ من المكوّن القديم**: التجميعُ التكيّفيّ. فوق `SKY_CLUSTER_THRESHOLD`
 * مذكرةً لا تُرسم نجمةٌ لكلّ واحدة — تُجمَّع في كوكباتٍ شهرية. أرشيفُ ألفِ
 * مذكرةٍ (وهو واردٌ بعد استيراد Day One) كان يرسم ألفَ هدفِ لمسٍ في SVG واحد.
 * المنطقُ في `lib/memorySky.ts` كما هو ومختبَرٌ بـ٣٣٤ و١٠٠٠.
 */
import { useMemo } from "react";
import type { JournalEntry } from "@/lib/types";
import { MOODS } from "@/lib/types";
import {
  skyStars, skyDust, domePoint, baseAngle, dayOfYear, hashUnit,
  todayInHistory, MOOD_SKY, DOME_W, DOME_H,
} from "@/lib/memoryDome";
import { clusterByMonth, SKY_CLUSTER_THRESHOLD } from "@/lib/memorySky";
import { arNum, arCount } from "@/lib/madar/format";
import { SectionHead, HeadMeta } from "../primitives";

export function MemoryDome({
  entries,
  todayStr,
  selectedId,
  onPick,
}: {
  entries: JournalEntry[];
  todayStr: string;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  const clustered = entries.length > SKY_CLUSTER_THRESHOLD;

  const stars = useMemo(() => {
    if (!clustered) return skyStars(entries);
    // كوكبةٌ لكلّ شهر: زاويتُها منتصفُ الشهر، وحجمُها من عدد مذكراته.
    return clusterByMonth(entries).map((c) => {
      const mid = `${c.key}-15`;
      const ang = Math.max(8, Math.min(172, baseAngle(dayOfYear(mid))));
      const pt = domePoint(ang, 0.42 + hashUnit(c.key, 0x1000193) * 0.5);
      const r = 0.9 + Math.min(1.6, Math.log2(c.count + 1) * 0.4);
      return {
        id: c.entries[0]?.id ?? c.key,
        x: pt.x, y: pt.y, r,
        halo: r * 2.6,
        color: MOOD_SKY[3],
        hollow: false,
        opacity: 0.9,
        starred: false,
      };
    });
  }, [entries, clustered]);

  const dust = useMemo(() => skyDust(), []);
  const comet = useMemo(() => todayInHistory(entries, todayStr), [entries, todayStr]);
  const cometPt = useMemo(() => {
    if (!comet) return null;
    return domePoint(baseAngle(dayOfYear(comet.date)), 0.9);
  }, [comet]);

  const meta = clustered
    ? `${arCount(clusterByMonth(entries).length, {
        one: "كوكبةٌ واحدة", two: "كوكبتان", few: "كوكبات", many: "كوكبة",
      })} · المس كوكبة`
    : `${arCount(entries.length, {
        zero: "لا نجمةَ بعد", one: "نجمةٌ واحدة", two: "نجمتان", few: "نجوم", many: "نجمة",
      })}${entries.length ? " · المس نجمة" : ""}`;

  return (
    <div style={{ margin: "16px 0 0" }}>
      <SectionHead title="سماءُ الذكريات" trailing={<HeadMeta>{meta}</HeadMeta>} marginTop={0} marginBottom={12} />

      <div
        style={{
          position: "relative", width: "100%", aspectRatio: `${DOME_W}/${DOME_H}`,
          minHeight: 200, overflow: "hidden",
          borderRadius: "50% 50% 2px 2px / 64% 64% 0 0",
          background:
            "radial-gradient(120% 90% at 50% 100%, #3d2f1d 0%, #2a2014 42%, #181209 74%, #0d0906 100%)",
          boxShadow: "inset 0 0 0 1px rgba(232,201,154,.18)",
        }}
      >
        <svg viewBox={`0 0 ${DOME_W} ${DOME_H}`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            <radialGradient id="mdrHalo" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fff8e6" stopOpacity=".9" />
              <stop offset="100%" stopColor="#fff8e6" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="mdrHaloG" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#f0c674" stopOpacity=".95" />
              <stop offset="100%" stopColor="#f0c674" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="mdrTail" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#f4d488" stopOpacity=".85" />
              <stop offset="100%" stopColor="#f4d488" stopOpacity="0" />
            </linearGradient>
          </defs>

          {dust.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#f2e6cb" opacity={d.o} />
          ))}

          {comet && cometPt && (
            <g onClick={() => onPick(comet.id)} style={{ cursor: "pointer" }}>
              <path
                d={`M ${cometPt.x + 15} ${cometPt.y + 13} L ${cometPt.x} ${cometPt.y}`}
                stroke="url(#mdrTail)" strokeWidth="2.4" strokeLinecap="round" fill="none"
              />
              <circle cx={cometPt.x} cy={cometPt.y} r="3.4" fill="url(#mdrHaloG)" />
              <circle cx={cometPt.x} cy={cometPt.y} r="1.35" fill="#fff3d6" />
              {/* هدفُ لمسٍ أوسع من النجمة المرسومة — الإصبعُ أعرضُ من ١٫٣px */}
              <circle cx={cometPt.x} cy={cometPt.y} r="4.6" fill="transparent" />
            </g>
          )}

          {stars.map((st) => (
            <g key={st.id} onClick={() => onPick(st.id)} style={{ cursor: "pointer" }}>
              {st.halo > 0 && (
                <circle cx={st.x} cy={st.y} r={st.halo} fill={st.starred ? "url(#mdrHaloG)" : "url(#mdrHalo)"} />
              )}
              <circle
                cx={st.x} cy={st.y} r={st.r}
                fill={st.hollow ? "none" : st.color}
                stroke={st.hollow ? st.color : "none"}
                strokeWidth={st.hollow ? 0.42 : 0}
                opacity={st.opacity}
              />
              {selectedId === st.id && (
                <circle cx={st.x} cy={st.y} r={st.r + 1.6} fill="none" stroke="#f4d488" strokeOpacity=".85" strokeWidth=".6" />
              )}
              <circle cx={st.x} cy={st.y} r="3.4" fill="transparent" />
            </g>
          ))}
        </svg>

        {comet && cometPt && (
          <span
            style={{
              position: "absolute", zIndex: 2, pointerEvents: "none", whiteSpace: "nowrap",
              fontSize: 10, fontWeight: 900, color: "#f4d488",
              left: `${cometPt.x}%`, top: `${(cometPt.y / DOME_H) * 100}%`,
              transform: "translate(-98%, 58%)",
            }}
          >
            في مثل هذا اليوم
          </span>
        )}

        {entries.length === 0 && (
          <span
            style={{
              position: "absolute", inset: 0, display: "flex",
              alignItems: "flex-end", justifyContent: "center", paddingBottom: "34%",
              fontSize: 13, color: "rgba(240,226,198,.55)",
            }}
          >
            سماؤك ما زالت خالية
          </span>
        )}
      </div>

      {/* قاعدةُ القبّة */}
      <div style={{ height: 3, background: "var(--ink)", opacity: 0.85 }} />
      <div style={{ height: 9, margin: "0 14px", background: "var(--ink)", opacity: 0.12 }} />

      <div
        style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "center", gap: 14, padding: "14px 12px 0",
        }}
      >
        {MOODS.map((m) => (
          <span key={m.value} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, background: MOOD_SKY[m.value], transform: "rotate(45deg)" }} />
            <span style={{ fontSize: 10.5, color: "var(--ink52)" }}>{m.label}</span>
          </span>
        ))}
      </div>

      {clustered && (
        <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--ink34)", textAlign: "center", lineHeight: 1.7 }}>
          أرشيفُك تجاوز {arNum(SKY_CLUSTER_THRESHOLD)} مذكرة، فالنجومُ مجموعةٌ في كوكباتٍ شهرية.
        </p>
      )}
    </div>
  );
}
