import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { JournalEntry, ReadingLog, Transaction, PrayerLog, PrayerName, RecurringTransaction, FinanceCategoryDef, ReserveFund, Budget, HifzState, QuranReflection, KhatmaState } from "./types";
import { PRAYERS, UNKNOWN_CATEGORY } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Round money to 2 decimals at computation boundaries. Percentage splits and
// long reduce() sums accumulate binary-float error (e.g. a balance of
// -0.00000001), which then trips sign checks like `balance < 0`; rounding here
// keeps stored/compared amounts to real riyal-halalah precision.
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function uid() {
  // Prefer a real UUID (collision-proof for big Day One imports); fall back to
  // the old scheme where crypto.randomUUID is unavailable (non-secure context).
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// توحيد النص العربي للبحث: يحذف التشكيل والتطويل ويوحّد الهمزات والألف
// والياء والتاء المربوطة، فيطابق البحث «احمد» مع «أحمد»، والمكتوب بلا تشكيل
// مع المشكَّل. يُطبَّق على طرفي المقارنة (النص والكلمة المبحوثة).
export function normalizeArabic(s: string): string {
  return (s || "")
    .replace(/[ً-ْٰـ]/g, "") // حركات + شدّة + تطويل + ألف خنجرية
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

// Convert Arabic-Indic (٠-٩) and Persian/Extended (۰-۹) digits — plus the
// Arabic decimal separator (٫) — to their Latin equivalents, so numbers typed
// on an Arabic keyboard are accepted and stored as plain ASCII everywhere.
export function toLatinDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".");
}

// ===================== Local-date primitives =====================
// All date keys in the app are YYYY-MM-DD in the USER'S timezone. Never
// derive them via toISOString() — that's UTC, and in Riyadh (UTC+3) it
// reports yesterday between midnight and 3am, shifting prayers, streaks
// and whole calendar grids by a day.

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Parse a YYYY-MM-DD key as LOCAL midnight (new Date("YYYY-MM-DD") would
// be UTC midnight — a different calendar day in some timezones).
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function today() {
  return toDateStr(new Date());
}

// Intl formatters are expensive to construct, so build each once at module
// level and reuse it — with hundreds of journal/finance cards rendering, a
// fresh formatter per call was a measurable chunk of render time.
// Gregorian calendar + Latin digits so server (build) and client render
// identically — avoids hydration mismatches from ar-SA's Hijri default.
const gregLongFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const gregShortFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  month: "short",
  day: "numeric",
});

export function formatDate(dateStr: string) {
  return gregLongFmt.format(parseDate(dateStr));
}

export function formatDateShort(dateStr: string) {
  return gregShortFmt.format(parseDate(dateStr));
}

// Hijri (Umm al-Qura) date, e.g. "15 محرم 1448 هـ".
// Note: the ar-SA Islamic formatter already appends the "هـ" era marker on
// its own — appending it again produced a doubled "هـ هـ" (garbled to "ه ه").
export function hijriDate(dateStr: string) {
  try {
    const d = parseDate(dateStr);
    const formatted = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(d);
    // Some environments already append the هـ era marker — don't double it.
    return formatted.includes("هـ") ? formatted : formatted + " هـ";
  } catch {
    return "";
  }
}

// Numeric Hijri (Umm al-Qura) day-of-month for a date — used by the
// calendars to print the Hijri day beside the Gregorian one in each cell.
const hijriDayFmt =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric" })
    : null;

export function hijriDay(dateStr: string): string {
  try {
    return hijriDayFmt?.format(parseDate(dateStr)) ?? "";
  } catch {
    return "";
  }
}

// Hijri month(s) label for a whole Gregorian month, e.g. "محرم – صفر 1447 هـ".
// A Gregorian month always spans one or two Hijri months.
export function hijriMonthLabel(year: number, month: number): string {
  try {
    const fmtMonth = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { month: "long" });
    const fmtYear = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { year: "numeric" });
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const m1 = fmtMonth.format(first);
    const m2 = fmtMonth.format(last);
    const y2 = fmtYear.format(last).replace(/هـ/g, "").trim();
    return (m1 === m2 ? m1 : `${m1} – ${m2}`) + ` ${y2} هـ`;
  } catch {
    return "";
  }
}

