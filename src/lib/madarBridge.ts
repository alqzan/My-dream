// ===================== جسر «مستورد الذكريات» (.madarimport) =====================
// «مستورد الذكريات» تطبيق macOS مستقل يعالج تصدير Day One الكبير خارج المتصفح:
// يرفع نسخ العرض (صور/صوت/معاينات) إلى نفس مساحة R2 التي يستخدمها مدار (بصيغة
// الهاش نفسها — راجع src/lib/mediaHash.ts)، ثم يُصدّر ملفاً صغيراً واحداً باسم
// ".madarimport" يشير إلى تلك الوسائط بالهاش بدل تضمين بايتاتها من جديد.
//
// **البنية هنا مطابقةٌ حرفياً** لِما يُصدره MadarManifest.swift في تطبيق
// مستورد الذكريات (Sources/MemoryImporterCore) — JSON عادي (لا ZIP، لا
// manifest.json، لا magic/formatVersion/entriesChecksum؛ تلك كانت افتراضاتٍ
// من جولةٍ سابقة قبل الاطّلاع على الكود الفعلي). أي تغييرٍ في أسماء الحقول أو
// أنواعها هنا يجب أن يقابله تغييرٌ متزامن في MadarManifest.swift، وإلا فسد
// التخاطب بين التطبيقين بصمت.
//
// **بلا Firebase عمداً** (كـdayOneParser.ts وmerge.ts) — قابلٌ للاختبار في Node
// صرفاً. التحقّق من وجود كل هاش فعلياً في R2 مسؤولية sync.ts وحده
// (verifyMediaHashesPresent)؛ هذه الوحدة تتحقّق من الملف نفسه فقط: النسخة
// المدعومة (schemaVersion)، البنية، الملخّص، الحجم، والنوع — قبل أن يُسمح
// لمحتواه بالوصول لأي مسار كتابة.

import type { JournalEntry } from "./types";

export const MADAR_IMPORT_EXTENSION = ".madarimport";
export const MADAR_IMPORT_SCHEMA_VERSION = 1;
// حدٌّ صارم: الملف نفسه بيانات وصفية + مراجع هاش فقط، بلا بايتات وسائط —
// أي شيءٍ أكبر بكثير من هذا مشبوهٌ بنيوياً.
export const MADAR_IMPORT_MAX_BYTES = 50 * 1024 * 1024; // 50MB
// حجمُ الدفعة عند تغذية المتجر — يبقي كل استدعاء صغيراً ومستجيباً (قابلاً
// للإلغاء بين الدفعات) حتى مع مانيفست يحمل آلاف المذكرات.
export const MADAR_IMPORT_BATCH_SIZE = 200;

// نفس صيغة هاش المحتوى المستخدَمة في mediaHash.ts (32 حرفاً hex) — كلا
// التطبيقين يكتبان لنفس bucket R2، فيجب أن يتّفقا على صيغة المفتاح.
const HASH_RE = /^[a-f0-9]{32}$/;
// أسماء مساحات R2 التي يقبلها الـWorker (kind param) — راجع sync.ts.
const CLOUD_KINDS = new Set(["photos", "audios"]);

export type MadarImportErrorCode =
  | "size" // أكبر من الحد أو فارغ
  | "type" // ليس JSON صالحاً، أو ليس كائناً جذرياً
  | "path" // حقلٌ يشبه مساراً يحمل بايتات NUL أو طولاً غير معقول
  | "structure" // حقلٌ ناقص أو من نوعٍ خاطئ
  | "version" // schemaVersion غير مدعومة
  | "summary" // ملخص الملف لا يطابق محتواه الفعلي (مزوَّر)
  | "media"; // ربطُ records/media فاسد، أو وسيطٌ uploaded بإيصالٍ ناقص/هاشٍ غير صالح

export class MadarImportError extends Error {
  constructor(
    public code: MadarImportErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MadarImportError";
  }
}

// ===================== أنواعٌ مطابقة لـ MadarManifest.swift =====================
export type MadarMediaPolicy = "light" | "balanced" | "rich";
export type MemoryMediaKind = "photo" | "video" | "audio" | "pdf" | "unknown";
export type MadarBridgeMediaStatus = "uploaded" | "metadataOnly" | "missing" | "failed";

