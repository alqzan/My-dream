"use client";
import Link from "next/link";
import { useSync } from "./SyncProvider";
import { isFirebaseEnabled } from "@/lib/firebase";
import { Cloud, CloudOff, RefreshCw, KeyRound, ImageUp } from "lucide-react";

// Automatic, login-free sync status. Every device shares one space, so there
// is nothing to sign into — this just shows whether we're up to date.
export function SyncStatus() {
  const { enabled, status, mediaPending } = useSync();

  // Sync is possible on this build but no key is set on THIS device (e.g. a
  // freshly-opened laptop) → sync is silently off. Never render nothing here:
  // a blank indicator is exactly why "opened on the laptop and nothing synced"
  // is a shock. Show a tappable hint that routes to the sync-key setup so the
  // owner immediately sees sync is off and knows how to turn it on.
  if (!enabled) {
    if (!isFirebaseEnabled) return null;
    return (
      <Link
        href="/settings"
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500 press"
        title="المزامنة غير مفعّلة على هذا الجهاز — أضف مفتاح المزامنة لتظهر بياناتك"
      >
        <KeyRound size={13} />
        <span className="hidden sm:inline">فعّل المزامنة</span>
      </Link>
    );
  }

  if (status === "offline") {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-gray-400"
        title="بدون اتصال — يُحفظ على الجهاز ويتزامن عند عودة الاتصال"
      >
        <CloudOff size={13} />
        <span className="hidden sm:inline">دون اتصال</span>
      </div>
    );
  }

  const syncing = status === "syncing";

  // Honest state: the text synced but a photo/voice note is still uploading (or
  // failed and will retry). Never claim "متزامن" while media is stranded — that
  // false reassurance is exactly how a photo silently fails to reach the other
  // device.
  if (!syncing && mediaPending) {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500"
        title="النص تزامن، لكن رفع صورة/صوت لم يكتمل بعد — يُعاد المحاولة تلقائياً"
      >
        <ImageUp size={13} />
        <span className="hidden sm:inline">بانتظار رفع الوسائط</span>
      </div>
    );
  }

  // Honest middle state: the main doc synced but a journal shard couldn't be
  // read this round, so the picture may be incomplete. Not an error (we're
  // online), but not a clean "متزامن" either — it reconciles on the next load.
  if (!syncing && status === "partial") {
    return (
      <div
        className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500"
        title="تزامن جزئي — تعذّرت قراءة جزء من المذكرات هذه المرة، سيكتمل عند التحديث التالي"
      >
        <CloudOff size={13} />
        <span className="hidden sm:inline">مزامنة جزئية</span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-gray-500"
      title="المزامنة تلقائية عبر أجهزتك"
    >
      {syncing ? (
        <RefreshCw size={13} className="text-finance animate-spin" />
      ) : (
        <Cloud size={13} className="text-finance" />
      )}
      <span className="hidden sm:inline">{syncing ? "يزامن..." : "متزامن"}</span>
    </div>
  );
}
