"use client";
import type React from "react";
/** قِطعُ شاشة المذكرات: سؤالُ القمر · شبكةُ الشهر · الأيامُ الماضية. */
import type { JournalEntry } from "@/lib/types";
import { hijriDayNumber, hijriDay, hijriMonthLabel, parseDate, toDateStr, arabicMonthName, formatDate } from "@/lib/utils";
import { MOOD_SKY } from "@/lib/memoryDome";
import { arNum } from "@/lib/madar/format";
import { previewTitle, previewText } from "@/lib/markdown";
import { SectionHead, HeadMeta, MdrButton } from "../primitives";

/* ─────────────────────── سؤالُ القمر ─────────────────────── */

/**
 * القمرُ يتغيّر طورُه بليلة الشهر الهجريّ — ليس زينة: هو تقويمٌ يراه المالك
 * كلَّ يومٍ فيعرف موضعَه من الشهر بلا رقم.
 *
 * `shadowX` موضعُ قرصِ الظلّ فوق القرص المضيء: عند الهلال يكاد يغطّيه، وعند
 * البدر يخرج عنه تماماً.
 */
export function MoonQuestion({
  question,
  todayStr,
  answered,
  lastAnswer,
  onWrite,
}: {
  question: string;
  todayStr: string;
  answered: boolean;
  /** جوابُك على **هذا السؤال بعينه** في سنةٍ ماضية — إن وُجد، بتاريخه. */
  lastAnswer?: { date: string; text: string };
  onWrite: () => void;
}) {
  const day = Math.min(30, Math.max(1, hijriDayNumber(todayStr)));
  // ٠ عند المحاق و١ عند البدر ثمّ يعود — الظلُّ ينزلق بمقدار ذلك.
  const phase = 1 - Math.abs(day - 15) / 14;
  const shadowX = 19 - phase * 26;

  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 14, margin: "14px 0 0",
        border: "1px solid var(--gline)", borderRadius: 22,
        background: "var(--paper2)", padding: 16, flexWrap: "wrap",
      }}
    >
      <svg viewBox="0 0 38 38" style={{ width: 44, height: 44, flex: "none" }} aria-hidden>
        <circle cx="19" cy="19" r="13" fill="var(--gold)" />
        <circle cx={shadowX} cy="19" r="13" fill="var(--paper)" />
        <circle cx="19" cy="19" r="13" fill="none" stroke="var(--gline)" strokeWidth=".8" />
      </svg>

      <div style={{ flex: 1, minWidth: 170 }}>
        <p style={{ margin: 0, fontSize: 11, letterSpacing: ".14em", color: "var(--ink34)", fontWeight: 700 }}>
          ليلةُ {arNum(day)}
        </p>
        <p style={{ margin: "7px 0 0", fontSize: 17, fontWeight: 700, lineHeight: 1.75 }}>{question}</p>
        <p style={{ margin: "7px 0 0", fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.8 }}>
          {answered ? "أجبتَ عنه اليوم." : "لم تُجب عنه بعد."}
        </p>

        {lastAnswer && (
          <div
            style={{
              margin: "10px 0 0", padding: "11px 13px", borderRadius: 16,
              background: "var(--paper)", border: "1px dashed var(--gline)",
            }}
          >
            <span style={{ display: "block", fontSize: 10, letterSpacing: ".12em", color: "var(--gold)", fontWeight: 700 }}>
              جوابُك على هذا السؤال في {formatDate(lastAnswer.date)}
            </span>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink72)", lineHeight: 1.85 }}>
              {lastAnswer.text}
            </p>
          </div>
        )}
      </div>

      <MdrButton kind="gold" onClick={onWrite} minHeight={46} style={{ padding: "0 16px", fontSize: 12.5 }}>
        {answered ? "افتح جوابك" : "اكتب عنه"}
      </MdrButton>
    </div>
  );
}

/* ─────────────────────── شبكةُ الشهر ─────────────────────── */

const navBtn: React.CSSProperties = {
  width: 30, height: 30, flex: "none", background: "transparent",
  border: "1px solid var(--line)", borderRadius: 9,
  color: "var(--ink52)", fontSize: 14, fontWeight: 900,
  cursor: "pointer", fontFamily: "inherit", lineHeight: 1,
};

/**
 * يومٌ لكلّ خانة، ونقطةُ مزاجٍ لمن كُتب فيه.
 *
 * تحمل ما كان يميّز `StreakCalendar` في هذه الشاشة حتى لا يُفقد بحذف التكرار:
 * **تنقّلُ الأشهر** و**اليومُ الهجريّ** تحت الميلاديّ. (`StreakCalendar` نفسُه
 * باقٍ ويُستعمل في القراءة والرئيسية.)
 */
