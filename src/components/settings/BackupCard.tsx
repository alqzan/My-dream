"use client";
import { useRef, useState } from "react";
import { useAppStore, SINGLETON_FIELDS } from "@/lib/store";
import { today, toIndicDigits } from "@/lib/utils";
import { fetchInlineMedia, getLocalInlineMedia, mergeAppData } from "@/lib/sync";
import { replaceTombstones, restampForReplace } from "@/lib/merge";
import { saveFile } from "@/lib/platform/files";
import { prefSet } from "@/lib/platform/prefs";
import { getMediaAuthKey, getSyncSpace } from "@/lib/firebase";
import { DEFAULT_CATEGORIES } from "@/lib/types";
import type { AppData, JournalEntry } from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Download, Upload, ShieldCheck, GitMerge, Replace, Loader2, Lock, KeyRound } from "lucide-react";
import { showUndo, showToast } from "@/components/ui/UndoToast";
import { encryptJson, decryptJson, isEncryptedBackup, type EncryptedBackup } from "@/lib/backupCrypto";
import { describeBackupRejection, findBackupRejection, MAX_BACKUP_BYTES } from "@/lib/backupValidation";
import { normalizeReserveFunds, normalizeTransactionReserveSplits } from "@/lib/reserveFunds";

// Journal media is either a local `data:` URL or (since the move to Cloud
// Storage) an `https://` download URL — the doc keeps only a lightweight
// reference. A backup file is meant to be self-contained peace-of-mind, so
// before export every remote URL is fetched and inlined as base64. Memoized
// by URL since several entries can share the exact same photo/audio.
async function embedIfRemote(url: string | undefined, cache: Map<string, string>): Promise<string | undefined> {
  if (!url || !/^https?:\/\//.test(url)) return url;
  const cached = cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    cache.set(url, dataUrl);
    return dataUrl;
  } catch {
    return url; // offline/CORS — keep the reference rather than fail the export
  }
}

type ResolveAttachmentBytes = (hash: string) => Promise<string | null>;

