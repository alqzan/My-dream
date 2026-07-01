"use client";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";

// Renders children only after (1) the component has mounted on the client and
// (2) the persisted store has finished hydrating from IndexedDB (async). This
// avoids hydration mismatches and a flash of empty data on first paint.
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());

  useEffect(() => {
    setMounted(true);
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    return () => unsub();
  }, []);

  if (!mounted || !hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-bold text-gray-900">مدار</div>
          <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
