import type { Transaction, FinanceCategory } from "./types";
import { uid } from "./utils";

// ========== Smart Categorization ==========
const CATEGORY_KEYWORDS: { keywords: string[]; category: FinanceCategory }[] = [
  { keywords: ["سوبرماركت", "هايبر", "بنده", "الدانوب", "لولو", "نون", "أمازون", "جرير", "كارفور", "عثمان", "عبدالله العثيم", "أسواق", "ساكو"], category: "طعام" },
  { keywords: ["مطعم", "برغر", "كنتاكي", "ماكدونالدز", "ستاربكس", "كافيه", "مقهى", "pizza", "كبسه", "مندي", "سشي", "resturant", "restaurant", "cafe", "coffee"], category: "طعام" },
  { keywords: ["إيجار", "ايجار", "rent"], category: "إيجار" },
  { keywords: ["وقود", "بنزين", "أرامكو", "محطة", "fuel", "petrol"], category: "مواصلات" },
  { keywords: ["أوبر", "كريم", "تاكسي", "uber", "careem"], category: "مواصلات" },
  { keywords: ["مستشفى", "عيادة", "صيدلية", "دواء", "طبي", "hospital", "clinic", "pharmacy"], category: "صحة" },
  { keywords: ["جامعة", "مدرسة", "دورة", "كورس", "تعليم", "udemy", "coursera"], category: "تعليم" },
  { keywords: ["فندق", "طيران", "سفر", "رحلة", "hotel", "flight", "saudia", "flynas", "flyadeal"], category: "سفر" },
  { keywords: ["نتفليكس", "شاهد", "يوتيوب", "سبوتيفاي", "netflix", "spotify", "stc", "موبايلي", "زين", "الاتصالات"], category: "كمالي" },
  { keywords: ["ادخار", "توفير", "saving"], category: "ادخار" },
  { keywords: ["استثمار", "صندوق", "أسهم", "تداول", "invest"], category: "استثمار" },
];

function autoCategory(text: string): FinanceCategory {
  const lower = text.toLowerCase();
  for (const { keywords, category } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
  }
  return "أخرى";
}

// ========== SMS Parser ==========
// Supports: Al Rajhi, SNB, Riyad Bank, Al Ahli, Al Bilad, Al Inma
const SMS_PATTERNS = [
  // Al Rajhi: "شراء بقيمة 150.00 ريال من ماكدونالدز"
  /(?:شراء|خصم|سحب|دفع).*?(\d[\d,.]+)\s*ريال.*?(?:من|في|لدى|@|at)?\s*([^\n\r.،,]+)/i,
  // "تم الخصم من حسابكم مبلغ 150.50 ريال"
  /(?:تم الخصم|تم السحب|خُصم).*?مبلغ\s*(\d[\d,.]+)\s*ريال(?:.*?(?:من|في|لدى)\s*([^\n\r.،,]+))?/i,
  // "Purchase of SAR 200.00 at AMAZON"
  /purchase[^S]*sar\s*(\d[\d,.]+)\s*(?:at|from)?\s*([^\n\r.]+)?/i,
  // Credit: "تم الإيداع في حسابكم مبلغ 5000 ريال"
  /(?:تم الإيداع|إيداع|دفع لحسابكم|راتب).*?(\d[\d,.]+)\s*ريال/i,
  // Generic amount extraction fallback
  /(\d[\d,.]+)\s*(?:ر\.س|ريال|sar)/i,
];

export interface SmsParseResult {
  amount: number;
  category: FinanceCategory;
  note: string;
  date: string;
}

// Returns null both when no amount could be read AND when the message looks
// like an incoming deposit (income) — this tracker is expense-only, so
// credits are silently skipped rather than logged as spending.
export function parseBankSms(smsText: string, date: string): SmsParseResult | null {
  const text = smsText.trim();
  const isCredit = /(?:إيداع|راتب|حُوّل إليك|تم استلام|credit)/i.test(text);
  if (isCredit) return null;

  let amount = 0;
  let merchant = "";

  for (const pattern of SMS_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const raw = m[1]?.replace(/,/g, "");
      amount = parseFloat(raw ?? "0");
      merchant = m[2]?.trim() ?? "";
      break;
    }
  }

  if (!amount) return null;

  return {
    amount,
    category: autoCategory(text + " " + merchant),
    note: merchant || text.slice(0, 60),
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
  return new Date().toISOString().split("T")[0];
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
      category: autoCategory(descText),
      note: descText.slice(0, 80),
    });
  }

  return { transactions, skippedIncome };
}
