// ===================== حفظُ ملفٍّ — واجهةُ منصّة =====================
// **أخطرُ بندٍ في خطّة النقل، لأنّه ينكسر صامتاً.** حفظُ ملفٍّ في المتصفّح
// ‏`URL.createObjectURL` + `<a download>` + `click()` — وفي WKWebView (الغلافُ
// الأصليّ) **لا يفعل شيئاً: لا تنزيل ولا خطأ ولا رسالة**. فالمالكُ يضغط «صدّر
// نسخة احتياطية» ويظنّ أنّه أخذها، ولم يأخذ شيئاً. ويقابله في Capacitor
// `@capacitor/filesystem` + `@capacitor/share` — وورقةُ المشاركة الأصلية تجربةٌ
// أفضل من التنزيل أصلاً (راجع `docs/APP-STORE-PLAN.md` §3.1).
//
// **وكانت أربعةَ نسخٍ متفرّقة** (النسخة الكاملة · نسخةُ الأمان السريعة · تصديرُ
// الملخّص · حفظُ رسم الحفظ)، والخطّةُ تذكر واحدةً منها. جُمعت هنا في موضعٍ واحد
// يُبدَّل مرّةً — وإصلاحُ واحدةٍ لم يعد يترك ثلاثاً صامتة.

/** احفظ `blob` باسم `filename`. يرجع `false` إن لم يكن ثمّ بيئةُ متصفّح. */
export function saveFile(filename: string, blob: Blob): boolean {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    return true;
  } finally {
    // إبطالٌ مؤجَّلٌ بإطار: بعضُ المتصفّحات تبدأ التنزيل بعد انتهاء هذه الدورة،
    // فإبطالٌ فوريّ يقطعه. (كان أحدُ المواضع يُبطل فوراً والآخر بـ`setTimeout`.)
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** احفظ نصّاً — الغلافُ الشائع فوق `saveFile`. */
export function saveTextFile(filename: string, text: string, type = "text/plain"): boolean {
  return saveFile(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}
