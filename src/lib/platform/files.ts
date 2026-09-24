// ===================== حفظُ ملفٍّ — واجهةُ منصّة =====================
import { Capacitor } from "@capacitor/core";

function browserSave(filename: string, blob: Blob): boolean {
  if (typeof document === "undefined" || typeof URL?.createObjectURL !== "function") return false;
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    return true;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function nativeSave(filename: string, blob: Blob): Promise<boolean> {
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const data = toBase64(new Uint8Array(await blob.arrayBuffer()));
    const { uri } = await Filesystem.writeFile({
      path: filename,
      data,
      directory: Directory.Cache,
      recursive: true,
    });
    await Share.share({
      title: filename,
      url: uri,
      dialogTitle: "مشاركة الملف",
    });
    // The iOS plugin rejects when the share sheet is canceled; resolution means
    // the selected activity completed.
    return true;
  } catch {
    return false;
  }
}

/** احفظ الملف؛ false تعني أن الحفظ أو المشاركة لم يكتمل. */
export async function saveFile(filename: string, blob: Blob): Promise<boolean> {
  try {
    return Capacitor.isNativePlatform()
      ? await nativeSave(filename, blob)
      : browserSave(filename, blob);
  } catch {
    return false;
  }
}

/** احفظ نصّاً — الغلافُ الشائع فوق `saveFile`. */
export function saveTextFile(filename: string, text: string, type = "text/plain"): Promise<boolean> {
  return saveFile(filename, new Blob([text], { type: `${type};charset=utf-8` }));
}
