import type { ReactNode } from "react";

// عنوانٌ خفيفٌ يجمّع البطاقات بصريًّا — مسمّى مكتوم صغير مع خيطٍ ذهبيٍّ باهتٍ
// يمتدّ جانبًا. ليس شريطًا ثقيلًا؛ فقط يقسّم الصفحة فصولًا للعين.
//
// أُخرج من صفحة الأموال ليشترك فيه هو والرئيسية: كلتاهما صفحةٌ طويلة من بطاقاتٍ
// متساوية الوزن بصريًّا، وهذا الفاصلُ هو ما يمنحها هرميّةً بلا إضافة ثقل.
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pt-2 -mb-1">
      <h2 className="shrink-0 text-xs font-semibold tracking-wide text-gray-400">{children}</h2>
      <span className="h-px flex-1 bg-brand-500/25" aria-hidden />
    </div>
  );
}
