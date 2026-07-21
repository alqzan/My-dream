"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "@/lib/store";
import { useSync } from "@/components/sync/SyncProvider";
import { inventoryMedia, reuploadAllMedia, describeUploadError, type MediaInventory, type MediaAccessError } from "@/lib/sync";
import { getSyncSpace } from "@/lib/firebase";
import { showToast } from "@/components/ui/UndoToast";
import { Card } from "@/components/ui/Card";
import { Activity, ImageUp, HardDrive, ShieldCheck, CheckCircle2, ScanSearch, Loader2, UploadCloud } from "lucide-react";

const DOC_LIMIT = 1024 * 1024; // Firestore's hard 1MB-per-document cap.
const BUILD_TAG = "r2-worker-8"; // bump each diagnostic deploy to confirm freshness.

// When the media scan can't read R2, WHY matters: a mismatched sync key (401)
// is a config problem the owner must fix, and is completely different from "no
// network". Each case gets an honest, actionable message — and every one keeps
// the reassurance that the media itself is very likely safe in the cloud, so
// nobody panics or hits "re-upload" over a transient/authorization issue.
const STORAGE_ERROR_MESSAGE: Record<MediaAccessError, ReactNode> = {
  auth: (
    <>
      ⚠️ مفتاح المزامنة على هذا الجهاز <strong>لا يطابق</strong> الخادم (401).
      صورك على الأغلب <strong>سليمة في السحابة</strong>، لكن هذا الجهاز غير مخوّل لقراءتها.
      افتح بطاقة «مفتاح المزامنة» وتأكد أنه المفتاح الصحيح (أو أن سر الخادم يطابقه).
      لا تضغط «إعادة الرفع» حتى يتطابق المفتاح.
    </>
  ),
  origin: (
    <>
      ⚠️ الخادم رفض أصل هذه الصفحة (403) — إعداد CORS في الـWorker لا يسمح لهذا الموقع.
      صورك على الأغلب سليمة في السحابة. راجع قائمة الأصول المسموحة في الـWorker.
    </>
  ),
  server: (
    <>
      ⚠️ الخادم/التخزين لا يستجيب حاليًا (خطأ خادم). صورك على الأغلب سليمة في السحابة —
      أعد الفحص بعد قليل. لا تضغط «إعادة الرفع» الآن.
    </>
  ),
  config: (
    <>
      ⚠️ رابط الـWorker غير مضمّن في هذه النسخة من التطبيق — غالبًا نسخة قديمة مخزّنة.
      أغلق التطبيق وافتحه (أو حدّثه) ثم أعد الفحص. لا تضغط «إعادة الرفع» الآن.
    </>
  ),
  network: (
    <>
      ⚠️ تعذّر الوصول إلى Worker/R2 من هذا الجهاز الآن (شبكة محجوبة أو انقطاع مؤقت).
      هذا <strong>لا يعني أن صورك مفقودة</strong> — غالبًا هي سليمة في السحابة، لكن هذا الجهاز
      ما قدر يقرأها. جرّب على واي فاي، أو أعد الفحص بعد قليل. لا تضغط «إعادة الرفع» الآن.
    </>
  ),
};

