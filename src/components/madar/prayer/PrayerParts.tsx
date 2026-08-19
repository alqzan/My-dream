"use client";
/** القِطعُ الباقية من شاشة الصلاة: الصفوف · حلقةُ السنة · سجلُّ الأسبوع. */
import type { PrayerLog, PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYERS, PRAYER_STATUS_GLYPH } from "@/lib/types";
import { yearRingSpokes, YEAR_SPOKES } from "@/lib/prayerExtras";
import { arNum, arPct } from "@/lib/madar/format";
import { toDateStr, parseDate } from "@/lib/utils";

/* ─────────── ألوانُ الخليّة: مصدرٌ واحدٌ للصفوف والسجلّ واللائحة ─────────── */

export interface CellSkin {
  glyph: string;
  bg: string;
  bd: string;
  fg: string;
}

export function cellSkin(v: PrayerStatus | undefined): CellSkin {
  switch (v) {
    case "جماعة": return { glyph: "ج", bg: "var(--green)", bd: "var(--green)", fg: "var(--paper)" };
    case "منفردة": return { glyph: "م", bg: "transparent", bd: "var(--gold)", fg: "var(--gold)" };
    case "فائتة": return { glyph: "ف", bg: "transparent", bd: "var(--clay)", fg: "var(--clay)" };
    case "قضاء": return { glyph: "ق", bg: "transparent", bd: "var(--blue)", fg: "var(--blue)" };
    default: return { glyph: "", bg: "transparent", bd: "var(--line)", fg: "var(--ink34)" };
  }
}

const STATUS_TONE: Partial<Record<PrayerStatus, string>> = {
  جماعة: "var(--green)",
  منفردة: "var(--gold)",
  فائتة: "var(--clay)",
  قضاء: "var(--blue)",
};

/* ─────────────────────── صفوفُ الفروض ─────────────────────── */

export function PrayerRows({
  log,
  times,
  onCycle,
  onOpenStates,
}: {
  log: PrayerLog | undefined;
  /** وقتُ كلّ فرضٍ منسَّقاً + هل مضى — من مواقيت الجهاز الحقيقية. */
  times: Record<PrayerName, { label: string; passed: boolean }>;
  onCycle: (p: PrayerName) => void;
  onOpenStates: (p: PrayerName) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "14px 0 0" }}>
      {PRAYERS.map((name) => {
        const v = log?.prayers[name];
        const set = v && v !== "لم";
        const c = cellSkin(v);
        const rowBg =
          v === "جماعة" ? "rgba(28,99,80,.10)"
            : v === "منفردة" ? "rgba(185,134,47,.09)"
              : v === "فائتة" ? "rgba(184,80,44,.08)"
                : v === "قضاء" ? "rgba(63,111,143,.09)"
                  : "var(--paper2)";
        const rowBd = v === "جماعة" ? "rgba(28,99,80,.34)" : set ? "var(--gline)" : "var(--line)";
        return (
          <div
            key={name}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "10px 12px", boxSizing: "border-box",
              background: rowBg, border: `1px solid ${rowBd}`, borderRadius: 19,
            }}
          >
            <button
              type="button"
              onClick={() => onCycle(name)}
              style={{
                flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12,
                minHeight: 44, background: "transparent", border: "none",
                textAlign: "right", padding: 0, cursor: "pointer",
                fontFamily: "inherit", color: "inherit",
              }}
            >
              <span
                style={{
                  width: 22, height: 22, flex: "none",
                  border: `1.5px solid ${c.bd}`, borderRadius: 7, background: c.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 900, color: c.fg,
                }}
              >
                {c.glyph}
              </span>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 700 }}>{name}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: set ? STATUS_TONE[v!] : "var(--ink34)" }}>
                {v === "منفردة" ? "صلَّيت" : set ? v : "لم تُسجَّل"}
              </span>
            </button>
            <span style={{ fontSize: 11, color: "var(--ink34)", flex: "none" }}>{times[name].label}</span>
            <button
              type="button"
              onClick={() => onOpenStates(name)}
              title={`حالاتٌ أخرى لـ${name}`}
              aria-label={`حالاتٌ أخرى لـ${name}`}
              style={{
                width: 34, height: 34, flex: "none", background: "transparent",
                border: "1px solid var(--line)", borderRadius: 11,
                color: "var(--ink52)", fontSize: 14, fontWeight: 900, lineHeight: 1,
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              ⋯
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────── حلقةُ السنة ─────────────────────── */

export function YearRing({ logs, year, todayStr }: { logs: PrayerLog[]; year: number; todayStr: string }) {
  const spokes = yearRingSpokes(logs, year, todayStr);
  const past = spokes.filter((s) => s.past).length;
  const lit = spokes.filter((s) => s.met).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "30px 0 4px" }}>
        <span className="mdr-diamond" style={{ width: 6, height: 6 }} />
        <h2 style={{ margin: 0, fontSize: 11.5, letterSpacing: ".16em", fontWeight: 700, color: "var(--ink52)" }}>
          حلقةُ السنة
        </h2>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontSize: 11, color: "var(--ink34)" }}>
          {arNum(lit)} من {arNum(Math.max(1, past))} أسبوعًا موفًّى
        </span>
      </div>
      <div style={{ position: "relative", width: "100%", maxWidth: 250, margin: "0 auto", aspectRatio: "1" }}>
        <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <circle cx="100" cy="100" r="78" fill="none" stroke="var(--line)" strokeWidth=".7" />
          {spokes.map((s) => {
            const a = (s.index / YEAR_SPOKES) * Math.PI * 2 - Math.PI / 2;
            const r1 = 78;
            const r2 = 78 + (s.now ? 15 : s.met ? 6 + s.ratio * 7 : 3);
            const color = s.now ? "var(--clay)" : s.met ? "var(--green)" : s.past ? "var(--ink34)" : "var(--line)";
            return (
              <line
                key={s.index}
                x1={+(100 + r1 * Math.cos(a)).toFixed(1)} y1={+(100 + r1 * Math.sin(a)).toFixed(1)}
                x2={+(100 + r2 * Math.cos(a)).toFixed(1)} y2={+(100 + r2 * Math.sin(a)).toFixed(1)}
                stroke={color} strokeWidth={s.now ? 2.6 : 1.8} strokeLinecap="round"
              />
            );
          })}
          <path d="M78 116 L78 92 A22 22 0 1 1 122 92 L122 116" fill="none" stroke="var(--gline)" strokeWidth="1" />
        </svg>
        <span
          style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 21, fontWeight: 900,
          }}
        >
          {arPct(past ? lit / past : 0)}
        </span>
      </div>
    </>
  );
}

