// محرك التوصيات الذكية — يقرأ بياناتك محلياً ويولّد ملاحظات واقتراحات
// مخصصة عبر مجموعة قواعد تحليلية (بدون إرسال أي بيانات خارج جهازك).
import type {
  Transaction, JournalEntry, ReadingLog, Book, Habit, Budget,
  FinanceCategoryDef, ReserveFund, PrayerLog, DailyBudget, FutureLetter,
} from "./types";
import { PRAYERS } from "./types";
import {
  getJournalStreak, getPrayerStreak, getMosqueStreak, prayerConsistency,
  computeDailyBudgetStatus, budgetLimit, getMainCategory, reserveBalance,
  formatAmount, today, toDateStr, parseDate,
} from "./utils";

export interface Insight {
  icon: string;
  text: string;
  tone: "positive" | "warning" | "tip";
  priority: number; // أعلى = أهم
}

interface InsightData {
  transactions: Transaction[];
  journalEntries: JournalEntry[];
  readingLogs: ReadingLog[];
  books: Book[];
  habits: Habit[];
  budgets: Budget[];
  categories: FinanceCategoryDef[];
  reserves: ReserveFund[];
  prayerLogs: PrayerLog[];
  dailyBudget: DailyBudget | null;
  monthlyIncome: number | null;
  futureLetters: FutureLetter[];
}

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

