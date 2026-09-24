import { Capacitor } from "@capacitor/core";
import type { MediaResult } from "@capacitor/camera";

function base64Bytes(value: string): Uint8Array {
  const encoded = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function nativeJpegBlob(base64: string): Blob {
  const bytes = base64Bytes(base64);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "image/jpeg" });
}

async function readJpeg(result: Pick<MediaResult, "uri" | "webPath" | "thumbnail">): Promise<Blob> {
  if (result.uri) {
    const { Filesystem } = await import("@capacitor/filesystem");
    const file = await Filesystem.readFile({ path: result.uri });
    if (typeof file.data === "string") return nativeJpegBlob(file.data);
    return file.data;
  }
  if (result.webPath) {
    const response = await fetch(result.webPath);
    if (!response.ok) throw new Error(`تعذّرت قراءة الصورة (${response.status})`);
    return new Blob([await response.blob()], { type: "image/jpeg" });
  }
  if (result.thumbnail) return nativeJpegBlob(result.thumbnail);
  throw new Error("لم تُرجع الكاميرا ملف صورة");
}

/** يفتح كاميرا Capacitor الأصلية، ويطلب JPEG لتجاوز HEIC في مسار التصوير. */
export async function takeNativePhoto(): Promise<Blob> {
  if (!Capacitor.isNativePlatform()) throw new Error("الكاميرا الأصلية غير متاحة في المتصفح");
  const { Camera, EncodingType } = await import("@capacitor/camera");
  const result = await Camera.takePhoto({ encodingType: EncodingType.JPEG, quality: 92 });
  return readJpeg(result);
}

/** منتقي الصور الأصلي يعيد صوراً بصيغة JPEG على iOS. */
export async function chooseNativePhotos(limit: number): Promise<Blob[]> {
  if (!Capacitor.isNativePlatform()) throw new Error("منتقي الصور الأصلي غير متاح في المتصفح");
  const { Camera, MediaTypeSelection } = await import("@capacitor/camera");
  const { results } = await Camera.chooseFromGallery({
    mediaType: MediaTypeSelection.Photo,
    allowMultipleSelection: true,
    limit,
    quality: 92,
  });
  const photos: Blob[] = [];
  for (const result of results) photos.push(await readJpeg(result));
  return photos;
}
