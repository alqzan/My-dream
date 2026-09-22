import { beforeEach, describe, expect, it, vi } from "vitest";

const idb = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (key: string) => idb.get(key),
  set: async (key: string, value: unknown) => { idb.set(key, value); },
  del: async (key: string) => { idb.delete(key); },
}));

import { applyExpenseIntent, expenseFundIdForEvent } from "./BigExpenseRouter";
import { useAppStore } from "@/lib/store";
import { mergeAppData } from "@/lib/merge";
import { reserveBalance } from "@/lib/utils";
import type { ReserveFund } from "@/lib/types";

const date = "2026-09-22";

function initialReserves(): ReserveFund[] {
  return [{
    id: "f-surplus",
    name: "الفوائض",
    role: "surplus",
    icon: "✨",
    color: "#c9852a",
    deposits: [{ id: "seed", date, amount: 900 }],
    createdAt: date,
  }];
}

function resetStore() {
  useAppStore.setState({
    reserves: initialReserves(),
    transactions: [],
    dailyBudget: null,
    deleted: {},
  });
}

describe("BigExpenseRouter event intents", () => {
  beforeEach(resetStore);

  it("replaying one event creates one fund and one transfer pair", () => {
    const eventId = "inbox-event-1:0";
    const intent = {
      eventId,
      fundId: expenseFundIdForEvent(eventId),
      pct: 100,
      newFund: { name: "رحلة اختبار" },
      fromSurplus: { fromId: "f-surplus", amount: 600 },
      funding: { perCycle: 100 },
    };

    applyExpenseIntent(intent, eventId);
    applyExpenseIntent(intent, eventId);

    const state = useAppStore.getState();
    const created = state.reserves.filter((fund) => fund.id === expenseFundIdForEvent(eventId));
    expect(created).toHaveLength(1);
    expect(created[0].funding).toMatchObject({ perCycle: 100, source: "salary", stop: "zero" });
    expect(state.reserves[0].deposits.filter((deposit) => deposit.id.includes(eventId))).toHaveLength(1);
    expect(created[0].deposits.filter((deposit) => deposit.id.includes(eventId))).toHaveLength(1);
    expect(reserveBalance(state.reserves[0], state.transactions)).toBe(300);
    expect(reserveBalance(created[0], state.transactions)).toBe(600);
  });

  it("two offline applications converge to one event fund and transfer after merge", () => {
    const eventId = "inbox-event-2:0";
    const intent = {
      eventId,
      fundId: expenseFundIdForEvent(eventId),
      pct: 100,
      newFund: { name: "رحلة اختبار" },
      fromSurplus: { fromId: "f-surplus", amount: 600 },
    };

    applyExpenseIntent(intent, eventId);
    const deviceA = useAppStore.getState().snapshot();
    resetStore();
    applyExpenseIntent(intent, eventId);
    const deviceB = useAppStore.getState().snapshot();

    const merged = mergeAppData(deviceA, deviceB);
    const created = merged.reserves.find((fund) => fund.id === expenseFundIdForEvent(eventId));
    expect(merged.reserves.filter((fund) => fund.id === expenseFundIdForEvent(eventId))).toHaveLength(1);
    expect(merged.reserves.find((fund) => fund.id === "f-surplus")?.deposits.filter((deposit) => deposit.id.includes(eventId))).toHaveLength(1);
    expect(created?.deposits.filter((deposit) => deposit.id.includes(eventId))).toHaveLength(1);
  });
});
