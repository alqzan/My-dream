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
  const norm = (s: string) => (s.length > 1 ? s.replace(/\/+$/, "") : s);
  return (
    params.visible &&
    params.pending === params.target &&
    norm(params.currentPath) !== norm(params.target)
  );
}
