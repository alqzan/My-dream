import { describe, expect, it } from "vitest";
import { settledInboxItemIds } from "./inboxSettled";
import type { InboxDecision } from "./types";

const d = (eventId: string, decision: InboxDecision["decision"]) => ({ id: eventId, eventId, decision }) as InboxDecision;

describe("settledInboxItemIds", () => {
  it("settles an item only when every event has a terminal decision", () => {
    const items = [
      { id: "a", events: [{ eventId: "a:0" }, { eventId: "a:1" }] },
      { id: "b", events: [{ eventId: "b:0" }, { eventId: "b:1" }] },
    ];
    const ids = settledInboxItemIds(items, [d("a:0", "saved"), d("a:1", "ignored"), d("b:0", "saved")]);
    expect([...ids]).toEqual(["a"]);
  });

  it("keeps unreadable items and events without an id for review", () => {
    const items = [{ id: "u", events: [] }, { id: "n", events: [{}] }];
    expect(settledInboxItemIds(items, []).size).toBe(0);
  });

  it("keeps an obligation hint the review deliberately left open", () => {
    const items = [{ id: "h", events: [{ eventId: "h:0", obligationHint: { kind: "loan" } }] }];
    expect(settledInboxItemIds(items, [d("h:0", "saved")]).size).toBe(0);
    expect([...settledInboxItemIds(items, [d("h:0", "ignored")])]).toEqual(["h"]);
  });
});
