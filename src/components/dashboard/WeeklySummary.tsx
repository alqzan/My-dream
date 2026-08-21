import type { JournalEntry, ReadingLog, Transaction, HifzState } from "@/lib/types";
import { cashOut, formatAmount, formatDateShort, parseDate, toDateStr } from "@/lib/utils";

interface WeeklySummaryProps {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  quranHifz?: HifzState | null;
}

function getWeekDates() {
  const dates: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(now.getDate() - i);
    dates.push(toDateStr(date));
  }
  return dates;
}

// حصيلة أسبوعية صغيرة — لا تقويم ولا روابط ولا شاشة مراجعة ثانية؛ أربع إشارات
// حقيقية تكفي لتأخذ فكرة عن الأسبوع ثم تعود لليوم.
export function WeeklySummary({ transactions, journalEntries, readingLogs, quranHifz }: WeeklySummaryProps) {
  const week = getWeekDates();
  const weekSet = new Set(week);
  const weekJournal = journalEntries.filter((entry) => weekSet.has(entry.date));
  const weekReading = readingLogs.filter((log) => weekSet.has(log.date));
  const weekTransactions = transactions.filter((transaction) => weekSet.has(transaction.date));
  const quranSessions = [
    ...(quranHifz?.sessions ?? []),
    ...(quranHifz?.reviews ?? []),
  ].filter((session) => weekSet.has(session.date)).length;
  const journalDays = new Set(weekJournal.map((entry) => entry.date)).size;
  const readingDays = new Set(weekReading.map((log) => log.date)).size;
  const pagesRead = weekReading.reduce((sum, log) => sum + log.pagesRead, 0);
  const spent = weekTransactions.reduce((sum, transaction) => sum + cashOut(transaction), 0);
  const activeDays = week.filter((date) =>
    weekJournal.some((entry) => entry.date === date) ||
    weekReading.some((log) => log.date === date) ||
    weekTransactions.some((transaction) => transaction.date === date) ||
    [...(quranHifz?.sessions ?? []), ...(quranHifz?.reviews ?? [])].some((session) => session.date === date)
  ).length;

  return (
    <section className="mdr-weekly-summary" aria-labelledby="weekly-summary-title">
      <div className="mdr-weekly-summary-head">
        <div>
          <span>لمحة الأسبوع</span>
          <h2 id="weekly-summary-title">خطواتك الأخيرة</h2>
        </div>
        <small>{formatDateShort(week[0])} — {formatDateShort(week[6])}</small>
      </div>

      <div className="mdr-weekly-summary-stats">
        <Metric value={`${journalDays}/7`} label="أيام كتبت" tone="journal" />
        <Metric value={formatAmount(pagesRead)} label="صفحة قرأت" tone="reading" />
        <Metric value={formatAmount(quranSessions)} label="جلسة قرآن" tone="quran" />
        <Metric value={`${formatAmount(spent)} ر.س`} label="صرف الأسبوع" tone="finance" />
      </div>

      <div className="mdr-weekly-summary-foot">
        <div className="mdr-weekly-dots" aria-label={`نشاطت في ${activeDays} من 7 أيام`}>
          {week.map((date) => {
            const active =
              weekJournal.some((entry) => entry.date === date) ||
              weekReading.some((log) => log.date === date) ||
              weekTransactions.some((transaction) => transaction.date === date) ||
              [...(quranHifz?.sessions ?? []), ...(quranHifz?.reviews ?? [])].some((session) => session.date === date);
            return <span key={date} className={active ? "is-active" : ""} title={formatDateShort(date)} />;
          })}
        </div>
        <span>{activeDays ? `ظهر نشاطك في ${activeDays} من ٧ أيام` : "ابدأ بخطوة صغيرة اليوم"}</span>
      </div>
    </section>
  );
}

function Metric({ value, label, tone }: { value: string; label: string; tone: "journal" | "reading" | "quran" | "finance" }) {
  return (
    <div className={`mdr-weekly-metric mdr-weekly-metric--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
