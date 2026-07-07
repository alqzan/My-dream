import type { AppData } from "./types";
import {
  today,
  formatAmount,
  calcStreak,
  getMainCategory,
  computeDailyBudgetStatus,
  getPrayerLog,
  countDayPrayers,
  getPrayerStreak,
  getReadingStreak,
} from "./utils";
import { PRAYERS } from "./types";

// Build a compact, human-readable Arabic summary of the user's data to send as
// grounding context to the assistant. Deliberately bounded (recent items only,
// truncated journal snippets) so requests stay small and cheap — the model
// answers about spending, journaling, habits, prayers and reading from this.
export function buildAssistantContext(d: AppData): string {
  const todayStr = today();
  const monthPrefix = todayStr.slice(0, 7);
  const lines: string[] = [];

  lines.push(`التاريخ اليوم: ${todayStr}`);

  // ---------- Finance ----------
  const monthTx = d.transactions.filter((t) => t.date.startsWith(monthPrefix));
  const monthTotal = monthTx.reduce((s, t) => s + t.amount, 0);
  lines.push("");
  lines.push("== المصاريف ==");
  lines.push(`إجمالي صرف هذا الشهر: ${formatAmount(monthTotal)} ر.س (${monthTx.length} معاملة).`);

  const byCat = new Map<string, number>();
  for (const t of monthTx) {
    const label = getMainCategory(d.categories, t.category).label;
    byCat.set(label, (byCat.get(label) ?? 0) + t.amount);
  }
  const catRows = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  if (catRows.length) {
    lines.push("حسب القسم: " + catRows.map(([l, v]) => `${l} ${formatAmount(v)}`).join("، "));
  }

  if (d.dailyBudget) {
    const st = computeDailyBudgetStatus(d.dailyBudget, d.transactions);
    lines.push(
      `الميزانية اليومية: ${formatAmount(d.dailyBudget.amount)} ر.س/يوم — الرصيد المتراكم ${formatAmount(st.balance)} ر.س ${st.balance < 0 ? "(تجاوز)" : "(فائض)"}.`
    );
  }
  if (d.monthlyIncome) lines.push(`الدخل الشهري المُسجّل: ${formatAmount(d.monthlyIncome)} ر.س.`);

  const recentTx = [...d.transactions].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);
  if (recentTx.length) {
    lines.push("آخر المعاملات:");
    for (const t of recentTx) {
      const label = getMainCategory(d.categories, t.category).label;
      lines.push(`- ${t.date}: ${formatAmount(t.amount)} ر.س · ${label}${t.note ? ` · ${t.note}` : ""}`);
    }
  }

  // ---------- Habits ----------
  if (d.habits.length) {
    lines.push("");
    lines.push("== العادات ==");
    for (const h of d.habits) {
      const streak = calcStreak(h.logs);
      const doneToday = h.logs.includes(todayStr);
      lines.push(`- ${h.name}: ${doneToday ? "أُنجزت اليوم" : "لم تُنجز اليوم"} · سلسلة ${streak} يوم.`);
    }
  }

  // ---------- Prayers ----------
  lines.push("");
  lines.push("== الصلاة ==");
  const todayLog = getPrayerLog(d.prayerLogs, todayStr);
  const { prayed, mosque } = countDayPrayers(todayLog);
  lines.push(`اليوم: ${prayed}/5 صُلّيت (${mosque} بالمسجد).`);
  lines.push(`سلسلة إتمام الصلوات: ${getPrayerStreak(d.prayerLogs)} يوم.`);
  if (todayLog) {
    lines.push(
      "تفصيل اليوم: " + PRAYERS.map((p) => `${p} ${todayLog.prayers[p] ?? "لم"}`).join("، ")
    );
  }

  // ---------- Reading ----------
  lines.push("");
  lines.push("== القراءة ==");
  const current = d.books.find((b) => b.status === "أقرأ");
  if (current) {
    lines.push(`الكتاب الحالي: «${current.title}» (${current.currentPage}/${current.totalPages} صفحة).`);
  }
  const monthPages = d.readingLogs
    .filter((l) => l.date.startsWith(monthPrefix))
    .reduce((s, l) => s + l.pagesRead, 0);
  lines.push(`صفحات هذا الشهر: ${monthPages} · سلسلة القراءة: ${getReadingStreak(d.readingLogs)} يوم.`);

  // ---------- Journal ----------
  lines.push("");
  lines.push("== المذكرات ==");
  const journalStreak = calcStreak(d.journalEntries.map((e) => e.date));
  lines.push(`عدد المذكرات: ${d.journalEntries.length} · سلسلة الكتابة: ${journalStreak} يوم.`);
  const recentEntries = [...d.journalEntries].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  for (const e of recentEntries) {
    const snippet = (e.content || "").replace(/\s+/g, " ").trim().slice(0, 180);
    lines.push(`- ${e.date}${e.title ? ` «${e.title}»` : ""}: ${snippet}${snippet.length >= 180 ? "…" : ""}`);
  }

  return lines.join("\n");
}
