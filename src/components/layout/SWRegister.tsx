"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

// Registers the offline service worker. `bp` is the build-time base path
// (/My-dream on GitHub Pages, empty elsewhere) passed down from the server
// layout so the worker resolves and scopes correctly under a subpath.
export function SWRegister({ bp }: { bp: string }) {
  useEffect(() => {
    // Native assets are bundled. idbStorage requests persistent storage when
    // the store is read, so this registration path stays entirely web-only.
    if (Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${bp}/sw.js`, { scope: `${bp}/` }).catch(() => {});
    navigator.storage?.persist?.().catch(() => {});
  }, [bp]);
  return null;
}
