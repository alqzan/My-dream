// ===================== المطابقةُ الربعية — الحسابُ النقيّ =====================
// **السؤال الذي لم يكن للتطبيق جوابٌ عليه: هل هذا المال موجودٌ فعلاً؟**
//
// كلُّ رقمٍ في «مدار» مشتقٌّ من معاملاتٍ سجّلها المالك بيده. والمعاملاتُ ناقصةٌ
// دائماً: عمليةٌ نُسيت، كاش‌باك رجع ولم يُسجَّل، تحويلٌ لمحفظةٍ ادّخارية، رسمٌ
// اقتُطع بلا رسالة. فيرتفع «الفائض» الحسابيّ فوق ما في الحساب فعلاً، ويُرحَّل
// كلَّ دورةٍ إلى المظاريف، وتُبنى عليه قراراتٌ (مقاصةٌ تلقائية، تمويلُ مظروف)
// — وهو مالٌ لا وجود له. هذه بعينها شكوى المالك: «ما أبغى يعطيني فائض وما
// عندي فايض».
//
// والعلاجُ ليس حساباً أذكى — لا يوجد حسابٌ يعرف ما لم يُسجَّل. العلاجُ **وقفةٌ
// كلّ ثلاثة أشهر**: يفتح المالك كشوفَ حساباته، ويكتب رقماً واحداً، ويُسجَّل
// الفرقُ تسويةً على «الفوائض». عشرُ دقائق تُعيد ضبط النظام كلِّه.
//
// **ولماذا رقمٌ واحد لا مظروفاً مظروفاً؟** لأنّ الكشفَ البنكيّ وعاءٌ واحد ولا
// يعرف مظاريفنا. مقابلةُ مظروفٍ بمظروف كانت ستطلب من المالك أن يقسم رصيده
// بيده كلَّ مرّة — وهو عملُ عشر دقائقَ يصير ساعة، فلا يُفعل أصلاً. (قرارُ
// المالك ٠٫١٫٤٣٠.)
//
// **ولماذا الفرقُ كلُّه على «الفوائض»؟** لأنّها الوعاءُ الذي لا يصف شيئاً
// بعينه: المظاريفُ الأخرى لكلٍّ منها غايةٌ وخطّةٌ يعرفها المالك، أمّا الفوائض
// فهي «ما بقي» — وتصحيحُ «ما بقي» هو بعينه ما يريده. وقد تنزل تحت الصفر، وهذا
// **خبرٌ صحيح لا عطل**: صرفتَ من مالٍ لم يُسجَّل، ويمكن أن تُوضع عليه خطّةُ
// سدادٍ كأيّ عجز (`fundPlan.ts`, `stop: "zero"`).
//
// منطقٌ نقيّ بلا حالة ولا DOM، مختبَرٌ في `reconcile.test.ts`.
// النوعُ `Reconcile` في `types.ts` لا هنا: `AppData` يحمله، ولو عُرّف هنا
// لصارت دورةُ استيرادٍ بين الملفّين.
import type { CreditLedgerIssue } from "./creditLedger";
import type { DailyBudget, Reconcile, ReserveFund, Transaction } from "./types";
import { normalizeReserveSplits } from "./reserveFunds";
import { cashOut, computeDailyBudgetStatus, parseDate, reserveShare, reserveTotals, round2 } from "./utils";

/** كلُّ كم يومٍ تُطلب المطابقة. ثلاثةُ أشهرَ بطلب المالك: أقصرُ منها يجعلها
 *  عادةً ثقيلة تُؤجَّل ثمّ تُتجاهَل، وأطولُ منها يجعل الفرقَ كبيراً بما يصعب
 *  تفسيره فيُقبَل بلا فهم. */
export const RECONCILE_DAYS = 90;

/** ما دون الريال فرقُ تقريبٍ لا اختلافُ حساب — يُقرأ «مطابق» ولا يُسجَّل تسويةً
 *  تُزحم السجلّ بحركاتٍ بلا معنى. */
export const RECONCILE_TOLERANCE = 1;

