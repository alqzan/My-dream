/**
 * **المزولة** — قوسُ النهار وشاخصٌ يرمي ظلَّه على ساعةِ الآن.
 *
 * التصميمُ المصدر يقودها بساعةٍ وهميةٍ تُقدَّم بالضغط (نموذج). هنا تُقاد
 * **بمواقيت جهازك الحقيقية**: النهارُ من الفجر إلى العشاء، وموضعُ الشمس نسبةُ
 * ما مضى منه. فالمزولةُ تقول لك أين أنت من يومك، لا أين أنت من رسمة.
 *
 * نقيٌّ بلا DOM ولا متجر — يقبل الأوقاتَ محسوبةً ويُخرج هندسةً.
 */

/** لوحةُ الرسم في التصميم: ٣٢٠ × ٦٢. */
export const DIAL_W = 320;
export const DIAL_H = 62;

/** علاماتُ الساعات الخمس على خطّ الأرض. */
export const DIAL_TICKS: [number, number][] = [
  [14, 40], [87, 43], [160, 40], [233, 43], [306, 40],
];



export interface DialGeometry {
  /** نسبةُ ما مضى من النهار (٠..١). */
  frac: number;
  phase: string;
  sunX: number;
  sunY: number;
  /** الشمسُ مخفيّةٌ قبل الفجر وبعد المغرب. */
  sunVisible: boolean;
  /** رباعيُّ الظلّ (`points` لـ`<polygon>`). */
  shadow: string;
  shadowOpacity: number;
  gnomonOpacity: number;
  /** مسارُ العلامات الخافتة. */
  ticksDim: string;
  /** العلامةُ التي يقع عليها رأسُ الظلّ الآن — فارغةٌ إن غابت الشمس. */
  tickOn: string;
}

/**
 * نسبةُ ما مضى من النهار. النهارُ من الفجر إلى العشاء لا من الشروق إلى
 * الغروب: مدارٌ يقيس يومَ المصلّي لا يومَ الفلكيّ.
 */
export function dayFraction(now: Date, fajr: Date, isha: Date): number {
  const span = isha.getTime() - fajr.getTime();
  if (span <= 0) return 0;
  const f = (now.getTime() - fajr.getTime()) / span;
  return Math.max(0, Math.min(1, f));
}

/**
 * اسمُ الطور — **من المواقيت لا من كسورٍ ثابتة**. كان «العشاء» يُكتب عند ٨٨٪
 * من المدى، فيُقال لك عشاءٌ والمغربُ لم يؤذَّن بعد. الحدودُ الآن هي الشروقُ
 * والمغربُ أنفسُهما.
 */
export function phaseOf(frac: number, win: { rise: number; set: number } = { rise: 0.1, set: 0.88 }): string {
  if (frac < win.rise) return "الفجر";
  if (frac < win.rise + (win.set - win.rise) * 0.5) return "الضحى";
  if (frac < win.set) return "العصر";
  if (frac < 1) return "المغرب";
  return "العشاء";
}

/**
 * نافذةُ الشمس على محور المزولة نفسِه: كسرا الشروق والمغرب من مدى الفجر→العشاء.
 * **الظلُّ ظلُّ شمسٍ حقيقية**، فلا يُقاس غيابُها بكسرٍ اعتباطيّ: كان الحدُّ
 * `frac > 0.84` فتغيب الشمسُ ويختفي الظلُّ قرابةَ الساعة قبل المغرب — والمالك
 * ينظر إلى مزولةٍ فارغةٍ والشمسُ بعدُ في السماء.
 */
export function sunWindow(fajr: Date, isha: Date, sunrise: Date, maghrib: Date): { rise: number; set: number } {
  const span = isha.getTime() - fajr.getTime();
  if (span <= 0) return { rise: 0, set: 1 };
  const at = (d: Date) => Math.max(0, Math.min(1, (d.getTime() - fajr.getTime()) / span));
  const rise = at(sunrise);
  const set = at(maghrib);
  // مدًى معدومٌ (بياناتٌ شاذّة) لا يقسم على صفر ولا يقلب الترتيب.
  return set > rise ? { rise, set } : { rise: 0, set: 1 };
}

