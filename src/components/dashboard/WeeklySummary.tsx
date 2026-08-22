import type { Habit, JournalEntry, PrayerLog, ReadingLog, Transaction } from "@/lib/types";
import { formatAmount, formatDateShort } from "@/lib/utils";
import { arNum } from "@/lib/madar/format";
import { summarizeWeeklyActivity } from "@/lib/weeklyActivity";

interface WeeklySummaryProps {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  prayerLogs: PrayerLog[];
  habits: Habit[];
  frozenHabits?: string[];
  quranActivity: Iterable<string>;
}

// ملخص واحد لمصادر النشاط اليومية كلها — لا عدّاد منفصل ينسى قسماً من التطبيق.
export function WeeklySummary({
  transactions,
  journalEntries,
  readingLogs,
  prayerLogs,
  habits,
  frozenHabits,
  quranActivity,
}: WeeklySummaryProps) {
  const summary = summarizeWeeklyActivity({
    transactions,
    journalEntries,
    readingLogs,
    prayerLogs,
    habits,
    frozenHabits,
    quranActivity,
  });
  const dailyCompletions = summary.readingDays + summary.habitCompletions;

  return (
    <section className="mdr-weekly-summary" aria-labelledby="weekly-summary-title">
      <div className="mdr-weekly-summary-head">
        <div>
          <span>لمحة الأسبوع</span>
          <h2 id="weekly-summary-title">خطواتك الأخيرة</h2>
        </div>
        <small>{formatDateShort(summary.week[0])} — {formatDateShort(summary.week[6])}</small>
      </div>

      <div className="mdr-weekly-summary-stats">
        <Metric value={`${arNum(summary.prayerCount)}/${arNum(35)}`} label="صلوات مسجّلة" tone="prayer" />
        <Metric value={`${arNum(summary.journalDays)}/${arNum(7)}`} label="أيام كتبت" tone="journal" />
        <Metric value={`${arNum(summary.quranDays)}/${arNum(7)}`} label="أيام قرآن" tone="quran" />
        <Metric value={formatAmount(dailyCompletions)} label="قراءة وعادات" tone="daily" />
      </div>

      <div className="mdr-weekly-summary-foot">
        <div className="mdr-weekly-dots" aria-label={`نشاطك في ${arNum(summary.activeDays)} من ${arNum(7)} أيام`}>
          {summary.week.map((date) => (
            <span key={date} className={summary.activeDates.includes(date) ? "is-active" : ""} title={formatDateShort(date)} />
          ))}
        </div>
        <span>
          {summary.activeDays
            ? `ظهر نشاطك في ${arNum(summary.activeDays)} من ٧ أيام`
            : "ابدأ بخطوة صغيرة اليوم"}
          {summary.spent > 0 ? ` · ${formatAmount(summary.spent)} ر.س` : ""}
        </span>
      </div>
    </section>
  );
}

function Metric({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "prayer" | "journal" | "quran" | "daily";
}) {
  return (
    <div className={`mdr-weekly-metric mdr-weekly-metric--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
