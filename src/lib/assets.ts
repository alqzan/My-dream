// الأصول والإهلاك — منطقٌ نقيٌّ بالكامل (لا حالة، لا I/O) فيصحّ اختباره وحدةً.
//
// المبدأ الحاكم: **الإهلاك عرضٌ لا صرف**. لا شيء هنا يولّد معاملةً ولا يدخل
// الميزانية اليومية ولا السقوف ولا الإحصائيات؛ المصروف الحقيقي سُجّل يوم الشراء
// (أو في الأقساط). الإهلاك يجيب سؤالاً واحداً: *كم كلّفني هذا الشيء إلى اليوم،
// وكم بقي من قيمته؟*
//
// الطريقة: خطّيٌّ يوميّ — كل يوم ملكيةٍ يستهلك مقداراً ثابتاً:
//   اليومي = (الثمن − القيمة المتبقّية) ÷ العمر بالأيام
//   المستهلك = اليومي × أيام الملكية (محصورٌ بين 0 والقابل للإهلاك)
//   القيمة الدفترية = الثمن − المستهلك (لا تنزل تحت القيمة المتبقّية)
// يوم الشراء نفسه = صفر يوم (ما استهلكت شيئاً بعد)، فأوّل يوم إهلاكٍ هو الغد.
import type { Asset } from "./types";
import { round2, parseDate, toDateStr } from "./utils";

// حدٌّ أدنى للعمر — يمنع القسمة على صفر من بياناتٍ تالفة أو إدخالٍ فارغ.
export const MIN_LIFE_DAYS = 1;
// عشرون سنة: سقفٌ لعمرٍ معقول، وحارسٌ ضدّ رقمٍ فاسد يجعل اليوميّ صفراً بلا معنى.
export const MAX_LIFE_DAYS = 7300;

export function daysBetweenDates(fromStr: string, toStr: string): number {
  return Math.round((parseDate(toStr).getTime() - parseDate(fromStr).getTime()) / 86400000);
}

// نهاية العمر الافتراضي (اليوم الذي تصل فيه القيمة إلى المتبقّية).
export function assetEndDate(a: Asset): string {
  const d = parseDate(a.purchaseDate);
  d.setDate(d.getDate() + clampLife(a.lifeDays));
  return toDateStr(d);
}

function clampLife(v: number): number {
  const n = Math.floor(v) || 0;
  return Math.min(Math.max(n, MIN_LIFE_DAYS), MAX_LIFE_DAYS);
}

// القيمة القابلة للإهلاك: ما ينقص فعلاً من الثمن على مدى العمر. القيمة المتبقّية
// المبالغ فيها (أكبر من الثمن) تُقصّ إلى الثمن فيصير الإهلاك صفراً بدل أن يصير سالباً.
export function depreciableBase(a: Asset): number {
  const salvage = Math.max(0, Math.min(a.salvageValue ?? 0, Math.max(0, a.purchasePrice)));
  return round2(Math.max(0, a.purchasePrice - salvage));
}

// الاستهلاك اليوميّ — الرقم الذي يهمّ المالك: «هذا الشيء يكلّفني كذا في اليوم».
export function dailyDepreciation(a: Asset): number {
  return round2(depreciableBase(a) / clampLife(a.lifeDays));
}

export interface AssetStatus {
  daysOwned: number; // أيام الملكية حتى اليوم (أو حتى يوم البيع) — لا تسبق الشراء
  lifeDays: number; // العمر بعد التقليم للحدود
  perDay: number; // الاستهلاك اليوميّ
  perMonth: number; // تقديرٌ شهريّ (٣٠ يوماً) — للعرض فقط
  depreciated: number; // ما استُهلك من الأصل حتى الآن
  bookValue: number; // القيمة الدفترية الحالية (الثمن − المستهلك)
  salvage: number; // القيمة المتبقّية المعتمدة
  pct: number; // 0..100 نسبة ما استُهلك من القابل للإهلاك
  remainingDays: number; // ما بقي من العمر (0 = انتهى)
  endDate: string; // نهاية العمر الافتراضي
  expired: boolean; // انتهى عمره الافتراضي (لم يعد ينقص)
  future: boolean; // تاريخ شرائه في المستقبل — لم يبدأ إهلاكه بعد
  sold: boolean;
  // ربح/خسارة البيع = ثمن البيع − القيمة الدفترية يوم البيع (سالبٌ = خسارة).
  // null ما لم يُسجَّل بيعٌ بثمن.
  saleResult: number | null;
}

