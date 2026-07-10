import { Unzip, UnzipInflate } from "fflate";
import type { JournalEntry } from "./types";
import { uid, today } from "./utils";
import { compressImageSmart } from "./imageUtils";

interface DayOneRichText {
  contents?: Array<{ text?: string; attributes?: Record<string, unknown> }>;
}

interface DayOneMedia {
  identifier?: string;
  md5?: string;
  type?: string; // photos: jpeg/png/heic… ; videos: mov/mp4…
  format?: string; // audios: m4a/aac…
  duration?: number; // audios/videos: seconds
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
  photos?: DayOneMedia[];
  audios?: DayOneMedia[];
  videos?: DayOneMedia[];
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

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))];
}

// Build the common journal fields shared by the JSON and ZIP importers.
function baseEntry(entry: DayOneEntry): JournalEntry {
  const { date, time } = extractDateTime(entry);
  const { title, body } = cleanDayOneText(extractText(entry));
  const tags = normalizeTags(entry.tags);
  // Videos are never stored (too big to sync) — keep only a lightweight ref
  // (type + duration) so the entry still shows it once had a clip.
  const videoRefs = (entry.videos ?? []).map((v) => ({
    ...(v.type ? { type: v.type } : {}),
    ...(typeof v.duration === "number" ? { duration: v.duration } : {}),
  }));
  return {
    id: uid(),
    date,
    ...(time ? { time } : {}),
    ...(title ? { title } : {}),
    ...(tags.length ? { tags } : {}),
    content: body,
    ...(videoRefs.length ? { videoRefs } : {}),
    source: "dayOne",
    dayOneUUID: entry.uuid,
  };
}

export function parseDayOneJson(jsonString: string): DayOneParseResult {
  // Day One exports a .zip containing the JSON; if they upload the zip itself
  // the text starts with the "PK" signature.
  if (jsonString.slice(0, 2) === "PK") {
    throw new Error("هذا ملف مضغوط (zip). ارفعه مباشرة لاستيراد الصور والصوت أيضاً.");
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
    .map((entry) => baseEntry(entry))
    .filter((e) => e.content.length > 0 || e.title || (e.videoRefs?.length ?? 0) > 0);

  return {
    entries,
    totalInFile: data.entries.length,
    skippedEmpty: data.entries.length - entries.length,
  };
}

// --- Full import from the export ZIP (text + dates + tags + photos + audio) -

const IMG_MIME: Record<string, string> = {
  jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png",
  heic: "image/heic", heif: "image/heif", gif: "image/gif", webp: "image/webp",
};
const AUDIO_MIME: Record<string, string> = {
  m4a: "audio/mp4", aac: "audio/aac", mp3: "audio/mpeg",
  wav: "audio/wav", ogg: "audio/ogg", webm: "audio/webm",
};

// Index every file under a folder by both its basename and its extension-less
// name, so a media item can be matched by md5 or by identifier.
function indexFolder(
  files: Record<string, Uint8Array>,
  folder: string
): Map<string, { bytes: Uint8Array; ext: string }> {
  const map = new Map<string, { bytes: Uint8Array; ext: string }>();
  for (const path of Object.keys(files)) {
    const idx = path.indexOf(`${folder}/`);
    if (idx === -1) continue;
    const base = path.slice(idx + folder.length + 1);
    if (!base || base.includes("/")) continue;
    const dot = base.lastIndexOf(".");
    const name = dot >= 0 ? base.slice(0, dot) : base;
    const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
    const rec = { bytes: files[path], ext };
    map.set(base, rec);
    map.set(name, rec);
  }
  return map;
}

function findMedia(
  index: Map<string, { bytes: Uint8Array; ext: string }>,
  item: DayOneMedia
): { bytes: Uint8Array; ext: string } | undefined {
  for (const key of [item.md5, item.identifier]) {
    if (key && index.has(key)) return index.get(key);
  }
  return undefined;
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// Video files are huge and never stored (only a ref is kept), so we skip their
// bytes entirely while unzipping — that's most of a large export's size.
const VIDEO_EXT = new Set(["mov", "mp4", "m4v", "avi", "mkv", "webm", "hevc", "3gp", "wmv"]);
function isVideoPath(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.startsWith("videos/") || lower.includes("/videos/")) return true;
  const dot = lower.lastIndexOf(".");
  return dot >= 0 && VIDEO_EXT.has(lower.slice(dot + 1));
}

// Stream the ZIP instead of loading it whole: a Day One export can be several
// GB (well past the ~2GB single-ArrayBuffer limit that made big files fail).
// We read the file in chunks and keep only the JSON + photos + audios — video
// bytes are dropped as they stream by, so peak memory stays modest.
async function streamZipEntries(file: Blob): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  unzip.onfile = (f) => {
    if (f.name.startsWith("__MACOSX") || isVideoPath(f.name)) return; // skip (never .start())
    const chunks: Uint8Array[] = [];
    let size = 0;
    f.ondata = (err, chunk, final) => {
      if (err) return;
      if (chunk && chunk.length) {
        chunks.push(chunk);
        size += chunk.length;
      }
      if (final) {
        const out = new Uint8Array(size);
        let o = 0;
        for (const c of chunks) { out.set(c, o); o += c.length; }
        files[f.name] = out;
        chunks.length = 0;
      }
    };
    f.start();
  };
  const reader = file.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    unzip.push(value, false);
  }
  unzip.push(new Uint8Array(0), true);
  return files;
}

