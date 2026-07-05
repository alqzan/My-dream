"use client";
import { useAuth } from "./AuthProvider";
import { Cloud, CloudOff, LogOut, RefreshCw } from "lucide-react";
import { useState } from "react";

export function SyncButton() {
  const { user, enabled, syncing, syncError, signIn, signOut, retrySync } = useAuth();
  const [busy, setBusy] = useState(false);

  // When Firebase isn't configured yet, hide entirely.
  if (!enabled) return null;

  async function handle() {
    setBusy(true);
    try {
      if (user) await signOut();
      else await signIn();
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        {syncError && !syncing ? (
          // Honest failure state — don't claim "saved" when it isn't. Tap to retry.
          <button
            onClick={retrySync}
            className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600"
            title="فشلت المزامنة — اضغط لإعادة المحاولة"
          >
            <CloudOff size={13} />
            <span>لم تُحفظ — إعادة المحاولة</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            {syncing ? (
              <RefreshCw size={13} className="text-finance animate-spin" />
            ) : (
              <Cloud size={13} className="text-finance" />
            )}
            <span className="hidden sm:inline">{syncing ? "يزامن..." : "محفوظ سحابياً"}</span>
          </div>
        )}
        {user.photoURL && (
          <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
        )}
        <button
          onClick={handle}
          disabled={busy}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-red-400"
          title="تسجيل خروج"
        >
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handle}
      disabled={busy}
      className="flex items-center gap-1.5 text-xs font-medium bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-gray-600 hover:border-finance/40 transition-colors"
    >
      <CloudOff size={14} className="text-gray-400" />
      مزامنة سحابية
    </button>
  );
}