/**
 * `win` نافذةُ الشمس (شروقها وغروبها) على المحور نفسِه. الشمسُ ترتفع من الأفق
 * عند الشروق وتعود إليه عند المغرب، والظلُّ يطول كلّما مالت — ويختفي الاثنان
 * معاً خارج النافذة لا قبلها.
 */
export function dialGeometry(frac: number, win: { rise: number; set: number } = { rise: 0.04, set: 0.84 }): DialGeometry {
  const f = Math.max(0, Math.min(1, frac));
  const down = f < win.rise || f > win.set;
  // موضعُ الشمس في قوسها هي: ٠ عند الشروق و١ عند المغرب، فذروتُها ظهرٌ حقيقيّ.
  const u = Math.max(0, Math.min(1, (f - win.rise) / Math.max(1e-6, win.set - win.rise)));
  // الشاخصُ في المنتصف، وظلُّه يطول كلّما مالت الشمسُ إلى أحد الطرفين.
  const shadowLen = Math.min(1, Math.max(0.22, Math.abs(u - 0.5) * 2.6));
  const shadowDx = (u >= 0.5 ? 1 : -1) * shadowLen * 132;
  const sunY = 44 - 112 * u * (1 - u);
  const sunAlt = Math.max(0, (47 - sunY) / 31);
  const shadowOpacity = down ? 0 : +(0.07 + 0.34 * sunAlt).toFixed(2);
  const tipX = 160 + shadowDx;
  const near = DIAL_TICKS.reduce(
    (best, t, k) => (Math.abs(t[0] - tipX) < Math.abs(DIAL_TICKS[best][0] - tipX) ? k : best),
    0
  );

  return {
    frac: f,
    phase: phaseOf(f, win),
    sunX: +(306 - f * 292).toFixed(1),
    sunY: +sunY.toFixed(1),
    sunVisible: !down,
    shadow: `160,43.5 160,50.5 ${tipX.toFixed(1)},49 ${tipX.toFixed(1)},46`,
    shadowOpacity,
    gnomonOpacity: down ? 0.3 : 0.72,
    ticksDim: DIAL_TICKS.filter((_, k) => k !== near || !shadowOpacity)
      .map((t) => `M${t[0]} 47 L${t[0]} ${t[1]}`)
      .join(" "),
    tickOn: shadowOpacity ? `M${DIAL_TICKS[near][0]} 47 L${DIAL_TICKS[near][0]} ${DIAL_TICKS[near][1] - 4}` : "",
  };
}

/* ─────────────────────── القوسُ المستحقُّ الآن ─────────────────────── */

export type DueArc = "salah" | "quran" | "mal";

/**
 * أيُّ الأقواس الثلاثة يستحقُّ انتباهك الآن — **واحدٌ لا ثلاثة**: شاشةٌ
 * تصرخ بثلاثة نداءاتٍ لا تُقرأ. الترتيبُ ثابت: ما فات وقتُه أوّلاً (الصلاة)،
 * ثمّ ما له موعدٌ اليوم (المراجعة)، ثمّ ما يحتمل التأجيل (المال).
 */
export function dueArc(prayed: number, hifzDue: number): DueArc {
  if (prayed < 5) return "salah";
  if (hifzDue > 0) return "quran";
  return "mal";
}

export const DUE_ARC_LABEL: Record<DueArc, string> = {
  salah: "الصلاة",
  quran: "القرآن",
  mal: "المال",
};

/**
 * حجمُ خطِّ الرقم الكبير داخل القوس. النصُّ عربيٌّ قد يطول («تمَّ» · «اكتب»)،
 * فالمقاسُ يتبع طولَه بعد إسقاط الحركات — وإلّا فاض عن القوس.
 */
export function bigFitSize(text: string): number {
  const n = [...String(text)].filter((c) => !/[ً-ْ]/.test(c)).length;
  return n <= 2 ? 29 : n <= 3 ? 24 : n <= 4 ? 21 : n <= 5 ? 18 : 16;
}

/** ارتفاعُ ماء القوس (`y` في SVG) من نسبةِ امتلائه. */
export function fillY(ratio: number, height = 132): number {
  return +((1 - Math.max(0, Math.min(1, ratio))) * height).toFixed(1);
}
