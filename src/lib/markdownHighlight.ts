// ================= تلوينُ الماركداون الحيّ في ورقة المذكرة =================
// شريطُ التنسيق يكتب علاماتٍ (`**` · `## ` · `- `) في `<textarea>` عاديّ، فكان
// المالك يضغط «عريض» ولا يرى إلا نجمتين حول الكلمة — «التنسيق ما يشتغل». الحقلُ
// النصّيّ لا يعرض خطّاً عريضاً أصلاً، فيُرسم فوقه **مرآةٌ** بالنصّ نفسِه حرفاً
// بحرف: العلاماتُ باهتة، والعريضُ عريض، والعنوانُ ذهبيّ.
//
// **الشرطُ الذي لا يُكسر: مجموعُ القطع يساوي النصَّ حرفاً بحرف.** المرآةُ تقع
// فوق الحقل، فحرفٌ زائدٌ أو ناقصٌ يُزيح كلَّ ما بعده عن مؤشّر الكتابة. لذلك لا
// تُحذف العلاماتُ هنا بل تُعلَّم، والتنسيقُ في CSS **لا يغيّر عرضَ حرف** (عريضٌ
// بحدٍّ لا بوزنٍ آخر، ولا تكبيرَ للعناوين).
//
// والقواعدُ مطابقةٌ لما يعرضه `renderMarkdown` — ما يبدو عريضاً وأنت تكتب هو ما
// يُعرض عريضاً حين تقرأ.

export type MarkKind = "mark" | "bold" | "em" | "strike" | "head" | "quote" | "bullet";

export interface MarkPiece {
  text: string;
  /** أصنافُ القطعة مجتمعةً (عنوانٌ فيه عريض: `["head", "bold"]`). فارغةٌ = نصٌّ عاديّ. */
  kinds: MarkKind[];
}

const BLOCK_RULES: { re: RegExp; marker: MarkKind; body?: MarkKind }[] = [
  { re: /^#{1,6}[ \t]+/u, marker: "mark", body: "head" },
  { re: /^>[ \t]?/u, marker: "mark", body: "quote" },
  { re: /^[-*+][ \t]+(?:\[[ xX]\][ \t]*)?/u, marker: "bullet" },
  { re: /^\d+\.[ \t]+/u, marker: "bullet" },
];

// الأطولُ قبل الأقصر (`**` قبل `*`)، والمائلُ لا يبدأ وسطَ كلمة — كالعارض.
const INLINE = /\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|(^|[\s(])\*([^*\n]+)\*|(^|[\s(])_([^_\n]+)_/gu;

function push(out: MarkPiece[], text: string, kinds: MarkKind[]) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.kinds.join() === kinds.join()) last.text += text;
  else out.push({ text, kinds });
}

function inline(out: MarkPiece[], text: string, base: MarkKind[]) {
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const start = m.index!;
    push(out, text.slice(at, start), base);
    if (m[1] !== undefined) {
      push(out, "**", [...base, "mark"]);
      push(out, m[1], [...base, "bold"]);
      push(out, "**", [...base, "mark"]);
    } else if (m[2] !== undefined) {
      push(out, "~~", [...base, "mark"]);
      push(out, m[2], [...base, "strike"]);
      push(out, "~~", [...base, "mark"]);
    } else {
      const lead = m[3] ?? m[5] ?? "";
      const token = m[4] !== undefined ? "*" : "_";
      const body = m[4] ?? m[6] ?? "";
      push(out, lead, base);
      push(out, token, [...base, "mark"]);
      push(out, body, [...base, "em"]);
      push(out, token, [...base, "mark"]);
    }
    at = start + m[0].length;
  }
  push(out, text.slice(at), base);
}

/** يقطّع النصَّ قطعاً معلَّمة — مجموعُها يساوي `text` حرفاً بحرف دائماً. */
export function markdownPieces(text: string): MarkPiece[] {
  const out: MarkPiece[] = [];
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (i > 0) push(out, "\n", []);
    const lead = /^[ \t]*/u.exec(line)![0];
    const rest = line.slice(lead.length);
    push(out, lead, []);
    const rule = BLOCK_RULES.find((r) => r.re.test(rest));
    if (!rule) {
      inline(out, rest, []);
      return;
    }
    const marker = rule.re.exec(rest)![0];
    push(out, marker, [rule.marker]);
    inline(out, rest.slice(marker.length), rule.body ? [rule.body] : []);
  });
  return out;
}
