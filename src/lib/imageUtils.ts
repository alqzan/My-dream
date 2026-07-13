// Compress image using Canvas API — targets ~150KB WebP
export async function compressImage(file: Blob, maxKB = 200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");

        // Max dimension 1080px
        const MAX = 1080;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width > height) {
            height = Math.round((height * MAX) / width);
            width = MAX;
          } else {
            width = Math.round((width * MAX) / height);
            height = MAX;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, width, height);

        // Try quality levels until under maxKB
        let quality = 0.85;
        let dataUrl = canvas.toDataURL("image/webp", quality);

        // Safari and Firefox can't encode WebP from canvas — they silently
        // return a PNG instead regardless of the requested type, and PNG
        // ignores the quality argument entirely, so the photo stays huge
        // with no real compression. Detect that and re-encode as JPEG
        // (quality-aware, universally supported) instead.
        const mimeType = dataUrl.startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
        if (mimeType !== "image/webp") dataUrl = canvas.toDataURL(mimeType, quality);

        while (dataUrl.length / 1024 > maxKB * 1.37 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL(mimeType, quality);
        }

        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Lazy-loaded HEIC→JPEG decoder. iPhone photos are usually HEIC, which Chrome
// (and many browsers) can't draw to a canvas — so those photos silently got
// dropped on import. We convert HEIC to JPEG first, loading the heavy decoder
// only when a HEIC actually appears (dynamic import → separate chunk).
let heicLoader: Promise<(opts: { blob: Blob; toType?: string; quality?: number }) => Promise<Blob | Blob[]>> | null = null;
function loadHeic() {
  if (!heicLoader) heicLoader = import("heic2any").then((m) => (m.default ?? m) as never);
  return heicLoader;
}

// Compress any image, transparently decoding HEIC/HEIF first so it works in
// every browser. Falls back to the raw blob if conversion fails (Safari can
// often decode HEIC natively).
export async function compressImageSmart(blob: Blob, maxKB = 200): Promise<string> {
  const type = (blob.type || "").toLowerCase();
  let input = blob;
  if (type.includes("heic") || type.includes("heif")) {
    try {
      const heic2any = await loadHeic();
      const out = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
      input = Array.isArray(out) ? out[0] : out;
    } catch {
      input = blob; // let compressImage try the original (works on Safari)
    }
  }
  return compressImage(input, maxKB);
}

export function estimateSize(dataUrl: string): string {
  const bytes = (dataUrl.length * 3) / 4;
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
