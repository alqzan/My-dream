// madar-r2-gateway — private media gateway for مدار.
//
// Self-contained: NO npm imports, so it deploys straight from the Cloudflare
// dashboard "Edit code" editor (paste + Deploy) without wrangler/node.
//
// Both upload and download flow THROUGH this Worker using the R2 binding
// (MEDIA_BUCKET). The browser never talks to R2 directly, so there is no R2
// *bucket* CORS requirement, no S3 presigning, and no S3 credentials on the hot
// path — the earlier direct browser→R2 PUT failed on iOS with an opaque
// "Load failed", which this design removes entirely.
//
// Auth: every private route requires the device sync key as a Bearer token
// (compared as SHA-256 against SYNC_KEY_SHA256). Download URLs are plain <img>-
// friendly GET links signed with a short-lived HMAC so they need no header.

interface Env {
  MEDIA_BUCKET: R2Bucket;
  ALLOWED_ORIGINS: string;
  MAX_IMAGE_BYTES: string;
  MAX_AUDIO_BYTES: string;
  DOWNLOAD_URL_TTL_SECONDS: string;
  SYNC_KEY_SHA256: string;
  // Legacy S3 vars (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  // R2_BUCKET_NAME, UPLOAD_URL_TTL_SECONDS) are no longer read — safe to leave
  // in place or remove from the Worker settings.
}

type MediaKind = "photos" | "audios";

interface MediaRequest {
  kind?: unknown;
  hash?: unknown;
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
  // Requests without Origin are CLI/server/<img> requests; the sync-key or the
  // signed download token still protects every private route. Browser fetches
  // must match exactly.
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

async function hmacHex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function objectKey(kind: MediaKind, hash: string): string {
  return `media/${kind}/${hash}`;
}

// Upload: the request body is the raw media; kind/hash/content-type are query
// params. We write straight to R2 via the binding. Idempotent — an object of the
// same size already present is treated as done (hashes are content-addressed).
async function putBlob(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const hash = parseHash(url.searchParams.get("hash"));
  const contentType = normalizeContentType(url.searchParams.get("ct"));
  const allowed = kind === "photos" ? IMAGE_TYPES : AUDIO_TYPES;
  if (!allowed.has(contentType)) throw new HttpError(415, `Content type ${contentType} is not allowed`);

  const body = await request.arrayBuffer();
  const size = body.byteLength;
  if (size <= 0) throw new HttpError(400, "Empty body");
  if (size > maxBytes(kind, env)) throw new HttpError(413, "File is too large");

  const key = objectKey(kind, hash);
  const existing = await env.MEDIA_BUCKET.head(key);
  if (existing && existing.size === size) {
    return json(request, env, { ok: true, exists: true, hash, size });
  }
  await env.MEDIA_BUCKET.put(key, body, { httpMetadata: { contentType } });
  return json(request, env, { ok: true, hash, size });
}

// Download URL: return a short-lived, <img>-friendly GET link to /v1/media/blob
// signed with an HMAC over kind|hash|exp (keyed by SYNC_KEY_SHA256). No S3, no
// presigning — the link carries its own authorization so no header is needed.
async function downloadUrl(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const kind = parseKind(body.kind);
  const hash = parseHash(body.hash);
  const key = objectKey(kind, hash);
  const object = await env.MEDIA_BUCKET.head(key);
  if (!object) throw new HttpError(404, "Media object was not found");

  const ttl = Math.min(parsePositiveInt(env.DOWNLOAD_URL_TTL_SECONDS, 300), 3600);
  const exp = Date.now() + ttl * 1000;
  const sig = await hmacHex(env.SYNC_KEY_SHA256, `${kind}/${hash}/${exp}`);
  const origin = new URL(request.url).origin;
  const dl = `${origin}/v1/media/blob?kind=${kind}&hash=${hash}&exp=${exp}&sig=${sig}`;
  return json(request, env, {
    url: dl,
    expiresAt: exp,
    size: object.size,
    contentType: object.httpMetadata?.contentType,
  });
}

// Serve the bytes for a signed download link. Unauthenticated by Bearer (so an
// <img>/<audio> tag can load it) but gated by the HMAC token + expiry.
async function serveBlob(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const kind = parseKind(url.searchParams.get("kind"));
  const hash = parseHash(url.searchParams.get("hash"));
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!Number.isSafeInteger(exp) || exp < Date.now()) throw new HttpError(403, "Download link expired");
  const expected = await hmacHex(env.SYNC_KEY_SHA256, `${kind}/${hash}/${exp}`);
  if (!constantTimeEqual(sig, expected)) throw new HttpError(403, "Invalid download signature");

  const object = await env.MEDIA_BUCKET.get(objectKey(kind, hash));
  if (!object) throw new HttpError(404, "Media object was not found");

  const headers = corsHeaders(request, env);
  headers.set("Content-Type", object.httpMetadata?.contentType ?? "application/octet-stream");
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

// Inventory: list the content hashes present in R2 for a kind, via the binding.
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
  // Signed, header-less download link (used directly by <img>/<audio>).
  if (request.method === "GET" && url.pathname === "/v1/media/blob") {
    return serveBlob(request, env);
  }
  if (request.method !== "POST") throw new HttpError(405, "Method not allowed");

  await authenticate(request, env);
  if (url.pathname === "/v1/media/put") return putBlob(request, env);
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