/** نصُّ إيداعِ التسوية في «الفوائض» — ثابتٌ واحد فتُعرف حركاتُها في سجلّ
 *  الصندوق ولا تختلط بترحيلِ راتبٍ ولا بسحبٍ يدويّ (كـ`OFFSET_NOTE` تماماً). */
export const RECONCILE_NOTE = "تسوية المطابقة الربعية";

/* ===================== متى تُطلب؟ ===================== */

export interface ReconcileStatus {
  /** تاريخُ آخر مطابقة — `null` لم تقع قطّ. */
  last: string | null;
  /** التاريخُ الذي يُعدّ منه: آخرُ مطابقة، وإلّا أوّلُ معاملةٍ في السجل. */
  anchor: string | null;
  /** الأيامُ منذ المرساة — `null` حين لا مرساة (تطبيقٌ بلا بياناتٍ بعد). */
  daysSince: number | null;
  /** كم بقي حتى تُطلب (صفرٌ = حان وقتُها). */
  daysLeft: number;
  due: boolean;
}

/** أحدثُ مطابقةٍ مسجَّلة (التواريخُ نصّيّةٌ تُقارن كما هي). */
export function lastReconcile(reconciles: Reconcile[] | undefined): Reconcile | null {
  let best: Reconcile | null = null;
  for (const r of reconciles ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "")) continue;
    if (!best || r.date > best.date) best = r;
  }
  return best;
}

function earliest(transactions: Transaction[]): string | null {
  let best: string | null = null;
  for (const t of transactions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date ?? "")) continue;
    if (!best || t.date < best) best = t.date;
  }
  return best;
}

/**
 * **المرساةُ أوّلُ معاملةٍ لا يومُ التثبيت**: بلا ذلك يُطالَب مَن ثبّت التطبيق
 * أمسِ بمطابقةِ كشوفٍ لا شيء فيها ليُطابَق — فيتعلّم أن يُغلق البطاقة، وحين
 * تصير المطابقةُ ذاتَ معنى بعد ثلاثة أشهر تكون قد صارت أثاثاً.
 */
export function reconcileStatus(
  reconciles: Reconcile[] | undefined,
  transactions: Transaction[],
  todayStr: string,
  everyDays: number = RECONCILE_DAYS
): ReconcileStatus {
  const last = lastReconcile(reconciles);
  const anchor = last?.date ?? earliest(transactions);
  const every = Math.max(1, Math.round(Number.isFinite(everyDays) ? everyDays : RECONCILE_DAYS));
  if (!anchor) return { last: last?.date ?? null, anchor: null, daysSince: null, daysLeft: every, due: false };
  const daysSince = Math.max(
    0,
    Math.round((parseDate(todayStr).getTime() - parseDate(anchor).getTime()) / 86400000)
  );
  const daysLeft = Math.max(0, every - daysSince);
  return { last: last?.date ?? null, anchor, daysSince, daysLeft, due: daysLeft === 0 };
}

/* ===================== ما يظنّه التطبيق أنّك تملك ===================== */

export interface HoldingRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  balance: number;
}

/** A term of `expected` beyond envelopes and the cycle, already signed as it
 * enters the total (a debit is negative). */
export type HoldingAdjustmentKey =
  | "creditUnpaid" | "prepaidCredit" | "bankReimbursements" | "merchantCardRefunds" | "explicitLedgerDebits";

export interface HoldingAdjustment {
  key: HoldingAdjustmentKey;
  amount: number;
}

