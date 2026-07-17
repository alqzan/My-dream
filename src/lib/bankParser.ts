import type { Transaction, FinanceCategoryDef } from "./types";
import { uid, today } from "./utils";

// ========== Smart Categorization ==========
// Maps to the seeded default category ids (src/lib/types.ts). If the user
// has since renamed or deleted one of these, the transaction just falls
// back to "غير مصنف" via getCategoryInfo — it's never lost.
//
// Philosophy (the owner's rule): the line is "قوت أم تجربة؟". Buying
// sustenance = أساسي; paying for an outing/experience = كمالي. So groceries,
// rent, fuel, health, education are essentials, while eating out, cafes,
// travel and subscriptions are luxuries.
const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ["سوبرماركت", "هايبر", "بقاله", "بقالة", "تموينات", "بنده", "الدانوب", "لولو", "كارفور", "عثمان", "عبدالله العثيم", "أسواق", "التميمي", "المزرعة", "نستو"], category: "cat-essentials" },
  { keywords: ["إيجار", "ايجار", "rent"], category: "cat-essentials" },
  { keywords: ["وقود", "بنزين", "أرامكو", "محطة", "ساسكو", "fuel", "petrol"], category: "cat-essentials" },
  { keywords: ["فاتورة", "كهرباء", "ماء", "مياه", "الكهرباء", "utility"], category: "cat-essentials" },
  { keywords: ["مستشفى", "عيادة", "صيدلية", "النهدي", "الدواء", "دواء", "طبي", "hospital", "clinic", "pharmacy"], category: "cat-essentials" },
  { keywords: ["جامعة", "مدرسة", "دورة", "كورس", "تعليم", "udemy", "coursera"], category: "cat-essentials" },
  // Eating out & cafes → luxuries (an experience, not sustenance).
  { keywords: ["مطعم", "برغر", "برجر", "كنتاكي", "ماكدونالدز", "هرفي", "البيك", "ستاربكس", "بارنز", "دانكن", "كافيه", "مقهى", "قهوة", "pizza", "بيتزا", "كبسه", "مندي", "سشي", "شاورما", "restaurant", "resturant", "cafe", "coffee", "burger", "grill", "kitchen", "food"], category: "cat-luxuries" },
  { keywords: ["فندق", "طيران", "سفر", "رحلة", "hotel", "flight", "saudia", "flynas", "flyadeal", "booking", "بوكينج"], category: "cat-luxuries" },
  { keywords: ["نتفليكس", "شاهد", "يوتيوب", "سبوتيفاي", "netflix", "spotify", "stc", "موبايلي", "زين", "الاتصالات", "ألعاب", "playstation", "بلايستيشن"], category: "cat-luxuries" },
  { keywords: ["أوبر", "كريم", "تاكسي", "uber", "careem"], category: "cat-luxuries" },
  { keywords: ["تبرع", "صدقة", "زكاة", "خيري", "جمعية", "donation", "charity"], category: "cat-charity" },
  { keywords: ["ادخار", "توفير", "saving", "استثمار", "صندوق", "أسهم", "تداول", "invest"], category: "cat-investment" },
];

// Built-in keyword guess (main category). Falls back to essentials.
function keywordCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
  }
  return "cat-essentials";
}

