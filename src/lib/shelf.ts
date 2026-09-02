/**
 * **الرفّ** — شراءٌ يَنضج مدّةً تختارها قبل أن تحكم عليه.
 *
 * أكثرُ ما نندم عليه شراءٌ قُرِّر في دقيقة. فالرفُّ لا يمنعك — يؤخّر الحكمَ
 * حتى تهدأ الشهوة، ثمّ يسألك وأنت صاحٍ. ولذلك **لا يُشترى قبل النضوج**: زرُّ
 * الشراء معطَّلٌ حتى تتمّ المدّة، وهو كلُّ ما تفعله هذه الميزة. والمدّةُ ثلاثون
 * يوماً افتراضاً وتُختار لكلّ عنصرٍ على حدة (`ripenDays`).
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { ShelfItem } from "./types";
import { SHELF_RIPEN_DAYS, SHELF_RIPEN_CHOICES } from "./types";
import { parseDate, toIndicDigits } from "./utils";

export { SHELF_RIPEN_DAYS, SHELF_RIPEN_CHOICES };

/**
 * مدّةُ نضوجِ هذا العنصر — ما اختير له يوم وُضع، وإلا فالثلاثون.
 *
 * المدّةُ **على العنصر لا في الإعدادات**: إعدادٌ عامّ يغيّر بأثرٍ رجعيّ نضوجَ
 * كلّ ما ينتظر، فيَنضج ما لم يصبر أو يعود ناضجٌ خامّاً — والرفُّ كلُّه صبرٌ
 * موقوت. وتُصان القيمة هنا لا في المكوّن: قيمةٌ مشوّهة من نسخةٍ قديمة أو من
 * دمجٍ لا تُنتج نضوجاً فورياً ولا أبدياً.
 */
export function ripenDaysOf(item: ShelfItem): number {
  const d = item.ripenDays;
  return Number.isFinite(d) && (d as number) > 0 ? Math.round(d as number) : SHELF_RIPEN_DAYS;
}

/** عمرُ العنصر على الرفّ بالأيام، محصوراً في [٠، مدّته]. */
export function shelfAge(item: ShelfItem, todayStr: string): number {
  const days = Math.floor(
    (parseDate(todayStr).getTime() - parseDate(item.placedAt).getTime()) / 86400000
  );
  return Math.max(0, Math.min(ripenDaysOf(item), days));
}

/** هل نضج؟ */
export function isRipe(item: ShelfItem, todayStr: string): boolean {
  return shelfAge(item, todayStr) >= ripenDaysOf(item);
}

/** ما بقي من أيام النضوج. */
export function daysLeft(item: ShelfItem, todayStr: string): number {
  return ripenDaysOf(item) - shelfAge(item, todayStr);
}

/** ما زال ينتظر الحكم — لا تُرك ولا اشتُري. */
export function isWaiting(item: ShelfItem): boolean {
  return !item.releasedAt && !item.boughtAt;
}

export function waitingItems(items: ShelfItem[]): ShelfItem[] {
  return items.filter(isWaiting);
}

/**
 * **ما وفَّرتَه** = مجموعُ أثمان ما تركتَه. مشتقٌّ من العناصر المحفوظة لا من
 * عدّادٍ تراكميّ: العدّادُ يفقد الزيادات عند دمج جهازين.
 */
export function savedTotal(items: ShelfItem[]): number {
  return items.filter((i) => i.releasedAt).reduce((a, i) => a + (i.price || 0), 0);
}

/** مجموعُ ما ينتظر على الرفّ الآن. */
export function waitingTotal(items: ShelfItem[]): number {
  return waitingItems(items).reduce((a, i) => a + (i.price || 0), 0);
}

/**
 * شرطةٌ لكلّ يومٍ من مدّة العنصر — تُري نضوجَه بنظرة.
 *
 * تُحصر في ثلاثين شرطةً على الأكثر: ستّون شرطةً في عرض الهاتف تصير خيطاً لا
 * يُقرأ. فالشرطةُ في المدد الطويلة تمثّل أكثر من يوم، والنسبةُ هي المقروءة.
 */
export function ripenTicks(item: ShelfItem, todayStr: string): { filled: boolean }[] {
  const span = ripenDaysOf(item);
  const ticks = Math.min(span, SHELF_RIPEN_DAYS);
  const filled = Math.round((shelfAge(item, todayStr) / span) * ticks);
  return Array.from({ length: ticks }, (_, i) => ({ filled: i < filled }));
}

/**
 * عدُّ الأيام بعربيّةٍ سليمة: مفردٌ ومثنّى، ثمّ **جمعُ القلّة** (٣–١٠ أيام)
 * والتمييزُ المفرد المنصوب لما فوقها (١١ يومًا). «٤ يومًا» لحنٌ يراه المالك كلَّ
 * يومٍ على شاشته، فالقاعدة هنا لا في المكوّن — تُختبر مرّةً وتُستعمل حيثما عُدَّت.
 */
export function arDays(n: number): string {
  const v = Math.max(0, Math.round(n));
  if (v === 0) return "لا يوم";
  if (v === 1) return "يومٌ واحد";
  if (v === 2) return "يومان";
  const d = toIndicDigits(String(v));
  return v <= 10 ? `${d} أيام` : `${d} يومًا`;
}

/** جملةُ الحال — «نضج فاحكُم» أو ما بقي. */
export function shelfState(item: ShelfItem, todayStr: string): string {
  if (item.boughtAt) return "اشتريتَه بعد نضوجه";
  if (item.releasedAt) return "تركتَه فوفَّرتَ ثمنَه";
  const left = daysLeft(item, todayStr);
  if (left <= 0) return `نضجَ بعد ${arDays(ripenDaysOf(item))} — احكُم الآن`;
  return `يبقى ${arDays(left)}`;
}
