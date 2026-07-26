import type { Transaction, JournalEntry, ReadingLog, Book, Habit, PrayerLog } from "./types";
import { countDayPrayers, cashOut } from "./utils";

// ===================== «اليوم المكتمل» — تعريفٌ واحد =====================
// الطقوس الأساسية الثلاثة: مذكرة · قراءة · وِرد قرآني. ما جُمّد منها لا يُطالَب
// به فلا يكسر الاكتمال ولا يُحتسب ضمنه. المالية والصلاة خارج التعريف عمداً
// (الصرف ليس شرط كل يوم، والصلاة لها سلسلتها الخاصة).
//
// هذه هي **الدالة المركزية**: شارة اليوم في DayView، وتقويم السلسلة في الرئيسية،
// ومعالم MilestoneWatcher — كلّها تقرأ منها، فلا يختلف يومٌ «مكتمل» في شاشةٍ عن
// أخرى (كان في utils.ts تعريفٌ ثانٍ يعرف المذكرة والقراءة فقط).
export const CORE_RITUALS = [
  { key: "core:journal", label: "مذكرة" },
  { key: "core:reading", label: "قراءة" },
  { key: "core:wird", label: "وِرد" },
] as const;

export interface DayRitualState {
  key: string;
  label: string;
  done: boolean;
}

export function dayRitualStates(d: {
  hasJournal: boolean;
  hasReading: boolean;
  quranActive: boolean;
  frozenHabits?: string[];
}): DayRitualState[] {
  const frozen = new Set(d.frozenHabits ?? []);
  const done: Record<string, boolean> = {
    "core:journal": d.hasJournal,
    "core:reading": d.hasReading,
    "core:wird": d.quranActive,
  };
  return CORE_RITUALS.filter((r) => !frozen.has(r.key)).map((r) => ({
    key: r.key,
    label: r.label,
    done: done[r.key],
  }));
}

// يومٌ مكتمل = أُتمّت كلّ الطقوس النشطة (وهناك طقسٌ نشطٌ أصلاً).
export function isDayComplete(states: DayRitualState[]): boolean {
  return states.length > 0 && states.every((r) => r.done);
}

// أسماء الطقوس المطلوبة اليوم — لعناوين صادقة («سلسلة يومية — مذكرة + قراءة»
// تتبدّل مع التجميد بدل أن تكذب).
export function activeRitualLabels(frozenHabits?: string[]): string[] {
  const frozen = new Set(frozenHabits ?? []);
  return CORE_RITUALS.filter((r) => !frozen.has(r.key)).map((r) => r.label);
}

// كل الأيام المكتملة (للسلسلة والتقويم والمعالم) — بنفس تعريف dayRitualStates
// بالحرف. نمرّ على الأيام التي فيها أيّ نشاطٍ فقط، فلا حاجة لمسح تقويمٍ كامل.
export function completedDayDates(src: {
  journalEntries: { date: string }[];
  readingLogs: { date: string }[];
  quranActivity: Iterable<string>;
  frozenHabits?: string[];
}): string[] {
  const jDates = new Set(src.journalEntries.map((e) => e.date));
  const rDates = new Set(src.readingLogs.map((l) => l.date));
  const qDates = new Set(src.quranActivity);
  const candidates = new Set<string>([...jDates, ...rDates, ...qDates]);
  return [...candidates]
    .filter((date) =>
      isDayComplete(
        dayRitualStates({
          hasJournal: jDates.has(date),
          hasReading: rDates.has(date),
          quranActive: qDates.has(date),
          frozenHabits: src.frozenHabits,
        })
      )
    )
    .sort();
}

export interface DaySummary {
  date: string;
  // كل مذكرات هذا اليوم — قد يكون فيها أكثر من مذكرة واحدة.
  journalEntries: JournalEntry[];
  transactions: Transaction[];
  expense: number;
  readingLogs: { log: ReadingLog; book?: Book }[];
  pagesRead: number;
  habitsCompleted: { name: string; icon: string }[];
  quranActive: boolean; // نشاطٌ قرآني في اليوم (وِرد/حفظ/مراجعة/تدبّر/ختمة)
  // الطقوس الأساسية المطلوبة اليوم بعد استثناء المجمّدة، وكم أُتمّ منها.
  activeRitualLabels: string[]; // أسماء الطقوس النشطة (لعرض شارة الاكتمال)
  activeRitualCount: number; // عددها (المخرج منها المجمّد)
  completionScore: number; // كم طقساً نشطاً أُتمّ اليوم (0..activeRitualCount)
  complete: boolean; // أُتمّت كلّ الطقوس النشطة (يومٌ مكتمل)
  prayerLog?: PrayerLog;
  prayersCount: number; // 0-5
  mosqueCount: number; // 0-5
}

export function aggregateDay(
  date: string,
  data: {
    transactions: Transaction[];
    journalEntries: JournalEntry[];
    readingLogs: ReadingLog[];
    books: Book[];
    habits: Habit[];
    prayerLogs: PrayerLog[];
    // نشاطٌ قرآني في هذا اليوم (يُشتَقّ عادةً من quranActivityDates). غيابه = لا نشاط.
    quranActive?: boolean;
    // مفاتيح الطقوس المجمّدة مؤقتاً (core:journal · core:reading · core:wird):
    // الطقس المجمّد لا يُطالَب به فلا يكسر «اليوم المكتمل» ولا يُحتسب ضمنه.
    frozenHabits?: string[];
  }
): DaySummary {
  const journalEntries = data.journalEntries.filter((e) => e.date === date);
  const transactions = data.transactions.filter((t) => t.date === date);
  // صرف اليوم = النقد الخارج فعلاً؛ الشراء المؤجّل يظهر في القائمة بصفر أثرٍ.
  const expense = transactions.reduce((s, t) => s + cashOut(t), 0);

  const dayLogs = data.readingLogs.filter((l) => l.date === date);
  const readingLogs = dayLogs.map((log) => ({
    log,
    book: data.books.find((b) => b.id === log.bookId),
  }));
  const pagesRead = dayLogs.reduce((s, l) => s + l.pagesRead, 0);

  const habitsCompleted = data.habits
    .filter((h) => h.logs.includes(date))
    .map((h) => ({ name: h.name, icon: h.icon }));

  const quranActive = !!data.quranActive;

  // «اليوم المكتمل» — من الدالة المركزية أعلاه، فلا يوجد تعريفٌ ثانٍ في التطبيق.
  const rituals = dayRitualStates({
    hasJournal: journalEntries.length > 0,
    hasReading: dayLogs.length > 0,
    quranActive,
    frozenHabits: data.frozenHabits,
  });

  const activeRitualLabels = rituals.map((r) => r.label);
  const activeRitualCount = rituals.length;
  const completionScore = rituals.filter((r) => r.done).length;
  const complete = isDayComplete(rituals);

  const prayerLog = data.prayerLogs.find((l) => l.date === date);
  const { prayed: prayersCount, mosque: mosqueCount } = countDayPrayers(prayerLog);

  return {
    date,
    journalEntries,
    transactions,
    expense,
    readingLogs,
    pagesRead,
    habitsCompleted,
    quranActive,
    activeRitualLabels,
    activeRitualCount,
    completionScore,
    complete,
    prayerLog,
    prayersCount,
    mosqueCount,
  };
}