export function MonthGrid({
  entries,
  todayStr,
  year,
  month,
  onNavigate,
  onDayClick,
}: {
  entries: JournalEntry[];
  todayStr: string;
  /** الشهرُ المعروض (١..١٢) وسنتُه — يقودهما الأبوان فيبقى الاختيارُ محفوظاً. */
  year: number;
  month: number;
  onNavigate: (year: number, month: number) => void;
  onDayClick: (date: string) => void;
}) {
  const y = year;
  const m = month;
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map<string, JournalEntry>();
  for (const e of entries) if (!byDate.has(e.date)) byDate.set(e.date, e);

  let filled = 0;
  const tiles = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const key = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const entry = byDate.get(key);
    if (entry) filled++;
    return { day, key, entry, isToday: key === todayStr };
  });

  return (
    <div style={{ margin: "16px 0 0" }}>
      <SectionHead
        title={`${arabicMonthName(m - 1)} ${arNum(y)}`}
        trailing={
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <HeadMeta>{arNum(filled)} من {arNum(daysInMonth)} يومًا</HeadMeta>
            <button
              type="button"
              onClick={() => { const d = new Date(y, m - 2, 1); onNavigate(d.getFullYear(), d.getMonth() + 1); }}
              aria-label="الشهر السابق"
              style={navBtn}
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => { const d = new Date(y, m, 1); onNavigate(d.getFullYear(), d.getMonth() + 1); }}
              aria-label="الشهر التالي"
              style={navBtn}
            >
              ‹
            </button>
          </span>
        }
        marginTop={0}
        marginBottom={12}
      />
      <p style={{ margin: "0 0 10px", fontSize: 11, color: "var(--ink34)" }}>{hijriMonthLabel(y, m - 1)}</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onDayClick(t.key)}
            title={t.entry ? t.entry.title || "مذكرة" : "لا مذكرةَ في هذا اليوم"}
            style={{
              aspectRatio: "1", minHeight: 40, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 4,
              background: t.isToday ? "var(--paper2)" : "transparent",
              border: `1px solid ${t.isToday ? "var(--gold)" : "var(--line)"}`,
              borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
              color: t.entry ? "var(--ink52)" : "var(--ink34)",
              fontSize: 12, fontWeight: t.isToday ? 900 : 700,
            }}
          >
            <span style={{ lineHeight: 1 }}>{arNum(t.day)}</span>
            <span style={{ fontSize: 8, color: "var(--ink34)", lineHeight: 1 }}>{hijriDay(t.key)}</span>
            <span
              style={{
                width: 6, height: 6, borderRadius: "50%",
                background: t.entry ? MOOD_SKY[t.entry.mood ?? 3] : "transparent",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────── الأيامُ الماضية ─────────────────────── */

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

/**
 * آخرُ سبعةِ أيام: ما كُتب فيه يُفتح، وما لم يُكتب يُدعى للكتابة. ليست سلسلةً
 * ولا محاسبة — «اكتب» دعوةٌ لا لوم.
 */
export function PastDays({
  entries,
  todayStr,
  onOpen,
  onWrite,
}: {
  entries: JournalEntry[];
  todayStr: string;
  onOpen: (entry: JournalEntry) => void;
  onWrite: (date: string) => void;
}) {
  const byDate = new Map<string, JournalEntry>();
  for (const e of entries) if (!byDate.has(e.date)) byDate.set(e.date, e);

  const end = parseDate(todayStr);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    days.push(toDateStr(d));
  }
  const written = days.filter((d) => byDate.has(d)).length;

  return (
    <div style={{ margin: "16px 0 0" }}>
      <SectionHead
        title="الأيامُ الماضية"
        trailing={<HeadMeta>{arNum(written)} من {arNum(7)}</HeadMeta>}
        marginTop={0}
        marginBottom={12}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {days.map((d) => {
          const entry = byDate.get(d);
          const tone = entry ? "var(--gold)" : "var(--ink34)";
          // العنوانُ من النصّ حين لا عنوان، والمقتطفُ مجرَّدٌ من الماركداون —
          // «بلا عنوان» صفٌّ من عناوينَ متطابقةٍ لا يُميَّز فيها يومٌ من يوم،
          // و«###» من أرشيف Day One تظهر خاماً إن لم تُجرَّد.
          const label = entry ? previewTitle(entry.title, entry.content) : "—";
          const excerpt = entry
            ? previewText(entry.content, 70) || "بلا نصّ"
            : "لم تكتب في هذا اليوم";
          return (
            <button
              key={d}
              type="button"
              onClick={() => (entry ? onOpen(entry) : onWrite(d))}
              style={{
                display: "flex", alignItems: "center", gap: 11, width: "100%",
                minHeight: 52, padding: "11px 13px", boxSizing: "border-box",
                background: entry ? "var(--paper2)" : "transparent",
                border: `1px solid ${entry ? "var(--gline)" : "var(--line)"}`,
                borderRadius: 17, textAlign: "right", cursor: "pointer",
                fontFamily: "inherit", color: "var(--ink)",
              }}
            >
              <span style={{ width: 34, flex: "none", textAlign: "center" }}>
                <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: tone }}>
                  {arNum(Number(d.slice(8)))}
                </span>
                <span style={{ display: "block", fontSize: 9, color: "var(--ink34)" }}>
                  {WEEKDAYS[parseDate(d).getDay()].replace(/^ال/, "")}
                </span>
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: "block", fontSize: 13.5, fontWeight: 700,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
                <span
                  style={{
                    display: "block", marginTop: 3, fontSize: 11, color: "var(--ink52)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {excerpt}
                </span>
              </span>
              <span style={{ fontSize: 11, fontWeight: 800, color: tone, flex: "none" }}>
                {entry ? "افتح" : "اكتب"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
