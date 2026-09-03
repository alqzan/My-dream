// ================= تحرير علامات الماركداون في حقل نصّ عاديّ =================
// شريطُ التنسيق في محرّر المذكرة يكتب علاماتِ ماركداون داخل `<textarea>`. كان
// يكتبها **إضافةً دائماً**، فثلاثةُ ضغطاتٍ على «عريض» تُخرج `******نص******`:
// نجومٌ تتكاثر بلا حدّ، ولا يعرضها العارضُ عريضةً أصلاً (`renderMarkdown`
// يطابق `**نصّ**` بلا نجمةٍ في الداخل). وتحديدُ فقرتين ولفُّهما بنجمتين لا
// يُعرَض عريضاً كذلك: التنسيقُ السطريّ في العارض **لا يعبر سطراً**.
//
// هنا الحسابُ النقيّ لثلاث عمليات — بلا DOM ولا حالة — فيبقى مختبَراً ويعبر
// إلى الغلاف الأصليّ كما هو:
//   • `toggleEmphasis` — عريض/مائل: يُشعل ويُطفئ، ويلفّ **كلّ سطرٍ** على حدة.
//   • `toggleBlockPrefix` — عنوان/قائمة/اقتباس: يستبدل علامةَ السطر ولا يكوّمها.
//   • `clearFormatting`  — يجرّد ما في المدى من علاماتٍ سطريّةٍ وداخلية.
// كلُّها تُرجع النصَّ الجديد ومدى التحديد بعده، فيتولّى المكوّن وضعَه في الحقل.

export interface MarkdownEdit {
  text: string;
  start: number;
  end: number;
}

