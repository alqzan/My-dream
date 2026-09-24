import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";

/** Keep clipboard access behind one seam so native and browser permissions
 * follow their respective platform APIs. Browser behavior is unchanged. */
export async function readClipboardText(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const result = await Clipboard.read();
    return result.type === "text/plain" || result.type === "text" ? result.value : "";
  }
  return navigator.clipboard.readText();
}

export async function writeClipboardText(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Clipboard.write({ string: text });
    return;
  }
  await navigator.clipboard.writeText(text);
}

/** Clear sensitive copied text only if it is still the current clipboard value. */
export async function clearClipboardTextIfMatches(expected: string): Promise<void> {
  if (await readClipboardText() === expected) await writeClipboardText("");
}
