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
  // Media accounting so a partial import is never reported as a clean success.
  // *Referenced* = how many photo/audio slots the export's entries point at;
  // *Imported* = how many were actually decoded and attached. A gap means some
  // files couldn't be unzipped/decoded (e.g. a HEIC the browser can't render).
  photosReferenced: number;
  photosImported: number;
  audiosReferenced: number;
  audiosImported: number;
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
    // معرّف ثابت مشتقّ من UUID الخاص بـ Day One — نفسه على كل جهاز وفي كل إعادة
    // استيراد، فتُعرَف المذكرة كعنصرٍ واحد (لا تكرار عبر الأجهزة) وينتشر حذفها.
    // (uid احتياطيّ نادر لمدخلة بلا UUID حتى لا تتصادم مع غيرها.)
    id: entry.uuid ? `do-${entry.uuid}` : uid(),
    date,
    ...(time ? { time } : {}),
    ...(title ? { title } : {}),
    ...(tags.length ? { tags } : {}),
    content: body,
    ...(videoRefs.length ? { videoRefs } : {}),
    ...(entry.starred === true ? { starred: true } : {}),
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
    // JSON import is text-only by design (media lives in the ZIP), so nothing
    // is "referenced" here — the UI steers the owner to the ZIP for media.
    photosReferenced: 0,
    photosImported: 0,
    audiosReferenced: 0,
    audiosImported: 0,
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

// One streaming pass over the ZIP. `want(name)` picks which files to read;
// `onFile` gets each wanted file's decompressed bytes and may be async. We drain
// (process + release) completed files after every chunk, so peak memory stays
// bounded by a single media file — not the whole archive. Video bytes and
// unwanted files are never decompressed. A Day One export can be tens of GB,
// well past the ~2GB single-ArrayBuffer limit that made big files fail.
async function streamZip(
  file: Blob,
  want: (name: string) => boolean,
  onFile: (name: string, bytes: Uint8Array) => void | Promise<void>
): Promise<void> {
  const unzip = new Unzip();
  unzip.register(UnzipInflate);
  const queue: { name: string; bytes: Uint8Array }[] = [];
  unzip.onfile = (f) => {
    if (f.name.startsWith("__MACOSX") || isVideoPath(f.name) || !want(f.name)) return;
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
        chunks.length = 0;
        queue.push({ name: f.name, bytes: out });
      }
    };
    f.start();
  };
  const drain = async () => {
    while (queue.length) {
      const it = queue.shift()!;
      await onFile(it.name, it.bytes); // process then let the bytes be GC'd
    }
  };
  const reader = file.stream().getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    unzip.push(value, false);
    await drain(); // backpressure: finish current media before reading more
  }
  unzip.push(new Uint8Array(0), true);
  await drain();
}

// Day One names each media file by its md5 or identifier (which the JSON
// references) → the base name minus extension is the lookup key.
function mediaInfo(path: string): { key: string; ext: string } {
  const slash = path.lastIndexOf("/");
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = base.lastIndexOf(".");
  return {
    key: dot >= 0 ? base.slice(0, dot) : base,
    ext: dot >= 0 ? base.slice(dot + 1).toLowerCase() : "",
  };
}

// --- Batched, resumable ZIP import (bounded memory) ---------------------------
// The ZIP import flushes entries to the caller in small BATCHES as their media
// resolves, freeing each batch's bytes immediately — so peak memory stays near
// one batch, not the whole archive (an earlier version held every compressed
// photo and every entry in memory at once, which a tens-of-GB library could
// exhaust). It's cancellable, reports progress, and — because the store dedupes
// by stable id — re-running after a cancel/crash just resumes: already-saved
// entries are skipped, unfinished ones complete.

export class DayOneImportCancelled extends Error {
  constructor() { super("cancelled"); this.name = "DayOneImportCancelled"; }
}

export interface BatchImportProgress {
  entriesDone: number;
  entriesTotal: number;
  mediaDone: number;
  mediaTotal: number;
}

