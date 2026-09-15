// ===================== تفضيلاتُ الجهاز — واجهةُ منصّة =====================
// `localStorage` هي تخزينُ «إعدادات هذا الجهاز» في المتصفّح: مفتاحُ المزامنة،
// بصمةُ القفل، موضعُ القراءة، تفضيلاتُ العرض. وهي **لا تعبر إلى الغلاف
// الأصليّ كما هي**: في WKWebView يمحوها النظامُ تحت ضغط التخزين، وفي Capacitor
// يقابلها `@capacitor/preferences`. فتُجمع هنا خلف واجهةٍ واحدة يُبدَّل تنفيذُها
// مرّةً بدل أن تُطارَد ٧٣ نداءً في ١١ ملفّاً (`docs/APP-STORE-PLAN.md` §3.2).
//
// **الواجهة متزامنة عمداً.** غيرُ المتزامنة كانت ستقلب كلّ متصلٍ رأساً على عقب
// (قراءةُ الثيم عند أوّل رسم، بصمةُ القفل قبل إظهار الشاشة). و
// `@capacitor/preferences` غيرُ متزامنة — فيوم النقل تُقرأ مرّةً عند الإقلاع
// إلى ذاكرةٍ داخلية وتُكتب خلفها، والواجهةُ هنا لا تتغيّر.
//
// **ولا ترمي أبداً.** كلُّ نداءٍ في `try/catch`: وضعُ التصفّح الخاصّ وحظرُ
// ملفّات المواقع يجعلان مجرّدَ لمس `localStorage` يرمي، والتفضيلُ ليس شيئاً
// يُسقط الشاشة من أجله. الغائبُ والمحظورُ سواءٌ عند المتصل: `null`.

/** هل التخزين متاحٌ أصلاً؟ (خادمٌ بلا نافذة، أو متصفّحٌ يحظره.)
 *
 *  يُقرأ من `globalThis` لا من `window`: عاملُ الخدمة ليس فيه `window`، والبناءُ
 *  الثابت يشغّل هذه الملفّات على Node وقتَ البناء. ومجرّدُ **لمسِ** الخاصيّة
 *  يرمي في وضع التصفّح الخاصّ وحظرِ ملفّات المواقع، فاللمسةُ نفسُها داخل الحارس. */
function store(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

function session(): Storage | null {
  try {
    return (globalThis as { sessionStorage?: Storage }).sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function prefGet(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function prefSet(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* ممتلئٌ أو محظور — التفضيلُ ليس بياناتٍ تُفقد */
  }
}

export function prefRemove(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* المثل */
  }
}

/** قراءةٌ وكتابةٌ لقيمةٍ JSON. القيمةُ التالفة تُعامَل معاملةَ الغياب — تفضيلٌ
 *  لا يُفهم لا يستحقّ أن يُسقط ما بُني عليه. */
export function prefGetJSON<T>(key: string): T | null {
  const raw = prefGet(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function prefSetJSON(key: string, value: unknown): void {
  try {
    prefSet(key, JSON.stringify(value));
  } catch {
    /* قيمةٌ لا تُسلسل (دَوْرٌ مرجعيّ) — تُتجاهل */
  }
}

/** جلسةُ التبويب وحدها (تُمحى بإغلاقه). موضعٌ واحد يستعملها: حالةُ فكّ القفل. */
export function sessionGet(key: string): string | null {
  try {
    return session()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function sessionSet(key: string, value: string): void {
  try {
    session()?.setItem(key, value);
  } catch {
    /* المثل */
  }
}

export function sessionRemove(key: string): void {
  try {
    session()?.removeItem(key);
  } catch {
    /* المثل */
  }
}
