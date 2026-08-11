// ===================== جسر «مستورد الذكريات» (.madarimport) =====================
// «مستورد الذكريات» تطبيق macOS مستقل يعالج تصدير Day One الكبير خارج المتصفح:
// يرفع نسخ العرض (صور/صوت/معاينات) إلى نفس مساحة R2 التي يستخدمها مدار (بصيغة
// الهاش نفسها — راجع src/lib/mediaHash.ts)، ثم يُصدّر ملفاً صغيراً واحداً باسم
// ".madarimport" يشير إلى تلك الوسائط بالهاش بدل تضمين بايتاتها من جديد. هذا
// الملف فقط ما يعالجه هذا الوحدة — أرشيف Day One الخام لا يمرّ من هنا إطلاقاً،
// فلا داعٍ لتفكيك ZIP ضخم ولا لتحميله في الذاكرة (ذاك عمل التطبيق الخارجي).
//
// **بلا Firebase عمداً** (كـdayOneParser.ts وmerge.ts) — قابلٌ للاختبار في Node
// صرفاً. التحقّق من وجود كل هاش فعلياً في R2 مسؤولية sync.ts وحده
// (verifyMediaHashesPresent)؛ هذه الوحدة تتحقّق من الملف نفسه فقط: الهوية،
// البنية، الملخّص، الحجم، النوع، وبصمة المحتوى (checksum) — قبل أن يُسمح
// لمحتواه بالوصول لأي مسار كتابة.
//
// الحاوية: ZIP مسطّح (fflate — نفس أداة dayOneParser.ts) يحوي ملفاً واحداً
// باسم "manifest.json" حصراً. أي اسمٍ آخر، أو مسارٌ متفرّع/خارج عن الجذر
// ("..", "/"، "\\")، يُرفض الملف كاملاً به — لا ثقة جزئية بأرشيفٍ مشبوه.

import { unzipSync } from "fflate";
import type { JournalEntry } from "./types";

export const MADAR_IMPORT_EXTENSION = ".madarimport";
export const MADAR_IMPORT_MAGIC = "madar-memory-importer";
export const MADAR_IMPORT_FORMAT_VERSION = 1;
// حدٌّ صارم: الملف نفسه بيانات وصفية + مراجع هاش فقط، بلا بايتات وسائط —
// أي شيءٍ أكبر بكثير من هذا مشبوهٌ بنيوياً (محاولة تهريب بايتات داخل الحاوية).
export const MADAR_IMPORT_MAX_BYTES = 50 * 1024 * 1024; // 50MB
// حجمُ الدفعة عند تغذية المتجر — يبقي كل استدعاء صغيراً ومستجيباً (قابلاً
// للإلغاء بين الدفعات) حتى مع مانيفست يحمل آلاف المذكرات.
export const MADAR_IMPORT_BATCH_SIZE = 200;

const HASH_RE = /^[a-f0-9]{32}$/; // نفس صيغة هاش المحتوى في mediaHash.ts
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export type MadarImportErrorCode =
  | "size" // أكبر من الحد أو فارغ
  | "type" // لا يبدأ بتوقيع ZIP، أو تعذّر فكّه
  | "path" // اسمٌ غير آمن داخل الحاوية (تفرّع/تصعيد مسار)
  | "structure" // بنية manifest.json غير متوقعة (حقل ناقص/نوع خطأ)
  | "identity" // magic/formatVersion لا يطابقان ما ندعمه
  | "summary" // ملخص الملف لا يطابق محتواه الفعلي (مزوَّر)
  | "hash"; // بصمة المحتوى (checksum) لا تطابق — الملف مُعدَّل بعد التوليد

export class MadarImportError extends Error {
  constructor(
    public code: MadarImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MadarImportError";
  }
}

export interface MadarImportLocation {
  lat: number;
  lng: number;
  place?: string;
}

export interface MadarImportEntry {
  uuid: string;
  date: string; // YYYY-MM-DD محلي
  time?: string; // HH:MM
  title?: string;
  content: string;
  tags?: string[];
  starred?: boolean;
  capturedAt?: string; // ISO — لحظة الالتقاط الأصلية
  modifiedAt?: string; // ISO — آخر تعديل على الجهاز المصدر
  timeZone?: string; // IANA
  location?: MadarImportLocation;
  photoRefs?: string[]; // هاشات R2 (kind=photos) — تشمل معاينة الفيديو/الـPDF
  audioRefs?: string[]; // هاشات R2 (kind=audios)
  videoRefs?: { type?: string; duration?: number }[];
  pdfRefs?: { pages?: number }[];
}

export interface MadarImportSummary {
  entryCount: number;
  photoCount: number;
  audioCount: number;
  videoCount: number;
  pdfCount: number;
}

