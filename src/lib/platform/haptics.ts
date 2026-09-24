import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle } from "@capacitor/haptics";

// ===================== الاهتزاز — واجهةُ منصّة =====================
// نقرةٌ خفيفة عند فعلٍ مُرضٍ (عادةٌ أُنجزت، صلاةٌ سُجّلت). و`navigator.vibrate`
// **ميتٌ كلياً على iOS**: لا WKWebView يدعمها ولا Safari الجوّال، فالنقرةُ
// تختفي بصمتٍ حيث يقضي المالكُ وقتَه. ويقابلها في Capacitor
// `@capacitor/haptics` بنقرةٍ أصلية حقيقية (راجع `docs/APP-STORE-PLAN.md` §3.3).
//
// محبوسةٌ هنا لتُبدَّل مرّةً واحدة — و`utils.ts` (أعلى ملفٍّ فانْ-إنْ في المشروع)
// لا يبقى ممسكاً بـ`navigator`.
export function buzz(ms = 12): void {
  try {
    if (Capacitor.isNativePlatform()) {
      void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      return;
    }
    if (typeof navigator === "undefined") return;
    navigator.vibrate?.(ms);
  } catch {
    /* غيرُ مدعوم أو محظور — النقرةُ زينةٌ لا وظيفة */
  }
}