// "صحة البيانات" (§12): a plain, honest read-out of where the owner's data
// stands — how close the sync document is to the 1MB cap, when the last backup
// was, whether any media is still uploading, and how much is stored. No action
// happens here; it's a dashboard so nothing important stays invisible.
export function DataHealthCard() {
  const snapshot = useAppStore((s) => s.snapshot);
  const { mediaPending, lastSyncedAt, enabled } = useSync();
  const [scan, setScan] = useState<MediaInventory | null>(null);
  const [scanning, setScanning] = useState(false);
  const [reuploading, setReuploading] = useState(false);
  // A concrete reason surfaced when a re-upload fails (thrown or per-file), kept
  // visible after the toast fades so the owner can read/report it.
  const [reuploadError, setReuploadError] = useState<string | null>(null);

  async function runScan() {
    const space = getSyncSpace();
    if (!space) { showToast("المزامنة غير مفعّلة على هذا الجهاز", "warning"); return; }
    setScanning(true);
    try {
      setScan(await inventoryMedia(space, snapshot()));
    } catch {
      showToast("تعذّر فحص الصور — تحقق من الاتصال", "warning");
    } finally {
      setScanning(false);
    }
  }

  async function reupload() {
    const space = getSyncSpace();
    if (!space) return;
    setReuploading(true);
    setReuploadError(null);
    try {
      const report = await reuploadAllMedia(space, snapshot());
      setScan(report);
      const pending = report.photos.pendingUpload + report.audios.pendingUpload;
      const broken = report.photos.broken + report.audios.broken;
      if (report.uploadError) {
        // A concrete failure from the upload path (bad R2 key, oversize,
        // CORS/network) — name it instead of a generic message.
        setReuploadError(report.uploadError);
        showToast(report.uploadError, "warning");
      } else if (!report.storageReachable) {
        showToast(
          report.storageError === "auth"
            ? "مفتاح المزامنة لا يطابق الخادم (401) — لم يتم الرفع"
            : "تعذّر الوصول إلى R2 الآن — تحقق من الاتصال",
          "warning"
        );
      } else if (pending || broken) {
        showToast(`اكتمل الرفع جزئيًا — بقي ${pending + broken} ملف`, "warning");
      } else {
        showToast("تم ترحيل الوسائط إلى R2 والتحقق منها", "success");
      }
    } catch (e) {
      // Even when the re-upload throws (not just a swallowed per-file failure),
      // name the real cause instead of a generic "check your connection".
      setReuploadError(describeUploadError(e));
      showToast(describeUploadError(e), "warning");
    } finally {
      setReuploading(false);
    }
  }
  const [info, setInfo] = useState<{
    bytes: number;
    photos: number;
    entries: number;
    transactions: number;
    lastBackup: string | null;
  } | null>(null);

  useEffect(() => {
    const snap = snapshot();
    // Approximate the Firestore doc size: it stores media as refs, not the
    // base64 blobs, so strip those to gauge the text weight against the cap.
    const textOnly = {
      ...snap,
      journalEntries: snap.journalEntries.map((e) => ({
        ...e, photo: undefined, photos: undefined, audio: undefined, audios: undefined,
      })),
    };
    const bytes = new Blob([JSON.stringify(textOnly)]).size;
    let photos = 0;
    for (const e of snap.journalEntries) photos += (e.photos?.length ?? 0) + (e.photo ? 1 : 0);
    let lastBackup: string | null = null;
    try { lastBackup = localStorage.getItem("madar-last-backup"); } catch { /* ignore */ }
    setInfo({
      bytes,
      photos,
      entries: snap.journalEntries.length,
      transactions: snap.transactions.length,
      lastBackup,
    });
  }, [snapshot]);

  if (!info) return null;

  const pct = Math.min(100, Math.round((info.bytes / DOC_LIMIT) * 100));
  const kb = Math.round(info.bytes / 1024);
  const barColor = pct >= 80 ? "bg-red-500" : pct >= 65 ? "bg-amber-500" : "bg-finance";

  const backupAgeDays = info.lastBackup
    ? Math.floor((Date.now() - new Date(info.lastBackup + "T00:00:00").getTime()) / 86400000)
    : null;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-gray-700">صحة البيانات</span>
        {/* Build marker: lets us confirm which deployed build a device is running
            while diagnosing sync issues. Bump on each diagnostic deploy. */}
        <span className="ms-auto text-[10px] text-gray-400 font-mono" dir="ltr">{BUILD_TAG}</span>
      </div>

      {/* حجم مستند المزامنة مقابل حد 1MB */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="flex items-center gap-1.5 text-gray-500">
            <HardDrive size={13} /> حجم بيانات المزامنة
          </span>
          <span className={pct >= 65 ? "font-semibold text-amber-600" : "text-gray-400"}>
            {kb}KB / 1MB · {pct}%
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(2, pct)}%` }} />
        </div>
        {pct >= 65 && (
          <p className="text-[11px] text-amber-600 mt-1.5 leading-relaxed">
            قاربت بيانات المزامنة الحد الأقصى — الصور محفوظة منفصلة، لكن كثرة النصوص قد توقف المزامنة عند 1MB.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label="المذكرات" value={String(info.entries)} />
        <Row label="العمليات" value={String(info.transactions)} />
        <Row label="الصور" value={String(info.photos)} />
        <Row
          label="آخر نسخة احتياطية"
          value={info.lastBackup ? `${info.lastBackup}${backupAgeDays !== null && backupAgeDays > 0 ? ` (${backupAgeDays}ي)` : ""}` : "—"}
          warn={backupAgeDays === null || backupAgeDays > 14}
          icon={<ShieldCheck size={12} />}
        />
      </div>

      {/* حالة الوسائط والمزامنة */}
      {enabled && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 flex items-center gap-2 text-xs">
          {mediaPending ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <ImageUp size={13} /> وسائط بانتظار الرفع
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-finance">
              <CheckCircle2 size={13} /> كل الوسائط مرفوعة
            </span>
          )}
          {lastSyncedAt && (
            <span className="text-gray-400 mr-auto">
              آخر مزامنة: {new Date(lastSyncedAt).toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      )}

      {/* فحص الصور: مطابقة المحلي بالسحابي وكشف المراجع المكسورة (طمأنينة قبل الترحيل) */}
      {enabled && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={runScan}
            disabled={scanning}
            className="w-full flex items-center justify-center gap-2 text-sm font-medium text-brand-600 bg-brand-50 rounded-xl py-2.5 press disabled:opacity-60"
          >
            {scanning ? <Loader2 size={15} className="animate-spin" /> : <ScanSearch size={15} />}
            {scanning ? "جارٍ فحص الصور..." : "فحص الصور والمزامنة"}
          </button>

          {reuploadError && (
            <p className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-500 leading-relaxed break-words" dir="auto">
              ⚠️ سبب فشل الرفع: {reuploadError}
            </p>
          )}

          {scan && !scan.storageReachable && (
            <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-500 leading-relaxed animate-fade-up">
              {STORAGE_ERROR_MESSAGE[scan.storageError ?? "network"]}
            </div>
          )}
          {scan && scan.storageReachable && (
            <div className="mt-3 space-y-3 animate-fade-up">
              {scan.uploadError && (
                <p className="rounded-xl bg-amber-50 dark:bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-500 leading-relaxed">
                  ⚠️ فشل رفع بعض الملفات: {scan.uploadError}
                </p>
              )}
              <ScanRow title="الصور" r={scan.photos} />
              <ScanRow title="الأصوات" r={scan.audios} />
              {(scan.photos.broken > 0 || scan.audios.broken > 0) && (
                <p className="text-[11px] text-red-500 leading-relaxed">
                  ⚠️ يوجد {scan.photos.broken + scan.audios.broken} مرجع مكسور (ملف مفقود من السحابة ولا نسخة محلية له).
                  إعادة الرفع تُصلح المعلّق المحلي فقط؛ المكسور تمامًا يُستعاد من نسخة احتياطية إن وُجدت.
                </p>
              )}
              {(scan.photos.pendingUpload > 0 || scan.audios.pendingUpload > 0 || scan.photos.broken > 0 || scan.audios.broken > 0) && (
                <button
                  onClick={reupload}
                  disabled={reuploading}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-finance rounded-xl py-2.5 press disabled:opacity-60"
                >
                  {reuploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
                  {reuploading ? "جارٍ إعادة الرفع..." : "إعادة رفع كل الوسائط"}
                </button>
              )}
              {scan.photos.broken === 0 && scan.audios.broken === 0 &&
               scan.photos.pendingUpload === 0 && scan.audios.pendingUpload === 0 && (
                <p className="text-[11px] text-finance">✓ كل الوسائط المُشار إليها موجودة في السحابة</p>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ScanRow({ title, r }: { title: string; r: import("@/lib/sync").MediaTypeReport }) {
  return (
    <div className="rounded-lg bg-white/70 dark:bg-white/5 p-2.5">
      <div className="text-[11px] font-semibold text-gray-600 mb-1.5">{title} · {r.referenced} مُشار إليها</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="flex justify-between"><span className="text-gray-500">في السحابة</span><span className="text-finance font-semibold">{r.inCloud}</span></span>
        <span className="flex justify-between"><span className="text-gray-500">بانتظار الرفع</span><span className={r.pendingUpload ? "text-amber-600 font-semibold" : "text-gray-400"}>{r.pendingUpload}</span></span>
        <span className="flex justify-between"><span className="text-gray-500">مكسورة</span><span className={r.broken ? "text-red-500 font-semibold" : "text-gray-400"}>{r.broken}</span></span>
        <span className="flex justify-between"><span className="text-gray-500">يتيمة</span><span className="text-gray-400">{r.orphans}</span></span>
      </div>
    </div>
  );
}

function Row({ label, value, warn, icon }: { label: string; value: string; warn?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-1 text-gray-500">{icon}{label}</span>
      <span className={warn ? "font-semibold text-amber-600" : "text-gray-700 dark:text-gray-300"}>{value}</span>
    </div>
  );
}
