import type { JournalEntry } from "./types";
import { uid, today } from "./utils";

interface DayOneRichText {
  contents?: Array<{ text?: string; attributes?: Record<string, unknown> }>;
}

interface DayOneEntry {
  uuid: string;
  creationDate: string;
  modifiedDate?: string;
  timeZone?: string;
  text?: string;
  richText?: string;
  tags?: string[];
  starred?: boolean;
}

interface DayOneExport {
  entries: DayOneEntry[];
}

export interface DayOneParseResult {
  entries: JournalEntry[];
  totalInFile: number;
  skippedEmpty: number;
}

// Clean Day One markdown noise:
//  - photo/audio embeds like ![](dayone-moment://UUID) shown as literal text
//  - English "Daily Prompt" heading lines (###### Who was ...?)
//  - leftover markdown heading hashes
// Returns the cleaned body plus a title taken from the first Arabic heading
// (or a short standalone first line) when one exists.
function cleanDayOneText(raw: string): { title: string; body: string } {
  let text = raw;
  // Remove image/media markdown embeds (dayone-moment, dayone-audio, etc.)
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "");
  // Remove any stray dayone-moment/audio/video URIs
  text = text.replace(/\(?dayone-(?:moment|audio|video):\/\/[^\s)]+\)?/g, "");

  const kept: string[] = [];
  let title = "";
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) {
      const body = t.replace(/^#{1,6}\s*/, "");
      const latin = (body.match(/[A-Za-z]/g) || []).length;
      const arabic = (body.match(/[؀-ۿ]/g) || []).length;
      if (latin > arabic) continue; // English prompt heading → drop
      // First Arabic heading becomes the entry title instead of body text
      if (!title && kept.every((l) => !l.trim())) {
        title = body.trim();
        continue;
      }
    }
    kept.push(line.replace(/^#{1,6}\s*/, ""));
  }

  let body = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // No heading? A short standalone first line reads like a title.
  if (!title) {
    const lines = body.split("\n");
    const first = lines[0]?.trim() ?? "";
    const rest = lines.slice(1).join("\n").trim();
    if (first && first.length <= 50 && !/[.!؟?،:]$/.test(first) && rest.length > first.length) {
      title = first;
      body = rest;
    }
  }

  return { title, body };
}

function extractText(entry: DayOneEntry): string {
  if (entry.text) return entry.text;
  if (entry.richText) {
    try {
      const rt = JSON.parse(entry.richText) as DayOneRichText;
      if (rt.contents) {
        return rt.contents.map((c) => c.text || "").join("");
      }
    } catch {
      // ignore parse errors
    }
  }
  return "";
}

// Date + time in the entry's own timezone (Day One stores creationDate in UTC).
function extractDateTime(entry: DayOneEntry): { date: string; time?: string } {
  const fallback = { date: today() };
  if (!entry.creationDate) return fallback;
  const d = new Date(entry.creationDate);
  if (isNaN(d.getTime())) {
    return /^\d{4}-\d{2}-\d{2}/.test(entry.creationDate)
      ? { date: entry.creationDate.slice(0, 10) }
      : fallback;
  }
  try {
    const opts = entry.timeZone ? { timeZone: entry.timeZone } : {};
    const date = new Intl.DateTimeFormat("en-CA", {
      ...opts, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(d);
    const time = new Intl.DateTimeFormat("en-GB", {
      ...opts, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(d);
    return { date, time };
  } catch {
    // Unknown timezone identifier — fall back to the raw UTC date portion.
    return { date: entry.creationDate.slice(0, 10) };
  }
}

export function parseDayOneJson(jsonString: string): DayOneParseResult {
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

  const entries = data.entries
    .map((entry): JournalEntry => {
      const { date, time } = extractDateTime(entry);
      const { title, body } = cleanDayOneText(extractText(entry));
      return {
        id: uid(),
        date,
        ...(time ? { time } : {}),
        ...(title ? { title } : {}),
        content: body,
        source: "dayOne",
        dayOneUUID: entry.uuid,
      };
    })
    .filter((e) => e.content.length > 0 || e.title);

  return {
    entries,
    totalInFile: data.entries.length,
    skippedEmpty: data.entries.length - entries.length,
  };
}
