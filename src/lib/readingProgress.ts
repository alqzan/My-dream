// ===================== تقدُّمُ الكتاب بعد تسجيل قراءة — المصدر الوحيد =====
// سؤالٌ واحد: «قرأتُ كذا صفحةً في هذا الكتاب — أين صرتُ منه، وهل أنهيتُه؟»
//
// كان يُجاب داخل `ReadingLogForm` بسطرٍ واحد: `Math.min(current + pages,
// totalPages)`. والسطرُ يفترض أنّ `totalPages` عددٌ معروف — وليس كذلك: نموذجُ
// الكتاب لا يُلزم به (`parseInt("") || 0`)، فالكتابُ بلا عددٍ يُحفَظ بصفر.
// وحينها `Math.min(30, 0) = 0` — فيرجع تقدُّمُ الكتاب إلى **الصفر** مع كلّ
// تسجيل ولا يتقدّم أبداً. بقيّةُ الواجهة كانت تحرس هذه الحالة كلُّها
// (`BookCard` · `ReadingJourney` · شريطُ التقدّم · شرطُ «أنهيت» في السطر الذي
// يليه مباشرةً)؛ الموضعُ الوحيد الذي **يكتب** كان الوحيد بلا حارس.
//
// نقيٌّ بلا DOM ولا متجر (يعبر إلى الغلاف الأصليّ كما هو)، ومختبَرٌ في
// `readingProgress.test.ts`.
import type { Book } from "./types";

export interface BookAdvance {
  currentPage: number;
  status?: Book["status"];
  finishDate?: string;
}

/**
 * تقدُّمُ الكتاب بعد قراءة `pages` صفحة في يوم `date`.
 *
 *  • بعددِ صفحاتٍ معروف: يُجمَع ولا يتجاوز الغلاف، وبلوغُ الغلاف يختم الكتاب.
 *  • بلا عددٍ معروف (`totalPages <= 0`): يُجمَع بلا سقف، ولا يُختم الكتاب —
 *    لا سبيل لمعرفة أنّه انتهى، و«أنهيت» قرارُ القارئ من نموذج الكتاب.
 *  • صفحاتٌ غيرُ صالحة (صفر · سالبة · `NaN` من حقلٍ نصّيّ): لا حركة.
 */
export function advanceBookPage(book: Book, pages: number, date: string): BookAdvance {
  const read = Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0;
  const from = Number.isFinite(book.currentPage) && book.currentPage > 0 ? book.currentPage : 0;
  const total = Number.isFinite(book.totalPages) ? book.totalPages : 0;
  const next = from + read;
  if (total <= 0) return { currentPage: next };
  const currentPage = Math.min(next, total);
  return currentPage >= total
    ? { currentPage, status: "أنهيت", finishDate: date }
    : { currentPage };
}