export interface MadarImportManifest {
  magic: string;
  formatVersion: number;
  generatedBy?: { app?: string; version?: string };
  createdAt?: string;
  summary: MadarImportSummary;
  entriesChecksum: string; // sha256 hex لمحتوى entries (canonical JSON)
  entries: MadarImportEntry[];
}

export interface MadarImportParseResult {
  manifest: MadarImportManifest;
  entries: JournalEntry[];
  // كل الهاشات المرجعية في الملف — يمرَّر كما هو إلى
  // sync.ts#verifyMediaHashesPresent قبل إنشاء أي مذكرة.
  photoHashes: string[];
  audioHashes: string[];
  // مدخلات تعذّر التحقّق منها فردياً (uuid/date/content ناقص أو غير صالح) —
  // تُستبعد من entries دون إسقاط الملف كله، وتُحسب "failed" في واجهة الاستيراد.
  failed: number;
}

// ===================== حراسة أسماء الملفات داخل الحاوية =====================
// حاويةٌ مسطّحة عمداً: لا مجلدات، لا "..", لا مسار مطلق. يرفض أيضاً NUL
// المُهرَّب (حيلة تجاوز شائعة). هذا هو الحاجز الوحيد الكافي — الحاوية لا تحمل
// أي ملفٍ غير manifest.json أصلاً.
function isSafeContainerEntryName(name: string): boolean {
  if (!name || name.includes("\u0000")) return false;
  if (name.startsWith("/") || name.startsWith("\\")) return false;
  if (name.split(/[\\/]/).some((seg) => seg === "." || seg === "..")) return false;
  if (name.includes("/") || name.includes("\\")) return false; // حاوية مسطّحة فقط
  return true;
}

// ===================== بصمة محتوى ثابتة (canonical) =====================
// نفس فكرة canonicalize في sync.ts (مفاتيح مرتّبة، بلا undefined) لكن بنسخة
// مستقلّة هنا كي تبقى هذه الوحدة بلا استيراد من sync.ts (وبالتالي بلا Firebase).
function canonicalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) {
      if (src[k] === undefined) continue;
      out[k] = canonicalize(src[k]);
    }
    return out;
  }
  return v;
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// مُصدَّرة عمداً: تطبيق «مستورد الذكريات» (وأدوات الاختبار هنا) يحتاجان توليد
// نفس البصمة بالضبط ليتوافق entriesChecksum مع ما تتحقّق منه parseMadarImportFile.
export async function checksumOfEntries(entries: unknown[]): Promise<string> {
  return sha256Hex(JSON.stringify(canonicalize(entries)));
}

// ===================== تحقّق البنية (structure) =====================
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// دالةٌ عادية تُعيد المانيفست بعد التحقّق (لا "asserts") عمداً: الاعتماد على
// تضييق TypeScript بعد استدعاء دالةٍ تُعيد never كعبارةٍ مجرّدة (بلا return)
// غير موثوق هنا فعلياً (يفشل فحص الأنواع في next build) — return صريح لكل
// فحصٍ يضمن التضييق بلا لبس.
function validateStructure(manifest: unknown): MadarImportManifest {
  const fail = (msg: string): never => {
    throw new MadarImportError("structure", `بنية manifest.json غير صحيحة: ${msg}`);
  };
  if (!isPlainObject(manifest)) return fail("الجذر ليس كائناً");
  if (typeof manifest.magic !== "string") return fail("حقل magic ناقص");
  if (typeof manifest.formatVersion !== "number") return fail("حقل formatVersion ناقص");
  if (!isPlainObject(manifest.summary)) return fail("حقل summary ناقص");
  const s = manifest.summary;
  for (const k of ["entryCount", "photoCount", "audioCount", "videoCount", "pdfCount"] as const) {
    if (typeof s[k] !== "number" || s[k] < 0) return fail(`summary.${k} غير صالح`);
  }
  if (typeof manifest.entriesChecksum !== "string" || !/^[a-f0-9]{64}$/.test(manifest.entriesChecksum)) {
    return fail("entriesChecksum غير صالح");
  }
  if (!Array.isArray(manifest.entries)) return fail("حقل entries ليس مصفوفة");
  for (const [i, raw] of manifest.entries.entries()) {
    if (!isPlainObject(raw)) return fail(`entries[${i}] ليس كائناً`);
    if (typeof raw.uuid !== "string" || !raw.uuid) return fail(`entries[${i}].uuid ناقص`);
    if (typeof raw.content !== "string") return fail(`entries[${i}].content ناقص`);
    // date/time قد تكون غائبة على مستوى TS لكن مطلوبة منطقياً — تُفحص لاحقاً
    // فردياً (failed) لا كخطأ بنيةٍ قاتل، فمدخلةٌ واحدة فاسدة لا تُسقط الملف.
    if (raw.photoRefs !== undefined && !Array.isArray(raw.photoRefs)) return fail(`entries[${i}].photoRefs`);
    if (raw.audioRefs !== undefined && !Array.isArray(raw.audioRefs)) return fail(`entries[${i}].audioRefs`);
    if (raw.tags !== undefined && !Array.isArray(raw.tags)) return fail(`entries[${i}].tags`);
  }
  return manifest as unknown as MadarImportManifest;
}

