// ===================== التذكيراتُ اللطيفة — الحسابُ النقيّ =====================
// شكوى المالك التي وُلد منها هذا الملف: «ألاحظ أنّي فعلاً أنسى — المذكرات
// والقرآن بالذات. أبي تذكيراً بأسلوبٍ جميل مرتّب، ما يزعجني ولا يقلقني».
// وفيها ثلاثةُ قيودٍ يجب أن تُحترم معاً، وكلُّ واحدٍ منها ينقض الآخر إن أُهمل:
//
//   ١) **ما يزعج**: فلا إنذارَ ولا أحمرَ ولا عدُّ ذنوبٍ ولا «فاتك» و«قصّرت».
//      الصيغةُ خبرٌ لا لوم: «موضعُك محفوظ» لا «انقطعتَ شهرين».
//   ٢) **ما يُعتاد**: «أبيه متغيّر، عشان ما أعتمد عليه وخلاص أسكّره بلا ما
//      أقرأه». فالنصُّ ليس ثابتاً: لكلّ حالةٍ عدّةُ صياغات، تُنتقى **بمفتاح
//      اليوم** لا عشوائياً — فيتبدّل كلَّ يوم، ويثبت داخل اليوم الواحد فلا
//      يتراقص بين رسمتين ولا يتعارض ترطيبُ الخادم مع العميل.
//   ٣) **ما يُفيد**: التذكيرُ الذي يقول «اقرأ وردك» بلا موضعٍ تذكيرٌ فارغ.
//      فمعه دائماً **أين وقفت**: الجزء والصفحة في القرآن، وآخرُ مذكرةٍ كتبتها.
//      هذا هو الفرقُ بين «ما قريت» و«وقفتَ عند الجزء ٧، والصفحة تنتظرك».
//
// **لحظتان لا أكثر**: افتتاحُ اليوم (ما ينتظرك) وطيُّه (ما صار). وما بينهما
// صمت — التذكيرُ الذي يظهر في كلّ فتحةٍ يصير خلفيّةً تُمسح بالعين.
//
// منطقٌ نقيّ بلا حالة ولا DOM ولا `window` (يعبر إلى الغلاف الأصليّ كما هو)،
// مختبَرٌ في `nudges.test.ts`. لا تكتب صياغةً من صياغاته داخل مكوّن.
import type { AppData } from "./types";
import { arabicCount, daysCount, parseDate, quranActivityDates, toIndicDigits } from "./utils";
import { idToSurahAyah, SURAHS } from "./quran/meta";

/** الساعةُ التي يصير بعدها التذكيرُ **حصاداً** لا افتتاحاً.
 *
 *  لماذا السادسة؟ لأنّ ما بعدها ليس وقتَ «ابدأ يومك» ولا وقتَ نومٍ بعد:
 *  يبقى للوِرد والمذكرة متّسع، فالحصادُ يُقرأ والبابُ ما زال مفتوحاً. */
export const EVENING_HOUR = 18;

export type NudgeMoment = "morning" | "evening";

export function momentOf(hour: number): NudgeMoment {
  const h = Number.isFinite(hour) ? Math.floor(hour) : 0;
  return h >= EVENING_HOUR ? "evening" : "morning";
}

/** الطقوسُ الثلاثةُ التي يَنساها المالك — وهي وحدها ما يُذكَّر به.
 *  الصلاةُ لها مطالبتُها المستقلّة (`prayerReminder.ts`)، والمالُ له بطاقتُه:
 *  إقحامُهما هنا يجعل البطاقةَ قائمةَ مهامٍ تُغلَق بلا قراءة. */
export type RitualKey = "quran" | "journal" | "reading" | "habits";

/** حالةُ طقسٍ واحد كما تُقرأ من البيانات — بلا صياغةٍ بعد. */
export interface RitualState {
  key: RitualKey;
  doneToday: boolean;
  /** آخرُ يومٍ فيه أثر — `null` لم يبدأ قطّ. */
  lastDate: string | null;
  /** الأيامُ منذ آخر أثر (`0` اليوم) — `null` لم يبدأ قطّ. */
  gap: number | null;
  /** موضعُك المحفوظ: «الجزء ٧ · الصفحة ١٤١». فارغٌ حين لا موضعَ يُقال. */
  place: string;
  /** المجمَّدُ يخرج من التذكير كما يخرج من قائمة اليوم — التجميدُ قرارٌ يُحترم. */
  frozen: boolean;
}