/* ─────────────────────── سجلُّ الأسبوع ─────────────────────── */

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function WeekLog({ logs, todayStr }: { logs: PrayerLog[]; todayStr: string }) {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const end = parseDate(todayStr);
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(toDateStr(d));
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 9, margin: "28px 0 12px" }}>
        <span className="mdr-diamond" style={{ width: 6, height: 6 }} />
        <h2 style={{ margin: 0, fontSize: 11.5, letterSpacing: ".16em", fontWeight: 700, color: "var(--ink52)" }}>
          سجلُّ الأسبوع
        </h2>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span style={{ fontSize: 11, color: "var(--ink34)" }}>بلا سلسلةٍ ولا تقييم</span>
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ width: 44, flex: "none", display: "flex", flexDirection: "column", gap: 6, paddingTop: 22 }}>
          {PRAYERS.map((p) => (
            <span key={p} style={{ height: 22, display: "flex", alignItems: "center", fontSize: 11.5, color: "var(--ink52)" }}>
              {p}
            </span>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 4, margin: "0 0 6px" }}>
            {days.map((d) => {
              const isToday = d === todayStr;
              const wd = WEEKDAYS[parseDate(d).getDay()].replace(/^ال/, "");
              return (
                <span
                  key={d}
                  style={{
                    flex: 1, textAlign: "center", fontSize: 10.5,
                    color: isToday ? "var(--gold)" : "var(--ink34)",
                    fontWeight: isToday ? 900 : 400,
                  }}
                >
                  {wd.slice(0, 3)}
                </span>
              );
            })}
          </div>
          {PRAYERS.map((p) => (
            <div key={p} style={{ display: "flex", gap: 4, marginBottom: 6 }}>
              {days.map((d) => {
                const c = cellSkin(byDate.get(d)?.prayers[p]);
                return (
                  <span
                    key={d}
                    title={`${p} · ${d}`}
                    style={{
                      flex: 1, height: 22, border: `1px solid ${c.bd}`, background: c.bg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 900, color: c.fg,
                    }}
                  >
                    {c.glyph}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", margin: "12px 0 0" }}>
        {(["جماعة", "منفردة", "فائتة", "قضاء"] as const).map((s) => {
          const c = cellSkin(s);
          return (
            <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink52)" }}>
              <span
                style={{
                  width: 14, height: 14, border: `1px solid ${c.bd}`, background: c.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 900, color: c.fg,
                }}
              >
                {PRAYER_STATUS_GLYPH[s]}
              </span>
              <span>{s}</span>
            </span>
          );
        })}
      </div>
    </>
  );
}
