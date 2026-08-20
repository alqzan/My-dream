"use client";
/**
 * صفحةُ الصلاة. الجسدُ منقولٌ من التصميم (`PrayerScreen`)، ويبقى تحته **كلُّ
 * ما كانت الصفحةُ القديمة تعرضه ولا يرسمه التصميم** — لا يسقط شيءٌ في النقل:
 *
 * - سلسلتا الصلاة والمسجد ونسبةُ الشهر: كانت ثلاثَ بطاقاتٍ في الأعلى.
 * - **فلك الشهور** (`PrayerYearRing`): ليس تكراراً لحلقة السنة المنقولة —
 *   تلك ٧٣ شعبةً تقرأ الالتزام أسبوعاً أسبوعاً، وهذا اثنا عشر قوساً **يُنقر
 *   فيُقفز بسجلّ الشهر إلى شهره**. حذفُه كان يترك التقويمَ بلا منتقٍ للشهر
 *   ويجعل المكوّنَ يتيماً في المستودع.
 * - سجلُّ الشهر (`PrayerCalendar`) والبصيرة (`PrayerInsight`).
 */
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, getPrayerLog, countDayPrayers, getPrayerStreak, getMosqueStreak, formatDate,
} from "@/lib/utils";
import { PRAYERS, type PrayerName, type PrayerStatus } from "@/lib/types";
import { PrayerScreen } from "@/components/madar/prayer/PrayerScreen";
import { PrayerRow } from "@/components/prayer/PrayerRow";
import { PrayerCalendar } from "@/components/prayer/PrayerCalendar";
import { PrayerYearRing } from "@/components/prayer/PrayerYearRing";
import { PrayerInsight } from "@/components/prayer/PrayerInsight";
import { Modal } from "@/components/ui/Modal";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { SectionHead, HeadMeta } from "@/components/madar/primitives";
import { arNum, arPct } from "@/lib/madar/format";

export default function PrayersPage() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const [editDate, setEditDate] = useState<string | null>(null);
  const todayStr = today();
  const ringYear = Number(todayStr.slice(0, 4));
  const [calYear, setCalYear] = useState(ringYear);
  const [calMonth, setCalMonth] = useState(() => Number(todayStr.slice(5, 7)) - 1);
  const [historyOpen, setHistoryOpen] = useState(false);

  const streak = getPrayerStreak(prayerLogs);
  const mosqueStreak = getMosqueStreak(prayerLogs);

  const monthPrefix = todayStr.slice(0, 7);
  const monthTotals = prayerLogs
    .filter((l) => l.date.startsWith(monthPrefix) && l.date <= todayStr)
    .reduce((acc, l) => acc + countDayPrayers(l).prayed, 0);
  const daysSoFar = Number(todayStr.slice(8, 10));
  const monthRatio = daysSoFar ? monthTotals / (daysSoFar * 5) : 0;

  function statusFor(date: string, prayer: PrayerName): PrayerStatus {
    return getPrayerLog(prayerLogs, date)?.prayers[prayer] ?? "لم";
  }

  const editLog = editDate ? getPrayerLog(prayerLogs, editDate) : undefined;
  const editCounts = countDayPrayers(editLog);

  const tiles = [
    { n: "هذا الشهر", v: arPct(monthRatio), c: "var(--gold)" },
    { n: "سلسلةُ الصلاة", v: `${arNum(streak)} يومًا`, c: "var(--green)" },
    { n: "سلسلةُ المسجد", v: `${arNum(mosqueStreak)} يومًا`, c: "var(--blue)" },
  ];

  return (
    <>
      <PrayerScreen />

      <div className="mdr mdr-prayer-page" style={{ padding: "0 20px 32px" }}>
        <CollapsibleSection
          className="mdr-prayer-history"
          title="السجل والتحليل"
          summary="النسبة، الشهور، والتقويم"
          tone="brand"
          open={historyOpen}
          onToggle={() => setHistoryOpen((v) => !v)}
        >
          <SectionHead title="السلاسلُ والنسبة" marginTop={12} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, margin: "12px 0 0" }}>
            {tiles.map((t) => (
              <div
                key={t.n}
                style={{
                  padding: "13px 10px", border: "1px solid var(--line)",
                  borderRadius: 18, background: "var(--paper2)", textAlign: "center",
                }}
              >
                <span style={{ display: "block", fontSize: 18, fontWeight: 900, color: t.c }}>{t.v}</span>
                <span style={{ display: "block", marginTop: 4, fontSize: 10.5, color: "var(--ink52)" }}>{t.n}</span>
              </div>
            ))}
          </div>

          <SectionHead
            title="فلكُ الشهور"
            trailing={<HeadMeta>سطوعُ القوس = التزامُ شهره</HeadMeta>}
            marginTop={26}
          />
          <div style={{ marginTop: 12 }}>
            <PrayerYearRing
              prayerLogs={prayerLogs}
              year={ringYear}
              activeMonth={calYear === ringYear ? calMonth : -1}
              onSelectMonth={(m) => { setCalYear(ringYear); setCalMonth(m); }}
            />
          </div>

          <SectionHead title="سجلُّ الشهر" trailing={<HeadMeta>اضغط يومًا لتعدّله</HeadMeta>} marginTop={26} />
          <div style={{ marginTop: 12 }}>
            <PrayerCalendar
              prayerLogs={prayerLogs}
              onDayClick={setEditDate}
              year={calYear}
              month={calMonth}
              onNavigate={(y, m) => { setCalYear(y); setCalMonth(m); }}
            />
          </div>

          <div style={{ marginTop: 18 }}>
            <PrayerInsight prayerLogs={prayerLogs} />
          </div>
        </CollapsibleSection>
      </div>

      <Modal open={!!editDate} onClose={() => setEditDate(null)} title={editDate ? formatDate(editDate) : ""}>
        {editDate && (
          <div className="space-y-3">
            <div className="text-center text-xs text-gray-400">
              {editCounts.prayed}/5 صلوات
              {editCounts.mosque > 0 ? ` · ${editCounts.mosque} بالمسجد` : ""}
            </div>
            <div className="space-y-2">
              {PRAYERS.map((prayer) => (
                <PrayerRow
                  key={prayer}
                  prayer={prayer}
                  status={statusFor(editDate, prayer)}
                  onChange={(status) => setPrayerStatus(editDate, prayer, status)}
                />
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
