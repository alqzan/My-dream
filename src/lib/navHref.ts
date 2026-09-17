// الشريط السفلي يكتب `href` أصلياً على الرابط (لا `next/link`) حتى تعمل النقرة
// قبل الترطيب ومع الضغط المطوّل و«فتح في تبويب». الانتقال نفسه يُعترض ويُحوّل
// إلى تنقّلٍ داخليّ — راجع `MobileNav`. هذه تُبقي مسار GitHub Pages الذي كان
// `next/link` يضيفه عنّا.
export function nativeNavHref(href: string, basePath = ""): string {
  const base = basePath.replace(/^\/+|\/+$/g, "");
  const normalizedBase = base ? `/${base}` : "";
  const normalizedHref = href.startsWith("/") ? href : `/${href}`;
  const withTrailingSlash =
    normalizedHref === "/" || normalizedHref.endsWith("/")
      ? normalizedHref
      : `${normalizedHref}/`;

  return `${normalizedBase}${withTrailingSlash}`;
}

/**
 * هل نتولّى هذه النقرة بأنفسنا (تنقّلٌ داخليّ) أم نتركها للمتصفّح؟
 *
 * نتركها للمتصفّح في كل ما ليس ضغطةً عاديّة على الزرّ الأيسر: زرٌّ أوسط أو أيمن،
 * أو مع Cmd/Ctrl (فتحٌ في تبويب جديد)، أو Shift (نافذة)، أو Alt (تنزيل) — فهذه
 * سلوكياتُ رابطٍ يملكها المستخدم ولا يجوز مصادرتها. و`defaultPrevented` تعني أن
 * أحداً سبقنا إلى النقرة (كإغلاق نافذةٍ منبثقة) فلا نبني قراراً فوق قراره.
 *
 * نقيّةٌ بلا DOM: تأخذ الحقول التي تهمّ فقط، فتُختبر وحدةً وتعبر إلى أيّ غلاف.
 */
export function isPlainClick(e: {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return (
    !e.defaultPrevented &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey
  );
}

/**
 * شبكةُ أمان التنقّل: هل نُسقط النقرة على انتقالٍ أصليّ؟
 *
 * لا نفعل إلا إذا بقيت النقرةُ هي الأحدث **و** لم نصل إلى وجهتها بعد **و**
 * الصفحةُ ما زالت أمام المالك. المهلةُ وحدها لا تكفي حكماً: على شبكةٍ بطيئة
 * تصل حمولةُ المسار متأخّرةً، فكان التنقّلُ الداخليّ يُقطَع بإعادةِ تحميلٍ
 * كاملة تُظهر شاشةَ «مدار» من جديد مع كلّ ضغطةِ تبويب — وهي العلّة نفسها التي
 * وُجدت الشبكةُ لتجنّبها. فالمهلةُ سخيّة، والإلغاءُ يقع فور وصول التنقّل.
 */
export function shouldHardNavigate(params: {
  pending: string | null;
  target: string;
  currentPath: string;
  visible: boolean;
}): boolean {
  return (
    params.visible &&
    params.pending === params.target &&
    normNavPath(params.currentPath) !== normNavPath(params.target)
  );
}

// ===== المهلةُ تُقاس من أوّل نقرةٍ معلّقة لا من آخرها =====
// حمولةُ المسار (`/prayers/index.txt?_rsc=…`) قد لا تصل أصلاً: شبكةُ جوّالٍ
// نائمة وعاملُ الخدمة لا يقود الصفحة بعد (أوّلُ فتحٍ بعد نشرة، أو بعد أن
// أخلى النظامُ تخزينَ الموقع). و`router.push` في App Router **بلا مهلة**:
// الصفحةُ القديمة تبقى معروضةً إلى الأبد بلا خطأ ولا إشارة — وهو بالضبط ما
// صوّره المالك: الشريطُ السفلي يُضيء التبويبَ المضغوط والشاشةُ لا تتغيّر.
//
// والشبكةُ كانت موجودةً ولا تُنقذ: كلُّ نقرةٍ جديدة تمسح مؤقّتَ التي قبلها
// وتبدأ المهلة من جديد. فمن يضغط كلَّ ثانيتين — وهو ما يفعله كلُّ من ضغط ولم
// يرَ شيئاً — **لا تنقضي عنده المهلةُ أبداً**. قِيس ذلك: خمسُ ضغطاتٍ متتابعة
// وحمولةُ المسار معلّقة ⇒ الشاشةُ على البهو بعد عشر ثوانٍ، ولا تنتقل حتى
// يتوقّف عن الضغط.
//
// فصارت المهلةُ **سقفاً مطلقاً** من أوّل نقرةٍ لم تصل: النقراتُ التالية
// تُبدّل الوجهة ولا تُمدّد المهلة.
export const SOFT_NAV_DEADLINE_MS = 6000;

// ونقرةٌ ثانية بعد صمتٍ بهذا الطول **خبرٌ لا نفادُ صبر**: تنقّلٌ سليم يصل في
// جزءٍ من الثانية (قِيس بين ٠٫٣ و١٫١ ثانية على معالجٍ مُبطَّأ ستّ مرّات)، فمن
// ضغط ثانيةً بعد ثانيةٍ ونصفٍ من السكون يخبرنا أنّ الداخليّ لم يقع. ننتقل
// أصلياً فوراً بلا انتظار السقف: إقلاعٌ كاملٌ ثمنُه ثوانٍ، والبقاءُ في مكاننا
// ثمنُه ألّا يصل المالك إلى قسمه أبداً.
export const IMPATIENT_RETAP_MS = 1500;

/** ما بقي من سقف المهلة — صفرٌ لا سالب، وسقفٌ كاملٌ لأوّل نقرة. */
export function remainingSoftNavMs(pendingSince: number | null, now: number): number {
  if (pendingSince === null) return SOFT_NAV_DEADLINE_MS;
  return Math.max(0, SOFT_NAV_DEADLINE_MS - (now - pendingSince));
}

/** هل هذه نقرةٌ ثانية على شاشةٍ لم تتحرّك؟ (فننتقل أصلياً الآن) */
export function isImpatientRetap(pendingSince: number | null, now: number): boolean {
  return pendingSince !== null && now - pendingSince >= IMPATIENT_RETAP_MS;
}

/**
 * مسارٌ بلا شرطةٍ أخيرة للمقارنة. `trailingSlash` في البناء الثابت يجعل
 * `usePathname()` تعيد `/journal/` بينما روابط التنقّل `/journal` — فبلا
 * التسوية لا يُضيء التبويبُ النشط إلا على الجذر.
 */
export function normNavPath(s: string): string {
  return s.length > 1 ? s.replace(/\/+$/, "") : s;
}