// ===================== تحقّق الهوية (identity) =====================
function assertIdentity(manifest: MadarImportManifest): void {
  if (manifest.magic !== MADAR_IMPORT_MAGIC) {
    throw new MadarImportError(
      "identity",
      "هذا الملف ليس من مستورد الذكريات — هويّة (magic) غير متطابقة"
    );
  }
  if (manifest.formatVersion !== MADAR_IMPORT_FORMAT_VERSION) {
    throw new MadarImportError(
      "identity",
      `نسخة ملف غير مدعومة (${manifest.formatVersion}) — حدّث مدار أو مستورد الذكريات`
    );
  }
}

// ===================== تحقّق الملخّص (summary) =====================
// يقارن ما يدّعيه summary بما يُحصى فعلياً من entries — ملخصٌ مزوَّر (مثلاً
// entryCount أقل من العدد الحقيقي لإخفاء مذكرات) يُرفض هنا حتى لو كانت بصمة
// entriesChecksum سليمة (البصمة تحمي entries نفسها لا summary).
function assertSummary(manifest: MadarImportManifest): void {
  const s = manifest.summary;
  const entries = manifest.entries;
  const actual: MadarImportSummary = {
    entryCount: entries.length,
    photoCount: entries.reduce((n, e) => n + (e.photoRefs?.length ?? 0), 0),
    audioCount: entries.reduce((n, e) => n + (e.audioRefs?.length ?? 0), 0),
    videoCount: entries.reduce((n, e) => n + (e.videoRefs?.length ?? 0), 0),
    pdfCount: entries.reduce((n, e) => n + (e.pdfRefs?.length ?? 0), 0),
  };
  const mismatches = (Object.keys(actual) as (keyof MadarImportSummary)[]).filter(
    (k) => s[k] !== actual[k]
  );
  if (mismatches.length) {
    throw new MadarImportError(
      "summary",
      `ملخص الملف لا يطابق محتواه الفعلي (${mismatches.join(", ")}) — قد يكون معدَّلاً`
    );
  }
}

// ===================== تحقّق بصمة المحتوى (hash/checksum) =====================
async function assertChecksum(manifest: MadarImportManifest): Promise<void> {
  const actual = await checksumOfEntries(manifest.entries);
  if (actual !== manifest.entriesChecksum.toLowerCase()) {
    throw new MadarImportError(
      "hash",
      "بصمة المحتوى (checksum) لا تطابق — الملف تالف أو عُدِّل بعد التوليد"
    );
  }
}

// ===================== تحويل مدخلة إلى JournalEntry =====================
// مسارٌ متساهل فردياً عمداً: مدخلةٌ واحدة فاسدة (تاريخ غير صالح، هاش بصيغة
// خطأ) تُستبعد وتُحسب ضمن "failed" بدل إسقاط الملف كله — الفحوص القاتلة أعلاه
// (بنية/هوية/ملخّص/checksum) هي ما يحمي من ملفٍ مزوَّر أو تالف بنيوياً.
function toJournalEntry(e: MadarImportEntry): JournalEntry | null {
  if (!e.uuid || typeof e.content !== "string") return null;
  if (!DATE_RE.test(e.date)) return null;
  if (e.time !== undefined && !TIME_RE.test(e.time)) return null;
  const photoRefs = (e.photoRefs ?? []).filter((h) => HASH_RE.test(h));
  const audioRefs = (e.audioRefs ?? []).filter((h) => HASH_RE.test(h));
  if ((e.photoRefs?.length ?? 0) !== photoRefs.length) return null; // هاش بصيغة خطأ
  if ((e.audioRefs?.length ?? 0) !== audioRefs.length) return null;
  const tags = (e.tags ?? []).map((t) => t.trim()).filter(Boolean);
  const out: JournalEntry = {
    // معرّفٌ ثابتٌ مشتقٌّ من uuid المصدر — نفسه على كل جهاز وفي كل إعادة
    // استيراد، فتُعرَف المذكرة كعنصرٍ واحد (بلا تكرار UUIDs عبر إعادات
    // التشغيل) عبر نفس آلية Day One القائمة أصلاً (importDayOneEntries في
    // store.ts تفهرس بـdayOneUUID).
    id: `do-${e.uuid}`,
    date: e.date,
    ...(e.time ? { time: e.time } : {}),
    ...(e.title ? { title: e.title } : {}),
    ...(tags.length ? { tags } : {}),
    content: e.content,
    ...(e.starred === true ? { starred: true } : {}),
    ...(e.capturedAt ? { capturedAt: e.capturedAt } : {}),
    ...(e.modifiedAt ? { modifiedAt: e.modifiedAt } : {}),
    ...(e.timeZone ? { timeZone: e.timeZone } : {}),
    ...(e.location ? { location: e.location } : {}),
    ...(photoRefs.length ? { photoRefs } : {}),
    ...(audioRefs.length ? { audioRefs } : {}),
    ...(e.videoRefs?.length ? { videoRefs: e.videoRefs } : {}),
    ...(e.pdfRefs?.length ? { pdfRefs: e.pdfRefs } : {}),
    source: "dayOne", // يُعامَل كاستيراد Day One (المصدر الفعلي) — يُشغّل كل
    // آلية عدم التكرار/الدمج/عدم الكتابة فوق النص القائمة أصلاً في store.ts
    // وmerge.ts بلا كودٍ إضافي (راجع تعليق أعلى الملف).
    dayOneUUID: e.uuid,
  };
  return out;
}