// علامةُ بداية السطر في الماركداون: عنوان · اقتباس · قائمة (ومربّع مهمّة) · ترقيم.
const BLOCK_PREFIX = /^(?:#{1,6}[ \t]+|>[ \t]?|[-*+][ \t]+(?:\[[ xX]\][ \t]*)?|\d+\.[ \t]+)/u;

// علاماتُ التنسيق الداخلية التي يجرّدها زرّ «عادي». الطويلُ قبل القصير:
// `**` قبل `*` وإلّا بقيت نجمةٌ يتيمة.
const INLINE_TOKENS = /\*\*|~~|__|[*_`]/gu;

function norm(prefix: string): string {
  return prefix.replace(/[ \t]+/gu, " ");
}

function leading(line: string): string {
  return /^[ \t]*/u.exec(line)![0];
}

function blockPrefixOf(line: string): string {
  return BLOCK_PREFIX.exec(line.slice(leading(line).length))?.[0] ?? "";
}

// لفُّ سطرٍ واحد: العلامةُ تحضن **نصّ السطر وحده**، فتبقى `- ` و`## ` خارجها
// (وإلّا صار السطر `**- نص**` فلا هو قائمةٌ ولا هو عريض)، ويبقى الفراغُ الذي
// في الطرفين خارجها كذلك (`**نص **` لا يُعدّ عريضاً في الماركداون).
function wrapLine(line: string, token: string): string {
  const lead = leading(line);
  const afterLead = line.slice(lead.length);
  const block = BLOCK_PREFIX.exec(afterLead)?.[0] ?? "";
  const raw = afterLead.slice(block.length);
  const trail = /[ \t]*$/u.exec(raw)![0];
  const body = raw.slice(0, raw.length - trail.length);
  if (!body) return line;
  return `${lead}${block}${token}${body}${token}${trail}`;
}

function stripToken(text: string, token: string): string {
  return text.split(token).join("");
}

// «مُنسَّقٌ أصلاً» = كلُّ سطرٍ ذي نصّ محفوفٌ بالعلامة. سطرٌ واحدٌ ناقص يعني أنّ
// الضغطة تُكمل التنسيق لا تُلغيه.
function isEmphasized(text: string, token: string): boolean {
  const lines = text.split("\n").filter((line) => line.trim());
  if (!lines.length) return false;
  return lines.every((line) => {
    const body = line.trim().slice(blockPrefixOf(line).length).trim();
    return body.length > token.length * 2 && body.startsWith(token) && body.endsWith(token);
  });
}

/** عريض/مائل: يُطفئ ما هو منسَّقٌ أصلاً، ويلفّ كلّ سطرٍ على حدة فيما عداه. */
export function toggleEmphasis(
  text: string,
  start: number,
  end: number,
  token: string,
  placeholder = "نص"
): MarkdownEdit {
  let s = Math.max(0, Math.min(start, end, text.length));
  let e = Math.max(0, Math.min(Math.max(start, end), text.length));

  // فراغُ الطرفين خارج التحديد دائماً: تحديدٌ بالسحب يلتقط مسافةً في آخره
  // كثيراً، ولفُّها يُبطل التنسيق في العارض بلا أثرٍ ظاهرٍ في المحرّر.
  while (s < e && /\s/u.test(text[s]!)) s += 1;
  while (e > s && /\s/u.test(text[e - 1]!)) e -= 1;

  // العلامتان خارج التحديد (حدّد الكلمة وحدها ثمّ ضغط «عريض» ثانيةً): ضُمَّهما
  // ليطفئ الزرُّ ما أشعله بدل أن يضيف طبقةً فوقه.
  if (text.slice(s - token.length, s) === token && text.slice(e, e + token.length) === token) {
    s -= token.length;
    e += token.length;
  }

  // بلا تحديد: إن كان المؤشّر **داخل** نصٍّ عريضٍ فالضغطةُ إطفاءٌ له.
  if (s === e) {
    const lineStart = text.lastIndexOf("\n", s - 1) + 1;
    const nextBreak = text.indexOf("\n", s);
    const lineEnd = nextBreak === -1 ? text.length : nextBreak;
    const opener = text.lastIndexOf(token, s - 1);
    const closer = text.indexOf(token, s);
    if (opener >= lineStart && closer !== -1 && closer + token.length <= lineEnd) {
      const span = text.slice(opener, closer + token.length);
      if (isEmphasized(span, token)) {
        const bare = stripToken(span, token);
        return { text: text.slice(0, opener) + bare + text.slice(closer + token.length), start: opener, end: opener + bare.length };
      }
    }
    const insert = token + placeholder + token;
    return {
      text: text.slice(0, s) + insert + text.slice(s),
      start: s + token.length,
      end: s + token.length + placeholder.length,
    };
  }

  const selected = text.slice(s, e);
  if (isEmphasized(selected, token)) {
    const bare = stripToken(selected, token);
    return { text: text.slice(0, s) + bare + text.slice(e), start: s, end: s + bare.length };
  }

  // إشعال: تُنزع العلاماتُ الموجودة في الداخل أوّلاً — هي مصدرُ التكوّم —
  // ثمّ يُلفّ كلُّ سطرٍ وحده فيصل التنسيقُ إلى الفقرات كلّها لا إلى أوّلها.
  const next = stripToken(selected, token)
    .split("\n")
    .map((line) => wrapLine(line, token))
    .join("\n");
  return { text: text.slice(0, s) + next + text.slice(e), start: s, end: s + next.length };
}

/** عنوان/قائمة/اقتباس: علامةٌ واحدةٌ لكلّ سطر — تُستبدل ولا تُكوَّم، وتُرفع بضغطةٍ ثانية. */
export function toggleBlockPrefix(text: string, start: number, end: number, token: string): MarkdownEdit {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  const blockStart = text.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = text.indexOf("\n", to);
  const blockEnd = nextBreak === -1 ? text.length : nextBreak;

  const lines = text.slice(blockStart, blockEnd).split("\n");
  const written = lines.filter((line) => line.trim());
  const alreadySet = written.length > 0 && written.every((line) => norm(blockPrefixOf(line)) === norm(token));

  const next = lines
    .map((line) => {
      if (!line.trim()) return line;
      const lead = leading(line);
      const bare = line.slice(lead.length).replace(BLOCK_PREFIX, "");
      return alreadySet ? lead + bare : lead + token + bare;
    })
    .join("\n");

  const patched = text.slice(0, blockStart) + next + text.slice(blockEnd);
  if (from === to) {
    // المؤشّر يبقى عند موضعه من النصّ، منزاحاً بما زاد أو نقص من العلامة.
    const delta = next.length - (blockEnd - blockStart);
    const caret = Math.min(Math.max(from + delta, blockStart), blockStart + next.length);
    return { text: patched, start: caret, end: caret };
  }
  return { text: patched, start: blockStart, end: blockStart + next.length };
}

/** «عادي»: يجرّد المدى (أو السطر الذي عليه المؤشّر) من كلّ علامةِ تنسيق. */
export function clearFormatting(text: string, start: number, end: number): MarkdownEdit {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(0, Math.min(Math.max(start, end), text.length));
  const caret = from === to;
  const blockStart = caret ? text.lastIndexOf("\n", from - 1) + 1 : from;
  const nextBreak = text.indexOf("\n", to);
  const blockEnd = caret ? (nextBreak === -1 ? text.length : nextBreak) : to;

  const plain = text
    .slice(blockStart, blockEnd)
    .split("\n")
    .map((line) => leading(line) + line.slice(leading(line).length).replace(BLOCK_PREFIX, ""))
    .join("\n")
    .replace(INLINE_TOKENS, "");

  return {
    text: text.slice(0, blockStart) + plain + text.slice(blockEnd),
    start: blockStart,
    end: blockStart + plain.length,
  };
}