export function assetStatus(a: Asset, todayStr: string): AssetStatus {
  const lifeDays = clampLife(a.lifeDays);
  const perDay = dailyDepreciation(a);
  const base = depreciableBase(a);
  const salvage = round2(Math.max(0, a.purchasePrice - base));
  // البيع يجمّد العدّاد: بعد أن خرج من يدك لا يستهلك يوماً آخر.
  const asOf = a.soldDate && a.soldDate < todayStr ? a.soldDate : todayStr;
  const rawDays = daysBetweenDates(a.purchaseDate, asOf);
  const daysOwned = Math.max(0, Math.min(rawDays, lifeDays));
  const depreciated = round2(Math.min(base, perDay * daysOwned));
  const bookValue = round2(Math.max(salvage, a.purchasePrice - depreciated));
  return {
    daysOwned,
    lifeDays,
    perDay,
    perMonth: round2(perDay * 30),
    depreciated,
    bookValue,
    salvage,
    pct: base > 0 ? Math.max(0, Math.min(100, Math.round((depreciated / base) * 100))) : 100,
    remainingDays: Math.max(0, lifeDays - daysOwned),
    endDate: assetEndDate(a),
    expired: daysOwned >= lifeDays,
    future: rawDays < 0,
    sold: !!a.soldDate,
    saleResult:
      a.soldDate && a.soldPrice != null ? round2(a.soldPrice - bookValue) : null,
  };
}

// ما استُهلك خلال شهرٍ بعينه ("YYYY-MM") — أيام التقاطع بين الشهر وعمر الأصل
// مضروبةً باليوميّ. يجيب: «كم أكلت أصولي من قيمتها هذا الشهر؟».
export function depreciationInMonth(a: Asset, month: string): number {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return 0;
  // الحدّان مفتوحان من الأعلى: من أوّل الشهر إلى أوّل الشهر التالي — فمجموع
  // شهور السنة يساوي إهلاك السنة بالضبط بلا يومٍ ضائعٍ بين شهرين.
  const first = toDateStr(new Date(y, m - 1, 1));
  const nextFirst = toDateStr(new Date(y, m, 1));
  const before = assetStatus(a, first).depreciated;
  const after = assetStatus(a, nextFirst).depreciated;
  return round2(Math.max(0, after - before));
}

export interface AssetsOverview {
  count: number; // الأصول التي ما زالت بيدك (غير المباعة)
  totalCost: number; // مجموع أثمان الشراء
  bookValue: number; // مجموع القيمة الدفترية الحالية
  consumed: number; // مجموع ما استُهلك
  perDay: number; // كم تستهلك أصولك يومياً مجتمعةً
  perMonth: number;
  expiredCount: number; // أصولٌ انتهى عمرها الافتراضي
  soldResult: number; // مجموع ربح/خسارة ما بِعتَه
}

export function assetsOverview(assets: Asset[], todayStr: string): AssetsOverview {
  const o: AssetsOverview = {
    count: 0, totalCost: 0, bookValue: 0, consumed: 0,
    perDay: 0, perMonth: 0, expiredCount: 0, soldResult: 0,
  };
  for (const a of assets) {
    const s = assetStatus(a, todayStr);
    if (s.saleResult != null) o.soldResult = round2(o.soldResult + s.saleResult);
    if (s.sold) continue; // المباع خرج من محفظتك — لا قيمة له ولا استهلاك بعدُ
    o.count++;
    o.totalCost = round2(o.totalCost + a.purchasePrice);
    o.bookValue = round2(o.bookValue + s.bookValue);
    o.consumed = round2(o.consumed + s.depreciated);
    if (s.expired) o.expiredCount++;
    else if (!s.future) o.perDay = round2(o.perDay + s.perDay);
  }
  o.perMonth = round2(o.perDay * 30);
  return o;
}

// أخطاءٌ تمنع الحفظ (بياناتٌ لا معنى لها). ما عداها يُقبل كما كتبه المالك.
export function validateAssetDraft(d: {
  name: string; purchasePrice: number; purchaseDate: string; lifeDays: number; salvageValue?: number;
}): string[] {
  const errors: string[] = [];
  if (!d.name.trim()) errors.push("اسم الأصل مطلوب");
  if (!(d.purchasePrice > 0)) errors.push("ثمن الشراء مطلوب");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.purchaseDate)) errors.push("تاريخ الشراء مطلوب");
  if (!(d.lifeDays >= MIN_LIFE_DAYS)) errors.push("العمر الافتراضي لا يقلّ عن يوم");
  else if (d.lifeDays > MAX_LIFE_DAYS) errors.push("العمر الافتراضي أطول من المعقول (٢٠ سنة)");
  if ((d.salvageValue ?? 0) < 0) errors.push("القيمة المتبقّية لا تكون سالبة");
  else if ((d.salvageValue ?? 0) > d.purchasePrice) errors.push("القيمة المتبقّية أكبر من ثمن الشراء");
  return errors;
}

// وصفٌ عربيٌّ موجز لمدّةٍ بالأيام (يشترك فيه العرض والنموذج).
export function describeDays(days: number): string {
  if (days <= 0) return "انتهى";
  if (days < 30) return `${days} يوم`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} شهر`;
  const years = Math.floor(days / 365);
  const rem = Math.round((days - years * 365) / 30);
  return rem >= 1 ? `${years} سنة و${rem} شهر` : `${years} سنة`;
}
