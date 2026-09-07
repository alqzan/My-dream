"use client";
/**
 * بطاقةُ حضور القلب — ما تقوله إجاباتُك عن نفسك.
 *
 * **ما الذي تُجيب عنه؟** ثلاثةُ أسئلةٍ لا أكثر، وهي التي طلبها المالك:
 * كيف حضورُك إجمالاً · **جماعةً أم وحدك** · **وأيُّ الصلوات أخشعُها**.
 * ما زاد على ذلك رسمٌ لا خبر.
 *
 * **ولا تنطق برأيٍ قبل أن تملكه**: تحت `MIN_SAMPLE` إجابةً لا مقارنةَ ولا
 * «أخشع» — تعرض عدَّ ما أجبتَ ودعوةً للاستمرار. بطاقةٌ تُعلن نمطاً من ثلاث
 * إجاباتٍ تُعلّم قارئَها ألّا يصدّقها، فيسقط الباب كلُّه.
 *
 * الحسابُ كلُّه في `src/lib/khushu.ts` (نقيٌّ ومختبَر)؛ هنا رسمٌ فقط.
 */
import { useMemo } from "react";
import type { PrayerLog } from "@/lib/types";
import { PRAYERS, KHUSHU_LEVELS, KHUSHU_META } from "@/lib/types";
import {
  windowLogs, khushuOverall, khushuByCompany, khushuByPrayer, khushuHighlights,
  MIN_SAMPLE, MIN_SIDE, type KhushuTally,
} from "@/lib/khushu";
import { arNum, arPct, arCount } from "@/lib/madar/format";
import { SectionHead, HeadMeta } from "@/components/madar/primitives";

const WINDOW_DAYS = 30;

/** موضعُ المتوسّط على مدى [١، ٣] كنسبةٍ للرسم. */
const span = (avg: number) => (avg <= 0 ? 0 : Math.max(0.04, (avg - 1) / 2));

/** لونُ المتوسّط: يقرأ الرقمَ بلون أقربِ درجةٍ إليه. */
function toneOf(avg: number): string {
  if (avg >= 2.34) return KHUSHU_META[3].color;
  if (avg >= 1.67) return KHUSHU_META[2].color;
  return KHUSHU_META[1].color;
}

function Bar({ tally, label, note }: { tally: KhushuTally; label: string; note?: string }) {
  const enough = tally.n >= MIN_SIDE;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 52, flex: "none", fontSize: 12, color: "var(--ink52)" }}>{label}</span>
      <span
        style={{
          flex: 1, height: 8, borderRadius: 99, background: "var(--line)",
          position: "relative", overflow: "hidden",
        }}
      >
        <span
          style={{
            position: "absolute", insetInlineStart: 0, top: 0, bottom: 0,
            width: `${(enough ? span(tally.avg) : 0) * 100}%`,
            background: toneOf(tally.avg), borderRadius: 99,
            transition: "width .4s ease",
          }}
        />
      </span>
      {/* الرقمان منفصلان بمسافةٍ ووزنٍ مختلفين لا بنقطةٍ بينهما: «٢٫٦ · ٩٢»
          في سياقٍ عربيٍّ يلتحم فيُقرأ رقماً واحداً شاذّاً. */}
      {enough ? (
        <span style={{ flex: "none", display: "flex", alignItems: "baseline", gap: 7, width: 76, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12.5, fontWeight: 900, color: toneOf(tally.avg) }}>
            {arNum(Math.round(tally.avg * 10) / 10)}
          </span>
          <span style={{ fontSize: 10, color: "var(--ink34)" }}>{arNum(tally.n)} إجابة</span>
        </span>
      ) : (
        <span style={{ flex: "none", width: 76, textAlign: "left", fontSize: 10.5, color: "var(--ink34)" }}>
          {note ?? "—"}
        </span>
      )}
    </div>
  );
}

