"use client";
import { useEffect } from "react";

// Friendly recovery screen — بياناتك في IndexedDB ولا تُمس هنا إطلاقاً.
// Stale-deploy chunk errors (cached HTML pointing at deleted hashed files)
// are auto-recovered by clearing HTTP caches and reloading once.
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const isStaleChunk =
      /Loading chunk|ChunkLoadError|Importing a module script failed|Failed to fetch dynamically imported|error loading dynamically imported/i.test(
        `${error?.name ?? ""} ${error?.message ?? ""}`
      );
    const key = "madar-auto-recover";
    if (isStaleChunk && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      clearHttpCachesAndReload();
    }
  }, [error]);

  return (
    <div dir="rtl" className="min-h-[70vh] flex flex-col items-center justify-center px-6 text-center gap-4">
      <p className="text-5xl">🌙</p>
      <h1 className="text-xl font-black text-gray-900">صار خطأ مؤقت في التحميل</h1>
      <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
        اطمئن — <b>بياناتك كلها سليمة ومحفوظة على جهازك</b> ولا يمسّها هذا الخطأ.
        غالباً نسخة قديمة من التطبيق عالقة في الذاكرة المؤقتة.
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        <button
          onClick={clearHttpCachesAndReload}
          className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm py-3 rounded-xl transition-colors"
        >
          🔄 تحديث التطبيق للنسخة الجديدة
        </button>
        <button
          onClick={reset}
          className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm py-3 rounded-xl transition-colors"
        >
          المحاولة مرة أخرى
        </button>
      </div>
      {error?.message && (
        <p className="text-[10px] text-gray-300 max-w-xs break-all leading-relaxed" dir="ltr">
          {error.message.slice(0, 160)}
        </p>
      )}
    </div>
  );
}

// Clears HTTP caches + service workers only — never touches IndexedDB data.
async function clearHttpCachesAndReload() {
  try {
    if ("caches" in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) ?? [];
    for (const r of regs) await r.unregister();
  } catch {
    // ignore — reload anyway
  }
  window.location.reload();
}