// Inline every remote photo/voice-note **and every retrievable attachment** across
// all entries. Attachment bytes normally live behind a content hash
// (IndexedDB/R2), not in the journal document itself; without this pass an
// apparently complete backup carried only the filename/hash and could not open
// the file on a fresh device.
// Reports progress by entry so a large archive never looks frozen.
export async function embedAllMedia(
  data: AppData,
  onProgress: (done: number, total: number) => void,
  resolveAttachmentBytes?: ResolveAttachmentBytes
): Promise<{ data: AppData; allEmbedded: boolean; counts: BackupCounts }> {
  const cache = new Map<string, string>();
  const attachmentCache = new Map<string, Promise<string | null>>();
  let allEmbedded = true;
  const check = (v: string | undefined) => {
    if (v && /^https?:\/\//.test(v)) allEmbedded = false;
  };
  const total = data.journalEntries.length;
  let done = 0;
  const journalEntries: JournalEntry[] = [];
  for (const e of data.journalEntries) {
    const photos = e.photos ? await Promise.all(e.photos.map((p) => embedIfRemote(p, cache))) : e.photos;
    const photo = await embedIfRemote(e.photo, cache);
    const audios = e.audios ? await Promise.all(e.audios.map((a) => embedIfRemote(a, cache))) : e.audios;
    const audio = await embedIfRemote(e.audio, cache);
    (photos ?? []).forEach(check);
    check(photo);
    (audios ?? []).forEach(check);
    check(audio);
    const attachmentRefs = e.attachmentRefs
      ? await Promise.all(e.attachmentRefs.map(async (attachment) => {
          if (attachment.localData?.startsWith("data:")) return attachment;
          if (!attachment.hash || !resolveAttachmentBytes) {
            allEmbedded = false;
            return attachment;
          }
          let pending = attachmentCache.get(attachment.hash);
          if (!pending) {
            // A single unavailable/corrupt local media record must not abort the
            // whole backup or leave the export button spinning forever. Keep its
            // reference, mark the file incomplete, and make that explicit later.
            pending = resolveAttachmentBytes(attachment.hash).catch(() => null);
            attachmentCache.set(attachment.hash, pending);
          }
          const localData = await pending;
          if (!localData?.startsWith("data:")) {
            allEmbedded = false;
            return attachment;
          }
          return { ...attachment, localData };
        }))
      : e.attachmentRefs;
    journalEntries.push({
      ...e,
      photos: photos as string[] | undefined,
      photo,
      audios: audios as string[] | undefined,
      audio,
      attachmentRefs,
    });
    done++;
    onProgress(done, total);
  }
  const embeddedData = { ...data, journalEntries };
  const counts = countItems(embeddedData);
  if (counts.pdfFiles < counts.pdfs) allEmbedded = false;
  if (counts.attachmentFiles < counts.attachments) allEmbedded = false;
  return { data: embeddedData, allEmbedded, counts };
}

// Backup file format version (3 = attachment bytes + explicit completeness count;
// 2 = metadata/counts/checksum; 1/absent = legacy flat AppData). All remain
// restorable because the payload itself is still the same flat AppData shape.
const BACKUP_VERSION = 3;
const MIN_EXPORT_PASSWORD = 6;
const SCHEMA_VERSION = 1;

interface BackupMeta {
  app: "madar";
  backupVersion: number;
  schemaVersion: number;
  createdAt: string;
  counts: BackupCounts;
  checksum: string;
}

export interface BackupCounts {
  journalEntries: number;
  transactions: number;
  books: number;
  readingLogs: number;
  photos: number;
  audios: number;
  attachments: number;
  attachmentFiles: number;
  pdfs: number;
  pdfFiles: number;
}

// Order-stable FNV-1a over a string — enough to catch a truncated/corrupted
// file, not a security hash. Used for the backup integrity check.
//
// **وحدُّه مكتوبٌ في الواجهة أيضاً (٠٫١٫٤٢٤)**: بصمةٌ ٣٢-بت **غير مفتاحية**
// محفوظةٌ **داخل الملفّ الذي تحرسه** تكشف التلفَ والنقصَ ولا تكشف العبث — من
// حرّر نسخةً نصّية يُعيد حسابها في سطر. وكانت الواجهة تقول «قد يكون الملف
// عُدّل»، فيقرأ المالكُ «سليم» على أنّها شهادةُ عدم تلاعب. صار النصّ يقول
// «تالفٌ أو ناقص» فقط. ومن أراد دليلاً على عدم العبث فالتصديرُ المشفَّر
// (`backupCrypto.ts`) مُوثَّقٌ بـAES-GCM وهو الذي يعطيه.
function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function countItems(d: AppData): BackupCounts {
  let photos = 0;
  let audios = 0;
  let attachments = 0;
  let attachmentFiles = 0;
  let pdfs = 0;
  let pdfFiles = 0;
  for (const e of d.journalEntries) {
    // The legacy single `photo`/`audio` is a mirror of `photos[0]`/`audios[0]`,
    // so count the array when present and only fall back to the legacy field —
    // adding both double-counted the first item on migrated entries.
    photos += e.photos?.length ?? (e.photo ? 1 : 0);
    audios += e.audios?.length ?? (e.audio ? 1 : 0);
    for (const attachment of e.attachmentRefs ?? []) {
      attachments++;
      if (attachment.localData?.startsWith("data:")) attachmentFiles++;
      if (attachment.kind === "pdf") pdfs++;
      if (attachment.kind === "pdf" && attachment.localData?.startsWith("data:")) pdfFiles++;
    }
  }
  return {
    journalEntries: d.journalEntries.length,
    transactions: d.transactions.length,
    books: d.books.length,
    readingLogs: d.readingLogs.length,
    photos,
    audios,
    attachments,
    attachmentFiles,
    pdfs,
    pdfFiles,
  };
}

// Validate + describe a parsed backup object before restore: normalize it to a
// full AppData, count what it holds (for the preview), and integrity-check it
// against its embedded checksum when present.
function inspectBackup(parsed: Record<string, unknown>): {
  data: AppData;
  counts: BackupCounts;
  createdAt: string | null;
  integrity: "ok" | "mismatch" | "none";
} {
  const meta = parsed.__meta as BackupMeta | undefined;
  const data = normalizeBackup(parsed);
  let integrity: "ok" | "mismatch" | "none" = "none";
  if (meta?.checksum) {
    // Recompute over the data payload exactly as it was checksummed at export:
    // the parsed object minus __meta (spread preserves the original key order).
    const { __meta: _drop, ...rest } = parsed;
    integrity = hashString(JSON.stringify(rest)) === meta.checksum ? "ok" : "mismatch";
  }
  return { data, counts: countItems(data), createdAt: meta?.createdAt ?? null, integrity };
}

// Fill any fields a legacy/partial backup is missing so it's a full AppData —
// mergeAppData walks every collection, and the store tolerates extra fields.
// **`Required<AppData>` عمداً**: الحقول الاختيارية هي التي تنزلق بلا خطأ ترجمة
// (كما انزلقت `frozenHabits` فكانت الاستعادة تفكّ تجميد كلّ العادات)، فبهذا
// النوع لا يُترجَم الملفّ حتى يُذكر كلّ حقلٍ جديد هنا صراحةً.
export function normalizeBackup(d: Record<string, unknown>): Required<AppData> {
  const g = <T,>(k: string, fallback: T): T => (d[k] === undefined ? fallback : (d[k] as T));
  return {
    transactions: g("transactions", []).map(normalizeTransactionReserveSplits),
    books: g("books", []),
    readingLogs: g("readingLogs", []),
    knowledgeSources: g("knowledgeSources", []),
    benefits: g("benefits", []),
    journalEntries: g("journalEntries", []),
    habits: g("habits", []),
    budgets: g("budgets", []),
    categories: g("categories", DEFAULT_CATEGORIES),
    reserves: normalizeReserveFunds(g("reserves", [])),
    prayerLogs: g("prayerLogs", []),
    qadaBacklog: g("qadaBacklog", 0),
    quranReflections: g("quranReflections", []),
    quranHifz: g("quranHifz", { plan: null, frontierId: 0, sessions: [], reviews: [] }),
    quranWird: g("quranWird", []),
    quranKhatma: g("quranKhatma", { juz: 0, completed: 0 }),
    dailyBudget: g("dailyBudget", null),
    monthlyIncome: g("monthlyIncome", null),
    futureLetters: g("futureLetters", []),
    countdownEvents: g("countdownEvents", []),
    reconciles: g("reconciles", []),
    obligations: g("obligations", []),
    observedBalances: g("observedBalances", []),
    accounts: g("accounts", []),
    ownerAliases: g("ownerAliases", []),
    ownerWallets: g("ownerWallets", []),
    ownerAccounts: g("ownerAccounts", []),
    salaryPayers: g("salaryPayers", []),
    payerAliases: g("payerAliases", {}),
    settlementResolutions: g("settlementResolutions", []),
    settlements: g("settlements", []),
    inboxDecisions: g("inboxDecisions", []),
    inboxEvents: g("inboxEvents", []),
    cashbackEnabled: g("cashbackEnabled", false),
    cashbackEnvelopeId: g("cashbackEnvelopeId", ""),
    salaryDay: g("salaryDay", 27),
    budgetWindow: g("budgetWindow", "salary"),
    autoOffset: g("autoOffset", true),
    lastSalaryConfirm: g("lastSalaryConfirm", null),
    readingGoal: g("readingGoal", null),
    // العادات المجمّدة تُصدَّر ضمن اللقطة، وكان التطبيع يُسقطها: فاستبدالُ نسخةٍ
    // احتياطية يفكّ تجميد كل العادات، ودمجُها يترك القيمة والطابع غير متوافقين.
    frozenHabits: g("frozenHabits", []),
    merchantRules: g("merchantRules", {}),
    // نُبقي شواهد الحذف (tombstones) فلا تُبعث العناصر المحذوفة عند الدمج —
    // بما فيها شواهد الوسائط (deletedMedia)، وإلا عادت صورةٌ/صوتٌ محذوفٌ عند
    // الاستعادة ثم المزامنة. الدمج (mergeAppData) يوحّدها بأحدث طابعٍ لكل مفتاح
    // فلا تمحو استعادةُ نسخةٍ قديمةٍ شواهدَ أحدثَ منها.
    deleted: g("deleted", {}),
    deletedMedia: g("deletedMedia", {}),
    // طوابع تعديل الإعدادات المفردة — تُحفظ فيبقى «آخر ضبطٍ يفوز» صحيحاً بعد
    // الاستعادة والدمج (وإلا رجعت قيمةٌ مُسِحت عمداً).
    fieldUpdatedAt: g("fieldUpdatedAt", {}),
    lastUpdated: g("lastUpdated", new Date().toISOString()),
  };
}

// Manual JSON backup: everything (including photos) leaves as one file,
// and a file can be restored on any device — peace of mind independent of
// the cloud sync.
export function BackupCard() {
  const snapshot = useAppStore((s) => s.snapshot);
  const hydrate = useAppStore((s) => s.hydrate);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  // A validated backup waiting for the user to choose merge vs. replace.
  const [pending, setPending] = useState<AppData | null>(null);
  // What the pending backup holds (for the pre-restore preview) + integrity.
  const [pendingMeta, setPendingMeta] = useState<
    { counts: BackupCounts; createdAt: string | null; integrity: "ok" | "mismatch" | "none" } | null
  >(null);
  const [exporting, setExporting] = useState<{ done: number; total: number } | null>(null);
  // Optional export encryption.
  const [encrypt, setEncrypt] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  // An imported encrypted file waiting for its password.
  const [encPending, setEncPending] = useState<EncryptedBackup | null>(null);
  const [importPassword, setImportPassword] = useState("");

  async function exportJson() {
    // **«مشفّرة» لا تصير صريحةً بصمت** (٠٫١٫٤٦٩): كلمةُ مرورٍ فارغةٌ كانت تُسقط
    // التشفير وتُخرج كلَّ المذكرات والمال نصّاً صريحاً إلى iCloud أو المشاركة،
    // وعلامتُها الوحيدة اسمُ ملفٍّ بلا «-مشفّر». وأقلُّ من ستّة أحرفٍ يُكسر من الملف
    // دون جهاز المالك، فلا يستحقّ اسمَ التشفير.
    if (encrypt && exportPassword.trim().length < MIN_EXPORT_PASSWORD) {
      setError(`كلمة مرور التشفير ${toIndicDigits(String(MIN_EXPORT_PASSWORD))} أحرفٍ على الأقل — أو ألغِ التشفير صراحةً`);
      return;
    }
    setError("");
    const raw = snapshot();
    setExporting({ done: 0, total: raw.journalEntries.length });
    const space = getSyncSpace();
    const mediaKey = getMediaAuthKey() ?? space;
    const resolveAttachmentBytes: ResolveAttachmentBytes = async (hash) => {
      // Local first: a device-only attachment must still enter its backup even when
      // sync is disabled. Only fall back to R2 when this device has its key.
      const local = await getLocalInlineMedia(hash);
      if (local) return local;
      if (!space || !mediaKey) return null;
      return fetchInlineMedia(space, "photos", hash, mediaKey);
    };
    const { data, allEmbedded, counts } = await embedAllMedia(
      raw,
      (done, total) => setExporting({ done, total }),
      resolveAttachmentBytes
    );
    // Wrap with a self-describing __meta block (version, date, counts, and a
    // checksum over the data) so a restore can preview and integrity-check it.
    // __meta sits alongside the flat AppData fields, so older readers (and
    // normalizeBackup, which only picks known keys) ignore it — fully back-compat.
    const meta: BackupMeta = {
      app: "madar",
      backupVersion: BACKUP_VERSION,
      schemaVersion: SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      counts,
      checksum: hashString(JSON.stringify(data)),
    };
    const withMeta = { __meta: meta, ...data };
    const useEnc = encrypt;
    // التشفيرُ يحتفظ بالنسخة أربعَ مرّاتٍ في الذاكرة معاً (نصٌّ · بايتات ·
    // مشفَّر · base64 يتضخّم ٣٣٪)، ونسخةٌ فيها صورُ سنواتٍ قد تبلغ مئاتِ
    // الميغابايت — فينفد ذاكرةُ Safari على الجوّال ويسقط الزرُّ صامتاً بلا
    // ملفٍّ ولا سبب. الصيغةُ اليوم كتلةٌ واحدة (تغييرُها إلى تشفيرٍ مُقطَّع
    // يمسّ كلَّ ملفٍّ صُدِّر من قبل، فليس بنداً جانبياً) — فالأصدقُ أن يُقال
    // للمالك ما حدث ويُعرض عليه المخرج، لا أن يصمت.
    let payload: string;
    try {
      payload = useEnc ? await encryptJson(withMeta, exportPassword.trim()) : JSON.stringify(withMeta);
    } catch (err) {
      setExporting(null);
      showToast(
        useEnc
          ? "تعذّر تشفير النسخة — غالباً حجمُها أكبر من ذاكرة المتصفّح. جرّب التصدير بلا تشفير، أو من متصفّح الحاسوب"
          : "تعذّر تجهيز ملف النسخة — غالباً حجمُها أكبر من ذاكرة المتصفّح. جرّب من متصفّح الحاسوب",
        "warning"
      );
      setError(err instanceof Error ? err.message : "تعذّر تجهيز النسخة");
      return;
    }
    setExporting(null);
    const saved = await saveFile(
      `madar-backup-${today()}${useEnc ? "-مشفّر" : ""}.json`,
      new Blob([payload], { type: "application/json" })
    );
    if (!saved) {
      setError("تعذّر حفظ النسخة أو مشاركتها؛ لم تُصدّر نسخة احتياطية");
      showToast("تعذّر حفظ النسخة أو مشاركتها", "warning");
      return;
    }
    const missingAttachments = counts.attachments - counts.attachmentFiles;
    if (missingAttachments > 0) {
      showToast(
        `صُدّرت النسخة، لكن ${missingAttachments} من المرفقات بقيت مراجع فقط — افتح مدار على جهاز تظهر فيه الملفات ثم أعد التصدير${useEnc ? "، واحفظ كلمة المرور" : ""}`,
        "warning"
      );
    } else if (useEnc) {
      showToast("صُدّرت نسخة مشفّرة — احفظ كلمة المرور، لا يمكن استرجاعها بدونها", "warning");
    } else if (!allEmbedded) {
      showToast("صُدّرت النسخة — بعض الصور بقيت روابط (تعذّر تنزيلها، تحقق من الاتصال)", "warning");
    }
    // تغذية تذكير النسخ الدوري في التوصيات الذكية
    prefSet("madar-last-backup", today());
  }

  async function importJson(file: File) {
    setError("");
    setPending(null);
    setPendingMeta(null);
    setEncPending(null);
    setImportPassword("");
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("backup too large");
      const parsed = JSON.parse(await file.text());
      // Encrypted backup → ask for its password before we can read it.
      if (isEncryptedBackup(parsed)) {
        setEncPending(parsed);
        return;
      }
      // الرفض يبقى رفضاً — لا نستعيد ما لا نثق بشكله — لكنّه يسمّي المجموعة
      // والسجلّ، فيعرف المالك أالملفُّ تالفٌ فعلاً أم أنّ سجلاً واحداً شذّ.
      const rejection = findBackupRejection(parsed);
      if (rejection) {
        setError(`${describeBackupRejection(rejection)} — لم تُستعد أيّ بيانات`);
        return;
      }
      // Don't apply yet — let the user preview it and pick merge vs. replace.
      const info = inspectBackup(parsed);
      setPending(info.data);
      setPendingMeta({ counts: info.counts, createdAt: info.createdAt, integrity: info.integrity });
    } catch {
      setError("الملف غير صالح — تأكد أنه نسخة مدار الاحتياطية");
    }
  }

  async function decryptPending() {
    if (!encPending || !importPassword) return;
    setError("");
    try {
      const obj = await decryptJson(encPending, importPassword);
      const rejection = findBackupRejection(obj);
      if (rejection) {
        setError(`${describeBackupRejection(rejection)} — لم تُستعد أيّ بيانات`);
        setEncPending(null);
        setImportPassword("");
        return;
      }
      setEncPending(null);
      setImportPassword("");
      const info = inspectBackup(obj as Record<string, unknown>);
      setPending(info.data);
      setPendingMeta({ counts: info.counts, createdAt: info.createdAt, integrity: info.integrity });
    } catch {
      setError("كلمة المرور غير صحيحة أو الملف تالف");
    }
  }

  function applyRestore(mode: "merge" | "replace") {
    if (!pending) return;
    // Replacing wipes current data, so a file whose integrity check FAILED must
    // not overwrite everything on a single tap — require an explicit second yes.
    // (Merge is non-destructive and additive, so it needs no extra guard.)
    if (
      mode === "replace" &&
      pendingMeta?.integrity === "mismatch" &&
      !window.confirm("فحص السلامة لا يطابق — الملف تالفٌ أو ناقص. متأكد أنك تريد استبدال كل بياناتك الحالية به؟")
    ) {
      return;
    }
    const before = snapshot();
    // **الاستبدالُ ينتشر.** `hydrate` يمرّ بـ`rawSet` عمداً، فحلقةُ الشواهد
    // التلقائية في غلاف `set` لا تعمل ولا يُكتب شاهدٌ لأيّ عنصرٍ أسقطته
    // النسخة. وبلا شواهد يتّحد الدمجُ التالي مع جهازٍ ما زال يحمل نسخَه فيعود
    // كلُّ ما حُذف: يبدو الاستبدال ناجحاً ثمّ ينتقض بصمت بعد أوّل مزامنة. فتُحسب
    // الشواهدُ هنا صراحةً وتُضاف إلى خريطة النسخة قبل الترطيب — «استبدل كل
    // بياناتي» يعني على الأجهزة كلِّها لا على هذا وحده.
    // (والدمجُ لا شواهدَ له: هو إبقاءُ الطرفين عمداً.)
    const next = mode === "merge"
      ? mergeAppData(before, pending)
      : (() => {
          // الاستبدالُ تعديلٌ جديد لا استرجاعُ أختامٍ قديمة (`restampForReplace`).
          const stamped = restampForReplace(pending, SINGLETON_FIELDS);
          return { ...stamped, deleted: { ...(stamped.deleted ?? {}), ...replaceTombstones(before, pending) } };
        })();
    hydrate(next);
    setPending(null);
    setPendingMeta(null);
    // والتراجعُ يرفعها معه: استعادةُ لقطةِ ما قبل الاستبدال تُعيد `deleted` كما كانت.
    // وتراجعُ الاستبدال يُختم مثلَه: لو عادت اللقطةُ بأختامها القديمة لأسقطتها
    // شواهدُ الاستبدال التي وصلت السحابةَ قبل الضغط على «تراجع».
    showUndo(mode === "merge" ? "دمجت النسخة الاحتياطية" : "استعدت النسخة الاحتياطية", () =>
      hydrate(mode === "merge" ? before : (() => {
        const back = restampForReplace(before, SINGLETON_FIELDS);
        return { ...back, deleted: { ...(back.deleted ?? {}), ...replaceTombstones(next, before) } };
      })()));
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-700">النسخ الاحتياطي</span>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed mb-3">
        صدّر كل بياناتك، بما فيها صور المذكرات وملفات PDF المتاحة، كملف واحد تستعيده على أي جهاز.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={exportJson}
          disabled={!!exporting}
          className="flex items-center justify-center gap-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl py-2.5 press disabled:opacity-60"
        >
          {exporting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              {exporting.total > 0 ? `${exporting.done}/${exporting.total}` : "جارٍ..."}
            </>
          ) : (
            <>
              <Download size={15} /> تصدير
            </>
          )}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={!!exporting}
          className="flex items-center justify-center gap-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl py-2.5 press disabled:opacity-60"
        >
          <Upload size={15} /> استعادة
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />

      {/* تشفير التصدير بكلمة مرور (اختياري) */}
      <div className="mt-3">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={encrypt}
            onChange={(e) => setEncrypt(e.target.checked)}
            className="accent-brand-600 w-3.5 h-3.5"
          />
          <Lock size={12} /> تشفير الملف بكلمة مرور
        </label>
        {encrypt && (
          <input
            type="password"
            aria-label="كلمة مرور تشفير النسخة"
            value={exportPassword}
            onChange={(e) => setExportPassword(e.target.value)}
            placeholder="كلمة مرور التشفير"
            className="w-full mt-2 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
          />
        )}
      </div>

      {error && <p className="text-[11px] text-red-500 mt-2">{error}</p>}

      {/* استعادة نسخة مشفّرة — طلب كلمة المرور */}
      {encPending && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 animate-fade-up">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 mb-2">
            <KeyRound size={13} /> هذه نسخة مشفّرة — أدخل كلمة المرور
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              type="password"
              aria-label="كلمة مرور فك تشفير النسخة"
              value={importPassword}
              onChange={(e) => setImportPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") decryptPending(); }}
              placeholder="كلمة المرور"
              className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button
              onClick={decryptPending}
              disabled={!importPassword}
              className="text-sm font-medium text-brand-600 bg-brand-50 rounded-xl px-3 press disabled:opacity-50"
            >
              فتح
            </button>
          </div>
          <button
            onClick={() => { setEncPending(null); setImportPassword(""); setError(""); }}
            className="w-full text-[11px] text-gray-400 mt-2 press"
          >
            إلغاء
          </button>
        </div>
      )}

      {pending && (
        <div className="mt-3 rounded-xl bg-gray-50 p-3 animate-fade-up">
          {/* معاينة ما ستُستعيده قبل التطبيق (§صحة البيانات) */}
          {pendingMeta && (
            <div className="mb-2.5 rounded-lg bg-white/70 dark:bg-white/5 p-2.5">
              <div className="text-[11px] font-semibold text-gray-600 mb-1.5">
                محتوى النسخة{pendingMeta.createdAt ? ` · ${pendingMeta.createdAt.slice(0, 10)}` : ""}
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[11px] text-gray-500">
                <span>مذكرات: {pendingMeta.counts.journalEntries}</span>
                <span>عمليات: {pendingMeta.counts.transactions}</span>
                <span>كتب: {pendingMeta.counts.books}</span>
                <span>سجلات قراءة: {pendingMeta.counts.readingLogs}</span>
                <span>صور: {pendingMeta.counts.photos}</span>
                <span>أصوات: {pendingMeta.counts.audios}</span>
                <span>مرفقات كاملة: {pendingMeta.counts.attachmentFiles}/{pendingMeta.counts.attachments}</span>
                <span>PDF كاملة: {pendingMeta.counts.pdfFiles}/{pendingMeta.counts.pdfs}</span>
              </div>
              {pendingMeta.counts.attachmentFiles < pendingMeta.counts.attachments && (
                <p className="text-[11px] text-amber-600 mt-2 leading-relaxed">
                  ⚠️ بعض المرفقات في هذه النسخة مراجع فقط وليست ملفات كاملة. الدمج آمن، لكن لا تعتمد عليها وحدها لنقل تلك الملفات.
                </p>
              )}
              {pendingMeta.integrity === "mismatch" && (
                <p className="text-[11px] text-amber-600 mt-2 leading-relaxed">
                  ⚠️ فحص السلامة لا يطابق — الملف تالفٌ أو نقص جزء منه. راجِع المحتوى قبل الاستبدال.
                </p>
              )}
              {pendingMeta.integrity === "ok" && (
                <p className="text-[11px] text-finance mt-2">✓ فحص السلامة سليم (يكشف التلف لا العبث)</p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-600 mb-2.5">
            كيف تستعيد النسخة؟ <strong>الدمج</strong> يضيف عناصرها لبياناتك الحالية دون حذف،
            و<strong>الاستبدال</strong> يستبدل كل شيء بها.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => applyRestore("merge")}
              className="flex items-center justify-center gap-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl py-2.5 press"
            >
              <GitMerge size={15} /> دمج
            </button>
            <button
              onClick={() => applyRestore("replace")}
              className="flex items-center justify-center gap-2 text-sm font-medium text-red-500 bg-red-50 rounded-xl py-2.5 press"
            >
              <Replace size={15} /> استبدال
            </button>
          </div>
          <button
            onClick={() => { setPending(null); setPendingMeta(null); }}
            className="w-full text-[11px] text-gray-400 mt-2 press"
          >
            إلغاء
          </button>
        </div>
      )}
    </Card>
  );
}
