import type { BalanceKind, FinanceCategoryDef, ObligationHint, RefundDestination, TxnDirection, TxnKind } from "./types";
import { isValidDateKey, parseDate, today, toDateStr } from "./utils";

interface CategoryKeywordRule {
  keywords: string[];
  category: string;
  // Labels are user-owned, so these are hints used to select an existing
  // child category without creating or renaming anything for the owner.
  subcategoryKeywords?: string[];
}

const CATEGORY_KEYWORDS: CategoryKeywordRule[] = [
  { keywords: ["سوبرماركت", "هايبر", "بقاله", "بقالة", "تموينات", "بنده", "الدانوب", "لولو", "كارفور", "عثمان", "عبدالله العثيم", "أسواق", "التميمي", "المزرعة", "نستو"], category: "cat-essentials", subcategoryKeywords: ["مقاضي", "بقاله", "بقالة", "غذاء", "سوبر", "تموين"] },
  { keywords: ["إيجار", "ايجار", "rent"], category: "cat-essentials", subcategoryKeywords: ["ايجار", "إيجار", "سكن", "منزل"] },
  { keywords: ["وقود", "بنزين", "أرامكو", "محطة", "ساسكو", "fuel", "petrol"], category: "cat-essentials", subcategoryKeywords: ["وقود", "بنزين", "سياره", "سيارة"] },
  { keywords: ["فاتورة", "كهرباء", "ماء", "مياه", "الكهرباء", "طاقة", "السعودية للطاقة", "utility"], category: "cat-essentials", subcategoryKeywords: ["فاتوره", "فاتورة", "اتصالات", "انترنت", "ماء", "كهرباء"] },
  { keywords: ["مستشفى", "عيادة", "صيدلية", "النهدي", "الدواء", "دواء", "طبي", "hospital", "clinic", "pharmacy"], category: "cat-essentials", subcategoryKeywords: ["صحه", "صحة", "طبي", "دواء", "صيدليه", "صيدلية"] },
  { keywords: ["جامعة", "مدرسة", "دورة", "كورس", "تعليم", "udemy", "coursera"], category: "cat-essentials", subcategoryKeywords: ["تعليم", "دراسه", "دراسة", "جامعة", "مدرسة"] },
  { keywords: ["ستاربكس", "starbucks", "بارنز", "barns", "دانكن", "dunkin", "كافيه", "مقهى", "قهوة", "cafe", "coffee"], category: "cat-luxuries", subcategoryKeywords: ["مقاهي", "مقهى", "قهوه", "قهوة", "كافيه", "coffee", "cafe"] },
  { keywords: ["مطعم", "برغر", "برجر", "كنتاكي", "ماكدونالدز", "هرفي", "herfy", "البيك", "albaik", "ستاربكس", "starbucks", "بارنز", "barns", "دانكن", "dunkin", "كافيه", "مقهى", "قهوة", "pizza", "بيتزا", "كبسه", "مندي", "سشي", "شاورما", "restaurant", "resturant", "cafe", "coffee", "burger", "grill", "kitchen", "food"], category: "cat-luxuries", subcategoryKeywords: ["مطاعم", "مطعم", "اكل", "أكل", "طعام", "وجبات", "برجر"] },
  { keywords: ["فندق", "طيران", "سفر", "رحلة", "hotel", "flight", "saudia", "flynas", "flyadeal", "booking", "بوكينج"], category: "cat-luxuries", subcategoryKeywords: ["سفر", "رحلات", "فندق", "طيران"] },
  { keywords: ["نتفليكس", "شاهد", "يوتيوب", "سبوتيفاي", "netflix", "spotify", "stc", "موبايلي", "زين", "الاتصالات", "ألعاب", "playstation", "بلايستيشن"], category: "cat-luxuries", subcategoryKeywords: ["ترفيه", "اشتراكات", "العاب", "ألعاب", "اتصالات"] },
  { keywords: ["أوبر", "كريم", "تاكسي", "uber", "careem"], category: "cat-luxuries", subcategoryKeywords: ["مواصلات", "نقل", "سياره", "سيارة"] },
  { keywords: ["تبرع", "صدقة", "زكاة", "خيري", "جمعية", "donation", "charity", "ehsan", "احسان"], category: "cat-charity" },
  { keywords: ["ادخار", "توفير", "saving", "استثمار", "صندوق", "أسهم", "تداول", "invest"], category: "cat-investment" },
];

function subcategoryForRule(text: string, categories: FinanceCategoryDef[], rule: CategoryKeywordRule): string | null {
  if (!rule.subcategoryKeywords?.length) return null;
  const children = categories.filter((category) => category.parentId === rule.category);
  if (!children.length) return null;
  const hints = rule.subcategoryKeywords.map((hint) => normalizeSmsText(hint)).filter(Boolean);
  const normalizedText = normalizeSmsText(text);
  // Prefer a child whose own label is present in the merchant/message. This
  // lets a user-created label such as «مطاعم سريعة» win over a broad hint.
  const explicit = children.find((child) => {
    const label = normalizeSmsText(child.label);
    return label.length > 1 && (normalizedText.includes(label) || label.includes(normalizedText));
  });
  if (explicit) return explicit.id;
  return children.find((child) => {
    const label = normalizeSmsText(child.label);
    return hints.some((hint) => label.includes(hint) || hint.includes(label));
  })?.id ?? null;
}

function keywordCategory(text: string, categories?: FinanceCategoryDef[]): string {
  const lower = normalizeSmsText(text);
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((keyword) => lower.includes(normalizeSmsText(keyword)))) {
      return (categories && subcategoryForRule(text, categories, rule)) ?? rule.category;
    }
  }
  return "cat-essentials";
}

export function normalizeSmsText(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ـ\u064B-\u065F]/g, "")
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .toLowerCase();
}

