// Optional password protection for backup files. The whole backup JSON is
// encrypted with AES-GCM under a key derived from the password via PBKDF2
// (150k iterations, SHA-256). The output is a small JSON wrapper carrying the
// salt + IV so import can recognise it (isEncryptedBackup) and decrypt it. A
// wrong password just fails to decrypt — there is no recovery, by design.

const MAGIC = "madar-enc-v1";
const ITERATIONS = 150_000;

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

async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
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
  return (
    !!parsed &&
    typeof parsed === "object" &&
    (parsed as EncryptedBackup).__madar_enc === MAGIC &&
    typeof (parsed as EncryptedBackup).data === "string"
  );
}

export async function decryptJson(wrapper: EncryptedBackup, password: string): Promise<unknown> {
  const salt = new Uint8Array(base64ToBuf(wrapper.salt));
  const iv = new Uint8Array(base64ToBuf(wrapper.iv));
  const key = await deriveKey(password, salt as BufferSource);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    base64ToBuf(wrapper.data)
  );
  return JSON.parse(new TextDecoder().decode(plain));
}