// Numeric Hijri (Umm al-Qura) month/day/year for a date — Ramadan is month 9.
// Uses the Latin-numeral Islamic calendar so parsing the parts back to numbers
// is reliable regardless of locale digit shaping.
const hijriPartsFmt =
  typeof Intl !== "undefined"
    ? new Intl.DateTimeFormat("en-US-u-ca-islamic-umalqura", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })
    : null;

export function hijriParts(date = new Date()): { day: number; month: number; year: number } | null {
  try {
    if (!hijriPartsFmt) return null;
    const parts = hijriPartsFmt.formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    const day = get("day");
    const month = get("month");
    const year = get("year");
    if (!day || !month || !year) return null;
    return { day, month, year };
  } catch {
    return null;
  }
}

// True during the Hijri month of رمضان (month 9). Drives the seasonal card,
// which renders only then and leaves no footprint the rest of the year.
export function isRamadan(date = new Date()): boolean {
  return hijriParts(date)?.month === 9;
}

// ===================== Sun & prayer times =====================

// NOAA-simplified solar position for a date + location. Shared by
// sunrise/sunset (auto theme) and the five prayer times.
function solarParams(date: Date) {
  const dayOfYear = Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000
  );
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (date.getHours() - 12) / 24);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  return { eqTime, decl };
}

const RAD = Math.PI / 180;

// Hour angle (degrees) at which the sun's centre sits at `zenith` degrees
// from vertical. Null when the sun never reaches that altitude.
function hourAngle(zenith: number, lat: number, decl: number): number | null {
  const cosHA =
    (Math.cos(zenith * RAD) - Math.sin(lat * RAD) * Math.sin(decl)) /
    (Math.cos(lat * RAD) * Math.cos(decl));
  if (cosHA < -1 || cosHA > 1) return null;
  return Math.acos(cosHA) / RAD;
}

function utcMinutesToDate(date: Date, minutes: number): Date {
  const dayStartUTC = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return new Date(dayStartUTC + minutes * 60000);
}

// Sunrise/sunset — used for the auto theme flip. Accurate to a couple of
// minutes. Returns null in polar edge cases.
export function sunTimes(date: Date, lat: number, lng: number): { sunrise: Date; sunset: Date } | null {
  const { eqTime, decl } = solarParams(date);
  const ha = hourAngle(90.833, lat, decl); // refraction + solar disc radius
  if (ha === null) return null;
  const utcNoonMin = 720 - 4 * lng - eqTime;
  return {
    sunrise: utcMinutesToDate(date, utcNoonMin - 4 * ha),
    sunset: utcMinutesToDate(date, utcNoonMin + 4 * ha),
  };
}

// The five daily prayer times, Umm al-Qura convention: الفجر at sun 18.5°
// below the horizon, العشاء fixed at 90 minutes after المغرب, العصر at
// shadow factor 1 (Shafi'i). Computed fully offline. Null near the poles.
export function computePrayerTimes(
  date: Date,
  lat: number,
  lng: number
): Record<PrayerName, Date> | null {
  const { eqTime, decl } = solarParams(date);
  const noonMin = 720 - 4 * lng - eqTime; // solar noon, minutes from UTC midnight

  const haSunset = hourAngle(90.833, lat, decl);
  const haFajr = hourAngle(90 + 18.5, lat, decl);
  if (haSunset === null || haFajr === null) return null;

  // العصر: shadow length = object length + noon shadow (factor 1).
  const noonAltitude = Math.abs(lat * RAD - decl);
  const asrAltitude = Math.atan(1 / (1 + Math.tan(noonAltitude))); // radians
  const haAsr = hourAngle(90 - asrAltitude / RAD, lat, decl);
  if (haAsr === null) return null;

  const maghribMin = noonMin + 4 * haSunset;
  return {
    الفجر: utcMinutesToDate(date, noonMin - 4 * haFajr),
    الظهر: utcMinutesToDate(date, noonMin),
    العصر: utcMinutesToDate(date, noonMin + 4 * haAsr),
    المغرب: utcMinutesToDate(date, maghribMin),
    العشاء: utcMinutesToDate(date, maghribMin + 90),
  };
}

