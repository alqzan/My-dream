import { describe, expect, it } from "vitest";
import { isCurrentSyncWork } from "./syncLifecycle";

describe("isCurrentSyncWork", () => {
  it.each([
    [false, 3, 3, undefined, undefined, true],
    [true, 3, 3, undefined, undefined, false],
    [false, 2, 3, undefined, undefined, false],
    [false, 3, 3, 8, 8, true],
    [false, 3, 3, 8, 9, false],
  ])("accepts only live work: %j", (cancelled, generation, currentGeneration, event, currentEvent, expected) => {
    expect(isCurrentSyncWork(cancelled, generation, currentGeneration, event, currentEvent)).toBe(expected);
  });
});
