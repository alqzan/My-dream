import { describe, it, expect, beforeEach, vi } from "vitest";

// ذاكرةٌ بدل التخزين الحقيقيّ: الواجهةُ نفسُها التي يمرّ بها `lock.ts`.
const local = new Map<string, string>();
const session = new Map<string, string>();
vi.mock("./platform/prefs", () => ({
  prefGet: (k: string) => local.get(k) ?? null,
  prefGetJSON: (k: string) => { const v = local.get(k); return v ? JSON.parse(v) : null; },
  prefSetJSON: (k: string, v: unknown) => { local.set(k, JSON.stringify(v)); },
  prefRemove: (k: string) => { local.delete(k); },
  sessionGet: (k: string) => session.get(k) ?? null,
  sessionSet: (k: string, v: string) => { session.set(k, v); },
  sessionRemove: (k: string) => { session.delete(k); },
}));

const { isUnlocked, markUnlocked, markHidden, relockIfAway, RELOCK_AFTER_MS } = await import("./lock");

beforeEach(() => {
  local.clear();
  session.clear();
  local.set("madar-lock-pin", JSON.stringify({ v: 2, salt: "00", hash: "00" }));
  markUnlocked();
});

describe("القفل يعود بعد الغياب", () => {
  it("غيابٌ أطول من المهلة يُعيد القفل", () => {
    markHidden(1_000);
    expect(relockIfAway(1_000 + RELOCK_AFTER_MS)).toBe(true);
    expect(isUnlocked()).toBe(false);
  });

  it("غيابٌ قصير (كاميرا، منتقي ملفّات) لا يقفل ولا يتراكم", () => {
    markHidden(1_000);
    expect(relockIfAway(1_000 + RELOCK_AFTER_MS - 1)).toBe(false);
    expect(relockIfAway(1_000 + 10 * RELOCK_AFTER_MS)).toBe(false); // لا غيابَ مسجَّل
    expect(isUnlocked()).toBe(true);
  });

  it("بلا رمزٍ لا قفل", () => {
    local.clear();
    markHidden(0);
    expect(relockIfAway(10 * RELOCK_AFTER_MS)).toBe(false);
  });
});
