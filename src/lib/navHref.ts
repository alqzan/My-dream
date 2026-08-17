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
