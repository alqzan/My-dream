import type { AppData } from "./types";
import {
  today,
  parseDate,
  toDateStr,
  formatAmount,
  calcStreak,
  longestStreak,
  getMainCategory,
  computeDailyBudgetStatus,
  getPrayerLog,
  countDayPrayers,
  getPrayerStreak,
  getMosqueStreak,
  prayerConsistency,
  getReadingStreak,
  reserveBalance,
  dailyShare,
} from "./utils";
import { PRAYERS } from "./types";

// ===================== خلاصة اليوم =====================
// ملخّصٌ موجز لليوم الحالي يجمع الصرف والصلوات والعادات والوِرد والمذكرة
// والقراءة والختمة — يُشتقّ من نفس منطق grounding أعلاه لكنه مبنيّ (structured)
// ليقود بطاقة «خلاصة اليوم» بدل نصّ حرّ. أُعيد استخدام الملف بعد إزالة المساعد.
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
  const habitsDone = d.habits.filter((h) => h.logs.includes(todayStr)).length;
  return {
    spentToday,
    budgetBalance,
    prayed,
    mosque,
    habitsDone,
    habitsTotal: d.habits.length,
    wirdDone: (d.quranWird ?? []).includes(todayStr),
    journalWritten: d.journalEntries.some((e) => e.date === todayStr),
    readingDone: d.readingLogs.some((l) => l.date === todayStr),
    khatmaJuz: (d.quranKhatma ?? { juz: 0 }).juz,
  };
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const d = parseDate(today());
  for (let i = 0; i < n; i++) {
    out.push(toDateStr(d));
    d.setDate(d.getDate() - 1);
  }
  return out;
}

function prevMonthPrefix(monthPrefix: string): string {
  const [y, m] = monthPrefix.split("-").map(Number);
  const d = new Date(y, m - 2, 1); // m is 1-based; m-2 → previous month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Build a rich but bounded Arabic summary of the user's data to ground the
// assistant. Includes history and aggregates (per-prayer consistency, last-7
// days, month-over-month spend, habit streaks) — not just today — so questions
// like "كيف صلواتي بشكل عام" have something real to answer from.
export function buildAssistantContext(d: AppData): string {
  const todayStr = today();
  const monthPrefix = todayStr.slice(0, 7);
  const prevPrefix = prevMonthPrefix(monthPrefix);
  const week = lastNDates(7);
  const L: string[] = [];

  L.push(`التاريخ اليوم: ${todayStr} (الشهر ${monthPrefix}).`);

  // ---------- Finance ----------
  const monthTx = d.transactions.filter((t) => t.date.startsWith(monthPrefix));
  const prevTx = d.transactions.filter((t) => t.date.startsWith(prevPrefix));
  const monthTotal = monthTx.reduce((s, t) => s + t.amount, 0);
  const prevTotal = prevTx.reduce((s, t) => s + t.amount, 0);
  L.push("");
  L.push("== المصاريف ==");
  L.push(
    `صرف هذا الشهر: ${formatAmount(monthTotal)} ر.س (${monthTx.length} معاملة). الشهر الماضي: ${formatAmount(prevTotal)} ر.س.`
  );
  if (d.monthlyIncome) L.push(`الدخل الشهري: ${formatAmount(d.monthlyIncome)} ر.س.`);

  const byCat = new Map<string, number>();
  for (const t of monthTx) {
    const label = getMainCategory(d.categories, t.category).label;
    byCat.set(label, (byCat.get(label) ?? 0) + t.amount);
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  if (catRows.length) L.push("حسب القسم: " + catRows.map(([l, v]) => `${l} ${formatAmount(v)}`).join("، "));

  if (d.dailyBudget) {
    const st = computeDailyBudgetStatus(d.dailyBudget, d.transactions);
    L.push(
      `الميزانية اليومية ${formatAmount(d.dailyBudget.amount)} ر.س/يوم — الرصيد المتراكم ${formatAmount(st.balance)} ر.س ${st.balance < 0 ? "(تجاوز)" : "(فائض)"}.`
    );
  }
  if (d.reserves.length) {
    L.push(
      "الاحتياطي: " +
        d.reserves.map((f) => `${f.name} ${formatAmount(reserveBalance(f, d.transactions))} ر.س`).join("، ")
    );
  }

  const recentTx = [...d.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12);
  if (recentTx.length) {
    L.push("آخر المعاملات:");
    for (const t of recentTx) {
      const label = getMainCategory(d.categories, t.category).label;
      L.push(`- ${t.date}: ${formatAmount(t.amount)} · ${label}${t.note ? ` · ${t.note}` : ""}`);
    }
  }

  // ---------- Prayers ----------
  L.push("");
  L.push("== الصلاة ==");
  const todayLog = getPrayerLog(d.prayerLogs, todayStr);
  const tCount = countDayPrayers(todayLog);
  L.push(`اليوم: ${tCount.prayed}/5 صُلّيت (${tCount.mosque} بالمسجد).`);
  L.push(
    `سلسلة إتمام الصلوات: ${getPrayerStreak(d.prayerLogs)} يوم · سلسلة المسجد: ${getMosqueStreak(d.prayerLogs)} يوم · أيام مسجّلة: ${d.prayerLogs.length}.`
  );
  const cons = prayerConsistency(d.prayerLogs);
  L.push("نسبة كل صلاة: " + PRAYERS.map((p) => `${p} ${Math.round(cons[p] * 100)}%`).join("، "));
  const week7 = week.map((day) => {
    const c = countDayPrayers(getPrayerLog(d.prayerLogs, day));
    return `${day.slice(5)}=${c.prayed}/5`;
  });
  L.push("آخر ٧ أيام (صلوات/يوم): " + week7.join("، "));

  // ---------- Habits ----------
  if (d.habits.length) {
    L.push("");
    L.push("== العادات ==");
    for (const h of d.habits) {
      const streak = calcStreak(h.logs);
      const best = longestStreak(h.logs);
      const week7Count = week.filter((day) => h.logs.includes(day)).length;
      L.push(
        `- ${h.name}: ${h.logs.includes(todayStr) ? "أُنجزت اليوم" : "لم تُنجز اليوم"} · سلسلة ${streak} (أطول ${best}) · ${week7Count}/7 هذا الأسبوع.`
      );
    }
  }

  // ---------- Reading ----------
  L.push("");
  L.push("== القراءة ==");
  const current = d.books.find((b) => b.status === "أقرأ");
  if (current) L.push(`الكتاب الحالي: «${current.title}» (${current.currentPage}/${current.totalPages}).`);
  const finished = d.books.filter((b) => b.status === "أنهيت").length;
  const monthPages = d.readingLogs.filter((l) => l.date.startsWith(monthPrefix)).reduce((s, l) => s + l.pagesRead, 0);
  L.push(
    `الكتب: ${d.books.length} (أنهيت ${finished}) · صفحات هذا الشهر: ${monthPages} · سلسلة القراءة: ${getReadingStreak(d.readingLogs)} يوم.`
  );

  // ---------- Journal ----------
  L.push("");
  L.push("== المذكرات ==");
  L.push(
    `عدد المذكرات: ${d.journalEntries.length} · سلسلة الكتابة: ${calcStreak(d.journalEntries.map((e) => e.date))} يوم.`
  );
  const recentEntries = [...d.journalEntries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  for (const e of recentEntries) {
    const snippet = (e.content || "").replace(/\s+/g, " ").trim().slice(0, 200);
    L.push(`- ${e.date}${e.title ? ` «${e.title}»` : ""}: ${snippet}${snippet.length >= 200 ? "…" : ""}`);
  }

  return L.join("\n");
}
