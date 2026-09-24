import { Capacitor } from "@capacitor/core";

let nativePersistenceRequest: Promise<boolean> | null = null;

export function isNativeStoragePlatform(): boolean {
  return Capacitor.getPlatform() === "ios";
}

/** يطلب وضع التخزين الدائم من WebKit على iOS 17+؛ الرفض لا يغيّر التخزين. */
export function requestNativeStoragePersistence(): Promise<boolean> {
  if (!isNativeStoragePlatform()) return Promise.resolve(false);
  if (!nativePersistenceRequest) {
    nativePersistenceRequest = (async () => {
      try {
        const storage = globalThis.navigator?.storage;
        if (!storage?.persist || !storage.persisted) return false;
        if (await storage.persisted()) return true;
        return await storage.persist();
      } catch {
        return false;
      }
    })();
  }
  return nativePersistenceRequest;
}
