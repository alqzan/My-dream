/* eslint-disable @next/next/no-img-element */
// ===================== صورةُ المستخدم — `<img>` المُعتمَد الوحيد =====================
// **لماذا `<img>` لا `next/image`؟** القاعدة `@next/next/no-img-element` تفترض
// صوراً يعرفها الخادم مسبقاً ويحسّنها. صورُ هذا التطبيق ليست كذلك:
//
//   • **`data:` URLs**: الوسائط تُدرَج بايتاتٍ في المتجر (`inlineCachedMedia`)
//     كي لا يتعلّق العرضُ برابطٍ حيّ ولا بانتهاء صلاحيته ولا بـCORS — وهذا هو
//     ما يجعل المذكرات تُقرأ بلا شبكة. و`next/image` لا يقبل `data:` مصدراً.
//   • **`blob:` URLs**: معاينةُ صورةٍ قبل ضغطها ورفعها.
//   • **روابط R2/Storage**: مصادر خارجية عابرة، لا مسارات ثابتة تُعرف وقت البناء.
//   • **`output: "export"`**: موقعٌ ثابت بلا خادم صور — فالتحسين متعطّلٌ أصلاً
//     (`images.unoptimized` في `next.config.ts`). لن يزيد `next/image` شيئاً هنا
//     غير غلافٍ يطلب `width`/`height` بينما الأبعاد كلّها من CSS
//     (`object-cover` داخل صندوقٍ بنسبةٍ ثابتة).
//
// فالقاعدة معطّلةٌ **هنا وحدها**، بسطرٍ واحد في أعلى هذا الملفّ ومعه سببُه —
// كانت متناثرةً `eslint-disable-next-line` في مكانين وباقيةً تحذيراً في ثلاثة.
// **لا تُعطَّل القاعدة عالمياً** (في `.eslintrc.json`): صورةٌ ثابتة تُضاف يوماً
// إلى الواجهة يجب أن تُنبَّه عليها كالمعتاد.
//
// وهذا ليس غلافاً شكلياً: هو أيضاً موضعُ الافتراضات المشتركة (`loading`
// و`decoding`)، ونقطةُ التبديل الواحدة عند النقل إلى Capacitor.

type NativeImgProps = Omit<React.ComponentProps<"img">, "alt" | "src">;

export function AppImage({
  src,
  alt,
  loading = "lazy",
  decoding = "async",
  ...rest
}: NativeImgProps & {
  /** `data:` أو `blob:` أو رابط R2 — راجع أعلاه. */
  src: string;
  /** إلزاميّ: نصٌّ بديل، أو `""` صراحةً للصور الزخرفية. */
  alt: string;
}) {
  return <img src={src} alt={alt} loading={loading} decoding={decoding} {...rest} />;
}
