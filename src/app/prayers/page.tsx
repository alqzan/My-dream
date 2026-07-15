"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, getPrayerLog, countDayPrayers, getPrayerStreak, getMosqueStreak, formatDate,
} from "@/lib/utils";
import { PRAYERS, type PrayerName, type PrayerStatus } from "@/lib/types";
import { PrayerRow } from "@/components/prayer/PrayerRow";
import { PrayerCalendar } from "@/components/prayer/PrayerCalendar";
import { PrayerYearRing } from "@/components/prayer/PrayerYearRing";
import { PrayerInsight } from "@/components/prayer/PrayerInsight";
import { PrayerOrbit } from "@/components/dashboard/PrayerOrbit";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { Flame } from "lucide-react";

export default function PrayersPage() {
  const { prayerLogs, setPrayerStatus } = useAppStore();
  const [editDate, setEditDate] = useState<string | null>(null);
  // Shared calendar view — فلك الشهور taps set it so the calendar jumps to that
  // month; the calendar's own arrows write back through onNavigate.
  const [calYear, setCalYear] = useState(() => Number(today().slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(today().slice(5, 7)) - 1);

  const todayStr = today();
  const ringYear = Number(todayStr.slice(0, 4));
  const todayLog = getPrayerLog(prayerLogs, todayStr);
  const { prayed: todayPrayed } = countDayPrayers(todayLog);

  const streak = getPrayerStreak(prayerLogs);
  const mosqueStreak = getMosqueStreak(prayerLogs);

  const monthPrefix = todayStr.slice(0, 7);
  const monthLogs = prayerLogs.filter((l) => l.date.startsWith(monthPrefix) && l.date <= todayStr);
  const monthTotals = monthLogs.reduce(
    (acc, l) => {
      const c = countDayPrayers(l);
      acc.prayed += c.prayed;
      acc.mosque += c.mosque;
      return acc;
    },
    { prayed: 0, mosque: 0 }
  );
  const daysSoFar = Number(todayStr.slice(8, 10));
  const monthPct = Math.round((monthTotals.prayed / (daysSoFar * 5)) * 100);

  function statusFor(date: string, prayer: PrayerName): PrayerStatus {
    return getPrayerLog(prayerLogs, date)?.prayers[prayer] ?? "لم";
  }

  const editLog = editDate ? getPrayerLog(prayerLogs, editDate) : undefined;
  const editCounts = countDayPrayers(editLog);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">الصلاة</h1>
          <div className="flex items-center gap-2 mt-1">
            <Flame size={14} className={streak > 0 ? "text-amber-500" : "text-gray-300"} />
            <span className="text-sm text-gray-500">
              {streak > 0 ? `${streak} يوم متواصل` : "سجّل صلاتك اليوم"}
            </span>
          </div>
        </div>
      </div>

      <Card>
        <PrayerOrbit size="large" />
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-prayer/5 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-prayer">{todayPrayed}/5</div>
          <div className="text-[11px] text-gray-500 mt-0.5">اليوم</div>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-amber-600">{monthPct || 0}%</div>
          <div className="text-[11px] text-gray-500 mt-0.5">هذا الشهر</div>
        </div>
        <div className="bg-teal-50 rounded-xl p-3 text-center">
          <div className="text-xl font-bold text-prayer flex items-center justify-center gap-1">
            <MosqueIcon size={16} /> {mosqueStreak}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">سلسلة المسجد</div>
        </div>
      </div>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">فلك الشهور</span>
          <span className="text-xs text-gray-400">سطوع كل قوسٍ = التزام شهره</span>
        </div>
        <PrayerYearRing
          prayerLogs={prayerLogs}
          year={ringYear}
          activeMonth={calYear === ringYear ? calMonth : -1}
          onSelectMonth={(m) => { setCalYear(ringYear); setCalMonth(m); }}
        />
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سجل الشهر</span>
          <span className="text-xs text-gray-400">اضغط أي يوم للتعديل 👆</span>
        </div>
        <PrayerCalendar
          prayerLogs={prayerLogs}
          onDayClick={setEditDate}
          year={calYear}
          month={calMonth}
          onNavigate={(y, m) => { setCalYear(y); setCalMonth(m); }}
        />
      </Card>

      <PrayerInsight prayerLogs={prayerLogs} />

      <Modal
        open={!!editDate}
        onClose={() => setEditDate(null)}
        title={editDate ? formatDate(editDate) : ""}
      >
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
    </div>
  );
}