// Normalize a merchant/note into a stable key: drop digits & punctuation,
// collapse spaces. "ستاربكس #١٢٣  الرياض" and "ستاربكس الرياض" map alike.
export function normalizeMerchant(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[0-9٠-٩]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

// A previously-learned category for this merchant, or null. Exact merchant
// match wins, then a contained-name match. A rule pointing at a since-deleted
// category is ignored. This is what powers "the app already knows this one".
export function learnedCategory(
  text: string,
  categories: FinanceCategoryDef[],
  merchantRules: Record<string, string> | undefined
): string | null {
  const exists = (id: string) => categories.some((c) => c.id === id);
  const key = normalizeMerchant(text);
  if (!key || !merchantRules) return null;
  if (merchantRules[key] && exists(merchantRules[key])) return merchantRules[key];
  for (const [rk, cid] of Object.entries(merchantRules)) {
    if (rk && cid && exists(cid) && (key.includes(rk) || rk.includes(key))) return cid;
  }
  return null;
}

// Does this parsed expense look like one that's already recorded? Same day,
// same amount, and the same merchant (normalized). Guards against a message
// arriving twice or an expense that was also added by hand.
export function isLikelyDuplicate(
  amount: number,
  date: string,
  note: string,
  existing: { amount: number; date: string; note?: string }[]
): boolean {
  const key = normalizeMerchant(note);
  return existing.some(
    (t) =>
      t.date === date &&
      Math.abs(t.amount - amount) < 0.01 &&
      (key ? normalizeMerchant(t.note ?? "") === key : true)
  );
}

// The smart suggestion: your own learned rules win, otherwise the built-in
// keyword guess.
export function suggestCategory(
  text: string,
  categories: FinanceCategoryDef[],
  merchantRules: Record<string, string> | undefined
): string {
  return learnedCategory(text, categories, merchantRules) ?? keywordCategory(text);
}

// ========== SMS Parser ==========
// Supports Al Rajhi, SNB, Riyad Bank, Al Ahli, Al Bilad, Al Inma and the
// newer "شراء ... بـSR 22 ... لـMerchant ... رصيد:.." Apple-Pay style.

export interface SmsParseResult {
  amount: number;
  category: string;
  note: string;
  date: string;
}

// Currency tokens seen across Saudi banks: ريال / ر.س / SR / SAR.
const CUR = "SR|SAR|ر\\.?\\s?س|ريال";

// Saudi banks sometimes send Arabic-Indic digits (٧٢٠٫٣٦). Fold them to Latin
// so amounts and dates parse regardless of the numeral system.
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

// Messages that are never a transaction, whatever else they say: one-time
// passwords and declined/failed operations.
const NON_TRANSACTION = [
  /رمز التحقق|الرمز السري|كلمة (?:المرور|السر)|\bOTP\b|verification code/i,
  /مرفوضة|تم رفض|رفضت|فشلت|لم تتم|غير ناجحة|رصيد غير كاف|declined|failed|insufficient/i,
];

// Statement / bill-reminder vocabulary — skipped unless the message also
// reports a completed payment ("تم سداد المبلغ المستحق...").
const STATEMENT = [
  /المبلغ (?:ال[إا]جمالي )?المستحق|[إا]جمالي المستحق|مبلغ مستحق/i,
  /الحد الأدنى (?:للسداد|المستحق)|minimum (?:amount )?due/i,
  /تاريخ الاستحقاق|due date/i,
  /كشف (?:ال)?حساب/i,
];
const COMPLETED_OP = /تم(?:ت)?\s+(?:عملية\s+)?(?:ال)?(?:سداد|دفع|خصم|شراء|تحويل|إيداع)/i;

// A live point-of-sale / Apple-Pay / mada purchase alert. Credit-card purchase
// notifications ALSO quote "المبلغ الإجمالي المستحق" (total due) and "الرصيد
// المتوفر" as context — which used to trip the statement/balance heuristics and
// make the whole (real) purchase get discarded. A clear purchase signal
// overrides those, so a genuine POS purchase is never mistaken for a bill.
const PURCHASE_SIGNAL = /نقاط البيع|عملية شراء|شراء عبر|شراء بـ?|point of sale|\bpos\b|purchase|apple\s?pay|mada/i;

// An actual money-movement keyword — tells a real transaction from a bare
// balance notification ("الرصيد المتاح: 4279 ريال").
const TXN_KEYWORD =
  /شراء|خصم|سحب|دفع|سداد|إيداع|ايداع|تحويل|حوالة|استرداد|purchase|\bpos\b|transfer|refund|withdraw|deposit/i;
const BALANCE_ONLY = /الرصيد|رصيدك|رصيد الحساب|available balance|\bbalance\b/i;

// True when a message carries no real money movement and should be dropped
// before parsing: OTPs, declines, statement reminders, balance-only alerts.
function isNonTransaction(text: string): boolean {
  if (NON_TRANSACTION.some((p) => p.test(text))) return true;
  // A statement/bill reminder — but NOT when the message is a completed
  // operation or a live purchase/POS alert that merely cites the amount due.
  if (
    STATEMENT.some((p) => p.test(text)) &&
    !COMPLETED_OP.test(text) &&
    !PURCHASE_SIGNAL.test(text)
  )
    return true;
  if (BALANCE_ONLY.test(text) && !TXN_KEYWORD.test(text)) return true;
  return false;
}

const CREDIT_RE = /(?:إيداع|راتب|حوّل إليك|حُوّل إليك|تم استلام|أضيف|credit)/i;

// A message that parsed to no expense but is nonetheless just *noise* —
// an OTP, a decline, a statement/bill reminder, a bare balance alert, or an
// incoming credit (income). These are safe to drop silently. Anything else
// that failed to parse might be a real expense in a format we didn't catch, so
// the inbox must surface it for manual review instead of deleting it.
export function isNoiseMessage(smsText: string): boolean {
  const text = normalizeDigits((smsText || "").trim());
  if (!text) return true;
  if (isNonTransaction(text)) return true;
  if (CREDIT_RE.test(text)) return true;
  return false;
}

// Returns null both when no amount could be read AND when the message looks
// like an incoming deposit (income) — this tracker is expense-only, so
// credits are silently skipped rather than logged as spending.
export function parseBankSms(smsText: string, date: string): SmsParseResult | null {
  const text = normalizeDigits(smsText.trim());
  // Drop OTPs, declines, statement reminders and balance-only alerts so they
  // never turn into bogus transactions.
  if (isNonTransaction(text)) return null;
  const isCredit = /(?:إيداع|راتب|حوّل إليك|حُوّل إليك|تم استلام|أضيف|credit)/i.test(text);
  if (isCredit) return null;

  // Drop the running-balance and any "total due" figures first, so neither is
  // mistaken for the spend amount. A credit-card purchase alert quotes both the
  // available balance ("الرصيد المتوفر: SAR 2673.04") and the outstanding total
  // ("المبلغ الإجمالي المستحق SAR 2326.96") alongside the real purchase amount —
  // an optional descriptor word (المتوفر/المتاح/الحالي…) may sit between the
  // keyword and the number, and the currency may lead or trail it.
  const numTail = `\\s*[:\\-]?\\s*(?:${CUR})?\\s*[\\d.,]+\\s*(?:${CUR})?`;
  const body = text
    .replace(new RegExp(`(?:رصيد|الرصيد|المتبقّ?ي|available|balance)(?:\\s+\\S+)?${numTail}`, "gi"), " ")
    .replace(new RegExp(`(?:المبلغ (?:ال[إا]جمالي )?المستحق|[إا]جمالي المستحق|مبلغ مستحق|رسوم العملية)${numTail}`, "gi"), " ");

  let amount = 0;
  // Amount with the currency on either side (SR 22 · 22 ريال · 150.00 SAR),
  // else a bare number right after a purchase keyword.
  const m =
    body.match(new RegExp(`(?:${CUR})\\s*(\\d[\\d,]*\\.?\\d*)`, "i")) ||
    body.match(new RegExp(`(\\d[\\d,]*\\.?\\d*)\\s*(?:${CUR})`, "i")) ||
    body.match(/(?:شراء|خصم|سحب|دفع|purchase)\D*?(\d[\d,]*\.?\d*)/i);
  if (m) amount = parseFloat((m[1] ?? "").replace(/,/g, ""));
  if (!amount) return null;

  // Merchant markers point at either the payee ("لـ"/"لدى"/"at"/"@") or the
  // funding SOURCE ("من {account}"). A mada/Apple-Pay alert lists both — e.g.
  // "من9004" (source account) before "لـEHSAN" (the real merchant) — so taking
  // the first marker grabbed the account number. Collect EVERY marker, strip a
  // trailing currency as before, and reject empty or pure number/punctuation
  // values (an account number is never a merchant name). Prefer a payee marker;
  // fall back to "من" only when it names a real (lettered) merchant, so a bank
  // that legitimately writes "من ستاربكس" still resolves correctly.
  let merchant = "";
  let fromMerchant = "";
  const stripCur = (v: string) => v.replace(new RegExp(`\\b(?:${CUR})\\b.*$`, "i"), "").trim();
  for (const mk of body.matchAll(/(لدى|لـ|من|at|@)\s*([^\n\r,،.؛;]+)/gi)) {
    const value = stripCur(mk[2]);
    if (!/\p{L}/u.test(value)) continue; // empty or purely numeric/punctuation
    if (mk[1] === "من") {
      if (!fromMerchant) fromMerchant = value;
    } else if (!merchant) {
      merchant = value;
    }
  }
  merchant = merchant || fromMerchant;

  return {
    amount,
    category: keywordCategory(text + " " + merchant),
    note: merchant || body.replace(/\s+/g, " ").trim().slice(0, 60),
    date: extractSmsDate(text) ?? date,
  };
}

// Pull a Gregorian date out of a message if present (dd/mm/yyyy, yyyy-mm-dd,
// dd-mm-yyyy). Hijri/unknown formats fall back to the caller's default.
function extractSmsDate(text: string): string | null {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // dd/mm/yy (or dd-mm-yy): a 2-digit year, as mada alerts send ("16/7/26").
  // Interpret yy as 20yy (26 → 2026). The trailing (?!\d) guard keeps this from
  // biting off the first two digits of a 4-digit year (that case already
  // returned above).
  const dmy2 = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?!\d)/);
  if (dmy2) {
    const [, d, m, y] = dmy2;
    return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

// Parse a blob containing many bank SMS pasted together. Splits into
// individual messages and parses each, so the user copies everything at
// once instead of one message at a time.
export function parseBankSmsBulk(
  blob: string,
  defaultDate: string
): { transactions: SmsParseResult[]; skippedIncome: number } {
  const text = blob.trim();
  if (!text) return { transactions: [], skippedIncome: 0 };

  // First try splitting on blank lines (typical when copying several SMS).
  let chunks = text.split(/\n\s*\n+/).map((c) => c.trim()).filter(Boolean);
  // No blank lines: a line only starts a new message when it carries its own
  // operation/alert keyword. Otherwise this is one multi-line SMS (e.g. Al
  // Rajhi's field-per-line format) and splitting it would turn its amount and
  // balance lines into bogus separate transactions — so keep it whole.
  //
  // NEVER sub-split a blob that, taken whole, is already a non-transaction (a
  // decline/failure, OTP, statement or balance-only alert). A declined purchase
  // quotes the very fields a real one does ("العملية: شراء" / "المبلغ: SAR
  // 100.73") with its reason on a separate line ("تم رفض العملية: الرصيد غير
  // كافٍ"); carving it into chunks orphans that reason and lets the
  // amount-bearing chunk record as a real expense. Keeping it whole lets
  // parseBankSms see the decline signal and drop the message (returns null).
  if (chunks.length <= 1 && !isNonTransaction(text)) {
    const lines = text.split(/\r?\n/).map((c) => c.trim()).filter(Boolean);
    const startsChunk = (l: string) =>
      TXN_KEYWORD.test(l) ||
      NON_TRANSACTION.some((p) => p.test(l)) ||
      STATEMENT.some((p) => p.test(l)) ||
      BALANCE_ONLY.test(l);
    if (lines.filter(startsChunk).length > 1) {
      const grouped: string[] = [];
      for (const line of lines) {
        if (startsChunk(line) || grouped.length === 0) grouped.push(line);
        else grouped[grouped.length - 1] += "\n" + line;
      }
      chunks = grouped;
    }
  }

  const isCreditRe = /(?:إيداع|راتب|حُوّل إليك|تم استلام|credit)/i;
  const results: SmsParseResult[] = [];
  let skippedIncome = 0;
  for (const chunk of chunks) {
    const parsed = parseBankSms(chunk, defaultDate);
    if (parsed) results.push(parsed);
    else if (isCreditRe.test(chunk)) skippedIncome++;
  }
  return { transactions: results, skippedIncome };
}

// ========== CSV Bank Statement Parser ==========
interface CsvRow {
  date: string;
  description: string;
  debit: number;
  credit: number;
}

function parseDate(raw: string): string {
  // Handle formats: DD/MM/YYYY, YYYY-MM-DD, DD-MM-YYYY
  const cleaned = raw.trim();
  const parts = cleaned.split(/[\/\-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) return cleaned; // already YYYY-MM-DD
    const [d, m, y] = parts;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return today();
}

function parseAmount(raw: string): number {
  return parseFloat(normalizeDigits(raw).replace(/[,،\s]/g, "")) || 0;
}

export function parseBankCsv(csvText: string): { transactions: Transaction[]; skippedIncome: number } {
  const lines = csvText.trim().split(/\r?\n/);
  if (lines.length < 2) return { transactions: [], skippedIncome: 0 };

  // Detect header
  const header = lines[0].toLowerCase();
  const cols = header.split(/,|\t/);

  const idx = {
    date: cols.findIndex((c) => /date|تاريخ/.test(c)),
    desc: cols.findIndex((c) => /desc|بيان|detail|narrat|وصف/.test(c)),
    debit: cols.findIndex((c) => /debit|سحب|خصم|مدين/.test(c)),
    credit: cols.findIndex((c) => /credit|إيداع|دائن/.test(c)),
    amount: cols.findIndex((c) => /amount|مبلغ/.test(c)),
    type: cols.findIndex((c) => /type|نوع/.test(c)),
  };

  const transactions: Transaction[] = [];
  let skippedIncome = 0;

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(/,|\t/);
    if (row.length < 2) continue;

    const rawDate = idx.date >= 0 ? row[idx.date] : row[0];
    const desc = idx.desc >= 0 ? row[idx.desc] : row[1] ?? "";
    const debit = idx.debit >= 0 ? parseAmount(row[idx.debit]) : 0;
    const credit = idx.credit >= 0 ? parseAmount(row[idx.credit]) : 0;
    const amount = idx.amount >= 0 ? parseAmount(row[idx.amount]) : debit || credit;

    if (!amount) continue;

    // Expense-only tracker: skip incoming deposits/credits entirely.
    const isIncome = credit > 0 && debit === 0;
    if (isIncome) { skippedIncome++; continue; }

    const date = parseDate(rawDate);
    const descText = desc.replace(/"/g, "").trim();

    transactions.push({
      id: uid(),
      date,
      amount,
      category: keywordCategory(descText),
      note: descText.slice(0, 80),
    });
  }

  return { transactions, skippedIncome };
}
