"use client";
import { useEffect, useState } from "react";

// Renders children only after the component has mounted on the client.
// This app is a fully client-side SPA exported as static HTML; gating on
// mount avoids hydration mismatches from localStorage, auth state and dates
// that differ between build-time HTML and the live browser.
export function ClientOnly({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-bold text-gray-900">حلمي</div>
          <div className="w-6 h-6 border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
