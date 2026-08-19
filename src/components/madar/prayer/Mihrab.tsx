"use client";
/**
 * المحراب — قوسُ اليوم وعليه الفروضُ الخمسة في مواقيتها.
 *
 * القوسُ الذهبيُّ يمتلئ بقدر ما سُجّل، وشمسٌ تجري عليه بالنسبة نفسِها.
 * ضغطةٌ على الفرض: صلَّيت · ضغطتان: في جماعة · ثالثة: تمسح.
 *
 * الإحداثياتُ مقيسةٌ من التصميم (لوحةُ 300×268، نصفُ قطر 114، أوّلُ زاويةٍ ١٥°
 * وبينها ٣٧٫٥°) — لا تُقرَّب، فالعقدُ تجلس على القوس بها بالضبط.
 */
import type { PrayerLog, PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYERS } from "@/lib/types";
import { prayedCount } from "@/lib/prayerExtras";
import { arNum, arCount } from "@/lib/madar/format";

const ARC_LEN = 289; // طولُ القوس المرسوم — منه يُحسب امتلاؤه
const R = 114;
const angleOf = (i: number) => 15 + i * 37.5;
const px = (a: number) => ((150 + R * Math.cos((a * Math.PI) / 180)) / 300) * 100;
const py = (a: number) => ((160 - R * Math.sin((a * Math.PI) / 180)) / 268) * 100;

function dotColor(v: PrayerStatus | undefined): string {
  if (v === "جماعة") return "var(--green)";
  if (v === "فائتة") return "var(--clay)";
  if (v === "قضاء") return "var(--blue)";
  return v && v !== "لم" ? "var(--gold)" : "var(--line)";
}

export function Mihrab({
  log,
  onCycle,
}: {
  log: PrayerLog | undefined;
  onCycle: (prayer: PrayerName) => void;
}) {
  const prayed = prayedCount(log);
  const left = 5 - prayed;
  const frac = prayed / 5;
  const sunA = 15 + frac * 150;

  const lead =
    left === 0
      ? "الخمسُ مسجَّلةٌ اليوم."
      : arCount(left, {
          one: "بقيت صلاةٌ واحدةٌ لم تُسجَّل.",
          two: "بقيت صلاتان لم تُسجَّلا.",
          few: `بقيت ${arNum(left)} صلواتٍ لم تُسجَّل.`,
          many: `بقيت ${arNum(left)} صلاةً لم تُسجَّل.`,
        });

  return (
    <div
      style={{
        margin: "14px 0 0",
        padding: "16px 6px 6px",
        border: "1px solid var(--gline)",
        borderRadius: 28,
        background:
          "linear-gradient(180deg, rgba(184,80,44,.10), rgba(185,134,47,.05) 62%, transparent)",
      }}
    >
      <div style={{ position: "relative", height: 262 }}>
        <svg viewBox="0 0 300 268" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <path d="M63.5 268 L63.5 160 A92 92 0 1 1 236.5 160 L236.5 268" fill="var(--paper2)" stroke="none" />
          <path
            d="M63.5 160 A92 92 0 1 1 236.5 160"
            fill="none" stroke="var(--clay)" strokeWidth="16" strokeDasharray="17.66 17.66" opacity=".9"
          />
          <path
            d="M63.5 268 L63.5 160 A92 92 0 1 1 236.5 160 L236.5 268"
            fill="none" stroke="var(--gold)" strokeWidth="1.2" opacity=".7"
          />
          <path d="M55 268 L55 160 A100.5 100.5 0 1 1 245 160 L245 268" fill="none" stroke="var(--gline)" strokeWidth="1" />
          {/* القوسُ الممتلئ — معكوسُ الاتجاه ليبدأ من الفجر */}
          <path
            d="M236.5 160 A92 92 0 1 0 63.5 160"
            fill="none" stroke="var(--gold)" strokeWidth="3" strokeLinecap="round"
            style={{ strokeDasharray: `${(ARC_LEN * frac).toFixed(1)}px ${ARC_LEN}px` }}
          />
          <line x1="40" y1="264" x2="260" y2="264" stroke="var(--ink34)" strokeWidth="1.2" />
        </svg>

        {/* الشمسُ على موضعها من القوس */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: `${px(sunA).toFixed(2)}%`,
            top: `${py(sunA).toFixed(2)}%`,
            transform: "translate(-50%,-50%)",
            width: 26, height: 26, borderRadius: "50%",
            background: "radial-gradient(circle at 34% 30%, #f6dca8, #b9862f)",
            boxShadow: "0 0 22px 6px rgba(185,134,47,.3)",
            pointerEvents: "none",
          }}
        />

        {PRAYERS.map((name, i) => {
          const v = log?.prayers[name];
          const set = v && v !== "لم";
          const a = angleOf(i);
          return (
            <button
              key={name}
              type="button"
              onClick={() => onCycle(name)}
              title={`${name} — ${set ? v : "لم تُسجَّل"}`}
              style={{
                position: "absolute",
                left: `${px(a).toFixed(2)}%`,
                top: `${py(a).toFixed(2)}%`,
                transform: "translate(-50%,-50%)",
                minHeight: 34,
                padding: "4px 9px",
                background: "var(--paper2)",
                border: `1px solid ${set ? "var(--gline)" : "var(--line)"}`,
                borderRadius: 99,
                display: "flex",
                flexDirection: "row-reverse",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              <span className="mdr-star" style={{ width: 10, height: 10, background: dotColor(v) }} />
              <span style={{ fontSize: 10.5, fontWeight: set ? 900 : 700, color: set ? "var(--ink)" : "var(--ink52)" }}>
                {name.replace(/^ال/, "")}
              </span>
            </button>
          );
        })}

        <div
          style={{
            position: "absolute", left: "50%", top: "56%",
            transform: "translate(-50%,-50%)", textAlign: "center",
            pointerEvents: "none", width: 150,
          }}
        >
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: ".16em", color: "var(--ink34)" }}>اليوم</p>
          <p style={{ margin: "6px 0 0", fontSize: 32, fontWeight: 900, lineHeight: 1 }}>
            {arNum(prayed)} من {arNum(5)}
          </p>
          <p style={{ margin: "7px 0 0", fontSize: 12, fontWeight: 700, color: "var(--gold)", lineHeight: 1.6 }}>{lead}</p>
        </div>
      </div>
      <p style={{ margin: "2px 0 10px", textAlign: "center", fontSize: 11.5, color: "var(--ink52)" }}>
        ضغطةٌ على القوس: صلَّيت · ضغطتان: في جماعة
      </p>
    </div>
  );
}
