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

const PHASES: [number, string][] = [
  [0.1, "الفجر"],
  [0.46, "الضحى"],
  [0.7, "العصر"],
  [0.88, "المغرب"],
  [1.01, "العشاء"],
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

/** اسمُ الطور من نسبة النهار. */
export function phaseOf(frac: number): string {
  return (PHASES.find((x) => frac < x[0]) ?? PHASES[4])[1];
}

export function dialGeometry(frac: number): DialGeometry {
  const f = Math.max(0, Math.min(1, frac));
  // الشاخصُ في المنتصف، وظلُّه يطول كلّما مالت الشمسُ إلى أحد الطرفين.
  const shadowLen = Math.min(1, Math.max(0.22, Math.abs(f - 0.5) * 2.6));
  const shadowDx = (f >= 0.5 ? 1 : -1) * shadowLen * 132;
  const sunY = 44 - 112 * f * (1 - f);
  const sunAlt = Math.max(0, (47 - sunY) / 31);
  const down = f > 0.84 || f < 0.04;
  const shadowOpacity = down ? 0 : +(0.07 + 0.34 * sunAlt).toFixed(2);
  const tipX = 160 + shadowDx;
  const near = DIAL_TICKS.reduce(
    (best, t, k) => (Math.abs(t[0] - tipX) < Math.abs(DIAL_TICKS[best][0] - tipX) ? k : best),
    0
  );

  return {
    frac: f,
    phase: phaseOf(f),
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