// Cached device location (set once by the theme applier / prayer widgets).
// Falls back to Riyadh — close enough anywhere in the Gulf.
export const FALLBACK_COORDS = { lat: 24.7136, lng: 46.6753 };
export const GEO_KEY = "madar-geo";

export function getCachedCoords(): { lat: number; lng: number } {
  try {
    const raw = localStorage.getItem(GEO_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return FALLBACK_COORDS;
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "numeric", minute: "2-digit" });
}

// Tiny haptic tick on satisfying actions (habit done, prayer logged).
// Silently a no-op where the Vibration API doesn't exist (iOS Safari).
export function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {}
}

// Percentage of the current year elapsed (0-100).
export function yearProgress(now = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return Math.round(((now.getTime() - start) / (end - start)) * 100);
}

const amountFmt = new Intl.NumberFormat("ar-SA-u-nu-latn", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatAmount(amount: number) {
  return amountFmt.format(amount);
}

export function calcStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const logged = new Set(dates);
  const current = parseDate(today());

  // A streak can never be longer than the number of distinct logged days, so
  // bound the walk by that (plus a little slack for the "today not logged yet"
  // step that moves back without counting). This lets a genuinely long run —
  // more than a year — keep counting instead of freezing at a fixed 365 cap.
  const maxSteps = logged.size + 2;
  let streak = 0;
  for (let i = 0; i < maxSteps; i++) {
    const dateStr = toDateStr(current);
    if (logged.has(dateStr)) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else if (i === 0) {
      // today not logged yet, check yesterday
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// Longest run of consecutive days in the given dates (all-time best).
export function longestStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const sorted = [...new Set(dates)].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDate(sorted[i - 1]);
    prev.setDate(prev.getDate() + 1);
    if (toDateStr(prev) === sorted[i]) {
      run++;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

export function getJournalStreak(entries: JournalEntry[]): number {
  return calcStreak(entries.map((e) => e.date));
}

// كل صور المذكرة — الحقل الجديد photos أولاً، مع التوافق مع photo القديم.
export function entryPhotos(e: JournalEntry): string[] {
  if (e.photos?.length) return e.photos;
  return e.photo ? [e.photo] : [];
}

// كل الملاحظات الصوتية للمذكرة — الحقل الجديد audios أولاً، مع التوافق مع audio.
export function entryAudios(e: { audio?: string; audios?: string[] }): string[] {
  if (e.audios?.length) return e.audios;
  return e.audio ? [e.audio] : [];
}

// ===== هوية المذكرات المستوردة والحفاظ على وسائطها عبر الأجهزة =====

// هوية مذكرة Day One الثابتة هي UUID الخاص بها — نفسه على كل جهاز وفي كل إعادة
// استيراد. اشتقاق مُعرّف المتجر منه (بدل uid عشوائي جديد كل استيراد) هو ما يجعل
// جهازين يعرفان أنّ المذكرة المستوردة عنصرٌ واحد: عند التوحيد بالـid تُدمَج بدل
// أن تتكرّر، وحذفها على جهاز يختم مُعرّفاً يملكه الجهاز الآخر فعلاً — فينتشر
// الحذف أخيراً. المذكرات اليدوية تحتفظ بمعرّفها.
export function canonicalEntryId(
  e: Pick<JournalEntry, "id" | "source" | "dayOneUUID">
): string {
  if (e.source === "dayOne" && e.dayOneUUID) return `do-${e.dayOneUUID}`;
  return e.id;
}

// المراجع (photoRefs/audioRefs) تُرافق المذكرة محلياً كمؤشّرات هاش لوسائط لم
// تُنزَّل بعد. نُعرّفها هنا كي يوحّدها دمج الوسائط دون استيراد sync.ts (فيجرّ Firebase).
type EntryMediaRefs = JournalEntry & { photoRefs?: string[]; audioRefs?: string[] };

// توحيد قائمتَي مراجع (يحفظ الترتيب ويزيل التكرار). المراجع هاشاتُ محتوى، فتوحيدها
// آمنٌ دائماً — بخلاف بايتات الوسائط، الهاشان المتساويان محتواهما واحد.
function unionRefs(a?: string[], b?: string[]): string[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  return [...new Set([...(a ?? []), ...(b ?? [])])];
}

// دمج نسختين من المذكرة نفسها بحيث لا تضيع الوسائط أبداً. النصّ وبقية الحقول من
// `base`. الصور/الأصوات تُملأ فقط إن كانت `base` خاليةً منها — لا نستبدل مجموعةً
// موجودة، وإلا عادت صورةٌ حذفها المستخدم عمداً على جهاز الـbase (الحذف الإفرادي
// متاح في المحرّر). أمّا المراجع المعلّقة (photoRefs/audioRefs) فتُوحَّد من
// الطرفين — لأنها هاشات محتوى، فمرجعٌ لم يُنزَّل على جهاز (كان R2 متعذّراً) لا
// يسقط حين تفوز النسخة الأخرى فتتيتّم الصورة في R2 (الثغرة التي بقيت بعد
// local-media-12). هذه شبكة الأمان التي تمنع محو وسائطٍ يملكها الجهاز الآخر.
export function mergeEntryMedia(base: JournalEntry, other: JournalEntry): JournalEntry {
  const b = base as EntryMediaRefs;
  const o = other as EntryMediaRefs;
  let out: EntryMediaRefs = b;
  // املأ فقط حين تكون base خاليةً — لا تستبدل مجموعةً موجودة (فيعود المحذوف).
  if (entryPhotos(base).length === 0 && entryPhotos(other).length > 0) {
    out = { ...out, photos: o.photos, photo: o.photo };
  }
  if (entryAudios(base).length === 0 && entryAudios(other).length > 0) {
    out = { ...out, audios: o.audios, audio: o.audio };
  }
  const photoRefs = unionRefs(b.photoRefs, o.photoRefs);
  if (photoRefs) out = { ...out, photoRefs };
  const audioRefs = unionRefs(b.audioRefs, o.audioRefs);
  if (audioRefs) out = { ...out, audioRefs };
  if (!(base.videoRefs?.length) && other.videoRefs?.length) {
    out = { ...out, videoRefs: other.videoRefs };
  }
  return out as JournalEntry;
}

// توحيد المعرّفات (Day One → معرّف ثابت مشتقّ من UUID) ودمج المكرّرات التي تشترك
// في معرّف واحد مع الحفاظ على وسائطها. يُحفظ الترتيب حسب أوّل ظهور. يُستخدَم في
// ترقية المتجر المحلّي وفي كل دمج سحابيّ، فتتلاقى المكرّرات القديمة (باختلاف
// المعرّفات) في عنصرٍ واحد.
export function dedupeJournalEntries(entries: JournalEntry[]): JournalEntry[] {
  const order: string[] = [];
  const byId = new Map<string, JournalEntry>();
  for (const raw of entries) {
    const id = canonicalEntryId(raw);
    const e = id === raw.id ? raw : { ...raw, id };
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, e);
      order.push(id);
    } else {
      byId.set(id, mergeEntryMedia(existing, e));
    }
  }
  return order.map((id) => byId.get(id)!);
}

export function getReadingStreak(logs: ReadingLog[]): number {
  return calcStreak(logs.map((l) => l.date));
}

// «وِرد اليوم» يُحتسب تمامه بأيّ نشاطٍ قرآني في ذلك اليوم — لا نقرة الوِرد فحسب،
// بل حفظٌ جديد، أو مراجعة، أو تدبّرٌ مكتوب، أو جزءٌ سُجّل في الختمة. تُجمع تواريخ
// كل ذلك في مجموعةٍ واحدة تقود حالة «تمّ» وسلسلتها، فمن فتح المصحف بأيّ وجهٍ لا
// يُطالَب بنقرةٍ منفصلة. (الختمة لا تحفظ إلا آخر يوم قراءة، فيُضاف وحده.)
export function quranActivityDates(d: {
  quranWird?: string[];
  quranHifz?: HifzState;
  quranReflections?: QuranReflection[];
  quranKhatma?: KhatmaState;
}): Set<string> {
  const dates = new Set<string>(d.quranWird ?? []);
  for (const s of d.quranHifz?.sessions ?? []) dates.add(s.date);
  for (const r of d.quranHifz?.reviews ?? []) dates.add(r.date);
  for (const r of d.quranReflections ?? []) dates.add(r.date);
  if (d.quranKhatma?.lastReadDate) dates.add(d.quranKhatma.lastReadDate);
  return dates;
}

export function getCategoryInfo(categories: FinanceCategoryDef[], id: string): FinanceCategoryDef {
  return categories.find((c) => c.id === id) ?? UNKNOWN_CATEGORY;
}

// Resolve a (possibly sub-) category to its main category — totals, budgets
// and charts aggregate at the main level; subs are the drill-down detail.
export function getMainCategory(categories: FinanceCategoryDef[], id: string): FinanceCategoryDef {
  const cat = categories.find((c) => c.id === id);
  if (!cat) return UNKNOWN_CATEGORY;
  if (!cat.parentId) return cat;
  return categories.find((c) => c.id === cat.parentId) ?? cat;
}

export function getSubCategories(categories: FinanceCategoryDef[], mainId: string): FinanceCategoryDef[] {
  return categories.filter((c) => c.parentId === mainId);
}

// Effective monthly cap of a budget: %-of-income when pct is set (and an
// income exists), the fixed limit otherwise.
export function budgetLimit(b: Budget, monthlyIncome: number | null): number {
  if (b.pct && monthlyIncome) return (monthlyIncome * b.pct) / 100;
  return b.limit ?? 0;
}

// Live budget check for a category (rolls up to its main): returns a warning
// once this month's spend hits 80% of the cap, or null. Used to alert the
// moment an expense is added, not just passively on the dashboard.
export function budgetWarningFor(
  categoryId: string,
  budgets: Budget[],
  transactions: Transaction[],
  categories: FinanceCategoryDef[],
  monthlyIncome: number | null
): { label: string; over: boolean; pct: number; remaining: number } | null {
  const mainId = getMainCategory(categories, categoryId).id;
  const b = budgets.find((x) => x.category === mainId);
  if (!b) return null;
  const cap = budgetLimit(b, monthlyIncome);
  if (!cap) return null;
  const monthPrefix = today().slice(0, 7);
  const spent = transactions
    .filter((t) => t.date.startsWith(monthPrefix) && getMainCategory(categories, t.category).id === mainId)
    .reduce((s, t) => s + t.amount, 0);
  const pct = (spent / cap) * 100;
  if (pct < 80) return null;
  const info = categories.find((c) => c.id === mainId);
  return { label: info?.label ?? "قسم", over: spent > cap, pct: Math.round(pct), remaining: cap - spent };
}

// ===================== Reserve funds & split spending =====================

// Share of a transaction charged to the daily budget (the remainder after
// any reserve splits). A transaction with no splits is 100% daily.
export function dailyShare(t: Transaction): number {
  if (!t.reserveSplits?.length) return t.amount;
  const reservedPct = Math.min(100, t.reserveSplits.reduce((s, sp) => s + sp.pct, 0));
  return round2((t.amount * (100 - reservedPct)) / 100);
}

// Share of a transaction charged to one specific reserve fund.
export function reserveShare(t: Transaction, fundId: string): number {
  const split = t.reserveSplits?.find((s) => s.fundId === fundId);
  return split ? round2((t.amount * split.pct) / 100) : 0;
}

// Live balance of a fund: deposits in, charged transaction shares out.
export function reserveBalance(fund: ReserveFund, transactions: Transaction[]): number {
  const deposited = fund.deposits.reduce((s, d) => s + d.amount, 0);
  const spent = transactions.reduce((s, t) => s + reserveShare(t, fund.id), 0);
  return deposited - spent;
}

// Total spent from a fund (for progress displays).
export function reserveSpent(fund: ReserveFund, transactions: Transaction[]): number {
  return transactions.reduce((s, t) => s + reserveShare(t, fund.id), 0);
}

export interface DailyBudgetStatus {
  days: number; // days since (and including) startDate, through today
  allowance: number; // effective allowance: amount * days − carryAdjust
  spent: number; // sum of daily-budget shares since startDate
  carryAdjust: number; // amount already settled by a sweep on the start day
  balance: number; // allowance - spent (negative = over)
}

// Cumulative daily allowance: every day since `startDate` contributes
// `amount`, and every transaction since then eats into the running total —
// a surplus day cushions a rough one later on. Only the daily-budget share
// counts: a portion split onto a reserve fund is that fund's business, not
// the daily allowance's.
export function computeDailyBudgetStatus(
  dailyBudget: { amount: number; startDate: string; carryAdjust?: number },
  transactions: Transaction[]
): DailyBudgetStatus {
  const todayStr = today();
  // startDate in the future (legacy cycles reset to tomorrow) → zero days,
  // zero allowance. Newer sweeps start today and use carryAdjust instead so
  // same-day-after expenses still count (see the sweep actions in store.ts).
  const days = Math.max(
    0,
    Math.round((parseDate(todayStr).getTime() - parseDate(dailyBudget.startDate).getTime()) / (24 * 3600 * 1000)) + 1
  );
  const carryAdjust = dailyBudget.carryAdjust ?? 0;
  // Fold carryAdjust into the effective allowance so the whole app (balance,
  // display, discipline ratio) stays internally consistent.
  const allowance = round2(dailyBudget.amount * days - carryAdjust);
  const spent = round2(
    transactions
      .filter((t) => t.date >= dailyBudget.startDate && t.date <= todayStr)
      .reduce((s, t) => s + dailyShare(t), 0)
  );
  return { days, allowance, spent, carryAdjust, balance: round2(allowance - spent) };
}

// Compute the most recent date this recurring item was/is due, on or before
// `now`. The interval's phase is anchored to `anchorDate` so "every N months/
// weeks" (not just a fixed 1/12) lines up on a consistent cadence.
export function mostRecentDueDate(r: RecurringTransaction, now: Date): Date {
  const every = Math.max(1, Math.floor(r.every) || 1);
  const anchor = parseDate(r.anchorDate || today());

  if (r.unit === "أسبوعي") {
    // dayOfMonth reused as weekday 0-6
    const target = ((r.dayOfMonth % 7) + 7) % 7;
    const due = new Date(now);
    due.setDate(now.getDate() - ((now.getDay() - target + 7) % 7));

    const anchorDue = new Date(anchor);
    anchorDue.setDate(anchor.getDate() - ((anchor.getDay() - target + 7) % 7));

    const weeksBetween = Math.round((due.getTime() - anchorDue.getTime()) / (7 * 24 * 3600 * 1000));
    const remainder = ((weeksBetween % every) + every) % every;
    if (remainder !== 0) due.setDate(due.getDate() - remainder * 7);
    return due < anchorDue ? anchorDue : due;
  }

  // شهري (and anything else) — monthly-based cadence
  const day = Math.min(Math.max(r.dayOfMonth, 1), 28);
  const anchorMonthIndex = anchor.getFullYear() * 12 + anchor.getMonth();
  const nowMonthIndex = now.getFullYear() * 12 + now.getMonth();
  let k = Math.floor((nowMonthIndex - anchorMonthIndex) / every);
  let dueMonthIndex = anchorMonthIndex + k * every;
  let due = new Date(Math.floor(dueMonthIndex / 12), ((dueMonthIndex % 12) + 12) % 12, day);
  if (due > now) {
    k -= 1;
    dueMonthIndex = anchorMonthIndex + k * every;
    due = new Date(Math.floor(dueMonthIndex / 12), ((dueMonthIndex % 12) + 12) % 12, day);
  }
  return due < anchor ? new Date(anchor.getFullYear(), anchor.getMonth(), day) : due;
}

// The next occurrence strictly after `now` — one interval past the most
// recent due date.
export function nextDueDate(r: RecurringTransaction, now: Date): Date {
  const recent = mostRecentDueDate(r, now);
  const every = Math.max(1, Math.floor(r.every) || 1);
  if (r.unit === "أسبوعي") {
    const next = new Date(recent);
    next.setDate(recent.getDate() + every * 7);
    return next;
  }
  const monthIndex = recent.getFullYear() * 12 + recent.getMonth() + every;
  return new Date(Math.floor(monthIndex / 12), ((monthIndex % 12) + 12) % 12, recent.getDate());
}

// اليوم «المكتمل» = مذكرة + قراءة. المالية خارج السلسلة عمداً:
// الصرف مهب شرط كل يوم، فلا يُحاسب عليه العدّاد.
export function getDailyCompletionDates(
  journalEntries: JournalEntry[],
  readingLogs: ReadingLog[]
): string[] {
  const jDates = new Set(journalEntries.map((e) => e.date));
  const rDates = new Set(readingLogs.map((l) => l.date));
  return [...jDates].filter((d) => rDates.has(d));
}

export function getMonthDates(year: number, month: number): string[] {
  const dates: string[] = [];
  const d = new Date(year, month, 1);
  while (d.getMonth() === month) {
    dates.push(toDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

// ===================== Prayers =====================

export function getPrayerLog(logs: PrayerLog[], date: string): PrayerLog | undefined {
  return logs.find((l) => l.date === date);
}

// Counts for a single day: how many of the 5 prayers were prayed at all,
// and how many of those were prayed in congregation (at the mosque).
export function countDayPrayers(log: PrayerLog | undefined): { prayed: number; mosque: number } {
  if (!log) return { prayed: 0, mosque: 0 };
  let prayed = 0;
  let mosque = 0;
  for (const p of PRAYERS) {
    const status = log.prayers[p];
    if (status === "منفردة" || status === "جماعة") prayed++;
    if (status === "جماعة") mosque++;
  }
  return { prayed, mosque };
}

// Consecutive-day streak of days where all 5 prayers were performed
// (in the mosque or alone — either counts).
export function getPrayerStreak(logs: PrayerLog[]): number {
  const fullDays = logs
    .filter((l) => PRAYERS.every((p) => l.prayers[p] === "منفردة" || l.prayers[p] === "جماعة"))
    .map((l) => l.date);
  return calcStreak(fullDays);
}

// Consecutive-day streak of days where all 5 prayers were performed at the mosque.
export function getMosqueStreak(logs: PrayerLog[]): number {
  const fullMosqueDays = logs
    .filter((l) => PRAYERS.every((p) => l.prayers[p] === "جماعة"))
    .map((l) => l.date);
  return calcStreak(fullMosqueDays);
}

// Per-prayer completion rate (0-1) across all logged days — used to find
// which of the five prayers a person is most/least consistent with.
export function prayerConsistency(logs: PrayerLog[]): Record<PrayerName, number> {
  const result = {} as Record<PrayerName, number>;
  const total = logs.length || 1;
  for (const p of PRAYERS) {
    const done = logs.filter((l) => l.prayers[p] === "منفردة" || l.prayers[p] === "جماعة").length;
    result[p] = done / total;
  }
  return result;
}

export function arabicMonthName(month: number): string {
  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
  ];
  return months[month];
}