export interface Holdings {
  envelopes: HoldingRow[];
  envelopesTotal: number;
  /** رصيدُ الدورة الجاري: مصروفٌ رُصد لك ولم يُصرَف بعد — مالٌ في حسابك أيضاً. */
  cycleBalance: number;
  /** المجموعُ الذي يُقابَل بالواقع. */
  expected: number;
  /** Recorded unpaid charges on owner-confirmed credit cards. */
  creditUnpaid: number;
  /** Settlements with no earlier charge; these block reconciliation. */
  creditExcess: number;
  /** Explicitly classified prepaid credit, which is an asset rather than cash. */
  prepaidCredit: number;
  /** Explicit person-bank reimbursements received as current bank cash. */
  bankReimbursements: number;
  /** Merchant refunds returned to a card restore the cash that funded the
   * recorded charge; any unused part remains in prepaidCredit. Excludes the
   * part already routed back to an envelope (`reserveShare`) and refunds the
   * credit ledger rejected. */
  merchantCardRefunds: number;
  /** Explicit owner-labelled debits (opening debt / missed expense), applied once. */
  explicitLedgerDebits: number;
  /** The non-zero terms above, signed, so that envelopesTotal + cycleBalance
   * + Σ adjustments = expected exactly: a screen that lists rows then a total
   * must never hide part of that total. */
  adjustments: HoldingAdjustment[];
  /** A blocked reconciliation must be resolved explicitly before recording:
   * an unexplained settlement, or a blocking credit-ledger error. */
  blockedByExcess: boolean;
  /** Why it is blocked, beyond the excess itself (empty when not blocked). */
  blockingIssues: CreditLedgerIssue[];
}

/** The small public shape consumed by the reconciliation UI. The credit-ledger
 * engine deliberately owns chronology; this view keeps `reconcile.ts` free of
 * engine details and remains backwards-compatible for callers with no cards. */
export interface CreditLedgerView {
  unpaid: number;
  excess: number;
  prepaid: number;
  byCard?: Record<string, { unpaid?: number; excess?: number; prepaid?: number }>;
  issues?: CreditLedgerIssue[];
  /** Errors on proven credit cards — the only issues that block. Warnings in
   * `issues` inform and never lock the reconciliation. */
  blockingIssues?: CreditLedgerIssue[];
  /** Card refunds the ledger rejected; they restored nothing. */
  rejectedCardRefundIds?: string[];
}

/**
 * **ولماذا يدخل رصيدُ الدورة في المجموع؟** لأنّ المطابقةَ تقابل ما في الحساب
 * البنكيّ، وما رُصد لك اليومَ ولم تصرفه ما زال في الحساب. إسقاطُه كان سيُظهر
 * فرقاً موجباً كلَّ مرّة بمقدار ما لم تصرفه — فرقاً حقيقياً المصدر، كاذبَ
 * المعنى، يُسجَّل تسويةً فيُضاعف الفائض.
 */
