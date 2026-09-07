// ===================== ملء الشاشة — واجهةُ منصّة =====================
// «ملء الشاشة» في المتصفّح شيئان مختلفان: طبقةٌ تغطّي نافذةَ الموقع
// (`position: fixed; inset: 0`) — وهي ما كان عندنا — و**ملءٌ حقيقيّ** يطوي معه
// شريطَ العنوان وشريطَ النظام فلا يبقى إلا الوجه. الثاني يحتاج `Fullscreen API`
// وإذناً من إيماءةِ المستخدم نفسها.
//
// وهو محبوسٌ هنا خلف ثلاث دوالّ لأنّه **ينكسر في الغلاف الأصليّ**: iOS Safari
// على الجوّال لا يدعم `requestFullscreen` أصلاً، وفي Capacitor يقابله ملحقٌ
// أصليّ (شريطُ الحالة والـimmersive mode). فالمكوّن ينادي هذه الواجهة ولا يعرف
// أيّهما تحته — ويوم النقل يُستبدل التنفيذ هنا وحده (راجع `docs/APP-STORE-PLAN.md`).
//
// وكلُّ نداءٍ يبتلع خطأه: رفضُ المتصفّح ملءَ الشاشة ليس عطلاً يُبلَّغ للمستخدم —
// الطبقةُ الغاطية تعمل على كلّ حال، والملءُ الحقيقيّ زيادةٌ حيث توجد.

export function fullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return typeof document.documentElement.requestFullscreen === "function";
}

/** يُنادى من داخل إيماءة المستخدم (نقرةِ الفتح) وإلا رفضه المتصفّح. */
export async function enterFullscreen(el?: Element | null): Promise<boolean> {
  if (!fullscreenSupported()) return false;
  try {
    await (el ?? document.documentElement).requestFullscreen?.({ navigationUI: "hide" });
    return true;
  } catch { return false; }
}

export async function exitFullscreen(): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch { /* ignore */ }
}
