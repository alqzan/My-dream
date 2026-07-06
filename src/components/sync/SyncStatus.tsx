"use client";
import { useSync } from "./SyncProvider";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";

// Automatic, login-free sync status. Every device shares one space, so there
// is nothing to sign into — this just shows whether we're up to date.
export function SyncStatus() {
  const { enabled, status } = useSync();

  if (!enabled) return null;

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
