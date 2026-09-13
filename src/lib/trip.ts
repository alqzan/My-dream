// ===================== وضعُ السفر وتقريرُ الرحلة =====================
// «أبي أسوّي وضع السفر: تصير أيّ صرفيّة محسوبةً للسفرة، وبعدين أرجع وأعرف كلّ
// سفرةٍ كم كلّفتني». وهما وجهان لشيءٍ واحد: **نافذةٌ زمنية على مظروف**.
//
// ولا بياناتٍ جديدة تُخترع لهذا: المصاريفُ محمَّلةٌ على المظروف أصلاً
// (`reserveSplits`)، والتقريرُ يقرأ ما حُمِّل عليه عبر `reserveShare` — البوّابة
// نفسها التي يقرأ بها رصيدُه. فلا مجموعَ صرفٍ ثانٍ يمكن أن ينحرف عن الأوّل.
// منطقٌ نقيّ بلا DOM، مختبَرٌ في `trip.test.ts`.
import type { ReserveFund, Transaction } from "./types";
import { reserveShare, round2, parseDate } from "./utils";

/** الرحلةُ الجارية: مظروفٌ بدأ سفرُه ولم يُنهَ. واحدةٌ فقط في كلّ وقت. */
export function activeTrip(reserves: ReserveFund[]): ReserveFund | null {
  return reserves.find((f) => f.trip?.startedAt && !f.trip.endedAt) ?? null;
}

export interface TripSummary {
  total: number;        // ما كلّفته الرحلة فعلاً (مجموع ما حُمِّل على المظروف)
  count: number;        // عدد المعاملات
  days: number;         // أيامُ الرحلة (شاملةً يومَي البداية والنهاية)
  perDay: number;       // متوسّط اليوم
  biggest: Transaction | null;
  byCategory: { category: string; total: number }[]; // مرتّبةٌ تنازلياً
  ongoing: boolean;
}

/** تقريرُ رحلةٍ على مظروفها. `todayStr` لحساب أيام رحلةٍ ما زالت جارية. */
export function tripSummary(fund: ReserveFund, transactions: Transaction[], todayStr: string): TripSummary {
  const start = fund.trip?.startedAt;
  const end = fund.trip?.endedAt;
  const charged = transactions.filter((t) => reserveShare(t, fund.id) > 0);
  let total = 0;
  let biggest: Transaction | null = null;
  const cats = new Map<string, number>();
  for (const t of charged) {
    const share = reserveShare(t, fund.id);
    total = round2(total + share);
    cats.set(t.category, round2((cats.get(t.category) ?? 0) + share));
    if (!biggest || share > reserveShare(biggest, fund.id)) biggest = t;
  }
  const days = start
    ? Math.max(
        1,
        Math.round((parseDate(end ?? todayStr).getTime() - parseDate(start).getTime()) / 86400000) + 1
      )
    : 0;
  return {
    total,
    count: charged.length,
    days,
    perDay: days > 0 ? round2(total / days) : 0,
    biggest,
    byCategory: [...cats.entries()]
      .map(([category, t]) => ({ category, total: t }))
      .sort((a, b) => b.total - a.total),
    ongoing: !!start && !end,
  };
}

/** الرحلاتُ المنتهية، أحدثُها أوّلاً — «كم كلّفتني كلُّ سفرة». */
export function pastTrips(reserves: ReserveFund[]): ReserveFund[] {
  return reserves
    .filter((f) => f.trip?.startedAt && f.trip.endedAt)
    .sort((a, b) => (a.trip!.endedAt! < b.trip!.endedAt! ? 1 : -1));
}
