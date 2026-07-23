import type { Transaction, JournalEntry, ReadingLog, Book, Habit, PrayerLog } from "./types";
import { countDayPrayers } from "./utils";

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
  const expense = transactions.reduce((s, t) => s + t.amount, 0);

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

  // «اليوم المكتمل» يحترم الطقوس المجمّدة والقرآن: الطقوس الأساسية الثلاثة
  // (مذكرة · قراءة · وِرد قرآني)، ويُستثنى منها ما جُمّد فلا يُطالَب به. يومٌ
  // مكتمل = أُتمّت كلّ الطقوس النشطة (غير المجمّدة)، فلا القرآن مُهمَل ولا الطقس
  // المجمّد يكسر الاكتمال. (المالية والصلاة خارج هذا التعريف عمداً كما السلسلة.)
  const frozen = new Set(data.frozenHabits ?? []);
  const rituals = [
    { key: "core:journal", label: "مذكرة", done: journalEntries.length > 0 },
    { key: "core:reading", label: "قراءة", done: dayLogs.length > 0 },
    { key: "core:wird", label: "وِرد", done: quranActive },
  ].filter((r) => !frozen.has(r.key));

  const activeRitualLabels = rituals.map((r) => r.label);
  const activeRitualCount = rituals.length;
  const completionScore = rituals.filter((r) => r.done).length;
  const complete = activeRitualCount > 0 && completionScore === activeRitualCount;

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
