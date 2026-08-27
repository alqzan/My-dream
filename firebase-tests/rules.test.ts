// Firebase Emulator tests for firestore.rules / storage.rules.
//
// These exercise the CANDIDATE rules in the repo root against the real rules
// engine (via the Firestore/Storage emulators) — not a guess about what's
// published in production. See docs/FIREBASE-RULES-CANDIDATE.md for why the
// two can differ and what to verify before publishing.
//
// Run with `npm run test:rules` (wraps this in `firebase emulators:exec` so
// the emulators start/stop around the run). Requires Java, which the
// Firestore/Storage emulators need — see that doc for what happens when it's
// unavailable (CI treats it as informational, never a merge blocker).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import { setLogLevel } from "firebase/firestore";
import path from "node:path";

// A "demo-" project id makes the Firebase CLI run the emulators fully
// offline (no real GCP project, no credentials, no risk of touching the
// production "my-dream-a" project) — the documented way to sandbox rules
// tests. See docs/FIREBASE-RULES-CANDIDATE.md.
const PROJECT_ID = "demo-madar-rules-test";
const REAL_SPACE = "REPLACED_IN_FIREBASE_CONSOLE"; // matches the rules' placeholder verbatim
const OTHER_SPACE = "some-other-devices-secret";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel("error"); // the SDK is chatty about expected PERMISSION_DENIED
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync(path.join(__dirname, "..", "storage.rules"), "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

// No Firebase Auth in this app's login-free model — every request is
// unauthenticated, gated purely by knowing `space` in the document path.
function clientFirestore() {
  return testEnv.unauthenticatedContext().firestore();
}
function clientStorage() {
  return testEnv.unauthenticatedContext().storage();
}

describe("firestore.rules — main record (userData/{space})", () => {
  it("denies read/write to a space the client doesn't hold the secret for", async () => {
    const db = clientFirestore();
    await assertFails(db.collection("userData").doc(OTHER_SPACE).get());
    await assertFails(db.collection("userData").doc(OTHER_SPACE).set({ transactions: [] }));
  });

  it("allows read/write only to the exact matching space", async () => {
    const db = clientFirestore();
    await assertSucceeds(db.collection("userData").doc(REAL_SPACE).set({ transactions: [], revision: 1 }));
    await assertSucceeds(db.collection("userData").doc(REAL_SPACE).get());
  });

  it("denies a client-issued delete of the whole record", async () => {
    const db = clientFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("userData").doc(REAL_SPACE).set({ transactions: [] });
    });
    await assertFails(db.collection("userData").doc(REAL_SPACE).delete());
  });

  it("denies enumerating space ids by listing the top-level userData collection", async () => {
    const db = clientFirestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("userData").doc(REAL_SPACE).set({ transactions: [] });
    });
    await assertFails(db.collection("userData").get());
  });
});

describe("firestore.rules — journal shards (userData/{space}/journal/{shardId})", () => {
  it("scopes journal shard read/write to the matching space only", async () => {
    const db = clientFirestore();
    await assertSucceeds(
      db.collection("userData").doc(REAL_SPACE).collection("journal").doc("2026-08").set({
        entries: [], writerVersion: 2,
      })
    );
    await assertFails(
      db.collection("userData").doc(OTHER_SPACE).collection("journal").doc("2026-08").set({
        entries: [], writerVersion: 2,
      })
    );
  });

  it("rejects old cached writers and accepts the current generation", async () => {
    const ref = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("journal").doc("2026-08");
    // Old clients sent only `entries`; accepting this is the data-loss path.
    await assertFails(ref.set({ entries: [] }));
    await assertFails(ref.set({ entries: [], writerVersion: 1 }));
    await assertFails(ref.set({ entries: [], writerVersion: 2, unexpected: true }));
    await assertSucceeds(ref.set({ entries: [], writerVersion: 2 }));
  });

  it("allows a current client to upgrade a legacy shard but denies deleting it", async () => {
    let ref!: FirebaseFirestore.DocumentReference;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      ref = ctx.firestore().collection("userData").doc(REAL_SPACE).collection("journal").doc("2026-08");
      await ref.set({ entries: [{ id: "old" }] }); // real pre-marker shape
    });
    const clientRef = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("journal").doc("2026-08");
    await assertSucceeds(clientRef.set({ entries: [{ id: "old" }, { id: "new" }], writerVersion: 2 }));
    await assertFails(clientRef.delete());
  });

  it("allows the matching space to list its own shards, denies a different space", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("userData").doc(REAL_SPACE).collection("journal").doc("2026-08").set({
        entries: [], writerVersion: 2,
      });
    });
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("journal").get()
    );
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE).collection("journal").get()
    );
  });
});

describe("firestore.rules — transaction shards (userData/{space}/transactions/{shardId})", () => {
  const transaction = { id: "tx-1", date: "2026-08-08", amount: 45, category: "food", note: "قهوة" };

  it("scopes transaction shard read/write to the matching space only", async () => {
    const own = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("transactions").doc("2026-08");
    await assertSucceeds(own.set({ transactions: [transaction], writerVersion: 1 }));
    await assertSucceeds(own.get());
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE)
        .collection("transactions").doc("2026-08")
        .set({ transactions: [transaction], writerVersion: 1 })
    );
  });

  it("rejects old cached writers, malformed shapes, and deletion", async () => {
    const own = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("transactions").doc("2026-08");
    await assertFails(own.set({ transactions: [transaction] }));
    await assertFails(own.set({ transactions: [transaction], writerVersion: 2 }));
    await assertFails(own.set({ transactions: [transaction], writerVersion: 1, extra: true }));
    await assertSucceeds(own.set({ transactions: [transaction], writerVersion: 1 }));
    await assertFails(own.delete());
  });
});

