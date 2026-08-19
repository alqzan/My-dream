/**
 * تنسيقُ الأرقام في الشاشات المنقولة من تصميم مدار.
 *
 * **القاعدةُ الآن: الأرقام كلُّها هندية** — بقرار المالك، والمبالغُ منها.
 * (كانت `CLAUDE.md` تقول «لاتينية» وكان `github.md` يستثني المبالغ؛ حُسم
 * الأمر إلى الهندية في كلّ موضع، وحُدِّثت `CLAUDE.md` تبعاً لذلك.)
 *
 * التحويلُ نفسُه في `utils.ts#toIndicDigits` — **بوّابةٌ واحدةٌ لا نسختان**،
 * فلا يفترق سلوكُ شاشةٍ منقولةٍ عن شاشةٍ لم تُنقل بعد. وما هنا لفٌّ لها بصيغٍ
 * يحتاجها التصميم (عدٌّ عربيّ · نسبة · ساعة · تاريخٌ هجريٌّ بلا سنة).
 *
 * **لا تُمرّر على هذه الدوالّ قيمةً تُخزَّن أو تُقارَن** — مفاتيحُ التواريخ
 * والمعرّفاتُ تبقى لاتينيةً كما هي؛ هذه للعرض وحده.
 */
import { toIndicDigits, arabicCount, formatAmount } from "../utils";

export { toIndicDigits };

/** عددٌ للعرض — هنديّ. */
export function arNum(n: number): string {
  return toIndicDigits(String(n));
}

/**
 * عدٌّ عربيٌّ صحيحُ الصيغة. لفٌّ لـ`arabicCount` في `utils.ts` (وهي هنديةٌ
 * أصلاً الآن) حتى لا يكون لصياغة المفرد/المثنّى/الجمع تعريفان.
 */
export const arCount = arabicCount;

/** نسبةٌ مئوية بأرقامٍ هندية، بلا كسور. */
export function arPct(ratio: number): string {
  return `${arNum(Math.round(ratio * 100))}٪`;
}

/** مبلغٌ ماليّ — هنديٌّ كبقيّة الأرقام (`formatAmount` تُخرجه هندياً الآن). */
export const arAmount = formatAmount;

/**
 * وقتٌ للعرض. `formatClock` صارت هنديةً في `utils.ts`، فهذه تُبقي موضعَ
 * النداء واحداً في الشاشات المنقولة ولا تحوّل مرّتين.
 */
export function arClock(d: Date, format: (d: Date) => string): string {
  return toIndicDigits(format(d));
}

/** تاريخٌ هجريٌّ بلا سنةٍ — «٦ ربيع الأول». */
export function arHijriDayMonth(hijri: string): string {
  return toIndicDigits(hijri.replace(/\s*[\d٠-٩]+\s*هـ\s*$/, "").trim());
}

/**
 * مدّةٌ مختصرةٌ للعرض: ساعاتٌ إن بلغت الستّين، وإلّا دقائق — «بعد ١١ ساعة»
 * أو «منذ ٤٠ د». تأخذ الدقائقَ، والاتّجاهُ من نداءِ المستدعي.
 */
export function arSpan(minutes: number): string {
  const v = Math.abs(Math.round(minutes));
  if (v < 60) return `${arNum(v)} د`;
  const h = Math.round(v / 60);
  return arCount(h, { one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" });
}