export function holdings(input: {
  reserves: ReserveFund[];
  transactions: Transaction[];
  dailyBudget: DailyBudget | null;
  creditLedger?: CreditLedgerView;
  /** Accepted for caller compatibility. Cashback deposited into its envelope
   * is counted there once: the typed number includes wallets (the screen asks
   * for them), so subtracting it again would count it twice. */
  cashbackEnabled?: boolean;
  cashbackEnvelopeId?: string;
}): Holdings {
  const totals = reserveTotals(input.reserves, input.transactions);
  const envelopes: HoldingRow[] = input.reserves.map((f) => ({
    id: f.id,
    name: f.name,
    icon: f.icon,
    color: f.color,
    balance: totals.get(f.id)?.balance ?? 0,
  }));
  const envelopesTotal = round2(envelopes.reduce((s, e) => s + e.balance, 0));
  const cycleBalance = input.dailyBudget
    ? round2(computeDailyBudgetStatus(input.dailyBudget, input.transactions).balance)
    : 0;
  const creditUnpaid = round2(Math.max(0, input.creditLedger?.unpaid ?? 0));
  const creditExcess = round2(Math.max(0, input.creditLedger?.excess ?? 0));
  const prepaidCredit = round2(Math.max(0, input.creditLedger?.prepaid ?? 0));
  // A reimbursement paid to the owner's bank account is cash available now.
  // It is intentionally separate from card liability: a person refund must
  // not make an unpaid credit-card charge look settled. Merchant-card refunds
  // are allocated by creditLedgerForState instead.
  const bankReimbursements = round2(input.transactions
    .filter((transaction) => (transaction.kind === "refund" || transaction.kind === "reversal" || transaction.kind === "cashback")
      && transaction.direction === "in"
      && transaction.refundDestination === "person_bank")
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amount), 0));
  // A refund the ledger rejected reduced no card liability, so it restored no
  // cash either. And the part of a refund routed back to its envelope
  // (`reserveShare` is negative for it) is already in `envelopesTotal`:
  // counting it here too would show money the bank never received.
  const rejectedRefunds = new Set(input.creditLedger?.rejectedCardRefundIds ?? []);
  const merchantCardRefunds = round2(input.transactions
    .filter((transaction) => (transaction.kind === "refund" || transaction.kind === "reversal")
      && transaction.direction === "in"
      && transaction.refundDestination === "merchant_card"
      && !rejectedRefunds.has(transaction.eventId ?? transaction.id))
    .reduce((sum, transaction) => {
      const routedBack = -(normalizeReserveSplits(transaction.reserveSplits) ?? [])
        .reduce((s, split) => s + reserveShare(transaction, split.fundId), 0);
      return sum + Math.max(0, Math.max(0, transaction.amount) - Math.max(0, routedBack));
    }, 0));
  // Current resolution entries carry a 100% reserve split, so reserveTotals
  // already removes them from an actual envelope. The fallback keeps legacy
  // entries (created before that split existed) visible exactly once.
  const explicitLedgerDebits = round2(input.transactions
    .filter((transaction) => (transaction.kind === "opening_debt" || transaction.kind === "missed_expense") && !transaction.reserveSplits?.length)
    .reduce((sum, transaction) => sum + cashOut(transaction), 0));
  const adjustments = ([
    { key: "creditUnpaid", amount: creditUnpaid },
    { key: "prepaidCredit", amount: -prepaidCredit },
    { key: "bankReimbursements", amount: bankReimbursements },
    { key: "merchantCardRefunds", amount: merchantCardRefunds },
    { key: "explicitLedgerDebits", amount: -explicitLedgerDebits },
  ] satisfies HoldingAdjustment[]).filter((row) => row.amount !== 0);
  const expected = round2(envelopesTotal + cycleBalance + adjustments.reduce((sum, row) => sum + row.amount, 0));
  const blockingIssues = input.creditLedger?.blockingIssues ?? [];
  return {
    envelopes,
    envelopesTotal,
    cycleBalance,
    expected,
    creditUnpaid,
    creditExcess,
    prepaidCredit,
    bankReimbursements,
    merchantCardRefunds,
    explicitLedgerDebits,
    adjustments,
    // A real settlement remainder blocks even when it is below the ordinary
    // cash-rounding tolerance; tolerance is for observed bank totals, never
    // for silently discarding a card payment.
    // Warnings (e.g. a same-day order that no longer changes any number, or
    // a card whose funding is unknown) never block: only errors on proven
    // credit cards do.
    blockedByExcess: creditExcess > 0 || blockingIssues.length > 0,
    blockingIssues,
  };
}

/* ===================== الفرق ===================== */

export type ReconcileVerdict =
  | "match" // ضمن حدّ التقريب — لا تسوية
  | "more"  // الواقعُ أكثر: دخلٌ أو ارتدادٌ لم يُسجَّل
  | "less"; // الواقعُ أقلّ: صرفٌ لم يُسجَّل

export interface ReconcileResult {
  expected: number;
  actual: number;
  delta: number; // actual − expected
  verdict: ReconcileVerdict;
}

export function reconcileDelta(
  expected: number,
  actual: number,
  tolerance: number = RECONCILE_TOLERANCE
): ReconcileResult {
  const e = round2(Number.isFinite(expected) ? expected : 0);
  const a = round2(Number.isFinite(actual) ? actual : 0);
  const delta = round2(a - e);
  const tol = Math.abs(Number.isFinite(tolerance) ? tolerance : RECONCILE_TOLERANCE);
  const verdict: ReconcileVerdict = Math.abs(delta) <= tol ? "match" : delta > 0 ? "more" : "less";
  return { expected: e, actual: a, delta: verdict === "match" ? 0 : delta, verdict };
}