export interface BatchImportCallbacks {
  // Persist one batch of ready entries (e.g. importDayOneEntries). Awaited, so
  // the next batch doesn't start until this one is stored — that's the
  // backpressure that keeps memory bounded.
  onBatch: (entries: JournalEntry[]) => void | Promise<void>;
  onProgress?: (p: BatchImportProgress) => void;
  shouldCancel?: () => boolean;
  batchSize?: number; // default 40
  // Keep only the FIRST photo of each entry (drop the rest). For a giant
  // library this turns "one photo per memory" on: it keeps the sync doc's photo
  // manifest small (thousands, not tens of thousands) and the app light, while
  // still giving every day a picture. Audio is unaffected.
  onePhotoPerEntry?: boolean;
}

export interface BatchImportResult {
  totalInFile: number;
  skippedEmpty: number;
  photosReferenced: number;
  photosImported: number;
  audiosReferenced: number;
  audiosImported: number;
  cancelled: boolean;
}

interface MediaSlot { keys: string[]; kind: "photo" | "audio"; resolved: boolean; url?: string }

// Past ~4GB a ZIP uses the ZIP64 extension, which in-browser unzip libraries
// handle poorly, so a huge export fails to open at all. A Day One library that
// big is almost entirely VIDEO — which مدار never stores — so the fix is to drop
// the videos folder before importing. Return a targeted, actionable message for
// that case (null → not obviously a size problem, keep the generic message).
const ZIP64_THRESHOLD = 4 * 1024 * 1024 * 1024; // 4 GB
function hugeZipHint(file: Blob): string | null {
  if (file.size < ZIP64_THRESHOLD) return null;
  const gb = Math.round(file.size / (1024 * 1024 * 1024));
  return (
    `الملف ضخم جداً (~${gb}GB) وتعذّر فتحه في المتصفّح — الأرشيفات فوق 4GB ` +
    `تستخدم صيغة لا تفكّها المتصفّحات بثبات، والحجم غالباً كلّه مقاطع فيديو ` +
    `لا يحفظها مدار أصلاً. الحل: فُكّ الأرشيف على جهازك، احذف مجلّد «videos»، ` +
    `ثم أعد ضغط الباقي (JSON + photos + audios) — سيصغر كثيراً ويُستورد بسلاسة.`
  );
}

