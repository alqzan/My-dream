/**
 * **المحبرة** — مسارُ المعرفة من خمس درجات: التقاطٌ ← مصدرٌ ← فائدةٌ ← سؤالٌ
 * باقٍ ← تطبيق.
 *
 * الفكرةُ التي يقوم عليها الباب: **القراءةُ ليست إنجازاً حتى تصير عملاً.**
 * فالدرجاتُ ليست زينةً إحصائية — هي مرآةٌ تُري أين يتوقّف علمُك: إن كثرت
 * الفوائدُ وقلَّ التطبيقُ فأنت تجمع ولا تنتفع.
 *
 * نقيٌّ بلا DOM ولا متجر، كبقيّة `src/lib/*.ts`.
 */
import type { Benefit, Book, KnowledgeSource } from "./types";

export interface PathStep {
  key: string;
  label: string;
  value: number;
  hint: string;
  /** رمزُ لونٍ من طبقة التصميم. */
  color: string;
}

/**
 * درجاتُ المسار. `captures` عددُ ما التُقط بسرعةٍ (مذكراتُ المالك) — أوّلُ
 * الطريق قبل أن يصير المُلتقَطُ فائدةً محرَّرة.
 */
export function pathSteps(
  captures: number,
  sources: KnowledgeSource[],
  benefits: Benefit[]
): PathStep[] {
  return [
    { key: "capture", label: "التقاطٌ سريع", value: captures, hint: "ما قيّدتَه على عجل", color: "var(--ink34)" },
    { key: "source", label: "المصدر", value: sources.length, hint: "كتابٌ ومقالٌ ودرسٌ وتجربة", color: "var(--blue)" },
    { key: "benefit", label: "الفائدة", value: benefits.length, hint: "محرَّرةٌ بعبارتك", color: "var(--gold)" },
    {
      key: "question",
      label: "السؤالُ الباقي",
      value: benefits.filter((b) => (b.question || "").trim()).length,
      hint: "ما لم يتِمَّ بعد",
      color: "var(--clay)",
    },
    {
      key: "applied",
      label: "التطبيق",
      value: benefits.filter((b) => b.applied).length,
      hint: "دخلت في عمل",
      color: "var(--green)",
    },
  ];
}

/**
 * ارتفاعُ عمود الدرجة نسبةً إلى أعلاها — من ٦٪ إلى ٦٨٪ حتى تبقى الدرجةُ
 * الصفرية مرئيةً ولا تختفي.
 */
export function stepFill(step: PathStep, steps: PathStep[]): string {
  const max = Math.max(1, ...steps.map((x) => x.value));
  return `${Math.round((step.value / max) * 62) + 6}%`;
}

/** الفوائدُ التي لم تُطبَّق بعد — هي ما يستحقّ انتباهك في هذا الباب. */
export function looseBenefits(benefits: Benefit[]): Benefit[] {
  return benefits.filter((b) => !b.applied);
}

/**
 * اسمُ المصدر للعرض. يقبل معرّفاً من `knowledgeSources` **أو** من `books`
 * مباشرةً، لأنّ الفائدة قد تُلتقط من كتابٍ في الرفّ بلا إنشاء مصدرٍ له.
 */
export function sourceLabel(
  sourceId: string | undefined,
  sources: KnowledgeSource[],
  books: Book[]
): string {
  if (!sourceId) return "بلا مصدرٍ بعد";
  const src = sources.find((s) => s.id === sourceId);
  if (src) return `${src.kind} · ${src.name}`;
  const book = books.find((b) => b.id === sourceId);
  if (book) return `كتاب · ${book.title}`;
  // مصدرٌ حُذف والفائدةُ باقية — لا نُخفي الفائدة ولا نرمي.
  return "مصدرٌ محذوف";
}

/** عددُ الفوائد المستخلَصة من مصدرٍ بعينه. */
export function benefitsOf(sourceId: string, benefits: Benefit[]): number {
  return benefits.filter((b) => b.sourceId === sourceId).length;
}

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
