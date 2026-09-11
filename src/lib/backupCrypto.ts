// Optional password protection for backup files. The whole backup JSON is
// encrypted with AES-GCM under a key derived from the password via PBKDF2
// (SHA-256). The output is a small JSON wrapper carrying the salt + IV so
// import can recognise it (isEncryptedBackup) and decrypt it. A wrong password
// just fails to decrypt — there is no recovery, by design.
//
// ===================== عددُ الدورات ونسخةُ الغلاف =====================
// عددُ دورات PBKDF2 هو كلُّ ما يقف بين كلمةِ مرورٍ بشرية وبين من يملك الملفّ:
// رفعُه يرفع كلفةَ كلّ تخمينٍ بالقدر نفسه. كانت ١٥٠ ألفاً، وتوصيةُ OWASP
// الحالية لـPBKDF2-SHA256 هي ٦٠٠ ألف — فرُفِعت.
//
// **ولا يجوز أن يكسر الرفعُ ملفّاً صُدِّر قبله.** فالعددُ ليس ثابتاً واحداً بل
// صفةٌ من صفات الغلاف: `madar-enc-v1` تعني ١٥٠ ألفاً أبداً، و`madar-enc-v2`
// تعني ٦٠٠ ألفاً. التصديرُ يكتب v2، والاستيرادُ يقرأ الاثنين — فنسخةٌ
// احتياطية من العام الماضي تُفتح كما هي، وواحدةٌ اليوم تُكتب بالعدد الأقوى.
// الحارس في `backupCrypto.test.ts`.

const MAGIC_V1 = "madar-enc-v1";
const MAGIC_V2 = "madar-enc-v2";
const MAGIC = MAGIC_V2; // ما يُكتب اليوم
const ITERATIONS_BY_MAGIC: Record<string, number> = {
  [MAGIC_V1]: 150_000,
  [MAGIC_V2]: 600_000,
};
const ITERATIONS = ITERATIONS_BY_MAGIC[MAGIC];

// Chunked base64 so large ciphertexts (a backup with inlined photos can be
// several MB) don't blow the call-stack the way String.fromCharCode(...bytes)
// would on a big spread.
function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBuf(s: string): ArrayBuffer {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function deriveKey(password: string, salt: BufferSource, iterations = ITERATIONS): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export interface EncryptedBackup {
  __madar_enc: string;
  salt: string;
  iv: string;
  data: string;
}

export async function encryptJson(obj: unknown, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt as BufferSource);
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    plain as BufferSource
  );
  const wrapper: EncryptedBackup = {
    __madar_enc: MAGIC,
    salt: bufToBase64(salt.buffer as ArrayBuffer),
    iv: bufToBase64(iv.buffer as ArrayBuffer),
    data: bufToBase64(cipher),
  };
  return JSON.stringify(wrapper);
}

export function isEncryptedBackup(parsed: unknown): parsed is EncryptedBackup {
  const w = parsed as EncryptedBackup | null;
  return (
    !!w &&
    typeof w === "object" &&
    typeof w.__madar_enc === "string" &&
    // أيُّ نسخةٍ نعرفها — وإلّا فملفٌّ من مستقبلٍ لا نفهمه، فالأصدقُ أن يُعامَل
    // معاملةَ «ليس نسخةً مشفَّرةً نعرفها» على أن يُطلب له كلمةُ مرورٍ لن تُجدي.
    w.__madar_enc in ITERATIONS_BY_MAGIC &&
    typeof w.data === "string" &&
    typeof w.salt === "string" &&
    typeof w.iv === "string"
  );
}

export async function decryptJson(wrapper: EncryptedBackup, password: string): Promise<unknown> {
  // عددُ الدورات من الغلاف نفسه لا من الثابت الحاليّ — وإلّا لصار كلُّ رفعٍ
  // للعدد إتلافاً صامتاً لكلّ نسخةٍ احتياطية سبقته.
  const iterations = ITERATIONS_BY_MAGIC[wrapper.__madar_enc];
  if (!iterations) throw new Error("unknown backup encryption version");
  const salt = new Uint8Array(base64ToBuf(wrapper.salt));
  const iv = new Uint8Array(base64ToBuf(wrapper.iv));
  const key = await deriveKey(password, salt as BufferSource, iterations);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    base64ToBuf(wrapper.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
