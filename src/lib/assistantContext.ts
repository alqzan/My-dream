import type { AppData } from "./types";
import {
  today,
  computeDailyBudgetStatus,
  getPrayerLog,
  countDayPrayers,
  dailyShare,
  quranActivityDates,
} from "./utils";

// ===================== خلاصة اليوم =====================
// ملخّصٌ موجز structured لليوم الحالي يجمع الصرف والصلوات والعادات والوِرد
// والمذكرة والقراءة والختمة — يقود بطاقة «خلاصة اليوم».
//
// ملاحظة: كان هنا سابقاً `buildAssistantContext` (نصٌّ حرّ طويل يضمّ مقتطفات
// مذكرات خام) بقيّةً من مساعدٍ قديم لم يعُد يُستدعى — أُزيل: محرّك التوصيات
// (بوصلة مدار، insights.ts) هو المصدر الوحيد للتوصيات الآن، ولا نستنتج حالةً
// من نصّ المذكرة الخام ولا نرسل شيئاً خارج الجهاز.
export interface DayDigest {
  spentToday: number; // إجمالي صرف اليوم (ر.س)
  budgetBalance: number | null; // رصيد الميزانية اليومية المتراكم (إن وُجدت)
  prayed: number; // صلوات اليوم المُصلّاة (٠..٥)
  mosque: number; // منها في المسجد/جماعة
  habitsDone: number;
  habitsTotal: number;
  wirdDone: boolean;
  journalWritten: boolean;
  readingDone: boolean;
  khatmaJuz: number; // تقدّم الختمة الحالية (٠..٣٠)
  // الطقوس المجمّدة تختفي من بطاقة «خلاصة اليوم» كما تختفي من قائمة اليوم في
  // الرئيسية — تجميدُ عادةٍ يُخرجها من التطبيق كلّه لا من قائمة العادات وحدها.
  wirdFrozen: boolean;
  journalFrozen: boolean;
  readingFrozen: boolean;
}

export function buildDayDigest(d: AppData): DayDigest {
  const todayStr = today();
  const spentToday = d.transactions
    .filter((t) => t.date === todayStr)
    .reduce((s, t) => s + dailyShare(t), 0);
  const budgetBalance = d.dailyBudget
    ? computeDailyBudgetStatus(d.dailyBudget, d.transactions).balance
    : null;
  const { prayed, mosque } = countDayPrayers(getPrayerLog(d.prayerLogs, todayStr));
  // العادات المجمّدة لا تُحتسب في عدّاد «العادات» (المخصّصة تُطابَق بمعرّفها،
  // والطقوس الأساسية بمفتاح «core:*»).
  const frozen = new Set(d.frozenHabits ?? []);
  const activeHabits = d.habits.filter((h) => !frozen.has(h.id));
  const habitsDone = activeHabits.filter((h) => h.logs.includes(todayStr)).length;
  return {
    spentToday,
    budgetBalance,
    prayed,
    mosque,
    habitsDone,
    habitsTotal: activeHabits.length,
    wirdDone: quranActivityDates(d).has(todayStr),
    journalWritten: d.journalEntries.some((e) => e.date === todayStr),
    readingDone: d.readingLogs.some((l) => l.date === todayStr),
    khatmaJuz: (d.quranKhatma ?? { juz: 0 }).juz,
    wirdFrozen: frozen.has("core:wird"),
    journalFrozen: frozen.has("core:journal"),
    readingFrozen: frozen.has("core:reading"),
  };
}
