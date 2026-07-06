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

// Returns null both when no amount could be read AND when the message looks
// like an incoming deposit (income) — this tracker is expense-only, so
// credits are silently skipped rather than logged as spending.
export function parseBankSms(smsText: string, date: string): SmsParseResult | null {
  const text = smsText.trim();
  const isCredit = /(?:إيداع|راتب|حوّل إليك|حُوّل إليك|تم استلام|أضيف|credit)/i.test(text);
  if (isCredit) return null;

  // Drop the running-balance figure first, so it's never mistaken for the
  // spend amount (e.g. "رصيد:3627.96 SR" or "Balance: 3,627.96").
  const body = text.replace(
    new RegExp(`(?:رصيد|الرصيد|المتبقّ?ي|available|balance)\\s*[:\\-]?\\s*[\\d.,]+\\s*(?:${CUR})?`, "gi"),
    " "
  );

  let amount = 0;
  // Amount with the currency on either side (SR 22 · 22 ريال · 150.00 SAR),
  // else a bare number right after a purchase keyword.
  const m =
    body.match(new RegExp(`(?:${CUR})\\s*(\\d[\\d,]*\\.?\\d*)`, "i")) ||
    body.match(new RegExp(`(\\d[\\d,]*\\.?\\d*)\\s*(?:${CUR})`, "i")) ||
    body.match(/(?:شراء|خصم|سحب|دفع|purchase)\D*?(\d[\d,]*\.?\d*)/i);
  if (m) amount = parseFloat((m[1] ?? "").replace(/,/g, ""));
  if (!amount) return null;

  // Merchant: "لـX" / "من X" / "لدى X" / "at X" / "@X".
  let merchant = "";
  const mm = body.match(/(?:لدى|لـ|من|at|@)\s*([^\n\r,،.؛;]+)/i);
  if (mm) merchant = mm[1].replace(new RegExp(`\\b(?:${CUR})\\b.*$`, "i"), "").trim();

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
  // If that didn't separate them, fall back to one message per line.
  if (chunks.length <= 1) {
    chunks = text.split(/\r?\n/).map((c) => c.trim()).filter(Boolean);
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
  return parseFloat(raw.replace(/[,،\s]/g, "")) || 0;
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
