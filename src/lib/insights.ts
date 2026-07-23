// بوصلة مدار — محرّك توصيات محليّ وخصوصيّ: يقرأ بياناتك على جهازك ويولّد
// «خطوةً الآن» وملاحظاتٍ مخصّصة عبر قواعد تحليلية صريحة. لا ذكاء اصطناعي ولا
// إرسال لأي بيانات خارج الجهاز. كل توصية كائنٌ منظّم (لا نصّ خام) بمعرّفٍ ثابت
// (dedupeKey) ووجهةِ إجراءٍ (href/actionLabel)، فلا حاجة لـ text.includes.
import type {
  Transaction, JournalEntry, ReadingLog, Book, Habit, Budget,
  FinanceCategoryDef, ReserveFund, PrayerLog, DailyBudget, FutureLetter,
  HifzState, KhatmaState,
} from "./types";
import { PRAYERS } from "./types";
import {
  getJournalStreak, getPrayerStreak, getMosqueStreak, prayerConsistency,
  computeDailyBudgetStatus, budgetLimit, getMainCategory, reserveBalance,
  formatAmount, today, toDateStr, parseDate,
} from "./utils";
import { idToSurahAyah, SURAHS, describeRange } from "./quran/meta";
import {
  plannedPortion, openMistakes, testDue, mistakeRecallSuccesses, MISTAKE_MASTERY_SUGGEST,
} from "./quran/hifz";
import { todaySession } from "./quran/schedule";

export type InsightDomain = "quran" | "finance" | "prayer" | "journal" | "reading" | "habits" | "data";
export type InsightTone = "positive" | "warning" | "tip" | "action";
export type SnoozeOption = "today" | "tomorrow" | "week";

// كائن التوصية المنظّم. `id` = `dedupeKey` (ثابت للتوصية المنطقية نفسها عبر
// الرسمات، ومفتاح تخزين التأجيل/الإخفاء محلياً). `validUntil` تُخفي التوصية
// بعد يومها (للمدح اليومي فلا يتكرّر). `href`/`actionLabel` تجعل لكلّ توصية
// إجراءً واضحاً بدل الكشف عن نوعها من النصّ.
export interface Insight {
  id: string;
  domain: InsightDomain;
  icon: string;
  title: string;
  body: string;
  tone: InsightTone;
  priority: number; // أعلى = أهم
  dedupeKey: string;
  href?: string;
  actionLabel?: string;
  validUntil?: string; // YYYY-MM-DD
  reason?: string;
  dismissible: boolean;
  snoozeOptions?: SnoozeOption[];
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
  quranHifz?: HifzState | null;
  quranKhatma?: KhatmaState | null;
  lastBackup?: string | null; // YYYY-MM-DD لآخر تصدير نسخة احتياطية
}

const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DEFAULT_SNOOZE: SnoozeOption[] = ["today", "tomorrow", "week"];

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateStr(d);
}

