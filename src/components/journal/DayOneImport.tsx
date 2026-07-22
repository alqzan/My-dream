"use client";
import { useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { parseDayOneJson, streamDayOneZipImport, type BatchImportProgress } from "@/lib/dayOneParser";
import { Upload, CheckCircle, AlertCircle, Loader2, Trash2, UploadCloud, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isFirebaseEnabled, getSyncSpace } from "@/lib/firebase";
import { reuploadAllMedia } from "@/lib/sync";

interface ImportStats {
  files: number;
  added: number;
  completed: number; // existing entries whose missing media we filled in
  duplicates: number;
  skippedEmpty: number;
  photos: number;
  audio: number;
  // How many photo/audio files the export referenced but couldn't be decoded —
  // surfaced so a partial import isn't shown as a clean success.
  mediaMissing: number;
  // True when the owner cancelled mid-import — re-running resumes (dedupes).
  cancelled: boolean;
}

export function DayOneImport({ onClose }: { onClose: () => void }) {
  const { importDayOneEntries, deleteDayOneImports, journalEntries, snapshot } = useAppStore();
  const [status, setStatus] = useState<"idle" | "working" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletedCount, setDeletedCount] = useState<number | null>(null);
  const [reupload, setReupload] = useState<"idle" | "working" | "done" | "error">("idle");
  // Live progress for a big ZIP + a cancel flag the parser polls between files.
  const [progress, setProgress] = useState<BatchImportProgress | null>(null);
  const cancelRef = useRef(false);

  const dayOneCount = journalEntries.filter((e) => e.source === "dayOne").length;
  const photoCount = journalEntries.filter((e) => e.photos?.length || e.photo).length;
  const syncSpace = getSyncSpace();

  async function handleReupload() {
    if (!syncSpace) return;
    setReupload("working");
    try {
      await reuploadAllMedia(syncSpace, snapshot());
      setReupload("done");
    } catch {
      setReupload("error");
    }
  }

  function handleDeleteImports() {
    const n = deleteDayOneImports();
    setConfirmDelete(false);
    setDeletedCount(n);
  }

  async function handleFiles(files: File[]) {
    const isZip = (f: File) =>
      f.name.toLowerCase().endsWith(".zip") ||
      f.type === "application/zip" ||
      f.type === "application/x-zip-compressed";
    const isJson = (f: File) => f.name.toLowerCase().endsWith(".json") || f.type === "application/json";

    const chosen = files.filter((f) => isJson(f) || isZip(f));
    if (!chosen.length) {
      setStatus("error");
      setMessage("اختر ملف Day One بصيغة ZIP أو JSON.");
      return;
    }
    setStatus("working");
    cancelRef.current = false;
    setProgress(null);
    const total: ImportStats = { files: 0, added: 0, completed: 0, duplicates: 0, skippedEmpty: 0, photos: 0, audio: 0, mediaMissing: 0, cancelled: false };
    try {
      for (const file of chosen) {
        if (cancelRef.current) { total.cancelled = true; break; }
        if (isZip(file)) {
          // Big archives stream in BATCHES so peak memory stays near one batch,
          // not the whole library — each batch is persisted before the next.
          const result = await streamDayOneZipImport(file, {
            batchSize: 40,
            shouldCancel: () => cancelRef.current,
            onProgress: setProgress,
            onBatch: (entries) => {
              const r = importDayOneEntries(entries);
              total.added += r.added;
              total.completed += r.completed;
              total.duplicates += entries.length - r.added - r.completed;
              total.photos += r.photos;
              total.audio += r.audio;
            },
          });
          total.files++;
          total.skippedEmpty += result.skippedEmpty;
          total.mediaMissing +=
            (result.photosReferenced - result.photosImported) +
            (result.audiosReferenced - result.audiosImported);
          if (result.cancelled) { total.cancelled = true; break; }
        } else {
          // JSON is text-only and small — no need to batch.
          const result = parseDayOneJson(await file.text());
          const r = importDayOneEntries(result.entries);
          total.files++;
          total.added += r.added;
          total.completed += r.completed;
          total.duplicates += result.entries.length - r.added - r.completed;
          total.skippedEmpty += result.skippedEmpty;
          total.photos += r.photos;
          total.audio += r.audio;
        }
      }
      setStats(total);
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "خطأ في قراءة الملف");
    } finally {
      setProgress(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles([...e.dataTransfer.files]);
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-500 bg-blue-50 rounded-xl p-3 leading-relaxed">
        <strong className="text-blue-700">كيفية التصدير من Day One:</strong>
        <br />
        افتح Day One ← File ← Export ← JSON ← احفظ الملف.
        <br />
        <span className="text-xs opacity-80">
          ارفع ملف <strong>ZIP</strong> كما هو لاستيراد الصور والصوت أيضاً، أو ملف JSON للنصوص فقط.
          نستخرج العنوان والوقت والوسوم تلقائياً، وننظف النص، ولا نكرر المستورد سابقاً — وتقدر ترفع عدة ملفات.
        </span>
      </div>

      {status === "idle" && (
        <label
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`block border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-journal bg-journal/5" : "border-gray-200 hover:border-gray-300"
          }`}
        >
          <Upload size={28} className="mx-auto text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">اسحب ملفات ZIP أو JSON هنا</p>
          <p className="text-xs text-gray-400 mt-1">أو اضغط للاختيار — يمكن اختيار عدة ملفات</p>
          <input
            type="file"
            accept=".json,.zip,application/zip,application/json"
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) handleFiles([...e.target.files]); }}
          />
        </label>
      )}

      {status === "working" && (
        <div className="py-6 space-y-4">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <Loader2 size={20} className="animate-spin" />
            <p className="text-sm">
              {cancelRef.current ? "جارٍ الإيقاف بعد حفظ الدفعة الحالية…" : "جارٍ الاستيراد والتنظيف..."}
            </p>
          </div>
          {progress && progress.entriesTotal > 0 && (
            <div className="max-w-xs mx-auto space-y-1.5">
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-journal transition-all"
                  style={{ width: `${Math.max(2, Math.round((progress.entriesDone / progress.entriesTotal) * 100))}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 text-center">
                {progress.entriesDone} / {progress.entriesTotal} مذكرة
                {progress.mediaTotal > 0 && ` · ${progress.mediaDone}/${progress.mediaTotal} وسائط`}
              </p>
            </div>
          )}
          <button
            onClick={() => { cancelRef.current = true; }}
            disabled={cancelRef.current}
            className="mx-auto flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 press disabled:opacity-50"
          >
            <X size={13} /> إيقاف الاستيراد
          </button>
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            ما استُورد حتى الآن محفوظ. لو أوقفت أو انقطع، أعد نفس الملف لاحقاً — نُكمل من حيث توقّفنا بلا تكرار.
          </p>
        </div>
      )}

      {status === "success" && stats && (
        <div className={`rounded-xl p-4 space-y-2 ${stats.cancelled ? "bg-amber-50" : "bg-green-50"}`}>
          <div className={`flex items-center gap-2 ${stats.cancelled ? "text-amber-700" : "text-green-700"}`}>
            {stats.cancelled ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
            <p className="text-sm font-bold">
              {stats.cancelled
                ? `أوقفت الاستيراد — حُفظت ${stats.added} مذكرة`
                : `تم استيراد ${stats.added} مذكرة بنجاح ✨`}
            </p>
          </div>
          {stats.cancelled && (
            <p className="text-xs text-amber-700/80 pr-7 leading-relaxed">
              أعد رفع نفس الملف متى شئت لإكمال الباقي — لن يتكرّر ما استُورد.
            </p>
          )}
          <div className="text-xs text-green-700/80 space-y-0.5 pr-7">
            {stats.files > 1 && <p>• من {stats.files} ملفات</p>}
            {stats.completed > 0 && <p>• أكملنا وسائط {stats.completed} مذكرة موجودة</p>}
            {stats.photos > 0 && <p>• مع {stats.photos} مذكرة فيها صور</p>}
            {stats.audio > 0 && <p>• مع {stats.audio} مذكرة فيها صوت</p>}
            {stats.duplicates > 0 && <p>• تخطينا {stats.duplicates} مذكرة مستوردة سابقاً (بلا تكرار)</p>}
            {stats.skippedEmpty > 0 && <p>• تجاهلنا {stats.skippedEmpty} مدخلة فارغة</p>}
          </div>
          {stats.mediaMissing > 0 && (
            <div className="flex items-start gap-2 text-amber-700 bg-amber-50 rounded-lg p-2.5 mt-1">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                تعذّر قراءة {stats.mediaMissing} ملف وسائط (صورة/صوت) من التصدير — غالباً صيغة لم يستطع
                المتصفح فكّها. أعد الاستيراد من نفس الملف لاحقاً؛ سنُكمل الناقص دون تكرار.
              </p>
            </div>
          )}
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center gap-3 bg-red-50 text-red-700 rounded-xl p-4">
          <AlertCircle size={20} />
          <p className="text-sm">{message}</p>
        </div>
      )}

      {isFirebaseEnabled && syncSpace && photoCount > 0 && status !== "working" && (
        <div className="border-t border-gray-100 pt-3">
          {reupload === "done" ? (
            <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-xl p-3 text-sm">
              <CheckCircle size={18} className="shrink-0" />
              بدأ رفع الصور للسحابة. افتح التطبيق على أجهزتك الأخرى بعد قليل لتنزل الصور.
            </div>
          ) : (
            <>
              <button
                onClick={handleReupload}
                disabled={reupload === "working"}
                className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 press disabled:opacity-60"
              >
                {reupload === "working" ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                {reupload === "working" ? "جارٍ إعادة رفع الصور…" : `أعد رفع كل الصور للسحابة (${photoCount})`}
              </button>
              <p className="text-[11px] text-gray-400 mt-1">
                لو صورك ما وصلت لأجهزتك الأخرى — يجبر رفعها من جديد.
              </p>
              {reupload === "error" && (
                <p className="text-xs text-red-500 mt-1">تعذّرت إعادة الرفع — تأكد من الاتصال وحاول مجدداً.</p>
              )}
            </>
          )}
        </div>
      )}

      {deletedCount !== null && (
        <div className="flex items-center gap-2 bg-gray-50 text-gray-600 rounded-xl p-3 text-sm">
          <CheckCircle size={18} className="text-finance shrink-0" />
          {deletedCount > 0
            ? `تم حذف ${deletedCount} مذكرة مستوردة من Day One. تقدر تستورد من جديد.`
            : "ما فيه مذكرات مستوردة من Day One لحذفها."}
        </div>
      )}

      {dayOneCount > 0 && status !== "working" && deletedCount === null && (
        <div className="border-t border-gray-100 pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 press"
            >
              <Trash2 size={13} /> حذف كل ما استوردته من Day One ({dayOneCount} مذكرة)
            </button>
          ) : (
            <div className="bg-red-50 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-700 leading-relaxed">
                متأكد؟ سيُحذف {dayOneCount} مذكرة مستوردة من Day One نهائياً (مذكراتك المكتوبة يدوياً تبقى). مفيد لو تبي تعيد الاستيراد من الصفر.
              </p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">
                  تراجع
                </Button>
                <button
                  onClick={handleDeleteImports}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl py-2 press"
                >
                  نعم، احذف الكل
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {(status === "success" || status === "error") && (
          <Button variant="secondary" onClick={() => { setStatus("idle"); setStats(null); }} className="flex-1">
            استيراد مرة أخرى
          </Button>
        )}
        <Button
          variant={status === "success" ? "primary" : "secondary"}
          onClick={onClose}
          className="flex-1"
        >
          {status === "success" ? "تم ✓" : "إغلاق"}
        </Button>
      </div>
    </div>
  );
}
