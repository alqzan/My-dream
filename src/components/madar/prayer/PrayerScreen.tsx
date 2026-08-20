"use client";
/**
 * شاشةُ الصلاة — منقولةٌ من «التطبيق النهائي بشكل نهائي.dc.html».
 *
 * ما زادته على الشاشة القديمة: **المحرابُ** بدل شبكة الأزرار، و**قيامُ الليل**
 * و**السننُ الرواتب** و**الفوائتُ والقضاء** (حالتان جديدتان في نموذج البيانات)،
 * و**حلقةُ سنةٍ من ٧٣ شعبة** بدل أقواس الأشهر الاثني عشر.
 *
 * المواقيتُ من حساب الجهاز الحقيقي (`computePrayerTimes`) لا من جدولٍ ثابت —
 * التصميمُ يرسمها ثابتةً لأنّه نموذج، والمستودعُ يحسبها فعلاً.
 */
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { PrayerName, PrayerStatus } from "@/lib/types";
import { PRAYERS } from "@/lib/types";
import {
  qadaOwed, qadaDoneOn, sunanOf, stepSunan, SUNAN_MAX,
} from "@/lib/prayerExtras";
import {
  today, computePrayerTimes, getCachedCoords, formatClock, parseDate, buzz,
} from "@/lib/utils";
import { arNum, arCount, arClock, arSpan } from "@/lib/madar/format";
import { Modal } from "@/components/ui/Modal";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { MdrScreen, SectionHead, HeadMeta, Stepper, MdrButton } from "../primitives";
import { Mihrab } from "./Mihrab";
import { QiyamPanel } from "./QiyamPanel";
import { PrayerRows, YearRing, WeekLog, cellSkin } from "./PrayerParts";

/** الحالاتُ التي تُختار يدوياً من «⋯» — «لم» تعني المسح. */
const MANUAL_STATES: { v: PrayerStatus; n: string; d: string }[] = [
  { v: "جماعة", n: "في جماعة", d: "صلَّيتها مع الناس" },
  { v: "منفردة", n: "صلَّيت", d: "صلَّيتها وحدك في وقتها" },
  { v: "فائتة", n: "فاتت", d: "مضى وقتُها ولم تُصلَّ — تُعَدُّ عليك" },
  { v: "قضاء", n: "قضيتُها", d: "صلَّيتها بعد وقتها" },
  { v: "لم", n: "امسح التسجيل", d: "تعود بلا حالة" },
];

