"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useSync } from "@/components/sync/SyncProvider";
import { Card } from "@/components/ui/Card";
import { Activity, ImageUp, HardDrive, ShieldCheck, CheckCircle2 } from "lucide-react";

const DOC_LIMIT = 1024 * 1024; // Firestore's hard 1MB-per-document cap.

// "صحة البيانات" (§12): a plain, honest read-out of where the owner's data
// stands — how close the sync document is to the 1MB cap, when the last backup
// was, whether any media is still uploading, and how much is stored. No action
// happens here; it's a dashboard so nothing important stays invisible.
export function DataHealthCard() {
  const snapshot = useAppStore((s) => s.snapshot);
  const { mediaPending, lastSyncedAt, enabled } = useSync();
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
    </Card>
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
