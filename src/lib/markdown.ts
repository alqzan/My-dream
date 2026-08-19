// Tiny, dependency-free Markdown subset — enough to make the journal editor
// feel "smart" (headings, bold/italic, lists, quotes, links) without pulling a
// heavy library. Everything is HTML-escaped first, so rendering the result is
// safe against injection.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Markdown backslash escapes (`\.` `\*` `\_` …). Day One's export escapes
// punctuation heavily — "ممتن اليوم لـ\.\.\." — so leaving the backslashes in
// shows them literally. Pull each escape out before any formatting runs (so the
// character can't be mistaken for a token), then put the bare character back.
const SENTINEL = "\u0000"; // never appears in journal text (stripped on entry)
const ESCAPABLE = /\\([\\`*_{}[\]()#+\-.!>~|])/g;

function protectEscapes(text: string, bag: string[]): string {
  return text.replace(ESCAPABLE, (_m, ch: string) => {
    bag.push(ch);
    return `${SENTINEL}${bag.length - 1}${SENTINEL}`;
  });
}

function restoreEscapes(html: string, bag: string[]): string {
  if (!bag.length) return html;
  return html.replace(
    new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"),
    (_m, i: string) => escapeHtml(bag[Number(i)] ?? "")
  );
}

// Inline formatting: **bold**, *italic* / _italic_, ~~strike~~, `code`, [text](url).
function inline(text: string): string {
  const bag: string[] = [];
  let out = escapeHtml(protectEscapes(text, bag));
  // links first (before other tokens can touch the url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-journal underline underline-offset-2">$1</a>'
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~\n]+)~~/g, '<span class="line-through opacity-70">$1</span>');
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-black/5 text-[0.9em]">$1</code>');
  return restoreEscapes(out, bag);
}

// A checked/unchecked box drawn with borders — matches the journal palette and
// flips correctly in dark mode (the `.dark` overrides cover these gray classes).
function checkbox(done: boolean): string {
  return done
    ? '<span aria-hidden="true" class="mt-[0.35em] shrink-0 w-4 h-4 rounded-[5px] bg-journal text-white text-[11px] leading-4 text-center">✓</span>'
    : '<span aria-hidden="true" class="mt-[0.35em] shrink-0 w-4 h-4 rounded-[5px] border-2 border-gray-200"></span>';
}

// Block-level renderer. Returns an HTML string safe for dangerouslySetInnerHTML.
export function renderMarkdown(src: string): string {
  // The sentinel is ours alone — drop any stray copy from the source first.
  const lines = (src ?? "").split(SENTINEL).join("").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | "task" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    // Blank line -> spacing between blocks
    if (!line) {
      closeList();
      continue;
    }

    // Horizontal rule (--- / *** / ___) — Day One separates prompts with them.
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
      closeList();
      html.push('<hr class="my-3 border-0 border-t border-gray-200" />');
      continue;
    }

    // Headings (#..######). Day One writes its daily prompts as ###### — those
    // render as a soft chip rather than a heading, the way they look there.
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      if (level >= 6) {
        html.push(
          `<p class="my-2"><span class="inline-block text-[0.85em] text-gray-500 bg-gray-100 rounded-xl px-2.5 py-1">${inline(h[2])}</span></p>`
        );
        continue;
      }
      const cls =
        level === 1
          ? "text-xl font-bold mt-4 mb-1"
          : level === 2
          ? "text-lg font-bold mt-3 mb-1"
          : level === 3
          ? "text-base font-semibold mt-2 mb-1"
          : "text-[0.95em] font-semibold mt-2 mb-1";
      const tag = `h${Math.min(level + 2, 6)}`;
      html.push(`<${tag} class="${cls}">${inline(h[2])}</${tag}>`);
      continue;
    }

    // Blockquote
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      closeList();
      html.push(
        `<blockquote class="border-r-2 border-journal/40 pr-3 my-2 text-gray-500 italic">${inline(q[1])}</blockquote>`
      );
      continue;
    }

    // Task list (- [ ] / - [x]) — Day One's checklists arrive like this.
    const task = /^[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (task) {
      const done = task[1].toLowerCase() === "x";
      if (listType !== "task") {
        closeList();
        html.push('<ul class="list-none pr-0 my-1.5 space-y-1.5">');
        listType = "task";
      }
      html.push(
        `<li class="flex items-start gap-2">${checkbox(done)}<span${
          done ? ' class="line-through text-gray-400"' : ""
        }>${inline(task[2])}</span></li>`
      );
      continue;
    }

    // Unordered list
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push('<ul class="list-disc pr-5 my-1 space-y-0.5">');
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }

    // Ordered list
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push('<ol class="list-decimal pr-5 my-1 space-y-0.5">');
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }

    // Plain paragraph
    closeList();
    html.push(`<p class="my-1.5">${inline(line)}</p>`);
  }

  closeList();
  return html.join("");
}

// Plain-text preview: strip markdown tokens so list/card previews stay clean.
export function stripMarkdown(src: string): string {
  const bag: string[] = [];
  return protectEscapes((src ?? "").split(SENTINEL).join(""), bag)
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*+]\s+\[([ xX])\]\s*/gm, (_m, c: string) => (c.toLowerCase() === "x" ? "☑ " : "☐ "))
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(new RegExp(`${SENTINEL}(\\d+)${SENTINEL}`, "g"), (_m, i: string) => bag[Number(i)] ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// عنوان المذكرة يُعرض نصّاً عادياً لا HTML، لكنّه قد يحمل رموز ماركداون جاءت
// من Day One («اليوم بسوي \.\.\.\.») — فيمرّ بالقاعدة نفسها قبل عرضه.
export function plainTitle(title?: string): string {
  return stripMarkdown(title ?? "").replace(/\s+/g, " ").trim();
}

/**
 * **اسمُ المذكرة في القوائم.** المذكرةُ بلا عنوانٍ ليست بلا اسم: أوّلُ سطرٍ
 * ذي معنًى من نصّها هو اسمُها. كتابةُ «بلا عنوان» تملأ الشاشةَ بصفٍّ من
 * العناوين المتطابقة فلا يُميَّز يومٌ من يوم — وهي أسوأُ من لا عنوان.
 *
 * ويُنظَّف من الماركداون: عناوينُ `###` وطوابعُ الوقت جاءت من أرشيف Day One،
 * فتظهر خاماً في القائمة إن لم تُجرَّد.
 */
export function previewTitle(title: string | undefined, content: string | undefined, max = 60): string {
  const t = plainTitle(title);
  if (t) return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
  const first = stripMarkdown(content ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!first) return "";
  return first.length > max ? first.slice(0, max).trimEnd() + "…" : first;
}

/** مقتطفُ نصِّ المذكرة — بلا ماركداون ولا وسوم ولا أسطرٍ فارغة. */
export function previewText(content: string | undefined, max = 90): string {
  const t = stripMarkdown((content ?? "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return t.length > max ? t.slice(0, max).trimEnd() + "…" : t;
}

export function wordCount(src: string): number {
  const t = (src ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