export function PrayerScreen() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const qadaBacklog = useAppStore((s) => s.qadaBacklog ?? 0);
  const cyclePrayerStatus = useAppStore((s) => s.cyclePrayerStatus);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const setSunan = useAppStore((s) => s.setSunan);
  const setQiyam = useAppStore((s) => s.setQiyam);
  const clearQiyam = useAppStore((s) => s.clearQiyam);
  const doQada = useAppStore((s) => s.doQada);
  const addQadaBacklog = useAppStore((s) => s.addQadaBacklog);

  const [statesFor, setStatesFor] = useState<PrayerName | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const todayStr = today();
  const log = prayerLogs.find((l) => l.date === todayStr);

  // مواقيتُ اليوم الحقيقية. حين يتعذّر الحساب (قطبٌ أو إحداثيّاتٌ شاذّة) نعرض
  // الاسم بلا وقتٍ بدل أن نكذب بجدولٍ ثابت.
  const times = useMemo(() => {
    const coords = getCachedCoords();
    const t = computePrayerTimes(parseDate(todayStr), coords.lat, coords.lng);
    const now = new Date();
    const out = {} as Record<PrayerName, { label: string; passed: boolean; at: Date | null }>;
    for (const p of PRAYERS) {
      const at = t?.[p] ?? null;
      const passed = at ? now >= at : false;
      const clock = at ? arClock(at, formatClock) : "—";
      // ما سُجّل يكفيه وقتُه؛ وما لم يُسجَّل يحمل معه بُعدَه عن الآن — «بعد
      // ١١ ساعة» أو «منذ ٤٠ د» — فيُقرأ الصفُّ نداءً لا جدولاً.
      const done = log?.prayers[p] && log.prayers[p] !== "لم";
      const mins = at ? (at.getTime() - now.getTime()) / 60000 : 0;
      const label = !at || done ? clock
        : `${clock} · ${passed ? "منذ" : "بعد"} ${arSpan(mins)}`;
      out[p] = { label, passed, at };
    }
    return out;
  }, [todayStr, log]);

  const owed = qadaOwed(prayerLogs, qadaBacklog);
  const doneToday = qadaDoneOn(prayerLogs, todayStr);
  const sunan = sunanOf(log);

  // ما مضى وقتُه اليومَ ولم يُسجَّل — دعوةٌ للتسجيل لا توبيخ.
  const late = PRAYERS.filter((p) => {
    const v = log?.prayers[p];
    return (!v || v === "لم") && times[p].passed;
  });

  const qadaLine =
    (owed === 0
      ? "لا فوائتَ عليك."
      : `عليك ${arCount(owed, {
          one: "فائتةٌ واحدةٌ لم تُقضَ", two: "فائتتان لم تُقضيا",
          few: "فوائتَ لم تُقضَ", many: "فائتةً لم تُقضَ",
        })}.`) + (doneToday ? ` قضيتَ اليومَ ${arNum(doneToday)}.` : "");

  return (
    <MdrScreen>
      <Mihrab
        log={log}
        onCycle={(p) => { buzz(); cyclePrayerStatus(todayStr, p); }}
      />

      {late.length > 0 && (
        <div
          style={{
            margin: "14px 0 0", padding: "15px 16px",
            border: "1px solid var(--gline)", borderRadius: 20, background: "var(--clayw)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--clay)", flex: "none" }} />
            <span style={{ flex: 1, fontSize: 13, fontWeight: 900 }}>
              {late.length === 1
                ? `مضى وقتُ ${late[0]} ولم تُسجِّلها.`
                : `${arCount(late.length, {
                    one: "صلاةٌ واحدة", two: "صلاتان", few: "صلواتٍ", many: "صلاةً",
                  })} مضى وقتُها بلا تسجيل.`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 7, margin: "12px 0 0", flexWrap: "wrap" }}>
            {late.map((p) => (
              <MdrButton
                key={p}
                onClick={() => { buzz(); cyclePrayerStatus(todayStr, p); }}
                kind="ghost"
                style={{ background: "var(--paper)", color: "var(--ink)", fontSize: 12.5, padding: "0 14px" }}
              >
                {p} · {times[p].label}
              </MdrButton>
            ))}
          </div>
        </div>
      )}

      <PrayerRows
        log={log}
        times={times}
        onCycle={(p) => { buzz(); cyclePrayerStatus(todayStr, p); }}
        onOpenStates={setStatesFor}
      />

      <QiyamPanel
        logs={prayerLogs}
        date={todayStr}
        onSetRakaat={(n) => setQiyam(todayStr, { rakaat: n })}
        // «أوترتُ» على ليلةٍ بلا ركعاتٍ تُثبت ركعةً واحدة — الوترُ نفسُه قيام.
        onToggleWitr={() => {
          const q = prayerLogs.find((l) => l.date === todayStr)?.qiyam;
          const witr = !(q?.witr ?? false);
          setQiyam(todayStr, { witr, rakaat: q?.rakaat || (witr ? 1 : 0) });
        }}
        onClear={() => clearQiyam(todayStr)}
      />

      <Stepper
        label="السننُ الرواتب"
        value={arNum(sunan)}
        onDown={() => setSunan(todayStr, stepSunan(sunan, -1))}
        onUp={() => setSunan(todayStr, stepSunan(sunan, 1))}
      />

      <div
        style={{
          display: "flex", alignItems: "center", gap: 12, padding: "15px 0",
          borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", flexWrap: "wrap",
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>الفوائتُ والقضاء</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--ink52)" }}>{qadaLine}</p>
        </div>
        <MdrButton kind="ink" onClick={() => doQada()} disabled={owed === 0}>
          اقضِ واحدة
        </MdrButton>
        <MdrButton kind="ghost" onClick={() => addQadaBacklog(1)}>
          أضِف فائتة
        </MdrButton>
      </div>

      <CollapsibleSection
        className="mdr-prayer-history"
        title="السجل اليومي"
        summary="الأسبوع وحلقة السنة"
        tone="brand"
        open={historyOpen}
        onToggle={() => setHistoryOpen((v) => !v)}
      >
        <YearRing logs={prayerLogs} year={Number(todayStr.slice(0, 4))} todayStr={todayStr} />
        <WeekLog logs={prayerLogs} todayStr={todayStr} />
      </CollapsibleSection>

      <Modal open={statesFor !== null} onClose={() => setStatesFor(null)} title={statesFor ?? ""}>
        <div className="mdr">
          <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--ink52)", lineHeight: 1.75 }}>
            حالاتٌ لا تصلها الضغطةُ على القوس. «فاتت» تُعَدُّ عليك حتى تقضيها.
          </p>
          {MANUAL_STATES.map((o) => {
            const current = statesFor ? log?.prayers[statesFor] ?? "لم" : "لم";
            const on = current === o.v;
            const c = cellSkin(o.v);
            return (
              <button
                key={o.v}
                type="button"
                onClick={() => {
                  if (statesFor) setPrayerStatus(todayStr, statesFor, o.v);
                  setStatesFor(null);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 12, width: "100%",
                  minHeight: 52, padding: "12px 10px",
                  background: on ? "var(--goldw)" : "transparent",
                  border: "none", borderTop: "1px solid var(--line)",
                  textAlign: "right", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)",
                }}
              >
                <span style={{ width: 7, height: 7, transform: "rotate(45deg)", background: c.bd, flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 15, fontWeight: 700 }}>{o.n}</span>
                  <span style={{ display: "block", fontSize: 11.5, color: "var(--ink52)", lineHeight: 1.6, marginTop: 2 }}>
                    {o.d}
                  </span>
                </span>
                {on && <span style={{ fontSize: 12, color: "var(--gold)", fontWeight: 700 }}>الحالي</span>}
              </button>
            );
          })}
          <p style={{ margin: "14px 0 0", fontSize: 11.5, color: "var(--ink34)", lineHeight: 1.75 }}>
            السننُ الرواتب اليومَ: {arNum(sunan)} من {arNum(SUNAN_MAX)}
          </p>
        </div>
      </Modal>
    </MdrScreen>
  );
}
