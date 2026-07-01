import type { JournalEntry } from "./types";
import { uid } from "./utils";

interface DayOneRichText {
  contents?: Array<{ text?: string; attributes?: Record<string, unknown> }>;
}

interface DayOneEntry {
  uuid: string;
  creationDate: string;
  modifiedDate?: string;
  text?: string;
  richText?: string;
  tags?: string[];
  starred?: boolean;
}

interface DayOneExport {
  entries: DayOneEntry[];
}

// Clean Day One markdown noise:
//  - photo/audio embeds like ![](dayone-moment://UUID) shown as literal text
//  - English "Daily Prompt" heading lines (###### Who was ...?)
//  - leftover markdown heading hashes
function cleanDayOneText(raw: string): string {
  let text = raw;
  // Remove image/media markdown embeds (dayone-moment, dayone-audio, etc.)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Remove any stray dayone-moment/audio/video URIs
  text = text.replace(/\(?dayone-(?:moment|audio|video):\/\/[^\s)]+\)?/g, "");

  const lines = text.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    // Drop markdown heading lines that are English prompts (Daily Prompt).
    if (/^#{1,6}\s/.test(t)) {
      const body = t.replace(/^#{1,6}\s*/, "");
      const latin = (body.match(/[A-Za-z]/g) || []).length;
      const arabic = (body.match(/[؀-ۿ]/g) || []).length;
      if (latin > arabic) return false; // English prompt → drop the line
    }
    return true;
  });

  return lines
    .map((line) => line.replace(/^#{1,6}\s*/, "")) // strip remaining heading hashes
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractText(entry: DayOneEntry): string {
  let text = "";
  if (entry.text) {
    text = entry.text;
  } else if (entry.richText) {
    try {
      const rt = JSON.parse(entry.richText) as DayOneRichText;
      if (rt.contents) {
        text = rt.contents.map((c) => c.text || "").join("");
      }
    } catch {
      // ignore parse errors
    }
  }
  return cleanDayOneText(text);
}

export function parseDayOneJson(jsonString: string): JournalEntry[] {
  // Day One exports a .zip containing the JSON; if they upload the zip itself
  // the text starts with the "PK" signature.
  if (jsonString.slice(0, 2) === "PK") {
    throw new Error("هذا ملف مضغوط (zip). فك الضغط وارفع ملف JSON الذي بداخله.");
  }

  let data: DayOneExport;
  try {
    data = JSON.parse(jsonString) as DayOneExport;
  } catch {
    throw new Error("ملف JSON غير صالح");
  }

  if (!data.entries || !Array.isArray(data.entries)) {
    throw new Error("لم يتم العثور على مدخلات Day One في الملف");
  }

  return data.entries
    .map((entry): JournalEntry => {
      // Use the date portion directly when possible to avoid timezone shifts.
      const date = entry.creationDate
        ? (/^\d{4}-\d{2}-\d{2}/.test(entry.creationDate)
            ? entry.creationDate.slice(0, 10)
            : new Date(entry.creationDate).toISOString().split("T")[0])
        : new Date().toISOString().split("T")[0];

      return {
        id: uid(),
        date,
        content: extractText(entry),
        tags: entry.tags || [],
        source: "dayOne",
        dayOneUUID: entry.uuid,
      };
    })
    .filter((e) => e.content.length > 0);
}