export function generateInsights(data: InsightData): Insight[] {
  const out: Insight[] = [];
  const todayStr = today();
  const monthPrefix = todayStr.slice(0, 7);
  const {
    transactions, journalEntries, readingLogs, books, habits,
    budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters,
  } = data;

  /* ---------- رسائل المستقبل ---------- */

  const dueLetter = futureLetters.find((l) => !l.opened && l.deliveryDate <= todayStr);
  if (dueLetter) {
    out.push({
      icon: "💌", tone: "positive", priority: 99,
      text: "وصلتك رسالة من نفسك القديمة — افتحها في صفحة المذكرات!",
    });
  } else {
    const next = futureLetters
      .filter((l) => !l.opened && l.deliveryDate > todayStr)
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
    if (next) {
      const left = Math.round(
        (parseDate(next.deliveryDate).getTime() - parseDate(todayStr).getTime()) / 86400000
      );
      if (left <= 7) {
        out.push({
          icon: "✉️", tone: "tip", priority: 66,
          text: `رسالتك لنفسك تُفتح بعد ${left === 1 ? "يوم واحد" : `${left} أيام`} — الترقب جميل!`,
        });
      }
    }
  }

  /* ---------- الصلوات ---------- */

  const pStreak = getPrayerStreak(prayerLogs);
  if (pStreak >= 7) {
    out.push({
      icon: "🕌", tone: "positive", priority: 80,
      text: `${pStreak} يوم متواصل بالصلوات الخمس كاملة — ثبات يُغبط عليه، تقبل الله.`,
    });
  }
  const mStreak = getMosqueStreak(prayerLogs);
  if (mStreak >= 3) {
    out.push({
      icon: "🌟", tone: "positive", priority: 78,
      text: `${mStreak} أيام متواصلة كل الصلوات بالمسجد — درجة لا يبلغها إلا قليل!`,
    });
  }
  if (prayerLogs.length >= 7) {
    const consistency = prayerConsistency(prayerLogs);
    const weakest = PRAYERS.reduce((min, p) => (consistency[p] < consistency[min] ? p : min), PRAYERS[0]);
    if (consistency[weakest] < 0.6) {
      out.push({
        icon: "⏰", tone: "tip", priority: 63,
        text: `صلاة ${weakest} هي الأقل انتظاماً عندك (${Math.round(consistency[weakest] * 100)}%) — اجعل لها منبهاً خاصاً.`,
      });
    }
  }

  /* ---------- المال ---------- */

  if (dailyBudget) {
    const status = computeDailyBudgetStatus(dailyBudget, transactions);
    if (status.balance < 0) {
      out.push({
        icon: "🚨", tone: "warning", priority: 90,
        text: `رصيدك اليومي بالسالب ${formatAmount(-status.balance)} ر.س — خفف الصرف أياماً حتى يتعافى.`,
      });
    } else if (status.balance >= dailyBudget.amount * 3) {
      out.push({
        icon: "🌟", tone: "positive", priority: 70,
        text: `فائضك المتراكم ${formatAmount(status.balance)} ر.س — انضباط ممتاز! حوّله للاحتياطي أو اتركه للفوائض عند الراتب.`,
      });
    }
  }

  const totalReserves = reserves.reduce((s, f) => s + reserveBalance(f, transactions), 0);
  if (totalReserves >= 1000) {
    out.push({
      icon: "🏦", tone: "positive", priority: 60,
      text: `مجموع احتياطياتك ${formatAmount(totalReserves)} ر.س — أمان مالي يتراكم بهدوء.`,
    });
  }
  const drained = reserves.find((f) => reserveBalance(f, transactions) < 0);
  if (drained) {
    out.push({
      icon: "🪫", tone: "warning", priority: 73,
      text: `احتياطي «${drained.name}» مسحوب أكثر من رصيده — عبّئه أو راجع مصاريفه.`,
    });
  }

  // ميزانيات الفئات
  for (const b of budgets) {
    const cap = budgetLimit(b, monthlyIncome);
    if (!cap) continue;
    const spent = transactions
      .filter((t) => getMainCategory(categories, t.category).id === b.category && t.date.startsWith(monthPrefix))
      .reduce((s, t) => s + t.amount, 0);
    const pct = (spent / cap) * 100;
    const info = categories.find((c) => c.id === b.category);
    const label = info?.label ?? "قسم";
    if (spent > cap) {
      out.push({
        icon: "📛", tone: "warning", priority: 85,
        text: `تجاوزت سقف «${label}» بـ ${formatAmount(spent - cap)} ر.س هذا الشهر.`,
      });
    } else if (pct >= 80) {
      out.push({
        icon: "⚠️", tone: "warning", priority: 75,
        text: `وصلت ${Math.round(pct)}% من سقف «${label}» — باقي ${formatAmount(cap - spent)} ر.س فقط.`,
      });
    }
  }

  // مقارنة أعلى قسم صرف بالشهر الماضي
  const lastMonthDate = new Date();
  lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
  const lastPrefix = toDateStr(lastMonthDate).slice(0, 7);
  const catTotals = (prefix: string) => {
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.date.startsWith(prefix)) {
        const main = getMainCategory(categories, t.category).id || "غير مصنف";
        totals[main] = (totals[main] || 0) + t.amount;
      }
    }
    return totals;
  };
  const thisTotals = catTotals(monthPrefix);
  const prevTotals = catTotals(lastPrefix);
  for (const [cat, amount] of Object.entries(thisTotals)) {
    const prev = prevTotals[cat];
    if (prev && prev >= 100 && amount > prev * 1.4) {
      const info = categories.find((c) => c.id === cat);
      out.push({
        icon: "📈", tone: "warning", priority: 65,
        text: `صرفك على «${info?.label ?? "قسم"}» ارتفع ${Math.round(((amount - prev) / prev) * 100)}% عن الشهر الماضي (${formatAmount(amount)} مقابل ${formatAmount(prev)}).`,
      });
      break; // تكفي أعلى ملاحظة واحدة من هذا النوع
    }
  }

  // أيام بلا صرف هذا الأسبوع
  const weekDates = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));
  const spendDays = new Set(
    transactions.filter((t) => weekDates.includes(t.date)).map((t) => t.date)
  );
  const noSpend = 7 - spendDays.size;
  if (noSpend >= 3 && transactions.length > 10) {
    out.push({
      icon: "🛡️", tone: "positive", priority: 45,
      text: `${noSpend} أيام بلا أي مصروف هذا الأسبوع — قوة إرادة تُحسد عليها.`,
    });
  }

  // المزاج مقابل الصرف (من المذكرات القديمة التي فيها حالة مزاجية)
  const moodDays = journalEntries.filter((e) => e.mood);
  if (moodDays.length >= 6) {
    const avgFor = (moods: string[]) => {
      const days = moodDays.filter((e) => moods.includes(e.mood!));
      if (!days.length) return 0;
      const total = days.reduce((s, e) =>
        s + transactions.filter((t) => t.date === e.date).reduce((x, t) => x + t.amount, 0), 0);
      return total / days.length;
    };
    const bad = avgFor(["سيء", "سيء_جداً"]);
    const good = avgFor(["جيد", "ممتاز"]);
    if (bad > 0 && good > 0 && bad > good * 1.3) {
      out.push({
        icon: "🧠", tone: "tip", priority: 50,
        text: `لاحظنا أنك تصرف ${Math.round(((bad - good) / good) * 100)}% أكثر في أيامك الصعبة — انتبه للشراء العاطفي.`,
      });
    }
  }

  /* ---------- المذكرات ---------- */

  const jStreak = getJournalStreak(journalEntries);
  if (jStreak >= 7) {
    out.push({
      icon: "🔥", tone: "positive", priority: 72,
      text: `${jStreak} يوم كتابة متواصلة — عادات الكبار تُبنى هكذا!`,
    });
  } else if (jStreak === 0 && journalEntries.length > 0) {
    const latest = [...journalEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
    const gap = Math.floor((parseDate(todayStr).getTime() - parseDate(latest.date).getTime()) / 86400000);
    if (gap >= 2) {
      out.push({
        icon: "📓", tone: "tip", priority: 68,
        text: `مرت ${gap} أيام منذ آخر مذكرة — سطران الليلة يكفيان لإحياء العادة.`,
      });
    }
  }

  // أفضل يوم كتابة
  if (journalEntries.length >= 10) {
    const byDay: Record<number, number> = {};
    for (const e of journalEntries) {
      const d = parseDate(e.date).getDay();
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 3) {
      out.push({
        icon: "🗓️", tone: "tip", priority: 30,
        text: `أكثر يوم تكتب فيه هو ${WEEKDAYS[parseInt(best[0])]} — اجعله موعدك الثابت مع نفسك.`,
      });
    }
  }

  // في مثل هذا اليوم
  const mmdd = todayStr.slice(5);
  const memory = journalEntries.find((e) => e.date.slice(5) === mmdd && e.date < todayStr);
  if (memory) {
    out.push({
      icon: "🕰️", tone: "tip", priority: 58,
      text: `عندك مذكرة كتبتها في مثل هذا اليوم عام ${memory.date.slice(0, 4)} — ارجع لها في صفحة المذكرات.`,
    });
  }

  /* ---------- القراءة ---------- */

  const currentBook = books.find((b) => b.status === "أقرأ");
  if (currentBook) {
    const logs = readingLogs.filter((l) => l.bookId === currentBook.id);
    const recent = logs.filter((l) => l.date >= daysAgo(13));
    const pagesLeft = currentBook.totalPages - currentBook.currentPage;
    if (recent.length >= 2 && pagesLeft > 0) {
      const recentPages = recent.reduce((s, l) => s + l.pagesRead, 0);
      const perDay = recentPages / 14;
      if (perDay > 0) {
        const eta = Math.ceil(pagesLeft / perDay);
        out.push({
          icon: "📚", tone: "positive", priority: 52,
          text: `بوتيرتك الحالية ستنهي «${currentBook.title}» خلال ${eta} يوم تقريباً (باقي ${pagesLeft} صفحة).`,
        });
      }
    }
    const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLog) {
      const gap = Math.floor((parseDate(todayStr).getTime() - parseDate(lastLog.date).getTime()) / 86400000);
      if (gap >= 3) {
        out.push({
          icon: "🔖", tone: "tip", priority: 62,
          text: `«${currentBook.title}» ينتظرك منذ ${gap} أيام — ١٠ صفحات الليلة ترجّع الزخم.`,
        });
      }
    }
  } else if (books.length > 0) {
    out.push({
      icon: "📖", tone: "tip", priority: 40,
      text: "لا يوجد كتاب قيد القراءة حالياً — اختر التالي من قائمتك وابدأ الليلة.",
    });
  }

  // صفحات هذا الأسبوع مقابل الماضي
  const thisWeekPages = readingLogs.filter((l) => l.date >= daysAgo(6)).reduce((s, l) => s + l.pagesRead, 0);
  const lastWeekPages = readingLogs
    .filter((l) => l.date >= daysAgo(13) && l.date < daysAgo(6))
    .reduce((s, l) => s + l.pagesRead, 0);
  if (thisWeekPages > 0 && lastWeekPages > 0 && thisWeekPages > lastWeekPages * 1.25) {
    out.push({
      icon: "🚀", tone: "positive", priority: 48,
      text: `قرأت ${thisWeekPages} صفحة هذا الأسبوع مقابل ${lastWeekPages} الماضي — تسارع جميل!`,
    });
  }

  /* ---------- العادات ---------- */

  for (const h of habits) {
    const weekCount = h.logs.filter((d) => weekDates.includes(d)).length;
    if (weekCount >= 5) {
      out.push({
        icon: h.icon || "✅", tone: "positive", priority: 42,
        text: `«${h.name}» ${weekCount} مرات هذا الأسبوع — ثبات يستحق الإشادة.`,
      });
      break;
    }
  }

  out.sort((a, b) => b.priority - a.priority);
  return out;
}