export function normalizeMerchant(text: string): string {
  return (text || "")
    .toLowerCase()
    .replace(/[0-9٠-٩]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export function learnedCategory(text: string, categories: FinanceCategoryDef[], merchantRules: Record<string, string> | undefined): string | null {
  const exists = (id: string) => categories.some((c) => c.id === id);
  const key = normalizeMerchant(text);
  if (!key || !merchantRules) return null;
  if (merchantRules[key] && exists(merchantRules[key])) return merchantRules[key];
  for (const [rk, cid] of Object.entries(merchantRules)) {
    const rule = normalizeMerchant(rk);
    if (rule && cid && exists(cid) && (key.startsWith(rule) || rule.startsWith(key))) return cid;
  }
  return null;
}

export function suggestCategory(text: string, categories: FinanceCategoryDef[], merchantRules: Record<string, string> | undefined): string {
  return learnedCategory(text, categories, merchantRules) ?? keywordCategory(text, categories);
}

export function isLikelyDuplicate(amount: number, date: string, note: string, existing: { amount: number; date: string; note?: string }[]): boolean {
  const key = normalizeMerchant(note);
  return existing.some((t) => t.date === date && Math.abs(t.amount - amount) < 0.01 && (key ? normalizeMerchant(t.note ?? "") === key : true));
}

export type SmsConfidence = "template" | "inferred" | "generic";
export interface SmsParseOptions {
  sender?: string;
  receivedAt?: string;
  sourceInboxId?: string;
  sourceId?: string;
  sourceIndex?: number;
  ownerWallets?: readonly string[];
}
export interface SmsParseResult {
  amount: number;
  expenseAmount?: number;
  fee?: number;
  kind: TxnKind;
  direction: TxnDirection;
  category: string;
  note: string;
  date: string;
  time?: string;
  bank?: string;
  account?: string;
  cardLast4?: string;
  accountId?: string;
  balanceAfter?: number;
  balanceKind?: BalanceKind;
  counterparty?: string;
  debtRemaining?: number;
  obligationHint?: ObligationHint;
  refundDestination?: RefundDestination;
  template?: string;
  confidence: SmsConfidence;
  eventId?: string;
  sourceKey?: string;
  sourceInboxId?: string;
  sourceReceivedAt?: string;
  suspectedDuplicate?: boolean;
  reviewReason?: string;
}
export interface SmsParseEventResult extends SmsParseResult { rawText: string; }

const CUR = "SR|SAR|ر\\.?\\s?س|ريال";
// Any figure quoted in one of these is not riyals, even when it sits right
// after a «مبلغ:» label. A receipt that never resolves a SAR figure elsewhere
// (e.g. a labelled «المبلغ بالريال») must not have its foreign figure read as
// the expense amount.
const FOREIGN_CUR = /\b(?:USD|EUR|GBP|AED|KWD|BHD|QAR|OMR|EGP|TRY|JPY|CNY|INR)\b|[$€£]|دولار|يورو|درهم/i;
function normalizeDigits(s: string): string { return s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/٫/g, ".").replace(/٬/g, ","); }
const OTP = /رمز\s*(?:التحقق|مؤقت|التفعيل|التوثيق|شراء\s*(?:اونلاين|أونلاين)|الشراء)|رمز\s*[:：]|الرمز\s*السري|كلمة\s+(?:المرور|السر)|كلمة\s+مرور\s+ل(?:مرة|مره)\s+واحدة|(?:ننصح\s+بعدم\s+مشاركة|لا\s+تشارك(?:وا)?)\s+الرمز|one\s*time\s+password|do\s+not\s+share\s+this\s+otp|\bOTP\b|verification\s+code/i;
const DECLINED = /مرفوض|تم\s+رفض|رفضت|فشل|لم\s+تتم|غير\s+ناجح|رصيد\s+غير\s+كاف|غير\s+كافي|declined|failed|insufficient/i;
const HOLD = /just\s+a\s+hold|hold\s+on\s+your\s+card|حجز\s+مؤقت|حجز\s+على\s+بطاقتك|معلقة|قيد\s+الانتظار|pending\b|pre[\s-]?authoriz/i;
const CANCELLED_OR_REVERSED = /تم\s+إلغاء|إلغاء\s+(?:عملية|الشراء)|ملغا(?:ة|ه)|cancelled|canceled|reversed/i;
const STATEMENT = /(?:المبلغ\s+(?:ال[إا]جمالي\s+)?المستحق|[إا]جمالي\s+المستحق|مبلغ\s+مستحق|الحد\s+الأدنى\s+(?:للسداد|المستحق)|minimum\s+(?:amount\s+)?due|تاريخ\s+الاستحقاق|due\s+date|كشف\s+(?:ال)?حساب|إصدار\s+كشف|اصدار\s+كشف|تذكير\s+سداد\s+البطاقة)/i;
// A payment-network name is evidence about the instrument, not evidence that
// money left the account.  Keep purchase detection tied to an operation
// phrase; otherwise a card-information/Apple Pay notice becomes a purchase
// merely because it mentions "mada" or "purchase" in an informational line.
const PURCHASE = /نقاط\s+البيع|عملية\s+شراء|شراء\s+(?:عبر|انترنت|أونلاين|اونلاين|دولي|ب(?:ـ|\s|$))|point\s+of\s+sale|\bpos\b|purchase(?:\s+transaction)?/i;
const ATM = /سحب\s+(?:نقدي|من\s+الصراف|صراف(?:\s+آلي)?|نقد)|cash\s+withdrawal|\batm\b/i;
const BILL = /سداد\s+فاتورة|مفوتر\s*[:：]|فاتورة\s+(?:كهرباء|ماء|اتصالات)|utility\s+bill/i;
const BILL_NOTICE = /صدور\s+فاتورة|فاتورة\s+جديدة|لم\s+يتم\s+سدادها|فاتورة\s+شاملة|invoice\s+(?:generated|due)|new\s+bill/i;
const CARD_SETTLE = /سداد|تسديد|تم\s+سداد|card\s+payment|credit\s+card\s+payment/i;
const CARD_EVIDENCE = /(?:البطاقة|بطاقة)\s*(?:ال)?(?:ائتمانية|ائتماني|فيزا|visa|ماستر|mastercard)|credit\s+card|\bvisa\b|\bmastercard\b/i;
const BNPL = /تمارا|تابي|اشتر\s*الان\s*ادفع\s*لاحقا|tamara|tabby|buy\s*now\s*pay\s*later/i;
const INVESTMENT_PROVIDER_NOTICE = /سداد\s+مبكر|منصة\s+الدين|معرف\s+(?:الفرصة|الاستثمار)|investment\s+opportunity|early\s+repayment/i;
const INCOMING = /حوالة\s+(?:واردة|داخلية\s+واردة|محلية\s+واردة)|استرداد\s+نقدي\s+إلى\s+المحفظة|استرداد\s+نقدي\s+للمحفظة|إيداع|ايداع|تم\s+إضافة|تم\s+اضافة|أضيف|اضيف|إضافة\s+أموال|اضافة\s+اموال|استلام\s+(?:قطة|مبلغ|حوالة)|تحويل\s+وارد|money\s+added|cash\s+deposit|credited\s+to/i;
const OUTGOING_TRANSFER = /حوالة\s+(?:داخلية|محلية)?\s*صادرة|حوالة\s+صادرة|تحويل\s+(?:داخلي|محلي)?\s*صادر|local\s+transfer\s+out|outgoing\s+transfer/i;
const ADD_FUNDS = /money\s*added|add(?:ed)?\s*funds|إضافة\s+(?:أموال|اموال)|اضافة\s+(?:أموال|اموال)|اضافة\s+باستخدام|top\s*up/i;
const SELF_TRANSFER = /حوالة\s+بين\s+(?:حساباتك|حساباتي)|تحويل\s+بين\s+(?:حساباتك|حساباتي)|تحويل\s+(?:الى|إلى)\s+(?:حسابك|حساب\s+(?:جاري|دراهم)|دراهم|المحفظة\s+الادخارية|حساباتك|حساباتي)|transfer\s+between\s+your\s+accounts|debit\s+transfer\s+internal/i;
const INSTALLMENT = /قسط\s+تمويل|خصم\s*:\s*قسط|المبلغ\s+المتبقي/i;
const MARKETING = /عزيزي\s+العميل|عميلنا\s+العزيز|صباح\s+الخير|هلا\s+|لحمايتك،?\s+حاولنا|تمت\s+اضافة\s+المستفيد|تم\s+تنشيط\s+المستفيد|تم\s+تسجيل\s+الدخول|تم\s+تسجيلك\s+بنجاح|اشعار\s*[:：]?\s*تم\s+تسجيل\s+جهاز\s+جديد|apple\s+wallet|مبروك|نقاط\s+قطاف|نقاط\s+عضوية|رصيد\s+قطاف|rewards|برنامج\s+اكثر|تحديث\s+رسوم\s+التعرفة|تم\s+منحكم\s+الخصم|خصم\s+خاص|بدون\s+عمولة|discount|commission|سم\s+نفسك\s+تاجر|ملتقى\s+ريادة|اليوم\s+الأخير/i;
const PROTECTION_INFO = /لحمايتك،?\s+حاولنا\s+التواصل|للتحقق\s+من\s+عملية|يرجى\s+مراجعة\s+التفاصيل\s+في\s+التطبيق/i;
const OUTGOING = /دفع(?:ة)?\s+(?:مبلغ|قطة|دفعة)|حوالة\s+(?:صادرة|خارجة)|تحويل\s+صادر|تحويل\s+الى\s*[:：]?/i;
const KNOWN_BANKS: Array<[string, RegExp]> = [
  ["rajhi", /الراجحي|مصرف\s+الراجحي|بنك\s+الراجحي|al\s*rajhi/i],
  ["bsf", /الفرنسي|البنك\s+السعودي\s+الفرنسي|السعودي\s+الفرنسي|bsf|fransi/i],
  ["snb", /الاهلي|الأهلي|السعودي\s+الاهلي|البنك\s+الأهلي|snb/i],
  ["inma", /الإنماء|الانماء|inma/i],
  ["sab", /\bsab\b|\bsaab\b|ساب|البنك\s+السعودي\s+البريطاني/i],
  ["barq", /برق|barq/i],
  ["stcbank", /stc\s*bank|stc\s*با?نك|بنك\s+stc|اس\s*تي\s*سي\s+بنك/i],
  ["riyad", /بنك\s+الرياض|riyad\s*bank/i],
];
const KNOWN_SENDERS: Array<[string, RegExp]> = [
  ...KNOWN_BANKS,
  ["tamara", /تمارا|tamara/i],
  ["tabby", /تابي|tabby/i],
  ["drahim", /دراهم|drahim/i],
  ["tiqmo", /tiqmo|تيقمو/i],
  ["d360", /d360|دي\s*360/i],
  ["tweeq", /tweeq|تويك/i],
];

const KNOWN_WALLET_ALIASES: Array<[string, string[]]> = [
  ["barq", ["barq", "برق"]],
  ["drahim", ["drahim", "دراهم"]],
  ["stcbank", ["stc bank", "stcbank", "stc بنك", "بنك stc"]],
  ["tiqmo", ["tiqmo", "تيقمو"]],
  ["d360", ["d360", "دي 360", "دي360"]],
  ["tweeq", ["tweeq", "تويك"]],
  ["urpay", ["urpay", "يورباي", "يو ار باي"]],
];

function walletKey(value: string | undefined): string {
  return normalizeSmsText(value ?? "").replace(/[^\p{L}\p{N}]/gu, "");
}

function knownWalletId(value: string | undefined): string | undefined {
  const actual = walletKey(value);
  if (actual.length < 3) return undefined;
  return KNOWN_WALLET_ALIASES.find(([, aliases]) => aliases.some((alias) => {
    const key = walletKey(alias);
    return key && (actual === key || actual.includes(key));
  }))?.[0];
}

function ownerWalletMatch(value: string | undefined, ownerWallets: readonly string[] | undefined): string | undefined {
  const actual = walletKey(value);
  if (actual.length < 3) return undefined;
  const known = knownWalletId(value);
  for (const wallet of ownerWallets ?? []) {
    const configured = walletKey(wallet);
    if (!configured || configured.length < 3) continue;
    if (actual === configured || actual.includes(configured) || configured.includes(actual)) return wallet;
    if (known && knownWalletId(wallet) === known) return wallet;
  }
  return undefined;
}

function senderEvidenceText(text: string): string {
  // Merchant/counterparty fields are not sender evidence. In particular,
  // `من Tamara` and `لدى: Tamara` must not turn a bank purchase into a BNPL
  // provider notice when the transport omitted its `from` value.
  return text
    .replace(/(?:^|[\s،,;؛])(?:لدى|مفوتر|لـ|من|at|merchant)\s*[:：]?\s*(?!مصرف|بنك|البنك|bank\b)[^\n\r،,;؛]+/giu, " ");
}

function inferBank(text: string, sender?: string): { bank?: string; confidence: SmsConfidence } {
  // The sender field is authoritative evidence for the institution. Search it
  // before message text so a merchant called Tamara, BSF, or Al Rajhi cannot
  // overwrite the actual SMS sender.
  const senderKnown = sender?.trim() ? KNOWN_SENDERS.find(([, re]) => re.test(sender)) : undefined;
  if (senderKnown) return { bank: senderKnown[0], confidence: "template" };
  // An unrecognized contact label or numeric sender is not evidence of the
  // bank and must not raise confidence. Fall back to safe body fields only.
  const known = KNOWN_BANKS.find(([, re]) => re.test(senderEvidenceText(text)));
  return known ? { bank: known[0], confidence: "inferred" } : { confidence: "generic" };
}
export function normalizeSourceText(text: string): string { return normalizeDigits(text || "").trim().replace(/\s+/g, " "); }
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
function rotr(value: number, bits: number): number { return (value >>> bits) | (value << (32 - bits)); }
function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const input = new Uint8Array(paddedLength); input.set(bytes); input[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  for (let i = 0; i < 8; i += 1) input[paddedLength - 1 - i] = Math.floor(bitLength / (2 ** (8 * i))) & 0xff;
  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  for (let offset = 0; offset < input.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i += 1) { const p = offset + i * 4; words[i] = ((input[p] << 24) | (input[p + 1] << 16) | (input[p + 2] << 8) | input[p + 3]) >>> 0; }
    for (let i = 16; i < 64; i += 1) { const s0 = rotr(words[i - 15], 7) ^ rotr(words[i - 15], 18) ^ (words[i - 15] >>> 3); const s1 = rotr(words[i - 2], 17) ^ rotr(words[i - 2], 19) ^ (words[i - 2] >>> 10); words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0; }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let hh = h7;
    for (let i = 0; i < 64; i += 1) { const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25); const ch = (e & f) ^ (~e & g); const t1 = (hh + s1 + ch + SHA256_K[i] + words[i]) >>> 0; const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22); const maj = (a & b) ^ (a & c) ^ (b & c); const t2 = (s0 + maj) >>> 0; hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0; }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + hh) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((part) => part.toString(16).padStart(8, "0")).join("");
}
export function sourceKeyFor(text: string): string { return sha256Hex(normalizeSourceText(text)); }
export function eventIdFor(sourceId: string, index: number): string { return `${sourceId}:${Math.max(0, Math.floor(index))}`; }
export function cashbackEffectId(eventId: string): string { return `${eventId}:cashback`; }
/** Create the source identity for one manual paste.  The caller must create it
 * once for the paste and reuse it when previewing/reviewing; the parser never
 * derives event identity from editable merchant or category fields. */
