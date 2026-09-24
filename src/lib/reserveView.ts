// ===================== عرضُ المظاريف بأدوارها =====================
// ثلاثةُ أوعيةٍ مختلفةِ العمل كانت تُرسم أقراصاً متماثلة في صفٍّ واحد (٠٫١٫٤٦٣)،
// فبدا «عام» بمئتي ألف كمظروفِ هدايا، و«الفوائض» — التي تسدّ عجز اليومية وحدها
// — كأنّها هدفٌ يُملأ. هنا تُفصل بالدور لا بالاسم (`reserveFundRole`)، ويُحسب لكلٍّ
// «آخرُ حركة» تقول ماذا يفعل هذا الوعاء فعلاً. نقيٌّ بلا DOM.

import type { ReserveFund, Transaction } from "./types";
import { reserveFundRole } from "./reserveFunds";
import { reserveShare } from "./utils";

export interface ReserveGroups {
  /** «عام» — المدّخر: تُدفع منه الصدماتُ الكبيرة لا المصروفُ اليومي. */
  general: ReserveFund | null;
  /** «الفوائض» — وسادةُ اليومية: تسدّ العجز ويصبّ فيها فائضُ كلّ دورة. */
  surplus: ReserveFund | null;
  /** مظاريفُ الأهداف (سفر، هدايا…) — بترتيبها الأصليّ. */
  goals: ReserveFund[];
}

export function groupReserves(reserves: readonly ReserveFund[]): ReserveGroups {
  const out: ReserveGroups = { general: null, surplus: null, goals: [] };
  for (const f of reserves) {
    const role = reserveFundRole(f);
    if (role === "general" && !out.general) out.general = f;
    else if (role === "surplus" && !out.surplus) out.surplus = f;
    else out.goals.push(f);
  }
  return out;
}

export interface FundMovement {
  date: string;
  /** موجبٌ داخل، سالبٌ خارج (إيداعٌ سالب أو صرفٌ منه). */
  amount: number;
  note: string;
}

/** آخرُ حركةٍ على المظروف: إيداعٌ أو سحبٌ يدويّ أو مصروفٌ دُفع منه — الأحدثُ
 *  تاريخاً، وعند التعادل الخارجُ أوّلاً (هو ما يُسأل عنه: «من أين دُفع؟»). */
export function lastMovement(fund: ReserveFund, transactions: readonly Transaction[]): FundMovement | null {
  let best: FundMovement | null = null;
  const consider = (m: FundMovement) => {
    if (!best || m.date > best.date || (m.date === best.date && m.amount < 0 && best.amount >= 0)) best = m;
  };
  for (const d of fund.deposits ?? []) {
    if (d.amount) consider({ date: d.date, amount: d.amount, note: d.note ?? "" });
  }
  for (const t of transactions) {
    const share = reserveShare(t, fund.id);
    // حصّةٌ سالبة = استردادٌ عاد إلى المظروف، فهو داخلٌ لا خارج.
    if (share !== 0) consider({ date: t.date, amount: -share, note: t.note ?? "" });
  }
  return best;
}