export interface MadarGeoPoint {
  latitude: number;
  longitude: number;
  placeName?: string;
}

export interface MadarBridgeRecord {
  id: string;
  dayOneUUID: string;
  createdAt: string; // Date في Swift — نتوقّع ISO 8601 (راجع parseSwiftDate)
  modifiedAt?: string;
  timeZoneIdentifier?: string;
  title?: string;
  text: string;
  tags: string[];
  starred: boolean;
  location?: MadarGeoPoint;
  mediaIDs: string[];
}

export interface MadarBridgeMedia {
  id: string;
  recordID: string;
  kind: MemoryMediaKind;
  // مساحة R2 الفعلية (kind param للـWorker) — "photos" أو "audios". قد تختلف
  // عن kind الدلاليّ أعلاه: معاينة فيديو أو PDF تُرفع كصورة (cloudKind=photos)
  // مع أنّ kind تصف المرفق الأصلي بأنه video/pdf.
  cloudKind?: string;
  cloudHash?: string;
  contentType?: string;
  originalContentType?: string;
  uploadedByteCount?: number;
  originalByteCount?: number;
  originalFilename?: string;
  // نصٌّ للعرض فقط من جهاز المصدر — لا يُستخدم هنا كمسارٍ فعليّ إطلاقاً (مدار
  // تطبيق ويب بلا وصول ملفات)، ولا يُخزَّن على المذكرة. يُتحقّق من سلامته
  // بنيوياً فقط (لا NUL، طولٌ معقول) قبل أن يُتجاهل.
  originalSourcePath?: string;
  capturedAt?: string;
  durationSeconds?: number;
  status: MadarBridgeMediaStatus;
}

export interface MadarBridgeSummary {
  recordCount: number;
  referencedMediaCount: number;
  uploadedMediaCount: number;
  metadataOnlyCount: number;
  missingMediaCount: number;
  failedMediaCount: number;
  originalByteCount: number;
  uploadedByteCount: number;
  // غير قابلين لإعادة الحساب من محتوى الملف نفسه (يصفان ما استُبعد قبل
  // التصدير) — يُتحقّق من نوعهما فقط، لا من تطابق القيمة.
  sourceReferencedMediaCount: number;
  skippedByPolicyCount: number;
}

export interface MadarBridgeManifest {
  schemaVersion: number;
  importID: string;
  createdAt: string;
  sourceFingerprint: string;
  sourceArchiveName: string;
  policy: MadarMediaPolicy;
  records: MadarBridgeRecord[];
  media: MadarBridgeMedia[];
  summary: MadarBridgeSummary;
}

export interface MadarImportParseResult {
  manifest: MadarBridgeManifest;
  entries: JournalEntry[];
  // كل هاشات الوسائط المرفوعة فعلياً (status=uploaded) — تمرّ كما هي إلى
  // sync.ts#verifyMediaHashesPresent قبل إنشاء أي مذكرة.
  photoHashes: string[];
  audioHashes: string[];
  // سجلّاتٌ تعذّر التحقّق منها فردياً (id/dayOneUUID/createdAt/text ناقص أو
  // غير صالح) — تُستبعد من entries دون إسقاط الملف كله.
  failed: number;
  // وسائط صنّفها مستورد الذكريات نفسه missing/failed (أو مرجعٌ يتيم لا يطابق
  // media.recordID) — معلوماتيٌّ غير قاتل، يختلف عن هاشٍ ناقصٍ في R2 (ذاك
  // يوقف الاستيراد كاملاً؛ هذا يعني أنّ الماك نفسه لم يرفع الملف أصلاً).
  manifestMissingMedia: number;
}

