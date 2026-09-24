import { Capacitor } from "@capacitor/core";
import { APP_BUILD } from "@/lib/version";

// The Pages workflow publishes a static GET manifest beside immutable bundles.
// Do not point the native plugin's auto-update endpoint at this URL: that API
// expects a POST service, while GitHub Pages only serves static files.
export const OTA_MANIFEST_URL = "https://alqzan.github.io/My-dream/ota/manifest.json";
const OTA_BUNDLE_PREFIX = "https://alqzan.github.io/My-dream/ota/";

export interface OtaManifest {
  appBuild: number;
  version: string;
  url: string;
  checksum: string;
}

/** Validates the static Pages manifest and ignores builds already in the app. */
export function parseOtaManifest(value: unknown, currentBuild = APP_BUILD): OtaManifest | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const appBuild = candidate.appBuild;
  const version = candidate.version;
  const url = candidate.url;
  const checksum = candidate.checksum;

  if (!Number.isSafeInteger(appBuild) || (appBuild as number) <= currentBuild) return null;
  if (version !== `0.1.${appBuild}`) return null;
  if (typeof url !== "string" || !url.startsWith(OTA_BUNDLE_PREFIX)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.origin !== "https://alqzan.github.io") return null;
    if (!/^\/My-dream\/ota\/madar-0\.1\.\d+\.zip$/.test(parsed.pathname)) return null;
  } catch {
    return null;
  }
  if (typeof checksum !== "string" || checksum.trim().length < 32) return null;
  return { appBuild: appBuild as number, version, url, checksum };
}

export async function checkNativeOta(): Promise<OtaManifest | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const response = await fetch(OTA_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`OTA manifest request failed (${response.status})`);
  return parseOtaManifest(await response.json());
}

/** Downloads a verified bundle and schedules it for the next app background/relaunch. */
export async function downloadNativeOta(manifest: OtaManifest): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  const bundle = await CapacitorUpdater.download({
    url: manifest.url,
    version: manifest.version,
    checksum: manifest.checksum,
  });
  await CapacitorUpdater.next({ id: bundle.id });
}

let appReadyPromise: Promise<void> | undefined;

/** Called only by BootGuard after hydrated startup reaches its existing stable state. */
export function notifyNativeAppReady(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve();
  if (!appReadyPromise) {
    appReadyPromise = import("@capgo/capacitor-updater")
      .then(({ CapacitorUpdater }) => CapacitorUpdater.notifyAppReady())
      .then(() => undefined)
      .catch((error: unknown) => {
        // Allow a later stable callback to retry if the native bridge was not ready.
        appReadyPromise = undefined;
        console.warn("Capacitor updater could not confirm the app is ready", error);
      });
  }
  return appReadyPromise;
}
