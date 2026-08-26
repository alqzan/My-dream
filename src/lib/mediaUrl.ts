// روابط الوسائط التي يسمح التطبيق بفتحها داخل المرفقات.
// النسخة الاحتياطية ملفٌ يختاره المستخدم، لذلك لا نعامل localData القادم
// منه على أنه رابطٌ موثوق لمجرّد أن نوعه string.

const SAFE_DATA_MIME = /^(?:image\/(?:avif|bmp|gif|heic|heif|jpeg|jpg|png|webp)|audio\/(?:aac|m4a|mp3|mpeg|ogg|wav|webm|x-m4a|x-wav)|video\/(?:mp4|mpeg|ogg|quicktime|webm)|application\/(?:pdf|octet-stream|zip|x-7z-compressed|x-rar-compressed|gzip|x-tar)|application\/(?:msword|vnd\.ms-(?:excel|powerpoint)|vnd\.openxmlformats-officedocument\.(?:wordprocessingml|spreadsheetml|presentationml)\.document))$/i;

/**
 * Allow only media URLs the app can legitimately create or fetch.
 *
 * `data:` is restricted to base64 binary media; notably text/html and SVG are
 * excluded because an imported value may later be used as an `<a href>`.
 * Remote media is HTTPS-only, and blob URLs are limited to the current browser
 * session. Everything else, including javascript:, file:, and relative URLs,
 * is rejected.
 */
export function isSafeMediaUrl(value: string | undefined | null): value is string {
  if (!value) return false;
  if (value.startsWith("data:")) {
    const comma = value.indexOf(",");
    if (comma <= 5) return false;
    const metadata = value.slice(5, comma).split(";");
    const mime = metadata.shift()?.trim() ?? "";
    return SAFE_DATA_MIME.test(mime) && metadata.some((part) => part.trim().toLowerCase() === "base64");
  }
  if (value.startsWith("blob:")) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
