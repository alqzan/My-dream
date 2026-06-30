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

function extractText(entry: DayOneEntry): string {
  if (entry.text) return entry.text;
  if (entry.richText) {
    try {
      const rt = JSON.parse(entry.richText) as DayOneRichText;
      if (rt.contents) {
        return rt.contents
          .map((c) => c.text || "")
          .join("")
          .trim();
      }
    } catch {
      // ignore parse errors
    }
  }
  return "";
}

export function parseDayOneJson(jsonString: string): JournalEntry[] {
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
      const date = entry.creationDate
        ? new Date(entry.creationDate).toISOString().split("T")[0]
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
