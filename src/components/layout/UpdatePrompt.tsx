"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// Non-blocking "a new version is ready" banner (§13). Watches the already-
// registered service worker (registered by SWRegister) for a freshly-installed
// update and, only when there was a previous controller (i.e. a real update,
// not the first install), offers a one-tap reload. The SW uses skipWaiting, so
// a plain reload swaps in the new shell + hashed chunks — we don't change its
// activation, only surface it instead of updating silently behind the user.
export function UpdatePrompt() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg || cancelled) return;

      // An update already waiting when we mounted.
      if (reg.waiting && navigator.serviceWorker.controller) setAvailable(true);

      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          // Newly installed AND a controller already ran = this is an update,
          // not the first-ever install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            if (!cancelled) setAvailable(true);
          }
        });
      });
    });

    return () => { cancelled = true; };
  }, []);

  if (!available) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-20 lg:bottom-4 z-[70] mx-auto w-fit max-w-[92%] flex items-center gap-3 rounded-full bg-brand-600 text-white shadow-lg px-4 py-2.5 animate-fade-up"
    >
      <RefreshCw size={15} />
      <span className="text-sm font-medium">يتوفّر تحديث جديد لمدار</span>
      <button
        onClick={() => location.reload()}
        className="text-sm font-bold bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 press"
      >
        إعادة التشغيل
      </button>
    </div>
  );
}
