import { AwsClient } from "aws4fetch";

interface Env {
  MEDIA_BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  ALLOWED_ORIGINS: string;
  MAX_IMAGE_BYTES: string;
  MAX_AUDIO_BYTES: string;
  UPLOAD_URL_TTL_SECONDS: string;
  DOWNLOAD_URL_TTL_SECONDS: string;
  SYNC_KEY_SHA256: string;
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
}

type MediaKind = "photos" | "audios";

interface MediaRequest {
  kind?: unknown;
  hash?: unknown;
  contentType?: unknown;
  size?: unknown;
}

const HASH_RE = /^[a-f0-9]{32}$/;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
]);
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
]);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean));
}

function requestOrigin(request: Request): string | null {
  return request.headers.get("Origin");
}

function assertOrigin(request: Request, env: Env): void {
  const origin = requestOrigin(request);
  // Requests without Origin are CLI/server requests; the sync-key check still
  // protects every private route. Browser requests must match exactly.
  if (origin && !allowedOrigins(env).has(origin)) {
    throw new HttpError(403, "Origin is not allowed");
  }
}

function corsHeaders(request: Request, env: Env): Headers {
  const headers = new Headers({
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  const origin = requestOrigin(request);
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return headers;
}

function json(request: Request, env: Env, value: unknown, status = 200): Response {
  const headers = corsHeaders(request, env);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(value), { status, headers });
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function authenticate(request: Request, env: Env): Promise<void> {
  const auth = request.headers.get("Authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1].length > 512) throw new HttpError(401, "Missing sync key");
  const presentedHash = await sha256Hex(match[1]);
  const expectedHash = env.SYNC_KEY_SHA256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || !constantTimeEqual(presentedHash, expectedHash)) {
    throw new HttpError(401, "Invalid sync key");
  }
}

async function readBody(request: Request): Promise<MediaRequest> {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Expected application/json");
  }
  try {
    return await request.json() as MediaRequest;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

function parseKind(value: unknown): MediaKind {
  if (value !== "photos" && value !== "audios") throw new HttpError(400, "Invalid media kind");
  return value;
}

function parseHash(value: unknown): string {
  if (typeof value !== "string" || !HASH_RE.test(value)) throw new HttpError(400, "Invalid media hash");
  return value;
}

function normalizeContentType(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "Missing content type");
  const type = value.split(";", 1)[0].trim().toLowerCase();
  if (type === "image/jpg") return "image/jpeg";
  return type;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

function maxBytes(kind: MediaKind, env: Env): number {
  return kind === "photos"
    ? parsePositiveInt(env.MAX_IMAGE_BYTES, 8 * 1024 * 1024)
    : parsePositiveInt(env.MAX_AUDIO_BYTES, 32 * 1024 * 1024);
}

function assertUpload(kind: MediaKind, contentType: string, sizeValue: unknown, env: Env): number {
  const allowed = kind === "photos" ? IMAGE_TYPES : AUDIO_TYPES;
  if (!allowed.has(contentType)) throw new HttpError(415, `Content type ${contentType} is not allowed`);
  const size = Number(sizeValue);
  if (!Number.isSafeInteger(size) || size <= 0) throw new HttpError(400, "Invalid file size");
  if (size > maxBytes(kind, env)) throw new HttpError(413, "File is too large");
  return size;
}

function objectKey(kind: MediaKind, hash: string): string {
  return `media/${kind}/${hash}`;
}

function r2ObjectUrl(env: Env, key: string, expires: number): URL {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const encodedBucket = encodeURIComponent(env.R2_BUCKET_NAME);
  return new URL(
    `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${encodedBucket}/${encodedKey}?X-Amz-Expires=${expires}`,
  );
}

function signer(env: Env): AwsClient {
  return new AwsClient({
    service: "s3",
    region: "auto",
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  });
}

async function presign(
  env: Env,
  key: string,
  method: "GET" | "PUT",
  ttl: number,
  contentType?: string,
): Promise<string> {
  const headers = new Headers();
  if (contentType) headers.set("Content-Type", contentType);
  const signed = await signer(env).sign(
    new Request(r2ObjectUrl(env, key, ttl), { method, headers }),
    // aws4fetch normally excludes Content-Type from SigV4. allHeaders binds
    // the requested MIME to this PUT URL, so changing it makes R2 reject the
    // upload with SignatureDoesNotMatch.
    { aws: { signQuery: true, allHeaders: true } },
  );
  return signed.url;
}

function metadataMatches(
  object: R2Object,
  expectedSize: number,
  expectedType: string,
): boolean {
  const storedType = object.httpMetadata?.contentType?.split(";", 1)[0].toLowerCase();
  return object.size === expectedSize && storedType === expectedType;
}

async function uploadUrl(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const kind = parseKind(body.kind);
  const hash = parseHash(body.hash);
  const contentType = normalizeContentType(body.contentType);
  const size = assertUpload(kind, contentType, body.size, env);
  const key = objectKey(kind, hash);

  const existing = await env.MEDIA_BUCKET.head(key);
  if (existing && metadataMatches(existing, size, contentType)) {
    return json(request, env, { exists: true, hash, size, contentType });
  }
  if (existing) await env.MEDIA_BUCKET.delete(key);

  const ttl = Math.min(parsePositiveInt(env.UPLOAD_URL_TTL_SECONDS, 120), 600);
  const url = await presign(env, key, "PUT", ttl, contentType);
  return json(request, env, {
    exists: false,
    url,
    headers: { "Content-Type": contentType },
    expiresAt: Date.now() + ttl * 1000,
  });
}

async function completeUpload(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const kind = parseKind(body.kind);
  const hash = parseHash(body.hash);
  const contentType = normalizeContentType(body.contentType);
  const size = assertUpload(kind, contentType, body.size, env);
  const key = objectKey(kind, hash);
  const object = await env.MEDIA_BUCKET.head(key);

  if (!object) throw new HttpError(409, "Uploaded object was not found");
  if (!metadataMatches(object, size, contentType) || object.size > maxBytes(kind, env)) {
    await env.MEDIA_BUCKET.delete(key);
    throw new HttpError(422, "Uploaded object failed verification and was removed");
  }
  return json(request, env, {
    ok: true,
    hash,
    size: object.size,
    contentType: object.httpMetadata?.contentType,
    etag: object.etag,
  });
}

async function downloadUrl(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const kind = parseKind(body.kind);
  const hash = parseHash(body.hash);
  const key = objectKey(kind, hash);
  const object = await env.MEDIA_BUCKET.head(key);
  if (!object) throw new HttpError(404, "Media object was not found");
  if (object.size > maxBytes(kind, env)) throw new HttpError(422, "Stored object exceeds the configured limit");

  const ttl = Math.min(parsePositiveInt(env.DOWNLOAD_URL_TTL_SECONDS, 300), 3600);
  const url = await presign(env, key, "GET", ttl);
  return json(request, env, {
    url,
    expiresAt: Date.now() + ttl * 1000,
    size: object.size,
    contentType: object.httpMetadata?.contentType,
  });
}

async function inventory(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const kind = parseKind(body.kind);
  const prefix = `media/${kind}/`;
  const hashes: string[] = [];
  let cursor: string | undefined;

  do {
    const page = await env.MEDIA_BUCKET.list({ prefix, cursor, limit: 1000 });
    for (const object of page.objects) {
      const hash = object.key.slice(prefix.length);
      if (HASH_RE.test(hash)) hashes.push(hash);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return json(request, env, { hashes });
}

async function handle(request: Request, env: Env): Promise<Response> {
  assertOrigin(request, env);
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method === "GET" && url.pathname === "/health") {
    return json(request, env, { ok: true, service: "madar-r2-gateway" });
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");

  await authenticate(request, env);
  if (url.pathname === "/v1/media/upload-url") return uploadUrl(request, env);
  if (url.pathname === "/v1/media/complete") return completeUpload(request, env);
  if (url.pathname === "/v1/media/download-url") return downloadUrl(request, env);
  if (url.pathname === "/v1/media/inventory") return inventory(request, env);
  throw new HttpError(404, "Route not found");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(request, env, { error: error.message }, error.status);
      }
      console.error("Unhandled gateway error", error);
      return json(request, env, { error: "Internal server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
