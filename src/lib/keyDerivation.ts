// Key derivation for مدار's login-free sync model.
//
// Today (v1, unchanged, default): the ONE secret the owner holds is used
// directly, verbatim, for two unrelated purposes — see src/lib/firebase.ts's
// getSyncSpace():
//   1. The literal Firestore document path segment: userData/{secret}. This
//      string appears in every Firestore request URL, and in Firestore/
//      browser network logs.
//   2. The Bearer token sent to the Cloudflare R2 media gateway (compared
//      server-side as SHA-256 against SYNC_KEY_SHA256 — see
//      cloudflare-worker/src/index.ts).
// A leak of either channel today hands over BOTH capabilities, and the two
// can't be rotated independently — changing one always changes the other,
// since they're the same string.
//
// This module derives INDEPENDENT subkeys for each purpose from one master
// secret via HKDF (RFC 5869, SHA-256), keyed by a distinct `info` context per
// purpose. HKDF-Expand is one-way: recovering a derived subkey does not help
// recover the master secret or the OTHER purpose's subkey. Deriving is
// deterministic (fixed salt) so every device that has the same master secret
// reaches the same two subkeys independently — no key-exchange step, matching
// the existing "paste the same key on every device" setup flow.
//
// Pure: no `window`, no `localStorage`, no Firebase/network calls — only the
// Web Crypto API (available in both browsers and Node ≥ 19, so it is usable
// unit-tested here and, later, from a native shell per docs/APP-STORE-PLAN.md
// without modification). NEVER logs or throws the master secret — every
// error path below carries only the fixed context label, never `masterSecret`
// or its derived output.

/** Bumped only if the derivation itself ever needs to change (new context
 *  string, different digest, …) — see rotateKeyVersion() below. Existing
 *  devices are never silently moved to a new CURRENT_KEY_VERSION; that is a
 *  deliberate, owner-initiated action (see docs/KEY-SEPARATION.md). */
export const CURRENT_KEY_VERSION = 1 as const;

export const FIRESTORE_SPACE_CONTEXT = "madar-sync:firestore-space:v1";
export const MEDIA_KEY_CONTEXT = "madar-sync:r2-media-key:v1";

// HKDF's salt does not need to be secret (only the input key material does)
// — RFC 5869 §3.1. Fixing it is what makes derivation reproducible across
// devices for the same master secret with no coordination between them.
const HKDF_SALT = "madar-hkdf-salt:v1";

// 20 bytes (160 bits) matches the existing "توليد مفتاح قوي" CSPRNG output
// size in SyncKeyCard.tsx, so a derived subkey is exactly as strong as a
// freshly generated master key today.
const SUBKEY_BYTES = 20;

function subtle(): SubtleCrypto {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (!c?.subtle) {
    throw new Error("Web Crypto (crypto.subtle) is unavailable in this environment");
  }
  return c.subtle;
}

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// One HKDF-Expand-with-Extract derivation. `context` selects the purpose
// (FIRESTORE_SPACE_CONTEXT / MEDIA_KEY_CONTEXT) — different contexts from the
// same masterSecret are cryptographically unrelated outputs.
async function deriveHex(masterSecret: string, context: string, byteLength = SUBKEY_BYTES): Promise<string> {
  if (!masterSecret) throw new Error("deriveHex: empty master secret");
  const material = await subtle().importKey(
    "raw",
    new TextEncoder().encode(masterSecret),
    "HKDF",
    false,
    ["deriveBits"]
  );
  const bits = await subtle().deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode(HKDF_SALT),
      info: new TextEncoder().encode(context),
    },
    material,
    byteLength * 8
  );
  return toHex(new Uint8Array(bits));
}

/** Derives the Firestore path-segment subkey from the master secret. */
export function deriveFirestoreSpace(masterSecret: string): Promise<string> {
  return deriveHex(masterSecret, FIRESTORE_SPACE_CONTEXT);
}

/** Derives the R2 media-gateway Bearer-token subkey from the master secret. */
export function deriveMediaKey(masterSecret: string): Promise<string> {
  return deriveHex(masterSecret, MEDIA_KEY_CONTEXT);
}

export interface DerivedKeyPair {
  firestoreSpace: string;
  mediaKey: string;
}

/** Both subkeys in one call — the pair a device needs to store locally after
 *  the owner enters the master secret once (see docs/KEY-SEPARATION.md for
 *  the storage model: only the two OUTPUTS are kept, never the master
 *  secret itself). */
export async function deriveKeyPair(masterSecret: string): Promise<DerivedKeyPair> {
  const [firestoreSpace, mediaKey] = await Promise.all([
    deriveFirestoreSpace(masterSecret),
    deriveMediaKey(masterSecret),
  ]);
  return { firestoreSpace, mediaKey };
}
