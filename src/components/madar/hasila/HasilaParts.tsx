"use client";
/** قِطعُ الحصيلة: بتلاتُ السنة · أبوابُ مدار · ميزانُ آخر ٢٥ فرضًا · جَردُ السنة. */
import type { PrayerLog } from "@/lib/types";
import { PRAYERS } from "@/lib/types";
import { isPrayedStatus } from "@/lib/types";
import { barHeights, type InventoryRow, type MonthPetal } from "@/lib/hasila";
import { arNum, arPct } from "@/lib/madar/format";
import { formatAmount } from "@/lib/utils";
import { SectionHead, HeadMeta } from "../primitives";

/* ─────────────────────── بتلاتُ سنة الالتزام ─────────────────────── */

/**
 * زهرةٌ من اثنتي عشرة بتلة، طولُ البتلة التزامُ شهرها.
 *
 * الشهرُ الذي **لم يأتِ بعد** لا يُرسم بتلةً باهتة بل لا يُرسم أصلاً — بتلةٌ
 * فارغةٌ لشهرٍ قادم تُقرأ تفريطاً وهي مجرّد مستقبل.
 */
export function YearBloom({ petals, average }: { petals: MonthPetal[]; average: number }) {
  return (
    <div
      style={{
        margin: "12px 0 0", padding: 18,
        border: "1px solid var(--gline)", borderRadius: 24, background: "var(--paper2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>سنةُ الالتزام</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <HeadMeta>{arNum(petals.filter((p) => p.past).length)} من {arNum(12)} شهرًا</HeadMeta>
      </div>

      <div style={{ position: "relative", height: 212, margin: "12px 0 0" }}>
        <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 206, height: 206 }}>
          {petals.map((p, i) => {
            if (!p.past) return null;
            const len = 34 + (p.value / 100) * 58;
            return (
              <span
                key={p.key}
                title={`${p.label} · ${arPct(p.value / 100)}`}
                style={{
                  position: "absolute", left: "50%", top: "50%",
                  width: 15, height: len,
                  transformOrigin: "50% 100%",
                  transform: `translate(-50%,-100%) rotate(${(i / 12) * 360}deg)`,
                  borderRadius: "99px 99px 5px 5px",
                  background: p.now ? "var(--clay)" : "var(--gold)",
                  opacity: 0.3 + (p.value / 100) * 0.6,
                }}
              />
            );
          })}
          <span
            style={{
              position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
              width: 92, height: 92, borderRadius: 99,
              background: "var(--paper)", border: "1px solid var(--gline)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 25, fontWeight: 900, lineHeight: 1, color: "var(--gold)" }}>
              {arPct(average / 100)}
            </span>
            <span style={{ fontSize: 10, color: "var(--ink34)", marginTop: 3 }}>معدَّلُ السنة</span>
          </span>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7, margin: "6px 0 0" }}>
        {petals.slice(-4).map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, width: 66 }}>{m.label}</span>
            <span style={{ flex: 1, height: 7, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
              <span
                style={{
                  display: "block", height: "100%", borderRadius: 99,
                  width: `${m.value}%`,
                  background: m.value >= 75 ? "var(--green)" : m.value >= 50 ? "var(--gold)" : "var(--clay)",
                }}
              />
            </span>
            <span style={{ fontSize: 11.5, fontWeight: 800, color: "var(--gold)", width: 38, textAlign: "left" }}>
              {arPct(m.value / 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── أبوابُ مدار ─────────────────────── */

export interface DoorRow {
  key: string;
  label: string;
  value: string;
  color: string;
  series: number[];
  note: string;
}

export function DoorRows({ rows }: { rows: DoorRow[] }) {
  return (
    <div
      style={{
        margin: "12px 0 0", padding: 18,
        border: "1px solid var(--line)", borderRadius: 24, background: "var(--paper2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
        <span style={{ fontSize: 13, fontWeight: 900 }}>كلُّ بابٍ في مدار</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <HeadMeta>آخرُ {arNum(30)} يومًا</HeadMeta>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, margin: "14px 0 0" }}>
        {rows.map((r) => {
          const heights = barHeights(r.series);
          return (
            <div key={r.key}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: r.color, flex: "none" }} />
                <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: r.color }}>{r.value}</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34, margin: "8px 0 0" }}>
                {r.series.map((v, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1, height: heights[i], borderRadius: "2px 2px 0 0",
                      background: v ? r.color : "var(--line)",
                    }}
                  />
                ))}
              </div>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--ink52)", lineHeight: 1.7 }}>{r.note}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────── ميزانُ آخر ٢٥ فرضًا ─────────────────────── */

/**
 * خمسٌ في خمسٍ — آخرُ خمسةٍ وعشرين فرضاً بترتيبها. المعيَّنُ الممتلئ أُدِّي،
 * والمفرَّغُ فُرِّط فيه. عددٌ صغيرٌ مقصود: ميزانٌ يُرى بلا عدٍّ، لا سجلٌّ يُقرأ.
 */
export function PrayerScale({ logs, todayStr }: { logs: PrayerLog[]; todayStr: string }) {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const cells: boolean[] = [];
  const d = new Date(todayStr.split("-").map(Number)[0], Number(todayStr.slice(5, 7)) - 1, Number(todayStr.slice(8)));

  // نمشي إلى الوراء يوماً يوماً، ومن كلّ يومٍ فروضُه بالترتيب المعكوس.
  outer: for (let back = 0; back < 40; back++) {
    const dt = new Date(d);
    dt.setDate(dt.getDate() - back);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    const log = byDate.get(key);
    for (let i = PRAYERS.length - 1; i >= 0; i--) {
      const v = log?.prayers[PRAYERS[i]];
      // فرضٌ لم يُسجَّل في يومٍ مضى = تفريط؛ وفي اليوم الجاري قد لم يحن وقتُه بعد،
      // فلا نُدخل اليومَ الجاري إلا ما سُجّل منه فعلاً.
      if (back === 0 && !v) continue;
      cells.push(isPrayedStatus(v));
      if (cells.length >= 25) break outer;
    }
  }
  cells.reverse();
  const lit = cells.filter(Boolean).length;

  return (
    <div
      style={{
        margin: "12px 0 0", padding: "20px 18px 18px",
        border: "1px solid var(--gline)", borderRadius: 26, background: "var(--paper2)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 34, fontWeight: 900, lineHeight: 1, color: "var(--green)" }}>
          {arPct(cells.length ? lit / cells.length : 0)}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--ink52)" }}>من آخرِ ما سُجِّل</span>
      </div>

      <div
        style={{
          display: "grid", gridTemplateColumns: "repeat(5,1fr)",
          gap: "14px 12px", margin: "20px 0 0", padding: "0 6px", justifyItems: "center",
        }}
      >
        {cells.map((on, i) => (
          <span
            key={i}
            style={{
              width: 16, height: 16, transform: "rotate(45deg)",
              background: on ? "var(--green)" : "transparent",
              border: on ? "none" : "1.4px solid var(--clay)",
              opacity: on ? 0.9 : 0.7,
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "22px 0 0", paddingTop: 14, borderTop: "1px solid var(--line)", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--ink72)" }}>
          <span style={{ width: 9, height: 9, transform: "rotate(45deg)", background: "var(--green)" }} />
          أوفيتَ {arNum(lit)}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--ink72)" }}>
          <span style={{ width: 9, height: 9, transform: "rotate(45deg)", border: "1.4px solid var(--clay)" }} />
          فرّطتَ {arNum(cells.length - lit)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--ink34)" }}>آخرُ {arNum(25)} فرضًا</span>
      </div>
    </div>
  );
}

/* ─────────────────────── جَردُ السنة ─────────────────────── */

export function YearInventory({ rows, year }: { rows: InventoryRow[]; year: number }) {
  return (
    <>
      <SectionHead title="جَردُ السنة" trailing={<HeadMeta>{arNum(year)}</HeadMeta>} marginTop={26} marginBottom={12} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              padding: "15px 13px", border: "1px solid var(--line)",
              borderRadius: 20, background: "var(--paper2)",
            }}
          >
            <span style={{ display: "block", fontSize: 22, fontWeight: 900, color: "var(--gold)" }}>
              {arNum(r.value)}
            </span>
            <span style={{ display: "block", marginTop: 5, fontSize: 11, color: "var(--ink52)", lineHeight: 1.6 }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/* ─────────────────────── بطاقاتُ الرأس ─────────────────────── */

export interface Kpi {
  label: string;
  value: string;
  delta: string;
  color: string;
  deltaColor: string;
  pct: number;
}

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, margin: "16px 0 0" }}>
      {kpis.map((k) => (
        <div key={k.label} style={{ padding: 15, border: "1px solid var(--line)", borderRadius: 22, background: "var(--paper2)" }}>
          <span style={{ display: "block", fontSize: 11, color: "var(--ink34)" }}>{k.label}</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 23, fontWeight: 900, color: k.color }}>{k.value}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: k.deltaColor }}>{k.delta}</span>
          </div>
          <div style={{ marginTop: 11, height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
            <span style={{ display: "block", height: "100%", borderRadius: 99, background: k.color, width: `${k.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export { formatAmount };