export interface NudgeLine {
  key: RitualKey | "prayers" | "money";
  text: string;
  /** سطرٌ ثانٍ باهت: أين وقفت. */
  place?: string;
  href?: string;
  /** خبرُ إنجازٍ (حصاد) أم بابٌ مفتوح. */
  done: boolean;
}

export interface Nudge {
  moment: NudgeMoment;
  title: string;
  lines: NudgeLine[];
  closing: string;
}

/* ===================== الانتقاءُ المتبدّل ===================== */
// بذرةٌ مشتقّةٌ من نصّ (مفتاحُ اليوم + اسمُ الطقس + اللحظة)، فالصياغةُ تتبدّل
// كلَّ يومٍ وتختلف بين سطرٍ وسطر في اليوم نفسه — وتثبت داخل اليوم الواحد.
// عشوائيّةٌ حقيقية كانت ستُبدّل النصَّ بين رسمتين، ويختلف الخادمُ عن العميل.
export function seedOf(...parts: string[]): number {
  let h = 2166136261;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      h ^= part.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return Math.abs(h);
}

export function pick<T>(pool: readonly T[], seed: number): T {
  return pool[seed % pool.length];
}

/* ===================== مدّةُ الانقطاع بلسانٍ عربيّ ===================== */
// «٥٨ يوماً» رقمٌ يُحسب، و«قرابة شهرين» مدّةٌ تُحسّ. والفرقُ ليس تجميلاً:
// الرقمُ الكبير يُقرأ عتاباً، والمدّةُ تُقرأ خبراً.
const weeksCount = (n: number): string =>
  arabicCount(n, { one: "أسبوع", two: "أسبوعين", few: "أسابيع", many: "أسبوعاً" });
const monthsCount = (n: number): string =>
  arabicCount(n, { one: "شهر", two: "شهرين", few: "أشهر", many: "شهراً" });

/** «أمس · قبل يومين · قبل ٥ أيام · قبل أسبوعين · قرابة شهرين». */
export function spanLabel(days: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(days) ? days : 0));
  if (n <= 0) return "اليوم";
  if (n === 1) return "أمس";
  if (n < 14) return `قبل ${daysCount(n)}`;
  if (n < 60) return `قبل ${weeksCount(Math.round(n / 7))}`;
  return `قرابة ${monthsCount(Math.round(n / 30))}`;
}

/** درجةُ البُعد — عليها تدور الصياغة. */
export type Distance = "fresh" | "today" | "near" | "away" | "far";

export function distanceOf(state: RitualState): Distance {
  if (state.doneToday) return "today";
  if (state.gap === null) return "fresh";
  if (state.gap <= 2) return "near";
  if (state.gap < 14) return "away";
  return "far";
}

/* ===================== قراءةُ الحالة من البيانات ===================== */

export type NudgeInput = Pick<
  AppData,
  | "journalEntries" | "readingLogs" | "books" | "habits" | "frozenHabits"
  | "quranWird" | "quranHifz" | "quranReflections" | "quranKhatma"
>;

function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

/** أحدثُ تاريخٍ لا يتجاوز اليوم — تاريخٌ قادمٌ من جهازٍ ساعتُه أمامَنا لا يُقرأ
 *  «آخرَ نشاط» فيُخفي انقطاعاً قائماً. */
