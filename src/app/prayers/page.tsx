"use client";
import { useState } from "react";
import { useAppStore } from "@/lib/store";
import {
  today, getPrayerLog, countDayPrayers, getPrayerStreak, getMosqueStreak, formatDate,
} from "@/lib/utils";
import { PRAYERS, type PrayerName, type PrayerStatus } from "@/lib/types";
import { PrayerRow } from "@/components/prayer/PrayerRow";
import { PrayerCalendar } from "@/components/prayer/PrayerCalendar";
import { PrayerInsight } from "@/components/prayer/PrayerInsight";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { MosqueIcon } from "@/components/icons/MosqueIcon";
import { Flame } from "lucide-react";

export default function PrayersPage() {
  const { prayerLogs, setPrayerStatus } = useAppStore();
  const [editDate, setEditDate] = useState<string | null>(null);

  const todayStr = today();
  const todayLog = getPrayerLog(prayerLogs, todayStr);
  const { prayed: todayPrayed, mosque: todayMosque } = countDayPrayers(todayLog);

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
    <div className="page-enter max-w-2xl mx-auto px-4 py-6 space-y-5">
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
          <span className="text-sm font-semibold text-gray-700">صلوات اليوم</span>
          {todayMosque > 0 && (
            <span className="text-xs text-prayer flex items-center gap-1">
              <MosqueIcon size={13} /> {todayMosque} بالمسجد
            </span>
          )}
        </div>
        <div className="space-y-2">
          {PRAYERS.map((prayer) => (
            <PrayerRow
              key={prayer}
              prayer={prayer}
              status={statusFor(todayStr, prayer)}
              onChange={(status) => setPrayerStatus(todayStr, prayer, status)}
            />
          ))}
        </div>
        {todayPrayed === 5 && (
          <div className="text-center py-2 mt-3 text-sm font-bold text-prayer bg-prayer/10 rounded-xl">
            {todayMosque === 5 ? "🕌 صلّيت الخمس بالمسجد اليوم — تقبّل الله" : "✨ أكملت صلوات اليوم"}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-700">سجل الشهر</span>
          <span className="text-xs text-gray-400">اضغط أي يوم للتعديل 👆</span>
        </div>
        <PrayerCalendar prayerLogs={prayerLogs} onDayClick={setEditDate} />
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
