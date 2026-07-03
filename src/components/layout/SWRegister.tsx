"use client";
import { useEffect } from "react";

// Registers the offline service worker. `bp` is the build-time base path
// (/My-dream on GitHub Pages, empty elsewhere) passed down from the server
// layout so the worker resolves and scopes correctly under a subpath.
export function SWRegister({ bp }: { bp: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`${bp}/sw.js`, { scope: `${bp}/` }).catch(() => {});
  }, [bp]);
  return null;
}