export async function parseDayOneZip(file: Blob): Promise<DayOneParseResult> {
  let files: Record<string, Uint8Array>;
  try {
    files = await streamZipEntries(file);
  } catch {
    throw new Error("تعذّر فك ضغط الملف. تأكّد أنه تصدير Day One.");
  }

  // Merge EVERY journal JSON in the archive — an "all journals" export puts
  // each journal in its own <Name>.json, so reading only one dropped most
  // entries (e.g. 130 of 800). Non-entry JSONs are skipped harmlessly.
  const jsonPaths = Object.keys(files).filter(
    (p) => p.toLowerCase().endsWith(".json") && !p.startsWith("__MACOSX")
  );
  if (!jsonPaths.length) throw new Error("لم يُعثر على ملف JSON داخل الأرشيف");

  const allEntries: DayOneEntry[] = [];
  for (const jp of jsonPaths) {
    try {
      const d = JSON.parse(new TextDecoder().decode(files[jp])) as DayOneExport;
      if (d.entries && Array.isArray(d.entries)) allEntries.push(...d.entries);
    } catch {
      /* skip a JSON that isn't a Day One journal */
    }
  }
  if (!allEntries.length) {
    throw new Error("لم يتم العثور على مدخلات Day One في الأرشيف");
  }
  const data: DayOneExport = { entries: allEntries };

  const photoIndex = indexFolder(files, "photos");
  const audioIndex = indexFolder(files, "audios");

  const entries: JournalEntry[] = [];
  for (const entry of data.entries) {
    const je = baseEntry(entry);

    // Photos → compressed WebP data URLs (synced as media docs).
    const imgs: string[] = [];
    for (const p of entry.photos ?? []) {
      const media = findMedia(photoIndex, p);
      if (!media) continue;
      const mime =
        IMG_MIME[(p.type || media.ext || "").toLowerCase()] || IMG_MIME[media.ext] || "image/jpeg";
      try {
        imgs.push(await compressImageSmart(new Blob([media.bytes as BlobPart], { type: mime }), 140));
      } catch {
        /* skip an image the browser can't decode (e.g. some HEIC) */
      }
    }
    if (imgs.length) {
      je.photos = imgs;
      je.photo = imgs[0];
    }

    // All voice memos → base64 data URLs (each synced as a media doc).
    const auds: string[] = [];
    for (const a of entry.audios ?? []) {
      const media = findMedia(audioIndex, a);
      if (!media) continue;
      const mime =
        AUDIO_MIME[(a.format || media.ext || "").toLowerCase()] ||
        AUDIO_MIME[media.ext] ||
        "audio/mp4";
      auds.push(bytesToDataUrl(media.bytes, mime));
    }
    if (auds.length) {
      je.audios = auds;
      je.audio = auds[0];
    }

    if (je.content.length > 0 || je.title || je.photos?.length || je.audio || je.videoRefs?.length) entries.push(je);
  }

  return {
    entries,
    totalInFile: data.entries.length,
    skippedEmpty: data.entries.length - entries.length,
  };
}