function latestUpTo(dates: Iterable<string>, todayStr: string): string | null {
  let best: string | null = null;
  for (const d of dates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > todayStr) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/** موضعُك في المصحف: الجزءُ من الختمة، والصفحةُ إن سُجّلت، ثمّ جبهةُ الحفظ.
 *  ثلاثةُ مصادرَ لأنّ لكلٍّ منها مالكاً يقرأ به: من يختم يعرف نفسه بالجزء،
 *  ومن يحفظ يعرفها بالسورة. وما لا مصدرَ له يرجع نصّاً فارغاً لا «صفر». */
export function quranPlace(input: Pick<NudgeInput, "quranKhatma" | "quranHifz">): string {
  const parts: string[] = [];
  const khatma = input.quranKhatma;
  if (khatma) {
    if (khatma.page && khatma.page > 0) parts.push(`الصفحة ${khatma.page}`);
    else if (khatma.juz > 0) parts.push(`الجزء ${khatma.juz}`);
  }
  const frontier = input.quranHifz?.frontierId ?? 0;
  if (frontier > 0) {
    const { surah, ayah } = idToSurahAyah(frontier);
    const name = SURAHS[surah - 1]?.name;
    if (name) parts.push(`الحفظ عند ${name} ${ayah}`);
  }
  return parts.join(" · ");
}

/** موضعُك في الكتاب: الكتابُ الجاري وصفحتُه. «الجاري» آخرُ كتابٍ سجّلتَ فيه قراءةً
 *  وما زال «أقرأ»، وإلّا أوّلُ كتابٍ «أقرأ». وبلا كتابٍ مفتوح لا يُخترع موضع.
 *  كان سطرُ القراءة بلا موضع (٠٫١٫٤٦٢) — فيقرأ «ما قرأتَ اليوم بعد» تحت سطر
 *  القرآن «لم تقرأ اليوم بعد» ولا يدري المالك أيُّهما أيّ. */
export function readingPlace(input: Pick<NudgeInput, "books" | "readingLogs">): string {
  const reading = (input.books ?? []).filter((b) => b.status === "أقرأ");
  if (!reading.length) return "";
  const byId = new Map(reading.map((b) => [b.id, b]));
  const lastLog = [...(input.readingLogs ?? [])]
    .filter((l) => byId.has(l.bookId))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const book = (lastLog && byId.get(lastLog.bookId)) || reading[0];
  const page = book.currentPage > 0
    ? ` · صفحة ${toIndicDigits(String(book.currentPage))}${book.totalPages > 0 ? ` من ${toIndicDigits(String(book.totalPages))}` : ""}`
    : "";
  return `«${book.title}»${page}`;
}

export function readRituals(input: NudgeInput, todayStr: string): RitualState[] {
  const frozen = new Set(input.frozenHabits ?? []);

  const quranDates = quranActivityDates(input);
  const quranLast = latestUpTo(quranDates, todayStr);

  const journalLast = latestUpTo(input.journalEntries.map((e) => e.date), todayStr);
  const journalCount = input.journalEntries.length;

  const readingLast = latestUpTo(input.readingLogs.map((l) => l.date), todayStr);

  // العاداتُ المخصّصة وحدها هنا (الطقوسُ الأساسية لها أسطرُها): «أُنجزت اليوم»
  // تعني أن **كلّ** عادةٍ نشِطة سُجّلت — قائمةٌ نصفُها مُنجَز بابٌ ما زال مفتوحاً.
  const activeHabits = input.habits.filter((h) => !frozen.has(h.id));
  const habitDates = new Set<string>();
  for (const h of activeHabits) for (const d of h.logs) habitDates.add(d);
  const habitsLast = latestUpTo(habitDates, todayStr);
  const habitsDone =
    activeHabits.length > 0 && activeHabits.every((h) => h.logs.includes(todayStr));

  const make = (
    key: RitualKey,
    last: string | null,
    doneToday: boolean,
    place: string,
    isFrozen: boolean
  ): RitualState => ({
    key,
    doneToday,
    lastDate: last,
    gap: last ? Math.max(0, daysBetween(last, todayStr)) : null,
    place,
    frozen: isFrozen,
  });

  return [
    make("quran", quranLast, quranDates.has(todayStr), quranPlace(input), frozen.has("core:wird")),
    make(
      "journal",
      journalLast,
      input.journalEntries.some((e) => e.date === todayStr),
      journalCount > 0 ? `${arabicCount(journalCount, { one: "مذكرة واحدة", two: "مذكرتان", few: "مذكرات", many: "مذكرة" })} حتى الآن` : "",
      frozen.has("core:journal")
    ),
    make(
      "reading",
      readingLast,
      input.readingLogs.some((l) => l.date === todayStr),
      readingPlace(input),
      frozen.has("core:reading")
    ),
    make("habits", habitsLast, habitsDone, "", activeHabits.length === 0),
  ];
}

/* ===================== الصياغات ===================== */
// لكلّ (طقسٍ × بُعد) عدّةُ صياغات. وليست ترفاً: النصُّ الواحد يصير بعد أسبوعٍ
// جزءاً من الأثاث. `{مدة}` يُستبدل بمدّة الانقطاع.

const TITLES: Record<NudgeMoment, readonly string[]> = {
  morning: [
    "يومٌ جديد بين يديك",
    "قبل أن يبدأ الزحام",
    "ما ينتظرك اليوم",
    "بدايةُ اليوم",
    "بابان أو ثلاثة، لا أكثر",
    "خُذها على مهلك",
  ],
  evening: [
    "وش صار اليوم",
    "حصادُ اليوم",
    "آخرُ النهار",
    "يومُك كما جرى",
    "طيُّ الصفحة",
    "قبل أن تُسلِم اليوم",
  ],
};

const CLOSINGS: Record<NudgeMoment, readonly string[]> = {
  morning: [
    "ما ينقصك وقت — ينقصك أوّل خطوة صغيرة.",
    "واحدةٌ منها تكفي ليكون اليوم على خير.",
    "لا تحاول تعويض ما مضى؛ اليومُ وحده يكفي.",
    "خذ الأسهل أولاً، والباقي يتبع.",
    "الاستمرارُ أهون من البداية — وأنت بدأتَ من قبل.",
    "بلا استعجال. الباب لا يُغلق.",
  ],
  evening: [
    "نم وأنت مطمئن — الغد فيه متّسع.",
    "ما تمّ يُشكَر، وما بقي لا يُحاسَب.",
    "يومٌ مضى وأنت فيه أحسن من أمس أو مثله، وكلاهما خير.",
    "لا تُثقل نفسك بما لم يقع.",
    "أغلِق اليوم على ما فيه؛ هذا يكفي.",
    "الحسابُ هنا ليس حساباً — خبرٌ لتقرأه ثمّ تنام.",
  ],
};

type PhrasePools = Partial<Record<Distance, readonly string[]>>;

const MORNING: Record<RitualKey, PhrasePools> = {
  quran: {
    fresh: [
      "القرآن ينتظر أوّل صفحة — ولا يشترط عليك ختمة.",
      "ما بدأتَ وِردك بعد. آيةٌ واحدة تفتح الباب.",
      "صفحةٌ واحدة اليوم، وتكون قد بدأت.",
    ],
    near: [
      "وِردك اليوم ما زال بانتظارك.",
      "بقي وِردُك — وأنت قريبٌ منه.",
      "لم تفتح المصحف اليوم بعد.",
    ],
    away: [
      "آخرُ وِردٍ لك {مدة}. تُكمل من موضعك لا من الأوّل.",
      "{مدة} بلا وِرد — والصفحةُ التي وقفتَ عندها كما تركتها.",
      "مرّت {مدة} على وِردك. موضعُك محفوظ.",
    ],
    far: [
      "{مدة} على وِردك — وموضعُك ما زال كما هو ينتظرك.",
      "انقطع وِردُك {مدة}. لا شيءَ ضاع: تبدأ من حيث وقفت.",
      "{مدة} والمصحفُ على الصفحة نفسها. صفحةٌ اليوم تكفي لتعود.",
    ],
  },
  journal: {
    fresh: [
      "دفترُ مذكراتك فارغ — وأوّلُ سطرٍ أسهل ممّا تظنّ.",
      "ما كتبتَ مذكرةً بعد. سطران يكفيان.",
      "أوّل مذكرة تنتظر: كيف كان يومك؟",
    ],
    near: [
      "ما كتبتَ اليوم بعد.",
      "مذكرةُ اليوم ما زالت بيضاء.",
      "سطران قبل أن ينتهي اليوم.",
    ],
    away: [
      "آخرُ مذكرةٍ كتبتها {مدة}.",
      "{مدة} بلا كتابة — والأيامُ بينهما تُنسى إن لم تُكتب.",
      "مرّت {مدة} على آخر سطرٍ كتبته.",
    ],
    far: [
      "{مدة} من غير مذكرة. اكتب اليوم وحده؛ لا تُعوّض ما مضى.",
      "دفترُك ساكنٌ {مدة}. سطرٌ واحد يفتحه.",
      "{مدة} — والذاكرةُ أقصرُ ممّا نظنّ. اكتب شيئاً صغيراً.",
    ],
  },
  reading: {
    fresh: ["ما سجّلتَ قراءةً بعد — عشر صفحاتٍ بداية."],
    near: ["ما فتحتَ كتابك اليوم بعد."],
    away: ["آخرُ قراءةٍ في كتابك سجّلتها {مدة}."],
    far: ["كتابُك متوقّفٌ {مدة}. صفحاتٌ قليلة تُعيد الخيط."],
  },
  habits: {
    near: ["بقيت لك عاداتٌ لم تُعلَّم اليوم."],
    away: ["عاداتُك ساكنةٌ {مدة}."],
    far: ["{مدة} بلا تسجيلٍ لعاداتك — ابدأ بواحدة."],
  },
};

const EVENING: Record<RitualKey, PhrasePools> = {
  quran: {
    today: ["وِردُك اليوم تمّ.", "قرأتَ وِردك اليوم — وهذا يُكتب.", "المصحفُ فُتح اليوم."],
    near: ["اليومُ مرّ بلا وِرد.", "ما فُتح المصحفُ اليوم.", "الوِردُ لم يقع اليوم."],
    away: ["الوِردُ ساكنٌ منذ {مدة}.", "آخرُ وِردٍ لك {مدة}."],
    far: ["{مدة} على وِردك — وموضعُك محفوظ متى عُدت.", "ما زال المصحفُ عند موضعك منذ {مدة}."],
    fresh: ["القرآنُ ينتظر أوّل صفحة، متى ما جاءك الوقت."],
  },
  journal: {
    today: ["كتبتَ مذكرةَ اليوم.", "اليومُ مكتوب.", "سجّلتَ يومك."],
    near: ["اليومُ لم يُكتب بعد — وما زال في الليل متّسع."],
    away: ["آخرُ مذكرةٍ لك {مدة}."],
    far: ["الدفترُ ساكنٌ {مدة}."],
    fresh: ["الدفترُ ما زال بلا أوّل سطر."],
  },
  reading: {
    today: ["قرأتَ في كتابك اليوم.", "سجّلتَ قراءةَ اليوم."],
    near: ["لم تُسجّل قراءةً في كتابك اليوم."],
    away: ["آخرُ قراءةٍ في كتابك {مدة}."],
    far: ["الكتابُ متوقّفٌ {مدة}."],
    fresh: ["لا كتابَ مفتوحاً بعد."],
  },
  habits: {
    today: ["عاداتُك اليوم كاملة.", "علّمتَ عاداتك كلَّها."],
    near: ["بقيت عاداتٌ بلا علامة."],
    away: ["عاداتُك ساكنةٌ {مدة}."],
    far: ["{مدة} بلا تسجيل."],
  },
};

const HREFS: Record<RitualKey, string> = {
  quran: "/quran",
  journal: "/journal",
  reading: "/reading",
  habits: "/",
};

function phrase(
  pools: PhrasePools,
  distance: Distance,
  seed: number,
  gap: number | null
): string | null {
  const pool = pools[distance];
  if (!pool || pool.length === 0) return null;
  return pick(pool, seed).replace("{مدة}", spanLabel(gap ?? 0));
}

/* ===================== بناءُ التذكير ===================== */

export interface NudgeExtras {
  /** صلواتُ اليوم المسجَّلة (٠..٥) — خبرٌ في الحصاد، لا مطالبة.
   *
   *  والمالُ ليس هنا عمداً: له بطاقتُه وأقواسُه في البهو، وإقحامُ رقمِ صرفٍ
   *  في تذكيرٍ مساءُ يومٍ هو بعينه ما وصفه المالك بـ«يقلقني». */
  prayed?: number;
}

/** أكثرُ ما يُعرض من أسطرِ الطقوس. ثلاثةٌ صباحاً لأنّ القائمةَ الأطول تُقرأ
 *  عبئاً، واثنان مساءً لأنّ الحصادَ ليس جرداً. */
export const MAX_OPEN_LINES = 3;

export function buildNudge(
  input: NudgeInput,
  opts: { todayStr: string; hour: number; extras?: NudgeExtras }
): Nudge | null {
  const moment = momentOf(opts.hour);
  const todayStr = opts.todayStr;
  const rituals = readRituals(input, todayStr).filter((r) => !r.frozen);
  const seedBase = `${todayStr}:${moment}`;
  const title = pick(TITLES[moment], seedOf(seedBase, "title"));
  const closing = pick(CLOSINGS[moment], seedOf(seedBase, "closing"));

  if (moment === "morning") {
    // الأبعدُ أوّلاً: ما نُسي شهراً أولى بالذكر ممّا نُسي ساعة — وهو بعينه ما
    // اشتكى منه المالك («القرآن، يمكن شهرين ما كمّلت»).
    //
    // **وما لم يُبدأ قطّ يأتي أخيراً لا أوّلاً** (`gap === null` تُقرأ ‎-1‎ لا
    // ما لا نهاية): بابٌ لم يُفتح قطّ ليس خيطاً انقطع — وتصديرُه يجعل البطاقة
    // تفتتح كلَّ يومٍ بما لا يفعله المالك أصلاً، فتُدفع القراءةُ الحقيقية إلى
    // الأسفل ويصير التذكيرُ خلفيّةً. وهو نفسُ الترتيب في الحصاد مقلوباً.
    const open = rituals
      .filter((r) => !r.doneToday)
      .sort((a, b) => (b.gap ?? -1) - (a.gap ?? -1))
      .slice(0, MAX_OPEN_LINES);

    const lines: NudgeLine[] = [];
    for (const r of open) {
      const text = phrase(MORNING[r.key], distanceOf(r), seedOf(seedBase, r.key), r.gap);
      if (!text) continue;
      lines.push({
        key: r.key,
        text,
        place: r.place || undefined,
        href: HREFS[r.key],
        done: false,
      });
    }
    if (lines.length === 0) {
      return {
        moment,
        title,
        lines: [{ key: "quran", text: "كلُّ أبوابك مُغلقةٌ على خير — لا شيءَ ينتظرك.", done: true }],
        closing,
      };
    }
    return { moment, title, lines, closing };
  }

  // ===== المساء: حصادٌ لا جرد =====
  // ما تمّ يُذكر كلُّه (وهو ما يُفرح)، وما بقي يُذكر منه **واحدٌ** فقط — أقربُها
  // إلى المتناول. قائمةُ ما لم يقع مساءً هي بعينها ما وصفه المالك بـ«يقلقني».
  const done = rituals.filter((r) => r.doneToday);
  const lines: NudgeLine[] = [];
  for (const r of done) {
    const text = phrase(EVENING[r.key], "today", seedOf(seedBase, r.key), r.gap);
    if (text) lines.push({ key: r.key, text, href: HREFS[r.key], done: true });
  }

  const extras = opts.extras ?? {};
  if (typeof extras.prayed === "number") {
    // خبرٌ لا مطالبة: الصفرُ يُقال «ما سُجّلت» لا «صفر صلوات» — والمطالبةُ
    // الحقيقية لها مكانُها (`prayerReminder.ts`) ولا تُكرَّر هنا.
    const prayed = Math.max(0, Math.min(5, Math.round(extras.prayed)));
    lines.push({
      key: "prayers",
      text:
        prayed >= 5
          ? "الصلواتُ الخمسُ مسجَّلة."
          : prayed === 0
          ? "لم تُسجَّل صلواتُ اليوم بعد."
          : `سجّلتَ ${arabicCount(prayed, { one: "صلاةً واحدة", two: "صلاتين", few: "صلوات", many: "صلاة" })} اليوم.`,
      href: "/prayers",
      done: prayed >= 5,
    });
  }

  const pending = rituals
    .filter((r) => !r.doneToday)
    .sort((a, b) => (a.gap ?? 9999) - (b.gap ?? 9999))[0];
  if (pending) {
    const text = phrase(EVENING[pending.key], distanceOf(pending), seedOf(seedBase, pending.key), pending.gap);
    if (text) {
      lines.push({
        key: pending.key,
        text,
        place: pending.place || undefined,
        href: HREFS[pending.key],
        done: false,
      });
    }
  }

  if (lines.length === 0) return null;
  return { moment, title, lines, closing };
}
