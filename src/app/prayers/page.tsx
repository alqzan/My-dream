"use client";
/**
 * صفحةُ الصلاة. الجسدُ منقولٌ من التصميم (`PrayerScreen`)، ويبقى تحته **سجلُّ
 * الشهر** و**البصيرة** — التصميمُ لا يرسمهما، وحذفُهما خسارةٌ لا نقل: سجلُّ
 * الأسبوع في التصميم يرى سبعةَ أيامٍ فقط ولا يُعدّل يوماً مضى، وهذا يفعل.
 */
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import { today, getPrayerLog, countDayPrayers, formatDate } from "@/lib/utils";
import { PRAYERS, type PrayerName, type PrayerStatus } from "@/lib/types";
import { PrayerScreen } from "@/components/madar/prayer/PrayerScreen";
import { PrayerRow } from "@/components/prayer/PrayerRow";
import { PrayerCalendar } from "@/components/prayer/PrayerCalendar";
import { PrayerInsight } from "@/components/prayer/PrayerInsight";
import { Modal } from "@/components/ui/Modal";
import { SectionHead, HeadMeta } from "@/components/madar/primitives";

export default function PrayersPage() {
  const prayerLogs = useAppStore((s) => s.prayerLogs);
  const setPrayerStatus = useAppStore((s) => s.setPrayerStatus);
  const [editDate, setEditDate] = useState<string | null>(null);
  const todayStr = today();
  const [calYear, setCalYear] = useState(() => Number(todayStr.slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(todayStr.slice(5, 7)) - 1);

  function statusFor(date: string, prayer: PrayerName): PrayerStatus {
    return getPrayerLog(prayerLogs, date)?.prayers[prayer] ?? "لم";
  }

  const editLog = editDate ? getPrayerLog(prayerLogs, editDate) : undefined;
  const editCounts = countDayPrayers(editLog);

  return (
    <>
      <PrayerScreen />

      <div className="mdr" style={{ padding: "0 20px 32px" }}>
        <SectionHead title="سجلُّ الشهر" trailing={<HeadMeta>اضغط يوماً لتعدّله</HeadMeta>} marginTop={28} />
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
      </div>

      <Modal open={!!editDate} onClose={() => setEditDate(null)} title={editDate ? formatDate(editDate) : ""}>
        {editDate && (
          <div className="space-y-3">
            <div className="text-center text-xs text-gray-400">
              {editCounts.prayed}/5 صلوات
              {editCounts.mosque > 0 ? ` · ${editCounts.mosque} بالمسجد 🕌` : ""}
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