export async function streamDayOneZipImport(
  file: Blob,
  cb: BatchImportCallbacks
): Promise<BatchImportResult> {
  const batchSize = Math.max(1, cb.batchSize ?? 40);

  // Pass 1 — read only the JSON(s) to learn the entries (bounded: text only).
  const jsonFiles: Record<string, Uint8Array> = {};
  try {
    await streamZip(file, (n) => n.toLowerCase().endsWith(".json"),
      (name, bytes) => { jsonFiles[name] = bytes; });
  } catch {
    throw new Error(hugeZipHint(file) ?? "تعذّر فك ضغط الملف. تأكّد أنه تصدير Day One.");
  }
  if (!Object.keys(jsonFiles).length) {
    throw new Error(hugeZipHint(file) ?? "لم يُعثر على ملف JSON داخل الأرشيف");
  }
  const allEntries: DayOneEntry[] = [];
  for (const jp of Object.keys(jsonFiles)) {
    try {
      const d = JSON.parse(new TextDecoder().decode(jsonFiles[jp])) as DayOneExport;
      if (d.entries && Array.isArray(d.entries)) allEntries.push(...d.entries);
    } catch { /* not a Day One journal */ }
  }
  if (!allEntries.length) throw new Error("لم يتم العثور على مدخلات Day One في الأرشيف");

  // Base entries (no media yet) + per-entry media slots. A slot resolves when
  // ANY of its keys (md5 or identifier) streams in; an entry becomes ready when
  // all its slots resolve (or the stream ends without them — a missing file).
  const onePhoto = cb.onePhotoPerEntry ?? false;
  const bases = allEntries.map(baseEntry);
  const slotsPerEntry: (MediaSlot[] | null)[] = allEntries.map((e) => {
    const slots: MediaSlot[] = [];
    const photos = onePhoto ? (e.photos ?? []).slice(0, 1) : (e.photos ?? []);
    for (const p of photos) slots.push({ keys: [p.md5, p.identifier].filter(Boolean) as string[], kind: "photo", resolved: false });
    for (const a of e.audios ?? []) slots.push({ keys: [a.md5, a.identifier].filter(Boolean) as string[], kind: "audio", resolved: false });
    return slots;
  });
  const pending = slotsPerEntry.map((slots) => slots!.filter((s) => s.keys.length).length);
  const keyIndex = new Map<string, { e: number; s: number }[]>();
  slotsPerEntry.forEach((slots, e) => slots!.forEach((slot, s) => slot.keys.forEach((k) => {
    (keyIndex.get(k) ?? keyIndex.set(k, []).get(k)!).push({ e, s });
  })));

  const photosReferenced = slotsPerEntry.reduce((n, s) => n + s!.filter((x) => x.kind === "photo").length, 0);
  const audiosReferenced = slotsPerEntry.reduce((n, s) => n + s!.filter((x) => x.kind === "audio").length, 0);
  const mediaTotal = pending.reduce((a, b) => a + b, 0);
  let photosImported = 0, audiosImported = 0, mediaDone = 0, entriesDone = 0, keptCount = 0;
  const flushed = new Array(bases.length).fill(false);
  let batch: JournalEntry[] = [];

  const finalize = (idx: number) => {
    if (flushed[idx]) return;
    flushed[idx] = true;
    entriesDone++;
    const slots = slotsPerEntry[idx]!;
    const photos = slots.filter((s) => s.kind === "photo" && s.url).map((s) => s.url!);
    const audios = slots.filter((s) => s.kind === "audio" && s.url).map((s) => s.url!);
    const je = bases[idx];
    if (photos.length) { je.photos = photos; je.photo = photos[0]; photosImported += photos.length; }
    if (audios.length) { je.audios = audios; je.audio = audios[0]; audiosImported += audios.length; }
    slotsPerEntry[idx] = null; // free this entry's media buffers now
    if (je.content.length > 0 || je.title || je.photos?.length || je.audio || je.videoRefs?.length) {
      batch.push(je);
      keptCount++;
    }
  };

  const flush = async (force = false) => {
    while (batch.length >= batchSize || (force && batch.length)) {
      const chunk = batch.splice(0, batchSize);
      await cb.onBatch(chunk);
      cb.onProgress?.({ entriesDone, entriesTotal: bases.length, mediaDone, mediaTotal });
    }
  };

  // Entries with no media are ready immediately.
  for (let i = 0; i < bases.length; i++) if (pending[i] === 0) finalize(i);
  await flush();

  let cancelled = false;
  if (mediaTotal > 0) {
    try {
      await streamZip(
        file,
        (n) => { const { key } = mediaInfo(n); return keyIndex.has(key); },
        async (name, bytes) => {
          if (cb.shouldCancel?.()) throw new DayOneImportCancelled();
          const { key, ext } = mediaInfo(name);
          const refs = keyIndex.get(key);
          if (!refs) return;
          const isAudio = /(?:^|\/)audios\//i.test(name);
          let url: string | null = null;
          if (isAudio) {
            url = bytesToDataUrl(bytes, AUDIO_MIME[ext] || "audio/mp4");
          } else {
            try {
              url = await compressImageSmart(new Blob([bytes as BlobPart], { type: IMG_MIME[ext] || "image/jpeg" }), 140);
            } catch { url = null; }
          }
          for (const { e, s } of refs) {
            const slots = slotsPerEntry[e];
            if (!slots) continue; // entry already flushed
            const slot = slots[s];
            if (!slot || slot.resolved) continue;
            slot.resolved = true;
            if (url) slot.url = url;
            mediaDone++;
            if (--pending[e] === 0) finalize(e);
          }
          await flush();
        }
      );
    } catch (err) {
      if (err instanceof DayOneImportCancelled) cancelled = true;
      else throw err;
    }
  }

  if (!cancelled) {
    // Flush entries whose media never arrived (missing files) with what resolved.
    for (let i = 0; i < bases.length; i++) if (!flushed[i]) finalize(i);
    await flush(true);
  } else {
    // Persist whatever's already staged so a resume has less to redo.
    await flush(true);
  }

  return {
    totalInFile: allEntries.length,
    // Only entries we actually finalized-but-dropped (empty) — not the ones a
    // cancel left unprocessed, so the number stays honest on a partial run.
    skippedEmpty: entriesDone - keptCount,
    photosReferenced,
    photosImported,
    audiosReferenced,
    audiosImported,
    cancelled,
  };
}
