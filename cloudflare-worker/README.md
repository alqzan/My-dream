# Madar R2 gateway

Private Cloudflare Worker for Madar media. Both upload and download flow
**through** the Worker using its R2 binding (`MEDIA_BUCKET`) — the browser never
talks to R2 directly, so there is no bucket CORS requirement, no S3 presigning,
and no S3 credentials on the hot path. The Worker authenticates the device's
sync key (constant-time HMAC/SHA-256 compare), enforces an origin allow-list,
and caps MIME types and sizes.

`src/index.ts` is the TypeScript source; `worker.dashboard.js` is the
byte-for-byte-equivalent plain-JS build to paste into the dashboard editor. Keep
the two in sync when editing.

## Routes

- `GET /health` — public liveness check; returns no private data.
- `GET /v1/media/blob?kind&hash&exp&sig` — streams an object straight from R2.
  The link is HMAC-signed with an absolute `exp`, so it needs no Bearer header.
- `POST /v1/media/put?kind&hash&ct` — body is the bytes. Validates kind/hash/MIME
  and the declared size, then writes to R2 via the binding. Returns
  `exists: true` when an immutable object with the same size is already present.
- `POST /v1/media/download-url` — checks existence and returns a signed
  `/v1/media/blob` link (TTL clamped to 1–7 days).
- `POST /v1/media/inventory` — lists the hashes present for `photos` or `audios`.

All routes except `/health` and `/v1/media/blob` require
`Authorization: Bearer <sync key>`. Browser origins must also match
`ALLOWED_ORIGINS`. R2 access is the Worker's binding only.

## Rate limiting (recommended, not yet wired)

The sync key is a 160-bit CSPRNG value (see the app's "توليد مفتاح قوي"), so
guessing it is impractical. Rate limiting is still worth adding as defence in
depth against a flood of requests, but it needs a **stateful binding configured
in the Cloudflare dashboard** — it can't be added from this file alone:

1. Create a Rate Limiting rule (or a KV namespace) in the Cloudflare dashboard
   and bind it to this Worker (e.g. as `RATE_LIMITER`).
2. At the top of `handle()`, before `authenticate()`, key the limit on
   `request.headers.get("CF-Connecting-IP")` (and/or the Bearer key hash), and
   return `429` with a `Retry-After` header when the limit is exceeded.
3. Fail **open** if the binding is absent, so a missing binding never takes the
   live gateway down.

Wire this up when convenient; until then the constant-time key check is the
primary guard.

See `docs/cloudflare-r2-setup.md` in the repository root for deployment and
migration instructions.
