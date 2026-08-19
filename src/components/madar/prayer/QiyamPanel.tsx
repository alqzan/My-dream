"use client";
/**
 * قيامُ الليل — الركعاتُ والوتر، وتحتهما سلسلةُ آخر ثلاثين ليلة.
 * السلسلةُ ليست «streak» ولا تُكسَر: هي أثرٌ يُرى، لا عقوبةٌ تُحاسِب.
 */
import type { PrayerLog } from "@/lib/types";
import { qiyamOf, qiyamChain, stepRakaat } from "@/lib/prayerExtras";
import { arNum } from "@/lib/madar/format";
import { formatDateShort, hijriDate } from "@/lib/utils";
import { Stepper, MdrButton } from "../primitives";

export function QiyamPanel({
  logs,
  date,
  onSetRakaat,
  onToggleWitr,
  onClear,
}: {
  logs: PrayerLog[];
  date: string;
  onSetRakaat: (n: number) => void;
  onToggleWitr: () => void;
  onClear: () => void;
}) {
  const log = logs.find((l) => l.date === date);
  const q = qiyamOf(log);
  const chain = qiyamChain(logs, date, 30);

  const state = q.rakaat ? (q.witr ? "قمتَ وأوترت" : "قمتَ الليلة") : "لم تُسجَّل ليلتك";
  const line = q.rakaat
    ? `${arNum(q.rakaat)} ركعةً في ليلة ${hijriDate(date)}.${q.witr ? "" : " لم تُوتر بعد."}`
    : "ثنتان تُثبتان الليلةَ خيرٌ من إحدى عشرةَ تنقطع. سجِّل ما قمتَه.";

  return (
    <div
      style={{
        margin: "18px 0 0", padding: 16,
        border: "1px solid var(--gline)", borderRadius: 22,
        background: "linear-gradient(200deg, rgba(42,96,121,.12), transparent 70%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 900 }}>قيامُ الليل</span>
        <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 700 }}>{state}</span>
      </div>
      <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--ink52)", lineHeight: 1.8 }}>{line}</p>

      <Stepper
        label="الركعات"
        value={arNum(q.rakaat)}
        onDown={() => onSetRakaat(stepRakaat(q.rakaat, -1))}
        onUp={() => onSetRakaat(stepRakaat(q.rakaat, 1))}
        emphasis
      />

      <div style={{ display: "flex", gap: 8, margin: "12px 0 0", flexWrap: "wrap" }}>
        <MdrButton
          onClick={onToggleWitr}
          kind={q.witr ? "ink" : "ghost"}
          style={q.witr ? { border: "1px solid var(--ink)" } : undefined}
        >
          أوترتُ
        </MdrButton>
        <MdrButton onClick={onClear} kind="ghost" style={{ color: "var(--ink52)", fontSize: 12.5, padding: "0 14px" }}>
          امسح ليلتي
        </MdrButton>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(30,1fr)", gap: 3, margin: "16px 0 0" }}>
        {chain.map((c) => (
          <span
            key={c.date}
            title={`${formatDateShort(c.date)}${c.rakaat ? ` · ${arNum(c.rakaat)} ركعة` : " · لم تُسجَّل"}`}
            style={{
              height: 10,
              borderRadius: 3,
              background: c.rakaat ? (c.witr ? "var(--blue)" : "rgba(42,96,121,.45)") : "var(--line)",
            }}
          />
        ))}
      </div>
      <p style={{ margin: "9px 0 0", fontSize: 11, color: "var(--ink34)" }}>آخرُ ثلاثين ليلة</p>
    </div>
  );
}