// ===================== أدوات بنيوية =====================
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// Swift's JSONEncoder ينتج تواريخ Date كنصٍّ ISO 8601 حين يُضبط
// dateEncodingStrategy = .iso8601 (المتوقَّع هنا). نتساهل مع رقمٍ (ميلي‑ثانية
// منذ Unix epoch كما تكتبه JS) احتياطاً، لا كافتراضٍ أساسي.
function parseSwiftDate(v: unknown): Date | null {
  if (typeof v === "string") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

// تاريخ/وقتٌ محليّان بمنطقة زمنية السجلّ (أو منطقة الجهاز إن غابت) — نفس نهج
// dayOneParser.ts#extractDateTime، للاتساق بين مساري الاستيراد.
function localDateTime(createdAt: Date, tz?: string): { date: string; time: string } {
  const opts = tz ? { timeZone: tz } : {};
  try {
    const date = new Intl.DateTimeFormat("en-CA", {
      ...opts, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(createdAt);
    const time = new Intl.DateTimeFormat("en-GB", {
      ...opts, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(createdAt);
    return { date, time };
  } catch {
    // منطقة زمنية غير معروفة — رجوعٌ لتوقيت UTC الخام.
    return { date: createdAt.toISOString().slice(0, 10), time: createdAt.toISOString().slice(11, 16) };
  }
}

// ===================== تحقّق البنية (structure) =====================
// دالةٌ عادية تُعيد المانيفست بعد التحقّق (لا "asserts") عمداً: الاعتماد على
// تضييق TypeScript بعد استدعاء دالةٍ تُعيد never كعبارةٍ مجرّدة (بلا return)
// غير موثوق (يفشل فحص الأنواع في next build) — return صريح لكل فحصٍ يضمن
// التضييق بلا لبس.
function validateStructure(raw: unknown): MadarBridgeManifest {
  const fail = (msg: string): never => {
    throw new MadarImportError("structure", `بنية الملف غير صحيحة: ${msg}`);
  };
  if (!isPlainObject(raw)) return fail("الجذر ليس كائناً");
  if (typeof raw.schemaVersion !== "number") return fail("حقل schemaVersion ناقص");
  if (typeof raw.importID !== "string") return fail("حقل importID ناقص");
  if (raw.createdAt === undefined || raw.createdAt === null) return fail("حقل createdAt ناقص");
  if (typeof raw.sourceFingerprint !== "string") return fail("حقل sourceFingerprint ناقص");
  if (typeof raw.sourceArchiveName !== "string") return fail("حقل sourceArchiveName ناقص");
  if (raw.policy !== "light" && raw.policy !== "balanced" && raw.policy !== "rich") {
    return fail("حقل policy غير صالح");
  }
  if (!Array.isArray(raw.records)) return fail("حقل records ليس مصفوفة");
  if (!Array.isArray(raw.media)) return fail("حقل media ليس مصفوفة");
  if (!isPlainObject(raw.summary)) return fail("حقل summary ناقص");
  const s = raw.summary;
  for (const k of [
    "recordCount", "referencedMediaCount", "uploadedMediaCount", "metadataOnlyCount",
    "missingMediaCount", "failedMediaCount", "originalByteCount", "uploadedByteCount",
    "sourceReferencedMediaCount", "skippedByPolicyCount",
  ] as const) {
    if (typeof s[k] !== "number" || s[k] < 0) return fail(`summary.${k} غير صالح`);
  }
  for (const [i, m] of raw.media.entries()) {
    if (!isPlainObject(m)) return fail(`media[${i}] ليس كائناً`);
    const p = m.originalSourcePath;
    // مسارٌ حقيقيٌّ من جهاز المصدر متوقَّعٌ أن يكون مطلَقاً أو يحوي "." — لا
    // نرفض شكله، فقط سلامته البنيوية (لا NUL، لا طولٌ عبثي).
    if (p !== undefined && (typeof p !== "string" || p.includes("\u0000") || p.length > 4096)) {
      throw new MadarImportError("path", `media[${i}].originalSourcePath غير آمن`);
    }
  }
  return raw as unknown as MadarBridgeManifest;
}

// ===================== تحقّق النسخة (version) =====================
function assertVersion(manifest: MadarBridgeManifest): void {
  if (manifest.schemaVersion !== MADAR_IMPORT_SCHEMA_VERSION) {
    throw new MadarImportError(
      "version",
      `نسخة ملف غير مدعومة (schemaVersion=${manifest.schemaVersion}) — حدّث مدار أو مستورد الذكريات`
    );
  }
}

// ===================== تحقّق الملخّص (summary) =====================
// يقارن ما يدّعيه summary بما يُحصى فعلياً من records/media — ملخصٌ مزوَّر
// (مثلاً recordCount أقل من العدد الحقيقي لإخفاء مذكرات) يُرفض هنا. حقلا
// sourceReferencedMediaCount وskippedByPolicyCount يصفان ما استُبعد قبل
// التصدير ولا يمكن التحقّق منهما من محتوى الملف — استُبعدا من المقارنة عمداً.
function assertSummary(manifest: MadarBridgeManifest): void {
  const recordIds = new Set(
    manifest.records.map((r) => r?.id).filter((x): x is string => typeof x === "string")
  );
  const referencedCount = manifest.media.filter((m) => recordIds.has(m?.recordID)).length;
  const tally = (status: MadarBridgeMediaStatus) =>
    manifest.media.filter((m) => m?.status === status).length;

  const checks: [string, number, number][] = [
    ["recordCount", manifest.summary.recordCount, manifest.records.length],
    ["referencedMediaCount", manifest.summary.referencedMediaCount, referencedCount],
    ["uploadedMediaCount", manifest.summary.uploadedMediaCount, tally("uploaded")],
    ["metadataOnlyCount", manifest.summary.metadataOnlyCount, tally("metadataOnly")],
    ["missingMediaCount", manifest.summary.missingMediaCount, tally("missing")],
    ["failedMediaCount", manifest.summary.failedMediaCount, tally("failed")],
  ];
  const mismatches = checks.filter(([, declared, actual]) => declared !== actual).map(([k]) => k);
  if (mismatches.length) {
    throw new MadarImportError(
      "summary",
      `ملخص الملف لا يطابق محتواه الفعلي (${mismatches.join(", ")}) — قد يكون معدَّلاً`
    );
  }
}

// ===================== تحقّق سلامة ربط records/media (صارم) =====================
// لا تساهل هنا — بخلاف buildEntries أدناه: مرجعٌ يتيم، وسيطٌ recordID فيه لا
// يطابق أي سجلّ، أو وسيطٌ status="uploaded" بإيصالٍ ناقص (هاش/مساحة/حجم/نوع
// غير صالحين) — كل هذه تُرفض الملف **كاملاً**. لا نتجاهل هاشاً غير صالحٍ
// بصمت: ادّعاء «رُفع» بلا إيصالٍ كاملٍ مشبوهٌ بما يكفي لرفض الملف كله بدل
// استبعاد ذلك المرجع فقط. بعد نجاح هذا التحقّق، buildEntries تثق أنّ كل
// mediaID في أي record يُحلّ فعلياً وبلا تعارض recordID.
function assertMediaIntegrity(manifest: MadarBridgeManifest): void {
  const recordIds = new Set(
    manifest.records.map((r) => r?.id).filter((x): x is string => typeof x === "string")
  );
  const mediaById = new Map(
    manifest.media.filter((m) => m && typeof m.id === "string").map((m) => [m.id, m])
  );

  manifest.media.forEach((m, i) => {
    if (!m || typeof m.recordID !== "string" || !recordIds.has(m.recordID)) {
      throw new MadarImportError(
        "media",
        `media[${i}] مرتبطٌ بسجلٍّ غير موجود (recordID=${m?.recordID ?? "؟"})`
      );
    }
    if (m.status === "uploaded") {
      const validHash = typeof m.cloudHash === "string" && HASH_RE.test(m.cloudHash);
      const validKind = typeof m.cloudKind === "string" && CLOUD_KINDS.has(m.cloudKind);
      const validSize = typeof m.uploadedByteCount === "number" && m.uploadedByteCount > 0;
      const validType = typeof m.contentType === "string" && m.contentType.length > 0;
      if (!validHash || !validKind || !validSize || !validType) {
        throw new MadarImportError(
          "media",
          `media[${i}] (${m.id}) بحالة uploaded لكن بإيصالٍ ناقص أو غير صالح ` +
          `(cloudHash/cloudKind/uploadedByteCount/contentType)`
        );
      }
    }
  });

  manifest.records.forEach((r) => {
    if (!r || !Array.isArray(r.mediaIDs)) return; // سجلٌّ فاسدٌ يُستبعد لاحقاً في buildEntries (failed)
    for (const mid of r.mediaIDs) {
      const m = mediaById.get(mid);
      if (!m || m.recordID !== r.id) {
        throw new MadarImportError(
          "media",
          `record ${r.id ?? "؟"} يشير إلى media غير موجود أو غير مطابق (mediaID=${mid})`
        );
      }
    }
  });
}

// ===================== تحويل records/media إلى JournalEntry[] =====================
interface BuildResult {
  entries: JournalEntry[];
  photoHashes: string[];
  audioHashes: string[];
  failedRecords: number;
  manifestMissingMedia: number;
}

// مسارٌ متساهل فردياً هنا (بخلاف assertMediaIntegrity أعلاه): سجلٌّ واحدٌ فاسد
// (تاريخ غير صالح، id ناقص) يُستبعد بدل إسقاط الملف كله. أما ربط الوسائط
// فمضمونُ الصحة بنيوياً بعد assertMediaIntegrity — لا حاجة لتكرار التحقّق هنا.
function buildEntries(manifest: MadarBridgeManifest): BuildResult {
  const mediaById = new Map(manifest.media.filter((m) => m && typeof m.id === "string").map((m) => [m.id, m]));
  const photoHashes = new Set<string>();
  const audioHashes = new Set<string>();
  let failedRecords = 0;
  let manifestMissingMedia = 0;
  const entries: JournalEntry[] = [];

  for (const r of manifest.records) {
    if (!r || typeof r.id !== "string" || typeof r.dayOneUUID !== "string" || !r.dayOneUUID || typeof r.text !== "string") {
      failedRecords++;
      continue;
    }
    const created = parseSwiftDate(r.createdAt);
    if (!created) {
      failedRecords++;
      continue;
    }
    const { date, time } = localDateTime(created, r.timeZoneIdentifier);
    const modified = r.modifiedAt !== undefined ? parseSwiftDate(r.modifiedAt) : null;

    const photoRefs: string[] = [];
    const audioRefs: string[] = [];
    const videoRefs: { type?: string; duration?: number; posterHash?: string }[] = [];
    const attachmentRefs: { kind: "pdf"; filename?: string; previewHash?: string; status: string }[] = [];
    const audioMetadataRefs: { type?: string; duration?: number; filename?: string; status: string }[] = [];

    for (const mid of r.mediaIDs ?? []) {
      // assertMediaIntegrity ضَمِنت أن كل mediaID يُحلّ فعلياً وrecordID مطابق —
      // الحارس هنا دفاعيٌّ فقط (TS لا يعرف تلك الضمانة).
      const m = mediaById.get(mid);
      if (!m) continue;
      if (m.status === "missing" || m.status === "failed") manifestMissingMedia++;

      // uploaded مضمونةٌ الصحة الكاملة (هاش/مساحة/حجم/نوع) بعد assertMediaIntegrity.
      const uploaded = m.status === "uploaded";
      const inPhotosBucket = uploaded && m.cloudKind === "photos";
      const inAudiosBucket = uploaded && m.cloudKind === "audios";
      const hash = uploaded ? m.cloudHash : undefined;

      if (m.kind === "photo") {
        // photoRefs تبقى للصور الحقيقية المرفوعة فقط — لا معاينات فيديو/PDF.
        if (inPhotosBucket && hash) { photoRefs.push(hash); photoHashes.add(hash); }
      } else if (m.kind === "video") {
        const posterHash = inPhotosBucket && hash ? hash : undefined;
        if (posterHash) photoHashes.add(posterHash); // ما زال يحتاج تحقّق R2
        videoRefs.push({
          ...(m.contentType ?? m.originalContentType ? { type: m.contentType ?? m.originalContentType } : {}),
          ...(typeof m.durationSeconds === "number" ? { duration: m.durationSeconds } : {}),
          ...(posterHash ? { posterHash } : {}),
        });
      } else if (m.kind === "pdf") {
        const previewHash = inPhotosBucket && hash ? hash : undefined;
        if (previewHash) photoHashes.add(previewHash);
        attachmentRefs.push({
          kind: "pdf",
          ...(m.originalFilename ? { filename: m.originalFilename } : {}),
          ...(previewHash ? { previewHash } : {}),
          status: m.status,
        });
      } else if (m.kind === "audio") {
        if (inAudiosBucket && hash) { audioRefs.push(hash); audioHashes.add(hash); }
        // بيانات وصفية دائماً — حتى بلا cloudHash (status=metadataOnly مثلاً)،
        // فتبقى المعرفة بوجود ملاحظةٍ صوتية حتى قبل رفع بايتاتها.
        audioMetadataRefs.push({
          ...(m.contentType ?? m.originalContentType ? { type: m.contentType ?? m.originalContentType } : {}),
          ...(typeof m.durationSeconds === "number" ? { duration: m.durationSeconds } : {}),
          ...(m.originalFilename ? { filename: m.originalFilename } : {}),
          status: m.status,
        });
      }
      // kind === "unknown": لا إشارة على المذكرة — الحساب في manifestMissingMedia أعلاه فقط.
    }

    const tags = (r.tags ?? []).map((t) => t.trim()).filter(Boolean);
    const out: JournalEntry = {
      // معرّفٌ ثابتٌ مشتقٌّ من dayOneUUID — نفس معرّف Day One الأصليّ، فيتّحد
      // مع مذكرةٍ استُوردت سابقاً من ZIP/JSON Day One مباشرة أو من ملف
      // .madarimport آخر يحمل السجلّ نفسه (نفس آلية store.ts#importDayOneEntries).
      id: `do-${r.dayOneUUID}`,
      date,
      time,
      ...(r.title ? { title: r.title } : {}),
      ...(tags.length ? { tags } : {}),
      content: r.text,
      ...(r.starred === true ? { starred: true } : {}),
      capturedAt: created.toISOString(),
      ...(modified ? { modifiedAt: modified.toISOString() } : {}),
      ...(r.timeZoneIdentifier ? { timeZone: r.timeZoneIdentifier } : {}),
      ...(r.location
        ? {
            location: {
              lat: r.location.latitude,
              lng: r.location.longitude,
              ...(r.location.placeName ? { place: r.location.placeName } : {}),
            },
          }
        : {}),
      ...(photoRefs.length ? { photoRefs } : {}),
      ...(audioRefs.length ? { audioRefs } : {}),
      ...(videoRefs.length ? { videoRefs } : {}),
      ...(attachmentRefs.length ? { attachmentRefs } : {}),
      ...(audioMetadataRefs.length ? { audioMetadataRefs } : {}),
      source: "dayOne", // يُشغّل كل آلية عدم التكرار/الدمج/عدم الكتابة فوق
      // النص القائمة أصلاً في store.ts وmerge.ts بلا كودٍ إضافي.
      dayOneUUID: r.dayOneUUID,
    };
    entries.push(out);
  }

  return { entries, photoHashes: [...photoHashes], audioHashes: [...audioHashes], failedRecords, manifestMissingMedia };
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

  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new MadarImportError("type", "تعذّر قراءة الملف");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MadarImportError(
      "type",
      `الملف ليس JSON صالحاً — تأكد أنه ملف ${MADAR_IMPORT_EXTENSION} من مستورد الذكريات`
    );
  }
  if (!isPlainObject(raw)) {
    throw new MadarImportError("type", "محتوى الملف ليس كائن JSON");
  }

  const manifest = validateStructure(raw);
  assertVersion(manifest);
  assertMediaIntegrity(manifest);
  assertSummary(manifest);

  const built = buildEntries(manifest);
  return {
    manifest,
    entries: built.entries,
    photoHashes: built.photoHashes,
    audioHashes: built.audioHashes,
    failed: built.failedRecords,
    manifestMissingMedia: built.manifestMissingMedia,
  };
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
// **الصيغة مطابقةٌ حرفياً** لِما يقرأه MadarGatewayClient.swift عبر
// JSONDecoder (المفاتيح والأسماء بالضبط: version/workerURL/mediaKey — لا
// syncSpace ولا formatVersion). لا سرّية في عنوان الـWorker (عام أصلاً)، لكن
// مفتاح الوسائط سرّي: هذه الوحدة لا تطبعه ولا تُظهره بأي شكل — فقط تُعيده
// كحقلٍ في كائن يتولّى المستدعي نسخه للحافظة مباشرة (لا console.log، ولا
// عرضٍ في أي عنصر نصّي بالواجهة).
export const MADAR_CONNECTION_VERSION = 1;

export interface MemoryImporterConnection {
  version: number;
  workerURL: string;
  mediaKey: string;
}

export function buildMemoryImporterConnection(workerURL: string, mediaKey: string): MemoryImporterConnection {
  return { version: MADAR_CONNECTION_VERSION, workerURL, mediaKey };
}
