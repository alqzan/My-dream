/**
 * **الرفّ** — شراءٌ يَنضج ثلاثين يوماً قبل أن تحكم عليه.
 *
 * أكثرُ ما نندم عليه شراءٌ قُرِّر في دقيقة. فالرفُّ لا يمنعك — يؤخّر الحكمَ
 * حتى تهدأ الشهوة، ثمّ يسألك وأنت صاحٍ. ولذلك **لا يُشترى قبل النضوج**: زرُّ
 * الشراء معطَّلٌ حتى تتمّ الثلاثون، وهو كلُّ ما تفعله هذه الميزة.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { ShelfItem } from "./types";
import { SHELF_RIPEN_DAYS } from "./types";
import { parseDate, toIndicDigits } from "./utils";

export { SHELF_RIPEN_DAYS };

/** عمرُ العنصر على الرفّ بالأيام، محصوراً في [٠، ٣٠]. */
export function shelfAge(item: ShelfItem, todayStr: string): number {
  const days = Math.floor(
    (parseDate(todayStr).getTime() - parseDate(item.placedAt).getTime()) / 86400000
  );
  return Math.max(0, Math.min(SHELF_RIPEN_DAYS, days));
}

/** هل نضج؟ */
export function isRipe(item: ShelfItem, todayStr: string): boolean {
  return shelfAge(item, todayStr) >= SHELF_RIPEN_DAYS;
}

/** ما بقي من أيام النضوج. */
export function daysLeft(item: ShelfItem, todayStr: string): number {
  return SHELF_RIPEN_DAYS - shelfAge(item, todayStr);
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

/** ثلاثون شرطةً تُري نضوجَ العنصر بنظرة. */
export function ripenTicks(item: ShelfItem, todayStr: string): { filled: boolean }[] {
  const age = shelfAge(item, todayStr);
  return Array.from({ length: SHELF_RIPEN_DAYS }, (_, i) => ({ filled: i < age }));
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
  if (left <= 0) return "نضجَ بعد ثلاثين يومًا — احكُم الآن";
  return `يبقى ${arDays(left)}`;
}
