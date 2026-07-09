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

// Inline formatting: **bold**, *italic* / _italic_, `code`, [text](url).
function inline(text: string): string {
  let out = escapeHtml(text);
  // links first (before other tokens can touch the url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-journal underline underline-offset-2">$1</a>'
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>");
  out = out.replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-black/5 text-[0.9em]">$1</code>');
  return out;
}

// Block-level renderer. Returns an HTML string safe for dangerouslySetInnerHTML.
export function renderMarkdown(src: string): string {
  const lines = (src ?? "").split("\n");
  const html: string[] = [];
  let listType: "ul" | "ol" | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    // Blank line -> spacing between blocks
    if (!line.trim()) {
      closeList();
      continue;
    }

    // Headings
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const cls =
        level === 1
          ? "text-xl font-bold mt-4 mb-1"
          : level === 2
          ? "text-lg font-bold mt-3 mb-1"
          : "text-base font-semibold mt-2 mb-1";
      html.push(`<h${level + 2} class="${cls}">${inline(h[2])}</h${level + 2}>`);
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
  return (src ?? "")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

export function wordCount(src: string): number {
  const t = (src ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).length;
}