// ===================== المسار الرئيس =====================
export async function parseMadarImportFile(file: Blob): Promise<MadarImportParseResult> {
  if (file.size === 0) throw new MadarImportError("size", "الملف فارغ");
  if (file.size > MADAR_IMPORT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    throw new MadarImportError(
      "size",
      `الملف كبير جدًا (${mb}MB) — الحد الأقصى لملفات ${MADAR_IMPORT_EXTENSION} هو 50MB`
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 2 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new MadarImportError(
      "type",
      `الملف ليس بصيغة ${MADAR_IMPORT_EXTENSION} صحيحة (لا يحمل توقيع ZIP)`
    );
  }

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new MadarImportError("type", "تعذّر فتح الملف — تأكد أنه غير تالف");
  }

  const names = Object.keys(unzipped);
  for (const name of names) {
    if (!isSafeContainerEntryName(name)) {
      throw new MadarImportError("path", `مسارٌ غير آمن داخل الملف: ${name}`);
    }
  }
  if (names.length !== 1 || names[0] !== "manifest.json") {
    throw new MadarImportError(
      "structure",
      "بنية الملف غير متوقعة — يجب أن يحوي على manifest.json فقط"
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(unzipped["manifest.json"]));
  } catch {
    throw new MadarImportError("structure", "manifest.json تالف أو ليس JSON صالحاً");
  }

  const manifest = validateStructure(raw);
  assertIdentity(manifest);
  assertSummary(manifest);
  await assertChecksum(manifest);

  const entries: JournalEntry[] = [];
  let failed = 0;
  for (const e of manifest.entries) {
    const je = toJournalEntry(e);
    if (je) entries.push(je);
    else failed++;
  }

  const photoHashes = [...new Set(entries.flatMap((e) => (e as { photoRefs?: string[] }).photoRefs ?? []))];
  const audioHashes = [...new Set(entries.flatMap((e) => (e as { audioRefs?: string[] }).audioRefs ?? []))];

  return { manifest, entries, photoHashes, audioHashes, failed };
}

// دفعاتٌ صغيرة — استيراد مانيفستٍ يحمل آلاف المذكرات لا يُغذّي المتجر بضربة
// واحدة (نفس فلسفة streamDayOneZipImport لكن على مصفوفةٍ جاهزة في الذاكرة،
// لأن .madarimport أصلاً صغير — لا أرشيف Day One خلفه هنا).
export function chunkEntries<T>(items: T[], size = MADAR_IMPORT_BATCH_SIZE): T[][] {
  const n = Math.max(1, size);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

// ===================== إعدادات اتصال «مستورد الذكريات» =====================
// حمولة الاتصال التي ينسخها زر «نسخ إعدادات الاتصال» في DayOneImport.tsx —
// تكفي تطبيق macOS للتحدّث مع نفس Worker/مساحة مزامنة هذا الجهاز. لا سرّية في
// عنوان الـWorker (عام أصلاً)، لكن مفتاح الوسائط سرّي: هذه الوحدة لا تطبعه ولا
// تُظهره بأي شكل — فقط تُعيده كحقلٍ في كائن يتولّى المستدعي نسخه للحافظة
// مباشرة (لا console.log، ولا عرضٍ في أي عنصر نصّي بالواجهة).
export interface MemoryImporterConnection {
  workerUrl: string;
  syncSpace: string;
  mediaKey: string;
  formatVersion: number;
}

export function buildMemoryImporterConnection(
  workerUrl: string,
  syncSpace: string,
  mediaKey: string
): MemoryImporterConnection {
  return { workerUrl, syncSpace, mediaKey, formatVersion: MADAR_IMPORT_FORMAT_VERSION };
}
