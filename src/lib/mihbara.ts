/**
 * **المحبرة — مقاعدُ الرفّ.**
 *
 * كان هنا حسابُ مسار المعرفة كذلك (`pathSteps` · `stepFill` · `sourceLabel` ·
 * `benefitsOf` · `looseBenefits`): بُني نقيّاً ومختبَراً ولم يُعرض في شاشةٍ
 * قطّ، فحُذف بقرارٍ صريح بعد مراجعةٍ شاملة. **بياناتُه باقية**
 * (`knowledgeSources` و`benefits` في `AppData` والنسخِ الاحتياطي والدمج)،
 * وتاريخُه في `git` كاملاً.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { Book } from "./types";

/**
 * مقاعدُ الرفّ هذا العام: مقعدٌ لكلّ كتابٍ خُتم، والباقي **يبقى خالياً** —
 * الخانةُ الفارغة أصدقُ من شريطِ تقدّمٍ يوهم بالاقتراب.
 */
export function shelfSeats(books: Book[], year: number, goal: number): { filled: number; goal: number } {
  const finished = books.filter(
    (b) => b.status === "أنهيت" && (b.finishDate || "").startsWith(String(year))
  ).length;
  return { filled: finished, goal: Math.max(0, goal) };
}
