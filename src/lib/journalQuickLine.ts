// ===================== السطرُ السريع: إلحاقٌ لا يضيع في الدمج =====================
// منذ ٠٫١٫٤٦٦ يُلحَق السطرُ السريع بمذكرة اليوم فقرةً في آخرها. لكنّ دمجَ
// المزامنة يحسم نصَّ المذكرة كلَّه بطابعها (`byIdNewer` في `merge.ts`): سطرٌ
// أُضيف على الجوّال وآخرُ على الآيباد في اليوم نفسه ⇒ يبقى نصُّ الأحدث وحدَه
// ويضيع الآخر بصمت. (قبل ٠٫١٫٤٦٦ كان كلُّ سطرٍ مذكرةً بمعرّفها فيتّحدان.)
//
// العلاج: لكلّ سطرٍ معرّفٌ يُحفظ مع المذكرة (`quickLines`)، ومعرّفاتُه **سجلٌّ
// لما عُلم** لا نصٌّ يُعرض — النصُّ في `content` كما كان. عند الدمج: سطرٌ يعرفه
// الخاسرُ ولا يعرفه الفائز لم يره الفائزُ قطّ ⇒ إضافةٌ متزامنة تُلحَق بنصّه.
// وسطرٌ يعرفه الطرفان ثمّ غاب عن نصّ الفائز ⇒ حذفه المالك عمداً فلا يعود.
// والتراجعُ يزيل الفقرةَ وحدها ويُبقي المعرّف، فلا يُعيدها جهازٌ رآها.
//
// نقيّ: لا React ولا DOM.

import type { JournalEntry, JournalQuickLine } from "./types";

type QuickFields = Pick<JournalEntry, "content" | "quickLines">;

/** يُلحق فقرةَ السطر بآخر النصّ ويسجّل معرّفه. */
export function appendQuickLine(entry: QuickFields, line: JournalQuickLine): Required<QuickFields> {
  const content = entry.content.trim() ? `${entry.content.trimEnd()}\n\n${line.text}` : line.text;
  const known = entry.quickLines ?? [];
  const quickLines = known.some((q) => q.id === line.id) ? known : [...known, line];
  return { content, quickLines };
}

/** يزيل فقرةَ السطر (آخرَ ظهورٍ لها) من النصّ — **ويُبقي معرّفه** معلوماً. */
export function removeQuickLine(entry: QuickFields, id: string): Pick<JournalEntry, "content"> {
  const line = entry.quickLines?.find((q) => q.id === id);
  if (!line) return { content: entry.content };
  const paras = entry.content.split("\n\n");
  const at = paras.lastIndexOf(line.text);
  if (at < 0) return { content: entry.content };
  paras.splice(at, 1);
  return { content: paras.join("\n\n") };
}

/**
 * يكمل نصَّ الفائز بما أُلحق على الجهاز الآخر ولم يصله. `winner` هي النسخة
 * التي اختارها الدمجُ بطابعها؛ `loser` الأخرى. يُرجع `winner` نفسَها حين لا
 * جديد (فلا يتغيّر المرجع بلا سبب).
 */
export function mergeQuickLines<T extends QuickFields>(winner: T, loser: QuickFields): T {
  const theirs = loser.quickLines;
  if (!theirs?.length) return winner;
  const known = new Set((winner.quickLines ?? []).map((q) => q.id));
  const unseen = theirs.filter((q) => q && typeof q.id === "string" && !known.has(q.id));
  if (!unseen.length) return winner;
  let content = winner.content;
  for (const q of unseen) {
    // النصُّ نفسُه موجودٌ (أُلحق يدوياً أو من نسخةٍ سابقة) — لا يُكرَّر.
    if (content.split("\n\n").includes(q.text)) continue;
    content = content.trim() ? `${content.trimEnd()}\n\n${q.text}` : q.text;
  }
  return { ...winner, content, quickLines: [...(winner.quickLines ?? []), ...unseen] };
}
