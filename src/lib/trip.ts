// ===================== وضعُ السفر وتقريرُ الرحلة =====================
// «أبي أسوّي وضع السفر: تصير أيّ صرفيّة محسوبةً للسفرة، وبعدين أرجع وأعرف كلّ
// سفرةٍ كم كلّفتني». وهما وجهان لشيءٍ واحد: **نافذةٌ زمنية على مظروف**.
//
// ولا بياناتٍ جديدة تُخترع لهذا: المصاريفُ محمَّلةٌ على المظروف أصلاً
// (`reserveSplits`)، والتقريرُ يقرأ ما حُمِّل عليه عبر `reserveShare` — البوّابة
// نفسها التي يقرأ بها رصيدُه. فلا مجموعَ صرفٍ ثانٍ يمكن أن ينحرف عن الأوّل.
//
// **والمظروفُ يحمل عدّة رحلات (٠٫١٫٤٢٥).** كان يحمل واحدةً، فبدءُ رحلةٍ ثانية
// عليه يكتب فوق الأولى: تقريرُها يختفي بلا استرجاع، ويُقسَم صرفُ المظروف كلُّه
// على أيّام الثانية فيُعطي `perDay` أضعافَ الحقيقة. والآن **لكلّ رحلةٍ نافذتُها**
// والتقريرُ يقرأ ما وقع داخلها وحدها.
//
// منطقٌ نقيّ بلا DOM، مختبَرٌ في `trip.test.ts`.
import { type ReserveFund, type Transaction, type Trip } from "./types";
import { reserveShare, round2, parseDate } from "./utils";
import { isSystemReserveFund } from "./reserveFunds";

/**
 * The general and surplus envelopes are holding accounts, not trip trackers.
 * A trip accidentally started on either one used to make unrelated charges
 * (notably rent) appear in «رحلاتي السابقة». Dedicated event envelopes remain
 * eligible for trip mode.
 */
export function isTripEligibleFund(fund: Pick<ReserveFund, "name" | "role">): boolean {
  return !isSystemReserveFund(fund);
}

/** رحلةُ هذا المظروف الجارية (بلا `endedAt`)، أو `null`. */
export function activeTripOf(fund: ReserveFund): Trip | null {
  if (!isTripEligibleFund(fund)) return null;
  return fund.trips?.find((t) => t.startedAt && !t.endedAt) ?? null;
}

/** الرحلةُ الجارية في المظاريف كلِّها — واحدةٌ فقط في كلّ وقت. */
export function activeTrip(reserves: ReserveFund[]): { fund: ReserveFund; trip: Trip } | null {
  for (const fund of reserves) {
    const trip = activeTripOf(fund);
    if (trip) return { fund, trip };
  }
  return null;
}

export interface TripSummary {
  total: number;        // ما كلّفته الرحلة فعلاً (ما حُمِّل على المظروف داخل نافذتها)
  count: number;        // عدد المعاملات
  days: number;         // أيامُ الرحلة (شاملةً يومَي البداية والنهاية)
  perDay: number;       // متوسّط اليوم
  biggest: Transaction | null;
  byCategory: { category: string; total: number }[]; // مرتّبةٌ تنازلياً
  ongoing: boolean;
}

const EMPTY: TripSummary = {
  total: 0, count: 0, days: 0, perDay: 0, biggest: null, byCategory: [], ongoing: false,
};

/** تقريرُ **رحلةٍ بعينها** على مظروفها. `todayStr` لحساب أيام رحلةٍ ما زالت جارية.
 *
 *  بلا `trip` يُؤخذ الجاري، وإن لم تكن هناك رحلةٌ جارية فآخرُ رحلةٍ انتهت —
 *  فلوحةُ المظروف تعرض شيئاً معقولاً بدل فراغ. */
export function tripSummary(
  fund: ReserveFund,
  transactions: Transaction[],
  todayStr: string,
  trip?: Trip | null
): TripSummary {
  if (!isTripEligibleFund(fund)) return EMPTY;
  const t = trip ?? activeTripOf(fund) ?? lastEndedTrip(fund);
  if (!t?.startedAt) return EMPTY;

  // **النافذةُ هي الفرق كلُّه.** بلا حدٍّ أعلى كان صرفُ الرحلة السابقة يُحتسب
  // على اللاحقة. الحدُّ الأعلى لرحلةٍ جارية هو اليوم، ولمنتهيةٍ يومُ انتهائها.
  const from = t.startedAt;
  const to = t.endedAt ?? todayStr;

  const charged = transactions.filter(
    (x) => x.date >= from && x.date <= to && reserveShare(x, fund.id) > 0
  );

  let total = 0;
  let biggest: Transaction | null = null;
  let biggestShare = 0; // مُخزَّنٌ لا مُعادُ الحساب في كلّ دورة
  const cats = new Map<string, number>();
  for (const x of charged) {
    const share = reserveShare(x, fund.id);
    total = round2(total + share);
    cats.set(x.category, round2((cats.get(x.category) ?? 0) + share));
    if (share > biggestShare) { biggest = x; biggestShare = share; }
  }

  const days = Math.max(
    1,
    Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000) + 1
  );

  return {
    total,
    count: charged.length,
    days,
    perDay: round2(total / days),
    biggest,
    byCategory: [...cats.entries()]
      .map(([category, v]) => ({ category, total: v }))
      .sort((a, b) => b.total - a.total),
    ongoing: !t.endedAt,
  };
}

/** آخرُ رحلةٍ انتهت على هذا المظروف. */
export function lastEndedTrip(fund: ReserveFund): Trip | null {
  const ended = (fund.trips ?? []).filter((t) => t.startedAt && t.endedAt);
  if (!ended.length) return null;
  return ended.reduce((a, b) => (a.endedAt! >= b.endedAt! ? a : b));
}

/** الرحلاتُ المنتهية كلُّها عبر المظاريف، أحدثُها أوّلاً — «كم كلّفتني كلُّ سفرة».
 *  مظروفٌ واحد قد يظهر **مرّاتٍ**، مرّةً لكلّ رحلةٍ عليه. */
export function pastTrips(reserves: ReserveFund[]): { fund: ReserveFund; trip: Trip }[] {
  const out: { fund: ReserveFund; trip: Trip }[] = [];
  for (const fund of reserves) {
    if (!isTripEligibleFund(fund)) continue;
    for (const trip of fund.trips ?? []) {
      if (trip.startedAt && trip.endedAt) out.push({ fund, trip });
    }
  }
  return out.sort((a, b) => (a.trip.endedAt! < b.trip.endedAt! ? 1 : a.trip.endedAt! > b.trip.endedAt! ? -1 : 0));
}