// الشهر السابق لمفتاح شهرٍ «YYYY-MM» باشتقاقٍ صريح من السنة/الشهر، لا بـ
// Date.setMonth الذي يفيض في أيام 29–31 («31 مارس ناقص شهر» = «3 مارس» فيعيد
// نفس الشهر). نقيّ ومختبَر، يعبر حدّ السنة (يناير → ديسمبر السابق) بأمان.
export function prevMonthPrefix(monthPrefix: string): string {
  const [y, m] = monthPrefix.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

// إدخالٌ جزئيّ يُكمَّل بقيمٍ افتراضية (قابل للتأجيل والإخفاء، id = dedupeKey).
type InsightInput = Omit<Insight, "id" | "dismissible" | "snoozeOptions"> &
  Partial<Pick<Insight, "dismissible" | "snoozeOptions">>;

export function generateInsights(data: InsightData): Insight[] {
  const out: Insight[] = [];
  const add = (i: InsightInput) => {
    out.push({ dismissible: true, snoozeOptions: DEFAULT_SNOOZE, ...i, id: i.dedupeKey });
  };
  const todayStr = today();
  const monthPrefix = todayStr.slice(0, 7);
  const {
    transactions, journalEntries, readingLogs, books, habits,
    budgets, categories, reserves, prayerLogs, dailyBudget, monthlyIncome, futureLetters,
    quranHifz, quranKhatma, lastBackup,
  } = data;

  /* ---------- القرآن (يقود «خطوتك الآن» حين يكون هناك محفوظ) ---------- */

  const h = quranHifz;
  if (h?.plan) {
    const sess = todaySession(h, todayStr);
    const dueTotal = sess.due.total;
    const oldest = sess.due.pages[0];
    const wirdToday = h.sessions.some((s) => s.date === todayStr);

    if (dueTotal > 0) {
      const od = oldest?.overdueDays ?? 0;
      add({
        domain: "quran", dedupeKey: "quran:due-review", icon: "🔁", title: "مراجعتك القرآنية",
        body: od >= 2
          ? `لديك ${dueTotal} وجهاً مستحقاً للمراجعة، أقدمها متأخّر ${od} يوم — ابدأ جلسة اليوم (~${sess.estMinutes} دقيقة).`
          : `لديك ${dueTotal} وجهاً مستحقاً للمراجعة — ابدأ جلسة اليوم (~${sess.estMinutes} دقيقة).`,
        tone: "action", priority: 88 + Math.min(od, 6), href: "/quran", actionLabel: "ابدأ جلسة اليوم",
      });
    }

    const planned = plannedPortion(h);
    if (planned && !wirdToday) {
      add({
        domain: "quran", dedupeKey: "quran:wird", icon: "🌱", title: "ورد اليوم",
        body: `ورد حفظك اليوم بانتظارك: ${describeRange(planned.fromId, planned.toId)}.`,
        tone: "action", priority: 84, href: "/quran", actionLabel: "احفظ الآن",
      });
    }

    const openMk = openMistakes(h);
    const worst = openMk[0]; // الأكثر تكراراً أوّلاً
    if (worst && worst.hits.length >= 3) {
      const { surah, ayah } = idToSurahAyah(worst.ayahId);
      add({
        domain: "quran", dedupeKey: `quran:mistake:${worst.id}`, icon: "🎯", title: "موطن خطأ متكرّر",
        body: `أخطأت في الموضع نفسه ${worst.hits.length} مرات (${SURAHS[surah - 1]?.name ?? ""} ${ayah}) — راجعه الآن مع آيته السابقة واللاحقة.`,
        tone: "warning", priority: 82, href: "/quran", actionLabel: "راجِع الموضع",
      });
    }

    const closable = openMk.find((m) => mistakeRecallSuccesses(h, m) >= MISTAKE_MASTERY_SUGGEST);
    if (closable) {
      add({
        domain: "quran", dedupeKey: "quran:mistake-close", icon: "✅", title: "خطأ جاهز للإغلاق",
        body: "سمّعت موضع خطأ بنجاح عدة مرات بعد آخر خطأ — أغلِقه من لوحة أخطائي.",
        tone: "tip", priority: 46, href: "/quran", actionLabel: "افتح أخطائي",
      });
    }

    if (dueTotal === 0 && testDue(h, todayStr)) {
      add({
        domain: "quran", dedupeKey: "quran:test", icon: "🎲", title: "اختبار دوري",
        body: "حان وقت اختبارك العشوائي — وجهٌ من كل ما حفظت يثبّت الحفظ.",
        tone: "tip", priority: 44, href: "/quran", actionLabel: "اختبرني",
      });
    }

    // خطوة تالية ذكية: اكتمل القرآن اليوم → اقترح قراءة كتابك (مدحٌ ليوميّه فقط).
    if (dueTotal === 0 && wirdToday) {
      const cur = books.find((b) => b.status === "أقرأ");
      if (cur) {
        add({
          domain: "quran", dedupeKey: "quran:done-next-read", icon: "🌟", title: "أتممت قرآن اليوم",
          body: `مراجعتك القرآنية مكتملة اليوم، تقبّل الله — الخطوة الأنسب الآن صفحاتٌ من «${cur.title}».`,
          tone: "positive", priority: 50, href: "/reading", actionLabel: "اقرأ الآن", validUntil: todayStr,
        });
      }
    }
  }

  // الختمة: متوقّفة منذ أيام (ولها بداية).
  if (quranKhatma && (quranKhatma.juz > 0 || quranKhatma.startDate) && quranKhatma.lastReadDate) {
    const gap = Math.floor((parseDate(todayStr).getTime() - parseDate(quranKhatma.lastReadDate).getTime()) / 86400000);
    if (gap >= 3 && quranKhatma.juz < 30) {
      add({
        domain: "reading", dedupeKey: "quran:khatma-stall", icon: "📿", title: "ختمتك بانتظارك",
        body: `مرّت ${gap} أيام على آخر تقدّمٍ في ختمتك (${quranKhatma.juz}/30 جزء) — صفحاتٌ اليوم تُعيد الزخم.`,
        tone: "tip", priority: 41, href: "/quran", actionLabel: "سجّل تقدّمك",
      });
    }
  }

  /* ---------- حماية البيانات وتذكير المساء ---------- */

  const hour = new Date().getHours();
  const hasTodayJournal = journalEntries.some((e) => e.date === todayStr);
  if (hour >= 20 && !hasTodayJournal) {
    add({
      domain: "journal", dedupeKey: "journal:evening", icon: "🌙", tone: "action", priority: 95,
      title: "مذكرة الليلة", body: "ما كتبت مذكرة اليوم بعد — سطران قبل النوم يحفظان يومك ويحيان سلسلتك.",
      href: "/journal", actionLabel: "اكتب الآن", validUntil: todayStr,
    });
  }

  const dataSize = journalEntries.length + transactions.length + prayerLogs.length;
  if (dataSize >= 15) {
    const backupAge = lastBackup
      ? Math.floor((parseDate(todayStr).getTime() - parseDate(lastBackup).getTime()) / 86400000)
      : null;
    if (backupAge === null || backupAge >= 14) {
      add({
        domain: "data", dedupeKey: "data:backup", icon: "🛡️", tone: "warning", priority: 76,
        title: "نسخة احتياطية", href: "/settings", actionLabel: "صدّر نسخة",
        body: backupAge === null
          ? "ما صدّرت نسخة احتياطية من بياناتك أبداً — سوّها الآن من صفحة الإعدادات، دقيقة وحدة تحمي سنواتك."
          : `آخر نسخة احتياطية قبل ${backupAge} يوم — صدّر نسخة جديدة من صفحة الإعدادات.`,
      });
    }
  }

  /* ---------- رسائل المستقبل ---------- */

  const dueLetter = futureLetters.find((l) => !l.opened && l.deliveryDate <= todayStr);
  if (dueLetter) {
    add({
      domain: "journal", dedupeKey: "journal:letter-due", icon: "💌", tone: "action", priority: 99,
      title: "رسالة من نفسك", body: "وصلتك رسالة من نفسك القديمة — افتحها في صفحة المذكرات!",
      href: "/journal", actionLabel: "افتح الرسالة",
    });
  } else {
    const next = futureLetters
      .filter((l) => !l.opened && l.deliveryDate > todayStr)
      .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
    if (next) {
      const left = Math.round((parseDate(next.deliveryDate).getTime() - parseDate(todayStr).getTime()) / 86400000);
      if (left <= 7) {
        add({
          domain: "journal", dedupeKey: "journal:letter-soon", icon: "✉️", tone: "tip", priority: 66,
          title: "رسالة قادمة", body: `رسالتك لنفسك تُفتح بعد ${left === 1 ? "يوم واحد" : `${left} أيام`} — الترقب جميل!`,
        });
      }
    }
  }

  /* ---------- الصلوات ---------- */

  const pStreak = getPrayerStreak(prayerLogs);
  if (pStreak >= 7) {
    add({
      domain: "prayer", dedupeKey: "prayer:streak", icon: "🕌", tone: "positive", priority: 80,
      title: "ثبات الصلاة", body: `${pStreak} يوم متواصل بالصلوات الخمس كاملة — ثبات يُغبط عليه، تقبل الله.`,
      validUntil: todayStr,
    });
  }
  const mStreak = getMosqueStreak(prayerLogs);
  if (mStreak >= 3) {
    add({
      domain: "prayer", dedupeKey: "prayer:mosque-streak", icon: "🌟", tone: "positive", priority: 78,
      title: "صلاة الجماعة", body: `${mStreak} أيام متواصلة كل الصلوات بالمسجد — درجة لا يبلغها إلا قليل!`,
      validUntil: todayStr,
    });
  }
  if (prayerLogs.length >= 7) {
    const consistency = prayerConsistency(prayerLogs);
    const weakest = PRAYERS.reduce((min, p) => (consistency[p] < consistency[min] ? p : min), PRAYERS[0]);
    if (consistency[weakest] < 0.6) {
      add({
        domain: "prayer", dedupeKey: "prayer:weakest", icon: "⏰", tone: "tip", priority: 63,
        title: `صلاة ${weakest}`, href: "/prayers", actionLabel: "افتح الصلوات",
        body: `صلاة ${weakest} هي الأقل انتظاماً عندك (${Math.round(consistency[weakest] * 100)}%) — اجعل لها منبهاً خاصاً.`,
      });
    }
  }

  /* ---------- المال ---------- */

  if (dailyBudget) {
    const status = computeDailyBudgetStatus(dailyBudget, transactions);
    if (status.balance < 0) {
      add({
        domain: "finance", dedupeKey: "finance:negative-balance", icon: "🚨", tone: "warning", priority: 90,
        title: "رصيدك بالسالب", href: "/finance#daily", actionLabel: "افتح الميزانية",
        body: `رصيدك اليومي بالسالب ${formatAmount(-status.balance)} ر.س — خفف الصرف أياماً حتى يتعافى.`,
      });
    } else if (status.balance >= dailyBudget.amount * 3) {
      add({
        domain: "finance", dedupeKey: "finance:surplus", icon: "🌟", tone: "positive", priority: 70,
        title: "فائضٌ متراكم", href: "/finance#reserves", actionLabel: "حوّل للاحتياطي", validUntil: todayStr,
        body: `فائضك المتراكم ${formatAmount(status.balance)} ر.س — انضباط ممتاز! حوّله للاحتياطي أو اتركه للفوائض عند الراتب.`,
      });
    }
  }

  const totalReserves = reserves.reduce((s, f) => s + reserveBalance(f, transactions), 0);
  if (totalReserves >= 1000) {
    add({
      domain: "finance", dedupeKey: "finance:reserves-total", icon: "🏦", tone: "positive", priority: 60,
      title: "أمانٌ متراكم", body: `مجموع احتياطياتك ${formatAmount(totalReserves)} ر.س — أمان مالي يتراكم بهدوء.`,
      validUntil: todayStr,
    });
  }
  const drained = reserves.find((f) => reserveBalance(f, transactions) < 0);
  if (drained) {
    add({
      domain: "finance", dedupeKey: `finance:reserve-drained:${drained.id}`, icon: "🪫", tone: "warning", priority: 73,
      title: "احتياطي مسحوب", href: "/finance#reserves", actionLabel: "راجِع الاحتياطي",
      body: `احتياطي «${drained.name}» مسحوب أكثر من رصيده — عبّئه أو راجع مصاريفه.`,
    });
  }

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
      add({
        domain: "finance", dedupeKey: `finance:budget-over:${b.category}`, icon: "📛", tone: "warning", priority: 85,
        title: `تجاوز «${label}»`, href: "/finance#budgets", actionLabel: "راجِع السقوف",
        body: `تجاوزت سقف «${label}» بـ ${formatAmount(spent - cap)} ر.س هذا الشهر.`,
      });
    } else if (pct >= 80) {
      add({
        domain: "finance", dedupeKey: `finance:budget-near:${b.category}`, icon: "⚠️", tone: "warning", priority: 75,
        title: `اقتربت من «${label}»`, href: "/finance#budgets", actionLabel: "راجِع السقوف",
        body: `وصلت ${Math.round(pct)}% من سقف «${label}» — باقي ${formatAmount(cap - spent)} ر.س فقط.`,
      });
    }
  }

  // مقارنة أعلى قسم صرفٍ بنفس عدد الأيام من الشهر الماضي (لا شهر جزئي بشهر كامل).
  const dayOfMonth = parseDate(todayStr).getDate();
  // الشهر السابق يُشتَقّ من مفتاح الشهر (سنة/شهر صريحان) لا بـDate.setMonth الذي
  // يفيض في أيام 29–31: «31 مارس ناقص شهر» يصير «3 مارس» فيعيد الشهر نفسه.
  const lastPrefix = prevMonthPrefix(monthPrefix);
  const catTotals = (prefix: string, maxDay?: number) => {
    const totals: Record<string, number> = {};
    for (const t of transactions) {
      if (!t.date.startsWith(prefix)) continue;
      if (maxDay != null && parseDate(t.date).getDate() > maxDay) continue;
      const main = getMainCategory(categories, t.category).id || "غير مصنف";
      totals[main] = (totals[main] || 0) + t.amount;
    }
    return totals;
  };
  const thisTotals = catTotals(monthPrefix);
  const prevTotals = catTotals(lastPrefix, dayOfMonth); // نفس عدد الأيام
  for (const [cat, amount] of Object.entries(thisTotals)) {
    const prev = prevTotals[cat];
    if (prev && prev >= 100 && amount > prev * 1.4) {
      const info = categories.find((c) => c.id === cat);
      add({
        domain: "finance", dedupeKey: "finance:cat-rise", icon: "📈", tone: "warning", priority: 65,
        title: `صرف «${info?.label ?? "قسم"}» يرتفع`, href: "/finance#budgets", actionLabel: "راجِع القسم",
        body: `صرفك على «${info?.label ?? "قسم"}» ارتفع ${Math.round(((amount - prev) / prev) * 100)}% عن نفس الفترة من الشهر الماضي (${formatAmount(amount)} مقابل ${formatAmount(prev)}).`,
      });
      break;
    }
  }

  // أيام بلا صرف — نميّز «لم يصرف» عن «لم يسجّل». نحتسب فقط الأيام الخالية
  // الواقعة *بين* أيامٍ سجّل فيها هذا الأسبوع (محاطةً بتسجيلٍ قبلها وبعدها فهي
  // فجوةٌ حقيقية، لا بداية تتبّعٍ أو يومٌ لم يُدخَل بعد)، ونشترط أن يكون صاحب
  // تتبّعٍ منتظم أصلاً (سجّل في ≥12 يوماً من آخر 30). الأيام الطرفية — قبل أوّل
  // تسجيلٍ في الأسبوع أو بعد آخره — غامضة فلا تُحتسب، فلا نمدح أسبوعاً بلا تسجيل.
  const weekDates = Array.from({ length: 7 }, (_, i) => daysAgo(6 - i));
  const spendDays = new Set(transactions.filter((t) => weekDates.includes(t.date)).map((t) => t.date));
  const recordedWeek = weekDates.filter((d) => spendDays.has(d)); // تصاعدياً
  let genuineNoSpend = 0;
  if (recordedWeek.length >= 2) {
    const first = recordedWeek[0];
    const last = recordedWeek[recordedWeek.length - 1];
    genuineNoSpend = weekDates.filter((d) => d > first && d < last && !spendDays.has(d)).length;
  }
  const last30 = Array.from({ length: 30 }, (_, i) => daysAgo(i));
  const activeRecordDays = new Set(transactions.filter((t) => last30.includes(t.date)).map((t) => t.date)).size;
  if (genuineNoSpend >= 2 && activeRecordDays >= 12) {
    add({
      domain: "finance", dedupeKey: "finance:no-spend", icon: "🛡️", tone: "positive", priority: 45,
      title: "أيام بلا صرف",
      body: `${genuineNoSpend === 2 ? "يومان" : `${genuineNoSpend} أيام`} بلا أي مصروف بين أيام صرفك هذا الأسبوع — انضباط تُحسد عليه.`,
      validUntil: todayStr,
    });
  }

  /* ---------- المذكرات ---------- */

  const jStreak = getJournalStreak(journalEntries);
  if (jStreak >= 7) {
    add({
      domain: "journal", dedupeKey: "journal:streak", icon: "🔥", tone: "positive", priority: 72,
      title: "سلسلة الكتابة", body: `${jStreak} يوم كتابة متواصلة — عادات الكبار تُبنى هكذا!`,
      validUntil: todayStr,
    });
  } else if (jStreak === 0 && journalEntries.length > 0) {
    const latest = [...journalEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
    const gap = Math.floor((parseDate(todayStr).getTime() - parseDate(latest.date).getTime()) / 86400000);
    if (gap >= 2) {
      add({
        domain: "journal", dedupeKey: "journal:gap", icon: "📓", tone: "tip", priority: 68,
        title: "أحيِ العادة", href: "/journal", actionLabel: "اكتب الآن",
        body: `مرت ${gap} أيام منذ آخر مذكرة — سطران الليلة يكفيان لإحياء العادة.`,
      });
    }
  }

  if (journalEntries.length >= 10) {
    const byDay: Record<number, number> = {};
    for (const e of journalEntries) {
      const d = parseDate(e.date).getDay();
      byDay[d] = (byDay[d] || 0) + 1;
    }
    const best = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 3) {
      add({
        domain: "journal", dedupeKey: "journal:best-day", icon: "🗓️", tone: "tip", priority: 30,
        title: "يومك الثابت", body: `أكثر يوم تكتب فيه هو ${WEEKDAYS[parseInt(best[0])]} — اجعله موعدك الثابت مع نفسك.`,
      });
    }
  }

  const mmdd = todayStr.slice(5);
  const memory = journalEntries.find((e) => e.date.slice(5) === mmdd && e.date < todayStr);
  if (memory) {
    add({
      domain: "journal", dedupeKey: "journal:on-this-day", icon: "🕰️", tone: "tip", priority: 58,
      title: "في مثل هذا اليوم", href: "/journal", actionLabel: "ارجع لها",
      body: `عندك مذكرة كتبتها في مثل هذا اليوم عام ${memory.date.slice(0, 4)} — ارجع لها في صفحة المذكرات.`,
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
        add({
          domain: "reading", dedupeKey: "reading:eta", icon: "📚", tone: "positive", priority: 52,
          title: "قرب الإنهاء", body: `بوتيرتك الحالية ستنهي «${currentBook.title}» خلال ${eta} يوم تقريباً (باقي ${pagesLeft} صفحة).`,
        });
      }
    }
    const lastLog = [...logs].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (lastLog) {
      const gap = Math.floor((parseDate(todayStr).getTime() - parseDate(lastLog.date).getTime()) / 86400000);
      if (gap >= 3) {
        add({
          domain: "reading", dedupeKey: "reading:gap", icon: "🔖", tone: "tip", priority: 62,
          title: "كتابك ينتظر", href: "/reading", actionLabel: "اقرأ الآن",
          body: `«${currentBook.title}» ينتظرك منذ ${gap} أيام — ١٠ صفحات الليلة ترجّع الزخم.`,
        });
      }
    }
  } else if (books.length > 0) {
    add({
      domain: "reading", dedupeKey: "reading:pick-next", icon: "📖", tone: "tip", priority: 40,
      title: "اختر كتابك", href: "/reading", actionLabel: "اختر التالي",
      body: "لا يوجد كتاب قيد القراءة حالياً — اختر التالي من قائمتك وابدأ الليلة.",
    });
  }

  const thisWeekPages = readingLogs.filter((l) => l.date >= daysAgo(6)).reduce((s, l) => s + l.pagesRead, 0);
  const lastWeekPages = readingLogs
    .filter((l) => l.date >= daysAgo(13) && l.date < daysAgo(6))
    .reduce((s, l) => s + l.pagesRead, 0);
  if (thisWeekPages > 0 && lastWeekPages > 0 && thisWeekPages > lastWeekPages * 1.25) {
    add({
      domain: "reading", dedupeKey: "reading:accel", icon: "🚀", tone: "positive", priority: 48,
      title: "تسارع القراءة", body: `قرأت ${thisWeekPages} صفحة هذا الأسبوع مقابل ${lastWeekPages} الماضي — تسارع جميل!`,
      validUntil: todayStr,
    });
  }

  /* ---------- العادات ---------- */

  for (const hb of habits) {
    const weekCount = hb.logs.filter((d) => weekDates.includes(d)).length;
    if (weekCount >= 5) {
      add({
        domain: "habits", dedupeKey: `habits:strong:${hb.id}`, icon: hb.icon || "✅", tone: "positive", priority: 42,
        title: "عادةٌ ثابتة", body: `«${hb.name}» ${weekCount} مرات هذا الأسبوع — ثبات يستحق الإشادة.`,
        validUntil: todayStr,
      });
      break;
    }
  }

  // إزالة أي تكرار بالمفتاح (احترازاً)، ثمّ ترتيب بالأهمية.
  const seen = new Set<string>();
  const deduped = out.filter((i) => (seen.has(i.dedupeKey) ? false : (seen.add(i.dedupeKey), true)));
  deduped.sort((a, b) => b.priority - a.priority);
  return deduped;
}