describe("firestore.rules — media manifest shards (userData/{space}/mediaManifest/{shardId})", () => {
  const PHOTO_HASH = "0123456789abcdef0123456789abcdef";

  it("allows the matching space to create, read, update and list a shard", async () => {
    const ref = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("mediaManifest").doc("photos-01");
    const shard = { kind: "photos", hashes: [PHOTO_HASH], writerVersion: 1 };
    await assertSucceeds(ref.set(shard));
    await assertSucceeds(ref.get());
    await assertSucceeds(ref.update({ hashes: [PHOTO_HASH, "abcdefabcdefabcdefabcdefabcdefab"] }));
    await assertFails(ref.update({ hashes: [PHOTO_HASH] }));
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("mediaManifest").get()
    );
  });

  it("rejects a different space, malformed shapes, and deletion", async () => {
    const good = { kind: "photos", hashes: [PHOTO_HASH], writerVersion: 1 };
    const own = clientFirestore()
      .collection("userData").doc(REAL_SPACE).collection("mediaManifest").doc("photos-01");
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE)
        .collection("mediaManifest").doc("photos-01").set(good)
    );
    await assertFails(own.set({ kind: "photos", hashes: [PHOTO_HASH] }));
    await assertFails(own.set({ kind: "photos", hashes: [PHOTO_HASH], writerVersion: 2 }));
    await assertFails(own.set({ ...good, extra: true }));
    await assertFails(own.set({ ...good, kind: "unknown" }));
    await assertFails(own.delete());
  });
});

describe("firestore.rules — bank-SMS inbox (userData/{space}/inbox/{itemId})", () => {
  it("accepts a minimal valid item (text only)", async () => {
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({
        text: "بنكك الأهلي: تم خصم 45.00 ريال لدى مقهى",
      })
    );
  });

  it("accepts a valid item with enc + ts", async () => {
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({
        text: "dGVzdA==",
        enc: "b64",
        ts: "2026-08-08T10:00:00Z",
      })
    );
  });

  it("rejects an item for a space the client doesn't hold the secret for", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE).collection("inbox").add({ text: "hello" })
    );
  });

  it("rejects an unknown/extra field", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({
        text: "hello",
        adminOverride: true,
      })
    );
  });

  it("rejects a missing text field", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({ ts: "2026-08-08" })
    );
  });

  it("rejects a non-string text field", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({ text: 12345 })
    );
  });

  it("rejects an oversized text payload", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({
        text: "x".repeat(7000),
      })
    );
  });

  it("rejects an invalid enc value", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({
        text: "hello",
        enc: "rot13",
      })
    );
  });

  it("allows the app to delete an item after processing it", async () => {
    let ref!: FirebaseFirestore.DocumentReference;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      ref = await ctx.firestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({ text: "hi" });
    });
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").doc(ref.id).delete()
    );
  });

  it("denies mutating an existing item in place (create-once / delete-only)", async () => {
    let ref!: FirebaseFirestore.DocumentReference;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      ref = await ctx.firestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({ text: "hi" });
    });
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("inbox").doc(ref.id).update({ text: "changed" })
    );
  });

  it("denies listing another space's inbox", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("userData").doc(REAL_SPACE).collection("inbox").add({ text: "hi" });
    });
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE).collection("inbox").get()
    );
  });
});

describe("firestore.rules — legacy media docs (userData/{space}/photos|audios/{hash})", () => {
  const HASH = "0123456789abcdef0123456789abcdef";

  it("allows reading a legacy photo doc in the matching space, denies another space", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().collection("userData").doc(REAL_SPACE).collection("photos").doc(HASH).set({ data: "data:image/png;base64,AAAA" });
    });
    await assertSucceeds(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("photos").doc(HASH).get()
    );
    await assertFails(
      clientFirestore().collection("userData").doc(OTHER_SPACE).collection("photos").doc(HASH).get()
    );
  });

  it("denies any client write to legacy media docs (R2 is the only write path now)", async () => {
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("photos").doc(HASH).set({ data: "x" })
    );
    await assertFails(
      clientFirestore().collection("userData").doc(REAL_SPACE).collection("audios").doc(HASH).set({ data: "x" })
    );
  });
});

describe("storage.rules — Firebase Storage is fully retired", () => {
  it("denies read and write on any path, even one shaped like the legacy convention", async () => {
    const storage = clientStorage();
    const ref = storage.ref(`userData/${REAL_SPACE}/photos/0123456789abcdef0123456789abcdef`);
    await assertFails(ref.getDownloadURL());
    await assertFails(ref.put(new Uint8Array([1, 2, 3])));
  });

  it("denies access regardless of the space value in the path", async () => {
    const storage = clientStorage();
    const ref = storage.ref(`userData/${OTHER_SPACE}/audios/0123456789abcdef0123456789abcdef`);
    await assertFails(ref.getDownloadURL());
  });
});