export function createSmsSourceId(): string {
  const randomUUID = globalThis.crypto?.randomUUID;
  const token = typeof randomUUID === "function"
    ? randomUUID.call(globalThis.crypto)
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `manual:${token}`;
}
function validDateOrNull(s: string | undefined): string | null { return s && isValidDateKey(s) ? s : null; }

export function extractSmsDate(text: string, reference: string): string | null {
  const normalized = normalizeDigits(text);
  const excludedDateStart = normalized.match(/(?:تاريخ\s+الاستحقاق|الاستحقاق|due\s+date|ابتداء(?:ً|ا)?\s+من|effective\s+from)[^\d]{0,50}\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}/i)?.index;
  const usable = (key: string, at: number): string | null => {
    const year = Number(key.slice(0, 4));
    // A due/effective date describes a future obligation or tariff, not the
    // date the notification was received. Ignore malformed year-0000 values
    // and dates attached to those labels.
    if (year < 1900 || !isValidDateKey(key)) return null;
    const prefix = normalized.slice(Math.max(0, at - 32), at);
    if (excludedDateStart !== undefined && at >= excludedDateStart) return null;
    if (/(?:تاريخ\s+الاستحقاق|الاستحقاق|due\s+date|ابتداء(?:ً|ا)?\s+من|effective\s+from)/i.test(prefix)) return null;
    return key;
  };
  let sawFourDigitDate = false;
  for (const iso of normalized.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    sawFourDigitDate = true;
    const key = usable(`${iso[1]}-${iso[2]}-${iso[3]}`, iso.index ?? 0); if (key) return key;
  }
  for (const dmy of normalized.matchAll(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/g)) {
    sawFourDigitDate = true;
    const [, d, m, y] = dmy; const key = usable(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`, dmy.index ?? 0); if (key) return key;
  }
  // Do not reinterpret the tail of an ignored YYYY-MM-DD value as a two-digit
  // year (for example 2026-09-25 -> 2026-09-25 again).
  if (sawFourDigitDate) return null;
  const dmy2 = normalized.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})(?!\d)/);
  if (!dmy2) return null;
  const [, a, m, b] = dmy2;
  const candidates: string[] = [];
  if (Number(a) >= 1 && Number(a) <= 31) { const key = `20${b}-${m.padStart(2, "0")}-${a.padStart(2, "0")}`; if (isValidDateKey(key)) candidates.push(key); }
  if (Number(b) >= 1 && Number(b) <= 31) { const key = `20${a.padStart(2, "0")}-${m.padStart(2, "0")}-${b.padStart(2, "0")}`; if (isValidDateKey(key)) candidates.push(key); }
  if (!candidates.length) return null;
  const ref = validDateOrNull(reference) ?? today();
  return candidates.reduce((closest, candidate) => Math.abs(parseDate(candidate).getTime() - parseDate(ref).getTime()) < Math.abs(parseDate(closest).getTime() - parseDate(ref).getTime()) ? candidate : closest);
}
function extractDateTime(text: string, reference: string): { date: string | null; time?: string } {
  const date = extractSmsDate(text, reference);
  const tm = text.match(/(?:\b|؜)(\d{1,2}):(\d{2})(?:\b|؜)/);
  return { date, time: tm ? `${tm[1].padStart(2, "0")}:${tm[2]}` : undefined };
}
function numberValue(value: string): number | undefined { const n = Number(normalizeDigits(value).replace(/,/g, "").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : undefined; }
function firstFieldAmount(text: string, labels: RegExp[]): number | undefined {
  for (const label of labels) {
    const re = new RegExp(`${label.source}[^\\n\\r]*`, `${label.flags.includes("i") ? "i" : ""}g`);
    for (const match of text.matchAll(re)) {
      let line = match[0];
      // The same SMS often contains the purchase amount, total due, balance,
      // and minimum payment — sometimes sharing one line in a compact,
      // single-line message. A broad `مبلغ` label must never select one of
      // the latter fields, so cut the line at the first such word instead of
      // discarding it outright: a real amount named earlier on that same
      // line is still read.
      if (!/(?:المتبقي|remaining)/i.test(label.source)) {
        const cut = line.search(/(?:الإجمالي|اجمالي|المستحق|الحد\s+الأدنى|الرصيد|المتبقي|due|balance|limit)/i);
        if (cut === 0) continue;
        if (cut > 0) line = line.slice(0, cut);
      }
      // A foreign-currency figure next to the label is not a reliable riyal
      // amount; keep looking (e.g. a later labelled «المبلغ بالريال») instead
      // of reading it as SAR.
      if (FOREIGN_CUR.test(line) && !new RegExp(CUR, "i").test(line)) continue;
      const sarParen = line.match(/\(([\d,]+(?:\.\d+)?)\s*(?:ريال|SAR|SR|ر\.?\s?س)\)/i);
      if (sarParen) return numberValue(sarParen[1]);
      const currencyAmount = firstCurrencyAmount(line);
      if (currencyAmount !== undefined) return currencyAmount;
      for (const raw of line.match(/[\d٠-٩][\d٠-٩,٬]*(?:[٫.]\d+)?/g) ?? []) { const n = numberValue(raw); if (n !== undefined && n > 0) return n; }
    }
  }
  return undefined;
}

function firstCurrencyAmount(text: string): number | undefined {
  const re = new RegExp(`(?:${CUR})\\s*([\\d,]+(?:\\.\\d+)?)|([\\d,]+(?:\\.\\d+)?)\\s*(?:${CUR})`, "gi");
  for (const match of text.matchAll(re)) {
    const at = match.index ?? 0;
    const lineStart = text.lastIndexOf("\n", at - 1) + 1;
    const lineEnd = text.indexOf("\n", at);
    const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd);
    const offset = at - lineStart;
    // A balance/total/minimum-due/limit figure often shares one line with the
    // real amount in a compact, single-line SMS. Only reject a match that
    // sits at or after that word — one named earlier on the same line (the
    // actual purchase amount) is still valid.
    const cutAt = line.search(/(?:الرصيد|رصيد|الإجمالي\s+المستحق|المبلغ\s+المستحق|المتبقي|minimum\s+due|balance|limit)/i);
    if (cutAt >= 0 && offset >= cutAt) continue;
    // Currency next to a card/account suffix does not turn that identifier
    // into a purchase amount.
    if (/(?:بطاقة|حساب|عبر|من|الى|إلى|لـ|card\s*(?:number|ending)?|account)\s*[:：]?[^\n\r]*$/i.test(line.slice(0, offset))) continue;
    const value = numberValue(match[1] ?? match[2] ?? "");
    if (value !== undefined && value > 0) return value;
  }
  return undefined;
}

interface ExtractedAmount {
  value: number;
  source: "field" | "currency" | "operation" | "none";
}

function extractAmount(text: string, kind: TxnKind): ExtractedAmount {
  const normalized = normalizeDigits(text);
  // A credit-card status SMS can label an available credit figure as
  // `سداد بـ...` and then separately report `رصيد:`. Without a completed
  // payment verb, that is card state, not money that left the bank account.
  if (kind === "card_settle"
    && /(?:^|[\n\r;،])\s*(?:الرصيد|رصيد)\s*[:：]/i.test(normalized)
    && !/(?:تم|جرى|اكتمل)\s+(?:سداد|تسديد|خصم|دفع)|عملية\s+سداد|(?:payment|paid)\s+(?:of|amount)/i.test(normalized)) {
    return { value: 0, source: "none" };
  }
  const fields: Record<string, RegExp[]> = {
    purchase: [
      /مبلغ\s*[:：]?/i,
      /amount\s*[:：]?/i,
      /(?:^|[\s\u061c])بـ?\s*(?:SR|SAR|ريال)?\s*(?=[\d٠-٩])/i,
      /\bFor\s*[:：]?\s*/i,
    ],
    installment: [/القسط\s*[:：]?/i, /خصم\s*[:：]?/i], card_settle: [/سداد(?:\s+بـ?)?\s*/i, /تسديد(?:\s+بـ?)?\s*/i, /payment[^\d]{0,20}/i],
    bnpl_settle: [/دفعة\s*(?:قادمة)?[^\d]{0,20}/i, /payment[^\d]{0,20}/i], cashback: [/إضافة|اضافة|مبلغ\s*[:：]?/i], refund: [/مبلغ\s*[:：]?/i, /استلام\s+قطة[^\d]{0,20}/i],
    deposit: [/مبلغ\s*[:：]?/i, /إيداع|ايداع[^\d]{0,20}/i], transfer_in: [/مبلغ\s*[:：]?/i, /حوالة[^\d]{0,20}/i], salary: [/مبلغ\s*[:：]?/i, /حوالة[^\d]{0,20}/i], atm: [/مبلغ\s*[:：]?/i, /سحب[^\d]{0,20}/i], bill: [/مبلغ\s*[:：]?/i, /سداد[^\d]{0,20}/i], fee: [/رسوم(?:\s+وضريبة)?\s*[:：]?/i], unknown: [/مبلغ\s*[:：]?/i],
  };
  const field = firstFieldAmount(normalized, fields[kind] ?? fields.unknown);
  if (field !== undefined) return { value: field, source: "field" };
  // Credit-card payment/statement messages often show one or more credit
  // balances without an actual payment amount. Never turn an unlabeled
  // currency value into a settlement; only an amount attached to the payment
  // field above is eligible.
  if (kind === "card_settle") return { value: 0, source: "none" };
  const currency = firstCurrencyAmount(normalized);
  if (currency !== undefined) return { value: currency, source: "currency" };
  const operation = normalized.match(/(?:شراء|خصم|سحب|دفع|حوالة|تحويل|إضافة|اضافة|deposit|purchase)\D{0,30}([\d,]+(?:\.\d+)?)/i);
  return operation
    ? { value: numberValue(operation[1]) ?? 0, source: "operation" }
    : { value: 0, source: "none" };
}
function matchesInstrumentSuffix(text: string, amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 1000 || amount > 9999) return false;
  const labels = /(?:^|[\s;،])(?:عبر|من|بطاقة|حساب|الى|إلى|لـ|card(?:\s*(?:number|ending))?|account)\s*[:：]?\s*\*{0,4}(\d{4})(?=\s*(?:;|,|،|؛|$|[\p{L}]))/gimu;
  for (const match of text.matchAll(labels)) {
    if (Number(match[1]) === amount) return true;
  }
  return false;
}
function extractFee(text: string): number | undefined { return firstFieldAmount(normalizeDigits(text), [/(?:ال)?رسوم\s*وضريبة\s*[:：]?/i, /(?:ال)?رسوم\s*[:：]?/i, /رسوم\s*العملية\s*[:：]?/i]); }
function extractBalance(text: string): number | undefined { const m = normalizeDigits(text).match(/(?:الرصيد\s*(?:المتوفر|المتاح|الحالي)?|رصيد)\s*[:：]?\s*(?:SAR|SR|ريال|ر\.?\s?س)?\s*([\d,]+(?:\.\d+)?)/i); return m ? numberValue(m[1]) : undefined; }
function extractAccount(text: string, kind: TxnKind): string | undefined {
  const normalized = normalizeDigits(text);
  // Prefer instrument fields that explicitly identify the account/card. A
  // counterparty name or recipient number must not become the owner's id.
  const explicit = normalized.match(/(?:بطاقة|حساب|عبر|visa|mastercard|ماستر)\s*[:：]?\s*(?:\*+)?(\d{4})(?:\b|\s|;|\*)/i);
  if (explicit) return explicit[1].padStart(4, "0");
  if (["transfer_in", "deposit", "salary", "refund", "cashback"].includes(kind)) {
    const recipient = normalized.match(/(?:الى|إلى)\s*[:：]?\s*(?:\*+)?(\d{4})(?:\b|\s|;|\*)/i);
    if (recipient) return recipient[1].padStart(4, "0");
  }
  if (["purchase", "atm", "bill", "installment", "fee", "card_settle", "self_transfer", "transfer_out"].includes(kind)) {
    const source = normalized.match(/من\s*[:：]?\s*(?:\*+)?(\d{4})(?:\b|\s|;|\*)/i);
    if (source) return source[1].padStart(4, "0");
  }
  const masked = normalized.match(/\*{2,}(\d{4})|\b(\d{4})\*{2,}/);
  return masked?.[1] ?? masked?.[2];
}
function extractMerchant(text: string): string { const body = normalizeDigits(text); let merchant = ""; let from = ""; const strip = (v: string) => v.replace(new RegExp(`\\b(?:${CUR})\\b.*$`, "i"), "").trim(); for (const m of body.matchAll(/(مفوتر|لدى|لـ|من|الى|إلى|at|@)\s*[:：]?\s*([^\n\r,،.؛;]+)/gi)) { const v = strip(m[2]); if (!/\p{L}/u.test(v)) continue; if (/^من$/i.test(m[1])) { if (!from) from = v; } else if (!merchant) merchant = v; } return merchant || from; }
// «من0023;SOKOK FINANCIAL CO»: رمزُ البنك المرسِل قبل الفاصلة المنقوطة ثمّ الاسم.
// بلا تخطّيه كان الالتقاطُ يقف عند «0023» فلا اسمَ للجهة، فلا تُطابَق جهةُ الراتب.
function extractCounterparty(text: string): string | undefined { const m = normalizeDigits(text).match(/(?:من|الى|إلى)\s*[:：]?\s*(?:\d{1,6}\s*;\s*)?([^\n\r,،;]+)/i); return m && /\p{L}/u.test(m[1]) ? m[1].trim() : undefined; }

function addDays(date: string, days: number): string | undefined {
  if (!isValidDateKey(date)) return undefined;
  const value = parseDate(date);
  // `parseDate` deliberately creates local midnight. Advancing its UTC day
  // shifts Riyadh and other positive-offset calendars back by one date; use
  // the local calendar fields for an obligation such as «خلال يومين».
  value.setDate(value.getDate() + days);
  const result = toDateStr(value);
  return isValidDateKey(result) ? result : undefined;
}

function obligationHintFor(
  text: string,
  eventDate: string,
  bank: string | undefined,
  extractedAmount: number,
): ObligationHint | undefined {
  if (bank !== "tamara" && bank !== "tabby") return undefined;
  const normalized = normalizeDigits(text);
  const providerMerchant = extractMerchant(normalized)
    .replace(/\s+(?:مستحق(?:ة)?|سدد(?:ها)?|خلال|سيتم|تم\s+تأكيد|confirmed|track\s+your|order|payment|will\s+be).*$/i, "")
    .trim()
    || normalized.match(/(?:\bat\s+|your\s+)([^\n\r,.]+?)(?=\s+(?:is|payment|purchase|order|will)\b|$)/i)?.[1]?.trim();
  const amount = extractedAmount > 0 ? extractedAmount : undefined;
  const perPeriod = firstFieldAmount(normalized, [/قسط(?:\s+شهري)?/i, /payment\s+of/i]);
  const periodsLeft = numberValue(normalized.match(/لمدة\s*(\d+)\s*(?:أشهر|شهر|months?)/i)?.[1] ?? "")
    ?? numberValue(normalized.match(/مقسمة\s+إلى\s*(\d+)/i)?.[1] ?? "")
    ?? numberValue(normalized.match(/for\s*(\d+)\s*months?/i)?.[1] ?? "");
  let dueDate: string | undefined;
  if (/(?:مستحق(?:ة)?|دفعتك)[^\n\r]{0,60}(?:اليوم|today)/i.test(normalized)) dueDate = eventDate;
  else if (/(?:مستحق(?:ة)?|charged)[^\n\r]{0,80}(?:غدا|غدًا|tomorrow)/i.test(normalized)) dueDate = addDays(eventDate, 1);
  else if (/(?:مستحق(?:ة)?|charged)[^\n\r]{0,80}(?:خلال\s+يومين|within\s+two\s+days)/i.test(normalized)) dueDate = addDays(eventDate, 2);
  if (!amount && !providerMerchant && !dueDate && !perPeriod && !periodsLeft) return undefined;
  return {
    ...(amount ? { amount } : {}),
    ...(providerMerchant ? { merchant: providerMerchant } : {}),
    ...(dueDate ? { dueDate } : {}),
    ...(perPeriod ? { perPeriod } : {}),
    ...(periodsLeft ? { periodsLeft } : {}),
  };
}

function inferKind(text: string, bank?: string): TxnKind {
  // Match both the original Arabic and its conservative spelling-normalized
  // form so "ايداع"/"رمز شراء اونلاين" behave like their hamzated variants.
  // The sender is checked before message text: Tamara/Tabby provider notices
  // stay non-spending even when their body names a real merchant.
  const normalized = normalizeSmsText(text);
  const has = (re: RegExp): boolean => re.test(text) || re.test(normalized);
  const hasFinancialOperation = has(/شراء|عملية\s+شراء|نقاط\s+البيع|مبلغ\s*[:：]|SAR|SR|ريال|لدى|purchase|point\s+of\s+sale|\bPOS\b/i);
  if (has(OTP)) return "otp";
  if (has(DECLINED)) return "declined";
  if (has(HOLD)) return "hold";
  if (bank === "tamara" || bank === "tabby") return "info";
  if (has(/عزيزي\s+العميل|عميلنا\s+العزيز/i) && has(PROTECTION_INFO)) return "marketing";
  if ((has(PROTECTION_INFO) && !has(/شراء|مبلغ\s*[:：]|SAR|SR|ريال|لدى/i)) || has(/تم\s+تحويل\s+عمليتك|تأكيد\s+دفعة\s+مقسمة|دفعة\s+مقسمة|تحديث\s+رسوم\s+التعرفة|سيتم\s+تحديث\s+رسوم/i)) return "info";
  // Tamara/Tabby messages are provider confirmations or repayment notices;
  // a bank SMS that merely names Tamara as the merchant is a normal purchase.
  if (has(BNPL) && has(/تم\s+تحويل|تحويل\s+عمليتك|قادمة|tomorrow|مستحقة|installment/i)) return "info";
  if (has(/استرداد\s+نقدي\s+(?:إلى|الى|ل)\s+(?:ال)?بطاقة|cashback\s+(?:to|on)\s+(?:the\s+)?card/i)) return "cashback";
  if (has(SELF_TRANSFER)) return "self_transfer";
  if (has(BILL_NOTICE)) return "info";
  if (has(/عملية\s+(?:عكسية|استرجاع)|عكس\s+عملية|استرجاع\s+عملية|استرداد\s+عملية|reversal|refund/i) || has(CANCELLED_OR_REVERSED)) {
    return has(/عكس|reversal/i) || has(CANCELLED_OR_REVERSED) ? "reversal" : "refund";
  }
  if (has(ADD_FUNDS)) return "deposit";
  if (has(OUTGOING_TRANSFER)) return "transfer_out";
  if (has(ATM)) return "atm";
  if (has(/قطاف|نقاط\s+(?:مضافة|اضيفت)|رصيد\s+النقاط/i) && !has(/(?:عملية\s+شراء|مبلغ\s*[:：]|amount\s*[:：])/i)) return "marketing";
  if (has(/تم\s+منحكم\s+الخصم|خصم\s+خاص|بدون\s+عمولة|discount|commission/i) && !has(/(?:عملية\s+شراء|مبلغ\s*[:：]|amount\s*[:：])/i)) return "marketing";
  if (has(INVESTMENT_PROVIDER_NOTICE) && !(has(CARD_SETTLE) && has(CARD_EVIDENCE))) return "info";
  if (has(INSTALLMENT) && !(has(CARD_SETTLE) && has(CARD_EVIDENCE))) return "installment";
  if (has(BILL)) return "bill";
  if (has(STATEMENT) && !has(PURCHASE)) return "statement";
  if (has(/استرداد\s+نقدي\s+إلى\s+(?:ال)?المحفظة|محفظة\s+(?:الاسترجاع|الاسترداد)\s+النقدي|استرجاع\s+نقدي/i)) return "cashback";
  if (has(CARD_SETTLE) && has(CARD_EVIDENCE) && !has(PURCHASE)) return "card_settle";
  if (has(MARKETING) && has(/عزيزي\s+العميل|عميلنا\s+العزيز/i) && !hasFinancialOperation && !has(INCOMING)) return "marketing";
  if (has(MARKETING) && !hasFinancialOperation && !has(INCOMING)) return "marketing";
  if (has(/استلام\s+(?:قطة|مبلغ|حوالة)|استرداد\s+(?:مبلغ|عملية)|(?:حوالة|تحويل)\s+من\s*[:：]?\s*\p{L}[^\n\r]*(?:مبلغ|SAR|ريال)/iu)) return "refund";
  // «رواتب» لا تحوي «راتب» متّصلةً، والبنوك تكتب الجمعَ والإنجليزية أيضاً.
  if (has(/راتب|رواتب|\bsalary\b|\bpayroll\b/i)) return "salary";
  if (has(/حوالة\s+(?:واردة|داخلية\s+واردة|محلية\s+واردة)|تحويل\s+وارد/i)) return "transfer_in";
  if (has(INCOMING)) return has(/إيداع|ايداع/i) ? "deposit" : "transfer_in";
  // A bare "خصم" is only a purchase when it carries an account/card debit
  // shape.  Discount announcements are handled above and remain non-money.
  if (has(/خصم\s*(?:من|على)\s*(?:حساب|بطاقة)/i) || (has(/^\s*خصم(?![\p{L}\p{N}])/imu) && has(/(?:مبلغ|SAR|SR|ريال|لدى|من\s+\p{L})/iu))) return "purchase";
  if (has(/تبرع|صدقة|زكاة|خيري|جمعية|donation|charity/i)) return "purchase";
  if (has(OUTGOING)) return "purchase";
  if (has(PURCHASE) || (has(/^\s*شراء(?![\p{L}\p{N}])/imu) && has(/(?:مبلغ|SAR|SR|ريال|لدى|من\s+\p{L})/iu))) return "purchase";
  if (has(/(?:رسوم\s*(?:وضريبة|العملية)?\s*[:：]|رسوم\s*SR)/i)) return "fee";
  return text.trim() ? "unknown" : "info";
}
function directionFor(kind: TxnKind): TxnDirection { if (["purchase", "atm", "bill", "installment", "fee", "card_settle", "bnpl_settle", "transfer_out"].includes(kind)) return "out"; if (["refund", "cashback", "reversal", "transfer_in", "deposit", "salary"].includes(kind)) return "in"; return "neutral"; }
function isExpenseKind(kind: TxnKind): boolean { return ["purchase", "atm", "bill", "installment", "fee"].includes(kind); }
function instrumentKind(text: string, kind: TxnKind): "card" | "account" | "wallet" {
  if (/محفظة|wallet/i.test(text)) return "wallet";
  if (kind === "card_settle" || /بطاقة|فيزا|ماستر|مدى|visa|mastercard|apple\s*pay|credit\s*card/i.test(text)) return "card";
  return "account";
}
function hasEventAmount(kind: TxnKind): boolean { return !["otp", "declined", "statement", "marketing", "info", "hold", "bnpl_settle"].includes(kind); }
function templateFor(kind: TxnKind, text: string): string | undefined { const t = normalizeSmsText(text); if (kind === "purchase" && /شراء\s+(?:انترنت|دولي)/i.test(t) && /مبلغ/.test(t) && /لدي/.test(t)) return "rajhi.internet_purchase"; if (kind === "purchase" && /شراء\s+عبر\s+نقاط\s+البيع/i.test(t)) return "bsf.pos_purchase"; if (kind === "card_settle") return "card.settlement"; if (kind === "statement") return "card.statement"; if (kind === "installment") return "loan.installment"; if (kind === "cashback") return "cashback.wallet"; if (kind === "self_transfer") return "self.transfer"; return undefined; }

export function parseBankSmsEvent(smsText: string, referenceDate: string, options: SmsParseOptions = {}): SmsParseEventResult | null {
  const rawText = (smsText || "").trim();
  if (!rawText) return null;
  const text = normalizeDigits(rawText);
  const sender = inferBank(text, options.sender);
  let kind = inferKind(text, sender.bank);
  const dt = extractDateTime(text, referenceDate);
  const date = dt.date ?? validDateOrNull(referenceDate) ?? referenceDate;
  const merchant = extractMerchant(text);
  const counterparty = extractCounterparty(text) ?? (merchant || undefined);
  const endpoint = counterparty ?? merchant;
  const knownWallet = knownWalletId(endpoint);
  const configuredWallet = ownerWalletMatch(endpoint, options.ownerWallets);
  const textNormalized = normalizeSmsText(text);
  const hasInternalTransferSource = /حواله\s+داخليه/i.test(textNormalized) && /من\s*[:：]?\s*[^\n\r]+/i.test(text);
  if (kind === "unknown" && hasInternalTransferSource && (knownWallet || configuredWallet)) kind = "transfer_in";

  let direction = directionFor(kind);
  let walletReviewReason: string | undefined;
  const walletForReview = configuredWallet ?? (knownWallet ? endpoint : undefined);
  if ((kind === "purchase" || kind === "transfer_in") && walletForReview) {
    const flow = direction;
    kind = "self_transfer";
    direction = flow === "in" ? "in" : "out";
    walletReviewReason = `تحويل محتمل عبر «${walletForReview}» — راجع الساق الأخرى قبل الاعتماد.`;
  } else if (kind === "purchase" && knownWallet) {
    // A known wallet in the merchant field is never a safe automatic expense
    // until the owner confirms whether it is their own wallet.
    walletReviewReason = `هل «${endpoint}» محفظتك؟ راجع التحويل قبل اعتماد المصروف.`;
  }

  const extracted = extractAmount(text, kind);
  // A bare operation-following number is not an amount field. It may be the
  // card/account suffix that appears before the actual `بـ`/`مبلغ` value.
  const amountMatchesInstrument = matchesInstrumentSuffix(text, extracted.value);
  const amountUnverified = extracted.source === "operation" || amountMatchesInstrument;
  const extractedAmount = amountUnverified ? 0 : extracted.value;
  const amount = hasEventAmount(kind) ? extractedAmount : 0;
  const feeBearing = new Set<TxnKind>(["purchase", "atm", "bill", "installment", "fee", "transfer_out", "self_transfer", "card_settle"]);
  const fee = feeBearing.has(kind) ? (extractFee(text) ?? 0) : 0;
  const account = extractAccount(text, kind);
  const balanceAfter = extractBalance(text);
  const isCreditCard = /(?:البطاقة|بطاقة)\s*(?:ال)?(?:ائتمانية|ائتماني)|credit\s*card|available\s+credit|الرصيد\s+الائتماني|الحد\s+الائتماني/i.test(text) || (kind === "card_settle" && /(?:البطاقة|بطاقة)\s*(?:ال)?(?:فيزا|ماستر)|visa\s+card|mastercard/i.test(text));
  const balanceKind: BalanceKind = balanceAfter === undefined ? "unknown" : isCreditCard ? "credit_available" : "unknown";
  const template = templateFor(kind, text);
  const obligationHint = obligationHintFor(text, date, sender.bank, extractedAmount);
  // A foreign-currency amount that never resolves to a labelled SAR figure
  // anywhere in the message cannot be trusted as the riyal amount, even when
  // `extractAmount` did find *some* number. Force this one into review rather
  // than let a foreign figure quietly become a riyal expense.
  const foreignCurrencyNote = hasEventAmount(kind) && FOREIGN_CUR.test(text) && !new RegExp(CUR, "i").test(text)
    ? "عملة أجنبية — تحقّق من المبلغ بالريال"
    : undefined;
  // An inbox receipt timestamp is reliable event-date evidence when the SMS
  // body omits its own date. Keep an unknown sender generic, but do not force
  // every otherwise identifiable notification into manual review merely
  // because its date came from the transport metadata.
  const receivedDateEvidence = Boolean(options.receivedAt?.match(/\d{4}-\d{2}-\d{2}/));
  const confidence: SmsConfidence = amountUnverified || walletReviewReason || foreignCurrencyNote
    ? "generic"
    : (dt.date || receivedDateEvidence)
    ? (template ? sender.confidence : sender.confidence === "generic" ? "generic" : "inferred")
    : "generic";
  const sourceId = options.sourceId ?? options.sourceInboxId; const eventId = sourceId && options.sourceIndex !== undefined ? eventIdFor(sourceId, options.sourceIndex) : undefined;
  const identityKind = instrumentKind(text, kind);
  const refundDestination: RefundDestination | undefined = kind === "refund" && /بطاقة|card|visa|mastercard/i.test(text)
    ? "merchant_card"
    : kind === "refund" && /حساب|محفظة|نقد|bank|cash/i.test(text)
      ? "person_bank"
      : undefined;
  const reviewReasons = [
    walletReviewReason,
    kind === "unknown" ? "قالب غير معروف — يحتاج مراجعة" : undefined,
    amountUnverified ? "لم يظهر مبلغ موثوق بعد حقل المبلغ — يلزم التحقق يدوياً" : undefined,
    foreignCurrencyNote,
  ].filter((reason): reason is string => Boolean(reason));
  const reviewReason = reviewReasons.length ? reviewReasons.join(" · ") : undefined;
  return {
    rawText,
    amount,
    expenseAmount: isExpenseKind(kind) ? amount + (fee || 0) : 0,
    fee: fee || undefined,
    kind,
    direction,
    category: keywordCategory(`${text} ${merchant}`),
    note: merchant || obligationHint?.merchant || rawText.replace(/\s+/g, " ").slice(0, 100),
    date,
    time: dt.time,
    bank: sender.bank,
    account,
    cardLast4: identityKind === "card" ? account : undefined,
    accountId: sender.bank && account ? `${sender.bank}:${identityKind}:${account}` : undefined,
    balanceAfter,
    balanceKind,
    counterparty: counterparty || obligationHint?.merchant,
    debtRemaining: kind === "installment" ? firstFieldAmount(text, [/المبلغ\s+المتبقي\s*[:：]?/i]) : undefined,
    obligationHint,
    refundDestination,
    template,
    confidence,
    eventId,
    sourceKey: sourceKeyFor(rawText),
    sourceInboxId: options.sourceInboxId,
    sourceReceivedAt: options.receivedAt,
    reviewReason,
  };
}

// Legacy expense-only API. New inbox/import code should use `events` below so
// settlement, income, and unknown events remain available for routing.
export function parseBankSms(smsText: string, date: string): SmsParseResult | null { const event = parseBankSmsEvent(smsText, date); return event && isExpenseKind(event.kind) ? event : null; }
export function isNoiseMessage(smsText: string): boolean {
  const event = parseBankSmsEvent(smsText, today());
  if (!event) return true;
  if (event.direction === "in") return true;
  if (event.kind === "unknown" && /(?:^|\n)\s*الرصيد\s*(?:المتاح|المتوفر|الحالي)?\s*[:：]?/i.test(smsText)) return true;
  return ["otp", "declined", "statement", "marketing", "info", "hold", "card_settle", "bnpl_settle", "self_transfer"].includes(event.kind);
}

export interface BulkParseOptions extends SmsParseOptions { receivedAt?: string; }
function receivedDate(receivedAt: string | undefined, fallback: string): string { const date = receivedAt?.match(/(\d{4}-\d{2}-\d{2})/)?.[1]; return date && isValidDateKey(date) ? date : fallback; }
export function parseBankSmsBulk(blob: string, defaultDate: string, options: BulkParseOptions = {}): { transactions: SmsParseResult[]; events: SmsParseEventResult[]; skippedIncome: number } {
  const text = (blob || "").trim();
  if (!text) return { transactions: [], events: [], skippedIncome: 0 };
  const startsMessage = (value: string) => /^(?:شراء|عملية\s+شراء|خصم|سحب|دفع|حوالة|تحويل|إيداع|ايداع|استرداد|استرجاع|عكس|رمز|تم\s+رفض|عملية\s+مرفوضة|money\s*added|add(?:ed)?\s*funds|purchase|credited|cash\s+deposit)/iu.test(value.trim());
  let chunks = text.split(/\n\s*\n+/).map((c) => c.trim()).filter(Boolean);
  // Blank lines inside one receipt commonly precede a warning, balance, or
  // date line. Merge every continuation into the current receipt; only a
  // clear operation header starts a second document. This keeps amount/date
  // fields together while still allowing a pasted batch of receipts.
  if (chunks.length > 1) {
    const grouped: string[] = [];
    for (const chunk of chunks) {
      if (grouped.length && !startsMessage(chunk)) grouped[grouped.length - 1] += `\n\n${chunk}`;
      else grouped.push(chunk);
    }
    chunks = grouped;
  }
  if (options.sender?.trim() && chunks.length > 1) {
    // Inbox rows already represent one source document. Preserve its internal
    // editorial blank lines; split only when a later chunk clearly starts a
    // second operation in a manual multi-message paste.
    if (!chunks.slice(1).some(startsMessage)) chunks = [text];
  }
  // A single bank notification can contain an editorial blank line (security
  // warnings are a common example). Merge a non-financial continuation into
  // its preceding notice, while retaining blank-line separation for two real
  // money operations in a pasted batch.
  if (chunks.length > 1) {
    const merged: string[] = [];
    for (const chunk of chunks) {
      const previous = merged[merged.length - 1];
      const hasMoney = /(?:SAR|SR|ريال|ر\.\s?س|\b\d+[.,]\d{1,2}\b|(?:مبلغ|القسط|سداد)\s*[:：])/i.test(chunk);
      if (previous && !startsMessage(chunk) && !hasMoney) merged[merged.length - 1] = `${previous}\n\n${chunk}`;
      else merged.push(chunk);
    }
    chunks = merged;
  }
  if (chunks.length <= 1) { const whole = inferKind(text); if (!["otp", "declined", "statement", "marketing", "hold", "info"].includes(whole)) { const lines = text.split(/\r?\n/).map((x) => x.trim()).filter(Boolean); if (lines.filter(startsMessage).length > 1) { chunks = []; for (const line of lines) { if (startsMessage(line) || !chunks.length) chunks.push(line); else chunks[chunks.length - 1] += `\n${line}`; } } } }
  const receivedFallback = receivedDate(options.receivedAt, defaultDate);
  const fullReceiptDate = extractSmsDate(text, receivedFallback);
  const events: SmsParseEventResult[] = []; let skippedIncome = 0;
  chunks.forEach((chunk, index) => { const chunkFallback = extractSmsDate(chunk, receivedFallback) ?? (chunks.length === 1 ? fullReceiptDate : null) ?? receivedFallback; const event = parseBankSmsEvent(chunk, chunkFallback, { ...options, sourceIndex: index }); if (!event) return; if (event.direction === "in") skippedIncome++; events.push(event); });
  return { transactions: events.filter((e) => isExpenseKind(e.kind)), events, skippedIncome };
}
