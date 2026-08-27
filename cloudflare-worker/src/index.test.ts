import { describe, expect, it, beforeEach } from "vitest";
import worker from "./index";

const ORIGIN = "https://madar.example";
const BAD_ORIGIN = "https://evil.example";
const SYNC_KEY = "test-device-key";
const PHOTO_HASH = "0123456789abcdef0123456789abcdef";

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
  etag: string;
};

class MemoryBucket {
  objects = new Map<string, StoredObject>();
  putCount = 0;

  async head(key: string) {
    const object = this.objects.get(key);
    return object
      ? { key, size: object.bytes.byteLength, httpMetadata: { contentType: object.contentType }, httpEtag: object.etag }
      : null;
  }

  async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    this.putCount++;
    const bytes = new Uint8Array(value.slice(0));
    this.objects.set(key, {
      bytes,
      contentType: options?.httpMetadata?.contentType ?? "application/octet-stream",
      etag: `etag-${this.putCount}`,
    });
  }

  async get(key: string) {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: new Response(exactBuffer(object.bytes)).body,
      httpEtag: object.etag,
      writeHttpMetadata(headers: Headers) {
        headers.set("Content-Type", object.contentType);
      },
    };
  }

  async list(options: { prefix?: string }) {
    const prefix = options.prefix ?? "";
    return {
      objects: [...this.objects.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => ({ key })),
      truncated: false,
    };
  }
}

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", exactBuffer(bytes));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function envFor(bucket: MemoryBucket) {
  return {
    MEDIA_BUCKET: bucket,
    ALLOWED_ORIGINS: ORIGIN,
    MAX_IMAGE_BYTES: "8",
    MAX_PDF_BYTES: "32",
    MAX_AUDIO_BYTES: "32",
    DOWNLOAD_URL_TTL_SECONDS: "60",
    SYNC_KEY_SHA256: await sha256Hex(new TextEncoder().encode(SYNC_KEY)),
  } as never;
}

function request(path: string, init: RequestInit = {}, authenticated = false): Request {
  const headers = new Headers(init.headers);
  headers.set("Origin", ORIGIN);
  if (authenticated) headers.set("Authorization", `Bearer ${SYNC_KEY}`);
  return new Request(`https://gateway.example${path}`, { ...init, headers });
}

async function jsonResponse(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

describe("madar-r2-gateway runtime", () => {
  let bucket: MemoryBucket;

  beforeEach(() => {
    bucket = new MemoryBucket();
  });

  it("serves health publicly but protects private routes and origins", async () => {
    const env = await envFor(bucket);
    const health = await worker.fetch(request("/health"), env);
    expect(health.status).toBe(200);
    expect((await jsonResponse(health)).ok).toBe(true);

    const unauthenticated = await worker.fetch(request("/v1/media/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photos" }),
    }), env);
    expect(unauthenticated.status).toBe(401);

    const forbidden = await worker.fetch(new Request("https://gateway.example/health", {
      headers: { Origin: BAD_ORIGIN },
    }), env);
    expect(forbidden.status).toBe(403);
  });

  it("verifies the upload digest, serves a signed download, and inventories the object", async () => {
    const env = await envFor(bucket);
    const bytes = new TextEncoder().encode("png-data");
    const digest = await sha256Hex(bytes);
    const uploadPath = `/v1/media/put?kind=photos&hash=${PHOTO_HASH}&ct=image/png`;

    const uploaded = await worker.fetch(request(uploadPath, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Madar-Content-SHA256": digest },
      body: bytes,
    }, true), env);
    expect(uploaded.status).toBe(200);
    expect((await jsonResponse(uploaded)).hash).toBe(PHOTO_HASH);
    expect(bucket.putCount).toBe(1);

    const repeated = await worker.fetch(request(uploadPath, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Madar-Content-SHA256": digest },
      body: bytes,
    }, true), env);
    expect(repeated.status).toBe(200);
    expect((await jsonResponse(repeated)).exists).toBe(true);
    expect(bucket.putCount).toBe(1);

    const downloadUrlResponse = await worker.fetch(request("/v1/media/download-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photos", hash: PHOTO_HASH }),
    }, true), env);
    expect(downloadUrlResponse.status).toBe(200);
    const downloadUrl = String((await jsonResponse(downloadUrlResponse)).url);
    const downloaded = await worker.fetch(new Request(downloadUrl), env);
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(bytes);
    expect(downloaded.headers.get("Content-Type")).toBe("image/png");

    const inventory = await worker.fetch(request("/v1/media/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "photos" }),
    }, true), env);
    expect(inventory.status).toBe(200);
    expect((await jsonResponse(inventory)).hashes).toEqual([PHOTO_HASH]);
  });

  it("rejects a digest mismatch, an oversized body, and a forged download link", async () => {
    const env = await envFor(bucket);
    const bytes = new TextEncoder().encode("bad");
    const uploadPath = `/v1/media/put?kind=photos&hash=${PHOTO_HASH}&ct=image/png`;
    const badDigest = await worker.fetch(request(uploadPath, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Madar-Content-SHA256": "0".repeat(64) },
      body: bytes,
    }, true), env);
    expect(badDigest.status).toBe(400);
    expect(bucket.putCount).toBe(0);

    const tooLarge = await worker.fetch(request(uploadPath, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Madar-Content-SHA256": await sha256Hex(new Uint8Array(9)) },
      body: new Uint8Array(9),
    }, true), env);
    expect(tooLarge.status).toBe(413);

    const forged = await worker.fetch(new Request(
      `https://gateway.example/v1/media/blob?kind=photos&hash=${PHOTO_HASH}&exp=${Date.now() + 60_000}&sig=${"0".repeat(64)}`,
      { headers: { Origin: ORIGIN } },
    ), env);
    expect(forged.status).toBe(403);
  });
});
