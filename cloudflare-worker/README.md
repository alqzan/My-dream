# Madar R2 gateway

Private Cloudflare Worker for Madar media. It authenticates the existing sync
key, generates short-lived R2 S3 presigned URLs, verifies completed uploads,
and exposes an authenticated inventory used by the app's Data Health card.

## Routes

- `GET /health` — public liveness check; returns no private data.
- `POST /v1/media/upload-url` — validates kind/hash/MIME/declared size and signs
  a two-minute `PUT` URL. Returns `exists: true` when the immutable object is
  already present with matching metadata.
- `POST /v1/media/complete` — checks the actual R2 size and MIME after upload;
  removes the object if verification fails.
- `POST /v1/media/download-url` — checks existence and signs a five-minute
  `GET` URL.
- `POST /v1/media/inventory` — lists hashes for `photos` or `audios`.

All private routes require `Authorization: Bearer <sync key>`. Browser origins
must also match `ALLOWED_ORIGINS`. R2 credentials are Worker secrets only.

See `docs/cloudflare-r2-setup.md` in the repository root for deployment and
migration instructions.
