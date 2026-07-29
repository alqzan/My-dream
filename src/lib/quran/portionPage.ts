// ===================== المقطع في أوجهه من المصحف =====================
// الحفظ من المصحف الورقيّ أثبت لأنّ العين تحفظ **صورة الوجه**: أين وقعت الآية،
// وما الذي قبلها وبعدها على الورقة نفسها. فإذا جُرّد المقطع من وجهه وعُرض
// قائمةَ آياتٍ متّصلة سقطت تلك الصورة، ولم يبقَ إلا حفظُ الصوت.
//
// هذا الملفّ يقسم أيّ مقطعٍ (fromId..toId) إلى الأوجه التي يقع فيها، ويعطي لكلّ
// وجهٍ مداه الكامل ومدى المقطع داخله — فتُعرض الآيات **في وجهها** مع سياقها.
// حسابٌ نقيّ (بلا DOM ولا React) كسائر `src/lib/quran/*`.
import { pageRange, idToPage } from "./meta";
import { pageSide, type PageSide } from "./page";

export interface PortionPage {
  page: number; // رقم الوجه (1..604)
  side: PageSide; // يمنى/يسرى في الوجه المفتوح
  start: number; // أوّل آية في الوجه
  end: number; // آخر آية في الوجه
  fromId: number; // أوّل آيةٍ من المقطع في هذا الوجه
  toId: number; // آخر آيةٍ منه فيه
  whole: boolean; // المقطع يستغرق الوجه كلّه (فلا سياق حوله)
}

// أوجهُ المقطع بالترتيب. مقطعٌ داخل وجهٍ واحد → عنصرٌ واحد؛ وعابرٌ لوجهين →
// عنصران، لكلٍّ حصّتُه من المقطع ومداه الكامل.
export function portionPages(fromId: number, toId: number): PortionPage[] {
  const a = Math.min(fromId, toId);
  const b = Math.max(fromId, toId);
  const out: PortionPage[] = [];
  for (let p = idToPage(a); p <= idToPage(b); p++) {
    const { start, end } = pageRange(p);
    const f = Math.max(a, start);
    const t = Math.min(b, end);
    out.push({ page: p, side: pageSide(p), start, end, fromId: f, toId: t, whole: f === start && t === end });
  }
  return out;
}

// عدد الأوجه التي يمتدّ عليها المقطع.
export function pageSpan(fromId: number, toId: number): number {
  return idToPage(Math.max(fromId, toId)) - idToPage(Math.min(fromId, toId)) + 1;
}

// آيةُ التلقين **داخل الوجه نفسه**: الآية التي قبل بداية المقطع إن كانت في وجهه.
// حين تكون موجودة يغني السياق المرسوم عن بطاقة التلقين المنفصلة — فالآية
// السابقة ظاهرةٌ في موضعها من الوجه كما في المصحف. وإن كان المقطع يبدأ الوجه
// فلا تلقين على الورقة، فتُعرض البطاقة.
export function leadOnPage(fromId: number): number | null {
  if (fromId <= 1) return null;
  const prev = fromId - 1;
  return idToPage(prev) === idToPage(fromId) ? prev : null;
}