export function KhushuCard({ prayerLogs, todayStr }: { prayerLogs: PrayerLog[]; todayStr: string }) {
  const view = useMemo(() => {
    const logs = windowLogs(prayerLogs, todayStr, WINDOW_DAYS);
    return {
      overall: khushuOverall(logs),
      company: khushuByCompany(logs),
      byPrayer: khushuByPrayer(logs),
      highlights: khushuHighlights(logs),
    };
  }, [prayerLogs, todayStr]);

  const { overall, company, byPrayer, highlights } = view;

  return (
    <section>
      <SectionHead
        title="حضورُ القلب"
        trailing={<HeadMeta>آخرُ {arNum(WINDOW_DAYS)} يومًا</HeadMeta>}
        marginTop={26}
      />

      <div
        style={{
          margin: "12px 0 0", padding: "16px 16px 18px",
          border: "1px solid var(--line)", borderRadius: 22, background: "var(--paper2)",
        }}
      >
        {overall.n === 0 ? (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.9 }}>
            بعد كلّ صلاةٍ تسجّلها يسألك مدار سؤالاً واحداً عن قلبك فيها. أجِب عنه
            أيامًا، وستقرأ هنا أين يحضر قلبُك وأين يشرد.
          </p>
        ) : (
          <>
            {/* شريطُ الدرجات: أين وقعت إجاباتُك على الثلاث. */}
            <div style={{ display: "flex", height: 12, borderRadius: 99, overflow: "hidden", background: "var(--line)" }}>
              {KHUSHU_LEVELS.map((l) => {
                const share = overall.counts[l - 1] / overall.n;
                if (!share) return null;
                return (
                  <span
                    key={l}
                    title={`${KHUSHU_META[l].label} · ${arPct(share)}`}
                    style={{ width: `${share * 100}%`, background: KHUSHU_META[l].color }}
                  />
                );
              })}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "10px 0 0" }}>
              {KHUSHU_LEVELS.map((l) => (
                <span key={l} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink52)" }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: KHUSHU_META[l].color, flex: "none" }} />
                  {KHUSHU_META[l].label} {arNum(overall.counts[l - 1])}
                </span>
              ))}
            </div>

            <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--ink34)", lineHeight: 1.8 }}>
              {arCount(overall.n, {
                one: "إجابةٌ واحدة", two: "إجابتان", few: "إجاباتٍ", many: "إجابةً",
              })}
              {overall.n >= MIN_SAMPLE ? ` · متوسّطُك ${arNum(Math.round(overall.avg * 10) / 10)} من ${arNum(3)}` : ""}
            </p>

            {overall.n < MIN_SAMPLE ? (
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--ink52)", lineHeight: 1.9 }}>
                لم تكتمل عيّنةٌ يُقرأ منها نمط بعد. أكمِل{" "}
                {arCount(MIN_SAMPLE - overall.n, {
                  one: "إجابةً واحدةً", two: "إجابتين", few: "إجاباتٍ", many: "إجابةً",
                })}{" "}
                وتظهر لك المقارنة.
              </p>
            ) : (
              <>
                <p style={{ margin: "18px 0 8px", fontSize: 11.5, letterSpacing: ".1em", fontWeight: 700, color: "var(--ink52)" }}>
                  جماعةً أم وحدك
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Bar tally={company["جماعة"]} label="جماعة" note="قليلة" />
                  <Bar tally={company["منفردة"]} label="وحدي" note="قليلة" />
                </div>

                <p style={{ margin: "18px 0 8px", fontSize: 11.5, letterSpacing: ".1em", fontWeight: 700, color: "var(--ink52)" }}>
                  أخشعُ صلواتك
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PRAYERS.map((p) => (
                    <Bar key={p} tally={byPrayer[p]} label={p} note="قليلة" />
                  ))}
                </div>

                {highlights.length > 0 && (
                  <ul
                    style={{
                      margin: "18px 0 0", padding: "14px 16px", listStyle: "none",
                      border: "1px solid var(--gline)", borderRadius: 18, background: "var(--goldw)",
                      display: "flex", flexDirection: "column", gap: 8,
                    }}
                  >
                    {highlights.map((h) => (
                      <li key={h.key} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 12.5, lineHeight: 1.8 }}>
                        <span className="mdr-diamond" style={{ width: 6, height: 6, marginTop: 7, flex: "none" }} />
                        <span>{h.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            <p style={{ margin: "14px 0 0", fontSize: 10.5, color: "var(--ink34)", lineHeight: 1.8 }}>
              الرقمُ الغليظ متوسّطُ الدرجة من {arNum(3)}، وبجانبه عددُ ما أجبتَ عنه.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
