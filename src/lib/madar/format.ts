/**
 * تنسيقُ الأرقام في الشاشات المنقولة من تصميم مدار.
 *
 * **قاعدةٌ فيها تعارضٌ محسوم هنا في موضعٍ واحد:** `CLAUDE.md` يقول «أرقامٌ
 * لاتينية» ويقصد بها المبالغ (`formatAmount` عبر `ar-SA-u-nu-latn`)، بينما
 * ملفُّ المزامنة `github.md` في مشروع التصميم يقرّر: **هنديةٌ للأعداد
 * والتواريخ، ولاتينيةٌ للمبالغ المالية**. والتصميمُ المصدر يرسم الأعدادَ
 * هنديةً فعلاً (`٣ من ٧ أيام` · `آخرُ ثلاثين ليلة`).
 *
 * فكلُّ عددٍ في الشاشات المنقولة يمرّ من `arNum` وحدَها، ولا يُكتب رقمٌ
 * بيدك في مكوّن. إن قرّر المالكُ لاحقاً العكسَ فالعدولُ سطرٌ واحد هنا،
 * لا مراجعةُ خمسِ شاشات.
 *
 * المبالغُ لا تمرّ من هنا أبداً — لها `formatAmount` في `utils.ts`.
 */

const INDIC = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];

/** حوّل كلَّ رقمٍ لاتينيٍّ في النصّ إلى هنديّ. */
export function toIndicDigits(s: string): string {
  return s.replace(/[0-9]/g, (d) => INDIC[Number(d)]);
}

/** عددٌ للعرض في الشاشات المنقولة — هنديٌّ بحسب التصميم. */
export function arNum(n: number): string {
  return toIndicDigits(String(n));
}

/**
 * عدٌّ عربيٌّ صحيحُ الصيغة بأرقامٍ هندية — نظيرُ `arabicCount` في `utils.ts`
 * الذي يُخرج أرقاماً لاتينية. نلفُّه بدل أن ننسخ منطقَ الصيغ.
 */
export function arCount(
  n: number,
  forms: { zero?: string; one: string; two: string; few: string; many: string }
): string {
  if (n === 0) return forms.zero ?? `${arNum(0)} ${forms.few}`;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n <= 10) return `${arNum(n)} ${forms.few}`;
  return `${arNum(n)} ${forms.many}`;
}

/** نسبةٌ مئوية بأرقامٍ هندية، بلا كسور. */
export function arPct(ratio: number): string {
  return `${arNum(Math.round(ratio * 100))}٪`;
}

/**
 * وقتٌ للعرض في الشاشات المنقولة. `formatClock` في `utils.ts` تُخرج أرقاماً
 * لاتينية (`nu-latn`) عمداً لبقيّة التطبيق؛ والتصميمُ يكتب المواقيتَ هنديةً
 * («الفجر ٤:٥٢»)، فنحوّلها هنا بدل أن نُنشئ منسّقاً ثانياً.
 */
export function arClock(d: Date, format: (d: Date) => string): string {
  return toIndicDigits(format(d));
}

/** تاريخٌ هجريٌّ بلا سنةٍ وبأرقامٍ هندية — «٦ ربيع الأول». */
export function arHijriDayMonth(hijri: string): string {
  return toIndicDigits(hijri.replace(/\s*\d+\s*هـ\s*$/, "").trim());
}

/**
 * مدّةٌ مختصرةٌ للعرض: ساعاتٌ إن بلغت الستّين، وإلّا دقائق — «بعد ١١ ساعة»
 * أو «منذ ٤٠ د». تأخذ الدقائقَ المطلقة، والاتّجاهُ من نداءِ المستدعي.
 */
export function arSpan(minutes: number): string {
  const v = Math.abs(Math.round(minutes));
  if (v < 60) return `${arNum(v)} د`;
  const h = Math.round(v / 60);
  return arCount(h, { one: "ساعة", two: "ساعتين", few: "ساعات", many: "ساعة" });
}
